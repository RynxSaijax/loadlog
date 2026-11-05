import { h } from '../../shared/dom.js';
import { t, tp } from '../../i18n/i18n.js';
import { href, navigate } from '../../router.js';
import { button, confirmDialog, errorArea, formDialog, fragment, linkButton, rootHeader, runAction, stepper } from '../../shared/ui.js';
import { formatDuration, formatHoursMinutes, formatList, formatNumber, formatShortDate, formatTime } from '../../shared/format.js';
import { onLongPress, onSwipe } from '../../shared/gestures.js';
import { fromLocalInputValue, toLocalInputValue } from '../../shared/datetime.js';
import { labelKey, SetType } from '../../data/enums.js';
import { isEffective } from '../../metrics/index.js';
import { haptic, toast } from '../../services/feedback.js';
import { askNotificationPermissionOnce, extendRestTimer, onRestTimerChange, remainingSeconds, restTimer, startRestTimer, stopRestTimer } from '../../services/rest-timer.js';
import { keypad } from './keypad.js';
import { parseLoad, parseReps, validStart } from './inputs.js';
import {
  adjustDraftLoad, changeSetRir, changeSetType, changeStart, confirmSet, deleteSet, discardSession, endDropSet, finishSession,
  loadSessionState, setFocus, setKeypad, startDropSet, uiState, updateDraft,
} from './session-model.js';

const REST_EXTENSION_SECONDS = 15;
/** Types offered in the set menu. Drop-set steps are created through "Iniciar drop-set". */
const MENU_TYPES = [SetType.warmup, SetType.normal, SetType.failure, SetType.backOff];

const kg = (load) => t('units.kg', { value: formatNumber(load) });
const typeLabel = (type) => t(labelKey('setType', type));

/**
 * Active session screen. The returned element re-renders itself after each
 * change, keeping scroll position and keyboard/VoiceOver focus.
 */
export async function renderSession({ sessionId }) {
  const root = h('div', { class: 'session' });
  const view = { root, sessionId, ticker: null, restRegion: null, elapsed: null, unsubscribe: null };
  await draw(view);
  // The element is attached by the router after this returns, so only stop
  // listening once it has been on screen and then left it.
  const gone = () => {
    if (root.isConnected) view.mounted = true;
    return view.mounted && !root.isConnected;
  };
  view.unsubscribe = onRestTimerChange(() => {
    if (gone()) return cleanup(view);
    drawRest(view);
  });
  view.ticker = setInterval(() => {
    if (gone()) return cleanup(view);
    tick(view);
  }, 1000);
  return root;
}

function cleanup(view) {
  clearInterval(view.ticker);
  view.unsubscribe?.();
}

function tick(view) {
  if (view.elapsed) view.elapsed.textContent = t('session.elapsed', { time: formatHoursMinutes(Date.now() - view.state.detail.startedAt) });
  const timer = restTimer();
  const countdown = view.restRegion?.querySelector('.rest-countdown');
  if (timer && countdown) {
    const remaining = remainingSeconds(timer);
    countdown.textContent = formatDuration(remaining);
    view.restRegion.querySelector('.rest-progress-fill')?.style.setProperty('--progress', String(1 - remaining / timer.total));
  }
}

/** Rebuilds the screen from storage. */
async function draw(view) {
  const focusKey = document.activeElement?.dataset?.focusKey;
  const scroll = window.scrollY;
  const state = await loadSessionState(view.sessionId);
  if (state.detail.endedAt !== null) {
    navigate(href('workout', 'summary', state.detail.id));
    return;
  }
  view.state = state;
  view.root.replaceChildren(build(view, state));
  drawRest(view);
  if (view.root.isConnected) {
    window.scrollTo(0, scroll);
    const target = focusKey ? view.root.querySelector(`[data-focus-key="${focusKey}"]`) : null;
    target?.focus({ preventScroll: true });
  }
}

