import { test } from 'node:test';
import assert from 'node:assert/strict';
import { set, exercise, session, at } from './metrics-fixtures.js';
import {
  compareWithPrevious, consistencyCalendar, exerciseOverview, groupByWeek, recentRecords, sessionTotals, weekStatus, weeklyVolume,
} from '../../src/features/history/analysis.js';

const bench = (sets) => exercise('bench', sets, { primaryMuscle: 'chest', secondaryMuscles: ['triceps'] });
const row = (sets) => exercise('row', sets, { primaryMuscle: 'back', secondaryMuscles: ['biceps'] });

test('sessionTotals: duration, effective sets (drop-set = 1, warmup out), tonnage with every drop step', () => {
  const s = session('s1', at(2026, 3, 2, 18), [bench([set(40, 10, 'warmup'), set(80, 8), set(70, 8, 'dropSet', 'g'), set(60, 6, 'dropSet', 'g')]), row([set(60, 10)])], { endedAt: at(2026, 3, 2, 19, 5) });
  assert.deepEqual(sessionTotals(s), { durationMs: 65 * 60_000, effectiveSets: 3, tonnage: 640 + 560 + 360 + 600, exerciseCount: 2 });
});

test('groupByWeek: ISO weeks newest first, filter by plan and by "no plan"', () => {
  const sessions = [
    session('mon', at(2026, 3, 2, 18), [], { planId: 'a' }), // Monday W10
    session('sun', at(2026, 3, 8, 10), [], { planId: 'b' }), // Sunday W10
    session('next', at(2026, 3, 9, 7), [], { planId: null }), // Monday W11
  ];
  const all = groupByWeek(sessions);
  assert.deepEqual(all.map((week) => [week.key, week.sessions.map((s) => s.sessionId)]), [['2026-W11', ['next']], ['2026-W10', ['sun', 'mon']]]);
  assert.deepEqual(groupByWeek(sessions, { planId: 'a' }).map((week) => week.key), ['2026-W10']);
  assert.deepEqual(groupByWeek(sessions, { planId: null })[0].sessions.map((s) => s.sessionId), ['next']);
  assert.deepEqual(groupByWeek([], {}), []);
});

test('exerciseOverview: records cross plans, chart points per session, progress and stagnation per plan', () => {
  const sessions = [
    session('a1', at(2026, 1, 5), [bench([set(80, 8), set(80, 7)])], { planId: 'A' }),
    session('b1', at(2026, 1, 7), [bench([set(85, 5)])], { planId: 'B' }),
    session('a2', at(2026, 1, 12), [bench([set(80, 8), set(80, 6)])], { planId: 'A' }),
    session('a3', at(2026, 1, 19), [bench([set(77.5, 8)])], { planId: 'A' }),
    session('a4', at(2026, 1, 26), [bench([set(77.5, 7)])], { planId: 'A' }),
    session('x', at(2026, 1, 27), [bench([set(20, 15)])], { planId: null }),
  ];
  const overview = exerciseOverview(sessions, 'bench');
  assert.equal(overview.executions.length, 6);
  assert.equal(overview.last.sessionId, 'x');
  assert.equal(overview.bestSet.load, 85);
  assert.equal(overview.records.maxLoad.load, 85);
  // Best confident e1RM: 80 × 8 → 101.33; 85 × 5 → 99.17.
  assert.equal(Math.round(overview.records.bestOneRepMax.value * 100) / 100, 101.33);
  assert.deepEqual(overview.records.repsAtLoad.map((s) => [s.load, s.reps]), [[85, 5], [80, 8], [77.5, 8], [20, 15]]);
  // Session with only > 12 reps: flagged low confidence.
  assert.equal(overview.chart.at(-1).lowConfidence, true);
  assert.equal(overview.chart[0].averageLoad, 80);
  const planA = overview.byPlan.find((entry) => entry.planId === 'A');
  assert.equal(planA.sessions, 4);
  assert.equal(planA.lastProgress, false);
  assert.deepEqual(planA.stagnation, { isStagnant: true, streak: 3 });
  const planB = overview.byPlan.find((entry) => entry.planId === 'B');
  assert.equal(planB.lastProgress, null);
  assert.equal(overview.byPlan.length, 2);
});

test('exerciseOverview: no history gives empty results', () => {
  const overview = exerciseOverview([session('a', at(2026, 1, 5), [row([set(60, 10)])])], 'bench');
  assert.deepEqual(overview.executions, []);
  assert.equal(overview.bestSet, null);
  assert.equal(overview.last, null);
});

