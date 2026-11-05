import { getRepository } from '../../data/app-data.js';
import { incrementFor, loadSettings } from '../../data/settings.js';
import { toSessionSnapshot } from '../../data/snapshots.js';
import { toSnapshots } from '../../data/session-snapshots.js';
import { SetType } from '../../data/enums.js';
import { countEffectiveSets, isEffective, makeSetSnapshot } from '../../metrics/index.js';
import { endTimeFor, extraSetNumber, lastTime, prefill, recordsForSet, sessionSummary, stepLoad } from './session-logic.js';

/**
 * State of the screen that is not stored: which exercise is in focus, the
 * values being edited for the next set, and open drop-sets. Kept per session
 * while the app runs.
 */
const ui = { sessionId: null, focusId: null, drafts: new Map(), dropGroups: new Map(), keypad: null };

export function uiState(sessionId) {
  if (ui.sessionId !== sessionId) {
    ui.sessionId = sessionId;
    ui.focusId = null;
    ui.drafts = new Map();
    ui.dropGroups = new Map();
    ui.keypad = null;
  }
  return ui;
}

export async function loadOpenSessionId() {
  return (await (await getRepository()).getOpenSession())?.id ?? null;
}

/**
 * Everything the session screen shows, recomputed from storage.
 * @returns {Promise<object>} view state
 */
export async function loadSessionState(sessionId) {
  const repository = await getRepository();
  const [detail, exercises, details, settings] = await Promise.all([
    repository.getSessionDetail(sessionId),
    repository.listExercises({ includeArchived: true }),
    repository.listSessionDetails(),
    loadSettings(),
  ]);
  const exercisesById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  let planItems = new Map();
  if (detail.planId) {
    try {
      planItems = new Map((await repository.getPlan(detail.planId)).exercises.map((item) => [item.id, item]));
    } catch {
      planItems = new Map();
    }
  }
  const past = toSnapshots(details.filter((other) => other.id !== sessionId), exercisesById);
  const current = toSessionSnapshot({ ...detail, exercises: detail.exercises.filter((item) => exercisesById.has(item.exerciseId)) }, exercisesById);
  const state = uiState(sessionId);
  if (!state.focusId || !detail.exercises.some((item) => item.id === state.focusId)) {
    const firstOpen = detail.exercises.find((item) => countEffectiveSets(item.sets.map((set) => makeSetSnapshot({ id: set.id, order: set.sortOrder, load: set.load, reps: set.reps, rir: set.rir, type: set.type, dropGroupId: set.dropGroupId, completedAt: set.completedAt }))) < (item.prescribedSetsSnapshot ?? 1));
    state.focusId = (firstOpen ?? detail.exercises[0])?.id ?? null;
  }

  const items = detail.exercises.map((item) => {
    const exercise = exercisesById.get(item.exerciseId);
    const currentSets = item.sets.map((set) =>
      makeSetSnapshot({ id: set.id, order: set.sortOrder, load: set.load, reps: set.reps, rir: set.rir, type: set.type, dropGroupId: set.dropGroupId, completedAt: set.completedAt }),
    );
    const increment = incrementFor(exercise, settings);
    const dropGroupId = state.dropGroups.get(item.id) ?? null;
    let draft = state.drafts.get(item.id);
    if (!draft) {
      const base = prefill({ currentSets, pastSessions: past, planId: detail.planId, exerciseId: item.exerciseId, startedAt: detail.startedAt, repMin: item.repMinSnapshot });
      draft = { load: base.load, reps: base.reps, rir: null, source: base.source };
      state.drafts.set(item.id, draft);
    }
    const planItem = item.planExerciseId ? planItems.get(item.planExerciseId) : null;
    return {
      item,
      exercise,
      increment,
      draft,
      dropGroupId,
      restSeconds: planItem?.restSeconds ?? settings.defaultRestSeconds,
      lastTime: detail.planId ? lastTime(past, detail.planId, item.exerciseId, detail.startedAt) : null,
      extraSet: extraSetNumber(currentSets, item.prescribedSetsSnapshot, { inDropSet: Boolean(dropGroupId) }),
      effectiveDone: countEffectiveSets(currentSets),
    };
  });

  return { detail, items, settings, past, current, focusId: state.focusId, keypad: state.keypad };
}

export function setFocus(sessionId, sessionExerciseId) {
  const state = uiState(sessionId);
  state.focusId = sessionExerciseId;
  state.keypad = null;
}

export function setKeypad(sessionId, keypadState) {
  uiState(sessionId).keypad = keypadState;
}

