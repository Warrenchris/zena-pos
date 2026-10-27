import { openDb, isIndexedDbAvailable, STORES } from './idb';

export const DEVICE_ID_KEY = 'zana.deviceId.v1';
export const FALLBACK_COUNTER_KEY = 'zana.offlineCounter.v1';
export const RECEIPT_COUNTER_KEY = 'offlineReceiptSequence';

/**
 * Generates or retrieves a persisted 4-character random device identifier.
 * Example: "A7B9"
 */
export function getDeviceId(storage = typeof window !== 'undefined' ? window.localStorage : null) {
  try {
    const existing = storage?.getItem(DEVICE_ID_KEY);
    if (existing && /^[0-9A-Z]{4}$/.test(existing)) {
      return existing;
    }
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let id = '';
    for (let i = 0; i < 4; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    storage?.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return 'DFLT';
  }
}

let queue = Promise.resolve();

/**
 * Atomically increments the receipt counter inside an IndexedDB transaction
 * and returns the next formatted receipt number: R-<deviceId>-<counter, 6 digits>.
 *
 * If IndexedDB is unavailable, falls back to a localStorage counter and invokes onFallback.
 *
 * @param {object} [options]
 * @param {string} [options.deviceId] - Override deviceId (e.g. for testing)
 * @param {Storage} [options.storage] - Storage override for deviceId / fallback
 * @param {Function} [options.onFallback] - Warning callback when fallback is used
 * @returns {Promise<string>} e.g. "R-A7B9-000001"
 */
export function getNextReceiptNumber(options = {}) {
  const deviceId = options.deviceId || getDeviceId(options.storage);

  // Queue guarantees in-process concurrency safety
  queue = queue.then(async () => {
    let nextSeq;

    if (isIndexedDbAvailable()) {
      try {
        const db = await openDb();
        nextSeq = await new Promise((resolve, reject) => {
          const tx = db.transaction(STORES.counters, 'readwrite');
          const store = tx.objectStore(STORES.counters);
          let val;

          const getReq = store.get(RECEIPT_COUNTER_KEY);
          getReq.onsuccess = () => {
            const current = getReq.result;
            const count = current && typeof current.value === 'number' ? current.value : 0;
            val = count + 1;
            store.put({ key: RECEIPT_COUNTER_KEY, value: val });
          };
          getReq.onerror = () => reject(getReq.error);

          tx.oncomplete = () => resolve(val);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || new Error('Counter transaction aborted'));
        });
      } catch (err) {
        options.onFallback?.('IndexedDB is unavailable. Falling back to local storage counter.');
        nextSeq = incrementFallbackCounter(options.storage);
      }
    } else {
      options.onFallback?.('IndexedDB is unavailable. Falling back to local storage counter.');
      nextSeq = incrementFallbackCounter(options.storage);
    }

    const padded = String(nextSeq).padStart(6, '0');
    return `R-${deviceId}-${padded}`;
  });

  return queue;
}

/**
 * Bumps the counter forward past a collision and returns the next receipt number.
 */
export async function bumpAndGetNextReceiptNumber(options = {}) {
  await bumpReceiptCounter(1, options);
  return getNextReceiptNumber(options);
}

/**
 * Directly advances the receipt counter by `by` steps in IndexedDB and fallback.
 */
export function bumpReceiptCounter(by = 1, options = {}) {
  queue = queue.then(async () => {
    if (isIndexedDbAvailable()) {
      try {
        const db = await openDb();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORES.counters, 'readwrite');
          const store = tx.objectStore(STORES.counters);
          const getReq = store.get(RECEIPT_COUNTER_KEY);
          getReq.onsuccess = () => {
            const current = getReq.result;
            const count = current && typeof current.value === 'number' ? current.value : 0;
            store.put({ key: RECEIPT_COUNTER_KEY, value: count + by });
          };
          getReq.onerror = () => reject(getReq.error);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      } catch {
        bumpFallbackCounter(by, options.storage);
      }
    } else {
      bumpFallbackCounter(by, options.storage);
    }
  });

  return queue;
}

function incrementFallbackCounter(storage = typeof window !== 'undefined' ? window.localStorage : null) {
  try {
    const raw = storage?.getItem(FALLBACK_COUNTER_KEY);
    const curr = parseInt(raw, 10);
    const next = Number.isFinite(curr) && curr >= 0 ? curr + 1 : 1;
    storage?.setItem(FALLBACK_COUNTER_KEY, String(next));
    return next;
  } catch {
    return Math.floor(Math.random() * 900000) + 100000;
  }
}

function bumpFallbackCounter(by = 1, storage = typeof window !== 'undefined' ? window.localStorage : null) {
  try {
    const raw = storage?.getItem(FALLBACK_COUNTER_KEY);
    const curr = parseInt(raw, 10);
    const next = (Number.isFinite(curr) && curr >= 0 ? curr : 0) + by;
    storage?.setItem(FALLBACK_COUNTER_KEY, String(next));
  } catch {}
}
