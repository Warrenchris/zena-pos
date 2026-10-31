import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import authReducer from '../store/slices/authSlice';
import shopReducer from '../store/slices/shopSlice';
import settingsReducer from '../store/slices/settingsSlice';
import SaleCompleteModal from '../components/SaleCompleteModal';
import SaleDetailModal from '../components/SaleDetailModal';
import { ToastProvider } from '../components/Toast';
import { browserPrintAdapter } from '../printing/adapters/browserPrintAdapter';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({ data: { refunds: [] } }),
    post: jest.fn(),
  },
}));

// jsdom has no ResizeObserver, required by Headless UI Modal/Dialog
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe('Receipt Business Details Flow - Real Redux Store Shape Integration', () => {
  let capturedHtml = null;
  let printSpy = null;

  beforeEach(() => {
    window.localStorage.clear();
    capturedHtml = null;
    printSpy = jest.spyOn(browserPrintAdapter, 'print').mockImplementation(async (job) => {
      capturedHtml = job.html();
      return { ok: true };
    });
  });

  afterEach(() => {
    if (printSpy) {
      printSpy.mockRestore();
    }
  });

  // REAL Redux store shape:
  // - state.auth.user.shop is populated
  // - state.shop.shop is strictly null
  // - state.settings is populated
  function createRealStore() {
    return configureStore({
      reducer: combineReducers({
        auth: authReducer,
        shop: shopReducer,
        settings: settingsReducer,
      }),
      preloadedState: {
        auth: {
          user: {
            id: 1,
            name: 'Cashier Jane',
            role: 'cashier',
            shop: {
              name: 'SokoSafi Fresh',
              branch: 'Westlands Branch',
              address: 'Ring Road Parklands',
              phone: '0712 345 678',
              kraPin: 'P051234567X',
            },
          },
          shop: null,
          token: 'mock-jwt-token',
          isAuthenticated: true,
        },
        shop: {
          shop: null,
          loading: false,
          error: null,
        },
        settings: {
          systemName: 'Zana POS System',
          tagline: 'Better Products · Brighter Together',
          showPoweredBy: true,
          qrEnabled: false,
        },
      },
    });
  }

  it('Path (a): Online sale via SaleCompleteModal renders store name, branch, address, Tel and PIN', async () => {
    const store = createRealStore();

    // Standard online completedSale with NO hand-built business object
    const onlineCompletedSale = {
      id: 101,
      receiptNumber: 'R-D4E1-000042',
      invoiceNumber: 'INV-2026-0042',
      createdAt: '2026-10-31T10:00:00.000Z',
      cashierName: 'Cashier Jane',
      customer: { name: 'Peter Karanja' },
      items: [
        { id: 1, name: 'Maize Flour 2kg', price: 290, quantity: 2 },
      ],
      subtotal: 580,
      tax: 0,
      total: 580,
      paymentMethod: 'cash',
      paymentAmount: 600,
      change: 20,
    };

    render(
      <Provider store={store}>
        <ToastProvider>
          <SaleCompleteModal
            completedSale={onlineCompletedSale}
            onNewSale={jest.fn()}
            onClose={jest.fn()}
          />
        </ToastProvider>
      </Provider>
    );

    fireEvent.click(screen.getByText('Print Receipt'));

    await waitFor(() => expect(browserPrintAdapter.print).toHaveBeenCalledTimes(1));
    expect(capturedHtml).toBeTruthy();

    // Assert that the rendered receipt HTML contains all required business details
    expect(capturedHtml).toContain('SOKOSAFI FRESH');
    expect(capturedHtml).toContain('Westlands Branch');
    expect(capturedHtml).toContain('Ring Road Parklands');
    expect(capturedHtml).toContain('0712 345 678');
    expect(capturedHtml).toContain('P051234567X');
  });

  it('Path (b): Offline sale via SaleCompleteModal renders store name, branch, address, Tel and PIN', async () => {
    const store = createRealStore();

    // Offline completedSale with NO hand-built business object
    const offlineCompletedSale = {
      id: 'offline_777',
      isOffline: true,
      receiptNumber: 'R-OFFL-000077',
      createdAt: '2026-10-31T10:15:00.000Z',
      cashierName: 'Cashier Jane',
      customer: { name: 'Walk-in Customer' },
      items: [
        { id: 2, name: 'Cooking Oil 1L', price: 350, quantity: 1 },
      ],
      subtotal: 350,
      tax: 0,
      total: 350,
      paymentMethod: 'cash',
      paymentAmount: 400,
      change: 50,
    };

    render(
      <Provider store={store}>
        <ToastProvider>
          <SaleCompleteModal
            completedSale={offlineCompletedSale}
            onNewSale={jest.fn()}
            onClose={jest.fn()}
          />
        </ToastProvider>
      </Provider>
    );

    fireEvent.click(screen.getByText('Print Receipt'));

    await waitFor(() => expect(browserPrintAdapter.print).toHaveBeenCalledTimes(1));
    expect(capturedHtml).toBeTruthy();

    expect(capturedHtml).toContain('SOKOSAFI FRESH');
    expect(capturedHtml).toContain('Westlands Branch');
    expect(capturedHtml).toContain('Ring Road Parklands');
    expect(capturedHtml).toContain('0712 345 678');
    expect(capturedHtml).toContain('P051234567X');
    expect(capturedHtml).toContain('OFFLINE SALE');
    expect(capturedHtml).toContain('PENDING SYNC');
  });

  it('Path (c): Reprint via SaleDetailModal renders store name, branch, address, Tel, PIN and DUPLICATE COPY', async () => {
    const store = createRealStore();

    // Server-stored sale record with NO hand-built business object
    const storedSale = {
      id: 202,
      receiptNumber: 'R-D4E1-000042',
      invoiceNumber: 'INV-2026-0042',
      createdAt: '2026-10-31T09:00:00.000Z',
      total: 580,
      paymentMethod: 'cash',
      SaleItems: [
        {
          id: 1,
          quantity: 2,
          price: 290,
          Product: { name: 'Maize Flour 2kg', price: 290 },
        },
      ],
    };

    render(
      <Provider store={store}>
        <ToastProvider>
          <SaleDetailModal
            sale={storedSale}
            isOpen={true}
            onClose={jest.fn()}
          />
        </ToastProvider>
      </Provider>
    );

    const printButton = screen.getByRole('button', { name: /print/i });
    fireEvent.click(printButton);

    await waitFor(() => expect(browserPrintAdapter.print).toHaveBeenCalledTimes(1));
    expect(capturedHtml).toBeTruthy();

    expect(capturedHtml).toContain('SOKOSAFI FRESH');
    expect(capturedHtml).toContain('Westlands Branch');
    expect(capturedHtml).toContain('Ring Road Parklands');
    expect(capturedHtml).toContain('0712 345 678');
    expect(capturedHtml).toContain('P051234567X');
    expect(capturedHtml).toContain('DUPLICATE COPY');
  });

  it('Path (d): Offline sale reprint via SaleDetailModal renders store details, offline banner, and DUPLICATE COPY', async () => {
    const store = createRealStore();

    // Offline stored sale record with NO hand-built business object
    const offlineStoredSale = {
      id: 'offline_888',
      isOffline: true,
      receiptNumber: 'R-OFFL-000088',
      createdAt: '2026-10-31T09:30:00.000Z',
      total: 350,
      paymentMethod: 'cash',
      SaleItems: [
        {
          id: 2,
          quantity: 1,
          price: 350,
          Product: { name: 'Cooking Oil 1L', price: 350 },
        },
      ],
    };

    render(
      <Provider store={store}>
        <ToastProvider>
          <SaleDetailModal
            sale={offlineStoredSale}
            isOpen={true}
            onClose={jest.fn()}
          />
        </ToastProvider>
      </Provider>
    );

    const printButton = screen.getByRole('button', { name: /print/i });
    fireEvent.click(printButton);

    await waitFor(() => expect(browserPrintAdapter.print).toHaveBeenCalledTimes(1));
    expect(capturedHtml).toBeTruthy();

    expect(capturedHtml).toContain('SOKOSAFI FRESH');
    expect(capturedHtml).toContain('Westlands Branch');
    expect(capturedHtml).toContain('Ring Road Parklands');
    expect(capturedHtml).toContain('0712 345 678');
    expect(capturedHtml).toContain('P051234567X');
    expect(capturedHtml).toContain('OFFLINE SALE');
    expect(capturedHtml).toContain('PENDING SYNC');
    expect(capturedHtml).toContain('DUPLICATE COPY');
  });
});
