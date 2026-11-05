import { test } from 'node:test';
import assert from 'node:assert/strict';
import { set, exercise, session, at } from './metrics-fixtures.js';
import { detectRecords, exerciseSets, recordSummary, RecordType } from '../../src/metrics/records.js';

const history = [set(100, 5), set(90, 8), set(80, 10)];

test('PR max load: heavier than every earlier set', () => {
  // 102.5×1 → 1RM 102.5, below the 116.67 of 100×5: only the load record.
  assert.deepEqual(detectRecords(history, set(102.5, 1)), [RecordType.maxLoad]);
  assert.deepEqual(detectRecords(history, set(100.25, 1)), [RecordType.maxLoad]);
});

test('PR reps at a specific load: more reps than ever at that exact load', () => {
  assert.ok(detectRecords(history, set(90, 9)).includes(RecordType.repsAtLoad));
  assert.ok(!detectRecords(history, set(90, 8)).includes(RecordType.repsAtLoad));
  assert.ok(!detectRecords(history, set(92.5, 9)).includes(RecordType.repsAtLoad), 'never done 92.5 before: no reps PR');
});

test('PR estimated 1RM: only sets with up to 12 reps', () => {
  // Best so far: 100×5 → 116.67; 80×10 → 106.67
  assert.ok(detectRecords(history, set(95, 7)).includes(RecordType.estimatedOneRepMax)); // 117.17
  assert.ok(!detectRecords(history, set(95, 6)).includes(RecordType.estimatedOneRepMax)); // 114
  assert.ok(detectRecords(history, set(90, 12)).includes(RecordType.estimatedOneRepMax)); // 126
  assert.ok(!detectRecords(history, set(90, 13)).includes(RecordType.estimatedOneRepMax), '13 reps never counts');
});

test('earlier sets above 12 reps are ignored for the 1RM record', () => {
  const highReps = [set(80, 20)]; // Epley 133.3 but not eligible
  assert.deepEqual(detectRecords(highReps, set(80, 10)), [RecordType.estimatedOneRepMax]);
});

test('one set can break several records at once', () => {
  assert.deepEqual(detectRecords(history, set(100, 6)), [RecordType.repsAtLoad, RecordType.estimatedOneRepMax]);
  assert.deepEqual(detectRecords(history, set(110, 5)), [RecordType.maxLoad, RecordType.estimatedOneRepMax]);
});

test('matching a record is not a PR', () => {
  assert.deepEqual(detectRecords(history, set(100, 5)), []);
});

test('warmups, later drop-set steps and the very first set never are PRs', () => {
  assert.deepEqual(detectRecords(history, set(150, 5, 'warmup')), []);
  assert.deepEqual(detectRecords(history, set(150, 5, 'dropSet', 'g'), { isMainStep: false }), []);
  assert.deepEqual(detectRecords([], set(150, 5)), []);
});

test('records cross plans and include ad-hoc sessions', () => {
  const sessions = [
    session('a', at(2026, 1, 1), [exercise('bench', [set(100, 5), set(40, 10, 'warmup')])], { planId: 'plan-a' }),
    session('b', at(2026, 1, 3), [exercise('bench', [set(110, 3)])], { planId: 'plan-b' }),
    session('c', at(2026, 1, 5), [exercise('bench', [set(80, 8, 'dropSet', 'g'), set(120, 1, 'dropSet', 'g')])], { planId: null }),
    session('d', at(2026, 1, 6), [exercise('squat', [set(200, 1)])]),
  ];
  const sets = exerciseSets(sessions, 'bench');
  assert.deepEqual(sets.map((s) => s.load), [100, 110, 80]);
  const summary = recordSummary(sets);
  assert.equal(summary.maxLoad.load, 110);
  assert.equal(summary.repsByLoad.get(100).reps, 5);
  assert.equal(summary.bestOneRepMax.set.load, 110); // 110×3 → 121 beats 100×5 → 116.67
});