test('compareWithPrevious: same plan only, deltas with ±1% direction, ad-hoc has no previous', () => {
  const sessions = [
    session('a1', at(2026, 1, 5), [bench([set(80, 8)]), row([set(60, 10)])], { planId: 'A' }),
    session('b1', at(2026, 1, 8), [bench([set(100, 8)])], { planId: 'B' }),
    session('a2', at(2026, 1, 12), [bench([set(82.5, 8)]), row([set(60, 10)]), exercise('curl', [set(30, 10)])], { planId: 'A' }),
    session('x', at(2026, 1, 13), [bench([set(80, 8)])], { planId: null }),
  ];
  const result = compareWithPrevious(sessions, 'a2');
  assert.equal(result.hasPrevious, true);
  const [b, r, c] = result.rows;
  assert.equal(b.previous.sessionId, 'a1');
  assert.equal(b.progress, true);
  assert.deepEqual(b.deltas.load, { value: 2.5, direction: 'up' });
  assert.deepEqual(b.deltas.reps, { value: 0, direction: 'flat' });
  assert.equal(r.progress, false);
  assert.equal(r.deltas.tonnage.direction, 'flat');
  assert.equal(c.previous, null);
  assert.equal(c.deltas, null);
  assert.equal(compareWithPrevious(sessions, 'x').hasPrevious, false);
  assert.equal(compareWithPrevious(sessions, 'missing'), null);
  // First session of a plan has nothing to compare.
  assert.equal(compareWithPrevious(sessions, 'a1').hasPrevious, false);
});

test('weeklyVolume: current/previous/average and trends need 3 weekly points', () => {
  const now = at(2026, 3, 18, 12); // Wednesday, W12
  const twoWeeks = [
    session('w10', at(2026, 3, 3), [bench([set(80, 8), set(80, 8)])]),
    session('w11', at(2026, 3, 10), [bench([set(80, 8), set(80, 8), set(80, 8)])]),
    session('w12', at(2026, 3, 17), [bench([set(80, 8)])]),
  ];
  const result = weeklyVolume(twoWeeks, now);
  const chest = result.find((entry) => entry.group === 'chest');
  assert.equal(chest.current.sets, 1);
  assert.equal(chest.previous.sets, 3);
  assert.equal(chest.average.sets, (2 + 3) / 4);
  assert.equal(chest.trend, null, 'only 2 complete weeks');
  const triceps = result.find((entry) => entry.group === 'triceps');
  assert.equal(triceps.previous.sets, 1.5);

  const withThird = [session('w9', at(2026, 2, 24), [bench([set(80, 8)])]), ...twoWeeks];
  const chest3 = weeklyVolume(withThird, now).find((entry) => entry.group === 'chest');
  assert.deepEqual(chest3.weekly.map((point) => point.y), [1, 2, 3]);
  assert.equal(chest3.trend.direction, 'up');
  assert.equal(chest3.trend.slope, 1);

  // A gap week counts as 0.
  const gap = [session('w8', at(2026, 2, 17), [bench([set(80, 8), set(80, 8)])]), session('w11', at(2026, 3, 10), [bench([set(80, 8), set(80, 8)])])];
  const chestGap = weeklyVolume(gap, now).find((entry) => entry.group === 'chest');
  assert.deepEqual(chestGap.weekly.map((point) => point.y), [2, 0, 0, 2]);
  assert.equal(chestGap.trend.direction, 'flat');
  assert.deepEqual(weeklyVolume([], now), []);
});

test('consistencyCalendar: 16 Monday-first weeks, counts per day, future days marked', () => {
  const now = at(2026, 3, 18, 12); // Wednesday
  const calendar = consistencyCalendar([session('a', at(2026, 3, 16, 7), []), session('b', at(2026, 3, 16, 19), []), session('c', at(2025, 10, 1), [])], now);
  assert.equal(calendar.columns.length, 16);
  const last = calendar.columns.at(-1);
  assert.equal(new Date(last.days[0].date).getDay(), 1);
  assert.equal(last.days[0].count, 2);
  assert.equal(last.days[2].future, false);
  assert.equal(last.days[3].future, true);
  assert.equal(calendar.activeDays, 1, 'the October session is outside the 16 weeks');
  assert.equal(calendar.totalSessions, 2);
});

test('weekStatus: sessions this week, trained days and week streak', () => {
  const now = at(2026, 3, 18, 12); // Wednesday W12
  const sessions = [
    session('a', at(2026, 3, 2), []), // W10
    session('b', at(2026, 3, 11), []), // W11
    session('c', at(2026, 3, 16), []), // Mon W12
    session('d', at(2026, 3, 18, 7), []), // Wed W12
  ];
  assert.deepEqual(weekStatus(sessions, now), { sessionsThisWeek: 2, trainedDays: [0, 2], weekStreak: 3, weekStart: at(2026, 3, 16, 0) });
  // Nothing yet this week: the streak still counts the weeks before.
  assert.equal(weekStatus(sessions.slice(0, 2), now).weekStreak, 2);
  assert.equal(weekStatus([session('old', at(2026, 2, 1), [])], now).weekStreak, 0);
});

test('recentRecords: last 30 days, newest first, first-ever set is not a record', () => {
  const now = at(2026, 3, 31);
  const sessions = [
    session('old', at(2026, 1, 5), [bench([set(80, 8)])]),
    session('s1', at(2026, 3, 10), [bench([set(82.5, 8)]), row([set(60, 10)])]),
    session('s2', at(2026, 3, 20), [bench([set(82.5, 9), set(40, 5, 'warmup')])]),
  ];
  const records = recentRecords(sessions, now);
  assert.deepEqual(records.map((record) => [record.sessionId, record.exerciseId, record.types]), [
    ['s2', 'bench', ['repsAtLoad', 'estimatedOneRepMax']],
    ['s1', 'bench', ['maxLoad', 'estimatedOneRepMax']],
  ]);
  assert.deepEqual(recentRecords(sessions, at(2026, 6, 30)), []);
});
