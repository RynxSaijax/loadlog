/** One-shot message shown on the next screen (e.g. after saving or deleting). */
let pending = null;

export function setFlash(message) {
  pending = message;
}

export function takeFlash() {
  const message = pending;
  pending = null;
  return message;
}
