/**
 * Set types (data model section 3). Shared by the data layer and the metrics
 * module. Pure constants.
 */
export const SetType = Object.freeze({
  warmup: 'warmup',
  normal: 'normal',
  failure: 'failure',
  dropSet: 'dropSet',
  backOff: 'backOff',
});

export const SET_TYPES = Object.freeze(Object.values(SetType));

/** Effective sets are every type except warmup (rule 4.2). */
export function isEffective(type) {
  return type !== SetType.warmup;
}
