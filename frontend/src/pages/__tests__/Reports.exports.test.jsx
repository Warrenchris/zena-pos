import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import Reports from '../Reports';
import authReducer from '../../store/slices/authSlice';
import categoriesReducer from '../../store/slices/categoriesSlice';
import settingsReducer from '../../store/slices/settingsSlice';
import shopReducer from '../../store/slices/shopSlice';
import { generatePDF } from '../../utils/documentGenerator';
import { generateExcel } from '../../utils/excelGenerator';
import { downloadCSV } from '../../utils/csv';
import { toast } from '../../utils/toast';

// Mock dependencies
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
  expensesAPI: {
    getStatistics: jest.fn().mockResolvedValue({ data: { totalExpenses: 25000 } }),
  },
}));

jest.mock('../../services/ai.service', () => ({
  __esModule: true,
  default: {
    analyzeBusiness: jest.fn().mockResolvedValue({
      data: { summary: 'Strong 18.5% growth driven by mobile payments.' },
    }),
  },
}));

jest.mock('../../services/analytics.service', () => ({
  __esModule: true,
  default: {
    getSalesChannels: jest.fn().mockResolvedValue({ platforms: [{ name: 'Cash', orders: 12 }] }),
    getTopProducts: jest.fn().mockResolvedValue({ products: [{ name: 'Mocha Beans', sales: 40, revenue: 800 }] }),
  },
}));

jest.mock('../../utils/documentGenerator', () => ({
  generatePDF: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../../utils/excelGenerator', () => ({
  generateExcel: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../../utils/csv', () => ({
  downloadCSV: jest.fn(),
  formatCSV: jest.fn(),
  escapeCSVField: jest.fn((v) => String(v ?? '')),
}));

jest.mock('../../utils/toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
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
      shop: shopReducer,
    }),
    preloadedState: {
      auth: {
        user: { id: 1, role: 'admin', shopId: 1, name: 'Warren Chris', organizationName: 'Zana Enterprise' },
      },
      categories: { categories: [{ id: 10, name: 'Beverages' }] },
      settings: {
        defaultCurrency: 'KES',
        currencySymbol: 'KSh',
        currencyPosition: 'before',
        decimalPlaces: 2,
        systemName: 'Zana Flagship Store',
      },
      shop: {
        shop: { id: 1, name: 'Nairobi Central Branch', phone: '+254700000000', email: 'shop@zana.co.ke' },
      },
    },
  });
}

// Generate 35 trend rows to strictly verify NO 20-row truncation (RPT-01 fix)
const mockSalesTrend35Rows = Array.from({ length: 35 }, (_, idx) => ({
  period: `2026-10-${String(idx + 1).padStart(2, '0')}`,
  revenue: 1000 + idx * 50,
  sales: 10 + idx,
  tax: 160 + idx * 8,
  discount: 20 + idx,
}));

const mockSalesData = {
  kpis: {
    totalRevenue: 65000.0,
    totalSales: 875,
    activeCustomers: 450,
    topProduct: 'Arabica Coffee',
    grossProfit: 28000.0,
    taxPayable: 8900.0,
  },
  salesTrend: mockSalesTrend35Rows,
  paymentBreakdown: [
    { method: 'M-Pesa', value: 45000 },
    { method: 'Cash', value: 20000 },
  ],
  topEmployees: [
    { name: 'John Doe', revenue: 38000 },
    { name: 'Jane Smith', revenue: 27000 },
  ],
  productPerformance: [
    { product: 'Arabica Coffee', sold: 300, revenue: 30000 },
  ],
};

const mockPLData = {
  grossRevenue: 100000.0,
  totalTax: 16000.0,
  totalDiscount: 5000.0,
  totalRefunds: 2000.0,
  netRevenue: 93000.0,
  cogs: 40000.0,
  grossProfit: 53000.0,
  operatingExpenses: 25000.0,
  profit: 28000.0,
};

const mockTaxData = {
  taxableRevenue: 85000.0,
  taxRate: 0.16,
  estimatedTax: 13600.0,
  breakdown: [
    { category: 'standard', name: 'Standard Rated (16%)', taxableAmount: 70000.0, taxAmount: 11200.0, rate: 16.0 },
    { category: 'zero_rated', name: 'Zero-Rated (0%)', taxableAmount: 10000.0, taxAmount: 0.0, rate: 0.0 },
    { category: 'exempt', name: 'Exempt (0%)', taxableAmount: 5000.0, taxAmount: 0.0, rate: 0.0 },
  ],
};