function build(view, state) {
  const errors = errorArea();
  view.errors = errors;
  const { detail, items } = state;
  const entry = items.find((candidate) => candidate.item.id === state.focusId) ?? null;

  return fragment(
    header(view, state),
    errors.element,
    items.length === 0 ? emptySession(view) : fragment(exerciseTabs(view, state), panel(view, state, entry)),
    h(
      'div',
      { class: 'session-actions' },
      linkButton(t('session.addExercise'), href('workout', 'add'), { id: 'session-add-exercise' }),
    ),
    h('div', { class: 'session-dock' }, (view.restRegion = h('div', { class: 'rest-region' })), entry ? editor(view, state, entry) : null),
    detail.exercises.some((item) => item.sets.length) ? null : h('div', { class: 'actions' }, button(t('session.discard'), { variant: 'destructive', onClick: (event) => discard(view, event) })),
  );
}

function header(view, state) {
  const { detail } = state;
  const title = detail.planNameSnapshot || t('session.adHocName');
  view.elapsed = h('span', { class: 'session-elapsed numeric' }, t('session.elapsed', { time: formatHoursMinutes(Date.now() - detail.startedAt) }));
  const startedToday = new Date(detail.startedAt).toDateString() === new Date().toDateString();
  const startText = startedToday ? formatTime(detail.startedAt) : t('common.pair', { first: formatShortDate(detail.startedAt), second: formatTime(detail.startedAt) });
  return fragment(
    rootHeader(title, button(t('session.finish'), { variant: 'primary', id: 'session-finish', onClick: (event) => finish(view, event) })),
    h(
      'p',
      { class: 'session-meta' },
      h('span', { class: 'numeric' }, t('session.startedAt', { time: startText })),
      ' · ',
      view.elapsed,
      ' ',
      button(t('session.changeStart'), { variant: 'plain', id: 'session-change-start', onClick: (event) => editStart(view, event) }),
    ),
  );
}

function emptySession() {
  return h(
    'section',
    { class: 'empty-state empty-state-compact' },
    h('h2', { class: 'empty-state-title' }, t('session.empty.title')),
    h('p', { class: 'empty-state-message' }, t('session.empty.message')),
  );
}

function progressText(entry) {
  const prescribed = entry.item.prescribedSetsSnapshot;
  return prescribed ? t('session.progress', { done: entry.effectiveDone, total: prescribed }) : String(entry.effectiveDone);
}

function exerciseTabs(view, state) {
  const tabs = state.items.map((entry) => {
    const selected = entry.item.id === state.focusId;
    const prescribed = entry.item.prescribedSetsSnapshot;
    const complete = prescribed ? entry.effectiveDone >= prescribed : entry.effectiveDone > 0;
    const tab = h(
      'button',
      {
        type: 'button',
        role: 'tab',
        class: ['exercise-tab', complete ? 'exercise-tab-complete' : null].filter(Boolean).join(' '),
        'aria-selected': selected ? 'true' : 'false',
        'aria-controls': 'session-panel',
        'aria-label': t('session.tabLabel', { name: entry.item.exerciseNameSnapshot, progress: progressText(entry) }),
        'data-focus-key': `tab-${entry.item.id}`,
        tabindex: selected ? '0' : '-1',
      },
      h('span', { class: 'exercise-tab-name' }, entry.item.exerciseNameSnapshot),
      h('span', { class: 'exercise-tab-progress numeric' }, progressText(entry)),
    );
    tab.addEventListener('click', () => focusExercise(view, entry.item.id));
    return tab;
  });
  const list = h('div', { class: 'exercise-tabs', role: 'tablist', 'aria-label': t('session.exercises') }, tabs);
  list.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    moveFocus(view, event.key === 'ArrowRight' ? 1 : -1, { keyboard: true });
  });
  requestAnimationFrame(() => list.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'center' }));
  return list;
}

async function focusExercise(view, sessionExerciseId) {
  setFocus(view.sessionId, sessionExerciseId);
  await draw(view);
}

async function moveFocus(view, direction, { keyboard = false } = {}) {
  const { items, focusId } = view.state;
  const index = items.findIndex((entry) => entry.item.id === focusId);
  const next = items[index + direction];
  if (!next) return;
  setFocus(view.sessionId, next.item.id);
  await draw(view);
  if (keyboard) view.root.querySelector(`[data-focus-key="tab-${next.item.id}"]`)?.focus();
}

