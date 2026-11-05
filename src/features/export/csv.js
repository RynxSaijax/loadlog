/**
 * CSV export (5.5): one row per set, with the columns fixed by the spec.
 * Machine-readable: dot decimals, ISO 8601 dates with the local offset,
 * RFC 4180 quoting and CRLF line endings. A UTF-8 BOM keeps accents
 * readable when the file is opened in Excel.
 */
export const CSV_COLUMNS = Object.freeze(['session_id', 'started_at', 'plan_name', 'exercise_name', 'set_order', 'type', 'load_kg', 'reps', 'rir', 'drop_group_id']);

/** 2026-11-04T18:10:00-03:00 */
export function isoLocal(timestamp) {
  const date = new Date(timestamp);
  const pad = (value) => String(Math.floor(Math.abs(value))).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(offset / 60)}:${pad(offset % 60)}`;
}

export function csvField(value) {
  if (value === null || value === undefined) return '';
  const textValue = String(value);
  return /[",\r\n]/.test(textValue) ? `"${textValue.replace(/"/g, '""')}"` : textValue;
}

/**
 * @param {object[]} details sessions from repository.listSessionDetails()
 * @param {{ planNameFallback: string }} options name used for ad-hoc sessions
 */
export function sessionsToCsv(details, { planNameFallback = '' } = {}) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const session of [...details].sort((a, b) => a.startedAt - b.startedAt)) {
    for (const item of session.exercises) {
      item.sets.forEach((set, index) => {
        lines.push([
          session.id,
          isoLocal(session.startedAt),
          session.planNameSnapshot || planNameFallback,
          item.exerciseNameSnapshot,
          index + 1,
          set.type,
          set.load,
          set.reps,
          set.rir,
          set.dropGroupId,
        ].map(csvField).join(','));
      });
    }
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function csvFileName(now = Date.now()) {
  const date = new Date(now);
  const pad = (value) => String(value).padStart(2, '0');
  return `loadlog-series-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.csv`;
}
