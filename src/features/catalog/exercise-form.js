import { h } from '../../shared/dom.js';
import { t } from '../../i18n/i18n.js';
import { href, navigate } from '../../router.js';
import { setFlash } from '../../shared/flash.js';
import { formatList, formatNumber, parseDecimal } from '../../shared/format.js';
import {
  button, checkboxGroup, confirmDialog, errorArea, flashBanner, fragment, group, infoRow, navHeader, runAction, selectField, textField,
} from '../../shared/ui.js';
import { getRepository } from '../../data/app-data.js';
import { Equipment, ExerciseSource, MovementPattern, MuscleGroup, defaultIncrement, labelKey } from '../../data/enums.js';
import { DomainError, ErrorCode } from '../../data/errors.js';
import { addExerciseWithDefaults } from '../plans/plans-model.js';
import { loadExerciseUsage } from './catalog-model.js';
import { loadSettings } from '../../data/settings.js';

const options = (kind, values) => Object.values(values).map((value) => ({ value, label: t(labelKey(kind, value)) }));

function incrementField(exercise, equipmentSelect, increments) {
  const field = textField({
    label: t('exercise.field.increment'),
    value: exercise?.incrementOverride != null ? formatNumber(exercise.incrementOverride) : '',
    name: 'increment',
    inputMode: 'decimal',
    maxLength: 6,
  });
  const updatePlaceholder = () => {
    const equipment = equipmentSelect ? equipmentSelect.value : exercise.equipment;
    field.input.placeholder = t('exercise.field.incrementDefault', { value: formatNumber(increments[equipment] ?? defaultIncrement[equipment]) });
  };
  equipmentSelect?.addEventListener('change', updatePlaceholder);
  updatePlaceholder();
  return {
    element: h('div', {}, field.element, h('p', { class: 'field-hint' }, t('exercise.field.incrementHint'))),
    read() {
      const text = field.input.value.trim();
      if (text === '') return null;
      const value = parseDecimal(text);
      if (value === null) throw new DomainError(ErrorCode.validation, 'incrementOverride: not a number', { field: 'incrementOverride' });
      return value;
    },
  };
}

function editableFields(exercise, increments) {
  const name = textField({ label: t('exercise.field.name'), value: exercise?.name ?? '', name: 'name', required: true });
  const primary = selectField({ label: t('exercise.field.primary'), value: exercise?.primaryMuscle ?? MuscleGroup.chest, options: options('muscle', MuscleGroup), name: 'primary' });
  const secondary = checkboxGroup({ legend: t('exercise.field.secondary'), options: options('muscle', MuscleGroup), checked: exercise?.secondaryMuscles ?? [] });
  const equipment = selectField({ label: t('exercise.field.equipment'), value: exercise?.equipment ?? Equipment.barbell, options: options('equipment', Equipment), name: 'equipment' });
  const pattern = selectField({ label: t('exercise.field.pattern'), value: exercise?.movementPattern ?? MovementPattern.isolation, options: options('movement', MovementPattern), name: 'pattern' });
  const increment = incrementField(exercise, equipment.select, increments);

  const syncSecondary = () => {
    for (const input of secondary.inputs) {
      const isPrimary = input.value === primary.select.value;
      input.disabled = isPrimary;
      if (isPrimary) input.checked = false;
    }
  };
  primary.select.addEventListener('change', syncSecondary);
  syncSecondary();

  return {
    elements: [name.element, primary.element, secondary.element, equipment.element, pattern.element, increment.element],
    focus: () => name.input.focus(),
    read: () => ({
      name: name.input.value,
      primaryMuscle: primary.select.value,
      secondaryMuscles: secondary.values(),
      equipment: equipment.select.value,
      movementPattern: pattern.select.value,
      incrementOverride: increment.read(),
    }),
  };
}

