import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import authReducer from '../../store/slices/authSlice';
import salesReducer from '../../store/slices/salesSlice';
import customersReducer from '../../store/slices/customersSlice';
import productsReducer from '../../store/slices/productsSlice';
import billingReducer from '../../store/slices/billingSlice';
import settingsReducer from '../../store/slices/settingsSlice';
import analyticsReducer from '../../store/slices/analyticsSlice';
import notificationsReducer from '../../store/slices/notificationsSlice';
import { productsAPI, salesAPI } from '../../services/api';
import { notifyLowStock, notifyRestockSummary } from '../../utils/notifications';
import Dashboard, { clearNotifiedStockConditions } from '../Dashboard';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: {} }) },
  employeesAPI: { getAll: jest.fn().mockResolvedValue({ data: [] }) },
  salesAPI: {
    getAll: jest.fn().mockResolvedValue({ data: [{ id: 1, total: 100 }] }),
    getStatistics: jest.fn().mockResolvedValue({ data: { totalSales: 5000 } }),
  },
  customersAPI: { getAll: jest.fn().mockResolvedValue({ data: [] }) },
  productsAPI: { getAll: jest.fn() },
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

jest.mock('../../utils/notifications', () => ({
  notifyLowStock: jest.fn(),
  notifyRestockSummary: jest.fn(),
}));

jest.mock('../../components/financial/BusinessInsights', () => () => null);
jest.mock('../../components/dashboard/StatsGrid', () => () => null);
jest.mock('../../components/dashboard/GettingStartedChecklist', () => ({ products }) => (
  <div data-testid="getting-started-checklist" data-products-count={products?.length ?? 0}>
    getting-started-checklist
  </div>
));
jest.mock('../../components/DateRangePicker', () => () => null);
jest.mock('../../components/SaleDetailModal', () => () => null);
jest.mock('../CashierDashboard', () => () => <div>cashier-dashboard</div>);
jest.mock('../../components/dashboard/RevenueChart', () => () => null);
jest.mock('../../components/dashboard/VisitorGraph', () => () => null);
jest.mock('../../components/dashboard/OrderTracking', () => () => null);
jest.mock('../../components/dashboard/SellingPlatform', () => () => null);
jest.mock('../../components/dashboard/LocationAudience', () => () => null);
jest.mock('../../components/dashboard/TopSellingProducts', () => () => null);

