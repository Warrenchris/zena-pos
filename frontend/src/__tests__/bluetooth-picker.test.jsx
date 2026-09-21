import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import authReducer from '../store/slices/authSlice';
import shopReducer from '../store/slices/shopSlice';
import settingsReducer from '../store/slices/settingsSlice';
import PrinterSettingsPanel from '../components/printing/PrinterSettingsPanel';
import { STORAGE_KEY } from '../printing/profile';

// These tests use the REAL adapters and a fake native plugin behind window.Capacitor.

const PRINTER = { name: 'MHT-P58', address: '66:32:AB:CD:EF:01', isPrinter: true };
const PHONE = { name: 'Janes Phone', address: 'AA:BB:CC:DD:EE:02', isPrinter: false };
const decode = (b64) => Array.from(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

function makePlugin(overrides = {}) {
  return {
    requestBluetoothPermission: jest.fn().mockResolvedValue({ granted: true }),
    isBluetoothEnabled: jest.fn().mockResolvedValue({ available: true, enabled: true }),
    getPairedDevices: jest.fn().mockResolvedValue({ devices: [PHONE, PRINTER] }),
    isConnected: jest.fn().mockResolvedValue({ connected: false }),
    connect: jest.fn().mockResolvedValue({ connected: true }),
    write: jest.fn().mockResolvedValue({ written: 1 }),
    disconnect: jest.fn().mockResolvedValue(),
    openBluetoothSettings: jest.fn().mockResolvedValue(),
    ...overrides,
  };
}

function installAndroid(plugin) {
  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    isPluginAvailable: () => true,
    registerPlugin: () => plugin,
  };
}

function renderPanel() {
  const store = configureStore({
    reducer: combineReducers({ auth: authReducer, shop: shopReducer, settings: settingsReducer }),
    preloadedState: { shop: { ...shopReducer(undefined, { type: '@@init' }), shop: { name: 'Mama Njeri Supermarket' } } },
  });
  return render(
    <Provider store={store}>
      <PrinterSettingsPanel />
    </Provider>
  );
}

const stored = () => JSON.parse(window.localStorage.getItem(STORAGE_KEY));
const radio = (name) => screen.getByRole('radio', { name });

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  delete window.Capacitor;
});

describe('in a normal browser', () => {
  it('offers browser printing and explains that Bluetooth needs the Android app', () => {
    renderPanel();
    expect(radio(/Browser \/ system printer/)).toBeEnabled();
    expect(radio(/Bluetooth printer/)).toBeDisabled();
    expect(screen.getByText('Available in the Android app')).toBeInTheDocument();
    expect(screen.queryByText('Which Bluetooth printer?')).toBeNull();
  });
});

