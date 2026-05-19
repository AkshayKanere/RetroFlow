import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, getParticipantBySocket, removeParticipantBySocket, getCards, getVotesForRetro, saveSummary, getParticipants, getRetro } from './db.js';
import { handleCreateRetro, handleJoinRetro, getRetroState } from './handlers/retroHandler.js';
import { handleAddCard, handleGroupCards, handleUngroupCard } from './handlers/cardHandler.js';
import { handleVote, handleUnvote } from './handlers/voteHandler.js';
import { handleStartPhase, handleEndPhase, handleTimerExpired } from './handlers/phaseHandler.js';
import { generateSummary } from './services/llmService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });

  app.use(express.json());

  const distPath = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(distPath));

  const db = await initDb();

  const timers = new Map();

  function startTimer(retroId, durationMs, callback) {
    clearTimer(retroId);
    const handle = setTimeout(() => {
      timers.delete(retroId);
      callback();
    }, durationMs);
    timers.set(retroId, handle);
  }

  function clearTimer(retroId) {
    const handle = timers.get(retroId);
    if (handle) {
      clearTimeout(handle);
      timers.delete(retroId);
    }
  }

  app.post('/api/retros', (req, res) => {
    const { title, addPointsDuration, votingDuration } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    const result = handleCreateRetro(db, { title, addPointsDuration, votingDuration });
    res.status(201).json(result);
  });

  io.on('connection', (socket) => {
    socket.on('join-retro', ({ shareCode, displayName }, callback) => {
      const result = handleJoinRetro(db, { shareCode, displayName, socketId: socket.id });
      if (result.error) {
        if (callback) callback({ error: result.error });
        return;
      }
      const { retro, participant } = result;
      socket.join(retro.id);
      const state = getRetroState(db, retro.id);
      if (callback) callback({ participant, ...state });
      socket.to(retro.id).emit('participant-joined', { participant, participants: state.participants });
    });

    socket.on('add-card', ({ column, text }, callback) => {
      const participant = getParticipantBySocket(db, socket.id);
      if (!participant) return;
      const retro = getRetro(db, participant.retro_id);
      if (retro.phase !== 'adding') {
        if (callback) callback({ error: 'Cards can only be added during the adding phase' });
        return;
      }
      const card = handleAddCard(db, { retroId: participant.retro_id, column, text });
      io.to(participant.retro_id).emit('card-added', { card });
      if (callback) callback({ card });
    });

    socket.on('vote-card', ({ cardId }, callback) => {
      const participant = getParticipantBySocket(db, socket.id);
      if (!participant) return;
      const retro = getRetro(db, participant.retro_id);
      if (retro.phase !== 'voting') {
        if (callback) callback({ error: 'Voting is only allowed during the voting phase' });
        return;
      }
      const result = handleVote(db, { cardId, participantId: participant.id, retroId: participant.retro_id });
      if (result.error) {
        if (callback) callback({ error: result.error });
        return;
      }
      io.to(participant.retro_id).emit('vote-updated', { cardId: result.cardId, voteCount: result.voteCount });
      if (callback) callback(result);
    });

    socket.on('unvote-card', ({ cardId }, callback) => {
      const participant = getParticipantBySocket(db, socket.id);
      if (!participant) return;
      const retro = getRetro(db, participant.retro_id);
      if (retro.phase !== 'voting') {
        if (callback) callback({ error: 'Voting is only allowed during the voting phase' });
        return;
      }
      const result = handleUnvote(db, { cardId, participantId: participant.id });
      io.to(participant.retro_id).emit('vote-updated', { cardId: result.cardId, voteCount: result.voteCount });
      if (callback) callback(result);
    });

    socket.on('group-cards', ({ parentCardId, childCardId }, callback) => {
      const participant = getParticipantBySocket(db, socket.id);
      if (!participant) return;
      if (!participant.is_facilitator) {
        if (callback) callback({ error: 'Only the facilitator can group cards' });
        return;
      }
      const retro = getRetro(db, participant.retro_id);
      if (retro.phase !== 'grouping') {
        if (callback) callback({ error: 'Cards can only be grouped during the grouping phase' });
        return;
      }
      handleGroupCards(db, { parentCardId, childCardId });
      const cards = getCards(db, participant.retro_id);
      io.to(participant.retro_id).emit('cards-updated', { cards });
      if (callback) callback({ cards });
    });

    socket.on('ungroup-card', ({ cardId }, callback) => {
      const participant = getParticipantBySocket(db, socket.id);
      if (!participant) return;
      if (!participant.is_facilitator) {
        if (callback) callback({ error: 'Only the facilitator can ungroup cards' });
        return;
      }
      const retro = getRetro(db, participant.retro_id);
      if (retro.phase !== 'grouping') {
        if (callback) callback({ error: 'Cards can only be ungrouped during the grouping phase' });
        return;
      }
      handleUngroupCard(db, { cardId });
      const cards = getCards(db, participant.retro_id);
      io.to(participant.retro_id).emit('cards-updated', { cards });
      if (callback) callback({ cards });
    });

    socket.on('start-phase', ({ phase }, callback) => {
      const participant = getParticipantBySocket(db, socket.id);
      if (!participant) return;
      if (!participant.is_facilitator) {
        if (callback) callback({ error: 'Only the facilitator can change phases' });
        return;
      }
      const result = handleStartPhase(db, { retroId: participant.retro_id, phase });
      if (result.error) {
        if (callback) callback({ error: result.error });
        return;
      }
      if (result.retro.phase_ends_at) {
        const durationMs = new Date(result.retro.phase_ends_at).getTime() - Date.now();
        startTimer(participant.retro_id, durationMs, () => {
          const timerResult = handleTimerExpired(db, { retroId: participant.retro_id });
          if (!timerResult.error) {
            io.to(participant.retro_id).emit('phase-changed', { retro: timerResult.retro });
          }
        });
      }
      io.to(participant.retro_id).emit('phase-changed', { retro: result.retro });
      if (callback) callback({ retro: result.retro });
    });

    socket.on('end-phase', (_, callback) => {
      const participant = getParticipantBySocket(db, socket.id);
      if (!participant) return;
      if (!participant.is_facilitator) {
        if (callback) callback({ error: 'Only the facilitator can end phases' });
        return;
      }
      clearTimer(participant.retro_id);
      const result = handleEndPhase(db, { retroId: participant.retro_id });
      if (result.error) {
        if (callback) callback({ error: result.error });
        return;
      }
      io.to(participant.retro_id).emit('phase-changed', { retro: result.retro });
      if (callback) callback({ retro: result.retro });
    });

    socket.on('generate-summary', async (_, callback) => {
      const participant = getParticipantBySocket(db, socket.id);
      if (!participant) return;
      if (!participant.is_facilitator) {
        if (callback) callback({ error: 'Only the facilitator can generate a summary' });
        return;
      }
      const retro = getRetro(db, participant.retro_id);
      if (retro.phase !== 'discussion') {
        if (callback) callback({ error: 'Summary can only be generated during the discussion phase' });
        return;
      }
      try {
        const cards = getCards(db, participant.retro_id);
        const votes = getVotesForRetro(db, participant.retro_id);
        const text = await generateSummary(cards, votes);
        const summary = saveSummary(db, { retroId: participant.retro_id, text });
        io.to(participant.retro_id).emit('summary-generated', { summary });
        if (callback) callback({ summary });
      } catch (err) {
        if (callback) callback({ error: err.message });
      }
    });

    socket.on('disconnect', () => {
      const participant = removeParticipantBySocket(db, socket.id);
      if (participant) {
        const participants = getParticipants(db, participant.retro_id);
        io.to(participant.retro_id).emit('participant-left', { participantId: participant.id, participants });
      }
    });
  });

  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

main();
