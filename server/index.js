import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, loadDbFromFile, saveDbToFile, getParticipant, getParticipantBySocket, updateParticipantSocket, removeParticipantBySocket, disconnectParticipantBySocket, getCards, getVotesForRetro, saveSummary, getParticipants, getRetro, getActiveRetro, getAllRetros, getSummaryForRetro } from './db.js';
import { handleCreateRetro, handleJoinRetro, getRetroState } from './handlers/retroHandler.js';
import { handleAddCard, handleGroupCards, handleUngroupCard } from './handlers/cardHandler.js';
import { handleVote, handleUnvote } from './handlers/voteHandler.js';
import { handleStartPhase, handleEndPhase, handleTimerExpired, handleEndRetro } from './handlers/phaseHandler.js';
import { generateSummary, generateSectionSummary, rephraseText, suggestGroupings, generateActionItems, isLlmConfigured } from './services/llmService.js';
import { validateFacilitatorPassword, verifyFacilitatorToken } from './handlers/facilitatorHandler.js';
import { buildExcelBuffer, buildDetailedSummaryMd } from './handlers/exportHandler.js';
import * as log from './services/logger.js';
import { createRateLimiter, rateLimitMiddleware, checkSocketRate } from './services/rateLimiter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, { cors: { origin: process.env.CORS_ORIGIN || 'http://localhost:5173' } });

  app.use(express.json());

  const distPath = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(distPath));

  const apiLimiter = createRateLimiter(60000, 100);
  const loginLimiter = createRateLimiter(60000, 5);
  const socketLimiter = createRateLimiter(60000, 30);

  app.use('/api', rateLimitMiddleware(apiLimiter));
  app.post('/api/facilitator/login', rateLimitMiddleware(loginLimiter));

  const dbPath = process.env.DB_PATH || null;
  const buffer = dbPath ? loadDbFromFile(dbPath) : null;
  const db = await initDb(buffer);

  if (dbPath) {
    const saveInterval = setInterval(() => saveDbToFile(db, dbPath), 30000);
    saveInterval.unref();

    const gracefulSave = () => {
      saveDbToFile(db, dbPath);
      process.exit(0);
    };
    process.on('SIGINT', gracefulSave);
    process.on('SIGTERM', gracefulSave);

    if (!buffer) {
      saveDbToFile(db, dbPath);
    }

    log.info('Database persistence enabled:', dbPath);
  }

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
      log.debug('Attempting auto-summary for retro', retroId);
      const cards = getCards(db, retroId);
      if (cards.length === 0) return;
      if (!process.env.LLM_GATEWAY_URL || !process.env.LLM_API_KEY) {
        log.debug('Auto-summary skipped: LLM not configured');
        return;
      }
      const votes = getVotesForRetro(db, retroId);
      const participants = getParticipants(db, retroId);
      const text = await generateSummary(cards, votes, participants);
      if (!text) return;
      log.info('Auto-generating summary for retro', retroId);
      const summary = saveSummary(db, { retroId, text });
      io.to(retroId).emit('summary-generated', { summary: summary.text });
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

  app.use((req, res, next) => {
    log.debug('HTTP', req.method, req.path);
    next();
  });

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

  app.get('/api/facilitator/verify', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    res.json({ valid: verifyFacilitatorToken(token) });
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
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (title.trim().length > 100) {
      return res.status(400).json({ error: 'Title must be 100 characters or fewer' });
    }
    const result = handleCreateRetro(db, { title: title.trim(), addPointsDuration, votingDuration, maxParticipants });
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
    const summaryRow = getSummaryForRetro(db, retro.id);
    const summary = summaryRow ? summaryRow.text : null;
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

  app.post('/api/rephrase', async (req, res) => {
    if (!isLlmConfigured()) return res.status(503).json({ error: 'AI features are not configured' });
    try {
      const { text } = req.body;
      if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: 'Text is required' });
      }
      const rephrased = await rephraseText(text);
      res.json({ rephrased });
    } catch (err) {
      log.error('Rephrase failed:', err.message);
      res.status(500).json({ error: 'Rephrase failed' });
    }
  });

  app.post('/api/retros/:id/section-summary', async (req, res) => {
    if (!isLlmConfigured()) return res.status(503).json({ error: 'AI features are not configured' });
    try {
      const retro = getRetro(db, req.params.id);
      if (!retro) return res.status(404).json({ error: 'Retro not found' });
      const { column } = req.body;
      if (!column || !['well', 'didnt', 'action'].includes(column)) {
        return res.status(400).json({ error: 'Invalid column' });
      }
      const cards = getCards(db, retro.id);
      const votes = getVotesForRetro(db, retro.id);
      const summary = await generateSectionSummary(cards, votes, column);
      res.json({ summary });
    } catch (err) {
      log.error('Section summary failed:', err.message);
      res.status(500).json({ error: 'Section summary failed' });
    }
  });

  app.post('/api/retros/:id/action-items', async (req, res) => {
    if (!isLlmConfigured()) return res.status(503).json({ error: 'AI features are not configured' });
    try {
      const retro = getRetro(db, req.params.id);
      if (!retro) return res.status(404).json({ error: 'Retro not found' });
      const cards = getCards(db, retro.id);
      const votes = getVotesForRetro(db, retro.id);
      const participants = getParticipants(db, retro.id);
      const actionItems = await generateActionItems(cards, votes, participants);
      res.json({ actionItems });
    } catch (err) {
      log.error('Action items generation failed:', err.message);
      res.status(500).json({ error: 'Action items generation failed' });
    }
  });

  app.get('/api/config', (req, res) => {
    res.json({
      llmConfigured: !!(process.env.LLM_GATEWAY_URL && process.env.LLM_API_KEY),
    });
  });

  // Socket.IO handlers

  io.on('connection', (socket) => {
    log.debug('Socket connected:', socket.id);
    socket.on('join-retro', ({ shareCode, displayName, facilitatorToken }, callback) => {
      if (!checkSocketRate(socketLimiter, socket, callback)) return;
      if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
        if (callback) callback({ error: 'Display name is required' });
        return;
      }
      if (displayName.trim().length > 50) {
        if (callback) callback({ error: 'Display name must be 50 characters or fewer' });
        return;
      }
      const isFacilitator = facilitatorToken ? verifyFacilitatorToken(facilitatorToken) : false;
      const result = handleJoinRetro(db, { shareCode, displayName: displayName.trim(), socketId: socket.id, isFacilitator });
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

    socket.on('rejoin-retro', ({ participantId, shareCode }, callback) => {
      if (!checkSocketRate(socketLimiter, socket, callback)) return;
      try {
        if (!participantId || !shareCode) {
          if (callback) callback({ error: 'Missing participantId or shareCode' });
          return;
        }
        const participant = getParticipant(db, participantId);
        if (!participant) {
          if (callback) callback({ error: 'Participant not found' });
          return;
        }
        const retro = getRetro(db, participant.retro_id);
        if (!retro || retro.share_code !== shareCode) {
          if (callback) callback({ error: 'Retro not found' });
          return;
        }
        if (retro.phase === 'ended') {
          if (callback) callback({ error: 'Retro has ended' });
          return;
        }
        updateParticipantSocket(db, participantId, socket.id);
        socket.join(retro.id);
        const state = getRetroState(db, retro.id);
        const summaryRow = getSummaryForRetro(db, retro.id);
        if (callback) callback({ participant, ...state, summary: summaryRow ? summaryRow.text : null });
        log.info('Participant rejoined:', participant.display_name);
      } catch (err) {
        log.error('rejoin-retro error:', err.message, err.stack);
        if (callback) callback({ error: 'Server error: ' + err.message });
      }
    });

    socket.on('add-card', ({ column, text }, callback) => {
      if (!checkSocketRate(socketLimiter, socket, callback)) return;
      if (!text || typeof text !== 'string' || !text.trim()) {
        if (callback) callback({ error: 'Card text is required' });
        return;
      }
      if (text.trim().length > 500) {
        if (callback) callback({ error: 'Card text must be 500 characters or fewer' });
        return;
      }
      if (!['well', 'didnt', 'action'].includes(column)) {
        if (callback) callback({ error: 'Invalid column' });
        return;
      }
      const participant = getParticipantBySocket(db, socket.id);
      if (!participant) { if (callback) callback({ error: 'Not in a retro. Please rejoin.' }); return; }
      const retro = getRetro(db, participant.retro_id);
      if (retro.phase !== 'adding') {
        if (callback) callback({ error: 'Cards can only be added during the adding phase' });
        return;
      }
      const card = handleAddCard(db, { retroId: participant.retro_id, column, text });
      io.to(participant.retro_id).emit('card-added', { card });
      log.info('Card added in retro', participant.retro_id);
      if (callback) callback({ card });
    });

    socket.on('vote-card', ({ cardId }, callback) => {
      if (!checkSocketRate(socketLimiter, socket, callback)) return;
      const participant = getParticipantBySocket(db, socket.id);
      if (!participant) { if (callback) callback({ error: 'Not in a retro. Please rejoin.' }); return; }
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
      if (!checkSocketRate(socketLimiter, socket, callback)) return;
      const participant = getParticipantBySocket(db, socket.id);
      if (!participant) { if (callback) callback({ error: 'Not in a retro. Please rejoin.' }); return; }
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
      if (!checkSocketRate(socketLimiter, socket, callback)) return;
      const participant = getParticipantBySocket(db, socket.id);
      if (!participant) { if (callback) callback({ error: 'Not in a retro. Please rejoin.' }); return; }
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
      if (!checkSocketRate(socketLimiter, socket, callback)) return;
      const participant = getParticipantBySocket(db, socket.id);
      if (!participant) { if (callback) callback({ error: 'Not in a retro. Please rejoin.' }); return; }
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
      if (!checkSocketRate(socketLimiter, socket, callback)) return;
      log.debug('start-phase requested:', phase, 'by socket', socket.id);
      const participant = getParticipantBySocket(db, socket.id);
      if (!participant) { if (callback) callback({ error: 'Not in a retro. Please rejoin.' }); return; }
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
            if (timerResult.retro.phase === 'discussion') {
              triggerAutoSummary(participant.retro_id);
            }
          }
        });
      }
      io.to(participant.retro_id).emit('phase-changed', { retro: result.retro });
      log.info('Phase changed to', result.retro.phase, 'in retro', participant.retro_id);
      if (callback) callback({ retro: result.retro });
    });

    socket.on('end-phase', (_, callback) => {
      if (!checkSocketRate(socketLimiter, socket, callback)) return;
      log.debug('end-phase requested by socket', socket.id);
      const participant = getParticipantBySocket(db, socket.id);
      if (!participant) { if (callback) callback({ error: 'Not in a retro. Please rejoin.' }); return; }
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
      if (result.retro.phase === 'discussion') {
        triggerAutoSummary(participant.retro_id);
      }
      if (callback) callback({ retro: result.retro });
    });

    socket.on('end-retro', (_, callback) => {
      if (!checkSocketRate(socketLimiter, socket, callback)) return;
      const participant = getParticipantBySocket(db, socket.id);
      if (!participant) { if (callback) callback({ error: 'Not in a retro. Please rejoin.' }); return; }
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

    socket.on('suggest-groupings', async ({ column }, callback) => {
      if (!checkSocketRate(socketLimiter, socket, callback)) return;
      if (!isLlmConfigured()) {
        if (callback) callback({ error: 'AI features are not configured' });
        return;
      }
      const participant = getParticipantBySocket(db, socket.id);
      if (!participant) { if (callback) callback({ error: 'Not in a retro. Please rejoin.' }); return; }
      if (!participant.is_facilitator) {
        if (callback) callback({ error: 'Only the facilitator can suggest groupings' });
        return;
      }
      const retro = getRetro(db, participant.retro_id);
      if (retro.phase !== 'grouping') {
        if (callback) callback({ error: 'Grouping suggestions are only available during the grouping phase' });
        return;
      }
      try {
        const cards = getCards(db, participant.retro_id);
        const suggestions = await suggestGroupings(cards, column);
        if (callback) callback({ suggestions });
      } catch (err) {
        log.error('Suggest groupings failed:', err.message);
        if (callback) callback({ error: err.message });
      }
    });

    socket.on('apply-groupings', async ({ groupings }, callback) => {
      if (!checkSocketRate(socketLimiter, socket, callback)) return;
      const participant = getParticipantBySocket(db, socket.id);
      if (!participant) { if (callback) callback({ error: 'Not in a retro. Please rejoin.' }); return; }
      if (!participant.is_facilitator) {
        if (callback) callback({ error: 'Only the facilitator can apply groupings' });
        return;
      }
      const retro = getRetro(db, participant.retro_id);
      if (retro.phase !== 'grouping') {
        if (callback) callback({ error: 'Groupings can only be applied during the grouping phase' });
        return;
      }
      try {
        for (const { parentCardId, childCardIds } of groupings) {
          for (const childCardId of childCardIds) {
            handleGroupCards(db, { parentCardId, childCardId });
          }
        }
        const cards = getCards(db, participant.retro_id);
        io.to(participant.retro_id).emit('cards-updated', { cards });
        if (callback) callback({ cards });
      } catch (err) {
        log.error('Apply groupings failed:', err.message);
        if (callback) callback({ error: err.message });
      }
    });

    socket.on('generate-summary', async (_, callback) => {
      if (!checkSocketRate(socketLimiter, socket, callback)) return;
      const participant = getParticipantBySocket(db, socket.id);
      if (!participant) { if (callback) callback({ error: 'Not in a retro. Please rejoin.' }); return; }
      if (!participant.is_facilitator) {
        if (callback) callback({ error: 'Only the facilitator can generate a summary' });
        return;
      }
      if (!isLlmConfigured()) {
        if (callback) callback({ error: 'AI features are not configured' });
        return;
      }
      try {
        const cards = getCards(db, participant.retro_id);
        const votes = getVotesForRetro(db, participant.retro_id);
        const participants = getParticipants(db, participant.retro_id);
        log.info('Manual summary generation for retro', participant.retro_id);
        const text = await generateSummary(cards, votes, participants);
        const summary = saveSummary(db, { retroId: participant.retro_id, text });
        io.to(participant.retro_id).emit('summary-generated', { summary: summary.text });
        if (callback) callback({ summary: summary.text });
      } catch (err) {
        log.error('Summary generation failed:', err.message);
        if (callback) callback({ error: err.message });
      }
    });

    socket.on('disconnect', () => {
      log.debug('Socket disconnected:', socket.id);
      const participant = disconnectParticipantBySocket(db, socket.id);
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
  server.listen(PORT, () => {
    log.info('Server running on port', PORT);
    log.debug('LLM configured:', isLlmConfigured());
    log.debug('DB path:', dbPath || '(in-memory)');
  });
}

main();
