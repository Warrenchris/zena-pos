import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import api from '../services/api';
import EmployeeDetailsCard from '../components/EmployeeDetailsCard';
import CustomerDetailsCard from '../components/CustomerDetailsCard';

jest.mock('../services/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../hooks/useCurrency', () => ({
  __esModule: true,
  default: () => ({ format: (n) => `KES ${Number(n || 0).toLocaleString()}` }),
}));
jest.mock('../components/SaleDetailModal', () => ({ __esModule: true, default: () => null }));

const employee = {
  id: 'e1', firstName: 'Amina', lastName: 'Otieno', status: 'active',
  email: 'amina@example.com', phone: '0700000000', salary: 50000, position: 'Cashier',
};
const customer = { id: 'c1', name: 'John Mwangi', email: 'john@example.com', phone: '0711111111' };

const employeeProfile = {
  employee,
  stats: { totalRevenue: 125000, totalSales: 42, averageSaleValue: 2976, firstSaleDate: null, lastSaleDate: null },
  salesHistory: [{ id: 's1', invoiceNumber: 'INV-001', createdAt: '2026-10-01', itemCount: 3, paymentMethod: 'cash', total: 1500 }],
  topProducts: [{ productId: 'p1', name: 'Bread', timesSold: 9, totalQuantity: 12, totalRevenue: 840 }],
  pagination: { currentPage: 1, totalPages: 2, totalSales: 8 },
};
const customerProfile = {
  customer,
  stats: { totalSpend: 9000, totalOrders: 4, averageOrderValue: 2250, firstOrderDate: null, lastOrderDate: null },
  favorites: [{ productId: 'p1', name: 'Milk', price: 60, timesPurchased: 5 }],
  orders: [{ id: 'o1', invoiceNumber: 'INV-9', createdAt: '2026-10-02', itemCount: 2, paymentMethod: 'mpesa', total: 300 }],
  pagination: { currentPage: 1, totalPages: 1, totalOrders: 1 },
};

// Class names that would make text unreadable in light mode if they came back.
const LEGACY_IN_DOM = /\b(?:text-gray-\d+|text-yellow-\d+|bg-brand-(?:black|gray)|text-brand-yellow)\b/;

beforeEach(() => jest.clearAllMocks());

describe('EmployeeDetailsCard', () => {
  test('renders profile data using theme tokens', async () => {
    api.get.mockResolvedValue({ data: employeeProfile });
    const { container } = render(<EmployeeDetailsCard employee={employee} onClose={() => {}} />);

    expect(await screen.findByText('Amina Otieno')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('INV-001')).toBeInTheDocument());
    expect(screen.getByText('Bread')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/api/employees/e1?page=1&limit=5');

    expect(container.innerHTML).not.toMatch(LEGACY_IN_DOM);
    expect(container.querySelector('.bg-surface')).not.toBeNull();
    // active status badge uses the status tokens, not hardcoded emerald/red
    expect(screen.getByText('ACTIVE').className).toMatch(/text-success-text/);
  });

  test('inactive employee gets the danger badge', async () => {
    api.get.mockResolvedValue({ data: { ...employeeProfile, employee: { ...employee, status: 'inactive' } } });
    render(<EmployeeDetailsCard employee={{ ...employee, status: 'inactive' }} onClose={() => {}} />);
    const badge = await screen.findByText('INACTIVE');
    expect(badge.className).toMatch(/text-danger-text/);
  });

  test('Escape and Close Profile both call onClose', async () => {
    api.get.mockResolvedValue({ data: employeeProfile });
    const onClose = jest.fn();
    render(<EmployeeDetailsCard employee={employee} onClose={onClose} />);
    await screen.findByText('Amina Otieno');
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByText('Close Profile'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test('survives an API failure without crashing', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    api.get.mockRejectedValue(new Error('boom'));
    render(<EmployeeDetailsCard employee={employee} onClose={() => {}} />);
    expect(await screen.findByText('Amina Otieno')).toBeInTheDocument();
    console.error.mockRestore();
  });
});

describe('CustomerDetailsCard', () => {
  const mount = (onClose = () => {}) =>
    render(
      <MemoryRouter>
        <CustomerDetailsCard customer={customer} onClose={onClose} />
      </MemoryRouter>,
    );

  test('renders profile data using theme tokens', async () => {
    api.get.mockResolvedValue({ data: customerProfile });
    const { container } = mount();

    expect(await screen.findByText('John Mwangi')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Milk')).toBeInTheDocument());
    expect(api.get).toHaveBeenCalledWith('/api/customers/c1?page=1&limit=5');

    expect(container.innerHTML).not.toMatch(LEGACY_IN_DOM);
    expect(container.querySelector('.bg-surface')).not.toBeNull();
  });

  test('Escape calls onClose', async () => {
    api.get.mockResolvedValue({ data: customerProfile });
    const onClose = jest.fn();
    mount(onClose);
    await screen.findByText('John Mwangi');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  test('survives an API failure without crashing', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    api.get.mockRejectedValue(new Error('boom'));
    mount();
    expect(await screen.findByText('John Mwangi')).toBeInTheDocument();
    console.error.mockRestore();
  });
});
