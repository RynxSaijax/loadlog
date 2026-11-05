import { primarySets } from './sets.js';
import { SetType } from './set-type.js';
import { estimateOneRepMax, ONE_REP_MAX_CONFIDENT_REPS } from './one-rep-max.js';

/** PR types (4.6). */
export const RecordType = Object.freeze({
  maxLoad: 'maxLoad',
  repsAtLoad: 'repsAtLoad',
  estimatedOneRepMax: 'estimatedOneRepMax',
});

/**
 * Collects the main-step effective sets of one exercise across every session
 * (records cross plans, and include sessions without a plan).
 */
export function exerciseSets(sessions, exerciseId) {
  return sessions.flatMap((session) =>
    primarySets(session.exercises.filter((exercise) => exercise.exerciseId === exerciseId).flatMap((exercise) => exercise.sets)),
  );
}

/**
 * Best marks of an exercise from its main-step effective sets.
 * @returns {{ maxLoad: object|null, bestOneRepMax: { set: object, value: number }|null,
 *             repsByLoad: Map<number, object> }}
 */
export function recordSummary(sets) {
  let maxLoad = null;
  let bestOneRepMax = null;
  const repsByLoad = new Map();
  for (const set of sets) {
    if (maxLoad === null || set.load > maxLoad.load) maxLoad = set;
    const atLoad = repsByLoad.get(set.load);
    if (!atLoad || set.reps > atLoad.reps) repsByLoad.set(set.load, set);
    if (set.reps <= ONE_REP_MAX_CONFIDENT_REPS) {
      const { value } = estimateOneRepMax(set.load, set.reps);
      if (bestOneRepMax === null || value > bestOneRepMax.value) bestOneRepMax = { set, value };
    }
  }
  return { maxLoad, bestOneRepMax, repsByLoad };
}

/**
 * Records broken by `newSet` against every earlier main-step effective set
 * of the same exercise (`previousSets`). Warmups and non-main drop-set steps
 * never break records, and the very first set of an exercise only sets the
 * baseline. All comparisons are strict: matching a record is not a PR.
 *
 * @param {object[]} previousSets main-step effective sets logged before `newSet`
 * @param {object} newSet the set just confirmed
 * @param {boolean} isMainStep false for drop-set steps after the first
 * @returns {string[]} RecordType values, in a fixed order
 */
export function detectRecords(previousSets, newSet, { isMainStep = true } = {}) {
  if (!isMainStep || newSet.type === SetType.warmup || previousSets.length === 0) return [];
  const { maxLoad, bestOneRepMax, repsByLoad } = recordSummary(previousSets);
  const records = [];
  if (newSet.load > maxLoad.load) records.push(RecordType.maxLoad);
  const atLoad = repsByLoad.get(newSet.load);
  if (atLoad && newSet.reps > atLoad.reps) records.push(RecordType.repsAtLoad);
  if (newSet.reps <= ONE_REP_MAX_CONFIDENT_REPS) {
    const { value } = estimateOneRepMax(newSet.load, newSet.reps);
    if (bestOneRepMax === null || value > bestOneRepMax.value) records.push(RecordType.estimatedOneRepMax);
  }
  return records;
}
