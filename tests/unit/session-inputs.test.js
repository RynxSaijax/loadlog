import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLoad, parseReps, validStart } from '../../src/features/workout/inputs.js';

test('parseLoad accepts 0 to 1000 kg in multiples of 0.25, with comma or dot', () => {
  for (const [text, value] of [['0', 0], ['80', 80], ['82,5', 82.5], ['2,25', 2.25], ['1000', 1000], ['12.75', 12.75], ['0,0', 0]]) {
    assert.equal(parseLoad(text), value, text);
  }
});

test('parseLoad rejects out-of-range, non-multiples and garbage', () => {
  for (const text of ['', ',', '1000,5', '1001', '2,3', '2,1', '-5', 'abc', '1,2,3', '80 kg', '1e3']) {
    assert.equal(parseLoad(text), null, text);
  }
});

test('parseReps accepts integers 1 to 100 only', () => {
  assert.equal(parseReps('1'), 1);
  assert.equal(parseReps('12'), 12);
  assert.equal(parseReps('100'), 100);
  for (const text of ['', '0', '101', '8,5', '-1', 'x', '007a']) assert.equal(parseReps(text), null, text);
});

test('validStart allows the past and up to a minute ahead, never the future or invalid values', () => {
  const now = Date.UTC(2026, 10, 4, 18, 0);
  assert.equal(validStart(now - 86_400_000 * 30, now), true);
  assert.equal(validStart(now, now), true);
  assert.equal(validStart(now + 30_000, now), true);
  assert.equal(validStart(now + 120_000, now), false);
  assert.equal(validStart(null, now), false);
  assert.equal(validStart(Number.NaN, now), false);
});
