import { h } from '../../shared/dom.js';
import { t, tp } from '../../i18n/i18n.js';
import { href, navigate } from '../../router.js';
import { button, confirmDialog, errorArea, flashBanner, fragment, linkRow, rootHeader, runAction, stepper } from '../../shared/ui.js';
import { setFlash } from '../../shared/flash.js';
import { formatDuration } from '../../shared/format.js';
import { APP_VERSION } from '../../version.js';
import { getRepository } from '../../data/app-data.js';
import { loadSettings, updateSettings } from '../../data/settings.js';
import { setHapticsEnabled } from '../../services/feedback.js';
import { stopRestTimer } from '../../services/rest-timer.js';
import { uiState } from '../workout/session-model.js';

function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isOfflineReady() {
  return Boolean(navigator.serviceWorker && navigator.serviceWorker.controller);
}

/** Debug tools, shown only when the address has "?debug" (e.g. …/index.html?debug#/settings). */
function isDebug() {
  return new URLSearchParams(window.location.search).has('debug');
}

function row(label, value, { numeric = false, id } = {}) {
  return h('li', { class: 'row' }, h('span', {}, label), h('span', { class: numeric ? 'row-value numeric' : 'row-value', id }, value));
}

function section(id, header, rows, footer) {
  return h(
    'section',
    { class: 'group', 'aria-labelledby': id },
    h('h2', { class: 'group-header', id }, header),
    h('ul', { class: 'group-list' }, rows),
    footer ? h('p', { class: 'group-footer' }, footer) : null,
  );
}

/** A labelled on/off switch that saves immediately and reverts on failure. */
function switchRow(id, label, checked, onChange) {
  const input = h('input', { id, type: 'checkbox', role: 'switch', class: 'switch' });
  input.checked = checked;
  input.addEventListener('change', async () => {
    input.disabled = true;
    try {
      await onChange(input.checked);
    } catch (error) {
      input.checked = !input.checked;
      console.error(error);
    } finally {
      input.disabled = false;
    }
  });
  return h('li', { class: 'row' }, h('label', { for: id, class: 'row-label' }, label), input);
}

function workoutGroup(settings) {
  const rest = stepper({
    label: t('settings.workout.defaultRest'),
    value: settings.defaultRestSeconds,
    min: 0,
    max: 600,
    step: 15,
    format: formatDuration,
    onChange: (value) => updateSettings({ defaultRestSeconds: value }),
  });
  return section(
    'settings-workout',
    t('settings.section.workout'),
    [
      switchRow('settings-show-rir', t('settings.workout.showRir'), settings.showRir, (value) => updateSettings({ showRir: value })),
      switchRow('settings-haptics', t('settings.workout.haptics'), settings.haptics, async (value) => {
        await updateSettings({ haptics: value });
        setHapticsEnabled(value);
      }),
      h('li', { class: 'row row-stepper' }, rest.element),
      linkRow({ target: href('settings', 'increments'), title: t('increments.title'), subtitle: t('increments.subtitle') }),
    ],
    t('settings.workout.footer'),
  );
}

async function fillDataRows(container) {
  const exercisesValue = container.querySelector('#settings-exercises');
  const persistentValue = container.querySelector('#settings-persistent');
  try {
    const repository = await getRepository();
    const exercises = await repository.listExercises();
    exercisesValue.textContent = String(exercises.length);
  } catch {
    exercisesValue.textContent = t('settings.data.unavailable');
  }
  let persisted = false;
  try {
    persisted = Boolean(await navigator.storage?.persisted?.());
  } catch {
    persisted = false;
  }
  persistentValue.textContent = t(`settings.data.persistent.${persisted ? 'yes' : 'no'}`);
}

async function eraseEverything(trigger, errors) {
  const confirmed = await confirmDialog({
    title: t('settings.erase.confirmTitle'),
    message: t('settings.erase.confirmMessage'),
    confirmLabel: t('settings.erase.confirm'),
    destructive: true,
  });
  if (!confirmed) return;
  const done = await runAction(trigger, errors, async () => {
    const repository = await getRepository();
    await repository.clearAll();
    await repository.seedCatalog();
    return true;
  });
  if (!done) return;
  await stopRestTimer();
  uiState(null);
  setHapticsEnabled(true);
  setFlash(t('settings.erase.done'));
  navigate(href('home'));
}

function dataGroup() {
  const errors = errorArea();
  const erase = button(t('settings.erase.button'), { variant: 'destructive', id: 'settings-erase', onClick: (event) => eraseEverything(event.currentTarget, errors) });
  const group = h(
    'section',
    { class: 'group', 'aria-labelledby': 'settings-data' },
    h('h2', { class: 'group-header', id: 'settings-data' }, t('settings.section.data')),
    h(
      'ul',
      { class: 'group-list' },
      linkRow({ target: href('settings', 'export'), title: t('export.title'), subtitle: t('export.subtitle') }),
      linkRow({ target: href('settings', 'backup'), title: t('backup.title'), subtitle: t('backup.subtitle') }),
      row(t('settings.data.exercises'), t('settings.data.loading'), { numeric: true, id: 'settings-exercises' }),
      row(t('settings.data.persistent'), t('settings.data.loading'), { id: 'settings-persistent' }),
    ),
    h('p', { class: 'group-footer' }, t('settings.data.footer')),
    errors.element,
    h('div', { class: 'actions settings-erase' }, erase),
  );
  fillDataRows(group);
  return group;
}

function debugGroup() {
  const errors = errorArea();
  const generate = button(t('settings.debug.sample'), {
    id: 'debug-sample',
    onClick: async (event) => {
      const trigger = event.currentTarget;
      const counts = await runAction(trigger, errors, async () => {
        const { generateSampleData } = await import('../../dev/sample-data.js');
        return generateSampleData(await getRepository(), Date.now());
      });
      if (!counts) return;
      setFlash(t('settings.debug.sampleDone', { sessions: tp('history.sessions', counts.sessions), plans: counts.plans }));
      navigate(href('history'));
    },
  });
  return h(
    'section',
    { class: 'group', 'aria-labelledby': 'settings-debug' },
    h('h2', { class: 'group-header', id: 'settings-debug' }, t('settings.section.debug')),
    errors.element,
    h('div', { class: 'actions' }, generate),
    h('p', { class: 'group-footer' }, t('settings.debug.footer')),
  );
}

export async function renderSettings({ tabTitle }) {
  const settings = await loadSettings();
  const yesNo = (flag, prefix) => t(`${prefix}.${flag ? 'yes' : 'no'}`);
  return fragment(
    rootHeader(tabTitle),
    flashBanner(),
    workoutGroup(settings),
    dataGroup(),
    section(
      'settings-about',
      t('settings.section.about'),
      [
        row(t('settings.about.version'), APP_VERSION, { numeric: true }),
        row(t('settings.about.installed'), yesNo(isInstalled(), 'settings.about.installed')),
        row(t('settings.about.offline'), yesNo(isOfflineReady(), 'settings.about.offline')),
        linkRow({ target: href('settings', 'privacy'), title: t('privacy.title'), subtitle: t('privacy.subtitle') }),
      ],
      t('settings.about.privacyNote'),
    ),
    isDebug() ? debugGroup() : null,
  );
}
