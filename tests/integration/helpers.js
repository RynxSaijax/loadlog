import { IDBFactory } from 'fake-indexeddb';
import { openRepository } from '../../src/data/repository.js';
import { builtinCatalog } from '../../src/data/catalog.pt-BR.js';

/** A fresh, isolated in-memory IndexedDB per test. */
export async function freshRepository() {
  const indexedDB = new IDBFactory();
  const repository = await openRepository({ name: 'loadlog-test', indexedDB });
  await repository.seedCatalog();
  return { repository, indexedDB };
}

export function exerciseByKey(exercises, key) {
  const builtinKey = builtinCatalog.find((item) => item.builtinKey === key)?.builtinKey;
  const exercise = exercises.find((item) => item.builtinKey === builtinKey);
  if (!exercise) throw new Error(`No exercise ${key}`);
  return exercise;
}

/** A plan "A — Upper" with bench press 4×6–8 and barbell row 3×8–10. */
export async function makeUpperPlan(repository) {
  const exercises = await repository.listExercises();
  const bench = exerciseByKey(exercises, 'supino-reto-barra');
  const row = exerciseByKey(exercises, 'remada-curvada-barra');
  const plan = await repository.createPlan({ name: 'A — Upper' });
  await repository.addExerciseToPlan(plan.id, { exerciseId: bench.id, prescribedSets: 4, repMin: 6, repMax: 8, restSeconds: 150 });
  await repository.addExerciseToPlan(plan.id, { exerciseId: row.id, prescribedSets: 3, repMin: 8, repMax: 10, restSeconds: 120 });
  return { plan, bench, row };
}

/** Starts a session of `plan`, logs one set on each exercise and ends it. */
export async function logSession(repository, planId, { startedAt = Date.now(), load = 80, reps = 8 } = {}) {
  const session = await repository.startSession({ planId, startedAt });
  const detail = await repository.getSessionDetail(session.id);
  for (const exercise of detail.exercises) {
    await repository.addSet(exercise.id, { load, reps, completedAt: startedAt + 60_000 });
  }
  await repository.endSession(session.id, startedAt + 3_600_000);
  return session;
}
