// Phase 6 acceptance on data: backup → erase → restore → identical counts,
// plus every way a restore can fail without changing anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshRepository } from './helpers.js';
import { generateSampleData } from '../../src/dev/sample-data.js';
import { makeBackup, parseBackup, BACKUP_SCHEMA_VERSION, backupFileName } from '../../src/data/backup.js';
import { ErrorCode } from '../../src/data/errors.js';

const NOW = new Date(2026, 10, 4, 21, 0).getTime();

async function seeded() {
  const { repository } = await freshRepository();
  await generateSampleData(repository, NOW);
  await repository.setMeta('settings', { showRir: true, haptics: false, defaultRestSeconds: 90 });
  await repository.setMeta('restTimer', { endsAt: NOW + 1000, total: 90, label: 'x' });
  // One open session with a set, as in real use.
  const open = await repository.startSession({ planId: null, startedAt: NOW - 600_000 });
  const exercise = (await repository.listExercises())[0];
  const item = await repository.addExerciseToSession(open.id, exercise.id);
  await repository.addSet(item.id, { load: 20, reps: 10, rir: 2, completedAt: NOW - 300_000 });
  return repository;
}

const sortById = (records) => [...records].sort((a, b) => (a.id < b.id ? -1 : 1));

test('round trip: backup → erase everything → restore → identical counts and records', async () => {
  const repository = await seeded();
  const before = await repository.counts();
  const dumpBefore = await repository.exportAll();
  const text = JSON.stringify(makeBackup(dumpBefore, { now: NOW, appVersion: '1.0.0' }));

  await repository.clearAll();
  await repository.seedCatalog();
  const erased = await repository.counts();
  assert.equal(erased.sessions, 0);
  assert.equal(erased.sets, 0);
  assert.equal(erased.plans, 0);

  const parsed = parseBackup(text);
  assert.deepEqual(parsed.counts, { exercises: before.exercises, plans: before.plans, sessions: before.sessions, sets: before.sets });
  await repository.replaceAll(parsed.data);
  await repository.seedCatalog();
  const after = await repository.counts();
  // The rest timer is device state, not part of a backup.
  assert.deepEqual({ ...after, meta: undefined }, { ...before, meta: undefined });
  assert.equal(after.meta, 1);

  const dumpAfter = await repository.exportAll();
  for (const store of ['exercises', 'plans', 'planExercises', 'sessions', 'sessionExercises', 'sets']) {
    assert.deepEqual(sortById(dumpAfter[store]), sortById(dumpBefore[store]), store);
  }
  assert.deepEqual(dumpAfter.meta, [{ key: 'settings', value: { showRir: true, haptics: false, defaultRestSeconds: 90 } }]);
  assert.deepEqual(await repository.findOrphans(), { sets: [], sessionExercises: [], planExercises: [] });
  assert.ok(await repository.getOpenSession());
});

test('backup format: version, metadata and file name', async () => {
  const repository = await seeded();
  const backup = makeBackup(await repository.exportAll(), { now: NOW, appVersion: '1.0.0' });
  assert.equal(backup.format, 'loadlog-backup');
  assert.equal(backup.schemaVersion, BACKUP_SCHEMA_VERSION);
  assert.equal(backup.appVersion, '1.0.0');
  assert.equal(backup.exportedAt, new Date(NOW).toISOString());
  assert.equal(backupFileName(NOW), 'loadlog-backup-2026-11-04.json');
  // A BOM (some editors add one) is accepted.
  assert.ok(parseBackup(`\uFEFF${JSON.stringify(backup)}`).counts.sets > 0);
});

test('invalid backups are rejected with a reason and the database is untouched', async () => {
  const repository = await seeded();
  const before = await repository.exportAll();
  const good = makeBackup(before, { now: NOW, appVersion: '1.0.0' });
  const clone = () => JSON.parse(JSON.stringify(good));
  const cases = [
    ['', 'empty'],
    ['{not json', 'notJson'],
    [JSON.stringify({ hello: 'world' }), 'notBackup'],
    [JSON.stringify({ ...clone(), schemaVersion: 99 }), 'newerVersion'],
    [JSON.stringify({ ...clone(), schemaVersion: '1' }), 'notBackup'],
    [JSON.stringify({ ...clone(), data: { ...clone().data, sets: undefined } }), 'missingCollection'],
    [(() => { const b = clone(); b.data.sets[0].load = 1000.5; return JSON.stringify(b); })(), 'badRecord'],
    [(() => { const b = clone(); b.data.sets[0].load = 2.3; return JSON.stringify(b); })(), 'badRecord'],
    [(() => { const b = clone(); b.data.sets[0].reps = 0; return JSON.stringify(b); })(), 'badRecord'],
    [(() => { const b = clone(); b.data.sets[0].type = 'superset'; return JSON.stringify(b); })(), 'badRecord'],
    [(() => { const b = clone(); b.data.sets[0].sessionExerciseId = 'missing'; return JSON.stringify(b); })(), 'brokenReference'],
    [(() => { const b = clone(); b.data.sets[0].sessionId = b.data.sessions.at(-2).id; return JSON.stringify(b); })(), 'brokenReference'],
    [(() => { const b = clone(); b.data.planExercises[0].exerciseId = 'missing'; return JSON.stringify(b); })(), 'brokenReference'],
    [(() => { const b = clone(); b.data.sets.push({ ...b.data.sets[0] }); return JSON.stringify(b); })(), 'duplicateId'],
    [(() => { const b = clone(); b.data.sessions.forEach((s) => { s.endedAt = null; }); return JSON.stringify(b); })(), 'manyOpenSessions'],
    [(() => { const b = clone(); b.data.sessions[0].endedAt = b.data.sessions[0].startedAt - 1; return JSON.stringify(b); })(), 'badRecord'],
    [(() => { const b = clone(); b.data.exercises[0].primaryMuscle = 'neck'; return JSON.stringify(b); })(), 'badRecord'],
    [(() => { const b = clone(); b.data.plans[0] = null; return JSON.stringify(b); })(), 'badRecord'],
  ];
  for (const [text, reason] of cases) {
    assert.throws(() => parseBackup(text), (error) => error.code === ErrorCode.invalidBackup && error.details.reason === reason, reason);
  }
  assert.deepEqual(await repository.exportAll(), before);
});

test('replaceAll is atomic: a failing write leaves the previous data intact', async () => {
  const repository = await seeded();
  const before = await repository.exportAll();
  const parsed = parseBackup(JSON.stringify(makeBackup(before, { now: NOW })));
  // Two exercises with the same builtinKey break the unique index mid-transaction.
  const broken = { ...parsed.data, exercises: [...parsed.data.exercises, { ...parsed.data.exercises.find((e) => e.builtinKey), id: 'clash' }] };
  await assert.rejects(repository.replaceAll(broken));
  assert.deepEqual(await repository.exportAll(), before);
});

test('unknown fields are dropped and the rest timer never travels', async () => {
  const repository = await seeded();
  const backup = makeBackup(await repository.exportAll(), { now: NOW });
  assert.deepEqual(backup.data.meta.map((entry) => entry.key), ['settings']);
  backup.data.sets[0].evil = '<script>';
  backup.data.meta.push({ key: 'restTimer', value: {} });
  const parsed = parseBackup(JSON.stringify(backup));
  assert.equal('evil' in parsed.data.sets[0], false);
  assert.deepEqual(parsed.data.meta.map((entry) => entry.key), ['settings']);
});
