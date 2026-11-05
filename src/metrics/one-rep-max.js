/** Above this many reps the Epley estimate is flagged as low confidence (4.3). */
export const ONE_REP_MAX_CONFIDENT_REPS = 12;

/**
 * Estimated 1RM by Epley: load × (1 + reps / 30); with 1 rep it is the load.
 * @returns {{ value: number, lowConfidence: boolean }}
 */
export function estimateOneRepMax(load, reps) {
  const value = reps === 1 ? load : load * (1 + reps / 30);
  return { value, lowConfidence: reps > ONE_REP_MAX_CONFIDENT_REPS };
}
