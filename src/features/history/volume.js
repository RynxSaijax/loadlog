import { h } from '../../shared/dom.js';
import { t } from '../../i18n/i18n.js';
import { href } from '../../router.js';
import { fragment, navHeader } from '../../shared/ui.js';
import { barChart } from '../../shared/charts.js';
import { formatKg, formatNumber, formatShortDate, formatSigned } from '../../shared/format.js';
import { labelKey } from '../../data/enums.js';
import { TREND_WEEKS, weeklyVolume } from './analysis.js';
import { isoWeek } from '../../metrics/index.js';
import { loadHistory } from './history-model.js';
import { trendBadge } from './trend-badge.js';

const sets = (value) => formatNumber(Math.round(value * 10) / 10);

/** Weekly volume per muscle group (4.7) and trends (4.8). */
export async function renderVolume() {
  const data = await loadHistory();
  const now = Date.now();
  const volume = weeklyVolume(data.snapshots, now);
  const header = navHeader({ title: t('volume.title'), backHref: href('history'), backLabel: t('tab.history') });
  if (volume.length === 0) return fragment(header, h('p', { class: 'set-list-empty' }, t('volume.empty')));

  const chart = barChart({
    title: t('volume.chartTitle'),
    summary: t('volume.chartSummary', { count: volume.length }),
    categories: volume.map((entry) => ({ label: t(labelKey('muscle', entry.group)), values: [entry.current.sets, entry.previous.sets, entry.average.sets] })),
    series: [
      { name: t('volume.current'), className: 'series-1' },
      { name: t('volume.previous'), className: 'series-3' },
      { name: t('volume.average'), className: 'series-2' },
    ],
    formatValue: sets,
  });

  const rows = volume.map((entry) => {
    const trend = entry.trend
      ? trendBadge(entry.trend.direction, t('volume.trendValue', { value: formatSigned(Math.round(entry.trend.slope * 100) / 100) }))
      : h('span', { class: 'trend trend-none' }, t('volume.insufficient'));
    return h(
      'li',
      { class: 'row volume-row' },
      h(
        'span',
        { class: 'row-text' },
        h('span', { class: 'row-title' }, t(labelKey('muscle', entry.group))),
        h('span', { class: 'row-subtitle numeric' }, t('volume.rowDetail', { current: sets(entry.current.sets), previous: sets(entry.previous.sets), average: sets(entry.average.sets), tonnage: formatKg(Math.round(entry.current.tonnage)) })),
      ),
      h('span', { class: 'row-value' }, trend),
    );
  });

  return fragment(
    header,
    h('p', { class: 'session-meta' }, t('volume.weekOf', { date: formatShortDate(isoWeek(now).start) })),
    chart,
    h(
      'section',
      { class: 'group', 'aria-labelledby': 'volume-groups' },
      h('h2', { class: 'group-header', id: 'volume-groups' }, t('volume.groupsHeader')),
      h('ul', { class: 'group-list' }, rows),
      h('p', { class: 'group-footer' }, t('volume.footer', { weeks: TREND_WEEKS })),
    ),
  );
}
