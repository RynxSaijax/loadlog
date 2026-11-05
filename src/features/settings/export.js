import { h } from '../../shared/dom.js';
import { t, tp } from '../../i18n/i18n.js';
import { href } from '../../router.js';
import { button, errorArea, fragment, navHeader, runAction } from '../../shared/ui.js';
import { toast } from '../../services/feedback.js';
import { fromLocalInputValue, toLocalInputValue } from '../../shared/datetime.js';
import { exportCsv, exportPeriodPdf } from '../export/export-actions.js';

const DAY_MS = 86_400_000;
const dayValue = (timestamp) => toLocalInputValue(timestamp).slice(0, 10);
const parseDay = (value) => fromLocalInputValue(`${value}T12:00`);

function resultMessage(result) {
  if (result === 'shared') return t('export.shared');
  if (result === 'downloaded') return t('export.downloaded');
  return null;
}

/** Exports: CSV of every set and a PDF of a period. */
export function renderExport() {
  const errors = errorArea();
  const csv = button(t('export.csv.button'), {
    variant: 'primary',
    id: 'export-csv',
    onClick: async (event) => {
      const result = await runAction(event.currentTarget, errors, () => exportCsv());
      if (resultMessage(result)) toast(resultMessage(result));
    },
  });

  const from = h('input', { id: 'export-from', type: 'date', class: 'input' });
  const to = h('input', { id: 'export-to', type: 'date', class: 'input' });
  from.value = dayValue(Date.now() - 29 * DAY_MS);
  to.value = dayValue(Date.now());
  const pdf = button(t('export.pdf.button'), {
    id: 'export-pdf',
    onClick: async (event) => {
      const fromDay = parseDay(from.value);
      const toDay = parseDay(to.value);
      if (fromDay === null || toDay === null || toDay < fromDay) {
        errors.show(t('errors.field.period'));
        return;
      }
      const outcome = await runAction(event.currentTarget, errors, () => exportPeriodPdf(fromDay, toDay));
      if (!outcome) return;
      if (outcome.count === 0) toast(t('export.pdf.emptyPeriod'));
      else if (resultMessage(outcome.result)) toast(`${resultMessage(outcome.result)} ${tp('history.sessions', outcome.count)}.`);
    },
  });

  return fragment(
    navHeader({ title: t('export.title'), backHref: href('settings'), backLabel: t('tab.settings') }),
    errors.element,
    h(
      'section',
      { class: 'group', 'aria-labelledby': 'export-csv-title' },
      h('h2', { class: 'group-header', id: 'export-csv-title' }, t('export.csv.title')),
      h('div', { class: 'card' }, h('p', { class: 'card-detail' }, t('export.csv.description')), csv),
    ),
    h(
      'section',
      { class: 'group', 'aria-labelledby': 'export-pdf-title' },
      h('h2', { class: 'group-header', id: 'export-pdf-title' }, t('export.pdf.title')),
      h(
        'div',
        { class: 'card' },
        h('p', { class: 'card-detail' }, t('export.pdf.description')),
        h('div', { class: 'field' }, h('label', { for: 'export-from', class: 'field-label' }, t('export.pdf.from')), from),
        h('div', { class: 'field' }, h('label', { for: 'export-to', class: 'field-label' }, t('export.pdf.to')), to),
        pdf,
      ),
    ),
    h('p', { class: 'group-footer' }, t('export.footer')),
  );
}
