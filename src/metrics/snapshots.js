/**
 * Value types consumed by the metrics module. They carry only what the
 * domain rules need, are deeply frozen, and know nothing about storage.
 * Dates are epoch milliseconds.
 */

function freezeArray(items) {
  return Object.freeze([...items]);
}

/**
 * @param {{ id: string, order: number, load: number, reps: number, rir?: number|null,
 *           type: string, dropGroupId?: string|null, completedAt: number }} input
 */
export function makeSetSnapshot(input) {
  return Object.freeze({
    id: input.id,
    order: input.order,
    load: input.load,
    reps: input.reps,
    rir: input.rir ?? null,
    type: input.type,
    dropGroupId: input.dropGroupId ?? null,
    completedAt: input.completedAt,
  });
}

/**
 * @param {{ exerciseId: string, primaryMuscle: string, secondaryMuscles: string[],
 *           equipment: string, sets: object[] }} input
 */
export function makeExerciseSnapshot(input) {
  return Object.freeze({
    exerciseId: input.exerciseId,
    primaryMuscle: input.primaryMuscle,
    secondaryMuscles: freezeArray(input.secondaryMuscles),
    equipment: input.equipment,
    sets: freezeArray([...input.sets].sort((a, b) => a.order - b.order)),
  });
}

/**
 * @param {{ sessionId: string, planId: string|null, startedAt: number,
 *           endedAt: number|null, exercises: object[] }} input
 */
export function makeSessionSnapshot(input) {
  return Object.freeze({
    sessionId: input.sessionId,
    planId: input.planId ?? null,
    startedAt: input.startedAt,
    endedAt: input.endedAt ?? null,
    exercises: freezeArray(input.exercises),
  });
}