export function updateDraft(sessionId, sessionExerciseId, changes) {
  const state = uiState(sessionId);
  state.drafts.set(sessionExerciseId, { ...state.drafts.get(sessionExerciseId), ...changes });
}

export function adjustDraftLoad(sessionId, entry, direction) {
  updateDraft(sessionId, entry.item.id, { load: stepLoad(entry.draft.load, entry.increment, direction) });
}

/**
 * Logs the draft as a set. Returns the stored set, the records it broke and
 * whether the rest timer should start.
 */
export async function confirmSet(state, entry) {
  const repository = await getRepository();
  const type = entry.dropGroupId ? SetType.dropSet : SetType.normal;
  // The draft may have changed since `entry` was built (e.g. RIR stepper without a redraw).
  const draft = uiState(state.detail.id).drafts.get(entry.item.id) ?? entry.draft;
  const set = await repository.addSet(entry.item.id, {
    load: draft.load,
    reps: draft.reps,
    rir: state.settings.showRir ? draft.rir ?? null : null,
    type,
    dropGroupId: entry.dropGroupId,
  });
  const ui = uiState(state.detail.id);
  ui.drafts.set(entry.item.id, entry.dropGroupId
    ? { load: stepLoad(set.load, entry.increment, -1), reps: set.reps, rir: null, source: 'previousSet' }
    : { load: set.load, reps: set.reps, rir: null, source: 'previousSet' });

  const refreshed = await loadSessionState(state.detail.id);
  const snapshotSet = refreshed.current.exercises.flatMap((exercise) => exercise.sets).find((candidate) => candidate.id === set.id);
  const records = snapshotSet ? recordsForSet(refreshed.past, refreshed.current, entry.item.exerciseId, snapshotSet) : [];
  return { set, records, startsRest: isEffective(set.type) };
}

export async function changeSetType(sessionId, set, type) {
  const repository = await getRepository();
  await repository.updateSet(set.id, { type, dropGroupId: type === SetType.dropSet ? set.dropGroupId : null });
}

export async function changeSetRir(set, rir) {
  await (await getRepository()).updateSet(set.id, { rir });
}

export async function deleteSet(sessionId, sessionExerciseId, set) {
  await (await getRepository()).deleteSet(set.id);
  const state = uiState(sessionId);
  state.drafts.delete(sessionExerciseId);
  if (set.dropGroupId && state.dropGroups.get(sessionExerciseId) === set.dropGroupId) state.dropGroups.delete(sessionExerciseId);
}

/** Turns `set` into the main step of a new drop-set; the next sets join it. */
export async function startDropSet(state, entry, set) {
  const groupId = globalThis.crypto.randomUUID();
  await (await getRepository()).updateSet(set.id, { type: SetType.dropSet, dropGroupId: groupId });
  const ui = uiState(state.detail.id);
  ui.dropGroups.set(entry.item.id, groupId);
  ui.drafts.set(entry.item.id, { load: stepLoad(set.load, entry.increment, -1), reps: set.reps, rir: null, source: 'previousSet' });
}

export function endDropSet(sessionId, sessionExerciseId) {
  const state = uiState(sessionId);
  state.dropGroups.delete(sessionExerciseId);
  state.drafts.delete(sessionExerciseId);
}

export async function addExerciseToSession(sessionId, exerciseId) {
  const item = await (await getRepository()).addExerciseToSession(sessionId, exerciseId);
  setFocus(sessionId, item.id);
  return item;
}

export async function changeStart(sessionId, startedAt) {
  await (await getRepository()).updateSessionStart(sessionId, startedAt);
  const state = uiState(sessionId);
  state.drafts = new Map();
}

export async function finishSession(state) {
  const allSets = state.detail.exercises.flatMap((item) => item.sets);
  return (await getRepository()).endSession(state.detail.id, endTimeFor(state.detail.startedAt, allSets, Date.now()));
}

export async function discardSession(sessionId) {
  await (await getRepository()).deleteSession(sessionId);
  uiState(null);
}

/** Summary of an ended session. */
export async function loadSummary(sessionId) {
  const repository = await getRepository();
  const [detail, exercises, details] = await Promise.all([
    repository.getSessionDetail(sessionId),
    repository.listExercises({ includeArchived: true }),
    repository.listSessionDetails(),
  ]);
  const exercisesById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const past = toSnapshots(details.filter((other) => other.id !== sessionId), exercisesById);
  const current = toSessionSnapshot({ ...detail, exercises: detail.exercises.filter((item) => exercisesById.has(item.exerciseId)) }, exercisesById);
  return { detail, exercisesById, summary: sessionSummary(current, past) };
}
