import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import authReducer from '../store/slices/authSlice';
import shopReducer from '../store/slices/shopSlice';
import settingsReducer from '../store/slices/settingsSlice';
import SaleCompleteModal from '../components/SaleCompleteModal';
import { printReceipt } from '../printing';

jest.mock('../printing', () => ({ ...jest.requireActual('../printing'), printReceipt: jest.fn() }));

const shop = { name: 'Mama Njeri Supermarket', address: 'Moi Avenue', phone: '0700 000 000', kraPin: 'P000000000X' };

const completedSale = {
  serverData: { invoiceNumber: 'INV-77' },
  items: [{ id: 1, name: 'Sugar', price: 150, quantity: 2 }],
  customer: { name: 'Jane' },
  total: 300,
  paymentMethod: 'cash',
  paymentAmount: 500,
  change: 200,
};

function renderModal({ onClose = jest.fn(), settings = {} } = {}) {
  const store = configureStore({
    reducer: combineReducers({ auth: authReducer, shop: shopReducer, settings: settingsReducer }),
    preloadedState: {
      shop: { ...shopReducer(undefined, { type: '@@init' }), shop },
      settings: { ...settingsReducer(undefined, { type: '@@init' }), ...settings },
    },
  });
  return render(
    <Provider store={store}>
      <SaleCompleteModal completedSale={completedSale} onNewSale={jest.fn()} onClose={onClose} />
    </Provider>
  );
}

// jsdom has no ResizeObserver, which Headless UI's Dialog needs.
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  window.localStorage.clear();
  printReceipt.mockReset();
  window.showToast = jest.fn();
});

afterEach(() => {
  delete window.showToast;
});

describe('SaleCompleteModal printing', () => {
  it('prints through the printing service with the shop as receipt header', async () => {
    printReceipt.mockResolvedValue({ ok: true, adapterId: 'browser', fellBack: false });
    renderModal();

    fireEvent.click(screen.getByText('Print Receipt'));

    await waitFor(() => expect(printReceipt).toHaveBeenCalledTimes(1));
    const [sale, options] = printReceipt.mock.calls[0];
    expect(sale).toBe(completedSale);
    expect(options.business).toEqual(shop);
    expect(options.formatMoney(150)).toContain('150');
    expect(window.showToast).not.toHaveBeenCalled();
  });

  it('prints with the shop-wide receipt header, footer and logo from Settings', async () => {
    printReceipt.mockResolvedValue({ ok: true, adapterId: 'browser', fellBack: false });
    renderModal({
      settings: {
        receiptHeader: 'Welcome to Mama Njeri!',
        receiptFooter: 'Please come again!',
        showLogoOnReceipt: true,
        businessLogo: '/uploads/logos/a.png',
      },
    });

    fireEvent.click(screen.getByText('Print Receipt'));

    await waitFor(() => expect(printReceipt).toHaveBeenCalledTimes(1));
    const { receiptSettings } = printReceipt.mock.calls[0][1];
    expect(receiptSettings).toMatchObject({
      header: 'Welcome to Mama Njeri!',
      footer: 'Please come again!',
      showLogo: true,
    });
    expect(receiptSettings.logoUrl).toMatch(/\/uploads\/logos\/a\.png$/);
  });

  it('respects the "show logo" switch being off', async () => {
    printReceipt.mockResolvedValue({ ok: true, adapterId: 'browser', fellBack: false });
    renderModal({ settings: { showLogoOnReceipt: false, businessLogo: '/uploads/logos/a.png' } });
    fireEvent.click(screen.getByText('Print Receipt'));
    await waitFor(() => expect(printReceipt).toHaveBeenCalledTimes(1));
    expect(printReceipt.mock.calls[0][1].receiptSettings.showLogo).toBe(false);
  });

  it('warns the cashier when it had to fall back to browser printing', async () => {
    printReceipt.mockResolvedValue({ ok: true, adapterId: 'browser', fellBack: true, error: 'not paired' });
    renderModal();
    fireEvent.click(screen.getByText('Print Receipt'));
    await waitFor(() => expect(window.showToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning' })));
  });

  it('shows an error toast when printing fails, without blocking the sale screen', async () => {
    printReceipt.mockResolvedValue({ ok: false, adapterId: null, fellBack: false, error: 'no printer' });
    renderModal();
    fireEvent.click(screen.getByText('Print Receipt'));
    await waitFor(() =>
      expect(window.showToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', message: 'no printer' }))
    );
    expect(screen.getByText('New Sale')).toBeInTheDocument();
  });

  it('no longer renders the old whole-page print area', () => {
    renderModal();
    expect(document.getElementById('pos-receipt-print-area')).toBeNull();
  });

  describe('printer settings shortcut', () => {
    it('opens printer settings without closing the sale screen', async () => {
      const onClose = jest.fn();
      renderModal({ onClose });

      fireEvent.click(screen.getByText('Printer settings'));
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Paper width')).toBeInTheDocument();

      // Clicking inside the dialog must not bubble to the sale screen's backdrop (onClose).
      fireEvent.click(screen.getByRole('radio', { name: /^80 mm/ }));
      expect(onClose).not.toHaveBeenCalled();
      expect(JSON.parse(window.localStorage.getItem('zana.printerProfile.v1')).paperWidth).toBe(80);
    });

    it('closes the dialog and returns to the sale screen', async () => {
      renderModal();
      fireEvent.click(screen.getByText('Printer settings'));
      await screen.findByRole('dialog');

      fireEvent.click(screen.getByLabelText('Close modal'));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(screen.getByText('New Sale')).toBeInTheDocument();
    });
  });
});
