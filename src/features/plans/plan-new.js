import { h } from '../../shared/dom.js';
import { t } from '../../i18n/i18n.js';
import { href, navigate } from '../../router.js';
import { button, errorArea, fragment, navHeader, runAction, textField } from '../../shared/ui.js';
import { getRepository } from '../../data/app-data.js';

export function renderPlanNew({ tabTitle }) {
  const name = textField({ label: t('plans.field.name'), name: 'name', required: true, placeholder: t('plans.field.namePlaceholder') });
  const errors = errorArea();
  const submit = button(t('plans.create'), { variant: 'primary', type: 'submit' });
  const form = h('form', { class: 'form', novalidate: true }, name.element, errors.element, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const plan = await runAction(submit, errors, async () => (await getRepository()).createPlan({ name: name.input.value }));
    if (plan) navigate(href('plans', plan.id));
  });
  queueMicrotask(() => name.input.focus());
  return fragment(navHeader({ title: t('plans.newTitle'), backHref: href('plans'), backLabel: tabTitle }), form);
}
