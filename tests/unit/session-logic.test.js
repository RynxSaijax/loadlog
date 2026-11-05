import { test } from 'node:test';
import assert from 'node:assert/strict';
import { set, exercise, session, at } from './metrics-fixtures.js';
import { prefill, extraSetNumber, stepLoad, lastTime, recordsForSet, sessionSummary, endTimeFor } from '../../src/features/workout/session-logic.js';

const bench = (sets, opts) => exercise('bench', sets, { primaryMuscle: 'chest', secondaryMuscles: ['triceps'], ...opts });

test('prefill: the previous set of the same exercise in this session wins', () => {
  const result = prefill({ currentSets: [set(80, 8), set(82.5, 6)], pastSessions: [], planId: 'plan-a', exerciseId: 'bench', startedAt: at(2026, 3, 1), repMin: 6 });
  assert.deepEqual(result, { load: 82.5, reps: 6, source: 'previousSet' });
});

test('prefill: first set takes the best effective set of the last session with the same plan', () => {
  const past = [
    session('old', at(2026, 2, 1), [bench([set(70, 10)])]),
    session('last', at(2026, 2, 20), [bench([set(100, 3, 'warmup'), set(80, 8), set(82.5, 5), set(82.5, 6)])]),
    session('other-plan', at(2026, 2, 25), [bench([set(120, 1)])], { planId: 'plan-b' }),
  ];
  assert.deepEqual(prefill({ currentSets: [], pastSessions: past, planId: 'plan-a', exerciseId: 'bench', startedAt: at(2026, 3, 1) }), { load: 82.5, reps: 6, source: 'lastSession' });
});

test('prefill: a retroactive session uses the last session before its own start', () => {
  const past = [session('feb', at(2026, 2, 1), [bench([set(70, 10)])]), session('mar', at(2026, 3, 10), [bench([set(90, 5)])])];
  assert.equal(prefill({ currentSets: [], pastSessions: past, planId: 'plan-a', exerciseId: 'bench', startedAt: at(2026, 3, 5) }).load, 70);
});

test('prefill: falls back to another plan, then to 0 kg × bottom of the range', () => {
  const past = [session('b', at(2026, 2, 1), [bench([set(60, 12)])], { planId: 'plan-b' })];
  assert.deepEqual(prefill({ currentSets: [], pastSessions: past, planId: 'plan-a', exerciseId: 'bench', startedAt: at(2026, 3, 1) }), { load: 60, reps: 12, source: 'otherPlan' });
  assert.deepEqual(prefill({ currentSets: [], pastSessions: past, planId: null, exerciseId: 'bench', startedAt: at(2026, 3, 1) }), { load: 60, reps: 12, source: 'otherPlan' });
  assert.deepEqual(prefill({ currentSets: [], pastSessions: [], planId: 'plan-a', exerciseId: 'bench', startedAt: 0, repMin: 6 }), { load: 0, reps: 6, source: 'none' });
  assert.deepEqual(prefill({ currentSets: [], pastSessions: [], planId: null, exerciseId: 'bench', startedAt: 0 }), { load: 0, reps: 8, source: 'none' });
});

test('last time: same plan only, ignoring sessions without effective sets', () => {
  const past = [
    session('a', at(2026, 2, 1), [bench([set(80, 8)])]),
    session('warm', at(2026, 2, 3), [bench([set(40, 10, 'warmup')])]),
    session('b', at(2026, 2, 4), [bench([set(100, 5)])], { planId: 'plan-b' }),
  ];
  const result = lastTime(past, 'plan-a', 'bench');
  assert.equal(result.sessionId, 'a');
  assert.deepEqual([result.best.load, result.best.reps], [80, 8]);
  assert.equal(lastTime(past, null, 'bench'), null);
});

