/* eslint-env jest */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import authReducer from '../store/slices/authSlice';
import shopReducer from '../store/slices/shopSlice';
import billingReducer from '../store/slices/billingSlice';
import notificationsReducer from '../store/slices/notificationsSlice';
import CompanySettings from '../pages/CompanySettings';
import Layout from '../components/Layout';
import PrivateRoute from '../components/PrivateRoute';
import { shopAPI } from '../services/api';

jest.mock('../components/DashboardRouter', () => () => null);
jest.mock('../pages/Dashboard', () => () => null);
jest.mock('../pages/CashierDashboard', () => () => null);
jest.mock('../components/DateRangePicker', () => () => null);

// Lazy components imported by router.config.jsx are mocked/stubs in Jest
import { routes } from '../router.config';

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

function makeStore() {
  return configureStore({
    reducer: combineReducers({
      auth: authReducer,
      shop: shopReducer,
      billing: billingReducer,
      notifications: notificationsReducer,
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
      notifications: {
        notifications: [],
        unreadCount: 0,
        loading: false,
      },
    },
  });
}

describe('Company Settings Route and Component', () => {
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

  it('registers admin/company in router.config.jsx under the Layout route', () => {
    // Traverse the routes structure from router.config.jsx
    const rootRoute = routes.find((r) => r.path === '/');
    expect(rootRoute).toBeDefined();

    const layoutRoute = rootRoute.children.find((child) => child.element?.type === Layout);
    expect(layoutRoute).toBeDefined();

    const companyRoute = layoutRoute.children.find((child) => child.path === 'admin/company');
    expect(companyRoute).toBeDefined();
    expect(companyRoute.element.type).toBe(PrivateRoute);
  });

  it('renders CompanySettings correctly inside authenticated Layout at /admin/company without redirecting', async () => {
    const store = makeStore();

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/admin/company']}>
          <Routes>
            <Route element={<Layout />}>
              <Route
                path="admin/company"
                element={
                  <PrivateRoute>
                    <CompanySettings />
                  </PrivateRoute>
                }
              />
              <Route path="dashboard" element={<div>Dashboard fallback</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </Provider>
    );

    // Verify CompanySettings loads and renders tabs
    expect(await screen.findByText('Company Details')).toBeInTheDocument();
    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.getByText('Regional')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();

    // Verify company form data is loaded from shopAPI.getMine()
    await waitFor(() => {
      expect(screen.getByDisplayValue('Acme Supermarket')).toBeInTheDocument();
      expect(screen.getByDisplayValue('123 Market St')).toBeInTheDocument();
      expect(screen.getByDisplayValue('+254700000000')).toBeInTheDocument();
    });

    // Ensure it did not get redirected away to /dashboard
    expect(screen.queryByText('Dashboard fallback')).toBeNull();
  });
});
