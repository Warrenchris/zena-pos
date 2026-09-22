import { STORES, idbDelete, idbGetAllByIndex, idbGet, idbPut, isIndexedDbAvailable, openDb } from './idb';
import { generateUUID } from '../utils/uuid';

/**
 * Durable queue of cash sales made while the server was unreachable.
 *
 * Storage: IndexedDB. If IndexedDB is unavailable or fails (some private modes), the
 * queue falls back to localStorage under the same key the app has always used, so a sale
 * is never silently kept in memory only.
 *
 * Entry: { id, idempotencyKey, cashierId, saleData, queuedAt, status, attempts, lastError, lastAttemptAt }
 *   status: 'pending' (will be sent) | 'failed' (rejected by the server; needs a person to look at it)
 */

export const legacyStorageKey = (cashierId) => `zena_pending_sales_${cashierId || 'anonymous'}`;
const cashierKey = (cashierId) => String(cashierId || 'anonymous');

// ---- change notifications (so banners and the dashboard update together) ----
const listeners = new Set();
export function subscribeQueue(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const notify = () => listeners.forEach((listener) => listener());

// ---- entries ----
export function normalizeEntry(raw, cashierId) {
  const idempotencyKey = raw.idempotencyKey || raw.id || generateUUID();
  return {
    id: raw.id || idempotencyKey,
    idempotencyKey,
    cashierId: cashierKey(raw.cashierId ?? cashierId),
    saleData: { ...(raw.saleData || {}), idempotencyKey },
    queuedAt: raw.queuedAt || Date.now(),
    status: raw.status === 'failed' ? 'failed' : 'pending',
    attempts: Number.isInteger(raw.attempts) ? raw.attempts : 0,
    lastError: raw.lastError || null,
    lastAttemptAt: raw.lastAttemptAt || null,
  };
}

export function createEntry(salePayload, cashierId) {
  const idempotencyKey = salePayload.idempotencyKey || generateUUID();
  return normalizeEntry({ id: idempotencyKey, idempotencyKey, saleData: salePayload, queuedAt: Date.now() }, cashierId);
}

// ---- backend selection ----
let idbUsable = null; // memoized per page load

async function canUseIdb() {
  if (idbUsable !== null) return idbUsable;
  if (!isIndexedDbAvailable()) {
    idbUsable = false;
    return false;
  }
  try {
    await openDb();
    idbUsable = true;
  } catch {
    idbUsable = false;
  }
  return idbUsable;
}

/** Test hook: forget the memoized backend choice. */
export function resetQueueBackend() {
  idbUsable = null;
}

// ---- localStorage fallback ----
function readLocal(cashierId) {
  try {
    const raw = localStorage.getItem(legacyStorageKey(cashierId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map((entry) => normalizeEntry(entry, cashierId)) : [];
  } catch {
    return [];
  }
}

function writeLocal(cashierId, entries) {
  if (entries.length === 0) {
    localStorage.removeItem(legacyStorageKey(cashierId));
  } else {
    localStorage.setItem(legacyStorageKey(cashierId), JSON.stringify(entries));
  }
}

// ---- public API ----
export async function listQueue(cashierId) {
  const entries = (await canUseIdb())
    ? (await idbGetAllByIndex(STORES.pendingSales, 'cashierId', cashierKey(cashierId))).map((e) => normalizeEntry(e, cashierId))
    : readLocal(cashierId);
  return entries.sort((a, b) => a.queuedAt - b.queuedAt);
}

/** Save (insert or update) an entry. Throws only if it could not be stored anywhere. */
export async function saveEntry(entry) {
  const clean = normalizeEntry(entry, entry.cashierId);
  if (await canUseIdb()) {
    try {
      await idbPut(STORES.pendingSales, clean);
      notify();
      return clean;
    } catch (error) {
      console.warn('IndexedDB write failed, falling back to localStorage:', error);
    }
  }
  const others = readLocal(clean.cashierId).filter((e) => e.id !== clean.id);
  writeLocal(clean.cashierId, [...others, clean]); // throws if storage is full/blocked
  notify();
  return clean;
}

export async function removeEntry(entry) {
  if (await canUseIdb()) {
    await idbDelete(STORES.pendingSales, entry.id);
  } else {
    writeLocal(entry.cashierId, readLocal(entry.cashierId).filter((e) => e.id !== entry.id));
  }
  notify();
}

/**
 * Move sales queued by older versions of the app (localStorage) into IndexedDB.
 * The old key is removed only after every entry has been written.
 * @returns {Promise<number>} how many sales were moved
 */
export async function migrateLegacyQueue(cashierId) {
  if (!(await canUseIdb())) return 0;
  let entries;
  try {
    const raw = localStorage.getItem(legacyStorageKey(cashierId));
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    entries = Array.isArray(parsed) ? parsed.map((entry) => normalizeEntry(entry, cashierId)) : [];
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const existing = await idbGet(STORES.pendingSales, entry.id);
    if (!existing) await idbPut(STORES.pendingSales, entry);
  }
  localStorage.removeItem(legacyStorageKey(cashierId));
  if (entries.length > 0) notify();
  return entries.length;
}
