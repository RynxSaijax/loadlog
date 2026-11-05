import { h } from '../../shared/dom.js';
import { t } from '../../i18n/i18n.js';
import { href, navigate } from '../../router.js';
import { setFlash } from '../../shared/flash.js';
import { formatDuration } from '../../shared/format.js';
import { button, errorArea, fragment, navHeader, runAction, stepper } from '../../shared/ui.js';
import { getRepository } from '../../data/app-data.js';
import { labelKey } from '../../data/enums.js';
import { loadPlanItem, PRESCRIPTION_LIMITS } from './plans-model.js';

export async function renderPlanItem({ params }) {
  const entry = await loadPlanItem(params.planId, params.itemId);
  const back = href('plans', params.planId);
  if (!entry) {
    navigate(back);
    return fragment();
  }
  const { plan, item, exercise } = entry;
  const errors = errorArea();

  const sets = stepper({ label: t('prescription.sets'), value: item.prescribedSets, ...PRESCRIPTION_LIMITS.prescribedSets });
  let repMin = null;
  const repMax = stepper({
    label: t('prescription.repMax'),
    value: item.repMax,
    ...PRESCRIPTION_LIMITS.reps,
    onChange: (value) => {
      if (repMin.get() > value) repMin.set(value);
    },
  });
  repMin = stepper({
    label: t('prescription.repMin'),
    value: item.repMin,
    ...PRESCRIPTION_LIMITS.reps,
    onChange: (value) => {
      if (repMax.get() < value) repMax.set(value);
    },
  });
  const rest = stepper({ label: t('prescription.rest'), value: item.restSeconds, ...PRESCRIPTION_LIMITS.restSeconds, format: formatDuration });

  const save = button(t('common.save'), { variant: 'primary', type: 'submit' });
  const form = h('form', { class: 'form', novalidate: true }, sets.element, repMin.element, repMax.element, rest.element, errors.element, save);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const updated = await runAction(save, errors, async () =>
      (await getRepository()).updatePlanExercise(item.id, {
        prescribedSets: sets.get(),
        repMin: repMin.get(),
        repMax: repMax.get(),
        restSeconds: rest.get(),
      }),
    );
    if (updated) {
      setFlash(t('common.saved'));
      navigate(back);
    }
  });

  const remove = button(t('plans.removeExercise'), {
    variant: 'destructive',
    onClick: async (event) => {
      const trigger = event.currentTarget;
      const done = await runAction(trigger, errors, async () => {
        await (await getRepository()).removeExerciseFromPlan(item.id);
        return true;
      });
      if (done) {
        setFlash(t('plans.exerciseRemoved'));
        navigate(back);
      }
    },
  });

  const subtitle = exercise
    ? t('common.pair', { first: t(labelKey('muscle', exercise.primaryMuscle)), second: t(labelKey('equipment', exercise.equipment)) })
    : '';
  return fragment(
    navHeader({ title: exercise?.name ?? t('plans.missingExercise'), backHref: back, backLabel: plan.name }),
    subtitle ? h('p', { class: 'screen-subtitle' }, subtitle) : null,
    form,
    h('div', { class: 'actions actions-secondary' }, remove),
  );
}
