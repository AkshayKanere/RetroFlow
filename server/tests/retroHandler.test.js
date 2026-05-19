import { describe, it, expect, beforeEach } from 'vitest';
import { initDb } from '../db.js';
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
    });
    expect(result.retro.title).toBe('Sprint 24');
    expect(result.retro.share_code).toBeTruthy();
    expect(result.retro.add_points_duration).toBe(600);
    expect(result.retro.voting_duration).toBe(300);
  });

  it('should join a retro and mark first joiner as facilitator', () => {
    const { retro } = handleCreateRetro(db, {
      title: 'Test',
      addPointsDuration: 600,
      votingDuration: 600,
    });
    const result = handleJoinRetro(db, {
      shareCode: retro.share_code,
      displayName: 'Alice',
      socketId: 'sock1',
    });
    expect(result.participant.display_name).toBe('Alice');
    expect(result.participant.is_facilitator).toBe(1);

    const result2 = handleJoinRetro(db, {
      shareCode: retro.share_code,
      displayName: 'Bob',
      socketId: 'sock2',
    });
    expect(result2.participant.is_facilitator).toBe(0);
  });

  it('should return error for invalid share code', () => {
    const result = handleJoinRetro(db, {
      shareCode: 'invalid',
      displayName: 'Alice',
      socketId: 'sock1',
    });
    expect(result.error).toBe('Retro not found');
  });
});
