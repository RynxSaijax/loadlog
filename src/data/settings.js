import { getRepository } from './app-data.js';
import { defaultIncrement, Equipment } from './enums.js';

const KEY = 'settings';

/** User preferences. Stored on the device with the rest of the data. */
export const DEFAULT_SETTINGS = Object.freeze({
  showRir: false,
  haptics: true,
  defaultRestSeconds: 120,
  /** Default load increment per equipment (rule 4.1 values unless changed in Ajustes). */
  increments: Object.freeze({ ...defaultIncrement }),
});

/** Increment choices offered in Ajustes, in kg. */
export const INCREMENT_CHOICES = Object.freeze([0.25, 0.5, 1, 1.25, 2, 2.5, 5, 10]);

const validIncrement = (value) => typeof value === 'number' && value > 0 && value <= 100 && Number.isInteger(value * 4);

function sanitize(stored) {
  const result = { ...DEFAULT_SETTINGS };
  if (stored && typeof stored === 'object') {
    if (typeof stored.showRir === 'boolean') result.showRir = stored.showRir;
    if (typeof stored.haptics === 'boolean') result.haptics = stored.haptics;
    if (Number.isInteger(stored.defaultRestSeconds) && stored.defaultRestSeconds >= 0 && stored.defaultRestSeconds <= 3600) {
      result.defaultRestSeconds = stored.defaultRestSeconds;
    }
    const increments = { ...defaultIncrement };
    for (const equipment of Object.values(Equipment)) {
      if (validIncrement(stored.increments?.[equipment])) increments[equipment] = stored.increments[equipment];
    }
    result.increments = increments;
  }
  return result;
}

export async function loadSettings() {
  return sanitize(await (await getRepository()).getMeta(KEY));
}

export async function updateSettings(changes) {
  const next = sanitize({ ...(await loadSettings()), ...changes });
  await (await getRepository()).setMeta(KEY, next);
  return next;
}

/** Load step for ± on an exercise: its own override, else the Ajustes default for its equipment. */
export function incrementFor(exercise, settings) {
  const equipment = exercise?.equipment ?? Equipment.other;
  return exercise?.incrementOverride ?? settings.increments[equipment] ?? defaultIncrement[equipment];
}
