import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, getParticipantBySocket, removeParticipantBySocket, getCards, getVotesForRetro, saveSummary, getParticipants, getRetro, getActiveRetro, getAllRetros, getSummaryForRetro } from './db.js';
import { handleCreateRetro, handleJoinRetro, getRetroState } from './handlers/retroHandler.js';
import { handleAddCard, handleGroupCards, handleUngroupCard } from './handlers/cardHandler.js';
import { handleVote, handleUnvote } from './handlers/voteHandler.js';
import { handleStartPhase, handleEndPhase, handleTimerExpired, handleEndRetro } from './handlers/phaseHandler.js';
import { generateSummary } from './services/llmService.js';
import { validateFacilitatorPassword, verifyFacilitatorToken } from './handlers/facilitatorHandler.js';
import { buildExcelBuffer, buildDetailedSummaryMd } from './handlers/exportHandler.js';
import * as log from './services/logger.js';

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
  const summaryDebounceTimers = new Map();

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

  async function triggerAutoSummary(retroId) {
    try {
      const cards = getCards(db, retroId);
      if (cards.length === 0) return;
      if (!process.env.LLM_GATEWAY_URL || !process.env.LLM_API_KEY) return;
      log.info('Auto-generating summary for retro', retroId);
      const votes = getVotesForRetro(db, retroId);
      const text = await generateSummary(cards, votes);
      const summary = saveSummary(db, { retroId, text });
      io.to(retroId).emit('summary-generated', { summary });
      log.info('Auto-summary generated for retro', retroId);
    } catch (err) {
      log.error('Auto-summary failed:', err.message);
    }
  }

  function debounceSummary(retroId) {
    const existing = summaryDebounceTimers.get(retroId);
    if (existing) clearTimeout(existing);
    const handle = setTimeout(() => {
      summaryDebounceTimers.delete(retroId);
      triggerAutoSummary(retroId);
    }, 5000);
    summaryDebounceTimers.set(retroId, handle);
  }

  // REST API routes

  app.post('/api/facilitator/login', (req, res) => {
    const { password } = req.body;
    const result = validateFacilitatorPassword(password);
    if (result.error) {
      log.error('Facilitator login failed');
      return res.status(401).json({ error: result.error });
    }
    log.info('Facilitator logged in');
    res.json({ token: result.token });
  });

  app.get('/api/retros', (req, res) => {
    const retros = getAllRetros(db);
    res.json({ retros });
  });

  app.post('/api/retros', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!verifyFacilitatorToken(token)) {
      return res.status(403).json({ error: 'Facilitator authentication required' });
    }
    const { title, addPointsDuration, votingDuration, maxParticipants } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    const result = handleCreateRetro(db, { title, addPointsDuration, votingDuration, maxParticipants });
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    log.info('Retro created:', result.retro.title);
    res.status(201).json(result);
  });

  app.get('/api/retros/:id/state', (req, res) => {
    const retro = getRetro(db, req.params.id);
    if (!retro) return res.status(404).json({ error: 'Retro not found' });
    const cards = getCards(db, retro.id);
    const votes = getVotesForRetro(db, retro.id);
    const participants = getParticipants(db, retro.id);
    const summary = getSummaryForRetro(db, retro.id);
    res.json({ cards, votes, participants, summary });
  });

  app.get('/api/retros/:id/export/excel', (req, res) => {
    try {
      const buffer = buildExcelBuffer(db, req.params.id);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=retrospective.xlsx');
      res.send(buffer);
      log.info('Excel exported for retro', req.params.id);
    } catch (err) {
      log.error('Excel export failed:', err.message);
      res.status(500).json({ error: 'Export failed' });
    }
  });

  app.get('/api/retros/:id/export/summary', async (req, res) => {
    try {
      const md = await buildDetailedSummaryMd(db, req.params.id);
      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', 'attachment; filename=summary.md');
      res.send(md);
      log.info('Summary.md exported for retro', req.params.id);
    } catch (err) {
      log.error('Summary export failed:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/config', (req, res) => {
    res.json({
      llmConfigured: !!(process.env.LLM_GATEWAY_URL && process.env.LLM_API_KEY),
    });
  });

  // Socket.IO handlers

  io.on('connection', (socket) => {
    socket.on('join-retro', ({ shareCode, displayName, facilitatorToken }, callback) => {
      const isFacilitator = facilitatorToken ? verifyFacilitatorToken(facilitatorToken) : false;
      const result = handleJoinRetro(db, { shareCode, displayName, socketId: socket.id, isFacilitator });
      if (result.error) {
        if (callback) callback({ error: result.error });
        return;
      }
      const { retro, participant } = result;
      socket.join(retro.id);
      const state = getRetroState(db, retro.id);
      if (callback) callback({ participant, ...state });
      socket.to(retro.id).emit('participant-joined', { participant, participants: state.participants });
      log.info('Participant joined:', displayName, 'facilitator:', isFacilitator);
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
      log.info('Card added in retro', participant.retro_id);
      debounceSummary(participant.retro_id);
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
      log.info('Phase changed to', result.retro.phase, 'in retro', participant.retro_id);
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
      log.info('Phase ended in retro', participant.retro_id);
      if (callback) callback({ retro: result.retro });
    });

    socket.on('end-retro', (_, callback) => {
      const participant = getParticipantBySocket(db, socket.id);
      if (!participant) return;
      if (!participant.is_facilitator) {
        if (callback) callback({ error: 'Only the facilitator can end the retro' });
        return;
      }
      clearTimer(participant.retro_id);
      const existing = summaryDebounceTimers.get(participant.retro_id);
      if (existing) clearTimeout(existing);
      summaryDebounceTimers.delete(participant.retro_id);
      const result = handleEndRetro(db, { retroId: participant.retro_id });
      io.to(participant.retro_id).emit('retro-ended', { retro: result.retro });
      log.info('Retro ended:', participant.retro_id);
      if (callback) callback({ retro: result.retro });
    });

    socket.on('generate-summary', async (_, callback) => {
      const participant = getParticipantBySocket(db, socket.id);
      if (!participant) return;
      if (!participant.is_facilitator) {
        if (callback) callback({ error: 'Only the facilitator can generate a summary' });
        return;
      }
      try {
        const cards = getCards(db, participant.retro_id);
        const votes = getVotesForRetro(db, participant.retro_id);
        log.info('Manual summary generation for retro', participant.retro_id);
        const text = await generateSummary(cards, votes);
        const summary = saveSummary(db, { retroId: participant.retro_id, text });
        io.to(participant.retro_id).emit('summary-generated', { summary });
        if (callback) callback({ summary });
      } catch (err) {
        log.error('Summary generation failed:', err.message);
        if (callback) callback({ error: err.message });
      }
    });

    socket.on('disconnect', () => {
      const participant = removeParticipantBySocket(db, socket.id);
      if (participant) {
        const participants = getParticipants(db, participant.retro_id);
        io.to(participant.retro_id).emit('participant-left', { participantId: participant.id, participants });
        log.info('Participant disconnected:', participant.display_name);
      }
    });
  });

  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => log.info('Server running on port', PORT));
}

main();
