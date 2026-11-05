import { h } from '../../shared/dom.js';
import { t, tp } from '../../i18n/i18n.js';
import { href, navigate } from '../../router.js';
import { flashBanner, fragment, group, linkRow, rootHeader, selectField } from '../../shared/ui.js';
import { emptyState } from '../../shared/empty-state.js';
import { formatDayDate, formatHoursMinutes, formatKg, formatShortDate } from '../../shared/format.js';
import { groupByWeek, sessionTotals } from './analysis.js';
import { loadHistory, sessionName } from './history-model.js';

/** Filter value for sessions without a plan. */
export const AD_HOC_FILTER = 'avulso';

function filterFromQuery(query, plansById) {
  const value = query?.get('ficha');
  if (value === AD_HOC_FILTER) return { value, planId: null };
  if (value && plansById.has(value)) return { value, planId: value };
  return { value: '', planId: undefined };
}

/** Histórico tab: analysis shortcuts, plan filter and sessions grouped by ISO week. */
export async function renderHistory({ tabTitle, query }) {
  const data = await loadHistory();
  if (data.details.length === 0) {
    return fragment(rootHeader(tabTitle), flashBanner(), emptyState({ titleKey: 'history.empty.title', messageKey: 'history.empty.message', iconName: 'history' }));
  }
  const filter = filterFromQuery(query, data.plansById);
  const usedPlanIds = new Set(data.details.map((detail) => detail.planId));
  const options = [
    { value: '', label: t('history.filter.all') },
    ...data.plans.filter((plan) => usedPlanIds.has(plan.id)).map((plan) => ({ value: plan.id, label: plan.name })),
    ...(usedPlanIds.has(null) ? [{ value: AD_HOC_FILTER, label: t('session.adHocName') }] : []),
  ];
  const select = selectField({ label: t('history.filter.label'), value: filter.value, options, name: 'ficha' });
  select.select.addEventListener('change', () => {
    const value = select.select.value;
    navigate(value ? `${href('history')}?ficha=${encodeURIComponent(value)}` : href('history'));
  });

  const weeks = groupByWeek(data.snapshots, { planId: filter.planId });
  const weekSections = weeks.map((week) => {
    const rows = week.sessions.map((snapshot) => {
      const detail = data.detailsById.get(snapshot.sessionId);
      const totals = sessionTotals(snapshot);
      return linkRow({
        target: href('history', 'session', snapshot.sessionId),
        title: sessionName(detail),
        subtitle: t('history.sessionLine', {
          date: formatDayDate(snapshot.startedAt),
          duration: formatHoursMinutes(totals.durationMs),
          sets: tp('history.sets', totals.effectiveSets),
          tonnage: formatKg(totals.tonnage),
        }),
      });
    });
    return group({ header: t('history.week', { date: formatShortDate(week.start), count: tp('history.sessions', week.sessions.length) }) }, rows);
  });

  return fragment(
    rootHeader(tabTitle),
    flashBanner(),
    group(
      { header: t('history.analysis') },
      linkRow({ target: href('history', 'exercises'), title: t('history.exercises.title'), subtitle: t('history.exercises.subtitle') }),
      linkRow({ target: href('history', 'volume'), title: t('volume.title'), subtitle: t('volume.subtitle') }),
      linkRow({ target: href('history', 'consistency'), title: t('consistency.title'), subtitle: t('consistency.subtitle') }),
    ),
    h('div', { class: 'history-filter' }, select.element),
    weekSections.length ? weekSections : h('p', { class: 'set-list-empty' }, t('history.filter.empty')),
  );
}
