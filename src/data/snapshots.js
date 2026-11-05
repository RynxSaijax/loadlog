import { makeExerciseSnapshot, makeSessionSnapshot, makeSetSnapshot } from '../metrics/snapshots.js';
import { DomainError, ErrorCode } from './errors.js';

/**
 * Maps a stored session detail (see repository.getSessionDetail) into the
 * metrics value types. `exercisesById` supplies muscle groups and equipment,
 * which are not snapshotted on the session.
 */
export function toSessionSnapshot(detail, exercisesById) {
  return makeSessionSnapshot({
    sessionId: detail.id,
    planId: detail.planId,
    startedAt: detail.startedAt,
    endedAt: detail.endedAt,
    exercises: detail.exercises.map((sessionExercise) => {
      const exercise = exercisesById.get(sessionExercise.exerciseId);
      if (!exercise) {
        throw new DomainError(ErrorCode.notFound, `exercise ${sessionExercise.exerciseId} not found`, {
          kind: 'exercise',
          id: sessionExercise.exerciseId,
        });
      }
      return makeExerciseSnapshot({
        exerciseId: exercise.id,
        primaryMuscle: exercise.primaryMuscle,
        secondaryMuscles: exercise.secondaryMuscles,
        equipment: exercise.equipment,
        sets: sessionExercise.sets.map((set) =>
          makeSetSnapshot({
            id: set.id,
            order: set.sortOrder,
            load: set.load,
            reps: set.reps,
            rir: set.rir,
            type: set.type,
            dropGroupId: set.dropGroupId,
            completedAt: set.completedAt,
          }),
        ),
      });
    }),
  });
}
