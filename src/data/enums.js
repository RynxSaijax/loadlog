/**
 * Persisted enums. Values are stable English identifiers stored as strings;
 * pt-BR labels come from the string catalog via labelKey().
 */
export { SetType, SET_TYPES } from '../metrics/set-type.js';

export const Equipment = Object.freeze({
  barbell: 'barbell',
  dumbbell: 'dumbbell',
  machine: 'machine',
  cable: 'cable',
  smith: 'smith',
  bodyweight: 'bodyweight',
  other: 'other',
});

export const MuscleGroup = Object.freeze({
  chest: 'chest',
  back: 'back',
  shoulders: 'shoulders',
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: 'forearms',
  quads: 'quads',
  hamstrings: 'hamstrings',
  glutes: 'glutes',
  calves: 'calves',
  abs: 'abs',
  lowerBack: 'lowerBack',
  traps: 'traps',
});

export const MovementPattern = Object.freeze({
  horizontalPush: 'horizontalPush',
  verticalPush: 'verticalPush',
  horizontalPull: 'horizontalPull',
  verticalPull: 'verticalPull',
  squat: 'squat',
  hinge: 'hinge',
  lunge: 'lunge',
  isolation: 'isolation',
  core: 'core',
  carry: 'carry',
});

export const ExerciseSource = Object.freeze({
  builtin: 'builtin',
  imported: 'imported',
  custom: 'custom',
});

/** Default load increment per equipment, in kg (rule 4.1). */
export const defaultIncrement = Object.freeze({
  barbell: 2.5,
  smith: 2.5,
  dumbbell: 2,
  machine: 5,
  cable: 5,
  bodyweight: 2.5,
  other: 2.5,
});

/** String catalog key for an enum value, e.g. labelKey('muscle', 'chest'). */
export function labelKey(kind, value) {
  return `enum.${kind}.${value}`;
}
