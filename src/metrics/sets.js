import { isEffective, SetType } from './set-type.js';

/**
 * Set-level rules (4.2 and 4.3). Inputs are set snapshots
 * ({ order, load, reps, type, dropGroupId }).
 */

const byOrder = (a, b) => a.order - b.order;

/** Every set whose type is not warmup. */
export function effectiveSets(sets) {
  return sets.filter((set) => isEffective(set.type));
}

/**
 * Effective sets with each drop-set reduced to its main (first) step.
 * Used for set counts, PRs, progress and best set.
 */
export function primarySets(sets) {
  const seenGroups = new Set();
  const result = [];
  for (const set of [...effectiveSets(sets)].sort(byOrder)) {
    if (set.type === SetType.dropSet && set.dropGroupId) {
      if (seenGroups.has(set.dropGroupId)) continue;
      seenGroups.add(set.dropGroupId);
    }
    result.push(set);
  }
  return result;
}

/** Tonnage = Σ load × reps over effective sets, every drop-set step included. */
export function tonnage(sets) {
  return effectiveSets(sets).reduce((sum, set) => sum + set.load * set.reps, 0);
}

/** Effective set count; a whole drop-set counts as 1. */
export function countEffectiveSets(sets) {
  return primarySets(sets).length;
}

/**
 * Best set: highest load; ties broken by more reps, then by the earlier set.
 * Considers main steps only. Returns null when there is no effective set.
 */
export function bestSet(sets) {
  let best = null;
  for (const set of primarySets(sets)) {
    if (best === null || set.load > best.load || (set.load === best.load && set.reps > best.reps)) {
      best = set;
    }
  }
  return best;
}

/** Simple mean of load over the considered sets (main steps). Null when empty. */
export function averageLoad(sets) {
  const considered = primarySets(sets);
  if (considered.length === 0) return null;
  return considered.reduce((sum, set) => sum + set.load, 0) / considered.length;
}
