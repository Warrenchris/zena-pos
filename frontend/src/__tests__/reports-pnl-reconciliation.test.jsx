jest.mock('../components/DateRangePicker', () => () => <div data-testid="date-range-picker" />);

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import Reports from '../pages/Reports';
import authReducer from '../store/slices/authSlice';
import categoriesReducer from '../store/slices/categoriesSlice';
import settingsReducer from '../store/slices/settingsSlice';
import * as apiModule from '../services/api';

jest.mock('../services/api', () => {
  const mockApi = {
    get: jest.fn().mockResolvedValue({ data: [] }),
    post: jest.fn().mockResolvedValue({ data: [] }),
  };
  return {
    __esModule: true,
    default: mockApi,
    reportsAPI: {
      salesSummary: jest.fn().mockResolvedValue({ data: { kpis: {}, salesTrend: [] } }),
      profitAndLoss: jest.fn(),
      taxEstimate: jest.fn().mockResolvedValue({ data: {} }),
      employeeSales: jest.fn().mockResolvedValue({ data: [] }),
    },
    employeesAPI: {
      getAll: jest.fn().mockResolvedValue({ data: [] }),
    },
    authAPI: {
      resendVerification: jest.fn().mockResolvedValue({}),
    },
  };
});

jest.mock('../services/analytics.service', () => ({
  __esModule: true,
  default: {
    getSalesChannels: jest.fn().mockResolvedValue({ platforms: [] }),
    getTopProducts: jest.fn().mockResolvedValue({ products: [] }),
  },
}));

// Mock ResizeObserver for recharts ResponsiveContainer
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

function createTestStore() {
  return configureStore({
    reducer: combineReducers({
      auth: authReducer,
      categories: categoriesReducer,
      settings: settingsReducer,
    }),
    preloadedState: {
      auth: {
        user: { id: 1, role: 'admin', shopId: 4, name: 'Warren Chris' },
      },
      categories: { categories: [] },
      settings: {
        defaultCurrency: 'KES',
        currencySymbol: 'KSh',
        currencyPosition: 'before',
        decimalPlaces: 2,
      },
    },
  });
}

describe('Reports P&L Reconciliation and Refunds UI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('P&L tab displays Refunds card, Net Revenue (after discounts & refunds), and reconciles mathematically', async () => {
    const mockPnlData = {
      grossRevenue: 16725.00,
      totalTax: 0.00,
      totalDiscount: 0.00,
      totalRefunds: 340.00,
      returnedCogs: 290.00,
      revenue: 16385.00,
      netRevenue: 16385.00,
      cogs: 13618.00,
      grossProfit: 2767.00,
      operatingExpenses: 45000.00,
      totalExpenses: 45000.00,
      profit: -42233.00,
    };

    apiModule.reportsAPI.profitAndLoss.mockResolvedValue({ data: mockPnlData });

    const store = createTestStore();
    render(
      <Provider store={store}>
        <Reports />
      </Provider>
    );

    // Switch to P&L tab
    const pnlTabBtn = screen.getByRole('button', { name: /Profit & Loss/i });
    fireEvent.click(pnlTabBtn);

    // Verify all cards are rendered with reconciled data
    await waitFor(() => {
      expect(screen.getByText('Gross Revenue (Pre-discount)')).toBeInTheDocument();
      expect(screen.getByText('Refunds')).toBeInTheDocument();
      expect(screen.getByText('Net Revenue (after discounts & refunds)')).toBeInTheDocument();
      expect(screen.getByText('COGS')).toBeInTheDocument();
      expect(screen.getByText('Gross Profit')).toBeInTheDocument();
      expect(screen.getByText('Operating Expenses')).toBeInTheDocument();
      expect(screen.getByText('Net Profit')).toBeInTheDocument();
      // Check values
      expect(screen.getByText(/16,725/)).toBeInTheDocument();
      expect(screen.getByText(/340/)).toBeInTheDocument();
      expect(screen.getByText(/16,385/)).toBeInTheDocument();
      expect(screen.getByText(/13,618/)).toBeInTheDocument();
      expect(screen.getByText(/2,767/)).toBeInTheDocument();
      expect(screen.getByText(/45,000/)).toBeInTheDocument();
      expect(screen.getByText(/-42,233/)).toBeInTheDocument();
    }, { timeout: 4000 });

    // Verify mathematical reconciliation
    const calculatedNetRev = mockPnlData.grossRevenue - mockPnlData.totalDiscount - mockPnlData.totalRefunds;
    expect(calculatedNetRev).toBe(mockPnlData.revenue);

    const calculatedGrossProfit = mockPnlData.revenue - mockPnlData.cogs;
    expect(calculatedGrossProfit).toBe(mockPnlData.grossProfit);

    const calculatedNetProfit = mockPnlData.grossProfit - mockPnlData.totalExpenses;
    expect(calculatedNetProfit).toBe(mockPnlData.profit);
  });
});
