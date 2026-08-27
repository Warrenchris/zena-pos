import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

/**
 * Generates a standard v4 UUID for sale idempotency
 */
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * usePendingSales
 * Offline resilience queue for CASH sales.
 * Persists pending sales to localStorage with an idempotency key and auto-flushes on reconnect.
 */
export function usePendingSales(cashierId, { onSaleSynced, showToast } = {}) {
  const [pendingQueue, setPendingQueue] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);
  const storageKey = `zena_pending_sales_${cashierId || 'anonymous'}`;

  // 1. Load pending sales from storage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setPendingQueue(parsed);
        }
      }
    } catch (err) {
      console.warn('Failed to load pending offline sales:', err);
    }
  }, [storageKey]);

  // 2. Queue a sale locally
  const queueSale = useCallback((salePayload) => {
    const idempotencyKey = salePayload.idempotencyKey || generateUUID();
    const queuedEntry = {
      id: idempotencyKey,
      idempotencyKey,
      saleData: {
        ...salePayload,
        idempotencyKey
      },
      queuedAt: Date.now()
    };

    setPendingQueue((prevQueue) => {
      const newQueue = [...prevQueue, queuedEntry];
      try {
        localStorage.setItem(storageKey, JSON.stringify(newQueue));
      } catch (err) {
        console.error('Failed to persist offline sale to localStorage:', err);
      }
      return newQueue;
    });

    return queuedEntry;
  }, [storageKey]);

  // 3. Flush the offline queue
  const flushPendingSales = useCallback(async () => {
    if (isSyncingRef.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    let queueToProcess = [];
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        queueToProcess = JSON.parse(stored) || [];
      }
    } catch {
      queueToProcess = [];
    }

    if (queueToProcess.length === 0) return;

    isSyncingRef.current = true;
    setIsSyncing(true);

    let syncedCount = 0;
    const remainingQueue = [];

    for (const entry of queueToProcess) {
      try {
        const response = await api.post('/api/sales', entry.saleData);
        syncedCount += 1;
        onSaleSynced?.(response.data);
      } catch (error) {
        // If it's a conflict / already submitted, treat as success and drop from queue
        if (error.response?.status === 409) {
          syncedCount += 1;
        } else if (error.response?.status >= 400 && error.response?.status < 500) {
          // Unrecoverable validation error: log and drop or mark failed
          console.error('Dropping malformed offline sale:', error.response?.data);
        } else {
          // Network / 500 error: retain for next retry
          remainingQueue.push(entry);
        }
      }
    }

    try {
      if (remainingQueue.length > 0) {
        localStorage.setItem(storageKey, JSON.stringify(remainingQueue));
      } else {
        localStorage.removeItem(storageKey);
      }
      setPendingQueue(remainingQueue);
    } catch (err) {
      console.warn('Failed to update offline sales queue storage:', err);
    }

    if (syncedCount > 0) {
      showToast?.(`Synced ${syncedCount} offline sale(s) with the server`, 'success');
    }

    isSyncingRef.current = false;
    setIsSyncing(false);
  }, [storageKey, onSaleSynced, showToast]);

  // 4. Auto-flush on window 'online' event and on mount if online
  useEffect(() => {
    const handleOnline = () => {
      flushPendingSales();
    };

    window.addEventListener('online', handleOnline);

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      flushPendingSales();
    }

    return () => window.removeEventListener('online', handleOnline);
  }, [flushPendingSales]);

  return {
    pendingQueue,
    pendingCount: pendingQueue.length,
    isSyncing,
    queueSale,
    flushPendingSales,
    generateUUID
  };
}

export default usePendingSales;
