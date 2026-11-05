import { openRepository } from './repository.js';

let repositoryPromise = null;

/**
 * The app's single repository, opened and seeded once per launch.
 * Rejects if the browser storage is unavailable.
 */
export function getRepository() {
  if (!repositoryPromise) {
    repositoryPromise = (async () => {
      const repository = await openRepository();
      await repository.seedCatalog();
      return repository;
    })();
    repositoryPromise.catch(() => {
      repositoryPromise = null;
    });
  }
  return repositoryPromise;
}

/**
 * Asks the browser to keep the data even under storage pressure. On iOS this
 * is granted to apps added to the home screen. Returns whether the storage
 * is persistent.
 */
export async function requestPersistentStorage() {
  const storage = globalThis.navigator?.storage;
  if (!storage?.persist) return false;
  try {
    if (await storage.persisted()) return true;
    return await storage.persist();
  } catch {
    return false;
  }
}
