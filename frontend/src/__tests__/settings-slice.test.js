import { configureStore } from '@reduxjs/toolkit';
import settingsReducer, { fetchSettings, updateSettings, resetSettings } from '../store/slices/settingsSlice';
import { settingsAPI } from '../services/api';

jest.mock('../services/api', () => ({
  settingsAPI: { getAll: jest.fn(), update: jest.fn(), reset: jest.fn() },
}));

const makeStore = () => configureStore({ reducer: { settings: settingsReducer } });

// What the backend really sends: settings wrapped as { success, data }.
const envelope = (data) => ({ data: { success: true, data } });

describe('settings slice with the API envelope', () => {
  it('flattens fetched settings into state so components can read them', async () => {
    settingsAPI.getAll.mockResolvedValue(
      envelope({ receiptHeader: 'Welcome!', receiptFooter: 'Bye', showLogoOnReceipt: false, businessLogo: '/uploads/logos/a.png' })
    );
    const store = makeStore();
    await store.dispatch(fetchSettings());

    expect(store.getState().settings).toMatchObject({
      receiptHeader: 'Welcome!',
      receiptFooter: 'Bye',
      showLogoOnReceipt: false,
      businessLogo: '/uploads/logos/a.png',
    });
  });

  it('flattens the response to a save, too', async () => {
    settingsAPI.update.mockResolvedValue(envelope({ receiptFooter: 'Saved footer' }));
    const store = makeStore();
    await store.dispatch(updateSettings({ receiptFooter: 'Saved footer' }));
    expect(store.getState().settings.receiptFooter).toBe('Saved footer');
  });

  it('flattens the response to a reset', async () => {
    settingsAPI.reset.mockResolvedValue(envelope({ receiptHeader: null, showLogoOnReceipt: true }));
    const store = makeStore();
    await store.dispatch(resetSettings());
    expect(store.getState().settings.showLogoOnReceipt).toBe(true);
    expect(store.getState().settings.receiptHeader).toBeNull();
  });

  it('still accepts an already-flat payload', async () => {
    settingsAPI.getAll.mockResolvedValue({ data: { receiptFooter: 'Flat' } });
    const store = makeStore();
    await store.dispatch(fetchSettings());
    expect(store.getState().settings.receiptFooter).toBe('Flat');
  });

  it('sends the receipt header, footer and logo switch when saving', async () => {
    settingsAPI.update.mockResolvedValue(envelope({}));
    const store = makeStore();
    await store.dispatch(
      updateSettings({ receiptHeader: 'H', receiptFooter: 'F', showLogoOnReceipt: false, systemName: 'Mama', notASetting: 1 })
    );
    expect(settingsAPI.update).toHaveBeenLastCalledWith({
      receiptHeader: 'H',
      receiptFooter: 'F',
      showLogoOnReceipt: false,
      systemName: 'Mama',
    });
  });
});
