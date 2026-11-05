/**
 * Sample data generator (debug only: Ajustes shows it when the address has
 * "?debug"). Creates three "Exemplo" plans and about ten weeks of ended
 * sessions that exercise every history screen and chart: progression,
 * a stagnating exercise, warmups, a drop-set, an ad-hoc session and a week
 * off. Deterministic for a given `now`.
 */
import { DomainError, ErrorCode } from '../data/errors.js';

export const SAMPLE_PREFIX = 'Exemplo';


const PLANS = [
  {
    name: `${SAMPLE_PREFIX} A — Peito e tríceps`,
    items: [
      { key: 'supino-reto-barra', sets: 4, repMin: 6, repMax: 8, rest: 150, start: 70, step: 2.5, reps: [8, 7, 7, 6] },
      { key: 'supino-inclinado-halteres', sets: 3, repMin: 8, repMax: 12, rest: 120, start: 24, step: 2, reps: [10, 9, 8] },
      { key: 'triceps-polia-corda', sets: 3, repMin: 10, repMax: 15, rest: 90, start: 25, step: 5, reps: [13, 12, 11] },
    ],
  },
  {
    name: `${SAMPLE_PREFIX} B — Costas e bíceps`,
    items: [
      { key: 'remada-curvada-barra', sets: 4, repMin: 6, repMax: 10, rest: 150, start: 60, step: 2.5, reps: [9, 8, 8, 7] },
      { key: 'puxada-frente', sets: 3, repMin: 8, repMax: 12, rest: 120, start: 50, step: 5, reps: [11, 10, 9] },
      { key: 'rosca-direta-barra', sets: 3, repMin: 8, repMax: 12, rest: 90, start: 25, step: 2.5, reps: [10, 9, 8] },
    ],
  },
  {
    name: `${SAMPLE_PREFIX} C — Pernas`,
    items: [
      { key: 'agachamento-livre', sets: 4, repMin: 5, repMax: 8, rest: 180, start: 90, step: 2.5, reps: [8, 7, 6, 6] },
      { key: 'leg-press-45', sets: 3, repMin: 10, repMax: 15, rest: 120, start: 160, step: 10, reps: [14, 12, 11] },
      // Stagnates: same load, reps slipping, for the last sessions.
      { key: 'cadeira-extensora', sets: 3, repMin: 10, repMax: 15, rest: 90, start: 45, step: 5, reps: [12, 11, 10], stagnates: true },
    ],
  },
];

function atLocal(base, dayOffset, hour, minute = 0) {
  const date = new Date(base);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + dayOffset, hour, minute).getTime();
}

/**
 * @returns {Promise<{ plans: number, sessions: number, sets: number }>}
 */
export async function generateSampleData(repository, now = Date.now(), { weeks = 10 } = {}) {
  if (await repository.getOpenSession()) {
    throw new DomainError(ErrorCode.openSessionExists, 'end the open session before generating sample data');
  }
  const exercises = await repository.listExercises({ includeArchived: true });
  const byKey = new Map(exercises.filter((exercise) => exercise.builtinKey).map((exercise) => [exercise.builtinKey, exercise]));
  const existing = new Set((await repository.listPlans({ includeArchived: true })).map((plan) => plan.name));

  const plans = [];
  for (const definition of PLANS) {
    let name = definition.name;
    for (let copy = 2; existing.has(name); copy += 1) name = `${definition.name} (${copy})`;
    const plan = await repository.createPlan({ name });
    for (const item of definition.items) {
      const exercise = byKey.get(item.key);
      if (!exercise) throw new Error(`Sample exercise missing from the catalog: ${item.key}`);
      await repository.addExerciseToPlan(plan.id, { exerciseId: exercise.id, prescribedSets: item.sets, repMin: item.repMin, repMax: item.repMax, restSeconds: item.rest });
    }
    plans.push({ plan, definition });
  }

  // Monday of the first week. Sessions on Mon/Wed/Fri, rotating A, B, C.
  const today = new Date(now);
  const mondayThisWeek = atLocal(now, -((today.getDay() + 6) % 7), 0);
  const firstMonday = atLocal(mondayThisWeek, -7 * (weeks - 1), 0);
  const skipWeek = weeks - 4; // a week off, three weeks ago
  const counts = { plans: plans.length, sessions: 0, sets: 0 };
  let rotation = 0;
  const done = new Map(); // plan index → sessions done

  for (let week = 0; week < weeks; week += 1) {
    if (week === skipWeek) continue;
    for (const [dayIndex, day] of [0, 2, 4].entries()) {
      const startedAt = atLocal(firstMonday, week * 7 + day, 18, 10 + dayIndex * 5);
      if (startedAt + 2 * 3_600_000 > now) continue;
      const planIndex = rotation % plans.length;
      rotation += 1;
      const round = done.get(planIndex) ?? 0;
      done.set(planIndex, round + 1);
      const { plan, definition } = plans[planIndex];
      const session = await repository.startSession({ planId: plan.id, startedAt });
      const detail = await repository.getSessionDetail(session.id);
      let clock = startedAt + 5 * 60_000;
      for (const [itemIndex, sessionExercise] of detail.exercises.entries()) {
        const item = definition.items[itemIndex];
        const progressSteps = item.stagnates ? Math.min(round, 1) : Math.floor(round / 2);
        const load = item.start + progressSteps * item.step;
        const repsDrift = item.stagnates ? -Math.max(0, round - 1) : round % 2;
        if (itemIndex === 0) {
          await repository.addSet(sessionExercise.id, { load: Math.max(0, Math.round((load * 0.5) / 2.5) * 2.5), reps: 10, type: 'warmup', completedAt: clock });
          clock += 2 * 60_000;
          counts.sets += 1;
        }
        for (const [setIndex, baseReps] of item.reps.entries()) {
          const reps = Math.max(1, Math.min(100, baseReps + repsDrift));
          const isLast = setIndex === item.reps.length - 1;
          const dropGroupId = isLast && itemIndex === 2 && !item.stagnates && round % 3 === 2 ? `sample-drop-${session.id}` : null;
          await repository.addSet(sessionExercise.id, { load, reps, type: dropGroupId ? 'dropSet' : 'normal', dropGroupId, completedAt: clock });
          counts.sets += 1;
          clock += (item.rest + 45) * 1000;
          if (dropGroupId) {
            await repository.addSet(sessionExercise.id, { load: Math.max(0, load - item.step * 2), reps: Math.max(1, reps - 2), type: 'dropSet', dropGroupId, completedAt: clock });
            counts.sets += 1;
            clock += 30_000;
          }
        }
      }
      await repository.endSession(session.id, clock + 3 * 60_000);
      counts.sessions += 1;
    }
  }

  // One ad-hoc session (no plan) last week.
  const adHocStart = atLocal(mondayThisWeek, -2, 10);
  if (adHocStart + 3_600_000 < now) {
    const session = await repository.startSession({ planId: null, startedAt: adHocStart });
    const curl = byKey.get('rosca-martelo');
    const item = await repository.addExerciseToSession(session.id, curl.id);
    for (let index = 0; index < 3; index += 1) {
      await repository.addSet(item.id, { load: 12, reps: 12 - index, completedAt: adHocStart + (index + 1) * 120_000 });
      counts.sets += 1;
    }
    await repository.endSession(session.id, adHocStart + 20 * 60_000);
    counts.sessions += 1;
  }
  return counts;
}


