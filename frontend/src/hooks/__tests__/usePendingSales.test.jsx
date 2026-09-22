/* eslint-env jest */
import { renderHook, act, waitFor } from '@testing-library/react';
import { freshDatabase } from '../../offline/testing/testDb';
import { createEntry, legacyStorageKey, listQueue, saveEntry } from '../../offline/salesQueue';
import { hasQueueOwner } from '../../offline/salesSync';
import api from '../../services/api';
import { usePendingSales } from '../usePendingSales';

jest.mock('../../services/api', () => ({ __esModule: true, default: { post: jest.fn() } }));

const sale = (n = 1, extra = {}) => ({ items: [{ productId: n, quantity: 1, price: 100 }], total: 100, paymentMethod: 'cash', ...extra });
const httpError = (status, data = {}) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } });
const networkError = () => Object.assign(new Error('Network Error'), { isAxiosError: true });

const setOnline = (value) => Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });

const setup = (options = {}, cashierId = 7) => {
  const callbacks = { onSaleSynced: jest.fn(), showToast: jest.fn(), ...options };
  const hook = renderHook(() => usePendingSales(cashierId, callbacks));
  return { ...hook, callbacks };
};

beforeEach(async () => {
  await freshDatabase();
  api.post.mockReset();
  setOnline(true);
});

describe('usePendingSales', () => {
  it('loads the sales already waiting on this device', async () => {
    await saveEntry(createEntry(sale(1), 7));
    await saveEntry(createEntry(sale(2), 7));
    api.post.mockRejectedValue(networkError()); // still offline

    const { result } = setup();

    await waitFor(() => expect(result.current.pendingCount).toBe(2));
    expect(result.current.failedCount).toBe(0);
  });

  it('shows a queued sale at once and stores it durably on the device', async () => {
    api.post.mockRejectedValue(networkError());
    const { result } = setup();

    let entry;
    act(() => {
      entry = result.current.queueSale(sale(1));
    });

    expect(entry.idempotencyKey).toBeTruthy();
    expect(result.current.pendingCount).toBe(1);
    await waitFor(async () => expect((await listQueue(7)).map((e) => e.id)).toEqual([entry.id]));
  });

  it('sends queued sales when online, reports them, and empties the queue', async () => {
    api.post.mockResolvedValue({ data: { id: 'sale-9' } });
    await saveEntry(createEntry(sale(1), 7));

    const { result, callbacks } = setup();

    await waitFor(() => expect(callbacks.onSaleSynced).toHaveBeenCalledWith({ id: 'sale-9' }));
    expect(callbacks.showToast).toHaveBeenCalledWith('Synced 1 offline sale(s) with the server', 'success');
    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(await listQueue(7)).toEqual([]);
  });

  it('does not try to send while the browser is offline, and sends when it comes back', async () => {
    setOnline(false);
    api.post.mockResolvedValue({ data: {} });
    await saveEntry(createEntry(sale(1), 7));

    const { result } = setup();
    await waitFor(() => expect(result.current.pendingCount).toBe(1));
    expect(api.post).not.toHaveBeenCalled();

    setOnline(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.pendingCount).toBe(0));
  });

  it('keeps a sale the server refuses, moves it to "failed", and tells the cashier (it is never dropped)', async () => {
    api.post.mockRejectedValue(httpError(400, { error: 'Insufficient stock for Sugar' }));
    await saveEntry(createEntry(sale(1), 7));

    const { result, callbacks } = setup();

    await waitFor(() => expect(result.current.failedCount).toBe(1));
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.failedQueue[0].lastError).toBe('Insufficient stock for Sugar');
    expect(callbacks.showToast).toHaveBeenCalledWith(expect.stringContaining('refused by the server'), 'error');
    expect(await listQueue(7)).toHaveLength(1);
  });

  it('keeps sales and asks for a new sign-in when the session has expired', async () => {
    api.post.mockRejectedValue(httpError(401, { error: 'Token expired' }));
    await saveEntry(createEntry(sale(1), 7));

    const { result, callbacks } = setup();

    await waitFor(() => expect(callbacks.showToast).toHaveBeenCalledWith('Sign in again to sync your offline sales.', 'warning'));
    expect(result.current.pendingCount).toBe(1);
    expect(result.current.failedCount).toBe(0);
  });

  it('retries a failed sale, and it goes through once the problem is fixed', async () => {
    api.post.mockRejectedValueOnce(httpError(400, { error: 'Insufficient stock' })).mockResolvedValue({ data: { id: 'ok' } });
    await saveEntry(createEntry(sale(1), 7));

    const { result } = setup();
    await waitFor(() => expect(result.current.failedCount).toBe(1));

    await act(async () => {
      await result.current.retryFailedSale(result.current.failedQueue[0].id);
    });

    await waitFor(() => expect(result.current.failedCount).toBe(0));
    expect(result.current.pendingCount).toBe(0);
    expect(await listQueue(7)).toEqual([]);
  });

  it('discards a failed sale only when asked', async () => {
    api.post.mockRejectedValue(httpError(400, { error: 'Nope' }));
    await saveEntry(createEntry(sale(1), 7));
    const { result } = setup();
    await waitFor(() => expect(result.current.failedCount).toBe(1));

    await act(async () => {
      await result.current.discardFailedSale(result.current.failedQueue[0].id);
    });

    await waitFor(() => expect(result.current.failedCount).toBe(0));
    expect(await listQueue(7)).toEqual([]);
  });

  it('picks up sales queued by the old localStorage version', async () => {
    api.post.mockRejectedValue(networkError());
    window.localStorage.setItem(
      legacyStorageKey(7),
      JSON.stringify([{ id: 'old-1', idempotencyKey: 'old-1', saleData: { ...sale(), idempotencyKey: 'old-1' }, queuedAt: 1000 }])
    );

    const { result } = setup();

    await waitFor(() => expect(result.current.pendingCount).toBe(1));
    expect(window.localStorage.getItem(legacyStorageKey(7))).toBeNull();
    expect((await listQueue(7)).map((e) => e.id)).toEqual(['old-1']);
  });

  it('tells the app it is looking after the queue while mounted', () => {
    api.post.mockRejectedValue(networkError());
    const { unmount } = setup();
    expect(hasQueueOwner()).toBe(true);
    unmount();
    expect(hasQueueOwner()).toBe(false);
  });

  it('keeps the public API the cashier dashboard relies on', async () => {
    api.post.mockRejectedValue(networkError());
    const { result } = setup();
    expect(Object.keys(result.current)).toEqual(
      expect.arrayContaining(['queueSale', 'pendingCount', 'isSyncing', 'flushPendingSales', 'generateUUID'])
    );
    expect(typeof result.current.generateUUID()).toBe('string');
  });
});
