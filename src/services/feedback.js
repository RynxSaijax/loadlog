import { h } from '../shared/dom.js';

let hapticsEnabled = true;
let toastTimer = null;

export function setHapticsEnabled(enabled) {
  hapticsEnabled = enabled;
}

/**
 * Short vibration where the browser supports it (Safari on iPhone does not),
 * plus a visual pulse on `element` so the confirmation is always perceptible.
 */
export function haptic(element, pattern = 15) {
  if (hapticsEnabled) {
    try {
      globalThis.navigator?.vibrate?.(pattern);
    } catch {
      // Vibration is optional.
    }
  }
  if (element) {
    element.classList.remove('pulse');
    void element.offsetWidth;
    element.classList.add('pulse');
  }
}

/** Discreet in-app message above the tab bar, read by screen readers. */
export function toast(message, { kind = 'info', duration = 3500 } = {}) {
  const region = document.getElementById('toast');
  if (!region) return;
  clearTimeout(toastTimer);
  region.replaceChildren(h('p', { class: `toast toast-${kind}` }, message));
  toastTimer = setTimeout(() => region.replaceChildren(), duration);
}
