import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PublicReceiptView from '../pages/PublicReceiptView';
import settingsReducer from '../store/slices/settingsSlice';
import api from '../services/api';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

describe('PublicReceiptView Integration', () => {
  const createTestStore = () =>
    configureStore({
      reducer: {
        settings: settingsReducer,
      },
    });

  const mockReceiptData = {
    documentType: 'SALES_RECEIPT',
    business: {
      name: 'Soko Safi Fresh',
      branch: 'Main Branch',
      address: 'Moi Avenue, Nairobi',
      phone: '+254 712 345 678',
      kraPin: 'P051234567X',
      tagline: 'Quality Products, Everyday Low Prices',
      showPoweredBy: true,
      logoUrl: null,
    },
    meta: {
      receiptNumber: 'R-TD9M-000002',
      invoiceNumber: '20261031-0003',
      dateTime: '2026-10-31T10:10:45.000Z',
      paymentLabel: 'Cash',
    },
    lines: [
      { name: 'Mineral Water 500ml', quantity: 1, unitPrice: 50, lineTotal: 50 },
    ],
    totals: {
      subtotal: 43.1,
      discount: 0,
      tax: { amount: 6.9, rate: 16, inclusive: true },
      total: 50,
      tendered: 50,
      change: 0,
    },
    header: '',
    footer: 'Thank you for your business!',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls api.get with baseURL and renders receipt details in an iframe', async () => {
    api.get.mockResolvedValueOnce({ data: mockReceiptData });

    render(
      <Provider store={createTestStore()}>
        <MemoryRouter initialEntries={['/r/tXwq-0XJu8HMdUAwja2cNQ']}>
          <Routes>
            <Route path="/r/:token" element={<PublicReceiptView />} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/public/receipts/tXwq-0XJu8HMdUAwja2cNQ');
    });

    // Wait for receipt to settle and render buttons
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /80mm/i })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /58mm/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();

    // Verify iframe contains the rendered HTML with shop name and receipt number
    const iframe = screen.getByTitle('Public Receipt');
    expect(iframe).toBeInTheDocument();
    expect(iframe.getAttribute('srcDoc')).toContain('SOKO SAFI FRESH');
    expect(iframe.getAttribute('srcDoc')).toContain('R-TD9M-000002');
  });

  it('renders "Receipt Unavailable" when api.get returns 404', async () => {
    const error404 = new Error('Not found');
    error404.response = { status: 404 };
    api.get.mockRejectedValueOnce(error404);

    render(
      <Provider store={createTestStore()}>
        <MemoryRouter initialEntries={['/r/unknown-token']}>
          <Routes>
            <Route path="/r/:token" element={<PublicReceiptView />} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Receipt Unavailable/i)).toBeInTheDocument();
    });

    expect(
      screen.getByText(/This receipt may not be available yet/i)
    ).toBeInTheDocument();
  });
});
