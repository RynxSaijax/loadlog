// Phase 1 acceptance criteria (spec section 9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshRepository, makeUpperPlan, logSession, exerciseByKey } from './helpers.js';
import { builtinCatalog } from '../../src/data/catalog.pt-BR.js';
import { ErrorCode } from '../../src/data/errors.js';
import { ExerciseSource, Equipment, MuscleGroup, MovementPattern } from '../../src/data/enums.js';

test('seed loads the whole catalog and running it again does not duplicate', async () => {
  const { repository } = await freshRepository();
  const first = await repository.counts();
  assert.equal(first.exercises, builtinCatalog.length);

  const again = await repository.seedCatalog();
  assert.equal(again.inserted, 0);
  assert.equal((await repository.counts()).exercises, builtinCatalog.length);

  await Promise.all([repository.seedCatalog(), repository.seedCatalog(), repository.seedCatalog()]);
  assert.equal((await repository.counts()).exercises, builtinCatalog.length);
});

test('seed only adds catalog items that are missing', async () => {
  const { repository } = await freshRepository();
  const extra = { ...builtinCatalog[0], builtinKey: 'novo-exercicio-teste', name: 'Novo exercício' };
  const result = await repository.seedCatalog([...builtinCatalog, extra]);
  assert.deepEqual(result, { inserted: 1, total: builtinCatalog.length + 1 });
});

test('seed survives closing and reopening the database', async () => {
  const { repository, indexedDB } = await freshRepository();
  repository.close();
  const { openRepository } = await import('../../src/data/repository.js');
  const reopened = await openRepository({ name: 'loadlog-test', indexedDB });
  await reopened.seedCatalog();
  assert.equal((await reopened.counts()).exercises, builtinCatalog.length);
});

test('catalog has about 100 valid exercises with unique keys and names', () => {
  assert.ok(builtinCatalog.length >= 95 && builtinCatalog.length <= 120, `${builtinCatalog.length}`);
  assert.equal(new Set(builtinCatalog.map((item) => item.builtinKey)).size, builtinCatalog.length);
  const normalized = builtinCatalog.map((item) => item.name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase());
  assert.equal(new Set(normalized).size, builtinCatalog.length);
  for (const item of builtinCatalog) {
    assert.ok(Object.values(MuscleGroup).includes(item.primaryMuscle), item.builtinKey);
    assert.ok(Object.values(Equipment).includes(item.equipment), item.builtinKey);
    assert.ok(Object.values(MovementPattern).includes(item.movementPattern), item.builtinKey);
  }
  for (const muscle of Object.values(MuscleGroup)) {
    assert.ok(builtinCatalog.some((item) => item.primaryMuscle === muscle), `no exercise for ${muscle}`);
  }
});

test('deleting a session cascades to its exercises and sets', async () => {
  const { repository } = await freshRepository();
  const { plan } = await makeUpperPlan(repository);
  const kept = await logSession(repository, plan.id, { startedAt: Date.UTC(2026, 0, 5, 18) });
  const removed = await logSession(repository, plan.id, { startedAt: Date.UTC(2026, 0, 8, 18) });

  const before = await repository.counts();
  assert.equal(before.sessions, 2);
  assert.equal(before.sessionExercises, 4);
  assert.equal(before.sets, 4);

  await repository.deleteSession(removed.id);
  const after = await repository.counts();
  assert.equal(after.sessions, 1);
  assert.equal(after.sessionExercises, 2);
  assert.equal(after.sets, 2);
  assert.equal((await repository.getSessionDetail(kept.id)).exercises.length, 2);
  assert.deepEqual(await repository.findOrphans(), { sets: [], sessionExercises: [], planExercises: [] });
});

test('deleting a plan without history cascades to its exercises', async () => {
  const { repository } = await freshRepository();
  const { plan } = await makeUpperPlan(repository);
  assert.equal((await repository.counts()).planExercises, 2);
  await repository.deletePlan(plan.id);
  const counts = await repository.counts();
  assert.equal(counts.plans, 0);
  assert.equal(counts.planExercises, 0);
});

