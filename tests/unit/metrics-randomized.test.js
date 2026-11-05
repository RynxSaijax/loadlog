// Randomized cross-checks against brute-force versions of the rules.
// Fixed seed: failures are reproducible.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSetSnapshot } from '../../src/metrics/snapshots.js';
import { bestSet, primarySets, tonnage, countEffectiveSets } from '../../src/metrics/sets.js';
import { isPartialProgress } from '../../src/metrics/progress.js';
import { linearRegression } from '../../src/metrics/regression.js';

function random(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function randomSets(next) {
  const sets = [];
  const count = Math.floor(next() * 8);
  let group = null;
  for (let order = 0; order < count; order += 1) {
    const roll = next();
    const type = roll < 0.15 ? 'warmup' : roll < 0.3 ? 'dropSet' : roll < 0.4 ? 'failure' : roll < 0.5 ? 'backOff' : 'normal';
    if (type === 'dropSet') group = group && next() < 0.6 ? group : `g${order}`;
    sets.push(makeSetSnapshot({
      id: `x${order}`, order, type, dropGroupId: type === 'dropSet' ? group : null,
      load: Math.round(next() * 40) * 2.5, reps: 1 + Math.floor(next() * 15), completedAt: order,
    }));
  }
  return sets;
}

test('best set, counts, tonnage and progress agree with brute force on 2000 random sessions', () => {
  const next = random(42);
  for (let round = 0; round < 2000; round += 1) {
    const current = randomSets(next);
    const previous = randomSets(next);

    const main = current.filter((set) => set.type !== 'warmup' && (set.type !== 'dropSet' || current.find((other) => other.dropGroupId === set.dropGroupId).id === set.id));
    assert.deepEqual(primarySets(current), main);
    assert.equal(countEffectiveSets(current), main.length);
    assert.equal(tonnage(current), current.filter((set) => set.type !== 'warmup').reduce((sum, set) => sum + set.load * set.reps, 0));

    const best = bestSet(current);
    if (main.length === 0) {
      assert.equal(best, null);
    } else {
      const maxLoad = Math.max(...main.map((set) => set.load));
      const maxReps = Math.max(...main.filter((set) => set.load === maxLoad).map((set) => set.reps));
      assert.deepEqual([best.load, best.reps], [maxLoad, maxReps]);
    }

    const previousBest = bestSet(previous);
    const expected = previousBest !== null && main.some((set) => set.load > previousBest.load || (set.load === previousBest.load && set.reps > previousBest.reps));
    assert.equal(isPartialProgress(current, previous), expected);
  }
});

test('regression recovers random lines exactly', () => {
  const next = random(7);
  for (let round = 0; round < 500; round += 1) {
    const slope = (next() - 0.5) * 20;
    const intercept = next() * 200;
    const points = Array.from({ length: 3 + Math.floor(next() * 10) }, (_, x) => ({ x, y: intercept + slope * x }));
    const fit = linearRegression(points);
    assert.ok(Math.abs(fit.slope - slope) < 1e-9 && Math.abs(fit.intercept - intercept) < 1e-9);
  }
});