export async function renderExerciseCreate({ query }) {
  const { increments } = await loadSettings();
  const planId = query.get('plan');
  const back = planId ? href('plans', planId, 'add') : href('catalog');
  const fields = editableFields(null, increments);
  const errors = errorArea();
  const save = button(t('exercise.create'), { variant: 'primary', type: 'submit' });
  const form = h('form', { class: 'form', novalidate: true }, ...fields.elements, errors.element, save);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const created = await runAction(save, errors, async () => (await getRepository()).createExercise({ ...fields.read(), source: ExerciseSource.custom }));
    if (!created) return;
    if (planId) {
      const item = await runAction(save, errors, () => addExerciseWithDefaults(planId, created.id));
      if (item) navigate(href('plans', planId, 'items', item.id));
      return;
    }
    setFlash(t('exercise.created'));
    navigate(href('catalog'));
  });
  queueMicrotask(fields.focus);
  return fragment(navHeader({ title: t('exercise.newTitle'), backHref: back, backLabel: t('common.back') }), form);
}

export async function renderExerciseEdit({ params }) {
  const { exercise, hasHistory, usedBy } = await loadExerciseUsage(params.exerciseId);
  const { increments } = await loadSettings();
  const repository = await getRepository();
  const errors = errorArea();
  const isBuiltin = exercise.source === ExerciseSource.builtin;
  const save = button(t('common.save'), { variant: 'primary', type: 'submit' });

  let body;
  let read;
  if (isBuiltin) {
    const increment = incrementField(exercise, null, increments);
    body = [
      group(
        { footer: t('exercise.builtinNote') },
        infoRow(t('exercise.field.primary'), t(labelKey('muscle', exercise.primaryMuscle))),
        infoRow(t('exercise.field.secondary'), formatList(exercise.secondaryMuscles.map((muscle) => t(labelKey('muscle', muscle)))) || t('common.none')),
        infoRow(t('exercise.field.equipment'), t(labelKey('equipment', exercise.equipment))),
        infoRow(t('exercise.field.pattern'), t(labelKey('movement', exercise.movementPattern))),
      ),
      increment.element,
    ];
    read = () => ({ incrementOverride: increment.read() });
  } else {
    const fields = editableFields(exercise, increments);
    body = fields.elements;
    read = fields.read;
  }

  const form = h('form', { class: 'form', novalidate: true }, ...body, errors.element, save);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const updated = await runAction(save, errors, async () => repository.updateExercise(exercise.id, read()));
    if (updated) {
      setFlash(t('common.saved'));
      navigate(href('catalog'));
    }
  });

  const archive = button(exercise.isArchived ? t('exercise.unarchive') : t('exercise.archive'), {
    onClick: async (event) => {
      const trigger = event.currentTarget;
      const updated = await runAction(trigger, errors, () => repository.setExerciseArchived(exercise.id, !exercise.isArchived));
      if (updated) {
        setFlash(updated.isArchived ? t('exercise.archived') : t('exercise.unarchived'));
        navigate(href('catalog'));
      }
    },
  });

  const canDelete = !isBuiltin && !hasHistory && usedBy.length === 0;
  const remove = canDelete
    ? button(t('exercise.delete'), {
        variant: 'destructive',
        onClick: async (event) => {
          const trigger = event.currentTarget;
          const confirmed = await confirmDialog({
            title: t('exercise.deleteConfirmTitle', { name: exercise.name }),
            confirmLabel: t('exercise.delete'),
            destructive: true,
          });
          if (!confirmed) return;
          const done = await runAction(trigger, errors, async () => {
            await repository.deleteExercise(exercise.id);
            return true;
          });
          if (done) {
            setFlash(t('exercise.deleted'));
            navigate(href('catalog'));
          }
        },
      })
    : null;

  let note = null;
  if (!isBuiltin && hasHistory) note = t('exercise.historyNote');
  else if (!isBuiltin && usedBy.length) note = t('exercise.usedByNote', { plans: formatList(usedBy.map((plan) => plan.name)) });

  return fragment(
    navHeader({ title: exercise.name, backHref: href('catalog'), backLabel: t('catalog.title') }),
    flashBanner(),
    form,
    h('div', { class: 'actions actions-secondary' }, archive, remove),
    note ? h('p', { class: 'group-footer' }, note) : null,
  );
}