describe('in the Android app', () => {
  it('starts on Bluetooth and disables browser printing, which does not work in the app', async () => {
    installAndroid(makePlugin());
    renderPanel();
    expect(radio(/Bluetooth printer/)).toBeChecked();
    expect(radio(/Browser \/ system printer/)).toBeDisabled();
    expect(screen.getByText('Not available in the Android app')).toBeInTheDocument();
    expect(await screen.findByText('MHT-P58')).toBeInTheDocument();
  });

  it('lists paired devices with likely printers first and saves the chosen one', async () => {
    installAndroid(makePlugin());
    renderPanel();

    await screen.findByText('MHT-P58');
    const names = screen.getAllByRole('radio', { name: /MHT-P58|Janes Phone/ }).map((r) => r.value);
    expect(names).toEqual([PRINTER.address, PHONE.address]);

    fireEvent.click(radio(/MHT-P58/));
    expect(stored()).toMatchObject({ connection: 'bluetooth', printerAddress: PRINTER.address, printerName: 'MHT-P58' });
    expect(radio(/MHT-P58/)).toBeChecked();
  });

  it('shows the printer saved on this device as selected', async () => {
    installAndroid(makePlugin());
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ connection: 'bluetooth', printerAddress: PRINTER.address, printerName: 'MHT-P58' })
    );
    renderPanel();
    await screen.findByText('MHT-P58');
    expect(radio(/MHT-P58/)).toBeChecked();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('warns when the saved printer is no longer paired', async () => {
    installAndroid(makePlugin({ getPairedDevices: jest.fn().mockResolvedValue({ devices: [PHONE] }) }));
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ connection: 'bluetooth', printerAddress: PRINTER.address, printerName: 'MHT-P58' })
    );
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent(/MHT-P58 isn't paired with this device any more/);
  });

  it('explains how to pair when nothing is paired, and Refresh picks up a newly paired printer', async () => {
    const plugin = makePlugin({
      getPairedDevices: jest.fn().mockResolvedValueOnce({ devices: [] }).mockResolvedValue({ devices: [PRINTER] }),
    });
    installAndroid(plugin);
    renderPanel();

    expect(await screen.findByText(/No paired devices found/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    expect(await screen.findByText('MHT-P58')).toBeInTheDocument();
    expect(screen.queryByText(/No paired devices found/)).toBeNull();
  });

  it('explains a denied permission and a switched-off Bluetooth', async () => {
    installAndroid(makePlugin({ requestBluetoothPermission: jest.fn().mockResolvedValue({ granted: false }) }));
    const { unmount } = renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent(/permission was denied/i);
    unmount();

    installAndroid(makePlugin({ isBluetoothEnabled: jest.fn().mockResolvedValue({ available: true, enabled: false }) }));
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Bluetooth is turned off/);
  });

  it('shows plugin errors instead of failing silently', async () => {
    installAndroid(makePlugin({ getPairedDevices: jest.fn().mockRejectedValue(new Error('Bluetooth is disabled')) }));
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent('Bluetooth is disabled');
  });

  it('opens Android Bluetooth settings so a new printer can be paired', async () => {
    const plugin = makePlugin();
    installAndroid(plugin);
    renderPanel();
    await screen.findByText('MHT-P58');
    fireEvent.click(screen.getByRole('button', { name: /Open Bluetooth settings/ }));
    expect(plugin.openBluetoothSettings).toHaveBeenCalledTimes(1);
  });

  describe('Print test receipt', () => {
    const chooseAndPrint = async () => {
      await screen.findByText('MHT-P58');
      fireEvent.click(radio(/MHT-P58/));
      fireEvent.click(screen.getByRole('button', { name: /print test receipt/i }));
    };

    it('sends the receipt to the chosen printer as ESC/POS bytes', async () => {
      const plugin = makePlugin();
      installAndroid(plugin);
      renderPanel();
      await chooseAndPrint();

      expect(await screen.findByRole('status')).toHaveTextContent('Test receipt sent using Bluetooth printer.');
      expect(plugin.connect).toHaveBeenCalledWith({ address: PRINTER.address });
      const { data, address } = plugin.write.mock.calls[0][0];
      expect(address).toBe(PRINTER.address);
      const bytes = decode(data);
      expect(bytes.slice(0, 2)).toEqual([0x1b, 0x40]); // ESC @ (initialize)
      expect(String.fromCharCode(...bytes.filter((b) => b >= 0x20 && b < 0x7f))).toContain('TEST-0001');
      expect(bytes.slice(-3)).toEqual([0x1d, 0x56, 0x01]); // partial cut
    });

    it('reports the reason when the printer cannot be reached; there is no browser fallback in the app', async () => {
      installAndroid(makePlugin({ connect: jest.fn().mockRejectedValue(new Error('Could not connect to the printer.')) }));
      renderPanel();
      await chooseAndPrint();
      expect(await screen.findByRole('status')).toHaveTextContent(
        'Could not print the test receipt: MHT-P58: Could not connect to the printer.'
      );
    });

    it('asks for a printer to be chosen when none is selected yet', async () => {
      installAndroid(makePlugin());
      renderPanel();
      await screen.findByText('MHT-P58');
      fireEvent.click(screen.getByRole('button', { name: /print test receipt/i }));
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/No Bluetooth printer selected/));
    });
  });
});
