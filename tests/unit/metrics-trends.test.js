import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linearRegression } from '../../src/metrics/regression.js';
import { suggestNextPlan } from '../../src/metrics/next-plan.js';

test('regression needs at least 3 points ("dados insuficientes")', () => {
  assert.equal(linearRegression([]), null);
  assert.equal(linearRegression([{ x: 0, y: 1 }]), null);
  assert.equal(linearRegression([{ x: 0, y: 1 }, { x: 1, y: 2 }]), null);
});

test('regression fits an exact line', () => {
  assert.deepEqual(linearRegression([{ x: 0, y: 100 }, { x: 1, y: 102.5 }, { x: 2, y: 105 }]), { slope: 2.5, intercept: 100 });
});

test('regression uses least squares on noisy points', () => {
  const fit = linearRegression([{ x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 5 }, { x: 4, y: 4 }, { x: 5, y: 5 }]);
  assert.ok(Math.abs(fit.slope - 0.6) < 1e-12);
  assert.ok(Math.abs(fit.intercept - 2.2) < 1e-12);
});

test('regression of a flat series has zero slope; identical x has no line', () => {
  assert.deepEqual(linearRegression([{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }]), { slope: 0, intercept: 5 });
  assert.equal(linearRegression([{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }]), null);
});

const plans = [
  { id: 'A', sortOrder: 0, isArchived: false },
  { id: 'B', sortOrder: 1, isArchived: false },
  { id: 'C', sortOrder: 2, isArchived: false },
];
const ended = (planId, startedAt) => ({ planId, startedAt, endedAt: startedAt + 1 });

test('next plan: without history, the first plan', () => {
  assert.equal(suggestNextPlan(plans, []), 'A');
});

test('next plan: the one after the last ended session', () => {
  assert.equal(suggestNextPlan(plans, [ended('A', 1), ended('B', 2)]), 'C');
});

test('next plan: after the last plan, back to the first', () => {
  assert.equal(suggestNextPlan(plans, [ended('C', 5)]), 'A');
});

test('next plan: "last" means latest startedAt, not insertion order (retroactive logs)', () => {
  assert.equal(suggestNextPlan(plans, [ended('B', 10), ended('A', 5)]), 'C');
});

test('next plan: open sessions and ad-hoc sessions are ignored', () => {
  assert.equal(suggestNextPlan(plans, [ended('A', 1), { planId: 'B', startedAt: 2, endedAt: null }, ended(null, 3)]), 'B');
});

test('next plan: archived plans are skipped', () => {
  const withArchived = [plans[0], { ...plans[1], isArchived: true }, plans[2]];
  assert.equal(suggestNextPlan(withArchived, [ended('A', 1)]), 'C');
  assert.equal(suggestNextPlan(withArchived, [ended('B', 1)]), 'C', 'last plan archived since: continue after it');
});

test('next plan: sortOrder decides, not array order', () => {
  const shuffled = [plans[2], plans[0], plans[1]];
  assert.equal(suggestNextPlan(shuffled, [ended('A', 1)]), 'B');
});

test('next plan: no active plans gives nothing; a deleted last plan falls back to the first', () => {
  assert.equal(suggestNextPlan([], []), null);
  assert.equal(suggestNextPlan(plans.map((plan) => ({ ...plan, isArchived: true })), []), null);
  assert.equal(suggestNextPlan(plans, [ended('deleted', 1)]), 'A');
});
