/** Small promise helpers over the IndexedDB API. */

export function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new DOMException('Transaction aborted', 'AbortError'));
  });
}

/**
 * Runs `work(transaction)` inside one transaction. Either every write in it
 * is committed or none is: any thrown error aborts the transaction.
 *
 * `work` may only await IndexedDB requests of this transaction; awaiting
 * anything else lets the transaction auto-commit early.
 */
export async function runTransaction(db, storeNames, mode, work) {
  const transaction = db.transaction(storeNames, mode);
  const done = transactionDone(transaction);
  let result;
  try {
    result = await work(transaction);
  } catch (error) {
    done.catch(() => {});
    try {
      transaction.abort();
    } catch {
      // Already aborted by the failing request.
    }
    throw error;
  }
  await done;
  return result;
}

export function getAll(store, query) {
  return requestToPromise(store.getAll(query));
}

export function getAllFromIndex(store, indexName, key) {
  return requestToPromise(store.index(indexName).getAll(key));
}

export function countFromIndex(store, indexName, key) {
  return requestToPromise(store.index(indexName).count(key));
}