function prescriptionLine(entry) {
  const { prescribedSetsSnapshot: sets, repMinSnapshot: min, repMaxSnapshot: max } = entry.item;
  if (!sets) return null;
  const reps = min === max ? t('prescription.single', { sets, reps: min }) : t('prescription.range', { sets, min, max });
  return t('session.prescription', { reps, rest: formatDuration(entry.restSeconds) });
}

function panel(view, state, entry) {
  if (!entry) return null;
  const equipment = entry.exercise?.equipment ?? 'other';
  const sets = entry.item.sets;
  const last = entry.lastTime?.best;
  const element = h(
    'section',
    { class: 'session-panel', id: 'session-panel', role: 'tabpanel', 'aria-labelledby': 'session-exercise-name' },
    h('h2', { class: 'session-exercise-name', id: 'session-exercise-name' }, entry.item.exerciseNameSnapshot),
    prescriptionLine(entry) ? h('p', { class: 'session-prescription numeric' }, prescriptionLine(entry)) : null,
    h(
      'p',
      { class: 'session-last numeric' },
      last
        ? t('session.lastTime', { load: kg(last.load), reps: last.reps, date: formatShortDate(entry.lastTime.startedAt) })
        : t('session.lastTimeNone'),
    ),
    h('p', { class: 'field-hint' }, t(`loadHint.${equipment}`)),
    sets.length
      ? h('ol', { class: 'set-list', 'aria-label': t('session.loggedSets') }, sets.map((set, index) => setRow(view, state, entry, set, index + 1)))
      : h('p', { class: 'set-list-empty' }, t('session.noSets')),
    entry.extraSet && entry.item.prescribedSetsSnapshot
      ? h('p', { class: 'notice', role: 'status', id: 'extra-set-notice' }, t('session.extraSet', { prescribed: entry.item.prescribedSetsSnapshot, number: entry.extraSet }))
      : null,
    entry.dropGroupId
      ? h(
          'div',
          { class: 'notice notice-drop', role: 'status' },
          h('p', {}, t('session.dropMode')),
          button(t('session.endDropSet'), { id: 'end-drop-set', onClick: () => leaveDropSet(view, entry) }),
        )
      : null,
  );
  onSwipe(element, { ignore: '.set-editor, .keypad, button', onLeft: () => moveFocus(view, 1), onRight: () => moveFocus(view, -1) });
  return element;
}

function setRow(view, state, entry, set, number) {
  const details = [];
  if (set.type !== SetType.normal) details.push(typeLabel(set.type));
  if (set.rir !== null && set.rir !== undefined) details.push(t('session.rirValue', { rir: set.rir }));
  const label = t('session.setRowLabel', { number, load: kg(set.load), reps: tp('session.reps', set.reps), details: details.length ? `, ${details.join(', ')}` : '' });
  const options = button(t('session.setOptions'), {
    variant: 'plain',
    attributes: { class: 'set-options', 'aria-label': t('session.setOptionsLabel', { number }), 'data-focus-key': `set-${set.id}` },
    onClick: () => openSetMenu(view, entry, set, number),
  });
  const row = h(
    'li',
    { class: ['set-row', isEffective(set.type) ? null : 'set-row-muted', set.type === SetType.dropSet ? 'set-row-drop' : null].filter(Boolean).join(' '), 'data-set-id': set.id },
    h(
      'span',
      { class: 'set-row-text', role: 'text', 'aria-label': label },
      h('span', { class: 'set-number numeric', 'aria-hidden': 'true' }, String(number)),
      h('span', { class: 'set-values numeric', 'aria-hidden': 'true' }, t('session.setValues', { load: kg(set.load), reps: set.reps })),
      details.length ? h('span', { class: 'set-badges', 'aria-hidden': 'true' }, details.join(' · ')) : null,
    ),
    options,
  );
  onLongPress(row, () => openSetMenu(view, entry, set, number));
  return row;
}

