import { h } from './dom.js';
import { icon } from './icons.js';
import { t } from '../i18n/i18n.js';
import { errorMessage } from './error-message.js';
import { takeFlash } from './flash.js';
import { DomainError } from '../data/errors.js';

let idCounter = 0;
const nextId = (prefix) => `${prefix}-${++idCounter}`;

/** Large title for tab roots, with optional trailing actions. */
export function rootHeader(title, ...actions) {
  return h('header', { class: 'screen-header' }, h('h1', { class: 'screen-title' }, title), actions.length ? h('div', { class: 'header-actions' }, actions) : null);
}

/** Header of a pushed screen: back link and title. */
export function navHeader({ title, backHref, backLabel }) {
  return h(
    'header',
    { class: 'nav-header' },
    h('a', { class: 'back-link', href: backHref }, icon('back', 'back-icon'), h('span', {}, backLabel)),
    h('h1', { class: 'nav-title' }, title),
  );
}

/** Pending one-shot message, rendered as a polite status banner. */
export function flashBanner() {
  const message = takeFlash();
  return message ? h('p', { class: 'banner', role: 'status' }, message) : null;
}

export function button(label, { variant = 'secondary', type = 'button', onClick, id, disabled = false, attributes = {} } = {}) {
  const { class: extraClass, ...rest } = attributes;
  const element = h('button', { class: ['button', `button-${variant}`, extraClass].filter(Boolean).join(' '), type, id, disabled, ...rest }, label);
  if (onClick) element.addEventListener('click', onClick);
  return element;
}

export function linkButton(label, target, { variant = 'secondary', id } = {}) {
  return h('a', { class: `button button-${variant}`, href: target, id }, label);
}

export function group({ header, footer, id } = {}, ...rows) {
  const headingId = header ? nextId('group') : null;
  return h(
    'section',
    { class: 'group', 'aria-labelledby': headingId, id },
    header ? h('h2', { class: 'group-header', id: headingId }, header) : null,
    h('ul', { class: 'group-list' }, rows),
    footer ? h('p', { class: 'group-footer' }, footer) : null,
  );
}

/** Tappable row that navigates. */
export function linkRow({ target, title, subtitle, trailing, attributes = {} }) {
  return h(
    'li',
    { class: 'row row-link' },
    h(
      'a',
      { class: 'row-anchor', href: target, ...attributes },
      h('span', { class: 'row-text' }, h('span', { class: 'row-title' }, title), subtitle ? h('span', { class: 'row-subtitle' }, subtitle) : null),
      trailing ? h('span', { class: 'row-value' }, trailing) : null,
      icon('chevron', 'row-chevron'),
    ),
  );
}

export function infoRow(label, value) {
  return h('li', { class: 'row' }, h('span', {}, label), h('span', { class: 'row-value' }, value));
}

export function emptyRow(text) {
  return h('li', { class: 'row row-empty' }, text);
}

/** Inline error area; call show(error | text) / clear(). */
export function errorArea() {
  const element = h('p', { class: 'form-error', role: 'alert', hidden: true });
  return {
    element,
    show(errorOrText) {
      element.textContent = typeof errorOrText === 'string' ? errorOrText : errorMessage(errorOrText);
      element.hidden = false;
    },
    clear() {
      element.textContent = '';
      element.hidden = true;
    },
  };
}

export function textField({ label, value = '', name, maxLength = 80, required = false, autocomplete = 'off', inputMode, placeholder }) {
  const id = nextId('field');
  const input = h('input', { id, name, type: 'text', value, maxlength: maxLength, required, autocomplete, inputmode: inputMode, placeholder, class: 'input' });
  input.value = value;
  return { element: h('div', { class: 'field' }, h('label', { for: id, class: 'field-label' }, label), input), input };
}

export function selectField({ label, value, options, name }) {
  const id = nextId('field');
  const select = h('select', { id, name, class: 'input' }, options.map((option) => h('option', { value: option.value }, option.label)));
  select.value = value;
  return { element: h('div', { class: 'field' }, h('label', { for: id, class: 'field-label' }, label), select), select };
}

/** Group of checkboxes; `values()` returns the checked values. */
export function checkboxGroup({ legend, options, checked = [] }) {
  const inputs = [];
  const element = h(
    'fieldset',
    { class: 'field checkbox-group' },
    h('legend', { class: 'field-label' }, legend),
    options.map((option) => {
      const id = nextId('check');
      const input = h('input', { id, type: 'checkbox', value: option.value, checked: checked.includes(option.value) });
      input.checked = checked.includes(option.value);
      inputs.push(input);
      return h('label', { class: 'checkbox', for: id }, input, h('span', {}, option.label));
    }),
  );
  return { element, values: () => inputs.filter((input) => input.checked).map((input) => input.value), inputs };
}

