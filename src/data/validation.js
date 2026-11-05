import { Equipment, MuscleGroup, MovementPattern, ExerciseSource, SET_TYPES, SetType } from './enums.js';
import { validationError } from './errors.js';

const isInt = (value) => Number.isInteger(value);

function inEnum(enumObject, value) {
  return Object.values(enumObject).includes(value);
}

/** Load in kg: 0 to 1000, in multiples of 0.25 (section 3). */
export function validateLoad(load) {
  if (typeof load !== 'number' || !Number.isFinite(load)) throw validationError('load', 'must be a finite number');
  if (load < 0 || load > 1000) throw validationError('load', 'must be between 0 and 1000');
  if (!Number.isInteger(load * 4)) throw validationError('load', 'must be a multiple of 0.25');
  return load;
}

/** Reps: integer from 1 to 100. */
export function validateReps(reps) {
  if (!isInt(reps) || reps < 1 || reps > 100) throw validationError('reps', 'must be an integer between 1 and 100');
  return reps;
}

/** RIR: null or integer from 0 to 10. */
export function validateRir(rir) {
  if (rir === null || rir === undefined) return null;
  if (!isInt(rir) || rir < 0 || rir > 10) throw validationError('rir', 'must be an integer between 0 and 10');
  return rir;
}

export function validateSetType(type) {
  if (!SET_TYPES.includes(type)) throw validationError('type', `unknown set type ${type}`);
  return type;
}

/** Drop-set steps share a group id; every other type has none. */
export function validateDropGroup(type, dropGroupId) {
  if (type === SetType.dropSet) {
    if (typeof dropGroupId !== 'string' || dropGroupId === '') {
      throw validationError('dropGroupId', 'is required for drop-set steps');
    }
    return dropGroupId;
  }
  if (dropGroupId !== null && dropGroupId !== undefined) {
    throw validationError('dropGroupId', 'is only allowed for drop-set steps');
  }
  return null;
}

export function validateTimestamp(field, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw validationError(field, 'must be a timestamp in ms');
  return value;
}

export function validateName(field, value) {
  if (typeof value !== 'string') throw validationError(field, 'must be text');
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 80) throw validationError(field, 'must have 1 to 80 characters');
  return trimmed;
}

export function validatePrescription({ prescribedSets, repMin, repMax, restSeconds }) {
  if (!isInt(prescribedSets) || prescribedSets < 1 || prescribedSets > 20) {
    throw validationError('prescribedSets', 'must be an integer between 1 and 20');
  }
  if (!isInt(repMin) || repMin < 1 || repMin > 100) throw validationError('repMin', 'must be an integer between 1 and 100');
  if (!isInt(repMax) || repMax < repMin || repMax > 100) {
    throw validationError('repMax', 'must be an integer between repMin and 100');
  }
  if (!isInt(restSeconds) || restSeconds < 0 || restSeconds > 3600) {
    throw validationError('restSeconds', 'must be an integer between 0 and 3600');
  }
  return { prescribedSets, repMin, repMax, restSeconds };
}

export function validateExerciseFields(input) {
  const name = validateName('name', input.name);
  if (!inEnum(MuscleGroup, input.primaryMuscle)) throw validationError('primaryMuscle', 'unknown muscle group');
  const secondaryMuscles = input.secondaryMuscles ?? [];
  if (!Array.isArray(secondaryMuscles) || !secondaryMuscles.every((muscle) => inEnum(MuscleGroup, muscle))) {
    throw validationError('secondaryMuscles', 'unknown muscle group');
  }
  if (secondaryMuscles.includes(input.primaryMuscle)) {
    throw validationError('secondaryMuscles', 'must not repeat the primary muscle');
  }
  if (new Set(secondaryMuscles).size !== secondaryMuscles.length) {
    throw validationError('secondaryMuscles', 'must not contain duplicates');
  }
  if (!inEnum(Equipment, input.equipment)) throw validationError('equipment', 'unknown equipment');
  if (!inEnum(MovementPattern, input.movementPattern)) throw validationError('movementPattern', 'unknown movement pattern');
  const source = input.source ?? ExerciseSource.custom;
  if (!inEnum(ExerciseSource, source)) throw validationError('source', 'unknown source');
  const incrementOverride = input.incrementOverride ?? null;
  if (incrementOverride !== null) {
    if (typeof incrementOverride !== 'number' || !(incrementOverride > 0) || incrementOverride > 100 || !Number.isInteger(incrementOverride * 4)) {
      throw validationError('incrementOverride', 'must be a positive multiple of 0.25 up to 100');
    }
  }
  return {
    name,
    primaryMuscle: input.primaryMuscle,
    secondaryMuscles: [...secondaryMuscles],
    equipment: input.equipment,
    movementPattern: input.movementPattern,
    incrementOverride,
    source,
  };
}
