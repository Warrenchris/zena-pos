/* eslint-env jest */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import authReducer from '../store/slices/authSlice';
import shopReducer from '../store/slices/shopSlice';
import settingsReducer from '../store/slices/settingsSlice';
import PrinterSettingsPanel from '../components/printing/PrinterSettingsPanel';
import { STORAGE_KEY } from '../printing/profile';

// Real adapters this time, with navigator.usb / navigator.serial faked underneath.

const shop = { name: 'Mama Njeri Supermarket' };
const radio = (name) => screen.getByRole('radio', { name });
const stored = () => JSON.parse(window.localStorage.getItem(STORAGE_KEY));

function renderPanel() {
  const store = configureStore({
    reducer: combineReducers({ auth: authReducer, shop: shopReducer, settings: settingsReducer }),
    preloadedState: { shop: { ...shopReducer(undefined, { type: '@@init' }), shop } },
  });
  return render(
    <Provider store={store}>
      <PrinterSettingsPanel />
    </Provider>
  );
}

const installSecure = () => Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });

beforeEach(() => {
  window.localStorage.clear();
  installSecure();
  delete window.navigator.usb;
  delete window.navigator.serial;
});

describe('USB printing, in the settings panel', () => {
  it('is disabled without navigator.usb, with a clear reason', () => {
    renderPanel();
    expect(radio(/USB printer/)).toBeDisabled();
    expect(screen.getByText(/This browser does not support USB printing/)).toBeInTheDocument();
  });

  it('lets the user pick a device once navigator.usb exists, and saves the chosen device', async () => {
    const device = { vendorId: 0x0483, productId: 0x5743, serialNumber: 'SN1' };
    window.navigator.usb = { requestDevice: jest.fn().mockResolvedValue(device), getDevices: jest.fn().mockResolvedValue([device]) };
    renderPanel();

    fireEvent.click(radio(/USB printer/));
    expect(await screen.findByText('No USB printer selected yet.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Select USB printer' }));

    await waitFor(() => expect(stored()).toMatchObject({ usbVendorId: 0x0483, usbProductId: 0x5743, usbSerialNumber: 'SN1' }));
    expect(await screen.findByText(/A USB printer is selected/)).toBeInTheDocument();
  });

  it('does not show an error when the user simply closes the device picker', async () => {
    window.navigator.usb = { requestDevice: jest.fn().mockRejectedValue(Object.assign(new Error('cancelled'), { name: 'NotFoundError' })) };
    renderPanel();
    fireEvent.click(radio(/USB printer/));
    fireEvent.click(await screen.findByRole('button', { name: 'Select USB printer' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('alert', { name: '' })).toBeNull();
  });
});

describe('Serial printing, in the settings panel', () => {
  it('is disabled without navigator.serial', () => {
    renderPanel();
    expect(radio(/Serial \/ COM port printer/)).toBeDisabled();
  });

  it('lets the user grant a port and pick a baud rate', async () => {
    window.navigator.serial = { requestPort: jest.fn().mockResolvedValue({}), getPorts: jest.fn().mockResolvedValue([{}]) };
    renderPanel();

    fireEvent.click(radio(/Serial \/ COM port printer/));
    fireEvent.click(await screen.findByRole('button', { name: 'Select serial port' }));
    await waitFor(() => expect(window.navigator.serial.requestPort).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Baud rate'), { target: { value: '19200' } });
    expect(stored().serialBaudRate).toBe(19200);
  });
});
