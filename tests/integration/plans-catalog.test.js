import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshRepository, makeUpperPlan, logSession, exerciseByKey } from './helpers.js';
import { ErrorCode } from '../../src/data/errors.js';
import { Equipment, MuscleGroup, MovementPattern, ExerciseSource } from '../../src/data/enums.js';

const custom = { name: 'Remada no aparelho X', primaryMuscle: MuscleGroup.back, equipment: Equipment.machine, movementPattern: MovementPattern.horizontalPull };

test('duplicating a plan copies its exercises and prescriptions, placed last', async () => {
  const { repository } = await freshRepository();
  const { plan } = await makeUpperPlan(repository);
  await repository.createPlan({ name: 'B' });
  const copy = await repository.duplicatePlan(plan.id, { name: 'A — Upper (cópia)' });
  const detail = await repository.getPlan(copy.id);
  const original = await repository.getPlan(plan.id);
  assert.equal(copy.sortOrder, 2);
  assert.deepEqual(
    detail.exercises.map((item) => [item.exerciseId, item.prescribedSets, item.repMin, item.repMax, item.restSeconds, item.sortOrder]),
    original.exercises.map((item) => [item.exerciseId, item.prescribedSets, item.repMin, item.repMax, item.restSeconds, item.sortOrder]),
  );
  assert.ok(detail.exercises.every((item) => !original.exercises.some((other) => other.id === item.id)), 'new ids');
  await repository.updatePlanExercise(detail.exercises[0].id, { prescribedSets: 5 });
  assert.equal((await repository.getPlan(plan.id)).exercises[0].prescribedSets, 4, 'editing the copy leaves the original alone');
});

test('reordering plans and plan exercises', async () => {
  const { repository } = await freshRepository();
  const { plan } = await makeUpperPlan(repository);
  const b = await repository.createPlan({ name: 'B' });
  const c = await repository.createPlan({ name: 'C' });
  await repository.reorderPlans([c.id, plan.id, b.id]);
  assert.deepEqual((await repository.listPlans()).map((item) => item.name), ['C', 'A — Upper', 'B']);

  const items = (await repository.getPlan(plan.id)).exercises.map((item) => item.id);
  await repository.reorderPlanExercises(plan.id, [...items].reverse());
  assert.deepEqual((await repository.getPlan(plan.id)).exercises.map((item) => item.id), [...items].reverse());
});

test('reordering with a partial, repeated or foreign list is rejected and changes nothing', async () => {
  const { repository } = await freshRepository();
  const { plan } = await makeUpperPlan(repository);
  const b = await repository.createPlan({ name: 'B' });
  for (const order of [[plan.id], [plan.id, plan.id], [plan.id, crypto.randomUUID()], [plan.id, b.id, crypto.randomUUID()]]) {
    await assert.rejects(repository.reorderPlans(order), { code: ErrorCode.validation });
  }
  assert.deepEqual((await repository.listPlans()).map((item) => item.id), [plan.id, b.id]);
  await assert.rejects(repository.reorderPlanExercises(crypto.randomUUID(), []), { code: ErrorCode.notFound });
});

test('updating a plan exercise validates the prescription', async () => {
  const { repository } = await freshRepository();
  const { plan } = await makeUpperPlan(repository);
  const item = (await repository.getPlan(plan.id)).exercises[0];
  await assert.rejects(repository.updatePlanExercise(item.id, { repMin: 10, repMax: 8 }), { code: ErrorCode.validation });
  await assert.rejects(repository.updatePlanExercise(item.id, { prescribedSets: 21 }), { code: ErrorCode.validation });
  const updated = await repository.updatePlanExercise(item.id, { prescribedSets: 5, repMin: 3, repMax: 5, restSeconds: 180 });
  assert.deepEqual([updated.prescribedSets, updated.repMin, updated.repMax, updated.restSeconds], [5, 3, 5, 180]);
});

test('custom exercise names must be unique, ignoring accents and case', async () => {
  const { repository } = await freshRepository();
  await assert.rejects(repository.createExercise({ ...custom, name: 'supino RETO com barra' }), { code: ErrorCode.duplicateName });
  await assert.rejects(repository.createExercise({ ...custom, name: 'Triceps na polia com corda' }), { code: ErrorCode.duplicateName });
  const created = await repository.createExercise(custom);
  await assert.rejects(repository.createExercise({ ...custom, name: '  remada no APARELHO x ' }), { code: ErrorCode.duplicateName });
  const renamed = await repository.updateExercise(created.id, { name: 'Remada no aparelho X ' });
  assert.equal(renamed.name, 'Remada no aparelho X');
});

