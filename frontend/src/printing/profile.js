/**
 * Printer profile: how THIS device prints receipts.
 *
 * Stored per device (localStorage), not per shop: the same shop may print
 * over Bluetooth from a phone and over USB from the counter PC.
 */

export const STORAGE_KEY = 'zana.printerProfile.v1';

export const CONNECTIONS = ['browser', 'bluetooth', 'usb', 'serial', 'network'];
export const CUT_MODES = ['partial', 'full', 'none'];

/** Human-readable names for each connection type (used by the settings UI). */
export const CONNECTION_INFO = {
  browser: {
    label: 'Browser / system printer',
    hint: 'Works with any printer installed on this device, using the normal print dialog.',
  },
  bluetooth: {
    label: 'Bluetooth printer',
    hint: 'Small wireless receipt printers, mostly used with Android phones and tablets.',
  },
  usb: {
    label: 'USB printer',
    hint: 'Receipt printers plugged straight into this device.',
  },
  serial: {
    label: 'Serial / COM port printer',
    hint: 'Older receipt printers on a serial or virtual COM port.',
  },
  network: {
    label: 'Network (LAN) printer',
    hint: 'Printers on the shop Wi-Fi or router, reached by IP address.',
  },
};

/**
 * Printable width of common thermal paper at 203 dpi, using the printer's
 * standard 12-dot font: 58mm paper ≈ 32 columns, 80mm paper ≈ 48 columns.
 */
export const PAPER_PRESETS = {
  58: { charsPerLine: 32 },
  80: { charsPerLine: 48 },
};

/**
 * 58mm is the safe default for a mixed fleet: narrow content still prints
 * correctly on 80mm paper, but 80mm content would be clipped on 58mm paper.
 */
export const DEFAULT_PROFILE = Object.freeze({
  connection: 'browser',
  paperWidth: 58,
  cut: 'partial',
  openDrawer: false,
  feedLines: 3,
  // USB: matched by vendor/product id (and serial number, when the device exposes one) - stable
  // across browser sessions once the user has granted access to the device once.
  usbVendorId: null,
  usbProductId: null,
  usbSerialNumber: '',
  // Serial: the Web Serial API gives no stable device id, so the adapter uses whichever single
  // port the browser has already granted access to. baudRate is the only thing worth storing.
  serialBaudRate: 9600,
});

export const SERIAL_BAUD_RATES = [9600, 19200, 38400, 57600, 115200];

/** Validate an untrusted/partial profile and fill in defaults. */
export function normalizeProfile(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const feed = Number(p.feedLines);
  return {
    connection: CONNECTIONS.includes(p.connection) ? p.connection : DEFAULT_PROFILE.connection,
    paperWidth: PAPER_PRESETS[p.paperWidth] ? Number(p.paperWidth) : DEFAULT_PROFILE.paperWidth,
    cut: CUT_MODES.includes(p.cut) ? p.cut : DEFAULT_PROFILE.cut,
    openDrawer: p.openDrawer === true,
    feedLines: Number.isInteger(feed) && feed >= 0 && feed <= 10 ? feed : DEFAULT_PROFILE.feedLines,
    usbVendorId: Number.isInteger(p.usbVendorId) && p.usbVendorId >= 0 ? p.usbVendorId : null,
    usbProductId: Number.isInteger(p.usbProductId) && p.usbProductId >= 0 ? p.usbProductId : null,
    usbSerialNumber: typeof p.usbSerialNumber === 'string' ? p.usbSerialNumber.slice(0, 128) : '',
    serialBaudRate: SERIAL_BAUD_RATES.includes(Number(p.serialBaudRate)) ? Number(p.serialBaudRate) : DEFAULT_PROFILE.serialBaudRate,
  };
}

export const getCharsPerLine = (profile) => PAPER_PRESETS[normalizeProfile(profile).paperWidth].charsPerLine;

const getStorage = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null; // storage blocked (private mode, etc.)
  }
};

export function loadProfile(storage = getStorage()) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return normalizeProfile(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeProfile(null);
  }
}

export function saveProfile(profile, storage = getStorage()) {
  const clean = normalizeProfile(profile);
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Non-fatal: the profile just won't persist.
  }
  return clean;
}
