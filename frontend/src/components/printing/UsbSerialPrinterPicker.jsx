import React, { useState } from 'react';
import { Cog6ToothIcon } from '@heroicons/react/24/outline';
import Button from '../ui/Button';
import { SERIAL_BAUD_RATES } from '../../printing';

const messageOf = (error) => (error && error.message) || 'Something went wrong.';

/**
 * Pick which USB printer (Chrome's device picker, by vendor/product id) or which serial port
 * (Chrome's port picker) this device prints to. Both need a one-time user gesture, so a chooser
 * dialog can't be triggered from anywhere except a click - hence the two buttons below.
 */
export default function UsbSerialPrinterPicker({ connection, profile, onSelect }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const pickUsbDevice = async () => {
    setError(null);
    setBusy(true);
    try {
      const device = await navigator.usb.requestDevice({ filters: [{}] });
      onSelect({ usbVendorId: device.vendorId, usbProductId: device.productId, usbSerialNumber: device.serialNumber || '' });
    } catch (err) {
      // The user closing the picker without choosing anything is not an error worth showing.
      if (err?.name !== 'NotFoundError') setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const pickSerialPort = async () => {
    setError(null);
    setBusy(true);
    try {
      await navigator.serial.requestPort();
      onSelect({}); // nothing to store: the adapter uses whichever port was just granted
    } catch (err) {
      if (err?.name !== 'NotFoundError') setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  if (connection === 'usb') {
    const hasSelection = profile.usbVendorId !== null && profile.usbProductId !== null;
    return (
      <fieldset className="space-y-2">
        <legend className="block text-small font-semibold text-text-primary mb-1.5">Which USB printer?</legend>
        <p className="text-caption text-text-muted">
          {hasSelection
            ? `A USB printer is selected (device ${profile.usbVendorId.toString(16).padStart(4, '0')}:${profile.usbProductId
                .toString(16)
                .padStart(4, '0')}).`
            : 'No USB printer selected yet.'}
        </p>
        {error && (
          <p role="alert" className="text-caption text-warning-text">
            {error}
          </p>
        )}
        <Button type="button" variant="secondary" size="sm" leftIcon={Cog6ToothIcon} loading={busy} onClick={pickUsbDevice}>
          {hasSelection ? 'Choose a different USB printer' : 'Select USB printer'}
        </Button>
      </fieldset>
    );
  }

  if (connection === 'serial') {
    return (
      <fieldset className="space-y-2">
        <legend className="block text-small font-semibold text-text-primary mb-1.5">Which serial port?</legend>
        <p className="text-caption text-text-muted">
          Grant access to one serial or COM port and this device will use it. If more than one port is granted, printing is
          refused until only one is left.
        </p>
        {error && (
          <p role="alert" className="text-caption text-warning-text">
            {error}
          </p>
        )}
        <Button type="button" variant="secondary" size="sm" leftIcon={Cog6ToothIcon} loading={busy} onClick={pickSerialPort}>
          Select serial port
        </Button>
        <div>
          <label htmlFor="serial-baud-rate" className="block text-caption font-semibold text-text-secondary mb-1">
            Baud rate
          </label>
          <select
            id="serial-baud-rate"
            value={profile.serialBaudRate}
            onChange={(e) => onSelect({ serialBaudRate: Number(e.target.value) })}
            className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          >
            {SERIAL_BAUD_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate}
              </option>
            ))}
          </select>
          <p className="text-caption text-text-muted mt-1">Check your printer&apos;s manual - 9600 is the most common default.</p>
        </div>
      </fieldset>
    );
  }

  return null;
}
