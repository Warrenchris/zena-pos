import React, { act } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import authReducer from '../../store/slices/authSlice';
import shopReducer from '../../store/slices/shopSlice';
import InactiveShopModal from '../InactiveShopModal';
import api, { authAPI } from '../../services/api';

jest.mock('../../services/api', () => {
  const original = jest.requireActual('../../services/api');
  return {
    __esModule: true,
    ...original,
    default: {
      ...original.default,
      get: jest.fn(),
      post: jest.fn(),
    },
    authAPI: {
      switchShop: jest.fn(),
      logout: jest.fn(),
    },
  };
});

function createStore(initialState = {}) {
  const rootReducer = combineReducers({
    auth: authReducer,
    shop: shopReducer,
  });
  return configureStore({
    reducer: rootReducer,
    preloadedState: {
      auth: {
        user: { id: 10, name: 'Cashier One', shop: { id: 1, name: 'Branch Alpha' } },
        token: 'fake-token',
        ...initialState.auth,
      },
      shop: {
        shop: { id: 1, name: 'Branch Alpha' },
        accessibleShops: [],
        ...initialState.shop,
      },
    },
  });
}

describe('InactiveShopModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens upon receiving the window "shop-inactive" event and fetches /api/shop/accessible', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        shops: [
          { id: 2, name: 'Branch Beta', active: true },
          { id: 3, name: 'Branch Gamma', active: true },
        ],
      },
    });

    const store = createStore();
    render(
      <Provider store={store}>
        <InactiveShopModal />
      </Provider>
    );

    // Modal is initially not rendered
    expect(screen.queryByText(/Branch Deactivated/i)).toBeNull();

    // Trigger the window event
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('shop-inactive', {
          detail: { code: 'SHOP_INACTIVE', message: 'Shop is inactive' },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Branch Deactivated/i)).toBeInTheDocument();
    });

    expect(api.get).toHaveBeenCalledWith('/api/shop/accessible');
    // Ensure no raw 403 or raw JSON error text is displayed
    expect(screen.queryByText(/403/i)).toBeNull();
    expect(screen.queryByText(/SHOP_INACTIVE/i)).toBeNull();
  });

  it('offers the branch switcher when other accessible active shops exist and allows switching', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        shops: [
          { id: 2, name: 'Branch Beta', active: true },
          { id: 3, name: 'Branch Gamma', active: true },
        ],
      },
    });
    authAPI.switchShop.mockResolvedValueOnce({
      data: {
        token: 'new-token',
        user: { id: 10, name: 'Cashier One', shop: { id: 2, name: 'Branch Beta' } },
        shop: { id: 2, name: 'Branch Beta' },
      },
    });

    const store = createStore();
    render(
      <Provider store={store}>
        <InactiveShopModal isOpen={true} />
      </Provider>
    );

    // Wait for shops to load
    await waitFor(() => {
      expect(screen.getByLabelText(/Switch to branch/i)).toBeInTheDocument();
    });

    // Check options
    expect(screen.getByRole('option', { name: 'Branch Beta' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Branch Gamma' })).toBeInTheDocument();

    // Select Branch Gamma
    fireEvent.change(screen.getByLabelText(/Switch to branch/i), { target: { value: '3' } });

    // Click Switch Branch
    const switchButton = screen.getByRole('button', { name: /Switch Branch/i });
    expect(switchButton).toBeInTheDocument();
    fireEvent.click(switchButton);

    await waitFor(() => {
      expect(authAPI.switchShop).toHaveBeenCalledWith('3');
    });
  });

  it('offers sign out and no branch selector when no other accessible branches exist', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        shops: [
          // Current shop is id: 1, so no other shops
          { id: 1, name: 'Branch Alpha', active: false },
        ],
      },
    });

    const store = createStore();
    render(
      <Provider store={store}>
        <InactiveShopModal isOpen={true} />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Sign Out/i })).toBeInTheDocument();
    });

    expect(screen.getByText(/No other active branches are available/i)).toBeInTheDocument();
    // No branch dropdown or Switch button
    expect(screen.queryByLabelText(/Switch to branch/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Switch Branch/i })).toBeNull();
  });

  it('does not get stuck in infinite loading if fetching accessible branches fails', async () => {
    api.get.mockRejectedValueOnce(new Error('Network failure'));

    const store = createStore();
    render(
      <Provider store={store}>
        <InactiveShopModal isOpen={true} />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.queryByText(/Checking available branches/i)).toBeNull();
    });

    // Falls back gracefully to sign out
    expect(screen.getByRole('button', { name: /Sign Out/i })).toBeInTheDocument();
  });
});
