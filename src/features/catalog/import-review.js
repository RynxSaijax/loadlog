import { h } from '../../shared/dom.js';
import { t, tp } from '../../i18n/i18n.js';
import { href, navigate } from '../../router.js';
import { button, errorArea, fragment, navHeader, searchField } from '../../shared/ui.js';
import { ReviewStatus, reviewCounts } from '../../data/import/review.js';
import { normalizeName } from '../../data/normalize.js';
import { labelKey } from '../../data/enums.js';
import { importState } from './import-state.js';

let checkboxId = 0;

function entrySubtitle(entry) {
  if (entry.status === ReviewStatus.invalid) return t(`import.problem.${entry.problem}`);
  const details = t('common.pair', { first: t(labelKey('muscle', entry.item.primaryMuscle)), second: t(labelKey('equipment', entry.item.equipment)) });
  if (entry.status === ReviewStatus.new) return details;
  return t('common.pair', { first: t(`import.status.${entry.status}`), second: details });
}

export function renderImportReview() {
  const state = importState();
  if (!state?.review) {
    navigate(href('catalog', 'import'));
    return fragment();
  }
  const entries = state.review;
  const errors = errorArea();
  const summary = h('p', { class: 'screen-subtitle numeric', 'aria-live': 'polite' });
  const next = button('', { variant: 'primary', type: 'button', id: 'review-continue' });

  const refresh = () => {
    const counts = reviewCounts(entries);
    summary.textContent = t('import.reviewSummary', counts);
    next.textContent = tp('import.continueSelected', counts.selected);
    next.disabled = counts.selected === 0;
  };

  const items = entries.map((entry) => {
    const id = `review-${++checkboxId}`;
    const selectable = entry.status === ReviewStatus.new;
    const checkbox = h('input', { id, type: 'checkbox', disabled: !selectable, checked: entry.selected });
    checkbox.checked = entry.selected;
    checkbox.addEventListener('change', () => {
      entry.selected = checkbox.checked;
      refresh();
    });
    const element = h(
      'li',
      { class: `row review-row review-${entry.status}` },
      h(
        'label',
        { class: 'checkbox review-label', for: id },
        checkbox,
        h(
          'span',
          { class: 'row-text' },
          h('span', { class: 'row-title' }, entry.item?.name ?? (entry.sourceName || t('import.unnamed'))),
          h('span', { class: 'row-subtitle' }, entrySubtitle(entry)),
        ),
      ),
    );
    return { entry, checkbox, element, key: normalizeName(entry.item?.name ?? entry.sourceName) };
  });

  const list = h('ul', { class: 'group-list' }, items.map((item) => item.element));
  const search = searchField({
    label: t('import.filter'),
    onInput: (query) => {
      const words = normalizeName(query).split(' ').filter(Boolean);
      for (const item of items) item.element.hidden = !words.every((word) => item.key.includes(word));
    },
  });
  search.input.placeholder = t('import.filter');

  const setAll = (value) => () => {
    for (const item of items) {
      if (item.element.hidden || item.entry.status !== ReviewStatus.new) continue;
      item.entry.selected = value;
      item.checkbox.checked = value;
    }
    refresh();
  };

  next.addEventListener('click', () => navigate(href('catalog', 'import', 'confirm')));
  refresh();

  return fragment(
    navHeader({ title: t('import.reviewTitle'), backHref: href('catalog', 'import', 'map'), backLabel: t('common.back') }),
    h('p', { class: 'step' }, t('import.step', { step: 2, total: 3 })),
    summary,
    errors.element,
    search.element,
    h('div', { class: 'toolbar' }, button(t('import.selectAll'), { variant: 'plain', onClick: setAll(true) }), button(t('import.selectNone'), { variant: 'plain', onClick: setAll(false) })),
    h('section', { class: 'group' }, list),
    h('div', { class: 'actions sticky-actions' }, next),
  );
}
