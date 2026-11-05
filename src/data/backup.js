/**
 * Full JSON backup (5.5): every record, with a schemaVersion. Restoring
 * validates the whole file first (fields, ranges, references, single open
 * session) and returns counts for the preview; only then does the caller
 * replace the data, in one transaction.
 */
import { Store } from './database.js';
import { DomainError, ErrorCode } from './errors.js';
import {
  validateDropGroup, validateExerciseFields, validateLoad, validateName, validatePrescription, validateReps, validateRir, validateSetType, validateTimestamp,
} from './validation.js';

export const BACKUP_FORMAT = 'loadlog-backup';
export const BACKUP_SCHEMA_VERSION = 1;
/** Meta keys that travel in a backup (the rest timer does not). */
const BACKUP_META_KEYS = new Set(['settings']);
/** Refuse files larger than this before parsing. */
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

function invalid(reason, details = {}) {
  return new DomainError(ErrorCode.invalidBackup, `invalid backup: ${reason}`, { reason, ...details });
}

/** Builds the backup object from repository.exportAll(). */
export function makeBackup(dump, { now = Date.now(), appVersion } = {}) {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion,
    exportedAt: new Date(now).toISOString(),
    data: {
      exercises: dump.exercises,
      plans: dump.plans,
      planExercises: dump.planExercises,
      sessions: dump.sessions,
      sessionExercises: dump.sessionExercises,
      sets: dump.sets,
      meta: dump.meta.filter((entry) => BACKUP_META_KEYS.has(entry.key)),
    },
  };
}

export function backupCounts(data) {
  return {
    exercises: data.exercises.length,
    plans: data.plans.length,
    sessions: data.sessions.length,
    sets: data.sets.length,
  };
}

const isId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 100;
const isInt = Number.isInteger;

function check(condition, reason, details) {
  if (!condition) throw invalid(reason, details);
}

/** Validates one record with `normalize`, converting errors into invalidBackup with the record kind. */
function each(kind, records, normalize) {
  check(Array.isArray(records), 'missingCollection', { kind });
  const ids = new Set();
  return records.map((record, index) => {
    check(record && typeof record === 'object' && !Array.isArray(record), 'badRecord', { kind, index });
    let normalized;
    try {
      normalized = normalize(record);
    } catch (error) {
      if (error instanceof DomainError && error.code === ErrorCode.invalidBackup) throw error;
      throw invalid('badRecord', { kind, index, field: error?.details?.field ?? null });
    }
    const id = kind === 'meta' ? normalized.key : normalized.id;
    check(!ids.has(id), 'duplicateId', { kind, index });
    ids.add(id);
    return normalized;
  });
}

function id(record) {
  if (!isId(record.id)) throw invalid('badRecord', { field: 'id' });
  return record.id;
}

function nullableInt(value, min, max) {
  if (value === null || value === undefined) return null;
  if (!isInt(value) || value < min || value > max) throw invalid('badRecord');
  return value;
}

function text(value, max) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > max) throw invalid('badRecord');
  return value;
}

/**
 * Parses and validates a backup file's text.
 * @returns {{ data: object, counts: object, exportedAt: string|null, appVersion: string|null }}
 */
