import { bytesToBase64 } from '../base64';
import { getNativeBluetoothPlugin } from './nativeBluetooth';

// Small pieces with a short pause between them keep cheap printers with tiny
// buffers from dropping data. A typical receipt is 1-2 KB, so this adds ~30ms.
const CHUNK_SIZE = 512;
const CHUNK_DELAY_MS = 10;

const noop = () => {};

const describe = (error) => (error && error.message) || String(error || 'Unknown error');

/**
 * Bluetooth (Classic / SPP) print adapter for the Android app.
 *
 * Sends the ESC/POS bytes to the printer chosen in this device's printer profile
 * through the native plugin. Prints are queued so two receipts never interleave,
 * the connection is kept open between prints, and a stale connection (printer
 * slept or moved out of range) is transparently re-opened once.
 *
 * @param {object} [options]
 * @param {() => object|null} [options.getPlugin]  plugin lookup, injectable for tests
 */
export function createBluetoothAdapter({ getPlugin = getNativeBluetoothPlugin } = {}) {
  let queue = Promise.resolve();

  async function connect(plugin, address, label) {
    try {
      await plugin.connect({ address });
    } catch (error) {
      throw new Error(`${label}: ${describe(error)}`);
    }
  }

  async function write(plugin, address, data) {
    await plugin.write({ address, data, chunkSize: CHUNK_SIZE, chunkDelayMs: CHUNK_DELAY_MS });
  }

  async function printJob(job) {
    const plugin = getPlugin();
    if (!plugin) throw new Error('Bluetooth printing is only available in the Android app');

    const { printerAddress: address, printerName } = job.profile;
    if (!address) throw new Error('No Bluetooth printer selected. Choose one in Printer settings.');
    const label = printerName || address;

    const { granted } = await plugin.requestBluetoothPermission();
    if (!granted) {
      throw new Error('Bluetooth permission was denied. Allow "Nearby devices" for this app in Android settings.');
    }
    const { enabled } = await plugin.isBluetoothEnabled();
    if (!enabled) throw new Error('Bluetooth is turned off. Turn it on and try again.');

    const data = bytesToBase64(job.escpos());
    const { connected } = await plugin.isConnected({ address });

    if (!connected) {
      await connect(plugin, address, label);
      try {
        await write(plugin, address, data);
      } catch (error) {
        throw new Error(`${label}: ${describe(error)}`);
      }
      return;
    }

    try {
      await write(plugin, address, data);
    } catch {
      // The socket looked open but the printer is gone (slept, out of range, switched off).
      // Reconnect and try once more.
      await Promise.resolve(plugin.disconnect({ address })).catch(noop);
      await connect(plugin, address, label);
      try {
        await write(plugin, address, data);
      } catch (error) {
        throw new Error(`${label}: ${describe(error)}`);
      }
    }
  }

  return {
    id: 'bluetooth',
    label: 'Bluetooth printer',
    unsupportedReason: 'Available in the Android app',

    isSupported() {
      return getPlugin() !== null;
    },

    /** @param {import('../printService').PrintJob} job */
    print(job) {
      const run = () => printJob(job);
      const result = queue.then(run, run);
      queue = result.catch(noop); // a failed print must not block the next one
      return result;
    },
  };
}
