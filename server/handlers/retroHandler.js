import { createRetro, getRetroByShareCode, addParticipant, getParticipants, getCards, getVotesForRetro } from '../db.js';

export function handleCreateRetro(db, { title, addPointsDuration, votingDuration }) {
  const retro = createRetro(db, { title, addPointsDuration, votingDuration });
  return { retro };
}

export function handleJoinRetro(db, { shareCode, displayName, socketId }) {
  const retro = getRetroByShareCode(db, shareCode);
  if (!retro) {
    return { error: 'Retro not found' };
  }
  const existingParticipants = getParticipants(db, retro.id);
  const isFacilitator = existingParticipants.length === 0;
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
