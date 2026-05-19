import { describe, it, expect, beforeEach } from 'vitest';
import { initDb, updateRetroPhase } from '../db.js';
import { handleCreateRetro, handleJoinRetro } from '../handlers/retroHandler.js';

describe('retroHandler', () => {
  let db;

  beforeEach(async () => {
    db = await initDb();
  });

  it('should create a retro and return share code', () => {
    const result = handleCreateRetro(db, {
      title: 'Sprint 24',
      addPointsDuration: 600,
      votingDuration: 300,
      maxParticipants: 8,
    });
    expect(result.retro.title).toBe('Sprint 24');
    expect(result.retro.share_code).toBeTruthy();
    expect(result.retro.add_points_duration).toBe(600);
    expect(result.retro.voting_duration).toBe(300);
    expect(result.retro.max_participants).toBe(8);
  });

  it('should reject creating retro if one is already active', () => {
    handleCreateRetro(db, { title: 'Active' });
    const result = handleCreateRetro(db, { title: 'Another' });
    expect(result.error).toBe('An active retro already exists');
  });

  it('should allow creating retro after previous one ended', () => {
    const { retro } = handleCreateRetro(db, { title: 'First' });
    updateRetroPhase(db, retro.id, 'ended');
    const result = handleCreateRetro(db, { title: 'Second' });
    expect(result.retro.title).toBe('Second');
  });

  it('should join a retro with isFacilitator flag', () => {
    const { retro } = handleCreateRetro(db, { title: 'Test' });
    const result = handleJoinRetro(db, {
      shareCode: retro.share_code,
      displayName: 'Alice',
      socketId: 'sock1',
      isFacilitator: true,
    });
    expect(result.participant.display_name).toBe('Alice');
    expect(result.participant.is_facilitator).toBe(1);
  });

  it('should join as non-facilitator by default', () => {
    const { retro } = handleCreateRetro(db, { title: 'Test' });
    const result = handleJoinRetro(db, {
      shareCode: retro.share_code,
      displayName: 'Bob',
      socketId: 'sock2',
      isFacilitator: false,
    });
    expect(result.participant.is_facilitator).toBe(0);
  });

  it('should reject join when retro is full', () => {
    const { retro } = handleCreateRetro(db, { title: 'Small', maxParticipants: 2 });
    handleJoinRetro(db, { shareCode: retro.share_code, displayName: 'A', socketId: 's1', isFacilitator: true });
    handleJoinRetro(db, { shareCode: retro.share_code, displayName: 'B', socketId: 's2', isFacilitator: false });
    const result = handleJoinRetro(db, { shareCode: retro.share_code, displayName: 'C', socketId: 's3', isFacilitator: false });
    expect(result.error).toBe('Retro is full. Maximum participants reached.');
  });

  it('should return error for invalid share code', () => {
    const result = handleJoinRetro(db, {
      shareCode: 'invalid',
      displayName: 'Alice',
      socketId: 'sock1',
      isFacilitator: false,
    });
    expect(result.error).toBe('Retro not found');
  });
});
