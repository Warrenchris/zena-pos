/* eslint-env jest */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import authReducer, { logout } from '../../store/slices/authSlice';
import settingsReducer from '../../store/slices/settingsSlice';
import { freshDatabase } from '../../offline/testing/testDb';
import { createEntry, saveEntry } from '../../offline/salesQueue';
import { registerQueueOwner } from '../../offline/salesSync';
import { loadCatalog, saveCatalog, syncCatalog } from '../../offline/catalog';
import api from '../../services/api';
import OfflineSupport from '../OfflineSupport';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn(), interceptors: { response: { use: jest.fn(() => 42), eject: jest.fn() } } },
}));
jest.mock('../../offline/catalog', () => ({ ...jest.requireActual('../../offline/catalog'), syncCatalog: jest.fn(async () => ({ status: 'skipped' })) }));

const setOnline = (value) => Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });

const makeStore = ({ signedIn = true } = {}) =>
  configureStore({
    reducer: combineReducers({ auth: authReducer, settings: settingsReducer }),
    preloadedState: {
      auth: {
        user: signedIn ? { id: 7, shopId: 3 } : null,
        shop: signedIn ? { id: 3 } : null,
        token: signedIn ? 'token-abc' : null,
        loading: false,
        error: null,
      },
    },
  });

const renderSupport = (store = makeStore()) => ({ store, ...render(<Provider store={store}><OfflineSupport /></Provider>) });

const sale = { items: [{ productId: 1, quantity: 1, price: 100 }], total: 100, paymentMethod: 'cash' };

beforeEach(async () => {
  await freshDatabase();
  setOnline(true);
  api.post.mockReset();
  api.interceptors.response.use.mockClear();
  api.interceptors.response.eject.mockClear();
  syncCatalog.mockClear();
  window.showToast = jest.fn();
});
afterEach(() => {
  delete window.showToast;
  jest.useRealTimers();
});

describe('OfflineSupport', () => {
  it('installs the offline product fallback on the API client and removes it on unmount', () => {
    const { unmount } = renderSupport();
    expect(api.interceptors.response.use).toHaveBeenCalledTimes(1);
    unmount();
    expect(api.interceptors.response.eject).toHaveBeenCalledWith(42);
  });

  it('shows the offline notice while offline', () => {
    setOnline(false);
    renderSupport();
    expect(screen.getByRole('status')).toHaveTextContent("You're offline");
  });

  describe('product copy', () => {
    it('is refreshed in the background for the signed-in shop, shortly after the app opens', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'Date'] });
      renderSupport();

      expect(syncCatalog).not.toHaveBeenCalled(); // not while the screen is still loading
      act(() => jest.advanceTimersByTime(5000));

      expect(syncCatalog).toHaveBeenCalledTimes(1);
      expect(syncCatalog.mock.calls[0][0]).toMatchObject({ api, shopKey: '3' });
    });

    it('is not downloaded while offline or when nobody is signed in', () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'Date'] });
      setOnline(false);
      renderSupport();
      act(() => jest.advanceTimersByTime(10000));
      expect(syncCatalog).not.toHaveBeenCalled();
    });

    it('is wiped when the user signs out', async () => {
      await saveCatalog('3', [{ id: 1, name: 'Sugar' }]);
      const { store } = renderSupport();
      expect(await loadCatalog('3')).not.toBeNull();

      act(() => {
        store.dispatch(logout());
      });

      await waitFor(async () => expect(await loadCatalog('3')).toBeNull());
    });

    it('is kept when the app simply opens with nobody signed in', async () => {
      await saveCatalog('3', [{ id: 1, name: 'Sugar' }]);
      renderSupport(makeStore({ signedIn: false }));
      await new Promise((r) => setTimeout(r, 50));
      expect(await loadCatalog('3')).not.toBeNull();
    });
  });

  describe('offline sales in the background', () => {
    it('sends waiting sales when the cashier dashboard is not open, and says so', async () => {
      api.post.mockResolvedValue({ data: { id: 's1' } });
      await saveEntry(createEntry(sale, 7));

      renderSupport();

      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
      expect(api.post.mock.calls[0][0]).toBe('/api/sales');
      await waitFor(() =>
        expect(window.showToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success', title: 'Offline sales synced' }))
      );
    });

    it('leaves it to the dashboard while the dashboard is handling the queue', async () => {
      api.post.mockResolvedValue({ data: {} });
      await saveEntry(createEntry(sale, 7));
      const release = registerQueueOwner();

      renderSupport();
      await new Promise((r) => setTimeout(r, 100));

      expect(api.post).not.toHaveBeenCalled();
      release();
    });

    it('does not try while offline', async () => {
      setOnline(false);
      await saveEntry(createEntry(sale, 7));
      renderSupport();
      await new Promise((r) => setTimeout(r, 100));
      expect(api.post).not.toHaveBeenCalled();
    });

    it('does nothing when nobody is signed in', async () => {
      await saveEntry(createEntry(sale, 7));
      renderSupport(makeStore({ signedIn: false }));
      await new Promise((r) => setTimeout(r, 100));
      expect(api.post).not.toHaveBeenCalled();
    });
  });
});
