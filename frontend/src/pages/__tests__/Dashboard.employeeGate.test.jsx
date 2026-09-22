import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import authReducer from '../../store/slices/authSlice';
import salesReducer from '../../store/slices/salesSlice';
import customersReducer from '../../store/slices/customersSlice';
import productsReducer from '../../store/slices/productsSlice';
import billingReducer from '../../store/slices/billingSlice';
import settingsReducer from '../../store/slices/settingsSlice';
import { employeesAPI } from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: {} }) },
  employeesAPI: { getAll: jest.fn().mockResolvedValue({ data: [] }) },
  salesAPI: {
    getAll: jest.fn().mockResolvedValue({ data: [] }),
    getStatistics: jest.fn().mockResolvedValue({ data: {} }),
  },
  customersAPI: { getAll: jest.fn().mockResolvedValue({ data: [] }) },
  productsAPI: { getAll: jest.fn().mockResolvedValue({ data: [] }) },
}));

jest.mock('../../services/forecasting.service', () => ({
  __esModule: true,
  default: { getForecast: jest.fn().mockResolvedValue({ predictions: [] }) },
}));

jest.mock('../../services/billing.service', () => ({
  __esModule: true,
  default: {
    getSubscription: jest.fn().mockResolvedValue({ subscription: null, quotas: null }),
  },
}));

jest.mock('../../utils/notifications', () => ({ notifyLowStock: jest.fn() }));
jest.mock('../../components/financial/BusinessInsights', () => () => null);
jest.mock('../../components/dashboard/StatsGrid', () => () => null);
jest.mock('../../components/dashboard/GettingStartedChecklist', () => () => null);
jest.mock('../../components/DateRangePicker', () => () => null);
jest.mock('../../components/SaleDetailModal', () => () => null);
jest.mock('../CashierDashboard', () => () => <div>cashier-dashboard</div>);

import Dashboard from '../Dashboard';

function renderDashboard(user) {
  const store = configureStore({
    reducer: combineReducers({
      auth: authReducer,
      sales: salesReducer,
      customers: customersReducer,
      products: productsReducer,
      billing: billingReducer,
      settings: settingsReducer,
    }),
    preloadedState: {
      auth: { user, loading: false, token: 'test-token' },
    },
  });
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </Provider>
  );
}

describe('Dashboard employee-list gating', () => {
  beforeEach(() => {
    employeesAPI.getAll.mockClear();
    localStorage.setItem('token', 'test-token');
  });

  test('loads employees for org owner even when shop-level role is not admin', async () => {
    renderDashboard({
      id: 9,
      name: 'Owner',
      role: 'manager',
      orgRole: 'owner',
      shopId: 1,
      shop: { id: 1, name: 'HQ' },
    });
    await waitFor(() => {
      expect(employeesAPI.getAll).toHaveBeenCalled();
    });
  });

  test('does not load employees for a shop cashier with member orgRole', async () => {
    renderDashboard({
      id: 8,
      name: 'Cash',
      role: 'cashier',
      orgRole: 'member',
      shopId: 1,
      shop: { id: 1, name: 'HQ' },
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(employeesAPI.getAll).not.toHaveBeenCalled();
  });
});
