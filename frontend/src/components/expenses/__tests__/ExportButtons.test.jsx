import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import ExportButtons from '../ExportButtons';
import { expensesAPI } from '../../../services/api';
import { generatePDF } from '../../../utils/documentGenerator';
import { generateExcel } from '../../../utils/excelGenerator';
import { downloadCSV } from '../../../utils/csv';
import { toast } from '../../../utils/toast';

// Mock dependencies
jest.mock('../../../services/api', () => ({
  __esModule: true,
  expensesAPI: {
    getAll: jest.fn(),
  },
}));

jest.mock('../../../utils/documentGenerator', () => ({
  generatePDF: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../../../utils/excelGenerator', () => ({
  generateExcel: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../../../utils/csv', () => ({
  downloadCSV: jest.fn(),
}));

jest.mock('../../../utils/toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

const mockPaginatedExpenses = [
  {
    id: 1,
    description: 'Electricity Bill',
    category: 'utilities',
    amount: 150.0,
    date: '2026-10-15T10:00:00Z',
    paymentMethod: 'mpesa',
    recordedBy: { name: 'Admin Jane' },
  },
];

const mockFullExpenses = [
  {
    id: 1,
    description: 'Electricity Bill',
    category: 'utilities',
    amount: 150.0,
    date: '2026-10-15T10:00:00Z',
    paymentMethod: 'mpesa',
    recordedBy: { name: 'Admin Jane' },
  },
  {
    id: 2,
    description: 'Office Internet Fiber',
    category: 'utilities',
    amount: 80.0,
    date: '2026-10-16T12:00:00Z',
    paymentMethod: 'bank_transfer',
    recordedBy: { name: 'Admin Jane' },
  },
  {
    id: 3,
    description: 'Printer Cartridges',
    category: 'office_supplies',
    amount: 45.0,
    date: '2026-10-17T09:30:00Z',
    paymentMethod: 'cash',
    recordedBy: { name: 'Staff John' },
  },
];

function renderExportButtons(props = {}) {
  const store = configureStore({
    reducer: {
      auth: (state = { user: { id: 1, name: 'Admin Jane', organizationName: 'Zana Stores' } }) => state,
      settings: (state = { defaultCurrency: 'KES', currencySymbol: 'KSh' }) => state,
      shop: (state = { currentShop: { id: 1, name: 'Mombasa Road Branch' } }) => state,
    },
  });

  const defaultProps = {
    expenses: mockPaginatedExpenses,
    formatCurrency: (val) => `KSh ${Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    filters: { category: 'utilities', startDate: '2026-10-01', endDate: '2026-10-31' },
    total: 3, // Total is 3, but paginated is only 1
    periodTotal: 275.0,
  };

  return render(
    <Provider store={store}>
      <ExportButtons {...defaultProps} {...props} />
    </Provider>
  );
}

describe('ExportButtons Component UDDS Phase 2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.print = jest.fn();
    expensesAPI.getAll.mockResolvedValue({
      data: {
        expenses: mockFullExpenses,
        total: 3,
      },
    });
  });

  test('renders all 4 export and print action buttons with accessible titles', () => {
    renderExportButtons();

    expect(screen.getByTitle('Export CSV')).toBeInTheDocument();
    expect(screen.getByTitle('Export Excel')).toBeInTheDocument();
    expect(screen.getByTitle('Export PDF')).toBeInTheDocument();
    expect(screen.getByTitle('Print Expenses')).toBeInTheDocument();
  });

  test('fetches full dataset when total > expenses.length before exporting CSV', async () => {
    renderExportButtons();

    const csvBtn = screen.getByTitle('Export CSV');
    fireEvent.click(csvBtn);

    // Verify expensesAPI.getAll was called to fetch the full dataset
    await waitFor(() => {
      expect(expensesAPI.getAll).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'utilities',
          page: 1,
          limit: 500,
        })
      );
    });

    await waitFor(() => {
      expect(downloadCSV).toHaveBeenCalledTimes(1);
    });

    const [filename, rows] = downloadCSV.mock.calls[0];
    expect(filename).toMatch(/^expenses-.*\.csv$/);
    // 3 expenses + 1 TOTAL summary row = 4 rows
    expect(rows.length).toBe(4);
    expect(rows[rows.length - 1].Date).toBe('TOTAL');
    expect(rows[rows.length - 1].Amount).toBe('275.00');
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/exported 3 expense records to csv/i));
  });

  test('proves complete multi-page pagination when exporting 1,500 expenses across 3 pages', async () => {
    // Generate 1,500 mock expenses
    const createMockBatch = (startId, count) =>
      Array.from({ length: count }, (_, i) => ({
        id: startId + i,
        description: `Expense item ${startId + i}`,
        category: 'operations',
        amount: 100.0,
        date: '2026-10-15T10:00:00Z',
        paymentMethod: 'mpesa',
        recordedBy: { name: 'Admin Jane' },
      }));

    const batch1 = createMockBatch(1, 500);
    const batch2 = createMockBatch(501, 500);
    const batch3 = createMockBatch(1001, 500);

    expensesAPI.getAll
      .mockResolvedValueOnce({ data: { expenses: batch1, total: 1500, totalPages: 3, currentPage: 1 } })
      .mockResolvedValueOnce({ data: { expenses: batch2, total: 1500, totalPages: 3, currentPage: 2 } })
      .mockResolvedValueOnce({ data: { expenses: batch3, total: 1500, totalPages: 3, currentPage: 3 } });

    renderExportButtons({ total: 1500, expenses: batch1.slice(0, 10) });

    const csvBtn = screen.getByTitle('Export CSV');
    fireEvent.click(csvBtn);

    await waitFor(() => {
      expect(expensesAPI.getAll).toHaveBeenCalledTimes(3);
    });

    expect(expensesAPI.getAll).toHaveBeenNthCalledWith(1, expect.objectContaining({ page: 1, limit: 500 }));
    expect(expensesAPI.getAll).toHaveBeenNthCalledWith(2, expect.objectContaining({ page: 2, limit: 500 }));
    expect(expensesAPI.getAll).toHaveBeenNthCalledWith(3, expect.objectContaining({ page: 3, limit: 500 }));

    await waitFor(() => {
      expect(downloadCSV).toHaveBeenCalledTimes(1);
    });

    const [, rows] = downloadCSV.mock.calls[0];
    // 1,500 records + 1 TOTAL row = 1,501 rows!
    expect(rows.length).toBe(1501);
    expect(rows[1500].Date).toBe('TOTAL');
    expect(rows[1500].Amount).toBe('150000.00');
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/exported 1500 expense records to csv/i));
  });

  test('exports Excel with authoritative business identity, metadata, and formatted summary', async () => {
    renderExportButtons();

    const excelBtn = screen.getByTitle('Export Excel');
    fireEvent.click(excelBtn);

    await waitFor(() => {
      expect(generateExcel).toHaveBeenCalledTimes(1);
    });

    const excelCall = generateExcel.mock.calls[0][0];
    expect(excelCall.title).toBe('Expense Management Report');
    expect(excelCall.data.length).toBe(3); // All 3 fetched records
    expect(excelCall.totalsRow.date).toBe('TOTAL');
    expect(excelCall.totalsRow.amount).toBe(275);
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/exported 3 expense records to excel/i));
  });

  test('exports PDF with metric summary cards (Total Expenses, Count, Average, Top Category)', async () => {
    renderExportButtons();

    const pdfBtn = screen.getByTitle('Export PDF');
    fireEvent.click(pdfBtn);

    await waitFor(() => {
      expect(generatePDF).toHaveBeenCalledTimes(1);
    });

    const pdfCall = generatePDF.mock.calls[0][0];
    expect(pdfCall.title).toBe('Expense Management Report');
    expect(pdfCall.summaryCards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Total Expenses' }),
        expect.objectContaining({ label: 'Transaction Count', value: 3 }),
        expect.objectContaining({ label: 'Average Expense' }),
        expect.objectContaining({ label: 'Top Category' }),
      ])
    );
    expect(pdfCall.data.length).toBe(3);
    expect(pdfCall.totalsRow.date).toBe('TOTAL');
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/exported 3 expense records to pdf/i));
  });

  test('print button fetches full records and triggers window.print()', async () => {
    renderExportButtons();

    const printBtn = screen.getByTitle('Print Expenses');
    fireEvent.click(printBtn);

    await waitFor(() => {
      expect(expensesAPI.getAll).toHaveBeenCalled();
      expect(window.print).toHaveBeenCalled();
    });
  });

  test('shows error toast when expenses array is empty and total is 0', async () => {
    renderExportButtons({ expenses: [], total: 0 });

    const csvBtn = screen.getByTitle('Export CSV');
    fireEvent.click(csvBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('No expense records to export');
      expect(downloadCSV).not.toHaveBeenCalled();
    });
  });
});
