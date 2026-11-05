// Failure tests: invalid input, broken references and interrupted writes
// must be rejected without leaving partial or orphan data behind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshRepository, makeUpperPlan, logSession, exerciseByKey } from './helpers.js';
import { ErrorCode } from '../../src/data/errors.js';
import { SetType, Equipment, MuscleGroup, MovementPattern } from '../../src/data/enums.js';
import { openRepository } from '../../src/data/repository.js';

async function openSessionWithBench() {
  const { repository } = await freshRepository();
  const { plan } = await makeUpperPlan(repository);
  const session = await repository.startSession({ planId: plan.id });
  const detail = await repository.getSessionDetail(session.id);
  return { repository, plan, session, benchEntry: detail.exercises[0] };
}

test('load outside 0–1000 or not a multiple of 0.25 is rejected', async () => {
  const { repository, benchEntry } = await openSessionWithBench();
  for (const load of [-0.25, 1000.25, 2.3, 0.1, Number.NaN, Number.POSITIVE_INFINITY, '80', null, undefined]) {
    await assert.rejects(repository.addSet(benchEntry.id, { load, reps: 8 }), { code: ErrorCode.validation }, `load ${load}`);
  }
  for (const load of [0, 0.25, 2.5, 997.75, 1000]) {
    await repository.addSet(benchEntry.id, { load, reps: 8 });
  }
  assert.equal((await repository.counts()).sets, 5);
});

test('reps outside 1–100 or fractional are rejected', async () => {
  const { repository, benchEntry } = await openSessionWithBench();
  for (const reps of [0, -1, 101, 2.5, Number.NaN, '8']) {
    await assert.rejects(repository.addSet(benchEntry.id, { load: 80, reps }), { code: ErrorCode.validation }, `reps ${reps}`);
  }
  await repository.addSet(benchEntry.id, { load: 80, reps: 1 });
  await repository.addSet(benchEntry.id, { load: 80, reps: 100 });
  assert.equal((await repository.counts()).sets, 2);
});

test('RIR outside 0–10 is rejected; empty RIR is allowed', async () => {
  const { repository, benchEntry } = await openSessionWithBench();
  for (const rir of [-1, 11, 1.5, '2']) {
    await assert.rejects(repository.addSet(benchEntry.id, { load: 80, reps: 8, rir }), { code: ErrorCode.validation }, `rir ${rir}`);
  }
  assert.equal((await repository.addSet(benchEntry.id, { load: 80, reps: 8, rir: 0 })).rir, 0);
  assert.equal((await repository.addSet(benchEntry.id, { load: 80, reps: 8, rir: 10 })).rir, 10);
  assert.equal((await repository.addSet(benchEntry.id, { load: 80, reps: 8 })).rir, null);
});

test('unknown set type and inconsistent drop-set groups are rejected', async () => {
  const { repository, benchEntry } = await openSessionWithBench();
  await assert.rejects(repository.addSet(benchEntry.id, { load: 80, reps: 8, type: 'superset' }), { code: ErrorCode.validation });
  await assert.rejects(repository.addSet(benchEntry.id, { load: 80, reps: 8, type: SetType.dropSet }), { code: ErrorCode.validation });
  await assert.rejects(
    repository.addSet(benchEntry.id, { load: 80, reps: 8, type: SetType.normal, dropGroupId: 'g1' }),
    { code: ErrorCode.validation },
  );
  const group = crypto.randomUUID();
  await repository.addSet(benchEntry.id, { load: 80, reps: 8, type: SetType.dropSet, dropGroupId: group });
  await repository.addSet(benchEntry.id, { load: 60, reps: 6, type: SetType.dropSet, dropGroupId: group });
  assert.equal((await repository.counts()).sets, 2);
});

test('a set cannot be created without an existing session exercise', async () => {
  const { repository } = await openSessionWithBench();
  await assert.rejects(repository.addSet(crypto.randomUUID(), { load: 80, reps: 8 }), { code: ErrorCode.notFound });
  assert.equal((await repository.counts()).sets, 0);
});