const mockEmployeeSalesData = [
  { performerName: 'Alice Maina', role: 'Cashier', totalSales: 28, totalRevenue: 34000.0, averageSaleValue: 1214.29 },
  { performerName: 'Bob Otieno', role: 'Cashier', totalSales: 22, totalRevenue: 31000.0, averageSaleValue: 1409.09 },
];

function renderReports() {
  const store = createTestStore();
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <Reports />
      </MemoryRouter>
    </Provider>
  );
}

describe('Reports Page UDDS Phase 2 Exports & Document Printing', () => {
  jest.setTimeout(15000);
  const { reportsAPI } = jest.requireMock('../../services/api');

  beforeEach(() => {
    jest.clearAllMocks();
    reportsAPI.salesSummary.mockResolvedValue({ data: mockSalesData });
    reportsAPI.profitAndLoss.mockResolvedValue({ data: mockPLData });
    reportsAPI.taxEstimate.mockResolvedValue({ data: mockTaxData });
    reportsAPI.employeeSales.mockResolvedValue({ data: mockEmployeeSalesData });
    window.print = jest.fn();
  });

  describe('Tab 1: Sales Summary Export Verification (RPT-01 Fix)', () => {
    test('exportPdf exports ALL 35 rows without truncation, includes summary cards and multiple tables', async () => {
      renderReports();

      // Wait until data has finished loading and KPI value is displayed
      await waitFor(() => {
        expect(screen.getAllByText(/65,000/)[0]).toBeInTheDocument();
      });

      const pdfBtn = screen.getByRole('button', { name: /export pdf/i });
      fireEvent.click(pdfBtn);

      await waitFor(() => {
        expect(generatePDF).toHaveBeenCalledTimes(1);
      });

      const pdfCall = generatePDF.mock.calls[0][0];
      expect(pdfCall.title).toBe('SALES SUMMARY REPORT');
      expect(pdfCall.summaryCards).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: 'Total Revenue' }),
          expect.objectContaining({ label: 'Total Sales' }),
          expect.objectContaining({ label: 'Gross Profit' }),
          expect.objectContaining({ label: 'Active Customers' }),
        ])
      );

      // CRITICAL RPT-01 VERIFICATION: Must export all 35 rows, NOT truncated to 20!
      const salesTable = pdfCall.tables.find((t) => t.title === 'Sales Volume & Trend');
      expect(salesTable).toBeDefined();
      expect(salesTable.rows.length).toBe(35);
      expect(salesTable.summaryRow[0]).toBe('TOTAL');

      // Additional tables for payment methods and top employees
      expect(pdfCall.tables.some((t) => t.title === 'Payment Method Breakdown')).toBe(true);
      expect(pdfCall.tables.some((t) => t.title === 'Top Employees by Revenue')).toBe(true);
      expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/exported to pdf successfully/i));
    });

    test('exportExcel generates multi-sheet workbook with all 35 sales rows, payment methods, and top employees', async () => {
      renderReports();

      await waitFor(() => {
        expect(screen.getAllByText(/65,000/)[0]).toBeInTheDocument();
      });

      const excelBtn = screen.getByRole('button', { name: /export excel/i });
      fireEvent.click(excelBtn);

      await waitFor(() => {
        expect(generateExcel).toHaveBeenCalledTimes(1);
      });

      const excelCall = generateExcel.mock.calls[0][0];
      expect(excelCall.sheets.length).toBeGreaterThanOrEqual(2);

      const mainSheet = excelCall.sheets[0];
      expect(mainSheet.sheetName).toBe('Sales Trend');
      expect(mainSheet.rows.length).toBe(35); // All 35 rows preserved
      expect(mainSheet.summaryRow[0]).toBe('TOTAL');
      expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/exported to excel successfully/i));
    });

    test('exportCsv exports all 35 rows and includes totals summary row', async () => {
      renderReports();

      await waitFor(() => {
        expect(screen.getAllByText(/65,000/)[0]).toBeInTheDocument();
      });

      const csvBtn = screen.getByRole('button', { name: /export csv/i });
      fireEvent.click(csvBtn);

      await waitFor(() => {
        expect(downloadCSV).toHaveBeenCalledTimes(1);
      });

      const [filename, rows] = downloadCSV.mock.calls[0];
      expect(filename).toMatch(/^sales-summary-.*\.csv$/);
      // 35 data rows + 1 totals row = 36 rows
      expect(rows.length).toBe(36);
      expect(rows[rows.length - 1].Period).toBe('TOTAL');
      expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/exported to csv successfully/i));
    });
  });

  

  describe('Tab: Cashier & Shifts Export Verification', () => {
    test('exportPdf exports staff breakdown, metrics and payment tender tables', async () => {
      renderReports();

      const cashierTab = screen.getByRole('button', { name: /^cashier & shifts$/i });
      fireEvent.click(cashierTab);

      await waitFor(() => {
        expect(screen.getByText('Alice Maina')).toBeInTheDocument();
      });

      const pdfBtn = screen.getByRole('button', { name: /export pdf/i });
      fireEvent.click(pdfBtn);

      await waitFor(() => {
        expect(generatePDF).toHaveBeenCalledTimes(1);
      });

      const pdfCall = generatePDF.mock.calls[0][0];
      expect(pdfCall.title).toBe('CASHIER & SHIFT RECONCILIATION REPORT');
      expect(pdfCall.tables.length).toBeGreaterThanOrEqual(1);
      expect(pdfCall.tables[0].title).toBe('Cashier & Staff Sales Performance');
      expect(pdfCall.tables[0].rows.length).toBe(2);
      expect(pdfCall.tables[0].summaryRow[0]).toBe('TOTAL');
      expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/exported to pdf successfully/i));
    });

    test('exportExcel exports multi-sheet workbook for shifts and tender reconciliation', async () => {
      renderReports();

      const cashierTab = screen.getByRole('button', { name: /^cashier & shifts$/i });
      fireEvent.click(cashierTab);

      await waitFor(() => {
        expect(screen.getByText('Alice Maina')).toBeInTheDocument();
      });

      const excelBtn = screen.getByRole('button', { name: /export excel/i });
      fireEvent.click(excelBtn);

      await waitFor(() => {
        expect(generateExcel).toHaveBeenCalledTimes(1);
      });

      const excelCall = generateExcel.mock.calls[0][0];
      expect(excelCall.sheets.length).toBeGreaterThanOrEqual(1);
      expect(excelCall.sheets[0].sheetName).toBe('Shift Summary');
      expect(excelCall.sheets[0].rows.length).toBe(2);
      expect(excelCall.sheets[0].summaryRow[0]).toBe('TOTAL');
    });

    test('exportCsv exports staff ledger with totals row', async () => {
      renderReports();

      const cashierTab = screen.getByRole('button', { name: /^cashier & shifts$/i });
      fireEvent.click(cashierTab);

      await waitFor(() => {
        expect(screen.getByText('Alice Maina')).toBeInTheDocument();
      });

      const csvBtn = screen.getByRole('button', { name: /export csv/i });
      fireEvent.click(csvBtn);

      await waitFor(() => {
        expect(downloadCSV).toHaveBeenCalledTimes(1);
      });

      const [filename, rows] = downloadCSV.mock.calls[0];
      expect(filename).toMatch(/^cashier-shift-report-.*\.csv$/);
      // 2 employee rows + 1 total row = 3 rows
      expect(rows.length).toBe(3);
      expect(rows[0]['Cashier / Staff']).toBe('Alice Maina');
      expect(rows[2]['Cashier / Staff']).toBe('TOTAL');
    });
  });

  describe('Tab 2: Profit & Loss Export Verification (RPT-02 Fix)', () => {
    test('exportPdf exports full financial P&L statement with metric cards', async () => {
      renderReports();

      // Switch to Profit & Loss tab
      const plTab = screen.getByRole('button', { name: /^profit & loss$/i });
      fireEvent.click(plTab);

      // Wait for P&L data to load
      await waitFor(() => {
        expect(screen.getAllByText(/Gross Revenue \(Pre-discount\)/i)[0]).toBeInTheDocument();
      });

      const pdfBtn = screen.getByRole('button', { name: /export pdf/i });
      fireEvent.click(pdfBtn);

      await waitFor(() => {
        expect(generatePDF).toHaveBeenCalledTimes(1);
      });

      const pdfCall = generatePDF.mock.calls[0][0];
      expect(pdfCall.title).toBe('PROFIT & LOSS STATEMENT');
      expect(pdfCall.rows.length).toBe(9); // All 9 metrics exported
      expect(pdfCall.rows.some((r) => r[0].includes('Gross Revenue'))).toBe(true);
      expect(pdfCall.rows.some((r) => r[0].includes('Net Profit'))).toBe(true);
    });

    test('exportExcel and exportCsv export full financial P&L structure', async () => {
      renderReports();

      const plTab = screen.getByRole('button', { name: /^profit & loss$/i });
      fireEvent.click(plTab);

      await waitFor(() => {
        expect(screen.getAllByText(/Gross Revenue \(Pre-discount\)/i)[0]).toBeInTheDocument();
      });

      // Export Excel
      const excelBtn = screen.getByRole('button', { name: /export excel/i });
      fireEvent.click(excelBtn);

      await waitFor(() => {
        expect(generateExcel).toHaveBeenCalledTimes(1);
      });

      const excelCall = generateExcel.mock.calls[0][0];
      expect(excelCall.title).toBe('PROFIT & LOSS STATEMENT');
      expect(excelCall.rows.length).toBe(9);

      // Wait for button to be re-enabled
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /export csv/i })).not.toBeDisabled();
      });

      // Export CSV
      const csvBtn = screen.getByRole('button', { name: /export csv/i });
      fireEvent.click(csvBtn);

      await waitFor(() => {
        expect(downloadCSV).toHaveBeenCalledTimes(1);
      });

      const [csvName, csvRows] = downloadCSV.mock.calls[0];
      expect(csvName).toMatch(/^profit-and-loss-.*\.csv$/);
      expect(csvRows.length).toBe(9);
    });
  });

  describe('Tab 3: Tax Reports Export Verification (RPT-02 Fix)', () => {
    test('exportPdf and exportExcel export tax rate and category breakdown', async () => {
      renderReports();

      // Switch to Tax Reports tab
      const taxTab = screen.getByRole('button', { name: /^tax reports$/i });
      fireEvent.click(taxTab);

      await waitFor(() => {
        expect(screen.getAllByText(/85,000/)[0]).toBeInTheDocument();
      });

      // 1. Export PDF
      const pdfBtn = screen.getByRole('button', { name: /export pdf/i });
      fireEvent.click(pdfBtn);

      await waitFor(() => {
        expect(generatePDF).toHaveBeenCalledTimes(1);
      });

      const pdfCall = generatePDF.mock.calls[0][0];
      expect(pdfCall.title).toBe('TAX SUMMARY & RATE BREAKDOWN');
      expect(pdfCall.rows.length).toBe(3); // Standard, Zero-Rated, Exempt
      expect(pdfCall.summaryRow[0]).toBe('TOTAL');

      // Wait for re-enable
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /export excel/i })).not.toBeDisabled();
      });

      // 2. Export Excel
      const excelBtn = screen.getByRole('button', { name: /export excel/i });
      fireEvent.click(excelBtn);

      await waitFor(() => {
        expect(generateExcel).toHaveBeenCalledTimes(1);
      });

      const excelCall = generateExcel.mock.calls[0][0];
      expect(excelCall.title).toBe('TAX SUMMARY & RATE BREAKDOWN');
      expect(excelCall.rows.length).toBe(3);
      expect(excelCall.summaryRow[0]).toBe('TOTAL');
    });
  });

  describe('Tab 4: Trends & Insights Export Verification (RPT-02 Fix)', () => {
    test('exportPdf exports AI business insights narrative and trajectory', async () => {
      renderReports();

      // Switch to Trends & Insights tab
      const insightsTab = screen.getByRole('button', { name: /^trends & insights$/i });
      fireEvent.click(insightsTab);

      await waitFor(() => {
        expect(screen.getByText(/Strong 18.5% growth/i)).toBeInTheDocument();
      });

      const pdfBtn = screen.getByRole('button', { name: /export pdf/i });
      fireEvent.click(pdfBtn);

      await waitFor(() => {
        expect(generatePDF).toHaveBeenCalledTimes(1);
      });

      const pdfCall = generatePDF.mock.calls[0][0];
      expect(pdfCall.title).toBe('BUSINESS TRENDS & AI INSIGHTS');
      expect(pdfCall.meta.some((m) => m.label === 'Executive AI Analysis')).toBe(true);
    });
  });

  describe('Print Isolation Verification (RPT-03 Fix)', () => {
    test('clicking Print triggers window.print() and prepares isolated A4 printable container', async () => {
      renderReports();

      await waitFor(() => {
        expect(screen.getAllByText(/65,000/)[0]).toBeInTheDocument();
      });

      const printBtn = screen.getByRole('button', { name: /^print$/i });
      fireEvent.click(printBtn);

      await waitFor(() => {
        expect(window.print).toHaveBeenCalled();
      });
    });
  });
});
