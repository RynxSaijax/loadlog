import { toSessionSnapshot } from './snapshots.js';

/**
 * Converts stored session details into metrics snapshots. Exercises missing
 * from the catalog (should not happen) are skipped instead of breaking the
 * whole screen.
 */
export function toSnapshots(details, exercisesById) {
  return details.map((detail) =>
    toSessionSnapshot({ ...detail, exercises: detail.exercises.filter((exercise) => exercisesById.has(exercise.exerciseId)) }, exercisesById),
  );
}
