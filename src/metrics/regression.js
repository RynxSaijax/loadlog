/** Minimum number of weekly points for a trend (4.8). */
export const MIN_TREND_POINTS = 3;

/**
 * Ordinary least-squares line through `points` ({ x, y }).
 * Returns null ("dados insuficientes") with fewer than 3 points, or when all
 * x are equal.
 * @returns {{ slope: number, intercept: number }|null}
 */
export function linearRegression(points) {
  if (points.length < MIN_TREND_POINTS) return null;
  const n = points.length;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / n;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / n;
  let covariance = 0;
  let varianceX = 0;
  for (const { x, y } of points) {
    covariance += (x - meanX) * (y - meanY);
    varianceX += (x - meanX) ** 2;
  }
  if (varianceX === 0) return null;
  const slope = covariance / varianceX;
  return { slope, intercept: meanY - slope * meanX };
}
