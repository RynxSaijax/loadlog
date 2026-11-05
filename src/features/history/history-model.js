import { getRepository } from '../../data/app-data.js';
import { toSnapshots } from '../../data/session-snapshots.js';
import { t } from '../../i18n/i18n.js';

/**
 * Everything the history screens read: ended sessions (stored details and
 * metrics snapshots), exercises and plans, loaded in one go.
 */
export async function loadHistory() {
  const repository = await getRepository();
  const [details, exercises, plans] = await Promise.all([
    repository.listSessionDetails(),
    repository.listExercises({ includeArchived: true }),
    repository.listPlans({ includeArchived: true }),
  ]);
  const ended = details.filter((detail) => detail.endedAt !== null);
  const exercisesById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const snapshots = toSnapshots(ended, exercisesById);
  return {
    details: ended,
    detailsById: new Map(ended.map((detail) => [detail.id, detail])),
    snapshots,
    snapshotsById: new Map(snapshots.map((snapshot) => [snapshot.sessionId, snapshot])),
    exercisesById,
    plans,
    plansById: new Map(plans.map((plan) => [plan.id, plan])),
    openSession: details.find((detail) => detail.endedAt === null) ?? null,
  };
}

/** Name shown for a session: the plan name as it was, or "Treino avulso". */
export function sessionName(detail) {
  return detail.planNameSnapshot || t('session.adHocName');
}

/** Current name of a plan, falling back to the snapshot of a session. */
export function planName(data, planId, fallback = '') {
  return data.plansById.get(planId)?.name ?? fallback;
}

/** Exercise name: catalog name, or the name snapshotted on a session. */
export function exerciseName(data, exerciseId) {
  const current = data.exercisesById.get(exerciseId)?.name;
  if (current) return current;
  for (const detail of data.details) {
    const item = detail.exercises.find((candidate) => candidate.exerciseId === exerciseId);
    if (item) return item.exerciseNameSnapshot;
  }
  return '';
}
