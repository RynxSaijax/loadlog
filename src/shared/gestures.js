/**
 * Pointer-based gestures that work with touch and mouse. Both keep a
 * visible alternative (buttons), so nothing depends on a gesture alone.
 */

/** Horizontal swipe. `ignore` is a selector: swipes starting inside it are skipped. */
export function onSwipe(element, { onLeft, onRight, threshold = 60, ignore } = {}) {
  let start = null;
  element.addEventListener('pointerdown', (event) => {
    if (ignore && event.target.closest(ignore)) {
      start = null;
      return;
    }
    start = { x: event.clientX, y: event.clientY, time: Date.now() };
  });
  element.addEventListener('pointerup', (event) => {
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const quick = Date.now() - start.time < 800;
    start = null;
    if (!quick || Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) onLeft?.(event);
    else onRight?.(event);
  });
  element.addEventListener('pointercancel', () => {
    start = null;
  });
}

/** Long press (default 500 ms) without moving more than a few points. */
export function onLongPress(element, callback, { delay = 500, tolerance = 10 } = {}) {
  let timer = null;
  let origin = null;
  let fired = false;
  const cancel = () => {
    clearTimeout(timer);
    timer = null;
  };
  element.addEventListener('pointerdown', (event) => {
    fired = false;
    origin = { x: event.clientX, y: event.clientY };
    cancel();
    timer = setTimeout(() => {
      fired = true;
      callback(event);
    }, delay);
  });
  element.addEventListener('pointermove', (event) => {
    if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > tolerance) cancel();
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) element.addEventListener(type, cancel);
  element.addEventListener('contextmenu', (event) => event.preventDefault());
  element.addEventListener('click', (event) => {
    if (fired) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
}
