import { createRetro, getRetroByShareCode, addParticipant, getParticipants, getCards, getVotesForRetro, getActiveRetro } from '../db.js';

export function handleCreateRetro(db, { title, addPointsDuration, votingDuration, maxParticipants }) {
  const active = getActiveRetro(db);
  if (active) {
    return { error: 'An active retro already exists' };
  }
  const retro = createRetro(db, { title, addPointsDuration, votingDuration, maxParticipants });
  return { retro };
}

export function handleJoinRetro(db, { shareCode, displayName, socketId, isFacilitator = false }) {
  const retro = getRetroByShareCode(db, shareCode);
  if (!retro) {
    return { error: 'Retro not found' };
  }
  const existingParticipants = getParticipants(db, retro.id);
  if (existingParticipants.length >= retro.max_participants) {
    return { error: 'Retro is full. Maximum participants reached.' };
  }
  const participant = addParticipant(db, {
    retroId: retro.id,
    displayName,
    socketId,
    isFacilitator,
  });
  return { retro, participant };
}

export function getRetroState(db, retroId) {
  const retro = db.prepare('SELECT * FROM retros WHERE id = ?').get(retroId);
  const participants = getParticipants(db, retroId);
  const cards = getCards(db, retroId);
  const votes = getVotesForRetro(db, retroId);
  return { retro, participants, cards, votes };
}
