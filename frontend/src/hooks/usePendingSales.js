import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import api from '../services/api';
import { generateUUID } from '../utils/uuid';
import { createEntry, listQueue, removeEntry, saveEntry, subscribeQueue } from '../offline/salesQueue';
import { flushSales, registerQueueOwner, requeueEntry } from '../offline/salesSync';

const RETRY_INTERVAL_MS = 60 * 1000;

/**
 * usePendingSales
 * Offline resilience queue for CASH sales.
 *
 * Sales are stored durably on the device (IndexedDB) with an idempotency key, and sent when the
 * connection is back: when the browser reports it is online, on load, and once a minute while
 * anything is waiting (so a server that was briefly down doesn't strand a sale until the next reload).
 * A sale the server refuses is kept as "failed" or "conflict" for a person to review; it is never dropped silently.
 */
export function usePendingSales(cashierId, { onSaleSynced, showToast } = {}) {
  const [entries, setEntries] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Callers pass fresh inline callbacks on every render; keep them out of effect dependencies.
  const callbacks = useRef({ onSaleSynced, showToast });
  useEffect(() => {
    callbacks.current = { onSaleSynced, showToast };
  });

  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    try {
      const list = await listQueue(cashierId);
      if (mounted.current) setEntries(list);
    } catch (err) {
      console.warn('Failed to read the offline sales queue:', err);
    }
  }, [cashierId]);

  // Tell the global background sync that this hook is handling the queue right now.
  useEffect(() => registerQueueOwner(), []);

  // Load on mount / cashier change; stay in sync with other writers.
  useEffect(() => {
    mounted.current = true;
    refresh();
    const unsubscribe = subscribeQueue(refresh);
    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, [cashierId, refresh]);

  // Queue a sale locally. The sale shows up immediately and is written to the device in the background.
  const queueSale = useCallback(
    (salePayload) => {
      const entry = createEntry(salePayload, cashierId);
      setEntries((prev) => [...prev, entry]);
      saveEntry(entry).catch((err) => {
        console.error('Failed to store the offline sale on this device:', err);
        callbacks.current.showToast?.(
          'Could not save this offline sale on the device. Do not close the app until it syncs.',
          'error'
        );
      });
      return entry;
    },
    [cashierId]
  );

  const flushPendingSales = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    setIsSyncing(true);
    try {
      const summary = await flushSales({ cashierId, api });
      if (!summary.joined) {
        const { onSaleSynced: synced, showToast: toast } = callbacks.current;
        summary.syncedResponses.forEach((data) => synced?.(data));
        if (summary.synced > 0) toast?.(`Synced ${summary.synced} offline sale(s) with the server`, 'success');
        if (summary.conflicts > 0) {
          toast?.(`${summary.conflicts} offline sale(s) had a receipt number conflict. Printed numbers preserved.`, 'warning');
        } else if (summary.failed > 0) {
          toast?.(`${summary.failed} offline sale(s) were refused by the server and need your attention.`, 'error');
        }
        if (summary.blocked === 'auth') toast?.('Sign in again to sync your offline sales.', 'warning');
      }
    } catch (err) {
      console.warn('Offline sales sync failed:', err);
    } finally {
      if (mounted.current) setIsSyncing(false);
      await refresh();
    }
  }, [cashierId, refresh]);

  const pendingQueue = useMemo(() => entries.filter((e) => e.status === 'pending'), [entries]);
  const conflictQueue = useMemo(() => entries.filter((e) => e.status === 'conflict'), [entries]);
  const failedQueue = useMemo(() => entries.filter((e) => e.status === 'failed'), [entries]);
  const pendingCount = pendingQueue.length;
  const conflictCount = conflictQueue.length;

  // Auto-flush: on the 'online' event, on mount, and periodically while something is waiting.
  useEffect(() => {
    const handleOnline = () => flushPendingSales();
    window.addEventListener('online', handleOnline);
    if (typeof navigator === 'undefined' || navigator.onLine) flushPendingSales();

    let timer = null;
    if (pendingCount > 0) timer = setInterval(handleOnline, RETRY_INTERVAL_MS);

    return () => {
      window.removeEventListener('online', handleOnline);
      if (timer) clearInterval(timer);
    };
  }, [flushPendingSales, pendingCount > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const retryFailedSale = useCallback(
    async (id) => {
      const entry = entries.find((e) => e.id === id);
      if (!entry) return;
      await requeueEntry(entry);
      await flushPendingSales();
    },
    [entries, flushPendingSales]
  );

  const discardFailedSale = useCallback(
    async (id) => {
      const entry = entries.find((e) => e.id === id);
      if (entry) await removeEntry(entry);
    },
    [entries]
  );

  return {
    pendingQueue,
    conflictQueue,
    failedQueue,
    pendingCount,
    conflictCount,
    failedCount: failedQueue.length,
    isSyncing,
    queueSale,
    flushPendingSales,
    retryFailedSale,
    discardFailedSale,
    generateUUID,
  };
}

export default usePendingSales;
