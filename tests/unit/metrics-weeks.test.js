// Runs in the São Paulo time zone so "local time" is deterministic.
process.env.TZ = 'America/Sao_Paulo';

const { test } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const { isoWeek, shiftWeek } = await import('../../src/metrics/weeks.js');
const { at } = await import('./metrics-fixtures.js');

test('ISO week: year turn where 1 January falls on a Thursday (2026)', () => {
  assert.equal(isoWeek(at(2025, 12, 28)).key, '2025-W52'); // Sunday
  assert.equal(isoWeek(at(2025, 12, 29)).key, '2026-W01'); // Monday belongs to 2026
  assert.equal(isoWeek(at(2026, 1, 1)).key, '2026-W01');
  assert.equal(isoWeek(at(2026, 1, 4)).key, '2026-W01'); // Sunday
  assert.equal(isoWeek(at(2026, 1, 5)).key, '2026-W02');
});

test('ISO week: 53-week year and early January belonging to the previous year', () => {
  assert.equal(isoWeek(at(2026, 12, 31)).key, '2026-W53');
  assert.equal(isoWeek(at(2027, 1, 3)).key, '2026-W53'); // Sunday 3 Jan 2027
  assert.equal(isoWeek(at(2027, 1, 4)).key, '2027-W01');
});

test('ISO week: 2021 starts on Friday, so 1–3 January are week 53 of 2020', () => {
  assert.equal(isoWeek(at(2021, 1, 1)).key, '2020-W53');
  assert.equal(isoWeek(at(2021, 1, 3)).key, '2020-W53');
  assert.equal(isoWeek(at(2021, 1, 4)).key, '2021-W01');
});

test('ISO week: Monday to Sunday, using local time at the edges', () => {
  assert.equal(isoWeek(at(2026, 3, 8, 23, 59)).key, '2026-W10'); // Sunday night
  assert.equal(isoWeek(at(2026, 3, 9, 0, 0)).key, '2026-W11'); // Monday 00:00
});

test('ISO week: Sunday 22:00 in Brazil is already Monday in UTC but stays in the local week', () => {
  const sundayNight = at(2026, 3, 8, 22);
  assert.equal(new Date(sundayNight).getUTCDay(), 1);
  assert.equal(isoWeek(sundayNight).key, '2026-W10');
});

test('week start is local Monday 00:00', () => {
  const { start } = isoWeek(at(2026, 1, 1, 15));
  assert.equal(start, at(2025, 12, 29, 0));
});

test('shifting weeks crosses the year boundary', () => {
  assert.equal(shiftWeek(at(2026, 1, 1), -1).key, '2025-W52');
  assert.equal(shiftWeek(at(2025, 12, 22), 1).key, '2026-W01');
  assert.equal(shiftWeek(at(2026, 1, 7), -4).key, '2025-W50');
});
