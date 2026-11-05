/**
 * ISO 8601 weeks (Monday to Sunday) in the device's local time zone (4.7).
 */

const DAY_MS = 86_400_000;

/**
 * @param {number} timestamp epoch ms
 * @returns {{ year: number, week: number, key: string, start: number }}
 *   `start` is local Monday 00:00 of that week.
 */
export function isoWeek(timestamp) {
  const local = new Date(timestamp);
  const year = local.getFullYear();
  const month = local.getMonth();
  const day = local.getDate();
  const weekday = (local.getDay() + 6) % 7; // Monday = 0

  // ISO rule: the week belongs to the year of its Thursday.
  const thursday = new Date(Date.UTC(year, month, day - weekday + 3));
  const isoYear = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstWeekMonday = Date.UTC(isoYear, 0, 4 - ((firstThursday.getUTCDay() + 6) % 7));
  const week = 1 + Math.round((thursday.getTime() - 3 * DAY_MS - firstWeekMonday) / (7 * DAY_MS));

  return {
    year: isoYear,
    week,
    key: `${isoYear}-W${String(week).padStart(2, '0')}`,
    start: new Date(year, month, day - weekday).getTime(),
  };
}

/** The ISO week `offset` weeks away from the week containing `timestamp`. */
export function shiftWeek(timestamp, offset) {
  const start = new Date(isoWeek(timestamp).start);
  return isoWeek(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7 * offset + 3).getTime());
}
