import { getRepository } from '../../data/app-data.js';

/** Prescription given to an exercise when it is added to a plan. */
export const DEFAULT_PRESCRIPTION = Object.freeze({ prescribedSets: 3, repMin: 8, repMax: 12, restSeconds: 120 });

export const PRESCRIPTION_LIMITS = Object.freeze({
  prescribedSets: { min: 1, max: 20, step: 1 },
  reps: { min: 1, max: 100, step: 1 },
  restSeconds: { min: 0, max: 600, step: 15 },
});

export async function loadPlansOverview() {
  const repository = await getRepository();
  const plans = await repository.listPlans({ includeArchived: true });
  const withCounts = await Promise.all(
    plans.map(async (plan) => ({ plan, exerciseCount: (await repository.getPlan(plan.id)).exercises.length })),
  );
  return {
    active: withCounts.filter((entry) => !entry.plan.isArchived),
    archived: withCounts.filter((entry) => entry.plan.isArchived),
  };
}

export async function loadPlanDetail(planId) {
  const repository = await getRepository();
  const plan = await repository.getPlan(planId);
  const exercises = new Map((await repository.listExercises({ includeArchived: true })).map((exercise) => [exercise.id, exercise]));
  return {
    plan,
    items: plan.exercises.map((item) => ({ item, exercise: exercises.get(item.exerciseId) })),
    hasHistory: await repository.planHasHistory(planId),
  };
}

export async function loadPlanItem(planId, itemId) {
  const { plan, items } = await loadPlanDetail(planId);
  const entry = items.find(({ item }) => item.id === itemId);
  return entry ? { plan, ...entry } : null;
}

/** New order of `ids` after moving `id` by `delta` (−1 up, +1 down). */
export function moveId(ids, id, delta) {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  const result = [...ids];
  [result[from], result[to]] = [result[to], result[from]];
  return result;
}

export async function movePlan(planId, delta) {
  const repository = await getRepository();
  const plans = await repository.listPlans({ includeArchived: true });
  const active = plans.filter((plan) => !plan.isArchived).map((plan) => plan.id);
  const archived = plans.filter((plan) => plan.isArchived).map((plan) => plan.id);
  await repository.reorderPlans([...moveId(active, planId, delta), ...archived]);
}

export async function movePlanItem(planId, itemId, delta) {
  const repository = await getRepository();
  const plan = await repository.getPlan(planId);
  await repository.reorderPlanExercises(planId, moveId(plan.exercises.map((item) => item.id), itemId, delta));
}

export async function addExerciseWithDefaults(planId, exerciseId) {
  const repository = await getRepository();
  return repository.addExerciseToPlan(planId, { exerciseId, ...DEFAULT_PRESCRIPTION });
}
