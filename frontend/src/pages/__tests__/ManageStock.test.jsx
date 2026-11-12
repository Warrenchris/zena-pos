import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import ManageStock from '../ManageStock';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    patch: jest.fn(),
  },
}));

jest.mock('../../hooks/useCurrency', () => ({
  __esModule: true,
  default: () => ({
    format: (v) => `KSh ${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  }),
}));

jest.mock('../../components/Toast', () => ({
  useToast: () => ({
    showToast: jest.fn(),
  }),
}));

const renderWithProviders = (ui) => {
  const store = configureStore({
    reducer: {
      settings: (state = { settings: { lowStockThreshold: 10 } }) => state,
    },
  });
  return render(
    <Provider store={store}>
      <MemoryRouter>
        {ui}
      </MemoryRouter>
    </Provider>
  );
};

describe('ManageStock Multi-Page Pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches all products across 3 pages and renders and counts all of them', async () => {
    const page1Products = [
      { id: 1, name: 'Product Page 1 A', sku: 'P1A', stockQuantity: 10, reorderPoint: 5, cost: 50, price: 100 },
      { id: 2, name: 'Product Page 1 B', sku: 'P1B', stockQuantity: 20, reorderPoint: 5, cost: 50, price: 100 },
    ];
    const page2Products = [
      { id: 3, name: 'Product Page 2 A', sku: 'P2A', stockQuantity: 15, reorderPoint: 5, cost: 50, price: 100 },
      { id: 4, name: 'Product Page 2 B', sku: 'P2B', stockQuantity: 25, reorderPoint: 5, cost: 50, price: 100 },
    ];
    const page3Products = [
      { id: 5, name: 'Product Page 3 A', sku: 'P3A', stockQuantity: 30, reorderPoint: 5, cost: 50, price: 100 },
      { id: 6, name: 'Product Page 3 B', sku: 'P3B', stockQuantity: 40, reorderPoint: 5, cost: 50, price: 100 },
    ];

    api.get.mockImplementation((url, config) => {
      if (url === '/api/products') {
        const page = config?.params?.page || 1;
        if (page === 1) {
          return Promise.resolve({
            data: {
              products: page1Products,
              pagination: { currentPage: 1, totalPages: 3, total: 6 },
            },
          });
        }
        if (page === 2) {
          return Promise.resolve({
            data: {
              products: page2Products,
              pagination: { currentPage: 2, totalPages: 3, total: 6 },
            },
          });
        }
        if (page === 3) {
          return Promise.resolve({
            data: {
              products: page3Products,
              pagination: { currentPage: 3, totalPages: 3, total: 6 },
            },
          });
        }
      }
      return Promise.reject(new Error(`Unhandled GET url: ${url}`));
    });

    renderWithProviders(<ManageStock />);

    // Wait for data to load and assert all 3 page requests occurred
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(3);
    });

    expect(api.get).toHaveBeenNthCalledWith(1, '/api/products', { params: { page: 1, pageSize: 100 } });
    expect(api.get).toHaveBeenNthCalledWith(2, '/api/products', { params: { page: 2, pageSize: 100 } });
    expect(api.get).toHaveBeenNthCalledWith(3, '/api/products', { params: { page: 3, pageSize: 100 } });

    // Assert every product from all 3 pages is rendered in the table
    expect(await screen.findByText('Product Page 1 A')).toBeInTheDocument();
    expect(screen.getByText('Product Page 1 B')).toBeInTheDocument();
    expect(screen.getByText('Product Page 2 A')).toBeInTheDocument();
    expect(screen.getByText('Product Page 2 B')).toBeInTheDocument();
    expect(screen.getByText('Product Page 3 A')).toBeInTheDocument();
    expect(screen.getByText('Product Page 3 B')).toBeInTheDocument();

    // Total stock count: 10 + 20 + 15 + 25 + 30 + 40 = 140 units
    expect(screen.getByText('140 units')).toBeInTheDocument();
  });
});

