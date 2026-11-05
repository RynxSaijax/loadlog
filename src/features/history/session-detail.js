import { h } from '../../shared/dom.js';
import { t, tp } from '../../i18n/i18n.js';
import { href, navigate } from '../../router.js';
import { button, confirmDialog, errorArea, flashBanner, formDialog, fragment, group, infoRow, linkButton, navHeader, runAction, selectField, textField } from '../../shared/ui.js';
import { setFlash } from '../../shared/flash.js';
import { formatDateTime, formatHoursMinutes, formatKg, formatLongDate, formatNumber } from '../../shared/format.js';
import { fromLocalInputValue, toLocalInputValue } from '../../shared/datetime.js';
import { getRepository } from '../../data/app-data.js';
import { labelKey, SetType } from '../../data/enums.js';
import { isEffective } from '../../metrics/index.js';
import { parseLoad, parseReps, validStart } from '../workout/inputs.js';
import { sessionTotals } from './analysis.js';
import { toast } from '../../services/feedback.js';
import { exportSessionImage, exportSessionPdf } from '../export/export-actions.js';
import { loadHistory, sessionName } from './history-model.js';

const EDITABLE_TYPES = [SetType.warmup, SetType.normal, SetType.failure, SetType.backOff];

/** Detail of an ended session, with editing of times and sets. */
export async function renderSessionDetail({ params }) {
  const data = await loadHistory();
  const detail = data.detailsById.get(params.sessionId);
  if (!detail) {
    if (data.openSession?.id === params.sessionId) navigate(href('workout'));
    return (await getRepository()).getSessionDetail(params.sessionId).then(() => fragment());
  }
  const snapshot = data.snapshotsById.get(detail.id);
  const totals = sessionTotals(snapshot);
  const errors = errorArea();
  const reload = () => navigate(href('history', 'session', detail.id));

  const exerciseSections = detail.exercises.map((item) => {
    const rows = item.sets.map((set, index) => setRow(detail, item, set, index + 1, errors, reload));
    const add = button(t('history.addSet'), {
      variant: 'plain',
      attributes: { class: 'history-add-set', 'aria-label': t('history.addSetTo', { name: item.exerciseNameSnapshot }) },
      onClick: (event) => addSet(event.currentTarget, detail, item, errors, reload),
    });
    return h(
      'section',
      { class: 'group history-exercise', 'aria-labelledby': `exercise-${item.id}` },
      h(
        'h2',
        { class: 'group-header', id: `exercise-${item.id}` },
        h('a', { href: href('history', 'exercise', item.exerciseId), class: 'header-link' }, item.exerciseNameSnapshot),
      ),
      rows.length ? h('ol', { class: 'set-list' }, rows) : h('p', { class: 'set-list-empty' }, t('session.noSets')),
      add,
    );
  });

  return fragment(
    navHeader({ title: sessionName(detail), backHref: href('history'), backLabel: t('tab.history') }),
    h('p', { class: 'session-meta' }, formatLongDate(detail.startedAt)),
    flashBanner(),
    errors.element,
    group(
      { id: 'session-totals' },
      infoRow(t('history.startedAt'), formatDateTime(detail.startedAt)),
      infoRow(t('history.endedAt'), formatDateTime(detail.endedAt)),
      infoRow(t('summary.duration'), formatHoursMinutes(totals.durationMs)),
      infoRow(t('summary.tonnage'), formatKg(totals.tonnage)),
      infoRow(t('summary.effectiveSets'), String(totals.effectiveSets)),
    ),
    h(
      'div',
      { class: 'actions' },
      button(t('history.editTimes'), { id: 'edit-times', onClick: (event) => editTimes(event.currentTarget, detail, errors, reload) }),
      detail.planId ? linkButton(t('compare.open'), href('history', 'session', detail.id, 'compare'), { id: 'open-compare' }) : null,
    ),
    h(
      'div',
      { class: 'actions' },
      button(t('export.image.button'), { id: 'share-image', onClick: (event) => shareAs(event.currentTarget, errors, () => exportSessionImage(detail.id)) }),
      button(t('export.sessionPdf.button'), { id: 'share-pdf', onClick: (event) => shareAs(event.currentTarget, errors, () => exportSessionPdf(detail.id)) }),
    ),
    exerciseSections,
    h(
      'div',
      { class: 'actions' },
      button(t('history.deleteSession'), { variant: 'destructive', id: 'delete-session', onClick: (event) => deleteSession(event.currentTarget, detail, errors) }),
    ),
  );
}

