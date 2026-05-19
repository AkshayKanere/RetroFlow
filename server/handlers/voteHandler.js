import { addVote, removeVote, getVotesByParticipant, getVoteCount } from '../db.js';

const MAX_VOTES = 3;

export function handleVote(db, { cardId, participantId, retroId }) {
  const existingVotes = getVotesByParticipant(db, participantId, retroId);
  if (existingVotes.length >= MAX_VOTES) {
    return { error: 'No votes remaining' };
  }
  const alreadyVoted = existingVotes.some(v => v.card_id === cardId);
  if (alreadyVoted) {
    return { error: 'Already voted on this card' };
  }
  const voteCount = addVote(db, { cardId, participantId });
  return { voteCount, cardId };
}

export function handleUnvote(db, { cardId, participantId }) {
  const voteCount = removeVote(db, { cardId, participantId });
  return { voteCount, cardId };
}
