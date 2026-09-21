import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowPathIcon, Cog6ToothIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import Button from '../ui/Button';
import { getNativeBluetoothPlugin } from '../../printing';

const byPrinterThenName = (a, b) =>
  Number(b.isPrinter) - Number(a.isPrinter) || String(a.name).localeCompare(String(b.name));

const messageOf = (error) => (error && error.message) || 'Something went wrong talking to Bluetooth.';

/**
 * Pick which paired Bluetooth printer this device prints to (Android app only).
 *
 * Lists the devices already paired in Android's Bluetooth settings. Pairing itself
 * happens in Android (there's a shortcut button), so no Bluetooth scanning, and no
 * location permission, is needed here.
 */
export default function BluetoothPrinterPicker({ selectedAddress, selectedName, onSelect }) {
  const [state, setState] = useState({ status: 'loading', devices: [], error: null });
  const mounted = useRef(true);

  const load = useCallback(async () => {
    const plugin = getNativeBluetoothPlugin();
    if (!plugin) {
      setState({ status: 'error', devices: [], error: 'Bluetooth printing is only available in the Android app.' });
      return;
    }
    setState((prev) => ({ ...prev, status: 'loading', error: null }));
    try {
      const { granted } = await plugin.requestBluetoothPermission();
      if (!granted) {
        throw new Error('Bluetooth permission was denied. Allow "Nearby devices" for this app in Android settings.');
      }
      const { enabled } = await plugin.isBluetoothEnabled();
      if (!enabled) throw new Error('Bluetooth is turned off. Turn it on, then tap Refresh.');
      const { devices } = await plugin.getPairedDevices();
      if (mounted.current) setState({ status: 'ready', devices: [...devices].sort(byPrinterThenName), error: null });
    } catch (error) {
      if (mounted.current) setState({ status: 'error', devices: [], error: messageOf(error) });
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const openSettings = async () => {
    try {
      await getNativeBluetoothPlugin()?.openBluetoothSettings();
    } catch {
      // Nothing useful to show: the user can open Android settings manually.
    }
  };

  const { status, devices, error } = state;
  const selectedIsListed = devices.some((d) => d.address === selectedAddress);

  return (
    <fieldset className="space-y-2">
      <legend className="block text-small font-semibold text-text-primary mb-1.5">Which Bluetooth printer?</legend>

      {status === 'loading' && <p className="text-caption text-text-muted">Looking for paired printers…</p>}

      {error && (
        <p role="alert" className="flex items-start gap-2 text-caption text-warning-text">
          <ExclamationTriangleIcon className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      {status === 'ready' && devices.length === 0 && (
        <p className="text-caption text-text-muted">
          No paired devices found. Pair your printer in Android&apos;s Bluetooth settings first (the PIN is usually 0000
          or 1234), then tap Refresh.
        </p>
      )}

      {devices.length > 0 && (
        <div className="grid gap-2">
          {devices.map((device) => {
            const checked = device.address === selectedAddress;
            return (
              <label
                key={device.address}
                className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  checked ? 'border-primary bg-primary/5' : 'border-border-default bg-surface hover:border-border-hover'
                }`}
              >
                <input
                  type="radio"
                  name="bluetooth-printer"
                  value={device.address}
                  checked={checked}
                  onChange={() => onSelect({ printerAddress: device.address, printerName: device.name || '' })}
                  className="h-4 w-4 text-primary focus:ring-primary/30"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-small font-semibold text-text-primary">{device.name || 'Unnamed device'}</span>
                    {device.isPrinter && (
                      <span className="text-caption font-medium text-text-muted bg-surface-2 border border-border-default rounded-full px-2 py-0.5">
                        Printer
                      </span>
                    )}
                  </span>
                  <span className="block text-caption text-text-muted">{device.address}</span>
                </span>
              </label>
            );
          })}
        </div>
      )}

      {status === 'ready' && selectedAddress && !selectedIsListed && (
        <p role="alert" className="flex items-start gap-2 text-caption text-warning-text">
          <ExclamationTriangleIcon className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            {selectedName || selectedAddress} isn&apos;t paired with this device any more. Pair it again in Android&apos;s
            Bluetooth settings, or pick another printer.
          </span>
        </p>
      )}

      {status === 'ready' && !selectedAddress && devices.length > 0 && (
        <p className="text-caption text-text-muted">
          Choose your printer. Until you do, receipts can&apos;t be sent to it.
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="button" variant="secondary" size="sm" leftIcon={ArrowPathIcon} onClick={load}>
          Refresh
        </Button>
        <Button type="button" variant="ghost" size="sm" leftIcon={Cog6ToothIcon} onClick={openSettings}>
          Open Bluetooth settings
        </Button>
      </div>
    </fieldset>
  );
}
