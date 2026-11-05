import { t, hasKey } from '../i18n/i18n.js';
import { ErrorCode } from '../data/errors.js';

/** pt-BR message for any error the data layer can raise. */
export function errorMessage(error) {
  switch (error?.code) {
    case ErrorCode.validation: {
      const key = `errors.field.${error.details?.field}`;
      return hasKey(key) ? t(key) : t('errors.validation');
    }
    case ErrorCode.duplicateName:
      return t('errors.duplicateName');
    case ErrorCode.hasHistory:
      return t('errors.hasHistory');
    case ErrorCode.inUse:
      return t('errors.inUse');
    case ErrorCode.notFound:
      return t('errors.notFound');
    case ErrorCode.storageUnavailable:
      return t('errors.storage');
    case ErrorCode.openSessionExists:
      return t('errors.openSession');
    case ErrorCode.invalidBackup:
      return t('errors.invalidBackup');
    default:
      return t('errors.generic');
  }
}
