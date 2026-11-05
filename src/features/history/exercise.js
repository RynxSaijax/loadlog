import { h } from '../../shared/dom.js';
import { t, tp } from '../../i18n/i18n.js';
import { href } from '../../router.js';
import { emptyRow, fragment, group, infoRow, linkRow, navHeader, searchField } from '../../shared/ui.js';
import { lineChart } from '../../shared/charts.js';
import { formatKg, formatNumber, formatShortDate } from '../../shared/format.js';
import { exerciseOverview } from './analysis.js';
import { DomainError, ErrorCode } from '../../data/errors.js';
import { exerciseName, loadHistory, planName } from './history-model.js';

const setText = (set) => t('session.setValues', { load: formatKg(set.load), reps: set.reps });
const REPS_AT_LOAD_SHOWN = 8;

/** Exercises with history, most recently trained first. */
export async function renderExerciseList() {
  const data = await loadHistory();
  const lastByExercise = new Map();
  for (const snapshot of [...data.snapshots].sort((a, b) => a.startedAt - b.startedAt)) {
    for (const exercise of snapshot.exercises) {
      if (exercise.sets.length) lastByExercise.set(exercise.exerciseId, snapshot.startedAt);
    }
  }
  const entries = [...lastByExercise.entries()].sort((a, b) => b[1] - a[1]).map(([exerciseId, last]) => ({ exerciseId, last, name: exerciseName(data, exerciseId) }));
  const list = h('ul', { class: 'group-list' });
  const draw = (text) => {
    const needle = text.trim().toLocaleLowerCase('pt-BR');
    const visible = entries.filter((entry) => !needle || entry.name.toLocaleLowerCase('pt-BR').includes(needle));
    list.replaceChildren(
      ...(visible.length
        ? visible.map((entry) => linkRow({ target: href('history', 'exercise', entry.exerciseId), title: entry.name, subtitle: t('history.exercises.last', { date: formatShortDate(entry.last) }) }))
        : [emptyRow(t('catalog.noResults'))]),
    );
  };
  draw('');
  const search = searchField({ label: t('catalog.search'), onInput: draw });
  search.input.placeholder = t('catalog.search');
  return fragment(
    navHeader({ title: t('history.exercises.title'), backHref: href('history'), backLabel: t('tab.history') }),
    entries.length ? fragment(search.element, h('section', { class: 'group' }, list)) : h('p', { class: 'set-list-empty' }, t('history.exercises.empty')),
  );
}

/** Exercise screen: records, last time, progress per plan, chart and executions. */
export async function renderExercise({ params }) {
  const data = await loadHistory();
  const name = exerciseName(data, params.exerciseId);
  if (!name) throw new DomainError(ErrorCode.notFound, `exercise ${params.exerciseId} has no history`, { kind: 'exercise', id: params.exerciseId });
  const overview = exerciseOverview(data.snapshots, params.exerciseId);
  const header = navHeader({ title: name, backHref: href('history', 'exercises'), backLabel: t('history.exercises.title') });
  if (overview.executions.length === 0) {
    return fragment(header, h('p', { class: 'set-list-empty' }, t('exercise.history.empty')));
  }

  const { records, last } = overview;
  const alerts = overview.byPlan
    .filter((entry) => entry.stagnation.isStagnant)
    .map((entry) => h('p', { class: 'notice notice-warning', role: 'status' }, t('exercise.history.stagnant', { plan: planName(data, entry.planId, t('session.adHocName')), count: entry.stagnation.streak })));

  const chart = lineChart({
    title: t('exercise.history.chartTitle'),
    summary: t('exercise.history.chartSummary', {
      count: overview.chart.length,
      first: formatKg(Math.round(overview.chart[0].oneRepMax ?? 0)),
      last: formatKg(Math.round(overview.chart.at(-1).oneRepMax ?? 0)),
    }),
    series: [
      { name: t('exercise.history.oneRepMax'), className: 'series-1', points: overview.chart.map((point) => ({ x: point.x, y: point.oneRepMax === null ? null : Math.round(point.oneRepMax * 10) / 10, flagged: point.lowConfidence })) },
      { name: t('exercise.history.averageLoad'), className: 'series-2', points: overview.chart.map((point) => ({ x: point.x, y: point.averageLoad === null ? null : Math.round(point.averageLoad * 10) / 10 })) },
    ],
    formatX: formatShortDate,
    formatY: (value) => formatNumber(value),
    flaggedNote: t('exercise.history.lowConfidence'),
  });

  const progressRows = overview.byPlan.map((entry) =>
    infoRow(
      planName(data, entry.planId, t('session.adHocName')),
      entry.lastProgress === null ? t('exercise.history.progressFirst') : entry.lastProgress ? `✓ ${t('exercise.history.progressYes')}` : `– ${t('exercise.history.progressNo')}`,
    ),
  );

  const executions = [...overview.executions].reverse().map((execution) => {
    const detail = data.detailsById.get(execution.sessionId);
    return linkRow({
      target: href('history', 'session', execution.sessionId),
      title: setText(execution.best),
      subtitle: t('exercise.history.executionLine', {
        date: formatShortDate(execution.startedAt),
        plan: detail?.planNameSnapshot || t('session.adHocName'),
        sets: tp('history.sets', execution.sets),
        tonnage: formatKg(execution.tonnage),
      }),
    });
  });

  return fragment(
    header,
    alerts,
    group(
      { header: t('exercise.history.records'), id: 'exercise-records' },
      infoRow(t('exercise.history.bestSet'), setText(overview.bestSet)),
      infoRow(t('record.maxLoad'), formatKg(records.maxLoad.load)),
      infoRow(t('record.estimatedOneRepMax'), records.bestOneRepMax ? t('exercise.history.oneRepMaxValue', { value: formatKg(Math.round(records.bestOneRepMax.value * 10) / 10), set: setText(records.bestOneRepMax.set) }) : t('exercise.history.oneRepMaxNone')),
      infoRow(t('exercise.history.lastTime'), t('exercise.history.lastTimeValue', { set: setText(last.best), date: formatShortDate(last.startedAt) })),
    ),
    progressRows.length ? group({ header: t('exercise.history.progressHeader'), footer: t('exercise.history.progressFooter'), id: 'exercise-progress' }, progressRows) : null,
    chart,
    group(
      { header: t('exercise.history.repsAtLoad'), id: 'exercise-reps-at-load' },
      records.repsAtLoad.slice(0, REPS_AT_LOAD_SHOWN).map((set) => infoRow(formatKg(set.load), tp('session.reps', set.reps))),
    ),
    group({ header: t('exercise.history.executions'), id: 'exercise-executions' }, executions),
  );
}
