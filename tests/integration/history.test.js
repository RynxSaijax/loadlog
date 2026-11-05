// Phase 5 acceptance on data: the sample generator produces data for every
// history chart, and history editing keeps the database consistent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshRepository, logSession, makeUpperPlan } from './helpers.js';
import { generateSampleData } from '../../src/dev/sample-data.js';
import { toSnapshots } from '../../src/data/session-snapshots.js';
import { ErrorCode } from '../../src/data/errors.js';
import { compareWithPrevious, consistencyCalendar, exerciseOverview, groupByWeek, recentRecords, weekStatus, weeklyVolume } from '../../src/features/history/analysis.js';

const NOW = new Date(2026, 10, 4, 21, 0).getTime(); // Wednesday

async function snapshotsOf(repository) {
  const exercises = await repository.listExercises({ includeArchived: true });
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const details = (await repository.listSessionDetails()).filter((detail) => detail.endedAt !== null);
  return { snapshots: toSnapshots(details, byId), byId, details };
}

test('sample data feeds every history screen and chart', async () => {
  const { repository } = await freshRepository();
  const counts = await generateSampleData(repository, NOW);
  assert.equal(counts.plans, 3);
  assert.ok(counts.sessions >= 25, `sessions ${counts.sessions}`);
  const { snapshots, byId } = await snapshotsOf(repository);
  assert.equal(snapshots.length, counts.sessions);
  assert.ok(snapshots.every((session) => session.endedAt > session.startedAt));
  assert.ok(snapshots.every((session) => session.startedAt < NOW));

  // Weeks: 9 of the 10 have sessions (one week off).
  assert.equal(groupByWeek(snapshots).length, 9);

  // Exercise screen: bench has a chart with ≥ 3 points and a rising 1RM.
  const bench = [...byId.values()].find((exercise) => exercise.builtinKey === 'supino-reto-barra');
  const overview = exerciseOverview(snapshots, bench.id);
  assert.ok(overview.chart.length >= 8);
  assert.ok(overview.chart.at(-1).oneRepMax > overview.chart[0].oneRepMax);
  assert.ok(overview.chart.every((point) => point.averageLoad > 0));

  // A stagnation alert exists for the knee extension.
  const extension = [...byId.values()].find((exercise) => exercise.builtinKey === 'cadeira-extensora');
  assert.equal(exerciseOverview(snapshots, extension.id).byPlan[0].stagnation.isStagnant, true);

  // Comparison: the latest plan session has a previous one for each exercise.
  const latestPlanned = [...snapshots].filter((session) => session.planId).sort((a, b) => b.startedAt - a.startedAt)[0];
  const comparison = compareWithPrevious(snapshots, latestPlanned.sessionId);
  assert.ok(comparison.rows.length === 3 && comparison.rows.every((row) => row.previous && row.deltas));

  // Weekly volume with trends for the main groups.
  const volume = weeklyVolume(snapshots, NOW);
  for (const group of ['chest', 'back', 'quads']) {
    const entry = volume.find((candidate) => candidate.group === group);
    assert.ok(entry, group);
    assert.ok(entry.trend, `trend for ${group}`);
    assert.ok(entry.average.sets > 0);
  }

  // Heatmap and Início numbers.
  const calendar = consistencyCalendar(snapshots, NOW);
  assert.equal(calendar.totalSessions, counts.sessions);
  const status = weekStatus(snapshots, NOW);
  assert.ok(status.sessionsThisWeek >= 1);
  assert.ok(status.weekStreak >= 3);
  assert.ok(recentRecords(snapshots, NOW).length > 0);
  // Drop-sets and warmups are present.
  const allSets = snapshots.flatMap((session) => session.exercises.flatMap((exercise) => exercise.sets));
  assert.ok(allSets.some((set) => set.type === 'dropSet'));
  assert.ok(allSets.some((set) => set.type === 'warmup'));
  assert.ok(snapshots.some((session) => session.planId === null));
});

test('sample data refuses to run with an open session and never reuses plan names', async () => {
  const { repository } = await freshRepository();
  await generateSampleData(repository, NOW);
  const second = await generateSampleData(repository, NOW);
  assert.equal(second.plans, 3);
  const names = (await repository.listPlans()).map((plan) => plan.name);
  assert.equal(new Set(names).size, 6);
  assert.ok(names.includes('Exemplo A — Peito e tríceps (2)'));
  await repository.startSession({ planId: null });
  await assert.rejects(generateSampleData(repository, NOW), { code: ErrorCode.openSessionExists });
});

test('updateSessionTimes edits both times at once and rejects invalid changes without writing', async () => {
  const { repository } = await freshRepository();
  const { plan } = await makeUpperPlan(repository);
  const start = Date.UTC(2026, 9, 1, 18);
  const session = await logSession(repository, plan.id, { startedAt: start });
  // Move the whole session two hours later: start after the old end works in one step.
  const moved = await repository.updateSessionTimes(session.id, { startedAt: start + 2 * 3_600_000, endedAt: start + 3 * 3_600_000 });
  assert.equal(moved.startedAt, start + 2 * 3_600_000);
  await assert.rejects(repository.updateSessionTimes(session.id, { startedAt: start + 10, endedAt: start }), { code: ErrorCode.validation });
  await assert.rejects(repository.updateSessionTimes(session.id, { startedAt: Number.NaN, endedAt: start }), { code: ErrorCode.validation });
  await assert.rejects(repository.updateSessionTimes('missing', { startedAt: start, endedAt: start + 1 }), { code: ErrorCode.notFound });
  const stored = (await repository.listSessions())[0];
  assert.deepEqual([stored.startedAt, stored.endedAt], [start + 2 * 3_600_000, start + 3 * 3_600_000]);
  const open = await repository.startSession({ planId: null });
  await assert.rejects(repository.updateSessionTimes(open.id, { startedAt: start, endedAt: start + 1 }), { code: ErrorCode.validation });
});
