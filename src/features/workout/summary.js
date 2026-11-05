import { h } from '../../shared/dom.js';
import { t, tp } from '../../i18n/i18n.js';
import { href } from '../../router.js';
import { emptyRow, fragment, group, infoRow, linkButton, rootHeader } from '../../shared/ui.js';
import { formatDateTime, formatHoursMinutes, formatList, formatNumber } from '../../shared/format.js';
import { labelKey } from '../../data/enums.js';
import { loadSummary } from './session-model.js';

/** End-of-session summary: duration, tonnage, effective sets, sets per muscle group, records. */
export async function renderSummary({ params }) {
  const { detail, exercisesById, summary } = await loadSummary(params.sessionId);
  const kg = (value) => t('units.kg', { value: formatNumber(value) });
  const name = detail.planNameSnapshot || t('session.adHocName');
  const nameOf = (exerciseId) => exercisesById.get(exerciseId)?.name ?? detail.exercises.find((item) => item.exerciseId === exerciseId)?.exerciseNameSnapshot ?? '';

  return fragment(
    rootHeader(t('summary.title')),
    h('p', { class: 'session-meta numeric' }, t('common.pair', { first: name, second: formatDateTime(detail.startedAt) })),
    group(
      { id: 'summary-totals' },
      infoRow(t('summary.duration'), summary.durationMs === null ? t('summary.inProgress') : formatHoursMinutes(summary.durationMs)),
      infoRow(t('summary.tonnage'), kg(summary.tonnage)),
      infoRow(t('summary.effectiveSets'), String(summary.effectiveSets)),
    ),
    group(
      { header: t('summary.byGroup'), footer: t('summary.byGroupFooter'), id: 'summary-groups' },
      summary.setsByGroup.length
        ? summary.setsByGroup.map(([muscle, sets]) => infoRow(t(labelKey('muscle', muscle)), tp('summary.sets', sets, { value: formatNumber(sets) })))
        : emptyRow(t('summary.noSets')),
    ),
    group(
      { header: t('summary.records'), id: 'summary-records' },
      summary.records.length
        ? summary.records.map((record) =>
            infoRow(
              nameOf(record.exerciseId),
              t('summary.recordValue', {
                records: formatList(record.types.map((type) => t(`record.${type}`))),
                values: t('session.setValues', { load: kg(record.set.load), reps: record.set.reps }),
              }),
            ),
          )
        : emptyRow(t('summary.noRecords')),
    ),
    h('div', { class: 'actions' }, linkButton(t('summary.done'), href('home'), { variant: 'primary', id: 'summary-done' })),
  );
}
