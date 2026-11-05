import { test } from 'node:test';
import assert from 'node:assert/strict';
import { set } from './metrics-fixtures.js';
import { averageLoad, bestSet, countEffectiveSets, effectiveSets, primarySets, tonnage } from '../../src/metrics/sets.js';
import { estimateOneRepMax } from '../../src/metrics/one-rep-max.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);

test('Epley: 1 rep is the load itself', () => {
  assert.deepEqual(estimateOneRepMax(100, 1), { value: 100, lowConfidence: false });
});

test('Epley: load × (1 + reps / 30)', () => {
  close(estimateOneRepMax(100, 10).value, 133.33333333333334);
  close(estimateOneRepMax(80, 8).value, 101.33333333333333);
  close(estimateOneRepMax(0, 10).value, 0);
});

test('Epley: up to 12 reps is confident, above 12 is flagged', () => {
  assert.equal(estimateOneRepMax(60, 12).lowConfidence, false);
  assert.equal(estimateOneRepMax(60, 13).lowConfidence, true);
  close(estimateOneRepMax(60, 13).value, 86);
});

test('tonnage excludes warmups and includes every drop-set step', () => {
  const sets = [
    set(40, 10, 'warmup'),
    set(60, 5, 'warmup'),
    set(100, 5),
    set(100, 4, 'failure'),
    set(80, 8, 'dropSet', 'g1'),
    set(60, 6, 'dropSet', 'g1'),
    set(40, 8, 'dropSet', 'g1'),
    set(70, 10, 'backOff'),
  ];
  assert.equal(tonnage(sets), 500 + 400 + 640 + 360 + 320 + 700);
});

test('tonnage of only warmups or of nothing is zero', () => {
  assert.equal(tonnage([set(40, 10, 'warmup')]), 0);
  assert.equal(tonnage([]), 0);
});

test('effective sets are every type but warmup', () => {
  const sets = [set(1, 1, 'warmup'), set(1, 1, 'normal'), set(1, 1, 'failure'), set(1, 1, 'dropSet', 'g'), set(1, 1, 'backOff')];
  assert.deepEqual(effectiveSets(sets).map((s) => s.type), ['normal', 'failure', 'dropSet', 'backOff']);
});

test('a whole drop-set counts as one set; separate drop-sets count separately', () => {
  const sets = [
    set(40, 10, 'warmup'),
    set(100, 5),
    set(80, 8, 'dropSet', 'g1'),
    set(60, 6, 'dropSet', 'g1'),
    set(40, 8, 'dropSet', 'g1'),
    set(80, 8, 'dropSet', 'g2'),
    set(60, 6, 'dropSet', 'g2'),
  ];
  assert.equal(countEffectiveSets(sets), 3);
});

test('the main drop-set step is the first by order, even if listed out of order', () => {
  const first = set(80, 8, 'dropSet', 'g1');
  const second = set(60, 10, 'dropSet', 'g1');
  assert.deepEqual(primarySets([second, first]), [first]);
});

test('best set: highest load wins', () => {
  const heavy = set(100, 3);
  assert.equal(bestSet([set(90, 10), heavy, set(95, 6)]), heavy);
});

test('best set: equal loads are decided by more reps', () => {
  const winner = set(100, 6);
  assert.equal(bestSet([set(100, 5), winner, set(100, 4)]), winner);
});

test('best set: a full tie keeps the earlier set', () => {
  const first = set(100, 5);
  assert.equal(bestSet([first, set(100, 5)]), first);
});

test('best set ignores warmups and later drop-set steps', () => {
  const main = set(80, 8, 'dropSet', 'g1');
  assert.equal(bestSet([set(120, 1, 'warmup'), main, set(80, 12, 'dropSet', 'g1')]), main);
});

test('best set of only warmups is null', () => {
  assert.equal(bestSet([set(40, 10, 'warmup')]), null);
  assert.equal(bestSet([]), null);
});

test('average load is the simple mean of considered sets', () => {
  assert.equal(averageLoad([set(40, 10, 'warmup'), set(100, 5), set(90, 6), set(80, 8, 'dropSet', 'g'), set(50, 8, 'dropSet', 'g')]), 90);
  assert.equal(averageLoad([set(40, 10, 'warmup')]), null);
});