export function parseBackup(textContent) {
  check(typeof textContent === 'string' && textContent.length > 0, 'empty');
  check(textContent.length <= MAX_BACKUP_BYTES, 'tooLarge');
  let parsed;
  try {
    parsed = JSON.parse(textContent.replace(/^﻿/, ''));
  } catch {
    throw invalid('notJson');
  }
  check(parsed && typeof parsed === 'object' && parsed.format === BACKUP_FORMAT, 'notBackup');
  check(isInt(parsed.schemaVersion), 'notBackup');
  check(parsed.schemaVersion <= BACKUP_SCHEMA_VERSION, 'newerVersion', { version: parsed.schemaVersion });
  check(parsed.schemaVersion >= 1, 'notBackup');
  const source = parsed.data;
  check(source && typeof source === 'object', 'notBackup');

  const exercises = each('exercises', source.exercises, (record) => {
    const fields = validateExerciseFields(record);
    const builtinKey = record.builtinKey ?? null;
    if (builtinKey !== null && (typeof builtinKey !== 'string' || builtinKey.length > 100)) throw invalid('badRecord');
    return { id: id(record), builtinKey, ...fields, isArchived: Boolean(record.isArchived) };
  });
  const builtinKeys = exercises.map((exercise) => exercise.builtinKey).filter(Boolean);
  check(new Set(builtinKeys).size === builtinKeys.length, 'duplicateId', { kind: 'exercises' });
  const exerciseIds = new Set(exercises.map((exercise) => exercise.id));

  const plans = each('plans', source.plans, (record) => {
    if (!isInt(record.sortOrder)) throw invalid('badRecord');
    return { id: id(record), name: validateName('name', record.name), sortOrder: record.sortOrder, isArchived: Boolean(record.isArchived), createdAt: validateTimestamp('createdAt', record.createdAt) };
  });
  const planIds = new Set(plans.map((plan) => plan.id));

  const planExercises = each('planExercises', source.planExercises, (record) => {
    check(planIds.has(record.planId) && exerciseIds.has(record.exerciseId), 'brokenReference', { kind: 'planExercises' });
    if (!isInt(record.sortOrder)) throw invalid('badRecord');
    return { id: id(record), planId: record.planId, sortOrder: record.sortOrder, exerciseId: record.exerciseId, ...validatePrescription(record) };
  });

  const sessions = each('sessions', source.sessions, (record) => {
    const startedAt = validateTimestamp('startedAt', record.startedAt);
    const endedAt = record.endedAt === null || record.endedAt === undefined ? null : validateTimestamp('endedAt', record.endedAt);
    if (endedAt !== null && endedAt < startedAt) throw invalid('badRecord', { field: 'endedAt' });
    const planId = record.planId ?? null;
    if (planId !== null && !isId(planId)) throw invalid('badRecord');
    return { id: id(record), startedAt, endedAt, planId, planNameSnapshot: text(record.planNameSnapshot, 200) ?? '', notes: text(record.notes, 5000) };
  });
  check(sessions.filter((session) => session.endedAt === null).length <= 1, 'manyOpenSessions');
  const sessionIds = new Set(sessions.map((session) => session.id));

  const sessionExercises = each('sessionExercises', source.sessionExercises, (record) => {
    check(sessionIds.has(record.sessionId) && exerciseIds.has(record.exerciseId), 'brokenReference', { kind: 'sessionExercises' });
    if (!isInt(record.sortOrder)) throw invalid('badRecord');
    const planExerciseId = record.planExerciseId ?? null;
    if (planExerciseId !== null && !isId(planExerciseId)) throw invalid('badRecord');
    return {
      id: id(record),
      sessionId: record.sessionId,
      sortOrder: record.sortOrder,
      exerciseId: record.exerciseId,
      planExerciseId,
      exerciseNameSnapshot: validateName('exerciseNameSnapshot', record.exerciseNameSnapshot),
      prescribedSetsSnapshot: nullableInt(record.prescribedSetsSnapshot, 1, 20),
      repMinSnapshot: nullableInt(record.repMinSnapshot, 1, 100),
      repMaxSnapshot: nullableInt(record.repMaxSnapshot, 1, 100),
    };
  });
  const sessionOfItem = new Map(sessionExercises.map((item) => [item.id, item.sessionId]));

  const sets = each('sets', source.sets, (record) => {
    check(sessionOfItem.has(record.sessionExerciseId) && sessionOfItem.get(record.sessionExerciseId) === record.sessionId, 'brokenReference', { kind: 'sets' });
    if (!isInt(record.sortOrder)) throw invalid('badRecord');
    const type = validateSetType(record.type);
    return {
      id: id(record),
      sessionExerciseId: record.sessionExerciseId,
      sessionId: record.sessionId,
      sortOrder: record.sortOrder,
      load: validateLoad(record.load),
      reps: validateReps(record.reps),
      rir: validateRir(record.rir ?? null),
      type,
      dropGroupId: validateDropGroup(type, record.dropGroupId ?? null),
      completedAt: validateTimestamp('completedAt', record.completedAt),
    };
  });

  const meta = each('meta', source.meta ?? [], (record) => {
    if (typeof record.key !== 'string') throw invalid('badRecord');
    return { key: record.key, value: record.value };
  }).filter((entry) => BACKUP_META_KEYS.has(entry.key));

  const data = {
    [Store.exercises]: exercises,
    [Store.plans]: plans,
    [Store.planExercises]: planExercises,
    [Store.sessions]: sessions,
    [Store.sessionExercises]: sessionExercises,
    [Store.sets]: sets,
    [Store.meta]: meta,
  };
  return {
    data,
    counts: backupCounts(data),
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null,
    appVersion: typeof parsed.appVersion === 'string' ? parsed.appVersion : null,
  };
}

/** File name: loadlog-backup-2026-11-04.json */
export function backupFileName(now = Date.now()) {
  const date = new Date(now);
  const pad = (value) => String(value).padStart(2, '0');
  return `loadlog-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}
