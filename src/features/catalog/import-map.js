import { h } from '../../shared/dom.js';
import { t } from '../../i18n/i18n.js';
import { href, navigate } from '../../router.js';
import { button, errorArea, fragment, navHeader, selectField } from '../../shared/ui.js';
import { ImportTarget, REQUIRED_TARGETS } from '../../data/import/mapping.js';
import { buildReview } from '../../data/import/review.js';
import { getRepository } from '../../data/app-data.js';
import { importState } from './import-state.js';

const NOT_USED = '';

function sample(records, field) {
  if (!field) return '';
  const value = records.find((record) => record[field] !== undefined && record[field] !== null && record[field] !== '')?.[field];
  if (value === undefined) return '';
  const text = Array.isArray(value) ? value.join(', ') : String(value);
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
}

export function renderImportMap() {
  const state = importState();
  if (!state) {
    navigate(href('catalog', 'import'));
    return fragment();
  }
  const { fields, records } = state.parsed;
  const errors = errorArea();

  const controls = Object.values(ImportTarget).map((target) => {
    const required = REQUIRED_TARGETS.includes(target);
    const select = selectField({
      label: t(required ? 'import.target.required' : 'import.target.optional', { name: t(`import.target.${target}`) }),
      value: state.mapping[target] ?? NOT_USED,
      options: [{ value: NOT_USED, label: t('import.notUsed') }, ...fields.map((field) => ({ value: field, label: field }))],
      name: target,
    });
    const hint = h('p', { class: 'field-hint' });
    const updateHint = () => {
      const example = sample(records, select.select.value);
      hint.textContent = example ? t('import.example', { value: example }) : t(`import.targetHint.${target}`);
    };
    select.select.addEventListener('change', updateHint);
    updateHint();
    return { target, select: select.select, element: h('div', {}, select.element, hint) };
  });

  const next = button(t('common.continue'), { variant: 'primary', type: 'submit' });
  const form = h('form', { class: 'form', novalidate: true }, ...controls.map((control) => control.element), errors.element, next);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const mapping = Object.fromEntries(controls.map(({ target, select }) => [target, select.value || null]));
    const missing = REQUIRED_TARGETS.filter((target) => !mapping[target]);
    if (missing.length) {
      errors.show(t('import.error.requiredMapping'));
      return;
    }
    next.disabled = true;
    try {
      const existing = await (await getRepository()).listExercises({ includeArchived: true });
      state.mapping = mapping;
      state.review = buildReview(records, mapping, existing);
      navigate(href('catalog', 'import', 'review'));
    } catch (error) {
      errors.show(error);
    } finally {
      next.disabled = false;
    }
  });

  return fragment(
    navHeader({ title: t('import.mapTitle'), backHref: href('catalog', 'import'), backLabel: t('common.back') }),
    h('p', { class: 'step' }, t('import.step', { step: 1, total: 3 })),
    h('p', { class: 'screen-subtitle' }, t('import.fileSummary', { file: state.fileName, count: records.length })),
    form,
  );
}