function setLabel(set, number) {
  const details = [];
  if (set.type !== SetType.normal) details.push(t(labelKey('setType', set.type)));
  if (set.rir !== null && set.rir !== undefined) details.push(t('session.rirValue', { rir: set.rir }));
  return {
    visible: t('session.setValues', { load: formatKg(set.load), reps: set.reps }),
    badges: details.join(' · '),
    aria: t('session.setRowLabel', { number, load: formatKg(set.load), reps: tp('session.reps', set.reps), details: details.length ? `, ${details.join(', ')}` : '' }),
  };
}

function setRow(detail, item, set, number, errors, reload) {
  const label = setLabel(set, number);
  const edit = h(
    'button',
    { type: 'button', class: 'set-row-button', 'aria-label': t('history.editSetLabel', { label: label.aria }), 'data-set-id': set.id },
    h('span', { class: 'set-number numeric', 'aria-hidden': 'true' }, String(number)),
    h('span', { class: 'set-values numeric', 'aria-hidden': 'true' }, label.visible),
    label.badges ? h('span', { class: 'set-badges', 'aria-hidden': 'true' }, label.badges) : null,
  );
  edit.addEventListener('click', () => editSet(edit, detail, item, set, number, errors, reload));
  return h('li', { class: ['set-row', isEffective(set.type) ? null : 'set-row-muted', set.type === SetType.dropSet ? 'set-row-drop' : null].filter(Boolean).join(' ') }, edit);
}

/** Load, reps, type and RIR fields; `read()` returns values or shows an error and returns undefined. */
function setFields(initial) {
  const load = textField({ label: t('history.field.load'), value: formatNumber(initial.load), inputMode: 'decimal' });
  const reps = textField({ label: t('history.field.reps'), value: String(initial.reps), inputMode: 'numeric' });
  const types = initial.type === SetType.dropSet ? [SetType.dropSet, ...EDITABLE_TYPES] : EDITABLE_TYPES;
  const type = selectField({ label: t('session.setType'), value: initial.type, options: types.map((value) => ({ value, label: t(labelKey('setType', value)) })) });
  const rir = selectField({
    label: t('session.rir'),
    value: initial.rir === null || initial.rir === undefined ? '' : String(initial.rir),
    options: [{ value: '', label: t('session.rirNone') }, ...Array.from({ length: 11 }, (_, value) => ({ value: String(value), label: String(value) }))],
  });
  const errors = errorArea();
  return {
    element: fragment(load.element, reps.element, type.element, rir.element, errors.element),
    read() {
      const loadValue = parseLoad(load.input.value.trim());
      if (loadValue === null) {
        errors.show(t('errors.field.load'));
        load.input.focus();
        return undefined;
      }
      const repsValue = parseReps(reps.input.value.trim());
      if (repsValue === null) {
        errors.show(t('errors.field.reps'));
        reps.input.focus();
        return undefined;
      }
      return { load: loadValue, reps: repsValue, type: type.select.value, rir: rir.select.value === '' ? null : Number(rir.select.value) };
    },
  };
}