/** Sticky bottom editor: load and reps with ± and inline keypad, RIR, confirm. */
function editor(view, state, entry) {
  const { draft } = entry;
  const editing = state.keypad && state.keypad.itemId === entry.item.id ? state.keypad.field : null;
  const loadLabel = t('session.load');
  const repsLabel = t('session.repsLabel');

  const valueControl = (field, label, value, onMinus, onPlus, minusDisabled, plusDisabled) => {
    const minus = button('−', { variant: 'stepper', disabled: minusDisabled, attributes: { 'aria-label': t('a11y.decrease', { label }), 'data-focus-key': `${field}-minus` }, onClick: onMinus });
    const plus = button('+', { variant: 'stepper', disabled: plusDisabled, attributes: { 'aria-label': t('a11y.increase', { label }), 'data-focus-key': `${field}-plus` }, onClick: onPlus });
    const valueButton = button(value, {
      variant: 'value',
      attributes: { class: 'numeric', 'aria-label': t('session.editValue', { label, value }), 'data-focus-key': `${field}-value`, 'aria-expanded': editing === field ? 'true' : 'false' },
      onClick: async () => {
        setKeypad(view.sessionId, editing === field ? null : { itemId: entry.item.id, field });
        await draw(view);
        view.root.querySelector('.keypad [data-key="1"]')?.focus();
      },
    });
    return h('div', { class: 'value-control', role: 'group', 'aria-label': label }, h('span', { class: 'value-label' }, label), h('div', { class: 'value-row' }, minus, valueButton, plus));
  };

  const update = async (changes) => {
    updateDraft(view.sessionId, entry.item.id, changes);
    await draw(view);
  };

  const load = valueControl(
    'load',
    loadLabel,
    kg(draft.load),
    async () => {
      adjustDraftLoad(view.sessionId, entry, -1);
      await draw(view);
    },
    async () => {
      adjustDraftLoad(view.sessionId, entry, 1);
      await draw(view);
    },
    draft.load <= 0,
    draft.load >= 1000,
  );
  const reps = valueControl('reps', repsLabel, String(draft.reps), () => update({ reps: draft.reps - 1 }), () => update({ reps: draft.reps + 1 }), draft.reps <= 1, draft.reps >= 100);

  const rir = state.settings.showRir
    ? stepper({
        label: t('session.rir'),
        value: draft.rir ?? -1,
        min: -1,
        max: 10,
        format: (value) => (value < 0 ? t('session.rirNone') : String(value)),
        onChange: (value) => updateDraft(view.sessionId, entry.item.id, { rir: value < 0 ? null : value }),
      }).element
    : null;

  const keypadErrors = errorArea();
  const pad = editing
    ? keypad({
        label: editing === 'load' ? loadLabel : repsLabel,
        current: editing === 'load' ? formatNumber(draft.load) : String(draft.reps),
        allowDecimal: editing === 'load',
        onCancel: async () => {
          setKeypad(view.sessionId, null);
          await draw(view);
          view.root.querySelector(`[data-focus-key="${editing}-value"]`)?.focus();
        },
        onDone: async (text) => {
          if (text !== '') {
            const value = editing === 'load' ? parseLoad(text) : parseReps(text);
            if (value === null) {
              keypadErrors.show(t(editing === 'load' ? 'errors.field.load' : 'errors.field.reps'));
              return;
            }
            updateDraft(view.sessionId, entry.item.id, { [editing]: value });
          }
          setKeypad(view.sessionId, null);
          await draw(view);
          view.root.querySelector(`[data-focus-key="${editing}-value"]`)?.focus();
        },
      })
    : null;

  const confirm = button(t('session.confirmSet'), {
    variant: 'primary',
    id: 'confirm-set',
    attributes: { class: 'confirm-set', 'aria-label': t('session.confirmSetLabel', { load: kg(draft.load), reps: tp('session.reps', draft.reps) }), 'data-focus-key': 'confirm' },
    onClick: (event) => confirmDraft(view, entry, event.currentTarget),
  });

  const element = h(
    'section',
    { class: 'set-editor', 'aria-label': t('session.editorLabel', { name: entry.item.exerciseNameSnapshot }) },
    h('div', { class: 'set-editor-values' }, load, reps),
    rir,
    pad ? fragment(keypadErrors.element, pad) : null,
    confirm,
  );
  onSwipe(element, { ignore: '.keypad, .value-control, .stepper', onRight: () => !editing && confirmDraft(view, entry, confirm) });
  return element;
}

