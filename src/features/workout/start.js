import { h } from '../../shared/dom.js';
import { t, tp } from '../../i18n/i18n.js';
import { href, navigate } from '../../router.js';
import { button, errorArea, flashBanner, fragment, linkButton, rootHeader, runAction } from '../../shared/ui.js';
import { emptyState } from '../../shared/empty-state.js';
import { fromLocalInputValue, toLocalInputValue } from '../../shared/datetime.js';
import { getRepository } from '../../data/app-data.js';
import { suggestNextPlan } from '../../metrics/index.js';
import { validStart } from './inputs.js';

let fieldId = 0;

export async function renderStart({ tabTitle }) {
  const repository = await getRepository();
  const [plans, sessions] = await Promise.all([repository.listPlans({ includeArchived: true }), repository.listSessions()]);
  const active = plans.filter((plan) => !plan.isArchived);
  const counts = new Map(await Promise.all(active.map(async (plan) => [plan.id, (await repository.getPlan(plan.id)).exercises.length])));
  const suggestedId = suggestNextPlan(plans, sessions);
  const errors = errorArea();

  const id = `start-time-${++fieldId}`;
  const startInput = h('input', { id, type: 'datetime-local', class: 'input', value: toLocalInputValue(Date.now()) });
  startInput.value = toLocalInputValue(Date.now());
  const retro = h(
    'details',
    { class: 'disclosure' },
    h('summary', {}, t('start.otherTime')),
    h('div', { class: 'field' }, h('label', { for: id, class: 'field-label' }, t('start.startedAt')), startInput),
    h('p', { class: 'field-hint' }, t('start.otherTimeHint')),
  );

  const start = (planId) => async (event) => {
    const trigger = event.currentTarget;
    const startedAt = retro.open ? fromLocalInputValue(startInput.value) : Date.now();
    if (!validStart(startedAt)) {
      errors.show(t('errors.field.startedAt'));
      return;
    }
    const session = await runAction(trigger, errors, async () => (await getRepository()).startSession({ planId, startedAt }));
    if (session) navigate(href('workout'));
  };

  const planButton = (plan, variant) =>
    button(
      h('span', { class: 'start-plan' }, h('span', { class: 'start-plan-name' }, plan.name), h('span', { class: 'start-plan-count' }, tp('plans.exerciseCount', counts.get(plan.id)))),
      { variant, onClick: start(plan.id), attributes: { 'aria-label': t('start.startPlan', { name: plan.name }), class: 'start-button' } },
    );

  const suggested = active.find((plan) => plan.id === suggestedId);
  const others = active.filter((plan) => plan.id !== suggestedId);

  return fragment(
    rootHeader(tabTitle),
    flashBanner(),
    errors.element,
    active.length === 0
      ? fragment(
          emptyState({ titleKey: 'workout.empty.title', messageKey: 'start.noPlans', iconName: 'workout' }),
          h('div', { class: 'actions' }, linkButton(t('plans.new'), href('plans', 'new'), { variant: 'primary' })),
        )
      : fragment(
          h('section', { class: 'group', 'aria-labelledby': 'start-suggested' }, h('h2', { class: 'group-header', id: 'start-suggested' }, t('start.suggested')), planButton(suggested, 'primary')),
          others.length
            ? h('section', { class: 'group start-others', 'aria-labelledby': 'start-others' }, h('h2', { class: 'group-header', id: 'start-others' }, t('start.otherPlans')), others.map((plan) => planButton(plan, 'secondary')))
            : null,
        ),
    h('div', { class: 'actions' }, button(t('start.adHoc'), { onClick: start(null), id: 'start-ad-hoc' })),
    retro,
  );
}

