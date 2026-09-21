import { browserPrintAdapter } from './browserPrintAdapter';
import { createBluetoothAdapter } from './bluetoothAdapter';

/**
 * Print adapter registry.
 *
 * An adapter is `{ id, label, isSupported(): boolean, print(job): Promise<void> }`
 * where `job` is a PrintJob (see printService.js). Thermal adapters call
 * `job.escpos()` for raw bytes and write them to their transport; the browser
 * adapter calls `job.html()`.
 *
 * To add a connection type (Bluetooth, WebUSB, Web Serial, a local print agent
 * for LAN printers), implement that interface and register it here under the id
 * used in the printer profile's `connection` field. The print service already
 * falls back to the browser adapter whenever a registered adapter is missing,
 * unsupported, or throws.
 */
export const ADAPTERS = {
  browser: browserPrintAdapter,
  bluetooth: createBluetoothAdapter(),
};

export const FALLBACK_ADAPTER_ID = 'browser';
