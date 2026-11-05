import { bestSet, primarySets, tonnage } from './sets.js';

/** Sessions needed in a row without progress for stagnation (4.5). */
export const STAGNATION_STREAK = 3;

/**
 * History of one exercise under one comparison key (planId + exerciseId),
 * ordered by startedAt (never by creation). Sessions without a plan never
 * take part. Sessions where the exercise has no effective set are skipped.
 * If the exercise appears twice in one session, its sets are merged.
 *
 * @returns {{ sessionId: string, startedAt: number, sets: object[] }[]}
 */
export function comparisonHistory(sessions, planId, exerciseId) {
  if (planId === null || planId === undefined) return [];
  const entries = [];
  for (const session of sessions) {
    if (session.planId !== planId) continue;
    const sets = session.exercises.filter((exercise) => exercise.exerciseId === exerciseId).flatMap((exercise) => exercise.sets);
    if (primarySets(sets).length === 0) continue;
    entries.push({ sessionId: session.sessionId, startedAt: session.startedAt, sets });
  }
  return entries.sort((a, b) => a.startedAt - b.startedAt || (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0));
}

/**
 * Partial progress (4.4): some main-step effective set of the current
 * session beats the previous session's best set, by load, or by reps at the
 * same load.
 */
export function isPartialProgress(currentSets, previousSets) {
  const previousBest = bestSet(previousSets);
  if (previousBest === null) return false;
  return primarySets(currentSets).some(
    (set) => set.load > previousBest.load || (set.load === previousBest.load && set.reps > previousBest.reps),
  );
}

/**
 * Per-session comparison against the immediately previous session of the
 * same key. The first entry has no previous session.
 */
export function progressSeries(history) {
  return history.map((entry, index) => {
    const currentTonnage = tonnage(entry.sets);
    if (index === 0) {
      return { ...entry, tonnage: currentTonnage, previousSessionId: null, progress: null, tonnageIncreased: null };
    }
    const previous = history[index - 1];
    return {
      ...entry,
      tonnage: currentTonnage,
      previousSessionId: previous.sessionId,
      progress: isPartialProgress(entry.sets, previous.sets),
      tonnageIncreased: currentTonnage > tonnage(previous.sets),
    };
  });
}

/**
 * Stagnation (4.5): the latest sessions form a streak of at least 3 in a row
 * with no partial progress and no tonnage increase over the previous one.
 * @returns {{ isStagnant: boolean, streak: number }}
 */
export function stagnation(history) {
  const series = progressSeries(history);
  let streak = 0;
  for (let index = series.length - 1; index >= 1; index -= 1) {
    const entry = series[index];
    if (entry.progress || entry.tonnageIncreased) break;
    streak += 1;
  }
  return { isStagnant: streak >= STAGNATION_STREAK, streak };
}