test('the session snapshot survives renaming the plan', async () => {
  const { repository } = await freshRepository();
  const { plan } = await makeUpperPlan(repository);
  const session = await logSession(repository, plan.id);

  await repository.renamePlan(plan.id, 'A — Peito e costas');
  await repository.removeExerciseFromPlan((await repository.getPlan(plan.id)).exercises[0].id);

  const detail = await repository.getSessionDetail(session.id);
  assert.equal(detail.planNameSnapshot, 'A — Upper');
  assert.equal(detail.planId, plan.id);
  assert.equal(detail.exercises.length, 2);
  assert.equal(detail.exercises[0].exerciseNameSnapshot, 'Supino reto com barra');
  assert.equal(detail.exercises[0].prescribedSetsSnapshot, 4);
  assert.equal(detail.exercises[0].repMinSnapshot, 6);
  assert.equal(detail.exercises[0].repMaxSnapshot, 8);
  assert.equal((await repository.getPlan(plan.id)).name, 'A — Peito e costas');
});

test('an exercise with history cannot be deleted, only archived', async () => {
  const { repository } = await freshRepository();
  const { plan, bench } = await makeUpperPlan(repository);
  await logSession(repository, plan.id);

  await assert.rejects(repository.deleteExercise(bench.id), { code: ErrorCode.hasHistory });
  assert.equal(await repository.exerciseHasHistory(bench.id), true);
  assert.ok(await repository.getExercise(bench.id));

  await repository.setExerciseArchived(bench.id, true);
  const visible = await repository.listExercises();
  assert.ok(!visible.some((exercise) => exercise.id === bench.id));
  const all = await repository.listExercises({ includeArchived: true });
  assert.ok(all.some((exercise) => exercise.id === bench.id));
});

test('a plan with history cannot be deleted, only archived', async () => {
  const { repository } = await freshRepository();
  const { plan } = await makeUpperPlan(repository);
  await logSession(repository, plan.id);
  await assert.rejects(repository.deletePlan(plan.id), { code: ErrorCode.hasHistory });
  await repository.setPlanArchived(plan.id, true);
  assert.equal((await repository.listPlans()).length, 0);
  assert.equal((await repository.listPlans({ includeArchived: true })).length, 1);
  assert.equal((await repository.counts()).planExercises, 2);
});

test('an exercise without history can be deleted', async () => {
  const { repository } = await freshRepository();
  const custom = await repository.createExercise({
    name: 'Remada no aparelho X',
    primaryMuscle: MuscleGroup.back,
    secondaryMuscles: [MuscleGroup.biceps],
    equipment: Equipment.machine,
    movementPattern: MovementPattern.horizontalPull,
  });
  assert.equal(custom.source, ExerciseSource.custom);
  await repository.deleteExercise(custom.id);
  await assert.rejects(repository.getExercise(custom.id), { code: ErrorCode.notFound });
});

test('sessions are listed by startedAt, including retroactive ones', async () => {
  const { repository } = await freshRepository();
  const { plan } = await makeUpperPlan(repository);
  const late = await logSession(repository, plan.id, { startedAt: Date.UTC(2026, 2, 10, 18) });
  const retro = await logSession(repository, plan.id, { startedAt: Date.UTC(2026, 2, 3, 18) });
  const ordered = await repository.listSessions({ planId: plan.id });
  assert.deepEqual(ordered.map((session) => session.id), [retro.id, late.id]);

  await repository.updateSessionStart(late.id, Date.UTC(2026, 2, 1, 18));
  const reordered = await repository.listSessions();
  assert.deepEqual(reordered.map((session) => session.id), [late.id, retro.id]);
});

test('an ad-hoc session has no plan and accepts any exercise', async () => {
  const { repository } = await freshRepository();
  const exercises = await repository.listExercises();
  const session = await repository.startSession();
  assert.equal(session.planId, null);
  const squat = await repository.addExerciseToSession(session.id, exerciseByKey(exercises, 'agachamento-livre').id);
  assert.equal(squat.planExerciseId, null);
  assert.equal(squat.prescribedSetsSnapshot, null);
  await repository.addSet(squat.id, { load: 100, reps: 5 });
  assert.equal((await repository.getSessionDetail(session.id)).exercises[0].sets.length, 1);
});
