/**
 * Minimal promise wrapper around IndexedDB for the app's offline data:
 *   - pendingSales: cash sales rung up while offline, waiting to reach the server
 *   - catalog:      a per-shop snapshot of the product list, used to keep selling offline
 *
 * IndexedDB (unlike localStorage) is asynchronous, holds far more data, and is not
 * wiped by the browser as readily under storage pressure.
 */

export const DB_NAME = 'zana-pos-offline';
const DB_VERSION = 1;

export const STORES = {
  pendingSales: 'pendingSales',
  catalog: 'catalog',
};

let dbPromise = null;

export function isIndexedDbAvailable() {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.pendingSales)) {
        const store = db.createObjectStore(STORES.pendingSales, { keyPath: 'id' });
        store.createIndex('cashierId', 'cashierId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.catalog)) {
        db.createObjectStore(STORES.catalog, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
  }).catch((error) => {
    dbPromise = null; // allow a later retry
    throw error;
  });
  return dbPromise;
}

/** Close the connection (used by tests, and to release it before deleting the database). */
export async function closeDb() {
  if (!dbPromise) return;
  try {
    (await dbPromise).close();
  } catch {
    // Nothing to close.
  }
  dbPromise = null;
}

/** Run `work(store)` in one transaction and resolve with its request's result once the transaction commits. */
function inTransaction(storeName, mode, work) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        let request;
        try {
          request = work(tx.objectStore(storeName));
        } catch (error) {
          reject(error);
          try {
            tx.abort();
          } catch {
            // Already finished.
          }
          return;
        }
        tx.oncomplete = () => resolve(request ? request.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
      })
  );
}

export const idbGet = (store, key) => inTransaction(store, 'readonly', (s) => s.get(key));
export const idbGetAll = (store) => inTransaction(store, 'readonly', (s) => s.getAll());
export const idbGetAllByIndex = (store, index, value) =>
  inTransaction(store, 'readonly', (s) => s.index(index).getAll(value));
export const idbPut = (store, value) => inTransaction(store, 'readwrite', (s) => s.put(value));
export const idbDelete = (store, key) => inTransaction(store, 'readwrite', (s) => s.delete(key));
export const idbClear = (store) => inTransaction(store, 'readwrite', (s) => s.clear());
