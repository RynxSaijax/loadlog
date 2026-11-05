import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trendBetween, TrendDirection } from '../../src/metrics/trend.js';

test('increase above +1% is up', () => {
  assert.equal(trendBetween(100, 102), TrendDirection.up);
});

test('decrease below -1% is down', () => {
  assert.equal(trendBetween(100, 98), TrendDirection.down);
});

test('exactly +1% is flat', () => {
  assert.equal(trendBetween(100, 101), TrendDirection.flat);
  assert.equal(trendBetween(200, 202), TrendDirection.flat);
});

test('exactly -1% is flat', () => {
  assert.equal(trendBetween(100, 99), TrendDirection.flat);
  assert.equal(trendBetween(200, 198), TrendDirection.flat);
});

test('just above the threshold is up', () => {
  assert.equal(trendBetween(1000, 1010.5), TrendDirection.up);
});

test('just below the threshold is down', () => {
  assert.equal(trendBetween(1000, 989.5), TrendDirection.down);
});

test('equal values are flat', () => {
  assert.equal(trendBetween(80, 80), TrendDirection.flat);
});

test('zero previous uses the sign of current', () => {
  assert.equal(trendBetween(0, 10), TrendDirection.up);
  assert.equal(trendBetween(0, 0), TrendDirection.flat);
});
