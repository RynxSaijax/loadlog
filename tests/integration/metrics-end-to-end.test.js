// Stored data → snapshots → metrics, as the app will use it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshRepository, makeUpperPlan } from './helpers.js';
import { toSessionSnapshot } from '../../src/data/snapshots.js';
import { comparisonHistory, progressSeries, stagnation, exerciseSets, detectRecords, RecordType, bestSet, tonnage } from '../../src/metrics/index.js';

async function snapshots(repository) {
  const exercises = new Map((await repository.listExercises({ includeArchived: true })).map((exercise) => [exercise.id, exercise]));
  const sessions = await repository.listSessions();
  return Promise.all(sessions.map(async (session) => toSessionSnapshot(await repository.getSessionDetail(session.id), exercises)));
}

async function benchSession(repository, planId, startedAt, sets) {
  const session = await repository.startSession({ planId, startedAt });
  const benchEntry = (await repository.getSessionDetail(session.id)).exercises[0];
  for (const [index, values] of sets.entries()) {
    await repository.addSet(benchEntry.id, { completedAt: startedAt + index, ...values });
  }
  await repository.endSession(session.id, startedAt + 3_600_000);
  return session;
}

test('progress, stagnation and PRs computed from real stored sessions', async () => {
  const { repository } = await freshRepository();
  const { plan, bench } = await makeUpperPlan(repository);
  const day = 86_400_000;
  const t0 = Date.UTC(2026, 0, 5, 20);

  await benchSession(repository, plan.id, t0, [{ load: 40, reps: 10, type: 'warmup' }, { load: 80, reps: 8 }, { load: 80, reps: 8 }]);
  await benchSession(repository, plan.id, t0 + 3 * day, [{ load: 80, reps: 9 }, { load: 80, reps: 7 }]);
  await benchSession(repository, plan.id, t0 + 6 * day, [{ load: 80, reps: 8 }, { load: 80, reps: 7 }]);
  await benchSession(repository, plan.id, t0 + 9 * day, [{ load: 80, reps: 8 }, { load: 77.5, reps: 7 }]);
  await benchSession(repository, plan.id, t0 + 12 * day, [{ load: 80, reps: 7 }, { load: 77.5, reps: 7 }]);

  const all = await snapshots(repository);
  const history = comparisonHistory(all, plan.id, bench.id);
  assert.equal(history.length, 5);
  assert.deepEqual(progressSeries(history).map((entry) => entry.progress), [null, true, false, false, false]);
  assert.deepEqual(stagnation(history), { isStagnant: true, streak: 3 });
  assert.equal(tonnage(history[0].sets), 1280);
  assert.deepEqual([bestSet(history[1].sets).load, bestSet(history[1].sets).reps], [80, 9]);

  const previous = exerciseSets(all, bench.id);
  assert.deepEqual(detectRecords(previous, { load: 82.5, reps: 6, type: 'normal' }), [RecordType.maxLoad]);
  assert.deepEqual(detectRecords(previous, { load: 80, reps: 10, type: 'normal' }), [RecordType.repsAtLoad, RecordType.estimatedOneRepMax]);
});
