import { h } from '../../shared/dom.js';
import { icon } from '../../shared/icons.js';
import { t, tp } from '../../i18n/i18n.js';
import { href, navigate } from '../../router.js';
import { setFlash } from '../../shared/flash.js';
import { prescriptionText } from '../../shared/prescription.js';
import {
  button, confirmDialog, emptyRow, errorArea, flashBanner, fragment, group, linkButton, linkRow, navHeader, runAction, textField,
} from '../../shared/ui.js';
import { getRepository } from '../../data/app-data.js';
import { loadPlanDetail, movePlanItem } from './plans-model.js';

const NAME_MAX = 80;

export async function renderPlanDetail({ params, tabTitle }) {
  const { plan, items, hasHistory } = await loadPlanDetail(params.planId);
  const errors = errorArea();
  const here = href('plans', plan.id);

  const name = textField({ label: t('plans.field.name'), value: plan.name, name: 'name', required: true });
  const saveName = async () => {
    if (name.input.value.trim() === plan.name) return;
    const updated = await runAction(name.input, errors, async () => (await getRepository()).renamePlan(plan.id, name.input.value));
    if (updated) {
      plan.name = updated.name;
      name.input.value = updated.name;
      document.querySelector('.nav-title').textContent = updated.name;
    } else {
      name.input.value = plan.name;
    }
  };
  name.input.addEventListener('change', saveName);
  name.input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      name.input.blur();
    }
  });

  const itemRows = items.map(({ item, exercise }, index) => {
    const title = exercise?.name ?? t('plans.missingExercise');
    const move = (delta) => async (event) => {
      const trigger = event.currentTarget;
      await runAction(trigger, errors, () => movePlanItem(plan.id, item.id, delta));
      navigate(here);
    };
    return h(
      'li',
      { class: 'row row-link row-with-actions' },
      h(
        'a',
        { class: 'row-anchor', href: href('plans', plan.id, 'items', item.id) },
        h('span', { class: 'row-text' }, h('span', { class: 'row-title' }, title), h('span', { class: 'row-subtitle numeric' }, prescriptionText(item))),
      ),
      h(
        'span',
        { class: 'reorder-buttons' },
        button(icon('up', 'button-icon'), { onClick: move(-1), disabled: index === 0, attributes: { 'aria-label': t('a11y.moveUp', { name: title }), class: 'icon-button' } }),
        button(icon('down', 'button-icon'), { onClick: move(1), disabled: index === items.length - 1, attributes: { 'aria-label': t('a11y.moveDown', { name: title }), class: 'icon-button' } }),
      ),
    );
  });

  const duplicate = button(t('plans.duplicate'), {
    onClick: async (event) => {
      const trigger = event.currentTarget;
      const copyName = t('plans.copyName', { name: plan.name }).slice(0, NAME_MAX);
      const copy = await runAction(trigger, errors, async () => (await getRepository()).duplicatePlan(plan.id, { name: copyName }));
      if (copy) {
        setFlash(t('plans.duplicated'));
        navigate(href('plans', copy.id));
      }
    },
  });

  const archive = button(plan.isArchived ? t('plans.unarchive') : t('plans.archive'), {
    onClick: async (event) => {
      const trigger = event.currentTarget;
      const updated = await runAction(trigger, errors, async () => (await getRepository()).setPlanArchived(plan.id, !plan.isArchived));
      if (updated) {
        setFlash(updated.isArchived ? t('plans.archived') : t('plans.unarchived'));
        navigate(href('plans'));
      }
    },
  });

  const remove = hasHistory
    ? null
    : button(t('plans.delete'), {
        variant: 'destructive',
        onClick: async (event) => {
          const trigger = event.currentTarget;
          const confirmed = await confirmDialog({
            title: t('plans.deleteConfirmTitle', { name: plan.name }),
            message: t('plans.deleteConfirmMessage'),
            confirmLabel: t('plans.delete'),
            destructive: true,
          });
          if (!confirmed) return;
          const done = await runAction(trigger, errors, async () => {
            await (await getRepository()).deletePlan(plan.id);
            return true;
          });
          if (done) {
            setFlash(t('plans.deleted'));
            navigate(href('plans'));
          }
        },
      });

  return fragment(
    navHeader({ title: plan.name, backHref: href('plans'), backLabel: tabTitle }),
    flashBanner(),
    errors.element,
    h('div', { class: 'form' }, name.element),
    group(
      { header: tp('plans.exerciseCount', items.length) },
      ...(itemRows.length ? itemRows : [emptyRow(t('plans.noExercises'))]),
    ),
    h('div', { class: 'actions' }, linkButton(t('plans.addExercise'), href('plans', plan.id, 'add'), { variant: 'primary', id: 'add-exercise' })),
    h(
      'div',
      { class: 'actions actions-secondary' },
      duplicate,
      archive,
      remove,
    ),
    hasHistory ? h('p', { class: 'group-footer' }, t('plans.historyNote')) : null,
  );
}