test('extra set warning: counts effective sets only, a drop-set as one', () => {
  const sets = [set(40, 10, 'warmup'), set(80, 8), set(80, 8), set(70, 8, 'dropSet', 'g'), set(50, 8, 'dropSet', 'g')];
  assert.equal(extraSetNumber(sets, 4), null, 'next is the 4th');
  assert.equal(extraSetNumber([...sets, set(80, 6)], 4), 5);
  assert.equal(extraSetNumber([...sets, set(80, 6)], 4, { inDropSet: true }), null, 'a drop step is not a new set');
  assert.equal(extraSetNumber(sets, null), null, 'ad-hoc: no prescription');
});

test('± uses the increment, keeps quarter-kilo steps and stays within 0–1000', () => {
  assert.equal(stepLoad(80, 2.5, 1), 82.5);
  assert.equal(stepLoad(80, 2, -1), 78);
  assert.equal(stepLoad(1, 2.5, -1), 0);
  assert.equal(stepLoad(999, 5, 1), 1000);
  assert.equal(stepLoad(0.1 + 0.2, 0.25, 1), 0.5);
});

test('records in the session: compared to earlier sessions of any plan and to earlier sets of the same session', () => {
  const past = [session('p', at(2026, 2, 1), [bench([set(100, 5)])], { planId: 'plan-b' })];
  const first = set(100, 6);
  const second = set(102.5, 3);
  const third = set(102.5, 3);
  const warm = set(140, 1, 'warmup');
  const current = session('c', at(2026, 3, 1), [bench([warm, first, second, third])], { endedAt: null });
  assert.deepEqual(recordsForSet(past, current, 'bench', first), ['repsAtLoad', 'estimatedOneRepMax']);
  assert.deepEqual(recordsForSet(past, current, 'bench', second), ['maxLoad']);
  assert.deepEqual(recordsForSet(past, current, 'bench', third), [], 'matching a record set earlier today is not a new one');
  assert.deepEqual(recordsForSet(past, current, 'bench', warm), []);
});

test('records ignore later drop-set steps and sessions that started later (retroactive logs)', () => {
  const later = [session('later', at(2026, 4, 1), [bench([set(200, 1)])])];
  const before = set(90, 5);
  const main = set(100, 5, 'dropSet', 'g');
  const step = set(150, 1, 'dropSet', 'g');
  const current = session('c', at(2026, 3, 1), [bench([before, main, step])]);
  assert.deepEqual(recordsForSet(later, current, 'bench', main), ['maxLoad', 'estimatedOneRepMax']);
  assert.deepEqual(recordsForSet(later, current, 'bench', step), []);
});

test('summary: duration, tonnage, sets per group and records', () => {
  const past = [session('p', at(2026, 2, 1), [bench([set(80, 8)])])];
  const current = session('c', at(2026, 3, 1, 18), [
    bench([set(40, 10, 'warmup'), set(80, 9), set(80, 8)]),
    exercise('row', [set(70, 10), set(60, 8, 'dropSet', 'g'), set(40, 8, 'dropSet', 'g')], { primaryMuscle: 'back', secondaryMuscles: ['biceps'] }),
  ], { endedAt: at(2026, 3, 1, 19, 5) });
  const summary = sessionSummary(current, past);
  assert.equal(summary.durationMs, 65 * 60_000);
  assert.equal(summary.tonnage, 720 + 640 + 700 + 480 + 320);
  assert.equal(summary.effectiveSets, 4);
  assert.deepEqual(summary.setsByGroup, [['chest', 2], ['back', 2], ['triceps', 1], ['biceps', 1]]);
  assert.deepEqual(summary.records.map((record) => [record.exerciseId, record.set.load, record.set.reps, record.types]), [
    ['bench', 80, 9, ['repsAtLoad', 'estimatedOneRepMax']],
  ]);
});

test('end time: a normal session ends now; a retroactive one ends after the time spent logging', () => {
  const now = at(2026, 3, 2, 10);
  assert.equal(endTimeFor(at(2026, 3, 2, 9), [], now), now);
  const start = at(2026, 3, 1, 18);
  const sets = [{ completedAt: now - 30 * 60_000 }, { completedAt: now - 2 * 60_000 }];
  assert.equal(endTimeFor(start, sets, now), start + 28 * 60_000);
  assert.equal(endTimeFor(start, [], now), start);
});