function renderDashboard({
  user = { id: 1, role: 'admin', shopId: 1, organizationId: 'test-org' },
  preloadedProducts = [{ id: 99, name: 'Existing Catalog Product', stockQuantity: 50, reorderPoint: 10 }],
  sales = [{ id: 1, total: 100 }],
  statistics = { totalSales: 5000 },
} = {}) {
  const store = configureStore({
    reducer: combineReducers({
      auth: authReducer,
      sales: salesReducer,
      customers: customersReducer,
      products: productsReducer,
      billing: billingReducer,
      settings: settingsReducer,
      analytics: analyticsReducer,
      notifications: notificationsReducer,
    }),
    preloadedState: {
      auth: { user, loading: false, token: 'test-token' },
      products: { products: preloadedProducts, loading: false, error: null },
      sales: { sales, statistics, loading: false, error: null },
      customers: { customers: [], loading: false, error: null },
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

describe('Dashboard availability=needs_restock integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearNotifiedStockConditions?.();
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('zana_onboarding_dismissed_test-org', 'true');
    salesAPI.getAll.mockResolvedValue({ data: [{ id: 1, total: 100 }] });
    salesAPI.getStatistics.mockResolvedValue({ data: { totalSales: 5000 } });
  });

  test('(a) response total 12 with 5 items: card shows exactly 5 rows and "View all 12"', async () => {
    const fiveItems = [
      { id: 1, name: 'Product One', stockQuantity: 0, reorderPoint: 10, active: true },
      { id: 2, name: 'Product Two', stockQuantity: 1, reorderPoint: 10, active: true },
      { id: 3, name: 'Product Three', stockQuantity: 2, reorderPoint: 10, active: true },
      { id: 4, name: 'Product Four', stockQuantity: 3, reorderPoint: 10, active: true },
      { id: 5, name: 'Product Five', stockQuantity: 4, reorderPoint: 10, active: true },
    ];

    productsAPI.getAll.mockImplementation((params) => {
      if (params?.availability === 'needs_restock') {
        return Promise.resolve({
          data: {
            products: fiveItems,
            pagination: { total: 12, page: 1, pageSize: 5, totalPages: 3 },
            availability: 'needs_restock',
          },
        });
      }
      return Promise.resolve({
        data: {
          products: [{ id: 99, name: 'Existing Catalog Product', stockQuantity: 50, reorderPoint: 10 }],
        },
      });
    });

    renderDashboard();

    for (const item of fiveItems) {
      expect(await screen.findByText(item.name)).toBeInTheDocument();
    }

    const viewAllLink = await screen.findByRole('link', { name: /View all 12/i });
    expect(viewAllLink).toBeInTheDocument();
    expect(viewAllLink.getAttribute('href')).toBe('/stock/manage');
  });

  test('(b) total 12 triggers exactly ONE toast/notification call and deduplicates on refresh', async () => {
    const fiveItems = [
      { id: 101, name: 'Urgent Product A', stockQuantity: 0, reorderPoint: 5, active: true },
      { id: 102, name: 'Urgent Product B', stockQuantity: 1, reorderPoint: 5, active: true },
      { id: 103, name: 'Urgent Product C', stockQuantity: 2, reorderPoint: 5, active: true },
    ];

    productsAPI.getAll.mockImplementation((params) => {
      if (params?.availability === 'needs_restock') {
        return Promise.resolve({
          data: {
            products: fiveItems,
            pagination: { total: 12, page: 1, pageSize: 5, totalPages: 3 },
            availability: 'needs_restock',
          },
        });
      }
      return Promise.resolve({
        data: {
          products: [{ id: 99, name: 'Existing Catalog Product', stockQuantity: 50, reorderPoint: 10 }],
        },
      });
    });

    renderDashboard();

    await waitFor(() => {
      expect(notifyRestockSummary).toHaveBeenCalledTimes(1);
    });

    expect(notifyRestockSummary).toHaveBeenCalledWith(12, expect.arrayContaining([
      expect.objectContaining({ name: 'Urgent Product A' }),
    ]));
    expect(notifyLowStock).not.toHaveBeenCalled();

    // Settle card content
    expect(await screen.findByText('Urgent Product A')).toBeInTheDocument();

    // Trigger dashboard refresh
    const refreshBtn = screen.getByRole('button', { name: /Refresh/i });
    fireEvent.click(refreshBtn);

    // Wait for refresh to settle and verify STILL called only once
    await waitFor(() => {
      expect(notifyRestockSummary).toHaveBeenCalledTimes(1);
    });
    expect(notifyLowStock).not.toHaveBeenCalled();
  });

  test('(c) response without the availability echo: client-side fallback from state.products', async () => {
    const fallbackProducts = [
      { id: 201, name: 'Fallback Low Item', stockQuantity: 2, reorderPoint: 10, active: true },
      { id: 202, name: 'Healthy In-Stock Item', stockQuantity: 50, reorderPoint: 10, active: true },
    ];

    productsAPI.getAll.mockImplementation((params) => {
      if (params?.availability === 'needs_restock') {
        return Promise.resolve({
          data: {
            products: [{ id: 999, name: 'Untrusted Server Product', stockQuantity: 0, reorderPoint: 10 }],
            pagination: { total: 999 },
          },
        });
      }
      return Promise.resolve({ data: { products: fallbackProducts } });
    });

    renderDashboard({ preloadedProducts: fallbackProducts });

    expect(await screen.findByText('Fallback Low Item')).toBeInTheDocument();
    expect(screen.queryByText('Healthy In-Stock Item')).toBeNull();
    expect(screen.queryByText('Untrusted Server Product')).toBeNull();
  });

  test('(d) request rejects: same fallback, no crash', async () => {
    const fallbackProducts = [
      { id: 301, name: 'Reject Fallback Low Item', stockQuantity: 1, reorderPoint: 10, active: true },
    ];

    productsAPI.getAll.mockImplementation((params) => {
      if (params?.availability === 'needs_restock') {
        return Promise.reject(new Error('Network offline'));
      }
      return Promise.resolve({ data: { products: fallbackProducts } });
    });

    renderDashboard({ preloadedProducts: fallbackProducts });

    expect(await screen.findByText('Reject Fallback Low Item')).toBeInTheDocument();
  });

  test('(e) total 0 shows the "well stocked" empty state', async () => {
    productsAPI.getAll.mockImplementation((params) => {
      if (params?.availability === 'needs_restock') {
        return Promise.resolve({
          data: {
            products: [],
            pagination: { total: 0, page: 1, pageSize: 5, totalPages: 0 },
            availability: 'needs_restock',
          },
        });
      }
      return Promise.resolve({
        data: {
          products: [{ id: 99, name: 'Existing Catalog Product', stockQuantity: 50, reorderPoint: 10 }],
        },
      });
    });

    renderDashboard();

    expect(await screen.findByText(/All products are well stocked!/i)).toBeInTheDocument();
    expect(screen.getByText(/Stock levels are looking healthy across your inventory/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /View all/i })).toBeNull();
    expect(notifyRestockSummary).not.toHaveBeenCalled();
    expect(notifyLowStock).not.toHaveBeenCalled();
  });

  test('(f) state.products still drives isFirstRun (products=[] shows first-run; products present with restock total 0 does not)', async () => {
    localStorage.removeItem('zana_onboarding_dismissed_test-org');
    salesAPI.getAll.mockResolvedValue({ data: [] });
    salesAPI.getStatistics.mockResolvedValue({ data: { totalSales: 0 } });

    productsAPI.getAll.mockImplementation((params) => {
      if (params?.availability === 'needs_restock') {
        return Promise.resolve({
          data: {
            products: [],
            pagination: { total: 0, page: 1, pageSize: 5, totalPages: 0 },
            availability: 'needs_restock',
          },
        });
      }
      return Promise.resolve({ data: { products: [] } });
    });

    const { unmount } = renderDashboard({
      preloadedProducts: [],
      sales: [],
      statistics: { totalSales: 0 },
    });
    const checklist = await screen.findByTestId('getting-started-checklist');
    expect(checklist).toBeInTheDocument();
    expect(checklist.getAttribute('data-products-count')).toBe('0');
    unmount();

    const normalProducts = [
      { id: 401, name: 'Standard Product', stockQuantity: 50, reorderPoint: 10, active: true },
    ];
    productsAPI.getAll.mockImplementation((params) => {
      if (params?.availability === 'needs_restock') {
        return Promise.resolve({
          data: {
            products: [],
            pagination: { total: 0, page: 1, pageSize: 5, totalPages: 0 },
            availability: 'needs_restock',
          },
        });
      }
      return Promise.resolve({ data: { products: normalProducts } });
    });

    renderDashboard({
      preloadedProducts: normalProducts,
      sales: [],
      statistics: { totalSales: 0 },
    });
    // Assert checklist absence only AFTER the 'well stocked' text has appeared
    expect(await screen.findByText(/All products are well stocked!/i)).toBeInTheDocument();
    expect(screen.queryByTestId('getting-started-checklist')).toBeNull();
  });

  test('(g) productsAPI.getAll called with availability=needs_restock once on mount, twice after refresh', async () => {
    const restockItems = [
      { id: 501, name: 'Restock Item G', stockQuantity: 0, reorderPoint: 5, active: true },
    ];

    productsAPI.getAll.mockImplementation((params) => {
      if (params?.availability === 'needs_restock') {
        return Promise.resolve({
          data: {
            products: restockItems,
            pagination: { total: 1, page: 1, pageSize: 5, totalPages: 1 },
            availability: 'needs_restock',
          },
        });
      }
      return Promise.resolve({
        data: {
          products: [{ id: 99, name: 'Catalog Product', stockQuantity: 50, reorderPoint: 10 }],
        },
      });
    });

    renderDashboard();

    expect(await screen.findByText('Restock Item G')).toBeInTheDocument();

    const getRestockCalls = () =>
      productsAPI.getAll.mock.calls.filter(([params]) => params?.availability === 'needs_restock');

    expect(getRestockCalls()).toHaveLength(1);

    const refreshBtn = screen.getByRole('button', { name: /Refresh/i });
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(getRestockCalls()).toHaveLength(2);
    });
  });

  test('(h) fallback path (no echo): exactly ONE notifyRestockSummary call with total equal to low-stock products in state.products', async () => {
    const fallbackProducts = [
      { id: 601, name: 'Fallback Low 1', stockQuantity: 1, reorderPoint: 5, active: true },
      { id: 602, name: 'Fallback Low 2', stockQuantity: 0, reorderPoint: 5, active: true },
      { id: 603, name: 'Fallback Healthy', stockQuantity: 50, reorderPoint: 5, active: true },
    ];

    productsAPI.getAll.mockImplementation((params) => {
      if (params?.availability === 'needs_restock') {
        return Promise.resolve({
          data: {
            products: [{ id: 999, name: 'Server Product Without Echo', stockQuantity: 0, reorderPoint: 5 }],
            pagination: { total: 1 },
          },
        });
      }
      return Promise.resolve({ data: { products: fallbackProducts } });
    });

    renderDashboard({ preloadedProducts: fallbackProducts });

    expect(await screen.findByText('Fallback Low 1')).toBeInTheDocument();
    expect(await screen.findByText('Fallback Low 2')).toBeInTheDocument();

    await waitFor(() => {
      expect(notifyRestockSummary).toHaveBeenCalledTimes(1);
    });

    expect(notifyRestockSummary).toHaveBeenCalledWith(2, expect.arrayContaining([
      expect.objectContaining({ name: 'Fallback Low 1' }),
      expect.objectContaining({ name: 'Fallback Low 2' }),
    ]));
    expect(notifyLowStock).not.toHaveBeenCalled();
  });
});
