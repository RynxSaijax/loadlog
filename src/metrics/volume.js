import { countEffectiveSets, tonnage } from './sets.js';
import { isoWeek, shiftWeek } from './weeks.js';

/** Weeks averaged for the weekly-volume baseline. */
export const VOLUME_AVERAGE_WEEKS = 4;

function emptyTotals() {
  return { sets: 0, tonnage: 0 };
}

/**
 * Volume per muscle group for each ISO week (4.7). Crosses plans and
 * includes sessions without a plan. The primary group gets 1 per effective
 * set (drop-set = 1) and all of the tonnage; each secondary group gets 0.5
 * per set and no tonnage.
 *
 * @returns {Map<string, Map<string, { sets: number, tonnage: number }>>} weekKey → group → totals
 */
export function volumeByWeek(sessions) {
  const weeks = new Map();
  for (const session of sessions) {
    const { key } = isoWeek(session.startedAt);
    if (!weeks.has(key)) weeks.set(key, new Map());
    const groups = weeks.get(key);
    const add = (group, sets, load) => {
      if (!groups.has(group)) groups.set(group, emptyTotals());
      const totals = groups.get(group);
      totals.sets += sets;
      totals.tonnage += load;
    };
    for (const exercise of session.exercises) {
      const count = countEffectiveSets(exercise.sets);
      if (count === 0) continue;
      add(exercise.primaryMuscle, count, tonnage(exercise.sets));
      for (const secondary of exercise.secondaryMuscles) add(secondary, count * 0.5, 0);
    }
  }
  return weeks;
}

/**
 * Current week, previous week and the average of the 4 full weeks before
 * the current one, per muscle group.
 * @returns {Map<string, { current: object, previous: object, average: object }>}
 */
export function weeklyVolumeSummary(sessions, now) {
  const weeks = volumeByWeek(sessions);
  const currentKey = isoWeek(now).key;
  const previousKey = shiftWeek(now, -1).key;
  const averageKeys = Array.from({ length: VOLUME_AVERAGE_WEEKS }, (_, index) => shiftWeek(now, -(index + 1)).key);

  const groups = new Set();
  for (const key of [currentKey, ...averageKeys]) {
    for (const group of weeks.get(key)?.keys() ?? []) groups.add(group);
  }

  const read = (key, group) => ({ ...(weeks.get(key)?.get(group) ?? emptyTotals()) });
  const summary = new Map();
  for (const group of groups) {
    const average = emptyTotals();
    for (const key of averageKeys) {
      const totals = read(key, group);
      average.sets += totals.sets / VOLUME_AVERAGE_WEEKS;
      average.tonnage += totals.tonnage / VOLUME_AVERAGE_WEEKS;
    }
    summary.set(group, { current: read(currentKey, group), previous: read(previousKey, group), average });
  }
  return summary;
}

