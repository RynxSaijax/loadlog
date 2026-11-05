import { test } from 'node:test';
import assert from 'node:assert/strict';
import { set, exercise, session, at } from './metrics-fixtures.js';
import { comparisonHistory, isPartialProgress, progressSeries, stagnation } from '../../src/metrics/progress.js';

test('progress: a heavier set than the previous best counts', () => {
  assert.equal(isPartialProgress([set(102.5, 4)], [set(100, 8)]), true);
});

test('progress: same load with more reps counts', () => {
  assert.equal(isPartialProgress([set(100, 9), set(100, 6)], [set(100, 8), set(100, 8)]), true);
});

test('progress: lower load with more reps does not count', () => {
  assert.equal(isPartialProgress([set(97.5, 12)], [set(100, 8)]), false);
});

test('progress: matching the previous best exactly does not count', () => {
  assert.equal(isPartialProgress([set(100, 8)], [set(100, 8)]), false);
});

test('progress: one good set is enough; the rest may be worse', () => {
  assert.equal(isPartialProgress([set(100, 9), set(100, 5), set(90, 5)], [set(100, 8), set(100, 8), set(100, 7)]), true);
});

test('progress: warmups and later drop-set steps do not count', () => {
  const previous = [set(100, 8)];
  assert.equal(isPartialProgress([set(120, 3, 'warmup'), set(95, 8)], previous), false);
  assert.equal(isPartialProgress([set(90, 8, 'dropSet', 'g'), set(100, 9, 'dropSet', 'g')], previous), false);
  assert.equal(isPartialProgress([set(105, 5, 'dropSet', 'g'), set(80, 8, 'dropSet', 'g')], previous), true);
});

test('progress: the previous best uses the main drop-set step only', () => {
  assert.equal(isPartialProgress([set(90, 9)], [set(90, 8, 'dropSet', 'g'), set(110, 3, 'dropSet', 'g')]), true);
});

test('history compares only the same plan + exercise and orders by startedAt', () => {
  const bench = (id, startedAt, load, planId = 'plan-a') => session(id, startedAt, [exercise('bench', [set(load, 8)])], { planId });
  const sessions = [
    bench('s3', at(2026, 3, 10), 105),
    bench('s1', at(2026, 3, 1), 95),
    bench('other-plan', at(2026, 3, 5), 200, 'plan-b'),
    bench('ad-hoc', at(2026, 3, 6), 300, null),
    bench('s2-retro', at(2026, 3, 4), 100),
    session('no-bench', at(2026, 3, 7), [exercise('squat', [set(140, 5)])]),
    session('warmup-only', at(2026, 3, 8), [exercise('bench', [set(40, 10, 'warmup')])]),
  ];
  assert.deepEqual(comparisonHistory(sessions, 'plan-a', 'bench').map((entry) => entry.sessionId), ['s1', 's2-retro', 's3']);
  assert.deepEqual(comparisonHistory(sessions, null, 'bench'), []);
});

test('a retroactive session is compared against the session that came before it in time', () => {
  const sessions = [
    session('jan10', at(2026, 1, 10), [exercise('bench', [set(100, 8)])]),
    session('jan20', at(2026, 1, 20), [exercise('bench', [set(102.5, 8)])]),
    session('jan15-logged-later', at(2026, 1, 15), [exercise('bench', [set(100, 9)])]),
  ];
  const series = progressSeries(comparisonHistory(sessions, 'plan-a', 'bench'));
  assert.deepEqual(series.map((entry) => [entry.sessionId, entry.previousSessionId, entry.progress]), [
    ['jan10', null, null],
    ['jan15-logged-later', 'jan10', true],
    ['jan20', 'jan15-logged-later', true],
  ]);
});

test('the same exercise twice in one session is merged', () => {
  const sessions = [
    session('s1', at(2026, 1, 1), [exercise('bench', [set(100, 5)]), exercise('bench', [set(80, 10)])]),
  ];
  assert.equal(comparisonHistory(sessions, 'plan-a', 'bench')[0].sets.length, 2);
});

function benchHistory(rows) {
  return comparisonHistory(
    rows.map((sets, index) => session(`s${index}`, at(2026, 2, 1 + index * 3), [exercise('bench', sets)])),
    'plan-a',
    'bench',
  );
}

test('stagnation: exactly 3 sessions in a row without progress or more tonnage', () => {
  const history = benchHistory([
    [set(100, 8), set(100, 8)],
    [set(100, 8), set(100, 7)],
    [set(100, 7), set(100, 7)],
    [set(100, 7), set(95, 7)],
  ]);
  assert.deepEqual(stagnation(history), { isStagnant: true, streak: 3 });
});

test('stagnation: 2 sessions in a row is not yet stagnation', () => {
  const history = benchHistory([[set(100, 8)], [set(100, 8)], [set(100, 7)]]);
  assert.deepEqual(stagnation(history), { isStagnant: false, streak: 2 });
});

test('stagnation: a session with partial progress interrupts the streak', () => {
  const history = benchHistory([
    [set(100, 8)],
    [set(100, 8)],
    [set(100, 8)],
    [set(100, 9)],
    [set(100, 8)],
  ]);
  assert.deepEqual(stagnation(history), { isStagnant: false, streak: 1 });
});

test('stagnation: more tonnage alone also interrupts the streak', () => {
  const history = benchHistory([
    [set(100, 8)],
    [set(100, 8)],
    [set(100, 8)],
    [set(100, 8), set(90, 8)],
  ]);
  assert.deepEqual(stagnation(history), { isStagnant: false, streak: 0 });
});

test('stagnation: equal tonnage counts as not increasing', () => {
  const history = benchHistory([[set(100, 8)], [set(100, 8)], [set(100, 8)], [set(100, 8)]]);
  assert.deepEqual(stagnation(history), { isStagnant: true, streak: 3 });
});

test('stagnation: no history or a single session is never stagnant', () => {
  assert.deepEqual(stagnation([]), { isStagnant: false, streak: 0 });
  assert.deepEqual(stagnation(benchHistory([[set(100, 8)]])), { isStagnant: false, streak: 0 });
});
