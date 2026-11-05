import { h } from '../../shared/dom.js';
import { t } from '../../i18n/i18n.js';
import { button } from '../../shared/ui.js';

const MAX_LENGTH = 6;

/**
 * Inline numeric keypad (no system keyboard). Typing replaces the value;
 * OK with nothing typed keeps it. `onDone(text)` receives the typed text.
 */
export function keypad({ label, current, allowDecimal, onDone, onCancel }) {
  let buffer = '';
  const display = h('output', { class: 'keypad-display numeric', 'aria-live': 'polite' });
  const draw = () => {
    display.textContent = buffer === '' ? current : buffer;
    display.classList.toggle('keypad-placeholder', buffer === '');
  };
  const press = (key) => {
    if (key === 'back') buffer = buffer.slice(0, -1);
    else if (key === ',') {
      if (allowDecimal && !buffer.includes(',')) buffer = (buffer === '' ? '0' : buffer) + ',';
    } else if (buffer.length < MAX_LENGTH) buffer = buffer === '0' ? key : buffer + key;
    draw();
  };
  const key = (value, text, aria) => {
    const element = h('button', { type: 'button', class: 'keypad-key numeric', 'aria-label': aria ?? text, 'data-key': value }, text);
    element.addEventListener('click', () => press(value));
    return element;
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => key(digit, digit));
  keys.push(allowDecimal ? key(',', ',', t('keypad.comma')) : h('span', { class: 'keypad-spacer' }));
  keys.push(key('0', '0'));
  keys.push(key('back', '⌫', t('keypad.backspace')));
  draw();
  return h(
    'div',
    { class: 'keypad', role: 'group', 'aria-label': t('keypad.label', { field: label }) },
    h('div', { class: 'keypad-header' }, h('span', { class: 'keypad-label' }, label), display),
    h('div', { class: 'keypad-grid' }, keys),
    h(
      'div',
      { class: 'keypad-actions' },
      button(t('common.cancel'), { onClick: onCancel }),
      button(t('keypad.ok'), { variant: 'primary', onClick: () => onDone(buffer), attributes: { 'data-keypad-ok': '' } }),
    ),
  );
}
