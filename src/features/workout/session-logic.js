/**
 * Pure rules of the active session screen, built on the metrics module.
 * Inputs are metrics snapshots (see src/metrics/snapshots.js).
 */
import {
  bestSet, comparisonHistory, countEffectiveSets, detectRecords, exerciseSets, isEffective, primarySets, SetType, tonnage, volumeByWeek,
} from '../../metrics/index.js';

/** Sets of one exercise inside one session snapshot (the exercise may appear twice). */
export function setsOf(sessionSnapshot, exerciseId) {
  return sessionSnapshot.exercises.filter((exercise) => exercise.exerciseId === exerciseId).flatMap((exercise) => exercise.sets);
}

/**
 * Last session (by startedAt, before `before`) under the same comparison key,
 * with its best set. Null for ad-hoc sessions or no history.
 */
export function lastTime(pastSessions, planId, exerciseId, before = Number.POSITIVE_INFINITY) {
  const history = comparisonHistory(pastSessions.filter((session) => session.startedAt < before), planId, exerciseId);
  const last = history.at(-1);
  return last ? { sessionId: last.sessionId, startedAt: last.startedAt, best: bestSet(last.sets) } : null;
}

/** Most recent past session containing the exercise in any plan (fallback prefill). */
function lastAnywhere(pastSessions, exerciseId, before) {
  const sessions = pastSessions
    .filter((session) => session.startedAt < before && primarySets(setsOf(session, exerciseId)).length > 0)
    .sort((a, b) => b.startedAt - a.startedAt);
  return sessions[0] ? bestSet(setsOf(sessions[0], exerciseId)) : null;
}

/**
 * Values offered for the next set (5.1):
 * 1. the previous set of this exercise in this session;
 * 2. otherwise the best effective set of the last session with the same key;
 * 3. otherwise the best set of the last session with this exercise in any plan;
 * 4. otherwise 0 kg × the bottom of the rep range (or 8).
 */
export function prefill({ currentSets, pastSessions, planId, exerciseId, startedAt, repMin }) {
  const ordered = [...currentSets].sort((a, b) => a.order - b.order);
  const previous = ordered.at(-1);
  if (previous) return { load: previous.load, reps: previous.reps, source: 'previousSet' };
  const sameKey = planId ? lastTime(pastSessions, planId, exerciseId, startedAt)?.best : null;
  if (sameKey) return { load: sameKey.load, reps: sameKey.reps, source: 'lastSession' };
  const anywhere = lastAnywhere(pastSessions, exerciseId, startedAt);
  if (anywhere) return { load: anywhere.load, reps: anywhere.reps, source: 'otherPlan' };
  return { load: 0, reps: repMin ?? 8, source: 'none' };
}

/**
 * Number of the effective set about to be logged when it goes beyond the
 * prescription, else null. Warmups and later drop-set steps do not count.
 */
export function extraSetNumber(currentSets, prescribedSets, { inDropSet = false } = {}) {
  if (!prescribedSets || inDropSet) return null;
  const next = countEffectiveSets(currentSets) + 1;
  return next > prescribedSets ? next : null;
}

/** Load after pressing ± with the exercise's increment, never below 0 or above 1000. */
export function stepLoad(load, increment, direction) {
  const next = Math.round((load + direction * increment) * 4) / 4;
  return Math.min(1000, Math.max(0, next));
}

/**
 * Earlier main-step sets of an exercise used as the record baseline for a
 * set of the current session: every other session started before it
 * (across plans), plus the earlier sets of the current session.
 */
function recordBaseline(pastSessions, currentSession, exerciseId, beforeOrder) {
  const others = pastSessions.filter((session) => session.sessionId !== currentSession.sessionId && session.startedAt < currentSession.startedAt);
  const earlierInSession = primarySets(setsOf(currentSession, exerciseId)).filter((set) => set.order < beforeOrder);
  return [...exerciseSets(others, exerciseId), ...earlierInSession];
}

function isMainStep(set, sets) {
  if (set.type !== SetType.dropSet) return true;
  return primarySets(sets).some((candidate) => candidate.id === set.id);
}

/** Records broken by one set of the current session. */
export function recordsForSet(pastSessions, currentSession, exerciseId, set) {
  if (!isEffective(set.type)) return [];
  const sets = setsOf(currentSession, exerciseId);
  return detectRecords(recordBaseline(pastSessions, currentSession, exerciseId, set.order), set, { isMainStep: isMainStep(set, sets) });
}

/**
 * End-of-session summary: duration, tonnage, effective sets per muscle group
 * (primary 1, secondary 0.5) and every record broken in the session.
 */
export function sessionSummary(currentSession, pastSessions) {
  const groups = new Map();
  for (const groupsOfWeek of volumeByWeek([currentSession]).values()) {
    for (const [group, totals] of groupsOfWeek) groups.set(group, totals.sets);
  }
  const records = [];
  for (const exercise of currentSession.exercises) {
    for (const set of exercise.sets) {
      const types = recordsForSet(pastSessions, currentSession, exercise.exerciseId, set);
      if (types.length) records.push({ exerciseId: exercise.exerciseId, set, types });
    }
  }
  const allSets = currentSession.exercises.flatMap((exercise) => exercise.sets);
  return {
    durationMs: currentSession.endedAt === null ? null : Math.max(0, currentSession.endedAt - currentSession.startedAt),
    tonnage: tonnage(allSets),
    effectiveSets: currentSession.exercises.reduce((sum, exercise) => sum + countEffectiveSets(exercise.sets), 0),
    setsByGroup: [...groups.entries()].sort((a, b) => b[1] - a[1]),
    records,
  };
}

/** Sessions started this many hours ago or more are treated as retroactive logs when ending. */
export const RETROACTIVE_HOURS = 6;

/**
 * End time for a session ended now. A retroactive session (started long ago)
 * ends at its start plus the time actually spent logging, so its duration is
 * not measured in days.
 */
export function endTimeFor(startedAt, sets, now) {
  if (now - startedAt < RETROACTIVE_HOURS * 3_600_000) return now;
  const times = sets.map((set) => set.completedAt).sort((a, b) => a - b);
  const spent = times.length ? times.at(-1) - times[0] : 0;
  return startedAt + Math.max(0, spent);
}