async function editSet(trigger, detail, item, set, number, errors, reload) {
  const fields = setFields(set);
  const result = await formDialog({
    title: t('history.editSetTitle', { number, name: item.exerciseNameSnapshot }),
    body: fields.element,
    submitLabel: t('common.save'),
    extraActions: [{ label: t('session.deleteSet'), variant: 'destructive', value: { action: 'delete' }, id: 'history-delete-set' }],
    onSubmit: () => {
      const values = fields.read();
      return values === undefined ? undefined : { action: 'save', values };
    },
  });
  if (!result) return;
  const done = await runAction(trigger, errors, async () => {
    const repository = await getRepository();
    if (result.action === 'delete') await repository.deleteSet(set.id);
    else {
      const { values } = result;
      const leavingDrop = set.type === SetType.dropSet && values.type !== SetType.dropSet;
      await repository.updateSet(set.id, { ...values, dropGroupId: leavingDrop ? null : set.dropGroupId });
    }
    return true;
  });
  if (!done) return;
  setFlash(result.action === 'delete' ? t('session.setDeleted', { number }) : t('history.setSaved', { number }));
  reload();
}

async function addSet(trigger, detail, item, errors, reload) {
  const last = item.sets.at(-1);
  const fields = setFields({ load: last?.load ?? 0, reps: last?.reps ?? item.repMinSnapshot ?? 8, type: SetType.normal, rir: null });
  const values = await formDialog({
    title: t('history.addSetTitle', { name: item.exerciseNameSnapshot }),
    body: fields.element,
    submitLabel: t('history.addSet'),
    onSubmit: () => fields.read(),
  });
  if (!values) return;
  const done = await runAction(trigger, errors, async () => {
    const completedAt = Math.min(detail.endedAt, Math.max(detail.startedAt, (last?.completedAt ?? detail.startedAt) + 1));
    await (await getRepository()).addSet(item.id, { ...values, completedAt });
    return true;
  });
  if (!done) return;
  setFlash(t('history.setAdded', { name: item.exerciseNameSnapshot }));
  reload();
}

async function editTimes(trigger, detail, errors, reload) {
  const startInput = h('input', { id: 'history-start', type: 'datetime-local', class: 'input' });
  const endInput = h('input', { id: 'history-end', type: 'datetime-local', class: 'input' });
  startInput.value = toLocalInputValue(detail.startedAt);
  endInput.value = toLocalInputValue(detail.endedAt);
  const fieldErrors = errorArea();
  const times = await formDialog({
    title: t('history.editTimes'),
    body: fragment(
      h('div', { class: 'field' }, h('label', { for: 'history-start', class: 'field-label' }, t('history.startedAt')), startInput),
      h('div', { class: 'field' }, h('label', { for: 'history-end', class: 'field-label' }, t('history.endedAt')), endInput),
      fieldErrors.element,
    ),
    submitLabel: t('common.save'),
    onSubmit: () => {
      const startedAt = fromLocalInputValue(startInput.value);
      const endedAt = fromLocalInputValue(endInput.value);
      if (!validStart(startedAt)) {
        fieldErrors.show(t('errors.field.startedAt'));
        return undefined;
      }
      if (endedAt === null || endedAt < startedAt || !validStart(endedAt)) {
        fieldErrors.show(t('errors.field.endedAt'));
        return undefined;
      }
      return { startedAt, endedAt };
    },
  });
  if (!times) return;
  const done = await runAction(trigger, errors, async () => {
    await (await getRepository()).updateSessionTimes(detail.id, times);
    return true;
  });
  if (!done) return;
  setFlash(t('history.timesSaved'));
  reload();
}

async function deleteSession(trigger, detail, errors) {
  const confirmed = await confirmDialog({
    title: t('history.deleteConfirmTitle'),
    message: t('history.deleteConfirmMessage'),
    confirmLabel: t('history.deleteSession'),
    destructive: true,
  });
  if (!confirmed) return;
  const done = await runAction(trigger, errors, async () => {
    await (await getRepository()).deleteSession(detail.id);
    return true;
  });
  if (!done) return;
  setFlash(t('history.deleted'));
  navigate(href('history'));
}

async function shareAs(trigger, errors, work) {
  const result = await runAction(trigger, errors, work);
  if (result === 'shared') toast(t('export.shared'));
  if (result === 'downloaded') toast(t('export.downloaded'));
}
