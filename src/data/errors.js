/** Error codes raised by the data layer. The UI maps codes to pt-BR messages. */
export const ErrorCode = Object.freeze({
  validation: 'validation',
  notFound: 'notFound',
  hasHistory: 'hasHistory',
  inUse: 'inUse',
  openSessionExists: 'openSessionExists',
  storageUnavailable: 'storageUnavailable',
  duplicateName: 'duplicateName',
  invalidBackup: 'invalidBackup',
});

export class DomainError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}

export function validationError(field, message) {
  return new DomainError(ErrorCode.validation, `${field}: ${message}`, { field });
}
