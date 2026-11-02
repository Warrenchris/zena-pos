import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import Reports from '../Reports';
import authReducer from '../../store/slices/authSlice';
import categoriesReducer from '../../store/slices/categoriesSlice';
import settingsReducer from '../../store/slices/settingsSlice';
import * as apiModule from '../../services/api';

jest.mock('../../components/DateRangePicker', () => () => <div data-testid="date-range-picker" />);

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: [] }) },
  reportsAPI: {
    salesSummary: jest.fn(),
    profitAndLoss: jest.fn(),
    taxEstimate: jest.fn(),
    employeeSales: jest.fn().mockResolvedValue({ data: [] }),
  },
  employeesAPI: {
    getAll: jest.fn().mockResolvedValue({ data: [{ id: 1, firstName: 'John', lastName: 'Doe' }] }),
  },
}));

jest.mock('../../services/ai.service', () => ({
  __esModule: true,
  default: {
    analyzeBusiness: jest.fn().mockResolvedValue({
      data: { summary: 'Strong 15.2% revenue growth driven by card and mobile transactions.' },
    }),
  },
}));

jest.mock('../../services/analytics.service', () => ({
  __esModule: true,
  default: {
    getSalesChannels: jest.fn().mockResolvedValue({ platforms: [{ name: 'Cash', orders: 12 }] }),
    getTopProducts: jest.fn().mockResolvedValue({ products: [{ name: 'Coffee Beans', sales: 40, revenue: 800 }] }),
  },
}));

jest.mock('recharts', () => {
  const OriginalModule = jest.requireActual('recharts');
  return {
    ...OriginalModule,
    ResponsiveContainer: ({ children }) => <div className="recharts-mock">{children}</div>,
  };
});

function createTestStore() {
  return configureStore({
    reducer: combineReducers({
      auth: authReducer,
      categories: categoriesReducer,
      settings: settingsReducer,
    }),
    preloadedState: {
      auth: {
        user: { id: 1, role: 'admin', shopId: 1, name: 'Warren Chris' },
      },
      categories: { categories: [{ id: 10, name: 'Beverages' }] },
      settings: {
        defaultCurrency: 'USD',
        currencySymbol: '$',
        currencyPosition: 'before',
        decimalPlaces: 2,
      },
    },
  });
}

describe('Reports Page UI Theme & Consistency Audit', () => {
  const mockSalesData = {
    kpis: {
      totalRevenue: 5200.0,
      totalSales: 48,
      activeCustomers: 35,
      topProduct: 'Espresso Roast',
      grossProfit: 2100.0,
      taxPayable: 416.0,
    },
    salesTrend: [
      { period: '2026-10-01', revenue: 2500, sales: 22 },
      { period: '2026-10-02', revenue: 2700, sales: 26 },
    ],
    paymentBreakdown: [
      { method: 'Cash', value: 2000 },
      { method: 'Card', value: 3200 },
    ],
    topEmployees: [
      { name: 'John Doe', revenue: 3500 },
    ],
    productPerformance: [
      { product: 'Espresso Roast', sold: 50, revenue: 1500 },
    ],
    customerSegments: [
      { segment: 'Returning', value: 25 },
      { segment: 'New', value: 10 },
    ],
    revVsExp: [
      { period: '2026-10-01', revenue: 2500, expenses: 1400 },
      { period: '2026-10-02', revenue: 2700, expenses: 1500 },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    apiModule.reportsAPI.salesSummary.mockResolvedValue({ data: mockSalesData });
    apiModule.reportsAPI.profitAndLoss.mockResolvedValue({
      data: {
        grossRevenue: 5200,
        totalTax: 416,
        totalDiscount: 100,
        totalRefunds: 50,
        revenue: 5050,
        netRevenue: 5050,
        cogs: 2950,
        grossProfit: 2100,
        operatingExpenses: 1100,
        profit: 1000,
      },
    });
    apiModule.reportsAPI.taxEstimate.mockResolvedValue({
      data: {
        taxableRevenue: 5050,
        taxRate: 0.16,
        estimatedTax: 808,
      },
    });
  });

  test('renders page header, toolbar, KPI summary cards, and all chart cards', async () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <MemoryRouter>
          <Reports />
        </MemoryRouter>
      </Provider>
    );

    // Verify Page Header
    expect(screen.getByText('Reports & Analytics')).toBeInTheDocument();

    // Verify Tab buttons in filter toolbar
    expect(screen.getByRole('button', { name: 'Sales Summary' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Profit & Loss' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tax Reports' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trends & Insights' })).toBeInTheDocument();

    // Verify KPI summary metrics after async load
    await waitFor(() => {
      expect(screen.getByText('Total Revenue')).toBeInTheDocument();
      expect(screen.getByText('Total Sales')).toBeInTheDocument();
      expect(screen.getByText('Active Customers')).toBeInTheDocument();
      expect(screen.getByText('Top Product')).toBeInTheDocument();
      expect(screen.getByText('Gross Profit')).toBeInTheDocument();
      expect(screen.getByText('Tax Payable')).toBeInTheDocument();
    });

    // Verify Chart titles
    await waitFor(() => {
      expect(screen.getByText('Sales Trend')).toBeInTheDocument();
      expect(screen.getByText('Payment Method Distribution')).toBeInTheDocument();
      expect(screen.getByText('Top Employees by Sales')).toBeInTheDocument();
      expect(screen.getByText('Product Performance (Top vs Least)')).toBeInTheDocument();
      expect(screen.getByText('Customer Segments')).toBeInTheDocument();
      expect(screen.getByText('Monthly Revenue vs Expenses')).toBeInTheDocument();
    });
  });

  test('switches to Tax Reports tab and renders clean theme-aware cards', async () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <MemoryRouter>
          <Reports />
        </MemoryRouter>
      </Provider>
    );

    const taxTabBtn = screen.getByRole('button', { name: 'Tax Reports' });
    fireEvent.click(taxTabBtn);

    await waitFor(() => {
      expect(screen.getByText('Tax Summary & Estimates')).toBeInTheDocument();
      expect(screen.getByText('Taxable Revenue')).toBeInTheDocument();
      expect(screen.getByText('Tax Rate')).toBeInTheDocument();
      expect(screen.getByText('16.00%')).toBeInTheDocument();
      expect(screen.getByText('Estimated Tax')).toBeInTheDocument();
    });
  });

  test('switches to Trends & Insights tab and renders AI Business Insights card', async () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <MemoryRouter>
          <Reports />
        </MemoryRouter>
      </Provider>
    );

    const insightsTabBtn = screen.getByRole('button', { name: 'Trends & Insights' });
    fireEvent.click(insightsTabBtn);

    await waitFor(() => {
      expect(screen.getByText('AI Business Insights')).toBeInTheDocument();
      expect(
        screen.getByText(/Strong 15.2% revenue growth driven by card and mobile transactions/i)
      ).toBeInTheDocument();
    });
  });
});
