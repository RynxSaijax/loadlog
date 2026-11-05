/** Pure parsing and validation of what the user types on the session screens. */
import { parseDecimal } from '../../shared/format.js';

/** A start time may be in the past (retroactive logging) but not in the future. */
const FUTURE_TOLERANCE_MS = 60_000;

export function validStart(timestamp, now = Date.now()) {
  return Number.isFinite(timestamp) && timestamp <= now + FUTURE_TOLERANCE_MS;
}

/** Keypad text → load in kg (0 to 1000, multiples of 0.25), or null. */
export function parseLoad(text) {
  const value = parseDecimal(text);
  if (value === null || value > 1000 || !Number.isInteger(value * 4)) return null;
  return value;
}

/** Keypad text → reps (integer 1 to 100), or null. */
export function parseReps(text) {
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return value >= 1 && value <= 100 ? value : null;
}
