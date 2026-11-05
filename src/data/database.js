import { requestToPromise } from './idb.js';
import { DomainError, ErrorCode } from './errors.js';

export const DATABASE_NAME = 'loadlog';
export const SCHEMA_VERSION = 1;

export const Store = Object.freeze({
  exercises: 'exercises',
  plans: 'plans',
  planExercises: 'planExercises',
  sessions: 'sessions',
  sessionExercises: 'sessionExercises',
  sets: 'sets',
  meta: 'meta',
});

export const ALL_STORES = Object.freeze(Object.values(Store));

/**
 * Schema migrations, one function per version. Never edit a released
 * migration; add a new version instead.
 */
const migrations = {
  1(db) {
    const exercises = db.createObjectStore(Store.exercises, { keyPath: 'id' });
    exercises.createIndex('builtinKey', 'builtinKey', { unique: true });

    db.createObjectStore(Store.plans, { keyPath: 'id' });

    const planExercises = db.createObjectStore(Store.planExercises, { keyPath: 'id' });
    planExercises.createIndex('planId', 'planId');
    planExercises.createIndex('exerciseId', 'exerciseId');

    const sessions = db.createObjectStore(Store.sessions, { keyPath: 'id' });
    sessions.createIndex('planId', 'planId');
    sessions.createIndex('startedAt', 'startedAt');

    const sessionExercises = db.createObjectStore(Store.sessionExercises, { keyPath: 'id' });
    sessionExercises.createIndex('sessionId', 'sessionId');
    sessionExercises.createIndex('exerciseId', 'exerciseId');

    const sets = db.createObjectStore(Store.sets, { keyPath: 'id' });
    sets.createIndex('sessionExerciseId', 'sessionExerciseId');
    sets.createIndex('sessionId', 'sessionId');

    db.createObjectStore(Store.meta, { keyPath: 'key' });
  },
};

/** Opens (and if needed creates or upgrades) the database. */
export async function openDatabase({ name = DATABASE_NAME, indexedDB = globalThis.indexedDB } = {}) {
  if (!indexedDB) {
    throw new DomainError(ErrorCode.storageUnavailable, 'IndexedDB is not available');
  }
  const request = indexedDB.open(name, SCHEMA_VERSION);
  request.onupgradeneeded = (event) => {
    const db = request.result;
    for (let version = event.oldVersion + 1; version <= SCHEMA_VERSION; version += 1) {
      migrations[version](db, request.transaction);
    }
  };
  request.onblocked = () => {
    console.warn('LoadLog database upgrade is waiting for another open tab to close.');
  };
  let db;
  try {
    db = await requestToPromise(request);
  } catch (error) {
    throw new DomainError(ErrorCode.storageUnavailable, `Could not open the database: ${error?.message ?? error}`);
  }
  db.onversionchange = () => db.close();
  return db;
}
