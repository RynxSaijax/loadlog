import { ptBR } from './pt-BR.js';

const catalog = ptBR;

/**
 * Returns the localized string for `key`, replacing {placeholders} with
 * values from `params`. Throws on a missing key so mistakes surface in tests.
 */
export function t(key, params = {}) {
  const template = catalog[key];
  if (template === undefined) {
    throw new Error(`Missing string key: ${key}`);
  }
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

/** Plural form: picks `${key}.one` for 1 and `${key}.other` otherwise; {count} is filled in. */
export function tp(key, count, params = {}) {
  return t(`${key}.${count === 1 ? 'one' : 'other'}`, { count, ...params });
}

export function hasKey(key) {
  return Object.prototype.hasOwnProperty.call(catalog, key);
}

export const locale = 'pt-BR';
