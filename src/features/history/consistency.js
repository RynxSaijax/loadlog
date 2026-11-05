import { h } from '../../shared/dom.js';
import { t, tp } from '../../i18n/i18n.js';
import { href } from '../../router.js';
import { fragment, navHeader } from '../../shared/ui.js';
import { formatDayDate, formatShortDate } from '../../shared/format.js';
import { consistencyCalendar } from './analysis.js';
import { loadHistory } from './history-model.js';

export const HEATMAP_WEEKS = 16;
const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function level(count) {
  return Math.min(count, 3);
}

/** Calendar heatmap: one column per ISO week, one cell per day. */
export async function renderConsistency() {
  const data = await loadHistory();
  const calendar = consistencyCalendar(data.snapshots, Date.now(), HEATMAP_WEEKS);
  const summary = t('consistency.summary', {
    days: tp('consistency.days', calendar.activeDays),
    sessions: tp('history.sessions', calendar.totalSessions),
    weeks: HEATMAP_WEEKS,
  });

  const cells = [];
  for (const [row, key] of WEEKDAY_KEYS.entries()) {
    cells.push(h('span', { class: 'heatmap-weekday', 'aria-hidden': 'true' }, row % 2 === 0 ? t(`weekday.short.${key}`) : ''));
    for (const column of calendar.columns) {
      const day = column.days[row];
      cells.push(h('span', { class: `heatmap-cell level-${day.future ? 'future' : level(day.count)}`, 'data-count': day.count, title: `${formatDayDate(day.date)}: ${tp('history.sessions', day.count)}` }));
    }
  }
  const grid = h('div', { class: 'heatmap', role: 'img', 'aria-label': summary }, cells);
  grid.style.setProperty('--weeks', String(HEATMAP_WEEKS));

  const weeks = [...calendar.columns].reverse().map((column) => {
    const count = column.days.reduce((sum, day) => sum + day.count, 0);
    return h('tr', {}, h('th', { scope: 'row' }, formatShortDate(column.start)), h('td', {}, String(count)));
  });

  return fragment(
    navHeader({ title: t('consistency.title'), backHref: href('history'), backLabel: t('tab.history') }),
    h('p', { class: 'session-meta', id: 'consistency-summary' }, summary),
    h('figure', { class: 'chart' }, grid, h(
      'div',
      { class: 'heatmap-legend', 'aria-hidden': 'true' },
      t('consistency.less'),
      [0, 1, 2, 3].map((value) => h('span', { class: `heatmap-cell level-${value}` })),
      t('consistency.more'),
    )),
    h(
      'details',
      { class: 'chart-data' },
      h('summary', {}, t('chart.showData')),
      h('table', { class: 'data-table numeric' }, h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, t('consistency.weekOf')), h('th', { scope: 'col' }, t('consistency.sessionsColumn')))), h('tbody', {}, weeks)),
    ),
  );
}