/**
 * Numeric stepper with − and + buttons (44 pt targets) and a live value.
 * `get()` returns the current value.
 */
export function stepper({ label, value, min, max, step = 1, format = String, onChange }) {
  let current = value;
  const labelId = nextId('stepper');
  const output = h('output', { class: 'stepper-value numeric', 'aria-live': 'polite' });
  const minus = h('button', { type: 'button', class: 'stepper-button', 'aria-label': t('a11y.decrease', { label }) }, '−');
  const plus = h('button', { type: 'button', class: 'stepper-button', 'aria-label': t('a11y.increase', { label }) }, '+');
  const update = () => {
    output.textContent = format(current);
    minus.disabled = current - step < min;
    plus.disabled = current + step > max;
  };
  const change = (delta) => {
    const nextValue = Math.min(max, Math.max(min, current + delta));
    if (nextValue === current) return;
    current = nextValue;
    update();
    onChange?.(current);
  };
  minus.addEventListener('click', () => change(-step));
  plus.addEventListener('click', () => change(step));
  update();
  const element = h(
    'div',
    { class: 'stepper', role: 'group', 'aria-labelledby': labelId },
    h('span', { class: 'stepper-label', id: labelId }, label),
    h('div', { class: 'stepper-controls' }, minus, output, plus),
  );
  return {
    element,
    get: () => current,
    set(nextValue) {
      current = nextValue;
      update();
    },
  };
}

export function searchField({ label, onInput }) {
  const id = nextId('search');
  const input = h('input', { id, type: 'search', class: 'input search-input', autocomplete: 'off', enterkeyhint: 'search' });
  input.addEventListener('input', () => onInput(input.value));
  return { element: h('div', { class: 'field search' }, h('label', { for: id, class: 'visually-hidden' }, label), input), input };
}

/**
 * Modal confirmation built on <dialog>. Resolves true only when the user
 * presses the confirm button.
 */
export function confirmDialog({ title, message, confirmLabel, destructive = false }) {
  return new Promise((resolve) => {
    const titleId = nextId('dialog');
    const dialog = h(
      'dialog',
      { class: 'dialog', 'aria-labelledby': titleId },
      h('h2', { class: 'dialog-title', id: titleId }, title),
      message ? h('p', { class: 'dialog-message' }, message) : null,
    );
    const finish = (result) => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };
    dialog.append(
      h(
        'div',
        { class: 'dialog-actions' },
        button(t('common.cancel'), { onClick: () => finish(false) }),
        button(confirmLabel, { variant: destructive ? 'destructive' : 'primary', onClick: () => finish(true), attributes: { 'data-confirm': '' } }),
      ),
    );
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(false);
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

/** Modal with custom content; resolves with what `onSubmit` returns, or null on cancel. */
export function formDialog({ title, body, submitLabel, onSubmit, extraActions = [] }) {
  return new Promise((resolve) => {
    const titleId = nextId('dialog');
    const dialog = h('dialog', { class: 'dialog', 'aria-labelledby': titleId }, h('h2', { class: 'dialog-title', id: titleId }, title), body);
    const close = (result) => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };
    const actionButtons = extraActions.map(({ label, variant, value, id }) => button(label, { variant, id, onClick: () => close(value) }));
    dialog.append(
      actionButtons.length ? h('div', { class: 'dialog-extra' }, actionButtons) : null,
      h(
        'div',
        { class: 'dialog-actions' },
        button(t('common.cancel'), { onClick: () => close(null) }),
        button(submitLabel, {
          variant: 'primary',
          attributes: { 'data-confirm': '' },
          onClick: () => {
            const result = onSubmit();
            if (result !== undefined) close(result);
          },
        }),
      ),
    );
    dialog.addEventListener('cancel', (cancelEvent) => {
      cancelEvent.preventDefault();
      close(null);
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

/** Full-screen error with a retry link to the same screen. */
export function errorState(error) {
  return h(
    'section',
    { class: 'empty-state' },
    h('h1', { class: 'empty-state-title' }, t('errors.screenTitle')),
    h('p', { class: 'empty-state-message' }, errorMessage(error)),
    h('a', { class: 'button button-secondary', href: '#/home' }, t('errors.goHome')),
  );
}

/** Disables a button while `work` runs and shows failures in `errors`. */
export async function runAction(trigger, errors, work) {
  trigger.disabled = true;
  errors?.clear();
  try {
    return await work();
  } catch (error) {
    // Domain errors are expected outcomes shown to the user; anything else is a bug.
    if (!(error instanceof DomainError)) console.error(error);
    errors?.show(error);
    return undefined;
  } finally {
    trigger.disabled = false;
  }
}

export function fragment(...children) {
  const result = document.createDocumentFragment();
  result.append(...children.flat().filter((child) => child !== null && child !== undefined && child !== false));
  return result;
}
