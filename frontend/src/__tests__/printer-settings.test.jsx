import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import authReducer from '../store/slices/authSlice';
import shopReducer from '../store/slices/shopSlice';
import settingsReducer from '../store/slices/settingsSlice';
import PrinterSettingsPanel from '../components/printing/PrinterSettingsPanel';
import { ADAPTERS } from '../printing/adapters';
import { STORAGE_KEY } from '../printing/profile';

// Three adapter states: usable (bluetooth), registered but unsupported on this device (usb),
// and not registered at all (serial, network -> "Coming soon").
jest.mock('../printing/adapters', () => {
  const make = (id, label, supported) => ({ id, label, isSupported: () => supported, print: jest.fn().mockResolvedValue() });
  return {
    ADAPTERS: {
      browser: make('browser', 'Browser / system printer', true),
      bluetooth: make('bluetooth', 'Bluetooth printer', true),
      usb: make('usb', 'USB printer', false),
    },
    FALLBACK_ADAPTER_ID: 'browser',
  };
});

const shop = { name: 'Mama Njeri Supermarket', address: 'Moi Avenue', phone: '0700 000 000', kraPin: 'P000000000X' };

function renderPanel({ withShop = true, settings = {} } = {}) {
  const store = configureStore({
    reducer: combineReducers({ auth: authReducer, shop: shopReducer, settings: settingsReducer }),
    preloadedState: {
      ...(withShop ? { shop: { ...shopReducer(undefined, { type: '@@init' }), shop } } : {}),
      settings: { ...settingsReducer(undefined, { type: '@@init' }), ...settings },
    },
  });
  return render(
    <Provider store={store}>
      <PrinterSettingsPanel />
    </Provider>
  );
}

const stored = () => JSON.parse(window.localStorage.getItem(STORAGE_KEY));
const radio = (name) => screen.getByRole('radio', { name });

beforeEach(() => {
  window.localStorage.clear();
  Object.values(ADAPTERS).forEach((a) => a.print.mockReset().mockResolvedValue());
});

