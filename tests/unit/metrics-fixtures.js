import { makeExerciseSnapshot, makeSessionSnapshot, makeSetSnapshot } from '../../src/metrics/snapshots.js';

let counter = 0;

/** Set snapshot shorthand: set(80, 8), set(40, 10, 'warmup'), set(70, 8, 'dropSet', 'g1'). */
export function set(load, reps, type = 'normal', dropGroupId = null) {
  counter += 1;
  return makeSetSnapshot({ id: `set-${counter}`, order: counter, load, reps, type, dropGroupId, completedAt: counter });
}

export function exercise(exerciseId, sets, { primaryMuscle = 'chest', secondaryMuscles = [], equipment = 'barbell' } = {}) {
  return makeExerciseSnapshot({ exerciseId, primaryMuscle, secondaryMuscles, equipment, sets });
}

export function session(sessionId, startedAt, exercises, { planId = 'plan-a', endedAt = startedAt + 3_600_000 } = {}) {
  return makeSessionSnapshot({ sessionId, planId, startedAt, endedAt, exercises });
}

/** Local-time timestamp helper: at(2026, 1, 5, 18) = 5 Jan 2026, 18:00 local. */
export function at(year, month, day, hour = 12, minute = 0) {
  return new Date(year, month - 1, day, hour, minute).getTime();
}
