import { h } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';
import { t, tp } from '../../i18n/i18n.js';
import { href, navigate } from '../../router.js';
import { button, flashBanner, fragment, group, linkButton, linkRow, rootHeader, errorArea, runAction } from '../../shared/ui.js';
import { emptyState } from '../../shared/empty-state.js';
import { loadPlansOverview, movePlan } from './plans-model.js';

let reorderMode = false;

function reorderRow(entry, index, count, errors) {
  const name = entry.plan.name;
  const move = (delta) => async (event) => {
    const trigger = event.currentTarget;
    await runAction(trigger, errors, () => movePlan(entry.plan.id, delta));
    navigate(href('plans'));
  };
  return h(
    'li',
    { class: 'row' },
    h('span', { class: 'row-title' }, name),
    h(
      'span',
      { class: 'reorder-buttons' },
      button(icon('up', 'button-icon'), { onClick: move(-1), disabled: index === 0, attributes: { 'aria-label': t('a11y.moveUp', { name }), class: 'icon-button' } }),
      button(icon('down', 'button-icon'), { onClick: move(1), disabled: index === count - 1, attributes: { 'aria-label': t('a11y.moveDown', { name }), class: 'icon-button' } }),
    ),
  );
}

export async function renderPlans({ tabTitle }) {
  const { active, archived } = await loadPlansOverview();
  const errors = errorArea();
  if (active.length < 2) reorderMode = false;

  const planRows = active.map((entry, index) =>
    reorderMode
      ? reorderRow(entry, index, active.length, errors)
      : linkRow({ target: href('plans', entry.plan.id), title: entry.plan.name, subtitle: tp('plans.exerciseCount', entry.exerciseCount) }),
  );

  const reorderToggle =
    active.length >= 2
      ? button(reorderMode ? t('common.done') : t('plans.reorder'), {
          variant: 'plain',
          onClick: () => {
            reorderMode = !reorderMode;
            navigate(href('plans'));
          },
          attributes: { 'aria-pressed': String(reorderMode) },
        })
      : null;

  return fragment(
    rootHeader(tabTitle, linkButton(t('plans.new'), href('plans', 'new'), { variant: 'primary', id: 'new-plan' })),
    flashBanner(),
    errors.element,
    active.length === 0
      ? emptyState({ titleKey: 'plans.empty.title', messageKey: 'plans.empty.message', iconName: 'plans' })
      : fragment(h('div', { class: 'toolbar' }, reorderToggle), group({ header: t('plans.section.active') }, ...planRows)),
    group({}, linkRow({ target: href('catalog'), title: t('catalog.title'), subtitle: t('catalog.subtitle') })),
    archived.length
      ? h(
          'details',
          { class: 'disclosure' },
          h('summary', {}, tp('plans.archivedCount', archived.length)),
          group({}, ...archived.map((entry) => linkRow({ target: href('plans', entry.plan.id), title: entry.plan.name, subtitle: tp('plans.exerciseCount', entry.exerciseCount) }))),
        )
      : null,
  );
}
