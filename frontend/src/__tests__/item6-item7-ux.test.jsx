import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import shopReducer from '../store/slices/shopSlice';
import authReducer from '../store/slices/authSlice';
import billingReducer from '../store/slices/billingSlice';
import settingsReducer from '../store/slices/settingsSlice';
import BranchSwitcher from '../components/navigation/BranchSwitcher';
import Employees from '../pages/Employees';
import { ToastProvider } from '../components/Toast';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../services/api', () => ({
  employeesAPI: {
    getAll: jest.fn().mockResolvedValue({ data: [] }),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  usersAPI: {
    getAll: jest.fn().mockResolvedValue({ data: [] }),
  },
  reportsAPI: {
    getSales: jest.fn().mockResolvedValue({ data: [] }),
  },
  activityAPI: {
    getAll: jest.fn().mockResolvedValue({ data: [] }),
  },
}));

function createTestStore(preloadedState = {}) {
  const rootReducer = combineReducers({
    auth: authReducer,
    shop: shopReducer,
    billing: billingReducer,
    settings: settingsReducer,
  });
  return configureStore({
    reducer: rootReducer,
    preloadedState,
  });
}

describe('ITEM 6 & ITEM 7: Frontend Quota UX and BranchSwitcher Toast Verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ITEM 6: Employees Quota UX', () => {
    test('at maxUsers limit, "Add Employee" shows locked upgrade state and navigates to /billing', async () => {
      const store = createTestStore({
        auth: {
          user: { id: 1, role: 'admin', orgRole: 'owner', shop: { id: 1, name: 'Store 1' } },
        },
        billing: {
          quotas: {
            users: { current: 5, limit: 5, allowed: false, isUnlimited: false, remaining: 0 },
          },
          subscription: {
            status: 'active',
            plan: { maxUsers: 5, name: 'Starter' },
          },
          loading: { subscription: false },
        },
        shop: {
          shop: { id: 1, name: 'Store 1' },
        },
      });

      render(
        <Provider store={store}>
          <MemoryRouter>
            <ToastProvider>
              <Employees />
            </ToastProvider>
          </MemoryRouter>
        </Provider>
      );

      // Verify "Add Employee" button is visible
      const addBtn = await screen.findByRole('button', { name: /Add Employee/i });
      expect(addBtn).toBeInTheDocument();

      // Verify the proactive "Upgrade" badge is rendered inside the affordance
      expect(screen.getByText('Upgrade')).toBeInTheDocument();

      // Click "Add Employee" affordance
      fireEvent.click(addBtn);

      // Verify it navigates to /billing instead of opening modal
      expect(mockNavigate).toHaveBeenCalledWith('/billing');
      expect(screen.queryByText('Register New Employee')).not.toBeInTheDocument();
    });
  });

  describe('ITEM 7: BranchSwitcher Error Surfacing via Toast', () => {
    test('surfaces state.shop.error via toast and dispatches clearShopError', async () => {
      const store = createTestStore({
        auth: {
          user: { id: 1, role: 'admin', orgRole: 'admin', shop: { id: 1, name: 'Main Branch' } },
        },
        billing: {
          subscription: { status: 'active', plan: { features: { multi_shop: true } } },
        },
        shop: {
          shop: { id: 1, name: 'Main Branch' },
          accessibleShops: [
            { id: 1, name: 'Main Branch' },
            { id: 2, name: 'Branch 2' },
          ],
          error: null,
        },
      });

      render(
        <Provider store={store}>
          <MemoryRouter>
            <ToastProvider>
              <BranchSwitcher variant="topbar" />
            </ToastProvider>
          </MemoryRouter>
        </Provider>
      );

      // Dispatch switchActiveShop.rejected or fetchAccessibleShops.rejected error
      act(() => {
        store.dispatch({
          type: 'auth/switchActiveShop/rejected',
          payload: 'Access denied to target branch.',
        });
      });

      // Verify toast with error message is displayed
      expect(await screen.findByText('Access denied to target branch.')).toBeInTheDocument();

      // Verify error in Redux store was cleared so it does not persist stale across re-renders
      expect(store.getState().shop.error).toBeNull();
    });
  });
});
