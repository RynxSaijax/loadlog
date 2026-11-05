/**
 * Direction of change between two consecutive values (domain rule 4.3).
 * A relative change greater than +1% is 'up', lower than -1% is 'down',
 * and anything in the closed interval [-1%, +1%] is 'flat'.
 *
 * Pure module: no DOM, no storage. Runs in the browser and in Node tests.
 */
export const TrendDirection = Object.freeze({
  up: 'up',
  flat: 'flat',
  down: 'down',
});

export const TREND_THRESHOLD = 0.01;

/**
 * When `previous` is zero the relative change is undefined, so the sign of
 * `current` decides the direction.
 */
export function trendBetween(previous, current) {
  if (previous === 0) {
    if (current > 0) return TrendDirection.up;
    if (current < 0) return TrendDirection.down;
    return TrendDirection.flat;
  }
  const change = (current - previous) / Math.abs(previous);
  if (change > TREND_THRESHOLD) return TrendDirection.up;
  if (change < -TREND_THRESHOLD) return TrendDirection.down;
  return TrendDirection.flat;
}
