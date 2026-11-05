import { getRepository } from '../data/app-data.js';
import { haptic, toast } from './feedback.js';
import { t } from '../i18n/i18n.js';

/**
 * Rest timer. The end time is stored, so the timer survives the app going to
 * the background, a reload or being closed. When it ends with the app open,
 * there is a vibration (where supported), a visual pulse and a message; with
 * the app in the background and notifications allowed, a notification.
 */
const KEY = 'restTimer';
/** A timer that ended longer ago than this while the app was closed ends silently. */
const STALE_MS = 60_000;

let current = null;
let timeoutId = null;
const listeners = new Set();

function emit() {
  for (const listener of listeners) listener(current);
}

export function onRestTimerChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function restTimer() {
  return current;
}

export function remainingSeconds(timer = current, now = Date.now()) {
  return timer ? Math.max(0, Math.ceil((timer.endsAt - now) / 1000)) : 0;
}

async function persist() {
  const repository = await getRepository();
  if (current) await repository.setMeta(KEY, current);
  else await repository.deleteMeta(KEY);
}

async function notifyInBackground(label) {
  try {
    if (!('Notification' in globalThis) || Notification.permission !== 'granted') return;
    const registration = await navigator.serviceWorker?.ready;
    await registration?.showNotification(t('rest.notificationTitle'), { body: label ? t('rest.notificationBody', { exercise: label }) : undefined, tag: 'rest', renotify: true });
  } catch {
    // Notifications are best effort.
  }
}

async function finish({ silent = false } = {}) {
  const finished = current;
  current = null;
  clearTimeout(timeoutId);
  emit();
  await persist();
  if (silent || !finished) return;
  haptic(document.querySelector('.rest-bar'), [200, 100, 200]);
  toast(t('rest.done'), { kind: 'rest' });
  if (document.visibilityState === 'hidden') await notifyInBackground(finished.label);
}

function schedule() {
  clearTimeout(timeoutId);
  if (!current) return;
  const delay = current.endsAt - Date.now();
  if (delay <= 0) {
    finish({ silent: -delay > STALE_MS });
    return;
  }
  timeoutId = setTimeout(() => finish(), Math.min(delay, 2_147_000_000));
}

/** Restores a stored timer at launch. */
export async function initRestTimer() {
  const stored = await (await getRepository()).getMeta(KEY);
  current = stored && Number.isFinite(stored.endsAt) && Number.isFinite(stored.total) ? stored : null;
  schedule();
  emit();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule();
  });
}

/**
 * Asks for notification permission the first time the timer is used. Must be
 * called synchronously from a tap.
 */
export function askNotificationPermissionOnce() {
  try {
    if ('Notification' in globalThis && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  } catch {
    // Not available.
  }
}

export async function startRestTimer(seconds, label) {
  if (!(seconds > 0)) {
    await stopRestTimer();
    return;
  }
  current = { endsAt: Date.now() + seconds * 1000, total: seconds, label };
  schedule();
  emit();
  await persist();
}

export async function extendRestTimer(seconds) {
  if (!current) return;
  current = { ...current, endsAt: current.endsAt + seconds * 1000, total: current.total + seconds };
  schedule();
  emit();
  await persist();
}

export async function stopRestTimer() {
  if (!current) return;
  current = null;
  clearTimeout(timeoutId);
  emit();
  await persist();
}
