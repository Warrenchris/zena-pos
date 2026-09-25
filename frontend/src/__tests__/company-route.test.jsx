/* eslint-env jest */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import authReducer from '../store/slices/authSlice';
import shopReducer from '../store/slices/shopSlice';
import billingReducer from '../store/slices/billingSlice';
import { routes } from '../router.config';
import { shopAPI, settingsAPI } from '../services/api';

jest.mock('../services/api', () => ({
  shopAPI: {
    getMine: jest.fn(),
    updateMine: jest.fn(),
  },
  settingsAPI: {
    updateTheme: jest.fn(),
    updateRegional: jest.fn(),
  },
  authAPI: {
    getProfile: jest.fn(),
  },
}));

function renderRoute(path = '/admin/company') {
  const store = configureStore({
    reducer: combineReducers({
      auth: authReducer,
      shop: shopReducer,
      billing: billingReducer,
    }),
    preloadedState: {
      auth: {
        token: 'mock-token',
        user: { id: 1, role: 'admin', orgRole: 'owner', name: 'Admin User', shop: { id: 1, name: 'Main Shop' } },
        shop: { id: 1, name: 'Main Shop' },
        loading: false,
        error: null,
      },
      shop: {
        shop: { id: 1, name: 'Main Shop' },
        accessibleShops: [{ id: 1, name: 'Main Shop', isCurrent: true }],
        loading: false,
      },
      billing: {
        subscription: { status: 'active', plan: { features: { multi_shop: true } } },
        quotas: {},
        loading: { subscription: false },
      },
    },
  });

  const memoryRouter = createMemoryRouter(routes, {
    initialEntries: [path],
  });

  return render(
    <Provider store={store}>
      <RouterProvider router={memoryRouter} />
    </Provider>
  );
}

describe('Company Settings Route (/admin/company)', () => {
  beforeEach(() => {
    shopAPI.getMine.mockReset();
    shopAPI.getMine.mockResolvedValue({
      data: {
        id: 1,
        name: 'Acme Supermarket',
        address: '123 Market St',
        phone: '+254700000000',
        kraPin: 'P051234567Z',
        registrationNumber: 'REG-12345',
      },
    });
  });

  it('renders CompanySettings inside Layout without falling through to RouteError (404)', async () => {
    renderRoute('/admin/company');

    // Should NOT show 404
    expect(screen.queryByText(/Page Not Found/i)).toBeNull();

    // Should find Company Details tab and form inputs once loaded
    expect(await screen.findByText('Company Details')).toBeInTheDocument();
    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.getByText('Regional')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();

    // Verify company form data is loaded
    await waitFor(() => {
      expect(screen.getByDisplayValue('Acme Supermarket')).toBeInTheDocument();
      expect(screen.getByDisplayValue('123 Market St')).toBeInTheDocument();
      expect(screen.getByDisplayValue('+254700000000')).toBeInTheDocument();
    });
  });
});
