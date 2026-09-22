import { listQueue, removeEntry, saveEntry } from './salesQueue';

/**
 * Sends queued sales to the server.
 *
 * What happens to a sale that the server answers with an error decides whether money is lost, so:
 *   - no response (offline)            -> stop; keep every sale; not counted as an attempt
 *   - 401 (session expired)            -> stop; keep; the cashier must sign in again
 *   - 402 / 403 (e.g. subscription)    -> stop; keep; records the reason
 *   - 408 / 425 / 429 (busy)           -> stop; keep; try again later
 *   - 5xx (server trouble)             -> keep and try again; after MAX_SERVER_ERROR_ATTEMPTS mark 'failed'
 *   - any other 4xx (400, 404, 409...) -> the server refused this sale: mark 'failed' and KEEP it for review
 * A sale is only ever removed after the server accepted it (or the person discards it).
 */

export const MAX_SERVER_ERROR_ATTEMPTS = 10;

export function classifyError(error) {
  const status = error?.response?.status;
  if (!status) return { kind: 'offline', status: null, message: 'No connection' };
  const data = error.response.data;
  const message = data?.message || data?.error || `The server answered ${status}`;
  if (status === 401) return { kind: 'auth', status, message };
  if (status === 402 || status === 403) return { kind: 'blocked', status, message };
  if (status === 408 || status === 425 || status === 429) return { kind: 'busy', status, message };
  if (status >= 500) return { kind: 'server', status, message };
  return { kind: 'rejected', status, message };
}

let inFlight = null;

// Whichever component is currently responsible for the queue (the cashier dashboard registers itself).
let owners = 0;
export function registerQueueOwner() {
  owners += 1;
  return () => {
    owners = Math.max(0, owners - 1);
  };
}
export const hasQueueOwner = () => owners > 0;

async function doFlush({ cashierId, api }) {
  const summary = { synced: 0, failed: 0, remaining: 0, blocked: null, offline: false, syncedResponses: [], joined: false };
  const pending = (await listQueue(cashierId)).filter((entry) => entry.status === 'pending');

  for (const entry of pending) {
    try {
      const response = await api.post('/api/sales', entry.saleData);
      await removeEntry(entry);
      summary.synced += 1;
      summary.syncedResponses.push(response.data);
    } catch (error) {
      const outcome = classifyError(error);
      const now = Date.now();

      if (outcome.kind === 'offline') {
        summary.offline = true;
        break;
      }

      const attempt = { ...entry, lastAttemptAt: now, lastError: outcome.message };

      if (outcome.kind === 'auth' || outcome.kind === 'blocked' || outcome.kind === 'busy') {
        await saveEntry({ ...attempt, attempts: entry.attempts + 1 });
        summary.blocked = outcome.kind;
        break;
      }

      if (outcome.kind === 'server') {
        const attempts = entry.attempts + 1;
        const giveUp = attempts >= MAX_SERVER_ERROR_ATTEMPTS;
        await saveEntry({ ...attempt, attempts, status: giveUp ? 'failed' : 'pending' });
        if (giveUp) summary.failed += 1;
        continue; // one bad sale must not hold up the rest of the queue
      }

      await saveEntry({ ...attempt, attempts: entry.attempts + 1, status: 'failed' });
      summary.failed += 1;
    }
  }

  summary.remaining = (await listQueue(cashierId)).filter((entry) => entry.status === 'pending').length;
  return summary;
}

/**
 * Send all pending sales for a cashier. Only one flush runs at a time; a caller that arrives
 * while one is running gets the same summary with `joined: true` (so it should not announce the
 * results a second time).
 */
export function flushSales({ cashierId, api }) {
  if (inFlight) return inFlight.then((summary) => ({ ...summary, joined: true }));
  inFlight = doFlush({ cashierId, api }).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Put a failed sale back in the queue so it is sent again. */
export async function requeueEntry(entry) {
  await saveEntry({ ...entry, status: 'pending', attempts: 0, lastError: null });
}