async function confirmDraft(view, entry, trigger) {
  if (trigger.disabled) return;
  askNotificationPermissionOnce();
  const result = await runAction(trigger, view.errors, () => confirmSet(view.state, entry));
  if (!result) return;
  if (result.startsRest) await startRestTimer(entry.restSeconds, entry.item.exerciseNameSnapshot);
  await draw(view);
  haptic(view.root.querySelector('.set-list .set-row:last-child') ?? view.root.querySelector('.set-editor'));
  if (result.records.length) {
    toast(t('session.recordToast', { records: formatList(result.records.map((type) => t(`record.${type}`))) }), { kind: 'record' });
  } else {
    toast(t('session.setSaved', { load: kg(result.set.load), reps: tp('session.reps', result.set.reps) }), { duration: 2000 });
  }
}

async function leaveDropSet(view, entry) {
  endDropSet(view.sessionId, entry.item.id);
  await draw(view);
  view.root.querySelector('[data-focus-key="confirm"]')?.focus();
}

function drawRest(view) {
  const region = view.restRegion;
  if (!region) return;
  const timer = restTimer();
  if (!timer) {
    region.replaceChildren();
    return;
  }
  const remaining = remainingSeconds(timer);
  const extend = button(t('rest.extend', { seconds: REST_EXTENSION_SECONDS }), { variant: 'plain', id: 'rest-extend', onClick: () => extendRestTimer(REST_EXTENSION_SECONDS) });
  const skip = button(t('rest.skip'), { variant: 'plain', id: 'rest-skip', onClick: () => stopRestTimer() });
  const fill = h('span', { class: 'rest-progress-fill' });
  fill.style.setProperty('--progress', String(1 - remaining / timer.total));
  region.replaceChildren(
    h(
      'div',
      { class: 'rest-bar', role: 'timer', 'aria-label': t('rest.label') },
      h('span', { class: 'rest-progress', 'aria-hidden': 'true' }, fill),
      h('span', { class: 'rest-title' }, t('rest.label')),
      h('span', { class: 'rest-countdown numeric' }, formatDuration(remaining)),
      extend,
      skip,
    ),
  );
}

async function finish(view, event) {
  const trigger = event.currentTarget;
  const setCount = view.state.detail.exercises.reduce((sum, item) => sum + item.sets.length, 0);
  if (setCount === 0) {
    await discard(view, event, trigger);
    return;
  }
  const confirmed = await confirmDialog({
    title: t('session.finishConfirmTitle'),
    message: tp('session.finishConfirmMessage', setCount),
    confirmLabel: t('session.finish'),
  });
  if (!confirmed) return;
  const ended = await runAction(trigger, view.errors, () => finishSession(view.state));
  if (!ended) return;
  await stopRestTimer();
  uiState(null);
  navigate(href('workout', 'summary', ended.id));
}

async function discard(view, event, trigger = event.currentTarget) {
  const confirmed = await confirmDialog({
    title: t('session.discardConfirmTitle'),
    message: t('session.discardConfirmMessage'),
    confirmLabel: t('session.discard'),
    destructive: true,
  });
  if (!confirmed) return;
  const done = await runAction(trigger, view.errors, async () => {
    await discardSession(view.sessionId);
    return true;
  });
  if (!done) return;
  await stopRestTimer();
  toast(t('session.discarded'));
  navigate(href('workout'));
}

