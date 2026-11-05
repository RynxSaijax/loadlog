import { locale, t } from '../i18n/i18n.js';

const decimal = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });

/** 2.5 → "2,5" */
export function formatNumber(value) {
  return decimal.format(value);
}

/** 150 → "2:30" */
export function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Parses "2,5" or "2.5"; returns null for empty or invalid text. */
export function parseDecimal(text) {
  const cleaned = String(text ?? '').trim().replace(',', '.');
  if (cleaned === '' || !/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

const list = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' });

/** ["Tríceps", "Ombros"] → "Tríceps e Ombros" */
export function formatList(items) {
  return list.format(items);
}

const dateTime = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const shortDate = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' });
const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });

/** "12/10, 18:05" */
export function formatDateTime(timestamp) {
  return dateTime.format(timestamp);
}

/** "12/10" */
export function formatShortDate(timestamp) {
  return shortDate.format(timestamp);
}

/** "18:05" */
export function formatTime(timestamp) {
  return time.format(timestamp);
}

/** Milliseconds → "1:05" (hours:minutes). */
export function formatHoursMinutes(milliseconds) {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60_000));
  return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

const dayDate = new Intl.DateTimeFormat(locale, { weekday: 'short', day: '2-digit', month: '2-digit' });
const longDate = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' });

/** "seg., 02/03" */
export function formatDayDate(timestamp) {
  return dayDate.format(timestamp);
}

/** "segunda-feira, 2 de março" */
export function formatLongDate(timestamp) {
  return longDate.format(timestamp);
}

/** Signed number: +2,5 / −1 / 0 */
export function formatSigned(value) {
  if (value > 0) return `+${formatNumber(value)}`;
  if (value < 0) return `−${formatNumber(-value)}`;
  return formatNumber(0);
}

/** "80 kg" */
export function formatKg(value) {
  return t('units.kg', { value: formatNumber(value) });
}
