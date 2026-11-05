import { mapRecord } from './mapping.js';
import { normalizeName } from '../normalize.js';

export const ReviewStatus = Object.freeze({
  new: 'new',
  duplicateExisting: 'duplicateExisting',
  duplicateInFile: 'duplicateInFile',
  invalid: 'invalid',
});

/**
 * Step 2: maps every record and flags duplicates by normalized name, against
 * the exercises already stored (archived included) and earlier rows of the
 * same file. Only `new` entries can be selected; they start selected.
 *
 * @returns {{ index: number, status: string, problem: string|null, item: object|null, sourceName: string, selected: boolean }[]}
 */
export function buildReview(records, mapping, existingExercises) {
  const taken = new Set(existingExercises.map((exercise) => normalizeName(exercise.name)));
  const seenInFile = new Set();
  return records.map((record, index) => {
    const { item, problem } = mapRecord(record, mapping);
    const sourceName = String((mapping.name && record[mapping.name]) ?? '').trim();
    if (!item) return { index, status: ReviewStatus.invalid, problem, item: null, sourceName, selected: false };
    const key = normalizeName(item.name);
    let status = ReviewStatus.new;
    if (taken.has(key)) status = ReviewStatus.duplicateExisting;
    else if (seenInFile.has(key)) status = ReviewStatus.duplicateInFile;
    seenInFile.add(key);
    return { index, status, problem: null, item, sourceName, selected: status === ReviewStatus.new };
  });
}

export function reviewCounts(entries) {
  const counts = { new: 0, duplicateExisting: 0, duplicateInFile: 0, invalid: 0, selected: 0 };
  for (const entry of entries) {
    counts[entry.status] += 1;
    if (entry.selected) counts.selected += 1;
  }
  return counts;
}