async function editStart(view, event) {
  const trigger = event.currentTarget;
  const id = 'session-start-input';
  const input = h('input', { id, type: 'datetime-local', class: 'input' });
  input.value = toLocalInputValue(view.state.detail.startedAt);
  const errors = errorArea();
  const body = fragment(
    h('div', { class: 'field' }, h('label', { for: id, class: 'field-label' }, t('start.startedAt')), input),
    h('p', { class: 'field-hint' }, t('session.changeStartHint')),
    errors.element,
  );
  const startedAt = await formDialog({
    title: t('session.changeStart'),
    body,
    submitLabel: t('common.save'),
    onSubmit: () => {
      const value = fromLocalInputValue(input.value);
      if (!validStart(value)) {
        errors.show(t('errors.field.startedAt'));
        return undefined;
      }
      return value;
    },
  });
  if (startedAt === null) return;
  const saved = await runAction(trigger, view.errors, async () => {
    await changeStart(view.sessionId, startedAt);
    return true;
  });
  if (saved) {
    toast(t('session.startChanged'));
    await draw(view);
  }
}

async function openSetMenu(view, entry, set, number) {
  const { settings } = view.state;
  const types = set.type === SetType.dropSet ? [SetType.dropSet, ...MENU_TYPES] : MENU_TYPES;
  const name = `set-type-${set.id}`;
  const radios = types.map((type) => {
    const input = h('input', { type: 'radio', name, value: type, id: `${name}-${type}` });
    input.checked = type === set.type;
    return { type, input, label: h('label', { class: 'radio', for: `${name}-${type}` }, input, h('span', {}, typeLabel(type))) };
  });
  const rir = settings.showRir || set.rir !== null
    ? stepper({ label: t('session.rir'), value: set.rir ?? -1, min: -1, max: 10, format: (value) => (value < 0 ? t('session.rirNone') : String(value)) })
    : null;

  const sets = entry.item.sets;
  const isLast = sets.at(-1)?.id === set.id;
  const canStartDrop = isLast && isEffective(set.type) && set.type !== SetType.dropSet && !entry.dropGroupId;
  const extraActions = [];
  if (canStartDrop) extraActions.push({ label: t('session.startDropSet'), value: { action: 'drop' }, id: 'set-menu-drop' });
  extraActions.push({ label: t('session.deleteSet'), variant: 'destructive', value: { action: 'delete' }, id: 'set-menu-delete' });

  const result = await formDialog({
    title: t('session.setMenuTitle', { number, values: t('session.setValues', { load: kg(set.load), reps: set.reps }) }),
    body: fragment(
      h('fieldset', { class: 'field radio-group' }, h('legend', { class: 'field-label' }, t('session.setType')), radios.map((radio) => radio.label)),
      rir?.element,
    ),
    submitLabel: t('common.save'),
    extraActions,
    onSubmit: () => {
      const type = radios.find((radio) => radio.input.checked)?.type ?? set.type;
      const value = rir ? rir.get() : -1;
      return { action: 'save', type, rir: value < 0 ? null : value };
    },
  });
  if (!result) {
    view.root.querySelector(`[data-focus-key="set-${set.id}"]`)?.focus();
    return;
  }

  const ok = await runAction(view.root.querySelector(`[data-focus-key="set-${set.id}"]`) ?? view.root, view.errors, async () => {
    if (result.action === 'drop') {
      await startDropSet(view.state, entry, set);
      return 'drop';
    }
    if (result.action === 'delete') {
      await deleteSet(view.sessionId, entry.item.id, set);
      return 'deleted';
    }
    if (result.type !== set.type) await changeSetType(view.sessionId, set, result.type);
    if (rir && result.rir !== set.rir) await changeSetRir(set, result.rir);
    if (result.type !== set.type && set.type === SetType.dropSet && uiState(view.sessionId).dropGroups.get(entry.item.id) === set.dropGroupId) {
      endDropSet(view.sessionId, entry.item.id);
    }
    return 'saved';
  });
  if (!ok) return;
  if (ok === 'deleted') toast(t('session.setDeleted', { number }));
  if (ok === 'drop') {
    await stopRestTimer();
    toast(t('session.dropStarted'));
  }
  await draw(view);
  view.root.querySelector('[data-focus-key="confirm"]')?.focus();
}