test('built-in exercises only accept a new increment', async () => {
  const { repository } = await freshRepository();
  const bench = exerciseByKey(await repository.listExercises(), 'supino-reto-barra');
  await assert.rejects(repository.updateExercise(bench.id, { name: 'Outro nome' }), { code: ErrorCode.validation });
  await assert.rejects(repository.updateExercise(bench.id, { incrementOverride: 1.1 }), { code: ErrorCode.validation });
  assert.equal((await repository.updateExercise(bench.id, { incrementOverride: 1.25 })).incrementOverride, 1.25);
  assert.equal((await repository.updateExercise(bench.id, { incrementOverride: null })).incrementOverride, null);
  assert.equal((await repository.getExercise(bench.id)).name, 'Supino reto com barra');
});

test('custom exercises can be fully edited, but not turned into built-ins', async () => {
  const { repository } = await freshRepository();
  const created = await repository.createExercise(custom);
  const updated = await repository.updateExercise(created.id, { primaryMuscle: MuscleGroup.lowerBack, secondaryMuscles: [MuscleGroup.glutes], source: ExerciseSource.builtin });
  assert.equal(updated.primaryMuscle, MuscleGroup.lowerBack);
  assert.equal(updated.source, ExerciseSource.custom);
});

test('import inserts in one go, skips names already stored, and a repeat import adds nothing', async () => {
  const { repository } = await freshRepository();
  const before = (await repository.counts()).exercises;
  const items = [
    { ...custom, name: 'Novo A' },
    { ...custom, name: 'Novo B' },
    { ...custom, name: 'novo a' },
    { ...custom, name: 'Supino reto com barra' },
  ];
  assert.deepEqual(await repository.importExercises(items), { inserted: 2, skipped: 2 });
  assert.deepEqual(await repository.importExercises(items), { inserted: 0, skipped: 4 });
  assert.equal((await repository.counts()).exercises, before + 2);
  const imported = (await repository.listExercises()).filter((exercise) => exercise.source === ExerciseSource.imported);
  assert.deepEqual(imported.map((exercise) => exercise.name).sort(), ['Novo A', 'Novo B']);
});

test('an import with one invalid item imports nothing', async () => {
  const { repository } = await freshRepository();
  const before = (await repository.counts()).exercises;
  await assert.rejects(repository.importExercises([{ ...custom, name: 'Válido' }, { ...custom, name: 'Inválido', equipment: 'kettlebell' }]), { code: ErrorCode.validation });
  assert.equal((await repository.counts()).exercises, before);
});

test('the free-exercise-db file imports completely, and a second time adds nothing', async () => {
  const { readFile } = await import('node:fs/promises');
  const { parseImportFile } = await import('../../src/data/import/parse.js');
  const { suggestMapping } = await import('../../src/data/import/mapping.js');
  const { buildReview } = await import('../../src/data/import/review.js');
  const { repository } = await freshRepository();
  const parsed = parseImportFile(await readFile(new URL('../fixtures/free-exercise-db.json', import.meta.url), 'utf8'), 'exercises.json');
  const mapping = suggestMapping(parsed.fields);

  const first = buildReview(parsed.records, mapping, await repository.listExercises({ includeArchived: true }));
  const selected = first.filter((entry) => entry.selected).map((entry) => entry.item);
  const result = await repository.importExercises(selected);
  assert.deepEqual(result, { inserted: selected.length, skipped: 0 });

  const second = buildReview(parsed.records, mapping, await repository.listExercises({ includeArchived: true }));
  assert.equal(second.filter((entry) => entry.selected).length, 0);
  assert.deepEqual(await repository.findOrphans(), { sets: [], sessionExercises: [], planExercises: [] });
});

test('a plan with history keeps its name snapshot after duplication and archiving', async () => {
  const { repository } = await freshRepository();
  const { plan } = await makeUpperPlan(repository);
  const session = await logSession(repository, plan.id);
  await repository.duplicatePlan(plan.id, { name: 'Cópia' });
  await repository.setPlanArchived(plan.id, true);
  assert.equal((await repository.getSessionDetail(session.id)).planNameSnapshot, 'A — Upper');
});
