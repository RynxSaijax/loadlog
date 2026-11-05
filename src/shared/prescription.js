import { t } from '../i18n/i18n.js';
import { formatDuration } from './format.js';

/** "4 × 6–8 · 2:30" */
export function prescriptionText({ prescribedSets, repMin, repMax, restSeconds }) {
  const reps =
    repMin === repMax
      ? t('prescription.single', { sets: prescribedSets, reps: repMin })
      : t('prescription.range', { sets: prescribedSets, min: repMin, max: repMax });
  return t('prescription.withRest', { reps, rest: formatDuration(restSeconds) });
}
