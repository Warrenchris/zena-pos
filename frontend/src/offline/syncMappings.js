import { STORES, idbGet, idbPut, isIndexedDbAvailable } from './idb';

const FALLBACK_KEY = 'zana_sync_mappings';

function getFallbackMappings() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(FALLBACK_KEY) : null;
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setFallbackMapping(receiptNumber, serverInvoiceNumber) {
  try {
    if (typeof localStorage === 'undefined') return;
    const map = getFallbackMappings();
    map[receiptNumber] = serverInvoiceNumber;
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(map));
  } catch {}
}

/**
 * Persist the mapping between an offline receipt number and the server invoice number
 * once the offline sale has synced successfully.
 *
 * @param {string} receiptNumber - Local receipt number (e.g. "R-7K2X-000001")
 * @param {string} serverInvoiceNumber - Server-assigned invoice number (e.g. "20261024-0001")
 */
export async function saveSyncMapping(receiptNumber, serverInvoiceNumber) {
  if (!receiptNumber || !serverInvoiceNumber) return;

  if (isIndexedDbAvailable()) {
    try {
      await idbPut(STORES.syncMappings, {
        receiptNumber,
        serverInvoiceNumber,
        syncedAt: Date.now()
      });
      return;
    } catch (e) {
      console.warn('Failed to save sync mapping to IndexedDB, using fallback:', e);
    }
  }

  setFallbackMapping(receiptNumber, serverInvoiceNumber);
}

/**
 * Look up the server invoice number for a given offline receipt number.
 *
 * @param {string} receiptNumber - Local receipt number
 * @returns {Promise<string|null>} The server invoice number if synced, otherwise null
 */
export async function getServerInvoiceNumber(receiptNumber) {
  if (!receiptNumber) return null;

  if (isIndexedDbAvailable()) {
    try {
      const record = await idbGet(STORES.syncMappings, receiptNumber);
      if (record?.serverInvoiceNumber) {
        return record.serverInvoiceNumber;
      }
    } catch (e) {
      console.warn('Failed to read sync mapping from IndexedDB, trying fallback:', e);
    }
  }

  const map = getFallbackMappings();
  return map[receiptNumber] || null;
}
