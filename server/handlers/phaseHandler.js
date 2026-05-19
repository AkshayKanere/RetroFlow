import { updateRetroPhase, getRetro } from '../db.js';

export const PHASE_ORDER = ['lobby', 'adding', 'grouping', 'voting', 'discussion'];

const VALID_TRANSITIONS = {
  lobby: ['adding'],
  adding: ['grouping'],
  grouping: ['voting'],
  voting: ['discussion'],
  discussion: [],
};

const NEXT_PHASE = {
  adding: 'grouping',
  voting: 'discussion',
  grouping: 'voting',
};

const TIMED_PHASES = {
  adding: 'add_points_duration',
  voting: 'voting_duration',
};

export function handleStartPhase(db, { retroId, phase }) {
  const retro = getRetro(db, retroId);
  if (!VALID_TRANSITIONS[retro.phase]?.includes(phase)) {
    return { error: `Cannot transition from ${retro.phase} to ${phase}` };
  }
  let phaseEndsAt = null;
  if (TIMED_PHASES[phase]) {
    const durationSeconds = retro[TIMED_PHASES[phase]];
    phaseEndsAt = new Date(Date.now() + durationSeconds * 1000).toISOString();
  }
  const updated = updateRetroPhase(db, retroId, phase, phaseEndsAt);
  return { retro: updated };
}

export function handleEndPhase(db, { retroId }) {
  const retro = getRetro(db, retroId);
  const nextPhase = NEXT_PHASE[retro.phase];
  if (!nextPhase) {
    return { error: `Cannot end phase ${retro.phase}` };
  }
  const updated = updateRetroPhase(db, retroId, nextPhase, null);
  return { retro: updated };
}

export function handleTimerExpired(db, { retroId }) {
  return handleEndPhase(db, { retroId });
}