test('only one open session can exist at a time', async () => {
  const { repository, plan, session } = await openSessionWithBench();
  await assert.rejects(repository.startSession({ planId: plan.id }), { code: ErrorCode.openSessionExists });
  await assert.rejects(repository.startSession(), { code: ErrorCode.openSessionExists });
  assert.equal((await repository.counts()).sessions, 1);
  await repository.endSession(session.id);
  await repository.startSession();
  assert.equal((await repository.counts()).sessions, 2);
});

test('two sessions started at the same moment still produce only one', async () => {
  const { repository } = await freshRepository();
  const results = await Promise.allSettled([repository.startSession(), repository.startSession(), repository.startSession()]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.ok(results.filter((result) => result.status === 'rejected').every((result) => result.reason.code === ErrorCode.openSessionExists));
  assert.equal((await repository.counts()).sessions, 1);
});

test('a session that fails halfway leaves nothing behind', async () => {
  const { repository, indexedDB } = await freshRepository();
  const exercises = await repository.listExercises();
  const custom = await repository.createExercise({
    name: 'Exercício temporário',
    primaryMuscle: MuscleGroup.chest,
    equipment: Equipment.machine,
    movementPattern: MovementPattern.horizontalPush,
  });
  const plan = await repository.createPlan({ name: 'B' });
  await repository.addExerciseToPlan(plan.id, {
    exerciseId: exerciseByKey(exercises, 'supino-reto-barra').id, prescribedSets: 3, repMin: 8, repMax: 10, restSeconds: 90,
  });
  await repository.addExerciseToPlan(plan.id, { exerciseId: custom.id, prescribedSets: 3, repMin: 8, repMax: 10, restSeconds: 90 });

  // Simulate a corrupted reference: the second plan exercise points to a missing exercise.
  const { Store } = await import('../../src/data/database.js');
  const { runTransaction, requestToPromise } = await import('../../src/data/idb.js');
  const db = await new Promise((resolve) => {
    const request = indexedDB.open('loadlog-test');
    request.onsuccess = () => resolve(request.result);
  });
  await runTransaction(db, [Store.exercises], 'readwrite', (transaction) =>
    requestToPromise(transaction.objectStore(Store.exercises).delete(custom.id)),
  );
  db.close();

  await assert.rejects(repository.startSession({ planId: plan.id }), { code: ErrorCode.notFound });
  const counts = await repository.counts();
  assert.equal(counts.sessions, 0, 'the session row was rolled back');
  assert.equal(counts.sessionExercises, 0, 'the first exercise snapshot was rolled back');
  assert.equal(await repository.getOpenSession(), null);
});

test('a failed write does not affect later writes', async () => {
  const { repository, benchEntry } = await openSessionWithBench();
  await assert.rejects(repository.addSet(benchEntry.id, { load: 2.3, reps: 8 }));
  const set = await repository.addSet(benchEntry.id, { load: 80, reps: 8 });
  assert.equal(set.sortOrder, 0);
});

test('invalid plan prescriptions are rejected', async () => {
  const { repository } = await freshRepository();
  const plan = await repository.createPlan({ name: 'C' });
  const exerciseId = (await repository.listExercises())[0].id;
  const base = { exerciseId, prescribedSets: 4, repMin: 6, repMax: 8, restSeconds: 120 };
  for (const change of [{ prescribedSets: 0 }, { repMin: 0 }, { repMin: 9 }, { repMax: 101 }, { restSeconds: -1 }, { restSeconds: 1.5 }]) {
    await assert.rejects(repository.addExerciseToPlan(plan.id, { ...base, ...change }), { code: ErrorCode.validation }, JSON.stringify(change));
  }
  await assert.rejects(repository.addExerciseToPlan(plan.id, { ...base, exerciseId: crypto.randomUUID() }), { code: ErrorCode.notFound });
  await assert.rejects(repository.addExerciseToPlan(crypto.randomUUID(), base), { code: ErrorCode.notFound });
  assert.equal((await repository.counts()).planExercises, 0);
});

test('blank or overly long names are rejected; names are trimmed', async () => {
  const { repository } = await freshRepository();
  for (const name of ['', '   ', 'x'.repeat(81), null, 42]) {
    await assert.rejects(repository.createPlan({ name }), { code: ErrorCode.validation }, String(name));
  }
  assert.equal((await repository.createPlan({ name: '  A — Upper  ' })).name, 'A — Upper');
});

test('invalid custom exercises are rejected', async () => {
  const { repository } = await freshRepository();
  const base = { name: 'Teste', primaryMuscle: MuscleGroup.chest, equipment: Equipment.machine, movementPattern: MovementPattern.isolation };
  const bad = [
    { primaryMuscle: 'pescoço' },
    { equipment: 'kettlebell' },
    { movementPattern: 'jump' },
    { secondaryMuscles: [MuscleGroup.chest] },
    { secondaryMuscles: [MuscleGroup.triceps, MuscleGroup.triceps] },
    { incrementOverride: 0 },
    { incrementOverride: 1.1 },
    { source: 'builtin' },
  ];
  const before = (await repository.counts()).exercises;
  for (const change of bad) {
    await assert.rejects(repository.createExercise({ ...base, ...change }), { code: ErrorCode.validation }, JSON.stringify(change));
  }
  assert.equal((await repository.counts()).exercises, before);
});

test('an exercise used by a plan cannot be deleted', async () => {
  const { repository } = await freshRepository();
  const { bench } = await makeUpperPlan(repository);
  await assert.rejects(repository.deleteExercise(bench.id), { code: ErrorCode.inUse });
});

test('session times must be consistent', async () => {
  const { repository } = await freshRepository();
  const start = Date.UTC(2026, 4, 1, 18);
  const session = await repository.startSession({ startedAt: start });
  await assert.rejects(repository.endSession(session.id, start - 1), { code: ErrorCode.validation });
  await repository.endSession(session.id, start + 1000);
  await assert.rejects(repository.updateSessionStart(session.id, start + 2000), { code: ErrorCode.validation });
  await assert.rejects(repository.startSession({ startedAt: 'ontem' }), { code: ErrorCode.validation });
});

test('operations on missing records fail with notFound and change nothing', async () => {
  const { repository } = await freshRepository();
  const { plan } = await makeUpperPlan(repository);
  await logSession(repository, plan.id);
  const before = await repository.counts();
  const missing = crypto.randomUUID();
  for (const call of [
    () => repository.deleteSession(missing),
    () => repository.endSession(missing),
    () => repository.deletePlan(missing),
    () => repository.renamePlan(missing, 'X'),
    () => repository.deleteExercise(missing),
    () => repository.deleteSet(missing),
    () => repository.updateSet(missing, { reps: 5 }),
    () => repository.startSession({ planId: missing }),
  ]) {
    await assert.rejects(call(), { code: ErrorCode.notFound });
  }
  assert.deepEqual(await repository.counts(), before);
});

test('editing a set re-validates every field', async () => {
  const { repository, benchEntry } = await openSessionWithBench();
  const set = await repository.addSet(benchEntry.id, { load: 80, reps: 8 });
  await assert.rejects(repository.updateSet(set.id, { load: 80.1 }), { code: ErrorCode.validation });
  await assert.rejects(repository.updateSet(set.id, { type: SetType.dropSet }), { code: ErrorCode.validation });
  const updated = await repository.updateSet(set.id, { load: 82.5, reps: 7, rir: 2 });
  assert.deepEqual([updated.load, updated.reps, updated.rir, updated.sessionExerciseId], [82.5, 7, 2, benchEntry.id]);
});

test('data written before closing is there after reopening (app killed mid-session)', async () => {
  const { repository, indexedDB } = await freshRepository();
  const { plan } = await makeUpperPlan(repository);
  const session = await repository.startSession({ planId: plan.id });
  const detail = await repository.getSessionDetail(session.id);
  await repository.addSet(detail.exercises[0].id, { load: 80, reps: 8 });
  repository.close();

  const reopened = await openRepository({ name: 'loadlog-test', indexedDB });
  const open = await reopened.getOpenSession();
  assert.equal(open?.id, session.id);
  assert.equal((await reopened.getSessionDetail(session.id)).exercises[0].sets[0].load, 80);
});

test('opening without IndexedDB reports storage as unavailable', async () => {
  await assert.rejects(openRepository({ indexedDB: null }), { code: ErrorCode.storageUnavailable });
});
