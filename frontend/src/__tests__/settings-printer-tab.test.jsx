import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import authReducer from '../store/slices/authSlice';
import shopReducer from '../store/slices/shopSlice';
import settingsReducer from '../store/slices/settingsSlice';
import Settings from '../pages/Settings';

jest.mock('../services/api', () => ({
  settingsAPI: {
    getAll: jest.fn().mockResolvedValue({ data: {} }),
    update: jest.fn(),
    reset: jest.fn(),
    getCurrency: jest.fn().mockResolvedValue({ data: {} }),
  },
  authAPI: {},
  shopAPI: {},
}));

function renderSettings() {
  const store = configureStore({
    reducer: combineReducers({ auth: authReducer, shop: shopReducer, settings: settingsReducer }),
  });
  return render(
    <Provider store={store}>
      <Settings />
    </Provider>
  );
}

describe('Settings > Receipt & Printer tab', () => {
  beforeEach(() => window.localStorage.clear());

  it('shows the per-device printer settings and no longer offers the unused shop-wide printer fields', async () => {
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: /Receipt & Printer/ }));

    expect(await screen.findByText('Printer on this device')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /print test receipt/i })).toBeInTheDocument();

    // Shop-wide receipt text settings are still there...
    expect(screen.getByPlaceholderText(/Welcome to Zana POS/)).toBeInTheDocument();
    // ...but the old server-side printer type / IP fields (never wired to anything) are gone.
    expect(screen.queryByText('Printer Type')).toBeNull();
    expect(screen.queryByText(/Printer IP Address/)).toBeNull();
  });

  it('does not mark the shop-wide settings form as changed when device printer settings change', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: /Receipt & Printer/ }));
    await screen.findByText('Printer on this device');

    fireEvent.click(screen.getByRole('radio', { name: /^80 mm/ }));

    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem('zana.printerProfile.v1')).paperWidth).toBe(80)
    );
  });
});
