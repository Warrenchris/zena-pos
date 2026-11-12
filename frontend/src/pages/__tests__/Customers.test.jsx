import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import Customers from '../Customers';
import customersReducer from '../../store/slices/customersSlice';
import settingsReducer from '../../store/slices/settingsSlice';
import { customersAPI } from '../../services/api';
import { ToastProvider } from '../../components/Toast';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn() },
  customersAPI: { getAll: jest.fn(), getStatistics: jest.fn() },
}));

const row = {
  id: 1,
  name: 'aggy',
  email: null,
  phone: '0877343434',
  location: 'Kisumu',
  totalPurchases: '11990.00',
  loyaltyPoints: 3550,
  lastVisit: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000).toISOString(),
};

function renderPage() {
  const store = configureStore({
    reducer: { customers: customersReducer, settings: settingsReducer },
  });
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <ToastProvider>
          <Customers />
        </ToastProvider>
      </MemoryRouter>
    </Provider>
  );
}

beforeEach(() => {
  customersAPI.getAll.mockResolvedValue({
    data: {
      customers: [row],
      total: 25,
      totalPages: 3,
      currentPage: 1,
    },
  });
  customersAPI.getStatistics.mockResolvedValue({
    data: { totalCustomers: 40, activeCustomers: 7, totalSpent: 1000 },
  });
});

test('reads flat pagination and opens add and edit dialogs with the customer', async () => {
  renderPage();

  expect(await screen.findByText('aggy')).toBeInTheDocument();
  expect(screen.getByText('Kisumu')).toBeInTheDocument();
  expect(screen.queryByText('No email')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: '0877343434' })).toHaveAttribute('href', 'tel:0877343434');
  expect(screen.getByText('40 days ago')).toBeInTheDocument();
  expect(screen.getByText('Inactive')).toBeInTheDocument();
  expect(screen.getByText('Bought in 30 days')).toBeInTheDocument();
  expect(await screen.findByText('KSh 1,000.00')).toBeInTheDocument();
  expect(screen.getByText('7')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'New Sale' })).toBeInTheDocument();
  expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
  expect(screen.getByText('25')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /next/i })).toBeEnabled();
  expect(customersAPI.getAll).toHaveBeenCalledWith(
    expect.objectContaining({ page: 1, limit: 10, search: '' })
  );

  fireEvent.click(screen.getByRole('button', { name: /add customer/i }));
  expect(await screen.findByRole('heading', { name: /customer account information/i })).toBeInTheDocument();

  fireEvent.click(screen.getByTitle('Edit Customer'));
  expect(await screen.findByRole('heading', { name: /edit customer/i })).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Enter customer name')).toHaveValue('aggy');
});
