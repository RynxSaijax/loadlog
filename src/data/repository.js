import { openDatabase, Store, ALL_STORES } from './database.js';
import { runTransaction, requestToPromise, getAll, getAllFromIndex, countFromIndex } from './idb.js';
import { DomainError, ErrorCode } from './errors.js';
import { ExerciseSource, SetType } from './enums.js';
import { builtinCatalog } from './catalog.pt-BR.js';
import { normalizeName } from './normalize.js';
import {
  validateDropGroup,
  validateExerciseFields,
  validateLoad,
  validateName,
  validatePrescription,
  validateReps,
  validateRir,
  validateSetType,
  validateTimestamp,
} from './validation.js';

const newId = () => globalThis.crypto.randomUUID();

const bySortOrder = (a, b) => a.sortOrder - b.sortOrder;

function notFound(kind, id) {
  return new DomainError(ErrorCode.notFound, `${kind} ${id} not found`, { kind, id });
}

async function mustGet(store, kind, id) {
  const record = await requestToPromise(store.get(id));
  if (!record) throw notFound(kind, id);
  return record;
}

async function assertNameFree(exerciseStore, name, exceptId = null) {
  const key = normalizeName(name);
  const clash = (await getAll(exerciseStore)).find((exercise) => exercise.id !== exceptId && normalizeName(exercise.name) === key);
  if (clash) {
    throw new DomainError(ErrorCode.duplicateName, `an exercise named ${clash.name} already exists`, { id: clash.id, field: 'name' });
  }
}

async function renumber(store, records, orderedIds) {
  const byId = new Map(records.map((record) => [record.id, record]));
  if (orderedIds.length !== records.length || new Set(orderedIds).size !== orderedIds.length || !orderedIds.every((id) => byId.has(id))) {
    throw new DomainError(ErrorCode.validation, 'order: must list every item exactly once', { field: 'order' });
  }
  for (const [sortOrder, id] of orderedIds.entries()) {
    await requestToPromise(store.put({ ...byId.get(id), sortOrder }));
  }
}

async function findOpenSession(sessionStore) {
  const sessions = await getAll(sessionStore);
  return sessions.find((session) => session.endedAt === null) ?? null;
}

async function deleteAllFromIndex(store, indexName, key) {
  const keys = await requestToPromise(store.index(indexName).getAllKeys(key));
  for (const primaryKey of keys) {
    await requestToPromise(store.delete(primaryKey));
  }
  return keys.length;
}

/**
 * Opens the LoadLog database and returns the data API. Every method that
 * writes runs in a single transaction: it either completes or changes nothing.
 */
