process.env.TZ = 'America/Sao_Paulo';

const { test } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const { volumeByWeek, weeklyVolumeSummary } = await import('../../src/metrics/volume.js');
const { set, exercise, session, at } = await import('./metrics-fixtures.js');

const benchOpts = { primaryMuscle: 'chest', secondaryMuscles: ['triceps', 'shoulders'] };

test('primary group counts 1 per effective set, each secondary 0.5; drop-set = 1', () => {
  const weeks = volumeByWeek([
    session('s', at(2026, 3, 10), [
      exercise('bench', [
        set(40, 10, 'warmup'),
        set(100, 5),
        set(100, 5),
        set(80, 8, 'dropSet', 'g'),
        set(60, 8, 'dropSet', 'g'),
      ], benchOpts),
    ]),
  ]);
  const week = weeks.get('2026-W11');
  assert.deepEqual(week.get('chest'), { sets: 3, tonnage: 500 + 500 + 640 + 480 });
  assert.deepEqual(week.get('triceps'), { sets: 1.5, tonnage: 0 });
  assert.deepEqual(week.get('shoulders'), { sets: 1.5, tonnage: 0 });
});

test('weekly volume crosses plans and includes ad-hoc sessions', () => {
  const weeks = volumeByWeek([
    session('a', at(2026, 3, 9), [exercise('bench', [set(100, 5)], benchOpts)], { planId: 'plan-a' }),
    session('b', at(2026, 3, 11), [exercise('fly', [set(20, 12)], { primaryMuscle: 'chest' })], { planId: 'plan-b' }),
    session('c', at(2026, 3, 15, 20), [exercise('dip', [set(0, 10)], { primaryMuscle: 'chest', secondaryMuscles: ['triceps'] })], { planId: null }),
  ]);
  assert.deepEqual(weeks.get('2026-W11').get('chest'), { sets: 3, tonnage: 500 + 240 + 0 });
  assert.deepEqual(weeks.get('2026-W11').get('triceps'), { sets: 1, tonnage: 0 });
});

test('an exercise with only warmups adds nothing', () => {
  const weeks = volumeByWeek([session('s', at(2026, 3, 10), [exercise('bench', [set(40, 10, 'warmup')], benchOpts)])]);
  assert.equal(weeks.get('2026-W11').size, 0);
});

test('summary: current week, previous week and average of the 4 weeks before', () => {
  const now = at(2026, 1, 7, 9); // Wednesday of 2026-W02
  const weekly = (startedAt, sets) => session(`s${startedAt}`, startedAt, [exercise('bench', sets, benchOpts)]);
  const sessions = [
    weekly(at(2026, 1, 6), [set(100, 5), set(100, 5)]), // W02 (current)
    weekly(at(2026, 1, 1), [set(100, 5), set(100, 5), set(100, 5), set(100, 5)]), // W01
    weekly(at(2025, 12, 24), [set(100, 5)]), // W52
    weekly(at(2025, 12, 17), [set(100, 5), set(100, 5), set(100, 5)]), // W51
    // W50 has no session: counts as 0 in the average
    weekly(at(2025, 12, 3), [set(100, 5), set(100, 5), set(100, 5), set(100, 5), set(100, 5), set(100, 5), set(100, 5), set(100, 5)]), // W49: outside window
  ];
  const chest = weeklyVolumeSummary(sessions, now).get('chest');
  assert.deepEqual(chest.current, { sets: 2, tonnage: 1000 });
  assert.deepEqual(chest.previous, { sets: 4, tonnage: 2000 });
  assert.deepEqual(chest.average, { sets: (4 + 1 + 3 + 0) / 4, tonnage: (2000 + 500 + 1500) / 4 });
  assert.deepEqual(weeklyVolumeSummary(sessions, now).get('triceps').current, { sets: 1, tonnage: 0 });
});

test('summary of no sessions is empty', () => {
  assert.equal(weeklyVolumeSummary([], at(2026, 1, 7)).size, 0);
});