describe('PrinterSettingsPanel', () => {
  it('starts on the safe defaults: browser printing on 58 mm paper', () => {
    renderPanel();
    expect(radio(/Browser \/ system printer/)).toBeChecked();
    expect(radio(/^58 mm/)).toBeChecked();
    expect(screen.getByTestId('receipt-preview')).toHaveAttribute('data-columns', '32');
  });

  it('only enables connection types this device can actually use', () => {
    renderPanel();
    expect(radio(/Bluetooth printer/)).toBeEnabled();
    expect(radio(/USB printer/)).toBeDisabled();
    expect(screen.getByText('Not supported on this device')).toBeInTheDocument();
    expect(radio(/Serial/)).toBeDisabled();
    expect(radio(/Network/)).toBeDisabled();
    expect(screen.getAllByText('Coming soon')).toHaveLength(2);
  });

  it('saves changes to this device immediately and resizes the preview', () => {
    renderPanel();
    fireEvent.click(radio(/^80 mm/));
    expect(stored().paperWidth).toBe(80);
    expect(screen.getByTestId('receipt-preview')).toHaveAttribute('data-columns', '48');
  });

  it('greys out cutter/drawer options for browser printing and enables them for direct printing', () => {
    renderPanel();
    expect(screen.getByLabelText('Paper cutter')).toBeDisabled();
    expect(screen.getByRole('switch', { name: /open cash drawer/i })).toBeDisabled();

    fireEvent.click(radio(/Bluetooth printer/));
    expect(stored().connection).toBe('bluetooth');
    expect(screen.getByLabelText('Paper cutter')).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Paper cutter'), { target: { value: 'none' } });
    fireEvent.change(screen.getByLabelText('Blank lines after the receipt'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('switch', { name: /open cash drawer/i }));
    expect(stored()).toMatchObject({ cut: 'none', feedLines: 5, openDrawer: true });
  });

  it('loads the profile saved on this device', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ connection: 'bluetooth', paperWidth: 80, cut: 'full', openDrawer: true, feedLines: 2 })
    );
    renderPanel();
    expect(radio(/Bluetooth printer/)).toBeChecked();
    expect(radio(/^80 mm/)).toBeChecked();
    expect(screen.getByLabelText('Paper cutter')).toHaveValue('full');
    expect(screen.getByRole('switch', { name: /open cash drawer/i })).toBeChecked();
  });

  it('warns when the saved connection is not available on this device', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ connection: 'serial' }));
    renderPanel();
    expect(screen.getByRole('alert')).toHaveTextContent(/isn't available on this device/);
  });

  it('previews with the shop details, or a placeholder name before the shop is set up', () => {
    const { unmount } = renderPanel();
    expect(within(screen.getByTestId('receipt-preview')).getByText(/Mama Njeri/)).toBeInTheDocument();
    unmount();
    renderPanel({ withShop: false });
    expect(within(screen.getByTestId('receipt-preview')).getByText(/Your Shop/)).toBeInTheDocument();
  });

  it('restores the defaults', () => {
    renderPanel();
    fireEvent.click(radio(/^80 mm/));
    fireEvent.click(radio(/Bluetooth printer/));
    fireEvent.click(screen.getByRole('button', { name: 'Restore defaults' }));
    expect(radio(/Browser \/ system printer/)).toBeChecked();
    expect(radio(/^58 mm/)).toBeChecked();
    expect(stored()).toMatchObject({ connection: 'browser', paperWidth: 58 });
  });

  describe('Print test receipt', () => {
    it('sends a sample receipt through the selected printer', async () => {
      renderPanel();
      fireEvent.click(radio(/Bluetooth printer/));
      fireEvent.click(screen.getByRole('button', { name: /print test receipt/i }));

      expect(await screen.findByRole('status')).toHaveTextContent('Test receipt sent using Bluetooth printer.');
      expect(ADAPTERS.bluetooth.print).toHaveBeenCalledTimes(1);
      const job = ADAPTERS.bluetooth.print.mock.calls[0][0];
      expect(job.text()).toContain('TEST-0001');
      expect(job.text()).toContain('Mama Njeri');
      expect(ADAPTERS.browser.print).not.toHaveBeenCalled();
    });

    it('tests with the paper width currently selected', async () => {
      renderPanel();
      fireEvent.click(radio(/^80 mm/));
      fireEvent.click(screen.getByRole('button', { name: /print test receipt/i }));
      await screen.findByRole('status');
      const job = ADAPTERS.browser.print.mock.calls[0][0];
      expect(job.profile.paperWidth).toBe(80);
    });

    it('explains when it had to fall back to the browser', async () => {
      ADAPTERS.bluetooth.print.mockRejectedValue(new Error('Printer not paired'));
      renderPanel();
      fireEvent.click(radio(/Bluetooth printer/));
      fireEvent.click(screen.getByRole('button', { name: /print test receipt/i }));

      const status = await screen.findByRole('status');
      await waitFor(() => expect(status).toHaveTextContent(/could not be reached/i));
      expect(status).toHaveTextContent('Printer not paired');
      expect(ADAPTERS.browser.print).toHaveBeenCalledTimes(1);
    });

    it('reports failure when nothing can print', async () => {
      ADAPTERS.browser.print.mockRejectedValue(new Error('print dialog blocked'));
      renderPanel();
      fireEvent.click(screen.getByRole('button', { name: /print test receipt/i }));
      expect(await screen.findByRole('status')).toHaveTextContent('Could not print the test receipt: print dialog blocked');
    });

    it('clears the old result when a setting changes', async () => {
      renderPanel();
      fireEvent.click(screen.getByRole('button', { name: /print test receipt/i }));
      await screen.findByRole('status');
      fireEvent.click(radio(/^80 mm/));
      expect(screen.queryByRole('status')).toBeNull();
    });
  });

  describe('shop-wide receipt header, footer and logo', () => {
    const receiptSettings = {
      receiptHeader: 'Welcome to Mama Njeri!\nOpen daily 8am - 8pm',
      receiptFooter: 'Please come again!',
      showLogoOnReceipt: true,
      businessLogo: '/uploads/logos/a.png',
    };

    it('shows them in the preview', () => {
      renderPanel({ settings: receiptSettings });
      const preview = screen.getByTestId('receipt-preview');
      expect(within(preview).getByText('Welcome to Mama Njeri!')).toBeInTheDocument();
      expect(within(preview).getByText(/Open daily 8am - 8pm/)).toBeInTheDocument();
      expect(within(preview).getByText('Please come again!')).toBeInTheDocument();
      expect(within(preview).queryByText(/Thank you for your business/)).toBeNull();
      expect(within(preview).getByAltText('Business logo').getAttribute('src')).toMatch(/\/uploads\/logos\/a\.png$/);
    });

    it('hides the logo when "show logo" is off, and shows the default footer when none is set', () => {
      renderPanel({ settings: { ...receiptSettings, showLogoOnReceipt: false, receiptFooter: '' } });
      const preview = screen.getByTestId('receipt-preview');
      expect(within(preview).queryByAltText('Business logo')).toBeNull();
      expect(within(preview).getByText(/Thank you for your business/)).toBeInTheDocument();
    });

    it('prints them on the test receipt', async () => {
      renderPanel({ settings: receiptSettings });
      fireEvent.click(radio(/Bluetooth printer/));
      fireEvent.click(screen.getByRole('button', { name: /print test receipt/i }));
      await screen.findByRole('status');

      const job = ADAPTERS.bluetooth.print.mock.calls[0][0];
      expect(job.text()).toContain('Welcome to Mama Njeri!');
      expect(job.text()).toContain('Please come again!');
      expect(job.html()).toContain('<img src=');
    });

    it('explains that logos only print through the browser for now', () => {
      renderPanel({ settings: receiptSettings });
      expect(screen.queryByText(/logo prints with browser printing only/i)).toBeNull();
      fireEvent.click(radio(/Bluetooth printer/));
      expect(screen.getByText(/logo prints with browser printing only/i)).toBeInTheDocument();
    });
  });
});
