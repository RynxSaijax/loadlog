import { getRepository } from '../../data/app-data.js';
import { normalizeName } from '../../data/normalize.js';
import { MuscleGroup } from '../../data/enums.js';

/** Exercises split into active/archived, each grouped by primary muscle in enum order. */
export async function loadCatalog() {
  const repository = await getRepository();
  const exercises = await repository.listExercises({ includeArchived: true });
  return {
    active: exercises.filter((exercise) => !exercise.isArchived),
    archived: exercises.filter((exercise) => exercise.isArchived),
  };
}

export function groupByMuscle(exercises) {
  return Object.values(MuscleGroup)
    .map((muscle) => ({ muscle, exercises: exercises.filter((exercise) => exercise.primaryMuscle === muscle) }))
    .filter((section) => section.exercises.length > 0);
}

/** Accent- and case-insensitive name search; every word must appear. */
export function filterExercises(exercises, query) {
  const words = normalizeName(query).split(' ').filter(Boolean);
  if (words.length === 0) return exercises;
  return exercises.filter((exercise) => {
    const name = normalizeName(exercise.name);
    return words.every((word) => name.includes(word));
  });
}


export async function loadExerciseUsage(exerciseId) {
  const repository = await getRepository();
  const [exercise, hasHistory, plans] = await Promise.all([
    repository.getExercise(exerciseId),
    repository.exerciseHasHistory(exerciseId),
    repository.listPlans({ includeArchived: true }),
  ]);
  const usedBy = [];
  for (const plan of plans) {
    if ((await repository.getPlan(plan.id)).exercises.some((item) => item.exerciseId === exerciseId)) usedBy.push(plan);
  }
  return { exercise, hasHistory, usedBy };
}
