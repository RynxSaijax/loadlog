import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshRepository, makeUpperPlan } from './helpers.js';
import { toSessionSnapshot } from '../../src/data/snapshots.js';
import { SetType } from '../../src/data/enums.js';

test('a stored session maps to an immutable metrics snapshot', async () => {
  const { repository } = await freshRepository();
  const { plan, bench } = await makeUpperPlan(repository);
  const startedAt = Date.UTC(2026, 5, 1, 18);
  const session = await repository.startSession({ planId: plan.id, startedAt });
  const detail = await repository.getSessionDetail(session.id);
  const benchEntry = detail.exercises[0];
  const group = crypto.randomUUID();
  await repository.addSet(benchEntry.id, { load: 40, reps: 10, type: SetType.warmup, completedAt: startedAt + 1 });
  await repository.addSet(benchEntry.id, { load: 80, reps: 8, rir: 2, completedAt: startedAt + 2 });
  await repository.addSet(benchEntry.id, { load: 70, reps: 8, type: SetType.dropSet, dropGroupId: group, completedAt: startedAt + 3 });
  await repository.addSet(benchEntry.id, { load: 50, reps: 6, type: SetType.dropSet, dropGroupId: group, completedAt: startedAt + 4 });
  await repository.endSession(session.id, startedAt + 3_600_000);

  const exercises = new Map((await repository.listExercises({ includeArchived: true })).map((exercise) => [exercise.id, exercise]));
  const snapshot = toSessionSnapshot(await repository.getSessionDetail(session.id), exercises);

  assert.equal(snapshot.planId, plan.id);
  assert.equal(snapshot.startedAt, startedAt);
  assert.equal(snapshot.exercises.length, 2);
  const benchSnapshot = snapshot.exercises[0];
  assert.equal(benchSnapshot.exerciseId, bench.id);
  assert.equal(benchSnapshot.primaryMuscle, 'chest');
  assert.deepEqual([...benchSnapshot.secondaryMuscles], ['triceps', 'shoulders']);
  assert.equal(benchSnapshot.equipment, 'barbell');
  assert.deepEqual(
    benchSnapshot.sets.map((set) => [set.order, set.load, set.reps, set.type, set.dropGroupId, set.rir]),
    [
      [0, 40, 10, 'warmup', null, null],
      [1, 80, 8, 'normal', null, 2],
      [2, 70, 8, 'dropSet', group, null],
      [3, 50, 6, 'dropSet', group, null],
    ],
  );
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.exercises));
  assert.ok(Object.isFrozen(benchSnapshot.sets[0]));
  assert.throws(() => {
    'use strict';
    benchSnapshot.sets[0].load = 999;
  });
});

test('mapping fails loudly when an exercise is missing', async () => {
  const { repository } = await freshRepository();
  const { plan } = await makeUpperPlan(repository);
  const session = await repository.startSession({ planId: plan.id });
  const detail = await repository.getSessionDetail(session.id);
  assert.throws(() => toSessionSnapshot(detail, new Map()), { code: 'notFound' });
});
