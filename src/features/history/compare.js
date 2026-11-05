import { h } from '../../shared/dom.js';
import { t } from '../../i18n/i18n.js';
import { href } from '../../router.js';
import { fragment, navHeader } from '../../shared/ui.js';
import { barChart } from '../../shared/charts.js';
import { formatKg, formatShortDate, formatSigned } from '../../shared/format.js';
import { compareWithPrevious } from './analysis.js';
import { exerciseName, loadHistory, sessionName } from './history-model.js';
import { trendBadge } from './trend-badge.js';

const setText = (set) => (set ? t('session.setValues', { load: formatKg(set.load), reps: set.reps }) : '—');

/** Session × previous session of the same plan, exercise by exercise. */
export async function renderCompare({ params }) {
  const data = await loadHistory();
  const detail = data.detailsById.get(params.sessionId);
  const back = href('history', 'session', params.sessionId);
  const header = navHeader({ title: t('compare.title'), backHref: back, backLabel: detail ? sessionName(detail) : t('tab.history') });
  const comparison = detail ? compareWithPrevious(data.snapshots, detail.id) : null;
  if (!comparison || !comparison.hasPrevious) {
    return fragment(header, h('p', { class: 'set-list-empty', id: 'compare-empty' }, t(detail?.planId ? 'compare.noPrevious' : 'compare.adHoc')));
  }

  const rows = comparison.rows.filter((row) => row.current.best);
  const chart = barChart({
    title: t('compare.chartTitle'),
    summary: t('compare.chartSummary', { count: rows.length }),
    categories: rows.map((row) => ({ label: exerciseName(data, row.exerciseId), values: [row.current.tonnage, row.previous?.tonnage ?? null] })),
    series: [
      { name: t('compare.current'), className: 'series-1' },
      { name: t('compare.previous'), className: 'series-2' },
    ],
    formatValue: formatKg,
  });

  const sections = rows.map((row) => {
    const name = exerciseName(data, row.exerciseId);
    const previousDate = row.previous ? formatShortDate(row.previous.startedAt) : null;
    const table = h(
      'table',
      { class: 'compare-table numeric' },
      h('caption', { class: 'visually-hidden' }, t('compare.tableCaption', { name })),
      h(
        'thead',
        {},
        h('tr', {}, h('td', {}), h('th', { scope: 'col' }, t('compare.currentWithDate', { date: formatShortDate(detail.startedAt) })), h('th', { scope: 'col' }, previousDate ? t('compare.previousWithDate', { date: previousDate }) : t('compare.previous'))),
      ),
      h(
        'tbody',
        {},
        h('tr', {}, h('th', { scope: 'row' }, t('compare.bestSet')), h('td', {}, setText(row.current.best)), h('td', {}, setText(row.previous?.best))),
        h('tr', {}, h('th', { scope: 'row' }, t('summary.tonnage')), h('td', {}, formatKg(row.current.tonnage)), h('td', {}, row.previous ? formatKg(row.previous.tonnage) : '—')),
        h('tr', {}, h('th', { scope: 'row' }, t('summary.effectiveSets')), h('td', {}, String(row.current.sets)), h('td', {}, row.previous ? String(row.previous.sets) : '—')),
      ),
    );
    const deltas = row.deltas
      ? h(
          'ul',
          { class: 'delta-list' },
          h('li', {}, t('compare.load'), ' ', trendBadge(row.deltas.load.direction, t('units.kg', { value: formatSigned(row.deltas.load.value) }))),
          h('li', {}, t('compare.reps'), ' ', trendBadge(row.deltas.reps.direction, formatSigned(row.deltas.reps.value))),
          h('li', {}, t('summary.tonnage'), ' ', trendBadge(row.deltas.tonnage.direction, t('units.kg', { value: formatSigned(row.deltas.tonnage.value) }))),
        )
      : h('p', { class: 'field-hint' }, t('compare.noPreviousExercise'));
    const progress = row.progress === null ? null : h('p', { class: `progress-flag ${row.progress ? 'progress-yes' : 'progress-no'}` }, row.progress ? `✓ ${t('compare.progress')}` : `– ${t('compare.noProgress')}`);
    return h(
      'section',
      { class: 'group compare-exercise', 'aria-labelledby': `compare-${row.exerciseId}` },
      h('h2', { class: 'group-header', id: `compare-${row.exerciseId}` }, name),
      h('div', { class: 'compare-card' }, table, deltas, progress),
    );
  });

  return fragment(header, h('p', { class: 'session-meta' }, t('compare.subtitle', { name: sessionName(detail) })), chart, sections, h('p', { class: 'group-footer' }, t('compare.footer')));
}
