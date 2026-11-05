/**
 * Pure analysis behind the Histórico and Início screens, built on the
 * metrics module. Inputs are metrics session snapshots of ENDED sessions,
 * in any order. No DOM, no storage: tested in Node.
 */
import {
  averageLoad, bestSet, comparisonHistory, countEffectiveSets, estimateOneRepMax, exerciseSets, isPartialProgress, isoWeek, linearRegression,
  ONE_REP_MAX_CONFIDENT_REPS, primarySets, progressSeries, recordSummary, shiftWeek, stagnation, tonnage, trendBetween,
  volumeByWeek, weeklyVolumeSummary,
} from '../../metrics/index.js';
import { recordsForSet, setsOf } from '../workout/session-logic.js';

const DAY_MS = 86_400_000;
const byStart = (a, b) => a.startedAt - b.startedAt;

/** Totals shown on a history row. */
export function sessionTotals(session) {
  const sets = session.exercises.flatMap((exercise) => exercise.sets);
  return {
    durationMs: session.endedAt === null ? null : Math.max(0, session.endedAt - session.startedAt),
    effectiveSets: session.exercises.reduce((sum, exercise) => sum + countEffectiveSets(exercise.sets), 0),
    tonnage: tonnage(sets),
    exerciseCount: new Set(session.exercises.map((exercise) => exercise.exerciseId)).size,
  };
}

/**
 * Sessions grouped by ISO week, newest week first and newest session first.
 * `planId`: undefined = all, null = only sessions without a plan, else that plan.
 */
export function groupByWeek(sessions, { planId } = {}) {
  const filtered = sessions.filter((session) => planId === undefined || session.planId === planId);
  const weeks = new Map();
  for (const session of [...filtered].sort((a, b) => b.startedAt - a.startedAt)) {
    const week = isoWeek(session.startedAt);
    if (!weeks.has(week.key)) weeks.set(week.key, { key: week.key, start: week.start, sessions: [] });
    weeks.get(week.key).sessions.push(session);
  }
  return [...weeks.values()].sort((a, b) => b.start - a.start);
}

/** Best estimated 1RM among confident sets (reps ≤ 12), else among all, with the flag. */
function sessionOneRepMax(sets) {
  const main = primarySets(sets);
  if (main.length === 0) return null;
  const confident = main.filter((set) => set.reps <= ONE_REP_MAX_CONFIDENT_REPS);
  const pool = confident.length ? confident : main;
  let best = null;
  for (const set of pool) {
    const { value, lowConfidence } = estimateOneRepMax(set.load, set.reps);
    if (best === null || value > best.value) best = { value, lowConfidence, set };
  }
  return best;
}

/**
 * Everything the exercise screen shows, across plans (records and chart) and
 * per comparison key (progress and stagnation).
 */
export function exerciseOverview(sessions, exerciseId) {
  const ordered = [...sessions].sort(byStart);
  const executions = ordered
    .map((session) => {
      const sets = setsOf(session, exerciseId);
      const main = primarySets(sets);
      if (main.length === 0) return null;
      return {
        sessionId: session.sessionId,
        planId: session.planId,
        startedAt: session.startedAt,
        best: bestSet(sets),
        sets: main.length,
        tonnage: tonnage(sets),
        averageLoad: averageLoad(sets),
        oneRepMax: sessionOneRepMax(sets),
      };
    })
    .filter(Boolean);

  const allMain = exerciseSets(ordered, exerciseId);
  const summary = recordSummary(allMain);
  const repsAtLoad = [...summary.repsByLoad.values()].sort((a, b) => b.load - a.load);

  const planIds = [...new Set(executions.map((execution) => execution.planId).filter((planId) => planId !== null))];
  const byPlan = planIds.map((planId) => {
    const history = comparisonHistory(ordered, planId, exerciseId);
    const series = progressSeries(history);
    const latest = series.at(-1);
    return {
      planId,
      sessions: history.length,
      lastProgress: latest?.progress ?? null,
      lastStartedAt: latest?.startedAt ?? null,
      stagnation: stagnation(history),
    };
  });

  return {
    executions,
    last: executions.at(-1) ?? null,
    bestSet: bestSet(allMain),
    records: {
      maxLoad: summary.maxLoad,
      bestOneRepMax: summary.bestOneRepMax,
      repsAtLoad,
    },
    chart: executions.map((execution) => ({
      x: execution.startedAt,
      oneRepMax: execution.oneRepMax?.value ?? null,
      lowConfidence: execution.oneRepMax?.lowConfidence ?? false,
      averageLoad: execution.averageLoad,
    })),
    byPlan,
  };
}

/** Delta between two numbers with the 4.3 direction (null when there is no previous). */
function delta(previous, current) {
  if (previous === null || previous === undefined || current === null || current === undefined) return null;
  return { value: current - previous, direction: trendBetween(previous, current) };
}

/**
 * Session × previous session of the same comparison key, exercise by
 * exercise. Ad-hoc sessions (no plan) have no comparison key.
 */
