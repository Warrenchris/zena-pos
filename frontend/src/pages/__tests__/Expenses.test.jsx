import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import Expenses from '../Expenses';
import { expensesAPI } from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  expensesAPI: {
    getAll: jest.fn(),
    getStatistics: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../../hooks/useCurrency', () => ({
  __esModule: true,
  default: () => ({
    format: (v) => `$${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  }),
}));

jest.mock('../../hooks/usePermissions', () => ({
  __esModule: true,
  usePermissions: () => ({
    hasPermission: () => true,
  }),
}));

jest.mock('../../utils/toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock recharts ResponsiveContainer
jest.mock('recharts', () => {
  const OriginalModule = jest.requireActual('recharts');
  return {
    ...OriginalModule,
    ResponsiveContainer: ({ children }) => <div className="recharts-mock">{children}</div>,
  };
});

const mockExpenses = [
  {
    id: 1,
    description: 'Office Electricity Bill',
    category: 'utilities',
    amount: 145.5,
    date: '2026-10-15T10:00:00Z',
    paymentMethod: 'bank_transfer',
    recordedBy: { name: 'Admin Jane' },
  },
  {
    id: 2,
    description: 'Store Cleaning Services',
    category: 'maintenance',
    amount: 60.0,
    date: '2026-10-16T14:30:00Z',
    paymentMethod: 'cash',
    recordedBy: { name: 'Staff John' },
  },
];

const mockStats = {
  totalExpenses: 205.5,
  categoryBreakdown: [
    { category: 'utilities', total: 145.5 },
    { category: 'maintenance', total: 60.0 },
  ],
  monthlyTrend: [
    { month: '2026-10-01', total: 205.5 },
  ],
};

function renderExpensesComponent() {
  const store = configureStore({
    reducer: {
      auth: (state = { user: { id: 1, name: 'Admin Jane', role: 'admin' }, token: 'mock-token' }) => state,
    },
  });

  return render(
    <Provider store={store}>
      <MemoryRouter>
        <Expenses />
      </MemoryRouter>
    </Provider>
  );
}

describe('Expenses Page UI & Consistency Audit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    expensesAPI.getAll.mockResolvedValue({
      data: {
        expenses: mockExpenses,
        total: 2,
        page: 1,
        limit: 10,
      },
    });
    expensesAPI.getStatistics.mockResolvedValue({
      data: mockStats,
    });
  });

  test('renders page header, KPI cards, filters, and table with records', async () => {
    renderExpensesComponent();

    // Verify PageHeader
    expect(screen.getByText('Expense Management')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add expense/i })).toBeInTheDocument();

    // Verify KPI summary metrics
    await waitFor(() => {
      expect(screen.getByText('$205.50')).toBeInTheDocument();
    });
    expect(screen.getByText('Expense Categories')).toBeInTheDocument();
    expect(screen.getByText('Months Tracked')).toBeInTheDocument();

    // Verify Expense Records table
    await waitFor(() => {
      expect(screen.getByText('Office Electricity Bill')).toBeInTheDocument();
      expect(screen.getByText('Store Cleaning Services')).toBeInTheDocument();
    });

    expect(screen.getByText('$145.50')).toBeInTheDocument();
    expect(screen.getByText('$60.00')).toBeInTheDocument();
    expect(screen.getByText('utilities')).toBeInTheDocument();
    expect(screen.getByText('maintenance')).toBeInTheDocument();
  });

  test('opens Add Expense modal with accessible fields and proper styling', async () => {
    renderExpensesComponent();

    const addBtn = screen.getByRole('button', { name: /add expense/i });
    fireEvent.click(addBtn);

    // Modal appears
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText(/description/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/amount/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/category/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/payment method/i)).toBeInTheDocument();

    // Cancel modal
    const cancelBtn = within(dialog).getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  test('opens Delete Expense confirmation modal', async () => {
    renderExpensesComponent();

    await waitFor(() => {
      expect(screen.getByText('Office Electricity Bill')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByLabelText(/delete expense/i);
    expect(deleteButtons.length).toBeGreaterThan(0);
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument();
    });
  });

  test('handles empty expense state gracefully', async () => {
    expensesAPI.getAll.mockResolvedValueOnce({
      data: {
        expenses: [],
        total: 0,
      },
    });

    renderExpensesComponent();

    await waitFor(() => {
      expect(screen.getByText('No expenses found')).toBeInTheDocument();
    });
  });

  test('updates filters and triggers reload', async () => {
    renderExpensesComponent();

    await waitFor(() => {
      expect(screen.getByText('Office Electricity Bill')).toBeInTheDocument();
    });

    const categoryFilter = screen.getByLabelText(/^category$/i);
    fireEvent.change(categoryFilter, { target: { value: 'salary' } });

    await waitFor(() => {
      expect(expensesAPI.getAll).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'salary',
        })
      );
    });
  });
});
