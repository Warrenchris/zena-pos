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
    total: 3,
    periodTotal: 275.0,
  };

  return render(
    <Provider store={store}>
      <ExportButtons {...defaultProps} {...props} />
    </Provider>
  );
}

describe('ExportButtons Component UDDS Phase 2 - Pagination & Integrity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    downloadCSV.mockReset();
    generateExcel.mockReset();
    generatePDF.mockReset();
    generateExcel.mockResolvedValue({ success: true });
    generatePDF.mockResolvedValue({ success: true });
    toast.success.mockReset();
    toast.error.mockReset();
    window.print = jest.fn();
    expensesAPI.getAll.mockReset();
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

  // 1. 0 expenses
  test('handles 0 expenses: does not call API and alerts user via toast', async () => {
    renderExportButtons({ expenses: [], total: 0 });

    const csvBtn = screen.getByTitle('Export CSV');
    fireEvent.click(csvBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('No expense records to export');
      expect(expensesAPI.getAll).not.toHaveBeenCalled();
      expect(downloadCSV).not.toHaveBeenCalled();
    });
  });

  // 2. 1 expense
  test('handles 1 expense: exports directly without extra API call if already loaded', async () => {
    renderExportButtons({ expenses: [mockPaginatedExpenses[0]], total: 1 });

    const csvBtn = screen.getByTitle('Export CSV');
    fireEvent.click(csvBtn);

    await waitFor(() => {
      expect(downloadCSV).toHaveBeenCalledTimes(1);
    });

    expect(expensesAPI.getAll).not.toHaveBeenCalled();
    const [, rows] = downloadCSV.mock.calls[0];
    expect(rows.length).toBe(2); // 1 record + 1 TOTAL row
    expect(rows[0].Description).toBe('Electricity Bill');
  });

  // 3. 499 expenses
  test('handles 499 expenses: retrieves full dataset in 1 page call', async () => {
    const batch499 = createMockBatch(1, 499);
    expensesAPI.getAll.mockResolvedValueOnce({
      data: { expenses: batch499, total: 499, totalPages: 1, currentPage: 1 },
    });

    renderExportButtons({ total: 499, expenses: batch499.slice(0, 10) });

    const csvBtn = screen.getByTitle('Export CSV');
    fireEvent.click(csvBtn);

    await waitFor(() => {
      expect(expensesAPI.getAll).toHaveBeenCalledTimes(1);
      expect(downloadCSV).toHaveBeenCalledTimes(1);
    });

    const [, rows] = downloadCSV.mock.calls[0];
    expect(rows.length).toBe(500); // 499 records + 1 TOTAL row
  });

  // 4. 500 expenses
  test('handles exactly 500 expenses in a single full page', async () => {
    const batch500 = createMockBatch(1, 500);
    expensesAPI.getAll.mockResolvedValueOnce({
      data: { expenses: batch500, total: 500, totalPages: 1, currentPage: 1 },
    });

    renderExportButtons({ total: 500, expenses: batch500.slice(0, 10) });

    const csvBtn = screen.getByTitle('Export CSV');
    fireEvent.click(csvBtn);

    await waitFor(() => {
      expect(expensesAPI.getAll).toHaveBeenCalledTimes(1);
      expect(downloadCSV).toHaveBeenCalledTimes(1);
    });

    const [, rows] = downloadCSV.mock.calls[0];
    expect(rows.length).toBe(501); // 500 records + 1 TOTAL row
  });

  // 5. 501 expenses
  test('handles 501 expenses: retrieves across 2 pages (500 + 1)', async () => {
    const batch500 = createMockBatch(1, 500);
    const batch1 = createMockBatch(501, 1);

    expensesAPI.getAll
      .mockResolvedValueOnce({ data: { expenses: batch500, total: 501, totalPages: 2, currentPage: 1 } })
      .mockResolvedValueOnce({ data: { expenses: batch1, total: 501, totalPages: 2, currentPage: 2 } });

    renderExportButtons({ total: 501, expenses: batch500.slice(0, 10) });

    const csvBtn = screen.getByTitle('Export CSV');
    fireEvent.click(csvBtn);

    await waitFor(() => {
      expect(expensesAPI.getAll).toHaveBeenCalledTimes(2);
      expect(downloadCSV).toHaveBeenCalledTimes(1);
    });

    const [, rows] = downloadCSV.mock.calls[0];
    expect(rows.length).toBe(502); // 501 records + 1 TOTAL row
  });

  // 6. 1,500 expenses
  test('handles 1,500 expenses across 3 standard 500-record pages', async () => {
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
      expect(downloadCSV).toHaveBeenCalledTimes(1);
    });

    const [, rows] = downloadCSV.mock.calls[0];
    expect(rows.length).toBe(1501);
  });

  // 7. Critical test: Backend effective page size smaller than requested (100 per page for 1,500 total)
  test('CRITICAL: retrieves all 1,500 records across 15 pages when backend caps page size at 100 without prematurely stopping', async () => {
    // Mock 15 consecutive calls, each returning 100 records
    for (let p = 1; p <= 15; p++) {
      const startId = (p - 1) * 100 + 1;
      const batch = createMockBatch(startId, 100);
      expensesAPI.getAll.mockResolvedValueOnce({
        data: {
          expenses: batch,
          total: 1500,
          totalPages: 15,
          currentPage: p,
        },
      });
    }

    renderExportButtons({ total: 1500, expenses: mockPaginatedExpenses });

    const csvBtn = screen.getByTitle('Export CSV');
    fireEvent.click(csvBtn);

    await waitFor(() => {
      // Must query through all 15 pages, not break at page 1!
      expect(expensesAPI.getAll).toHaveBeenCalledTimes(15);
      expect(downloadCSV).toHaveBeenCalledTimes(1);
    });

    const [, rows] = downloadCSV.mock.calls[0];
    // 1,500 records + 1 TOTAL summary row = 1,501 rows
    expect(rows.length).toBe(1501);
    expect(rows[0].Description).toBe('Expense item 1');
    expect(rows[1499].Description).toBe('Expense item 1500');
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/exported 1500 expense records to csv/i));
  });

  // 8. Missing pagination metadata
  test('handles missing pagination metadata gracefully by paging until an empty page returns', async () => {
    const page1 = createMockBatch(1, 20);
    const page2 = createMockBatch(21, 10);

    expensesAPI.getAll
      .mockResolvedValueOnce({ data: { expenses: page1 } }) // No total, no totalPages
      .mockResolvedValueOnce({ data: { expenses: page2 } })
      .mockResolvedValueOnce({ data: { expenses: [] } }); // Empty page indicates end

    renderExportButtons({ total: null, expenses: page1.slice(0, 5) });

    const csvBtn = screen.getByTitle('Export CSV');
    fireEvent.click(csvBtn);

    await waitFor(() => {
      expect(expensesAPI.getAll).toHaveBeenCalledTimes(3);
      expect(downloadCSV).toHaveBeenCalledTimes(1);
    });

    const [, rows] = downloadCSV.mock.calls[0];
    expect(rows.length).toBe(31); // 30 records + 1 TOTAL
  });

  // 9. API failure on page two
  test('aborts export and displays clear error toast when page 2 fails, without partial export', async () => {
    const page1 = createMockBatch(1, 500);

    expensesAPI.getAll
      .mockResolvedValueOnce({ data: { expenses: page1, total: 1000, totalPages: 2, currentPage: 1 } })
      .mockRejectedValueOnce(new Error('Network timeout on page 2'));

    renderExportButtons({ total: 1000, expenses: page1.slice(0, 10) });

    const csvBtn = screen.getByTitle('Export CSV');
    fireEvent.click(csvBtn);

    await waitFor(() => {
      expect(expensesAPI.getAll).toHaveBeenCalledTimes(2);
      expect(downloadCSV).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/failed to retrieve expenses on page 2/i));
    });
  });

  // 10. API failure on final page
  test('aborts export when final page fails, preventing partial document generation', async () => {
    const page1 = createMockBatch(1, 500);
    const page2 = createMockBatch(501, 500);

    expensesAPI.getAll
      .mockResolvedValueOnce({ data: { expenses: page1, total: 1500, totalPages: 3, currentPage: 1 } })
      .mockResolvedValueOnce({ data: { expenses: page2, total: 1500, totalPages: 3, currentPage: 2 } })
      .mockRejectedValueOnce(new Error('500 Internal Server Error'));

    renderExportButtons({ total: 1500, expenses: page1.slice(0, 10) });

    const excelBtn = screen.getByTitle('Export Excel');
    fireEvent.click(excelBtn);

    await waitFor(() => {
      expect(expensesAPI.getAll).toHaveBeenCalledTimes(3);
      expect(generateExcel).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/failed to retrieve expenses on page 3/i));
    });
  });

  // 11. Duplicate records across pages
  test('deduplicates duplicate records returned across pages due to concurrent offset shifts', async () => {
    const page1 = [
      { id: 101, description: 'Item A', amount: 50, date: '2026-10-01' },
      { id: 102, description: 'Item B', amount: 75, date: '2026-10-02' },
    ];
    // Page 2 repeats Item B due to offset shift
    const page2 = [
      { id: 102, description: 'Item B', amount: 75, date: '2026-10-02' },
      { id: 103, description: 'Item C', amount: 100, date: '2026-10-03' },
    ];

    expensesAPI.getAll
      .mockResolvedValueOnce({ data: { expenses: page1, total: 3, totalPages: 2, currentPage: 1 } })
      .mockResolvedValueOnce({ data: { expenses: page2, total: 3, totalPages: 2, currentPage: 2 } });

    renderExportButtons({ total: 3, expenses: [page1[0]] });

    const csvBtn = screen.getByTitle('Export CSV');
    fireEvent.click(csvBtn);

    await waitFor(() => {
      expect(downloadCSV).toHaveBeenCalledTimes(1);
    });

    const [, rows] = downloadCSV.mock.calls[0];
    // Item B should not be duplicated; exactly 3 unique items + 1 TOTAL = 4 rows
    expect(rows.length).toBe(4);
    expect(rows.filter((r) => r.Description === 'Item B').length).toBe(1);
  });

  // 12. Changing totals during pagination
  test('adapts to changing total metadata during pagination', async () => {
    const page1 = createMockBatch(1, 500);
    const page2 = createMockBatch(501, 502); // 502 records on page 2 (total grew to 1002)

    expensesAPI.getAll
      .mockResolvedValueOnce({ data: { expenses: page1, total: 1000, totalPages: 2, currentPage: 1 } })
      .mockResolvedValueOnce({ data: { expenses: page2, total: 1002, totalPages: 2, currentPage: 2 } });

    renderExportButtons({ total: 1000, expenses: page1.slice(0, 10) });

    const csvBtn = screen.getByTitle('Export CSV');
    fireEvent.click(csvBtn);

    await waitFor(() => {
      expect(downloadCSV).toHaveBeenCalledTimes(1);
    });

    const [, rows] = downloadCSV.mock.calls[0];
    expect(rows.length).toBe(1003); // 1,002 records + 1 TOTAL
  });

  // 13. Format parity test: PDF, Excel, and CSV use the exact same dataset
  describe('Format Parity: identical resolved dataset across all 3 formats', () => {
    const fullDataset = createMockBatch(1, 3);

    test('CSV export receives complete 3 items', async () => {
      expensesAPI.getAll.mockResolvedValueOnce({
        data: { expenses: fullDataset, total: 3, totalPages: 1, currentPage: 1 },
      });
      renderExportButtons({ total: 3, expenses: [fullDataset[0]] });
      fireEvent.click(screen.getByTitle('Export CSV'));

      await waitFor(() => expect(downloadCSV).toHaveBeenCalledTimes(1));
      const [, csvRows] = downloadCSV.mock.calls[0];
      expect(csvRows.length).toBe(4); // 3 items + TOTAL
      expect(csvRows[0].Description).toBe('Expense item 1');
      expect(csvRows[1].Description).toBe('Expense item 2');
      expect(csvRows[2].Description).toBe('Expense item 3');
    });

    test('Excel export receives identical 3 items', async () => {
      expensesAPI.getAll.mockResolvedValueOnce({
        data: { expenses: fullDataset, total: 3, totalPages: 1, currentPage: 1 },
      });
      renderExportButtons({ total: 3, expenses: [fullDataset[0]] });
      fireEvent.click(screen.getByTitle('Export Excel'));

      await waitFor(() => expect(generateExcel).toHaveBeenCalledTimes(1));
      const excelCall = generateExcel.mock.calls[0][0];
      expect(excelCall.data.length).toBe(3);
      expect(excelCall.totalsRow.amount).toBe(300);
      expect(excelCall.data[0].description).toBe('Expense item 1');
      expect(excelCall.data[1].description).toBe('Expense item 2');
      expect(excelCall.data[2].description).toBe('Expense item 3');
    });

    test('PDF export receives identical 3 items', async () => {
      expensesAPI.getAll.mockResolvedValueOnce({
        data: { expenses: fullDataset, total: 3, totalPages: 1, currentPage: 1 },
      });
      renderExportButtons({ total: 3, expenses: [fullDataset[0]] });
      fireEvent.click(screen.getByTitle('Export PDF'));

      await waitFor(() => expect(generatePDF).toHaveBeenCalledTimes(1));
      const pdfCall = generatePDF.mock.calls[0][0];
      expect(pdfCall.data.length).toBe(3);
      expect(pdfCall.summaryCards.find((c) => c.label === 'Transaction Count').value).toBe(3);
      expect(pdfCall.data[0].description).toBe('Expense item 1');
      expect(pdfCall.data[1].description).toBe('Expense item 2');
      expect(pdfCall.data[2].description).toBe('Expense item 3');
    });
  });

  test('print button resolves all records, sets printRecords, and triggers window.print()', async () => {
    renderExportButtons({ total: 3, expenses: [mockPaginatedExpenses[0]] });

    const printBtn = screen.getByTitle('Print Expenses');
    fireEvent.click(printBtn);

    await waitFor(() => {
      expect(expensesAPI.getAll).toHaveBeenCalled();
      expect(window.print).toHaveBeenCalled();
    });
  });
});