export function compareWithPrevious(sessions, sessionId) {
  const ordered = [...sessions].sort(byStart);
  const session = ordered.find((candidate) => candidate.sessionId === sessionId);
  if (!session) return null;
  const exerciseIds = [...new Set(session.exercises.map((exercise) => exercise.exerciseId))];
  const rows = exerciseIds.map((exerciseId) => {
    const currentSets = setsOf(session, exerciseId);
    const history = session.planId === null ? [] : comparisonHistory(ordered, session.planId, exerciseId);
    const index = history.findIndex((entry) => entry.sessionId === sessionId);
    const previous = index > 0 ? history[index - 1] : null;
    const current = { best: bestSet(currentSets), tonnage: tonnage(currentSets), sets: countEffectiveSets(currentSets) };
    const before = previous ? { best: bestSet(previous.sets), tonnage: tonnage(previous.sets), sets: countEffectiveSets(previous.sets), sessionId: previous.sessionId, startedAt: previous.startedAt } : null;
    return {
      exerciseId,
      current,
      previous: before,
      progress: previous && current.best ? isPartialProgress(currentSets, previous.sets) : null,
      deltas: before && current.best && before.best
        ? { load: delta(before.best.load, current.best.load), reps: delta(before.best.reps, current.best.reps), tonnage: delta(before.tonnage, current.tonnage) }
        : null,
    };
  });
  return { session, rows, hasPrevious: rows.some((row) => row.previous !== null) };
}

/** Weeks (ISO, complete) used for trends: the 8 before the current one. */
export const TREND_WEEKS = 8;

/**
 * Weekly volume per group (current, previous, 4-week average) plus a trend
 * over the last complete weeks. Trend points start at the first week with
 * any training (weeks without training in between count as 0); fewer than 3
 * points → no trend ("dados insuficientes").
 */
export function weeklyVolume(sessions, now) {
  const summary = weeklyVolumeSummary(sessions, now);
  const weeks = volumeByWeek(sessions);
  const firstStart = sessions.length ? isoWeek(Math.min(...sessions.map((session) => session.startedAt))).start : null;
  const trendKeys = [];
  for (let offset = TREND_WEEKS; offset >= 1; offset -= 1) {
    const week = shiftWeek(now, -offset);
    if (firstStart !== null && week.start >= firstStart) trendKeys.push(week);
  }
  const groups = new Set([...summary.keys()]);
  for (const week of trendKeys) for (const group of weeks.get(week.key)?.keys() ?? []) groups.add(group);

  return [...groups]
    .map((group) => {
      const totals = summary.get(group) ?? { current: { sets: 0, tonnage: 0 }, previous: { sets: 0, tonnage: 0 }, average: { sets: 0, tonnage: 0 } };
      const points = trendKeys.map((week, index) => ({ x: index, y: weeks.get(week.key)?.get(group)?.sets ?? 0, week: week.key }));
      const line = linearRegression(points);
      return {
        group,
        ...totals,
        weekly: points,
        trend: line ? { slope: line.slope, direction: trendFromSlope(line, points) } : null,
      };
    })
    .sort((a, b) => b.current.sets - a.current.sets || b.average.sets - a.average.sets || (a.group < b.group ? -1 : 1));
}

/** Direction of a fitted line: its end value against its start value, with the ±1% rule. */
function trendFromSlope(line, points) {
  const first = line.intercept + line.slope * points[0].x;
  const last = line.intercept + line.slope * points.at(-1).x;
  return trendBetween(first, last);
}

/**
 * Calendar heatmap: `weeks` ISO weeks ending with the current one, each a
 * column of 7 days (Monday first). Future days are marked.
 */
export function consistencyCalendar(sessions, now, weeks = 16) {
  const counts = new Map();
  for (const session of sessions) {
    const day = new Date(session.startedAt);
    const key = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const todayDate = new Date(now);
  const today = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate()).getTime();
  const columns = [];
  for (let offset = weeks - 1; offset >= 0; offset -= 1) {
    const week = shiftWeek(now, -offset);
    const monday = new Date(week.start);
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index).getTime();
      return { date, count: counts.get(date) ?? 0, future: date > today };
    });
    columns.push({ key: week.key, start: week.start, days });
  }
  const pastDays = columns.flatMap((column) => column.days).filter((day) => !day.future);
  return {
    columns,
    activeDays: pastDays.filter((day) => day.count > 0).length,
    totalSessions: pastDays.reduce((sum, day) => sum + day.count, 0),
  };
}

/**
 * Início numbers: sessions this week (adherence), days trained this week,
 * and the streak of consecutive weeks with training (the current week
 * counts only once it has a session).
 */
export function weekStatus(sessions, now) {
  const current = isoWeek(now);
  const thisWeek = sessions.filter((session) => isoWeek(session.startedAt).key === current.key);
  const trainedDays = new Set(thisWeek.map((session) => (new Date(session.startedAt).getDay() + 6) % 7));
  const weekKeys = new Set(sessions.map((session) => isoWeek(session.startedAt).key));
  let streak = 0;
  let offset = weekKeys.has(current.key) ? 0 : -1;
  while (weekKeys.has(shiftWeek(now, offset).key)) {
    streak += 1;
    offset -= 1;
  }
  return { sessionsThisWeek: thisWeek.length, trainedDays: [...trainedDays].sort(), weekStreak: streak, weekStart: current.start };
}

/** Days considered "recent" for PRs on Início. */
export const RECENT_RECORD_DAYS = 30;

/** Records set in sessions of the last 30 days, newest first. */
export function recentRecords(sessions, now, { days = RECENT_RECORD_DAYS, limit = 5 } = {}) {
  const since = now - days * DAY_MS;
  const result = [];
  for (const session of sessions) {
    if (session.startedAt < since) continue;
    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        const types = recordsForSet(sessions, session, exercise.exerciseId, set);
        if (types.length) result.push({ sessionId: session.sessionId, startedAt: session.startedAt, exerciseId: exercise.exerciseId, set, types });
      }
    }
  }
  // One entry per exercise and session: its last record-setting set.
  const unique = new Map();
  for (const record of result.sort((a, b) => a.startedAt - b.startedAt || a.set.order - b.set.order)) unique.set(`${record.sessionId}:${record.exerciseId}`, record);
  return [...unique.values()].sort((a, b) => b.startedAt - a.startedAt || b.set.order - a.set.order).slice(0, limit);
}
