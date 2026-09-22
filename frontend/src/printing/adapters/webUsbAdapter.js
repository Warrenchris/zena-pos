// One write at a time per printer, so two receipts can never interleave on the wire.
const CHUNK_SIZE = 4096;

const describe = (error) => (error && error.message) || String(error || 'Unknown error');

export const isWebUsbSupported = () =>
  typeof navigator !== 'undefined' && Boolean(navigator.usb) && typeof window !== 'undefined' && window.isSecureContext === true;

const matches = (device, profile) =>
  device.vendorId === profile.usbVendorId &&
  device.productId === profile.usbProductId &&
  (!profile.usbSerialNumber || device.serialNumber === profile.usbSerialNumber);

/** Find the already-granted device this profile points at (requires no user gesture: permission was granted earlier). */
async function findGrantedDevice(profile) {
  const devices = await navigator.usb.getDevices();
  return devices.find((device) => matches(device, profile)) || null;
}

/** The first interface with a bulk OUT endpoint - where receipt printer data goes on virtually every USB printer. */
function findBulkOutEndpoint(device) {
  for (const config of device.configuration ? [device.configuration] : device.configurations) {
    for (const iface of config.interfaces) {
      const alt = iface.alternates[0];
      const endpoint = alt.endpoints.find((e) => e.direction === 'out' && e.type === 'bulk');
      if (endpoint) return { interfaceNumber: iface.interfaceNumber, endpointNumber: endpoint.endpointNumber };
    }
  }
  return null;
}

async function sendBytes(device, endpoint, bytes) {
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    const chunk = bytes.subarray(offset, offset + CHUNK_SIZE);
    const result = await device.transferOut(endpoint.endpointNumber, chunk);
    if (result.status !== 'ok') throw new Error(`USB transfer failed (${result.status})`);
  }
}

/**
 * WebUSB print adapter, for a receipt printer plugged directly into this computer.
 *
 * The user grants access to one specific device once, in Printer settings (WebUSB requires a
 * user gesture for that first pairing); afterwards the browser remembers it by vendor/product id,
 * so no further prompt is needed. Chrome and Edge only (desktop); not Firefox or Safari.
 */
export const webUsbAdapter = {
  id: 'usb',
  label: 'USB printer',
  unsupportedReason: 'This browser does not support USB printing (Chrome or Edge on a computer)',

  isSupported: isWebUsbSupported,

  /** @param {import('../printService').PrintJob} job */
  async print(job) {
    if (!isWebUsbSupported()) throw new Error('USB printing is not available on this device');
    const { profile } = job;
    if (profile.usbVendorId === null || profile.usbProductId === null) {
      throw new Error('No USB printer selected. Choose one in Printer settings.');
    }

    const device = await findGrantedDevice(profile);
    if (!device) {
      throw new Error('The selected USB printer was not found. Check it is plugged in, or select it again in Printer settings.');
    }

    try {
      await device.open();
      if (device.configuration === null) await device.selectConfiguration(1);

      const endpoint = findBulkOutEndpoint(device);
      if (!endpoint) throw new Error('This USB device has no printer data endpoint.');

      await device.claimInterface(endpoint.interfaceNumber);
      try {
        await sendBytes(device, endpoint, job.escpos());
      } finally {
        await device.releaseInterface(endpoint.interfaceNumber).catch(() => {});
      }
    } catch (error) {
      throw new Error(describe(error));
    } finally {
      await device.close().catch(() => {});
    }
  },
};