export async function openRepository(options = {}) {
  const db = await openDatabase(options);
  const tx = (stores, mode, work) => runTransaction(db, stores, mode, work);

  const repository = {
    close() {
      db.close();
    },

    // MARK: Catalog seed

    /** Inserts built-in exercises whose builtinKey is not stored yet. Safe to run any number of times. */
    seedCatalog(catalog = builtinCatalog) {
      return tx([Store.exercises], 'readwrite', async (transaction) => {
        const store = transaction.objectStore(Store.exercises);
        const existingKeys = new Set(
          (await getAll(store)).map((record) => record.builtinKey).filter((key) => typeof key === 'string'),
        );
        let inserted = 0;
        for (const item of catalog) {
          if (existingKeys.has(item.builtinKey)) continue;
          const fields = validateExerciseFields({ ...item, source: ExerciseSource.builtin });
          await requestToPromise(store.add({ id: newId(), builtinKey: item.builtinKey, ...fields, isArchived: false }));
          existingKeys.add(item.builtinKey);
          inserted += 1;
        }
        return { inserted, total: existingKeys.size };
      });
    },

    // MARK: Exercises

    listExercises({ includeArchived = false } = {}) {
      return tx([Store.exercises], 'readonly', async (transaction) => {
        const all = await getAll(transaction.objectStore(Store.exercises));
        return all
          .filter((exercise) => includeArchived || !exercise.isArchived)
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      });
    },

    getExercise(id) {
      return tx([Store.exercises], 'readonly', (transaction) =>
        mustGet(transaction.objectStore(Store.exercises), 'exercise', id),
      );
    },

    createExercise(input) {
      const fields = validateExerciseFields({ ...input, source: input.source ?? ExerciseSource.custom });
      if (fields.source === ExerciseSource.builtin) {
        throw new DomainError(ErrorCode.validation, 'source: builtin exercises come only from the seed', { field: 'source' });
      }
      const record = { id: newId(), builtinKey: null, ...fields, isArchived: false };
      return tx([Store.exercises], 'readwrite', async (transaction) => {
        const store = transaction.objectStore(Store.exercises);
        await assertNameFree(store, record.name);
        await requestToPromise(store.add(record));
        return record;
      });
    },

    /**
     * Updates an exercise. Built-in exercises only accept a new increment;
     * custom and imported ones accept every field except the source.
     */
    updateExercise(id, changes) {
      return tx([Store.exercises], 'readwrite', async (transaction) => {
        const store = transaction.objectStore(Store.exercises);
        const current = await mustGet(store, 'exercise', id);
        let updated;
        if (current.source === ExerciseSource.builtin) {
          const allowed = Object.keys(changes).every((key) => key === 'incrementOverride');
          if (!allowed) {
            throw new DomainError(ErrorCode.validation, 'builtin: only incrementOverride can change', { field: 'source' });
          }
          const fields = validateExerciseFields({ ...current, incrementOverride: changes.incrementOverride });
          updated = { ...current, incrementOverride: fields.incrementOverride };
        } else {
          const fields = validateExerciseFields({ ...current, ...changes, source: current.source });
          if (normalizeName(fields.name) !== normalizeName(current.name)) await assertNameFree(store, fields.name, id);
          updated = { ...current, ...fields };
        }
        await requestToPromise(store.put(updated));
        return updated;
      });
    },

    /**
     * Imports reviewed exercises in one transaction. Names already stored
     * (or repeated in the batch) are skipped, so a repeated import adds nothing.
     * @returns {{ inserted: number, skipped: number }}
     */
    importExercises(items) {
      const validated = items.map((item) => validateExerciseFields({ ...item, source: ExerciseSource.imported }));
      return tx([Store.exercises], 'readwrite', async (transaction) => {
        const store = transaction.objectStore(Store.exercises);
        const taken = new Set((await getAll(store)).map((exercise) => normalizeName(exercise.name)));
        let inserted = 0;
        for (const fields of validated) {
          const key = normalizeName(fields.name);
          if (taken.has(key)) continue;
          taken.add(key);
          await requestToPromise(store.add({ id: newId(), builtinKey: null, ...fields, isArchived: false }));
          inserted += 1;
        }
        return { inserted, skipped: validated.length - inserted };
      });
    },

    setExerciseArchived(id, isArchived) {
      return tx([Store.exercises], 'readwrite', async (transaction) => {
        const store = transaction.objectStore(Store.exercises);
        const record = await mustGet(store, 'exercise', id);
        const updated = { ...record, isArchived: Boolean(isArchived) };
        await requestToPromise(store.put(updated));
        return updated;
      });
    },

    exerciseHasHistory(id) {
      return tx([Store.sessionExercises], 'readonly', async (transaction) =>
        (await countFromIndex(transaction.objectStore(Store.sessionExercises), 'exerciseId', id)) > 0,
      );
    },

    /**
     * Physically deletes an exercise. Refused when it has history (archive
     * it instead) or when a plan still uses it.
     */
    deleteExercise(id) {
      return tx([Store.exercises, Store.sessionExercises, Store.planExercises], 'readwrite', async (transaction) => {
        const store = transaction.objectStore(Store.exercises);
        await mustGet(store, 'exercise', id);
        if ((await countFromIndex(transaction.objectStore(Store.sessionExercises), 'exerciseId', id)) > 0) {
          throw new DomainError(ErrorCode.hasHistory, `exercise ${id} has history; archive it instead`, { id });
        }
        if ((await countFromIndex(transaction.objectStore(Store.planExercises), 'exerciseId', id)) > 0) {
          throw new DomainError(ErrorCode.inUse, `exercise ${id} is used by a plan`, { id });
        }
        await requestToPromise(store.delete(id));
      });
    },

    // MARK: Plans

    createPlan({ name }) {
      const validName = validateName('name', name);
      return tx([Store.plans], 'readwrite', async (transaction) => {
        const store = transaction.objectStore(Store.plans);
        const plans = await getAll(store);
        const sortOrder = plans.reduce((max, plan) => Math.max(max, plan.sortOrder), -1) + 1;
        const record = { id: newId(), name: validName, sortOrder, isArchived: false, createdAt: Date.now() };
        await requestToPromise(store.add(record));
        return record;
      });
    },

    renamePlan(id, name) {
      const validName = validateName('name', name);
      return tx([Store.plans], 'readwrite', async (transaction) => {
        const store = transaction.objectStore(Store.plans);
        const updated = { ...(await mustGet(store, 'plan', id)), name: validName };
        await requestToPromise(store.put(updated));
        return updated;
      });
    },

    setPlanArchived(id, isArchived) {
      return tx([Store.plans], 'readwrite', async (transaction) => {
        const store = transaction.objectStore(Store.plans);
        const updated = { ...(await mustGet(store, 'plan', id)), isArchived: Boolean(isArchived) };
        await requestToPromise(store.put(updated));
        return updated;
      });
    },

    listPlans({ includeArchived = false } = {}) {
      return tx([Store.plans], 'readonly', async (transaction) =>
        (await getAll(transaction.objectStore(Store.plans)))
          .filter((plan) => includeArchived || !plan.isArchived)
          .sort(bySortOrder),
      );
    },

    getPlan(id) {
      return tx([Store.plans, Store.planExercises], 'readonly', async (transaction) => {
        const plan = await mustGet(transaction.objectStore(Store.plans), 'plan', id);
        const exercises = (await getAllFromIndex(transaction.objectStore(Store.planExercises), 'planId', id)).sort(bySortOrder);
        return { ...plan, exercises };
      });
    },

    addExerciseToPlan(planId, { exerciseId, prescribedSets, repMin, repMax, restSeconds }) {
      const prescription = validatePrescription({ prescribedSets, repMin, repMax, restSeconds });
      return tx([Store.plans, Store.planExercises, Store.exercises], 'readwrite', async (transaction) => {
        await mustGet(transaction.objectStore(Store.plans), 'plan', planId);
        await mustGet(transaction.objectStore(Store.exercises), 'exercise', exerciseId);
        const store = transaction.objectStore(Store.planExercises);
        const siblings = await getAllFromIndex(store, 'planId', planId);
        const sortOrder = siblings.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1;
        const record = { id: newId(), planId, sortOrder, exerciseId, ...prescription };
        await requestToPromise(store.add(record));
        return record;
      });
    },

    removeExerciseFromPlan(planExerciseId) {
      return tx([Store.planExercises], 'readwrite', async (transaction) => {
        const store = transaction.objectStore(Store.planExercises);
        await mustGet(store, 'planExercise', planExerciseId);
        await requestToPromise(store.delete(planExerciseId));
      });
    },

    updatePlanExercise(planExerciseId, changes) {
      return tx([Store.planExercises], 'readwrite', async (transaction) => {
        const store = transaction.objectStore(Store.planExercises);
        const current = await mustGet(store, 'planExercise', planExerciseId);
        const prescription = validatePrescription({ ...current, ...changes });
        const updated = { ...current, ...prescription };
        await requestToPromise(store.put(updated));
        return updated;
      });
    },

    /** Sets the order of all plans (active and archived) to `orderedIds`. */
    reorderPlans(orderedIds) {
      return tx([Store.plans], 'readwrite', async (transaction) => {
        const store = transaction.objectStore(Store.plans);
        await renumber(store, await getAll(store), orderedIds);
      });
    },

    /** Sets the order of a plan's exercises to `orderedIds`. */
    reorderPlanExercises(planId, orderedIds) {
      return tx([Store.plans, Store.planExercises], 'readwrite', async (transaction) => {
        await mustGet(transaction.objectStore(Store.plans), 'plan', planId);
        const store = transaction.objectStore(Store.planExercises);
        await renumber(store, await getAllFromIndex(store, 'planId', planId), orderedIds);
      });
    },

    /** Copies a plan and its exercises under a new name, placed last. */
    duplicatePlan(planId, { name }) {
      const validName = validateName('name', name);
      return tx([Store.plans, Store.planExercises], 'readwrite', async (transaction) => {
        const plans = transaction.objectStore(Store.plans);
        const source = await mustGet(plans, 'plan', planId);
        const all = await getAll(plans);
        const copy = {
          id: newId(),
          name: validName,
          sortOrder: all.reduce((max, plan) => Math.max(max, plan.sortOrder), -1) + 1,
          isArchived: false,
          createdAt: Date.now(),
        };
        await requestToPromise(plans.add(copy));
        const planExercises = transaction.objectStore(Store.planExercises);
        const items = (await getAllFromIndex(planExercises, 'planId', source.id)).sort(bySortOrder);
        for (const [sortOrder, item] of items.entries()) {
          await requestToPromise(planExercises.add({ ...item, id: newId(), planId: copy.id, sortOrder }));
        }
        return copy;
      });
    },

    planHasHistory(id) {
      return tx([Store.sessions], 'readonly', async (transaction) =>
        (await countFromIndex(transaction.objectStore(Store.sessions), 'planId', id)) > 0,
      );
    },

    /** Deletes a plan and its exercises. Refused when a session references it (archive instead). */
    deletePlan(id) {
      return tx([Store.plans, Store.planExercises, Store.sessions], 'readwrite', async (transaction) => {
        const plans = transaction.objectStore(Store.plans);
        await mustGet(plans, 'plan', id);
        if ((await countFromIndex(transaction.objectStore(Store.sessions), 'planId', id)) > 0) {
          throw new DomainError(ErrorCode.hasHistory, `plan ${id} has history; archive it instead`, { id });
        }
        await deleteAllFromIndex(transaction.objectStore(Store.planExercises), 'planId', id);
        await requestToPromise(plans.delete(id));
      });
    },

    // MARK: Sessions

    /**
     * Starts a session. With a plan, copies the plan name and each exercise's
     * name and prescription as snapshots. Only one open session may exist.
     */
    startSession({ planId = null, startedAt = Date.now() } = {}) {
      validateTimestamp('startedAt', startedAt);
      return tx(
        [Store.sessions, Store.plans, Store.planExercises, Store.exercises, Store.sessionExercises],
        'readwrite',
        async (transaction) => {
          const sessions = transaction.objectStore(Store.sessions);
          const open = await findOpenSession(sessions);
          if (open) {
            throw new DomainError(ErrorCode.openSessionExists, `session ${open.id} is still open`, { id: open.id });
          }
          let planNameSnapshot = '';
          let planExercises = [];
          if (planId !== null) {
            const plan = await mustGet(transaction.objectStore(Store.plans), 'plan', planId);
            planNameSnapshot = plan.name;
            planExercises = (await getAllFromIndex(transaction.objectStore(Store.planExercises), 'planId', planId)).sort(bySortOrder);
          }
          const session = { id: newId(), startedAt, endedAt: null, planId, planNameSnapshot, notes: null };
          await requestToPromise(sessions.add(session));

          const exercises = transaction.objectStore(Store.exercises);
          const sessionExercises = transaction.objectStore(Store.sessionExercises);
          for (const [index, planExercise] of planExercises.entries()) {
            const exercise = await mustGet(exercises, 'exercise', planExercise.exerciseId);
            await requestToPromise(
              sessionExercises.add({
                id: newId(),
                sessionId: session.id,
                sortOrder: index,
                exerciseId: exercise.id,
                planExerciseId: planExercise.id,
                exerciseNameSnapshot: exercise.name,
                prescribedSetsSnapshot: planExercise.prescribedSets,
                repMinSnapshot: planExercise.repMin,
                repMaxSnapshot: planExercise.repMax,
              }),
            );
          }
          return session;
        },
      );
    },

    getOpenSession() {
      return tx([Store.sessions], 'readonly', (transaction) => findOpenSession(transaction.objectStore(Store.sessions)));
    },

    /** Adds an exercise outside the plan prescription (ad-hoc session or extra exercise). */
    addExerciseToSession(sessionId, exerciseId) {
      return tx([Store.sessions, Store.exercises, Store.sessionExercises], 'readwrite', async (transaction) => {
        await mustGet(transaction.objectStore(Store.sessions), 'session', sessionId);
        const exercise = await mustGet(transaction.objectStore(Store.exercises), 'exercise', exerciseId);
        const store = transaction.objectStore(Store.sessionExercises);
        const siblings = await getAllFromIndex(store, 'sessionId', sessionId);
        const record = {
          id: newId(),
          sessionId,
          sortOrder: siblings.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1,
          exerciseId,
          planExerciseId: null,
          exerciseNameSnapshot: exercise.name,
          prescribedSetsSnapshot: null,
          repMinSnapshot: null,
          repMaxSnapshot: null,
        };
        await requestToPromise(store.add(record));
        return record;
      });
    },

    addSet(sessionExerciseId, { load, reps, rir = null, type = SetType.normal, dropGroupId = null, completedAt = Date.now() }) {
      const fields = {
        load: validateLoad(load),
        reps: validateReps(reps),
        rir: validateRir(rir),
        type: validateSetType(type),
        dropGroupId: validateDropGroup(type, dropGroupId),
        completedAt: validateTimestamp('completedAt', completedAt),
      };
      return tx([Store.sessionExercises, Store.sets], 'readwrite', async (transaction) => {
        const parent = await mustGet(transaction.objectStore(Store.sessionExercises), 'sessionExercise', sessionExerciseId);
        const store = transaction.objectStore(Store.sets);
        const siblings = await getAllFromIndex(store, 'sessionExerciseId', sessionExerciseId);
        const record = {
          id: newId(),
          sessionExerciseId,
          sessionId: parent.sessionId,
          sortOrder: siblings.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1,
          ...fields,
        };
        await requestToPromise(store.add(record));
        return record;
      });
    },

    updateSet(setId, changes) {
      return tx([Store.sets], 'readwrite', async (transaction) => {
        const store = transaction.objectStore(Store.sets);
        const current = await mustGet(store, 'set', setId);
        const merged = { ...current, ...changes };
        const updated = {
          ...current,
          load: validateLoad(merged.load),
          reps: validateReps(merged.reps),
          rir: validateRir(merged.rir),
          type: validateSetType(merged.type),
          dropGroupId: validateDropGroup(merged.type, merged.dropGroupId),
          completedAt: validateTimestamp('completedAt', merged.completedAt),
        };
        await requestToPromise(store.put(updated));
        return updated;
      });
    },

    deleteSet(setId) {
      return tx([Store.sets], 'readwrite', async (transaction) => {
        const store = transaction.objectStore(Store.sets);
        await mustGet(store, 'set', setId);
        await requestToPromise(store.delete(setId));
      });
    },

    endSession(sessionId, endedAt = Date.now()) {
      validateTimestamp('endedAt', endedAt);
      return tx([Store.sessions], 'readwrite', async (transaction) => {
        const store = transaction.objectStore(Store.sessions);
        const session = await mustGet(store, 'session', sessionId);
        if (endedAt < session.startedAt) {
          throw new DomainError(ErrorCode.validation, 'endedAt: must not be before startedAt', { field: 'endedAt' });
        }
        const updated = { ...session, endedAt };
        await requestToPromise(store.put(updated));
        return updated;
      });
    },

    /** Edits the start time (retroactive logging). */
    updateSessionStart(sessionId, startedAt) {
      validateTimestamp('startedAt', startedAt);
      return tx([Store.sessions], 'readwrite', async (transaction) => {
        const store = transaction.objectStore(Store.sessions);
        const session = await mustGet(store, 'session', sessionId);
        if (session.endedAt !== null && startedAt > session.endedAt) {
          throw new DomainError(ErrorCode.validation, 'startedAt: must not be after endedAt', { field: 'startedAt' });
        }
        const updated = { ...session, startedAt };
        await requestToPromise(store.put(updated));
        return updated;
      });
    },

    /** Edits start and end of an ended session together (history editing). */
    updateSessionTimes(sessionId, { startedAt, endedAt }) {
      validateTimestamp('startedAt', startedAt);
      validateTimestamp('endedAt', endedAt);
      if (endedAt < startedAt) {
        return Promise.reject(new DomainError(ErrorCode.validation, 'endedAt: must not be before startedAt', { field: 'endedAt' }));
      }
      return tx([Store.sessions], 'readwrite', async (transaction) => {
        const store = transaction.objectStore(Store.sessions);
        const session = await mustGet(store, 'session', sessionId);
        if (session.endedAt === null) {
          throw new DomainError(ErrorCode.validation, 'endedAt: session is still open', { field: 'endedAt' });
        }
        const updated = { ...session, startedAt, endedAt };
        await requestToPromise(store.put(updated));
        return updated;
      });
    },

    /** Deletes a session with all of its exercises and sets. */
    deleteSession(sessionId) {
      return tx([Store.sessions, Store.sessionExercises, Store.sets], 'readwrite', async (transaction) => {
        const sessions = transaction.objectStore(Store.sessions);
        await mustGet(sessions, 'session', sessionId);
        await deleteAllFromIndex(transaction.objectStore(Store.sets), 'sessionId', sessionId);
        await deleteAllFromIndex(transaction.objectStore(Store.sessionExercises), 'sessionId', sessionId);
        await requestToPromise(sessions.delete(sessionId));
      });
    },

    /** A session with its exercises (by sortOrder) and each exercise's sets (by sortOrder). */
    getSessionDetail(sessionId) {
      return tx([Store.sessions, Store.sessionExercises, Store.sets], 'readonly', async (transaction) => {
        const session = await mustGet(transaction.objectStore(Store.sessions), 'session', sessionId);
        const exercises = (await getAllFromIndex(transaction.objectStore(Store.sessionExercises), 'sessionId', sessionId)).sort(bySortOrder);
        const sets = await getAllFromIndex(transaction.objectStore(Store.sets), 'sessionId', sessionId);
        return {
          ...session,
          exercises: exercises.map((exercise) => ({
            ...exercise,
            sets: sets.filter((set) => set.sessionExerciseId === exercise.id).sort(bySortOrder),
          })),
        };
      });
    },

    /** Every session with its exercises and sets, read in one transaction, ordered by startedAt. */
    listSessionDetails() {
      return tx([Store.sessions, Store.sessionExercises, Store.sets], 'readonly', async (transaction) => {
        const sessions = await getAll(transaction.objectStore(Store.sessions));
        const exercises = await getAll(transaction.objectStore(Store.sessionExercises));
        const sets = await getAll(transaction.objectStore(Store.sets));
        const setsByExercise = new Map();
        for (const set of sets) {
          if (!setsByExercise.has(set.sessionExerciseId)) setsByExercise.set(set.sessionExerciseId, []);
          setsByExercise.get(set.sessionExerciseId).push(set);
        }
        const exercisesBySession = new Map();
        for (const exercise of exercises) {
          if (!exercisesBySession.has(exercise.sessionId)) exercisesBySession.set(exercise.sessionId, []);
          exercisesBySession.get(exercise.sessionId).push({ ...exercise, sets: (setsByExercise.get(exercise.id) ?? []).sort(bySortOrder) });
        }
        return sessions
          .map((session) => ({ ...session, exercises: (exercisesBySession.get(session.id) ?? []).sort(bySortOrder) }))
          .sort((a, b) => a.startedAt - b.startedAt);
      });
    },

    /** Sessions ordered by startedAt (never by creation time), oldest first. */
    listSessions({ planId } = {}) {
      return tx([Store.sessions], 'readonly', async (transaction) => {
        const store = transaction.objectStore(Store.sessions);
        const sessions = planId === undefined ? await getAll(store) : await getAllFromIndex(store, 'planId', planId);
        return sessions.sort((a, b) => a.startedAt - b.startedAt);
      });
    },

    // MARK: Small key-value records (settings, rest timer)

    getMeta(key) {
      return tx([Store.meta], 'readonly', async (transaction) => (await requestToPromise(transaction.objectStore(Store.meta).get(key)))?.value ?? null);
    },

    setMeta(key, value) {
      return tx([Store.meta], 'readwrite', async (transaction) => {
        await requestToPromise(transaction.objectStore(Store.meta).put({ key, value }));
        return value;
      });
    },

    deleteMeta(key) {
      return tx([Store.meta], 'readwrite', (transaction) => requestToPromise(transaction.objectStore(Store.meta).delete(key)));
    },

    /** Record count per store. Used by tests, backup preview and diagnostics. */
    counts() {
      return tx(ALL_STORES, 'readonly', async (transaction) => {
        const result = {};
        for (const name of ALL_STORES) {
          result[name] = await requestToPromise(transaction.objectStore(name).count());
        }
        return result;
      });
    },

    /** Every record of every store, read in one transaction (backup). */
    exportAll() {
      return tx(ALL_STORES, 'readonly', async (transaction) => {
        const result = {};
        for (const name of ALL_STORES) result[name] = await getAll(transaction.objectStore(name));
        return result;
      });
    },

    /**
     * Replaces ALL data with `data` (already validated, see backup.js) in a
     * single transaction: if anything fails, nothing changes.
     */
    replaceAll(data) {
      return tx(ALL_STORES, 'readwrite', async (transaction) => {
        for (const name of ALL_STORES) await requestToPromise(transaction.objectStore(name).clear());
        for (const name of ALL_STORES) {
          const store = transaction.objectStore(name);
          for (const record of data[name] ?? []) await requestToPromise(store.add(record));
        }
      });
    },

    /** Deletes every record in one transaction (the built-in catalog is seeded again afterwards). */
    clearAll() {
      return tx(ALL_STORES, 'readwrite', async (transaction) => {
        for (const name of ALL_STORES) await requestToPromise(transaction.objectStore(name).clear());
      });
    },

    /** Lists dangling references. A healthy database returns empty arrays. */
    findOrphans() {
      return tx(ALL_STORES, 'readonly', async (transaction) => {
        const ids = async (name) => new Set((await getAll(transaction.objectStore(name))).map((record) => record.id));
        const sessionIds = await ids(Store.sessions);
        const sessionExerciseIds = await ids(Store.sessionExercises);
        const planIds = await ids(Store.plans);
        const exerciseIds = await ids(Store.exercises);
        const sets = await getAll(transaction.objectStore(Store.sets));
        const sessionExercises = await getAll(transaction.objectStore(Store.sessionExercises));
        const planExercises = await getAll(transaction.objectStore(Store.planExercises));
        return {
          sets: sets.filter((set) => !sessionExerciseIds.has(set.sessionExerciseId) || !sessionIds.has(set.sessionId)).map((set) => set.id),
          sessionExercises: sessionExercises
            .filter((item) => !sessionIds.has(item.sessionId) || !exerciseIds.has(item.exerciseId))
            .map((item) => item.id),
          planExercises: planExercises
            .filter((item) => !planIds.has(item.planId) || !exerciseIds.has(item.exerciseId))
            .map((item) => item.id),
        };
      });
    },
  };

  // Every method returns a promise, including validation failures, so callers
  // can rely on a single error path (await / .catch).
  for (const [name, method] of Object.entries(repository)) {
    repository[name] = async (...args) => method.apply(repository, args);
  }
  return Object.freeze(repository);
}
