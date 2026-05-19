import { describe, it, expect, beforeEach } from 'vitest';
import { initDb, createRetro, updateRetroPhase } from '../db.js';
import { handleStartPhase, handleEndPhase, handleTimerExpired } from '../handlers/phaseHandler.js';

describe('phaseHandler', () => {
  let db;
  let retro;

  beforeEach(async () => {
    db = await initDb();
    retro = createRetro(db, {
      title: 'Sprint Retro',
      addPointsDuration: 300,
      votingDuration: 120,
    });
  });

  it('should start adding phase from lobby with phase_ends_at set', () => {
    const before = Date.now();
    const result = handleStartPhase(db, { retroId: retro.id, phase: 'adding' });
    const after = Date.now();

    expect(result.retro.phase).toBe('adding');
    expect(result.retro.phase_ends_at).toBeTruthy();

    const endsAt = new Date(result.retro.phase_ends_at).getTime();
    expect(endsAt).toBeGreaterThanOrEqual(before + 300 * 1000 - 1000);
    expect(endsAt).toBeLessThanOrEqual(after + 300 * 1000 + 1000);
  });

  it('should reject invalid phase transition (lobby -> voting)', () => {
    const result = handleStartPhase(db, { retroId: retro.id, phase: 'voting' });
    expect(result.error).toBe('Cannot transition from lobby to voting');
  });

  it('should reject invalid phase transition (lobby -> discussion)', () => {
    const result = handleStartPhase(db, { retroId: retro.id, phase: 'discussion' });
    expect(result.error).toBe('Cannot transition from lobby to discussion');
  });

  it('should end adding phase early and move to grouping', () => {
    updateRetroPhase(db, retro.id, 'adding', new Date(Date.now() + 60000).toISOString());

    const result = handleEndPhase(db, { retroId: retro.id });
    expect(result.retro.phase).toBe('grouping');
    expect(result.retro.phase_ends_at).toBeNull();
  });

  it('should start voting from grouping', () => {
    updateRetroPhase(db, retro.id, 'grouping', null);

    const result = handleStartPhase(db, { retroId: retro.id, phase: 'voting' });
    expect(result.retro.phase).toBe('voting');
    expect(result.retro.phase_ends_at).toBeTruthy();

    const endsAt = new Date(result.retro.phase_ends_at).getTime();
    expect(endsAt).toBeGreaterThanOrEqual(Date.now() + 120 * 1000 - 2000);
  });

  it('should end grouping phase and move to voting', () => {
    updateRetroPhase(db, retro.id, 'grouping', null);

    const result = handleEndPhase(db, { retroId: retro.id });
    expect(result.retro.phase).toBe('voting');
    expect(result.retro.phase_ends_at).toBeNull();
  });

  it('should end voting and move to discussion', () => {
    updateRetroPhase(db, retro.id, 'voting', new Date(Date.now() + 60000).toISOString());

    const result = handleEndPhase(db, { retroId: retro.id });
    expect(result.retro.phase).toBe('discussion');
    expect(result.retro.phase_ends_at).toBeNull();
  });

  it('should handle timer expired same as end phase', () => {
    updateRetroPhase(db, retro.id, 'adding', new Date(Date.now() + 60000).toISOString());

    const result = handleTimerExpired(db, { retroId: retro.id });
    expect(result.retro.phase).toBe('grouping');
    expect(result.retro.phase_ends_at).toBeNull();
  });

  it('should return error when ending discussion phase', () => {
    updateRetroPhase(db, retro.id, 'discussion', null);

    const result = handleEndPhase(db, { retroId: retro.id });
    expect(result.error).toBe('Cannot end phase discussion');
  });

  it('should return error when ending lobby phase', () => {
    const result = handleEndPhase(db, { retroId: retro.id });
    expect(result.error).toBe('Cannot end phase lobby');
  });
});
