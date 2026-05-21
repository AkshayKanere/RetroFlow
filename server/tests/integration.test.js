import { describe, it, expect, beforeEach } from 'vitest';
import {
  initDb,
  createRetro,
  addParticipant,
  addCard,
  addVote,
  removeVote,
  getCards,
  getParticipants,
  getVotesByParticipant,
  getVotesForRetro,
  getVoteCount,
  saveSummary,
  getSummaryForRetro,
  getAllRetros,
  getActiveRetro,
  updateRetroPhase,
  removeParticipantBySocket,
  groupCards,
  ungroupCard,
} from '../db.js';
import { handleCreateRetro, handleJoinRetro, getRetroState } from '../handlers/retroHandler.js';
import { handleAddCard, handleGroupCards, handleUngroupCard } from '../handlers/cardHandler.js';
import { handleVote, handleUnvote } from '../handlers/voteHandler.js';
import { handleStartPhase, handleEndPhase, handleTimerExpired, handleEndRetro } from '../handlers/phaseHandler.js';
import { buildExcelBuffer } from '../handlers/exportHandler.js';
import { buildPrompt, buildDetailedSummaryPrompt } from '../services/llmService.js';

describe('Integration Tests', () => {
  let db;

  beforeEach(async () => {
    db = await initDb();
  });

  describe('Full retro lifecycle', () => {
    it('should complete create → join → add cards → group → vote → end → verify state', () => {
      const { retro } = handleCreateRetro(db, { title: 'Sprint 10', addPointsDuration: 300, votingDuration: 120, maxParticipants: 5 });
      expect(retro.phase).toBe('lobby');

      const { participant: facilitator } = handleJoinRetro(db, { shareCode: retro.share_code, displayName: 'Alice', socketId: 'sock-a', isFacilitator: true });
      const { participant: member } = handleJoinRetro(db, { shareCode: retro.share_code, displayName: 'Bob', socketId: 'sock-b' });
      expect(getParticipants(db, retro.id).length).toBe(2);

      handleStartPhase(db, { retroId: retro.id, phase: 'adding' });

      const card1 = handleAddCard(db, { retroId: retro.id, column: 'well', text: 'Good CI pipeline' });
      const card2 = handleAddCard(db, { retroId: retro.id, column: 'didnt', text: 'Too many bugs' });
      const card3 = handleAddCard(db, { retroId: retro.id, column: 'action', text: 'Add more tests' });
      expect(getCards(db, retro.id).length).toBe(3);

      handleEndPhase(db, { retroId: retro.id });

      const card4 = handleAddCard(db, { retroId: retro.id, column: 'well', text: 'Team collaboration' });
      handleGroupCards(db, { parentCardId: card1.id, childCardId: card4.id });
      const cards = getCards(db, retro.id);
      const grouped = cards.find(c => c.id === card4.id);
      expect(grouped.group_id).toBe(card1.id);

      handleStartPhase(db, { retroId: retro.id, phase: 'voting' });

      handleVote(db, { cardId: card1.id, participantId: facilitator.id, retroId: retro.id });
      handleVote(db, { cardId: card2.id, participantId: facilitator.id, retroId: retro.id });
      handleVote(db, { cardId: card1.id, participantId: member.id, retroId: retro.id });
      handleVote(db, { cardId: card3.id, participantId: member.id, retroId: retro.id });

      expect(getVoteCount(db, card1.id)).toBe(2);
      expect(getVoteCount(db, card2.id)).toBe(1);
      expect(getVoteCount(db, card3.id)).toBe(1);

      handleEndPhase(db, { retroId: retro.id });

      const { retro: ended } = handleEndRetro(db, { retroId: retro.id });
      expect(ended.phase).toBe('ended');

      const state = getRetroState(db, retro.id);
      expect(state.retro.phase).toBe('ended');
      expect(state.participants.length).toBe(2);
      expect(state.cards.length).toBe(4);
      expect(state.votes.length).toBe(4);
    });
  });

  describe('Multiple participants voting with 3-vote limit', () => {
    it('should enforce 3-vote limit independently per participant', () => {
      const { retro } = handleCreateRetro(db, { title: 'Vote Limits' });
      const { participant: p1 } = handleJoinRetro(db, { shareCode: retro.share_code, displayName: 'Alice', socketId: 's1', isFacilitator: true });
      const { participant: p2 } = handleJoinRetro(db, { shareCode: retro.share_code, displayName: 'Bob', socketId: 's2' });
      const { participant: p3 } = handleJoinRetro(db, { shareCode: retro.share_code, displayName: 'Carol', socketId: 's3' });

      const c1 = addCard(db, { retroId: retro.id, column: 'well', text: 'Card A' });
      const c2 = addCard(db, { retroId: retro.id, column: 'well', text: 'Card B' });
      const c3 = addCard(db, { retroId: retro.id, column: 'didnt', text: 'Card C' });
      const c4 = addCard(db, { retroId: retro.id, column: 'action', text: 'Card D' });

      handleVote(db, { cardId: c1.id, participantId: p1.id, retroId: retro.id });
      handleVote(db, { cardId: c2.id, participantId: p1.id, retroId: retro.id });
      handleVote(db, { cardId: c3.id, participantId: p1.id, retroId: retro.id });
      const p1Blocked = handleVote(db, { cardId: c4.id, participantId: p1.id, retroId: retro.id });
      expect(p1Blocked.error).toBe('No votes remaining');

      const p2Vote = handleVote(db, { cardId: c1.id, participantId: p2.id, retroId: retro.id });
      expect(p2Vote.voteCount).toBe(2);

      handleVote(db, { cardId: c2.id, participantId: p2.id, retroId: retro.id });
      handleVote(db, { cardId: c3.id, participantId: p2.id, retroId: retro.id });
      const p2Blocked = handleVote(db, { cardId: c4.id, participantId: p2.id, retroId: retro.id });
      expect(p2Blocked.error).toBe('No votes remaining');

      handleVote(db, { cardId: c4.id, participantId: p3.id, retroId: retro.id });
      expect(getVotesByParticipant(db, p3.id, retro.id).length).toBe(1);

      const allVotes = getVotesForRetro(db, retro.id);
      expect(allVotes.length).toBe(7);
    });
  });

  describe('Card operations edge cases', () => {
    it('should add cards to each column type and verify filtering', () => {
      const { retro } = handleCreateRetro(db, { title: 'Column Test' });

      const wellCard = handleAddCard(db, { retroId: retro.id, column: 'well', text: 'Good teamwork' });
      const didntCard = handleAddCard(db, { retroId: retro.id, column: 'didnt', text: 'Missed deadline' });
      const actionCard = handleAddCard(db, { retroId: retro.id, column: 'action', text: 'Hire more devs' });

      expect(wellCard.column).toBe('well');
      expect(didntCard.column).toBe('didnt');
      expect(actionCard.column).toBe('action');

      const allCards = getCards(db, retro.id);
      expect(allCards.length).toBe(3);

      const wellCards = allCards.filter(c => c.column === 'well');
      const didntCards = allCards.filter(c => c.column === 'didnt');
      const actionCards = allCards.filter(c => c.column === 'action');

      expect(wellCards.length).toBe(1);
      expect(didntCards.length).toBe(1);
      expect(actionCards.length).toBe(1);
      expect(wellCards[0].text).toBe('Good teamwork');
      expect(didntCards[0].text).toBe('Missed deadline');
      expect(actionCards[0].text).toBe('Hire more devs');
    });

    it('should group and ungroup cards correctly', () => {
      const { retro } = handleCreateRetro(db, { title: 'Group Test' });

      const parent = handleAddCard(db, { retroId: retro.id, column: 'well', text: 'Parent' });
      const child1 = handleAddCard(db, { retroId: retro.id, column: 'well', text: 'Child 1' });
      const child2 = handleAddCard(db, { retroId: retro.id, column: 'well', text: 'Child 2' });

      handleGroupCards(db, { parentCardId: parent.id, childCardId: child1.id });
      handleGroupCards(db, { parentCardId: parent.id, childCardId: child2.id });

      let cards = getCards(db, retro.id);
      expect(cards.filter(c => c.group_id === parent.id).length).toBe(2);

      handleUngroupCard(db, { cardId: child1.id });
      cards = getCards(db, retro.id);
      expect(cards.find(c => c.id === child1.id).group_id).toBeNull();
      expect(cards.find(c => c.id === child2.id).group_id).toBe(parent.id);
    });
  });

  describe('Vote handler edge cases', () => {
    it('should allow unvote and re-vote within limit', () => {
      const { retro } = handleCreateRetro(db, { title: 'Unvote Test' });
      const { participant } = handleJoinRetro(db, { shareCode: retro.share_code, displayName: 'Alice', socketId: 's1' });

      const c1 = addCard(db, { retroId: retro.id, column: 'well', text: 'C1' });
      const c2 = addCard(db, { retroId: retro.id, column: 'well', text: 'C2' });
      const c3 = addCard(db, { retroId: retro.id, column: 'didnt', text: 'C3' });
      const c4 = addCard(db, { retroId: retro.id, column: 'action', text: 'C4' });

      handleVote(db, { cardId: c1.id, participantId: participant.id, retroId: retro.id });
      handleVote(db, { cardId: c2.id, participantId: participant.id, retroId: retro.id });
      handleVote(db, { cardId: c3.id, participantId: participant.id, retroId: retro.id });

      const blocked = handleVote(db, { cardId: c4.id, participantId: participant.id, retroId: retro.id });
      expect(blocked.error).toBe('No votes remaining');

      handleUnvote(db, { cardId: c1.id, participantId: participant.id });
      expect(getVotesByParticipant(db, participant.id, retro.id).length).toBe(2);

      const reVote = handleVote(db, { cardId: c4.id, participantId: participant.id, retroId: retro.id });
      expect(reVote.voteCount).toBe(1);
      expect(getVotesByParticipant(db, participant.id, retro.id).length).toBe(3);
    });

    it('should allow vote on a card after unvoting it', () => {
      const { retro } = handleCreateRetro(db, { title: 'Re-vote Same' });
      const { participant } = handleJoinRetro(db, { shareCode: retro.share_code, displayName: 'Bob', socketId: 's1' });

      const card = addCard(db, { retroId: retro.id, column: 'well', text: 'Card' });

      handleVote(db, { cardId: card.id, participantId: participant.id, retroId: retro.id });
      expect(getVoteCount(db, card.id)).toBe(1);

      handleUnvote(db, { cardId: card.id, participantId: participant.id });
      expect(getVoteCount(db, card.id)).toBe(0);

      const result = handleVote(db, { cardId: card.id, participantId: participant.id, retroId: retro.id });
      expect(result.voteCount).toBe(1);
    });
  });

  describe('Phase handler edge cases', () => {
    it('should fail to start voting directly from lobby', () => {
      const { retro } = handleCreateRetro(db, { title: 'Bad Transition' });
      const result = handleStartPhase(db, { retroId: retro.id, phase: 'voting' });
      expect(result.error).toBe('Cannot transition from lobby to voting');
    });

    it('should fail to start grouping from lobby', () => {
      const { retro } = handleCreateRetro(db, { title: 'Bad Transition 2' });
      const result = handleStartPhase(db, { retroId: retro.id, phase: 'grouping' });
      expect(result.error).toBe('Cannot transition from lobby to grouping');
    });

    it('should fail to start discussion from lobby', () => {
      const { retro } = handleCreateRetro(db, { title: 'Bad Transition 3' });
      const result = handleStartPhase(db, { retroId: retro.id, phase: 'discussion' });
      expect(result.error).toBe('Cannot transition from lobby to discussion');
    });

    it('should fail to go backward from grouping to adding', () => {
      const { retro } = handleCreateRetro(db, { title: 'Backward' });
      updateRetroPhase(db, retro.id, 'grouping');
      const result = handleStartPhase(db, { retroId: retro.id, phase: 'adding' });
      expect(result.error).toBe('Cannot transition from grouping to adding');
    });

    it('should fail to skip from adding to voting', () => {
      const { retro } = handleCreateRetro(db, { title: 'Skip' });
      updateRetroPhase(db, retro.id, 'adding');
      const result = handleStartPhase(db, { retroId: retro.id, phase: 'voting' });
      expect(result.error).toBe('Cannot transition from adding to voting');
    });

    it('should fail to skip from adding to discussion', () => {
      const { retro } = handleCreateRetro(db, { title: 'Skip 2' });
      updateRetroPhase(db, retro.id, 'adding');
      const result = handleStartPhase(db, { retroId: retro.id, phase: 'discussion' });
      expect(result.error).toBe('Cannot transition from adding to discussion');
    });

    it('should fail to start any phase from discussion', () => {
      const { retro } = handleCreateRetro(db, { title: 'From Discussion' });
      updateRetroPhase(db, retro.id, 'discussion');

      expect(handleStartPhase(db, { retroId: retro.id, phase: 'adding' }).error).toBe('Cannot transition from discussion to adding');
      expect(handleStartPhase(db, { retroId: retro.id, phase: 'grouping' }).error).toBe('Cannot transition from discussion to grouping');
      expect(handleStartPhase(db, { retroId: retro.id, phase: 'voting' }).error).toBe('Cannot transition from discussion to voting');
    });

    it('should walk through all valid transitions sequentially', () => {
      const { retro } = handleCreateRetro(db, { title: 'Full Walk' });

      let result = handleStartPhase(db, { retroId: retro.id, phase: 'adding' });
      expect(result.retro.phase).toBe('adding');

      result = handleEndPhase(db, { retroId: retro.id });
      expect(result.retro.phase).toBe('grouping');

      result = handleStartPhase(db, { retroId: retro.id, phase: 'voting' });
      expect(result.retro.phase).toBe('voting');

      result = handleEndPhase(db, { retroId: retro.id });
      expect(result.retro.phase).toBe('discussion');
    });
  });

  describe('Export with grouped cards', () => {
    it('should include group info in Excel export', () => {
      const { retro } = handleCreateRetro(db, { title: 'Export Group Test' });
      addParticipant(db, { retroId: retro.id, displayName: 'Alice', socketId: 's1', isFacilitator: true });

      const parent = addCard(db, { retroId: retro.id, column: 'well', text: 'Parent card' });
      const child = addCard(db, { retroId: retro.id, column: 'well', text: 'Child card' });
      groupCards(db, parent.id, child.id);

      const buffer = buildExcelBuffer(db, retro.id);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe('Export with no cards', () => {
    it('should produce a valid Excel buffer for an empty retro', () => {
      const { retro } = handleCreateRetro(db, { title: 'Empty Export' });
      addParticipant(db, { retroId: retro.id, displayName: 'Alice', socketId: 's1' });

      const buffer = buildExcelBuffer(db, retro.id);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe('Summary after multiple updates', () => {
    it('should return the latest summary after saving multiple', () => {
      const { retro } = handleCreateRetro(db, { title: 'Summary Test' });

      saveSummary(db, { retroId: retro.id, text: 'First summary' });
      saveSummary(db, { retroId: retro.id, text: 'Second summary' });
      saveSummary(db, { retroId: retro.id, text: 'Third summary' });

      const latest = getSummaryForRetro(db, retro.id);
      expect(latest).toBeTruthy();
      expect(latest.text).toBe('Third summary');
    });

    it('should return undefined when no summary exists', () => {
      const { retro } = handleCreateRetro(db, { title: 'No Summary' });
      const summary = getSummaryForRetro(db, retro.id);
      expect(summary).toBeUndefined();
    });
  });

  describe('Participant disconnect during retro', () => {
    it('should remove disconnected participant and keep others', () => {
      const { retro } = handleCreateRetro(db, { title: 'Disconnect Test' });
      handleJoinRetro(db, { shareCode: retro.share_code, displayName: 'Alice', socketId: 'sock-a', isFacilitator: true });
      handleJoinRetro(db, { shareCode: retro.share_code, displayName: 'Bob', socketId: 'sock-b' });
      handleJoinRetro(db, { shareCode: retro.share_code, displayName: 'Carol', socketId: 'sock-c' });

      expect(getParticipants(db, retro.id).length).toBe(3);

      const removed = removeParticipantBySocket(db, 'sock-b');
      expect(removed.display_name).toBe('Bob');

      const remaining = getParticipants(db, retro.id);
      expect(remaining.length).toBe(2);
      expect(remaining.map(p => p.display_name).sort()).toEqual(['Alice', 'Carol']);
    });

    it('should return undefined when removing non-existent socket', () => {
      const { retro } = handleCreateRetro(db, { title: 'No Socket' });
      const removed = removeParticipantBySocket(db, 'non-existent');
      expect(removed).toBeUndefined();
    });
  });

  describe('getRetroState returns correct structure', () => {
    it('should return retro, participants, cards, and votes', () => {
      const { retro } = handleCreateRetro(db, { title: 'State Test' });
      const { participant } = handleJoinRetro(db, { shareCode: retro.share_code, displayName: 'Alice', socketId: 's1' });

      const card = addCard(db, { retroId: retro.id, column: 'well', text: 'State card' });
      addVote(db, { cardId: card.id, participantId: participant.id });

      const state = getRetroState(db, retro.id);

      expect(state).toHaveProperty('retro');
      expect(state).toHaveProperty('participants');
      expect(state).toHaveProperty('cards');
      expect(state).toHaveProperty('votes');

      expect(state.retro.id).toBe(retro.id);
      expect(state.retro.title).toBe('State Test');
      expect(state.participants.length).toBe(1);
      expect(state.participants[0].display_name).toBe('Alice');
      expect(state.cards.length).toBe(1);
      expect(state.cards[0].text).toBe('State card');
      expect(state.votes.length).toBe(1);
    });

    it('should return empty arrays when retro has no data', () => {
      const { retro } = handleCreateRetro(db, { title: 'Empty State' });
      const state = getRetroState(db, retro.id);

      expect(state.retro.id).toBe(retro.id);
      expect(state.participants).toEqual([]);
      expect(state.cards).toEqual([]);
      expect(state.votes).toEqual([]);
    });
  });

  describe('buildPrompt with grouped cards', () => {
    it('should exclude child cards from prompt', () => {
      const { retro } = handleCreateRetro(db, { title: 'Prompt Test' });

      const parent = addCard(db, { retroId: retro.id, column: 'well', text: 'Parent insight' });
      const child = addCard(db, { retroId: retro.id, column: 'well', text: 'Child insight' });
      groupCards(db, parent.id, child.id);

      const cards = getCards(db, retro.id);
      const votes = getVotesForRetro(db, retro.id);
      const prompt = buildPrompt(cards, votes);

      expect(prompt).toContain('Parent insight');
      expect(prompt).not.toContain('Child insight');
    });

    it('should handle all columns with grouped cards', () => {
      const { retro } = handleCreateRetro(db, { title: 'Prompt Groups' });

      const wellParent = addCard(db, { retroId: retro.id, column: 'well', text: 'Well parent' });
      addCard(db, { retroId: retro.id, column: 'well', text: 'Well child' });
      const didntParent = addCard(db, { retroId: retro.id, column: 'didnt', text: 'Didnt parent' });
      const actionParent = addCard(db, { retroId: retro.id, column: 'action', text: 'Action parent' });

      const allCards = getCards(db, retro.id);
      const wellChild = allCards.find(c => c.text === 'Well child');
      groupCards(db, wellParent.id, wellChild.id);

      const cards = getCards(db, retro.id);
      const prompt = buildPrompt(cards, []);

      expect(prompt).toContain('Well parent');
      expect(prompt).not.toContain('Well child');
      expect(prompt).toContain('Didnt parent');
      expect(prompt).toContain('Action parent');
    });
  });

  describe('Max participants boundary', () => {
    it('should allow joining exactly at max and reject the next', () => {
      const { retro } = handleCreateRetro(db, { title: 'Max Test', maxParticipants: 3 });

      const r1 = handleJoinRetro(db, { shareCode: retro.share_code, displayName: 'P1', socketId: 's1', isFacilitator: true });
      expect(r1.participant).toBeTruthy();

      const r2 = handleJoinRetro(db, { shareCode: retro.share_code, displayName: 'P2', socketId: 's2' });
      expect(r2.participant).toBeTruthy();

      const r3 = handleJoinRetro(db, { shareCode: retro.share_code, displayName: 'P3', socketId: 's3' });
      expect(r3.participant).toBeTruthy();

      expect(getParticipants(db, retro.id).length).toBe(3);

      const r4 = handleJoinRetro(db, { shareCode: retro.share_code, displayName: 'P4', socketId: 's4' });
      expect(r4.error).toBe('Retro is full. Maximum participants reached.');
    });

    it('should allow joining after a participant disconnects', () => {
      const { retro } = handleCreateRetro(db, { title: 'Rejoin Test', maxParticipants: 2 });

      handleJoinRetro(db, { shareCode: retro.share_code, displayName: 'P1', socketId: 's1' });
      handleJoinRetro(db, { shareCode: retro.share_code, displayName: 'P2', socketId: 's2' });

      const blocked = handleJoinRetro(db, { shareCode: retro.share_code, displayName: 'P3', socketId: 's3' });
      expect(blocked.error).toBe('Retro is full. Maximum participants reached.');

      removeParticipantBySocket(db, 's2');

      const allowed = handleJoinRetro(db, { shareCode: retro.share_code, displayName: 'P3', socketId: 's3' });
      expect(allowed.participant.display_name).toBe('P3');
      expect(getParticipants(db, retro.id).length).toBe(2);
    });
  });

  describe('End retro from any phase', () => {
    it('should end retro from adding phase', () => {
      const { retro } = handleCreateRetro(db, { title: 'End from Adding' });
      handleStartPhase(db, { retroId: retro.id, phase: 'adding' });
      const result = handleEndRetro(db, { retroId: retro.id });
      expect(result.retro.phase).toBe('ended');
    });

    it('should end retro from grouping phase', () => {
      const { retro } = handleCreateRetro(db, { title: 'End from Grouping' });
      updateRetroPhase(db, retro.id, 'grouping');
      const result = handleEndRetro(db, { retroId: retro.id });
      expect(result.retro.phase).toBe('ended');
    });

    it('should end retro from voting phase', () => {
      const { retro } = handleCreateRetro(db, { title: 'End from Voting' });
      updateRetroPhase(db, retro.id, 'voting');
      const result = handleEndRetro(db, { retroId: retro.id });
      expect(result.retro.phase).toBe('ended');
    });

    it('should end retro from discussion phase', () => {
      const { retro } = handleCreateRetro(db, { title: 'End from Discussion' });
      updateRetroPhase(db, retro.id, 'discussion');
      const result = handleEndRetro(db, { retroId: retro.id });
      expect(result.retro.phase).toBe('ended');
    });

    it('should end retro from lobby phase', () => {
      const { retro } = handleCreateRetro(db, { title: 'End from Lobby' });
      const result = handleEndRetro(db, { retroId: retro.id });
      expect(result.retro.phase).toBe('ended');
    });
  });

  describe('Multiple retros lifecycle', () => {
    it('should create, end, create another, and list both in getAllRetros', () => {
      const { retro: first } = handleCreateRetro(db, { title: 'First Retro' });
      handleEndRetro(db, { retroId: first.id });

      const { retro: second } = handleCreateRetro(db, { title: 'Second Retro' });

      const all = getAllRetros(db);
      expect(all.length).toBe(2);
      expect(all.map(r => r.title)).toContain('First Retro');
      expect(all.map(r => r.title)).toContain('Second Retro');

      const active = getActiveRetro(db);
      expect(active.title).toBe('Second Retro');
    });

    it('should return no active retro when all are ended', () => {
      const { retro: first } = handleCreateRetro(db, { title: 'Done 1' });
      handleEndRetro(db, { retroId: first.id });

      const { retro: second } = handleCreateRetro(db, { title: 'Done 2' });
      handleEndRetro(db, { retroId: second.id });

      const active = getActiveRetro(db);
      expect(active).toBeUndefined();

      const all = getAllRetros(db);
      expect(all.length).toBe(2);
    });
  });

  describe('Multiple ended retros persistence', () => {
    it('should store multiple ended retros in the database', () => {
      for (let i = 1; i <= 5; i++) {
        const { retro } = handleCreateRetro(db, { title: `Retro ${i}` });
        handleEndRetro(db, { retroId: retro.id });
      }
      const all = getAllRetros(db);
      expect(all.length).toBe(5);
      expect(all.every(r => r.phase === 'ended')).toBe(true);
    });

    it('should return all ended retros ordered by created_at desc', () => {
      const { retro: r1 } = handleCreateRetro(db, { title: 'First Retro' });
      handleEndRetro(db, { retroId: r1.id });

      const { retro: r2 } = handleCreateRetro(db, { title: 'Second Retro' });
      handleEndRetro(db, { retroId: r2.id });

      const { retro: r3 } = handleCreateRetro(db, { title: 'Third Retro' });
      handleEndRetro(db, { retroId: r3.id });

      const all = getAllRetros(db);
      expect(all.length).toBe(3);
      expect(all[0].title).toBe('Third Retro');
      expect(all[1].title).toBe('Second Retro');
      expect(all[2].title).toBe('First Retro');
    });

    it('should preserve retro data after ending', () => {
      const { retro: r1 } = handleCreateRetro(db, { title: 'Data Retro' });
      const { participant: p1 } = handleJoinRetro(db, { shareCode: r1.share_code, displayName: 'Alice', socketId: 's1', isFacilitator: true });
      const card = addCard(db, { retroId: r1.id, column: 'well', text: 'Great work' });
      addVote(db, { cardId: card.id, participantId: p1.id });
      saveSummary(db, { retroId: r1.id, text: 'Summary of data retro' });
      handleEndRetro(db, { retroId: r1.id });

      const { retro: r2 } = handleCreateRetro(db, { title: 'Another Retro' });
      handleEndRetro(db, { retroId: r2.id });

      const cards = getCards(db, r1.id);
      expect(cards.length).toBe(1);
      expect(cards[0].text).toBe('Great work');

      const votes = getVotesForRetro(db, r1.id);
      expect(votes.length).toBe(1);

      const participants = getParticipants(db, r1.id);
      expect(participants.length).toBe(1);
      expect(participants[0].display_name).toBe('Alice');

      const summary = getSummaryForRetro(db, r1.id);
      expect(summary.text).toBe('Summary of data retro');
    });

    it('should allow creating new retro only after ending the active one', () => {
      const { retro: retro1 } = handleCreateRetro(db, { title: 'Retro 1' });

      const fail = handleCreateRetro(db, { title: 'Retro 2' });
      expect(fail.error).toBe('An active retro already exists');

      handleEndRetro(db, { retroId: retro1.id });
      const { retro: retro2 } = handleCreateRetro(db, { title: 'Retro 2' });
      expect(retro2).toBeTruthy();

      handleEndRetro(db, { retroId: retro2.id });
      const { retro: retro3 } = handleCreateRetro(db, { title: 'Retro 3' });
      expect(retro3).toBeTruthy();

      handleEndRetro(db, { retroId: retro3.id });

      const all = getAllRetros(db);
      expect(all.length).toBe(3);
    });

    it('should return correct state for each ended retro independently', () => {
      const { retro: r1 } = handleCreateRetro(db, { title: 'Retro A' });
      const { participant: p1 } = handleJoinRetro(db, { shareCode: r1.share_code, displayName: 'Alice', socketId: 's1' });
      const c1 = addCard(db, { retroId: r1.id, column: 'well', text: 'Card A1' });
      const c2 = addCard(db, { retroId: r1.id, column: 'didnt', text: 'Card A2' });
      addVote(db, { cardId: c1.id, participantId: p1.id });
      handleEndRetro(db, { retroId: r1.id });

      const { retro: r2 } = handleCreateRetro(db, { title: 'Retro B' });
      const { participant: p2 } = handleJoinRetro(db, { shareCode: r2.share_code, displayName: 'Bob', socketId: 's2' });
      const c3 = addCard(db, { retroId: r2.id, column: 'action', text: 'Card B1' });
      addVote(db, { cardId: c3.id, participantId: p2.id });
      handleEndRetro(db, { retroId: r2.id });

      const { retro: r3 } = handleCreateRetro(db, { title: 'Retro C' });
      const { participant: p3 } = handleJoinRetro(db, { shareCode: r3.share_code, displayName: 'Carol', socketId: 's3' });
      const c4 = addCard(db, { retroId: r3.id, column: 'well', text: 'Card C1' });
      const c5 = addCard(db, { retroId: r3.id, column: 'well', text: 'Card C2' });
      const c6 = addCard(db, { retroId: r3.id, column: 'didnt', text: 'Card C3' });
      addVote(db, { cardId: c4.id, participantId: p3.id });
      addVote(db, { cardId: c5.id, participantId: p3.id });
      handleEndRetro(db, { retroId: r3.id });

      const cards1 = getCards(db, r1.id);
      expect(cards1.length).toBe(2);
      expect(cards1.map(c => c.text).sort()).toEqual(['Card A1', 'Card A2']);
      const votes1 = getVotesForRetro(db, r1.id);
      expect(votes1.length).toBe(1);

      const cards2 = getCards(db, r2.id);
      expect(cards2.length).toBe(1);
      expect(cards2[0].text).toBe('Card B1');
      const votes2 = getVotesForRetro(db, r2.id);
      expect(votes2.length).toBe(1);

      const cards3 = getCards(db, r3.id);
      expect(cards3.length).toBe(3);
      expect(cards3.map(c => c.text).sort()).toEqual(['Card C1', 'Card C2', 'Card C3']);
      const votes3 = getVotesForRetro(db, r3.id);
      expect(votes3.length).toBe(2);
    });

    it('should return ended retros via REST-like getAllRetros with correct fields', () => {
      const { retro: r1 } = handleCreateRetro(db, { title: 'REST Retro 1', addPointsDuration: 600, votingDuration: 180, maxParticipants: 8 });
      handleEndRetro(db, { retroId: r1.id });

      const { retro: r2 } = handleCreateRetro(db, { title: 'REST Retro 2', addPointsDuration: 400, votingDuration: 90, maxParticipants: 15 });
      handleEndRetro(db, { retroId: r2.id });

      const all = getAllRetros(db);
      expect(all.length).toBe(2);

      for (const retro of all) {
        expect(retro).toHaveProperty('id');
        expect(retro).toHaveProperty('title');
        expect(retro).toHaveProperty('share_code');
        expect(retro).toHaveProperty('phase');
        expect(retro).toHaveProperty('created_at');
        expect(retro).toHaveProperty('add_points_duration');
        expect(retro).toHaveProperty('voting_duration');
        expect(retro).toHaveProperty('max_participants');
        expect(retro.phase).toBe('ended');
      }

      const retro2 = all.find(r => r.title === 'REST Retro 2');
      expect(retro2.add_points_duration).toBe(400);
      expect(retro2.voting_duration).toBe(90);
      expect(retro2.max_participants).toBe(15);

      const retro1 = all.find(r => r.title === 'REST Retro 1');
      expect(retro1.add_points_duration).toBe(600);
      expect(retro1.voting_duration).toBe(180);
      expect(retro1.max_participants).toBe(8);
    });
  });

  describe('buildDetailedSummaryPrompt with grouped cards', () => {
    it('should exclude child cards from detailed prompt', () => {
      const cards = [
        { id: '1', column: 'well', text: 'Parent well', group_id: null },
        { id: '2', column: 'well', text: 'Child well', group_id: '1' },
        { id: '3', column: 'didnt', text: 'Bad thing', group_id: null },
        { id: '4', column: 'action', text: 'Fix it', group_id: null },
      ];
      const votes = [{ card_id: '1' }, { card_id: '1' }, { card_id: '3' }];

      const prompt = buildDetailedSummaryPrompt(cards, votes, 'Sprint 99');

      expect(prompt).toContain('Sprint 99');
      expect(prompt).toContain('Parent well (2 votes)');
      expect(prompt).not.toContain('Child well');
      expect(prompt).toContain('Bad thing (1 votes)');
      expect(prompt).toContain('Fix it (0 votes)');
      expect(prompt).toContain('Overview');
      expect(prompt).toContain('Recommendations');
    });
  });
});
