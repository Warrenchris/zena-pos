const describe = (error) => (error && error.message) || String(error || 'Unknown error');

export const isWebSerialSupported = () =>
  typeof navigator !== 'undefined' && Boolean(navigator.serial) && typeof window !== 'undefined' && window.isSecureContext === true;

/**
 * Web Serial print adapter, for a receipt printer on a serial or USB-to-serial (virtual COM) port.
 *
 * Unlike WebUSB, the Web Serial API gives no stable id for a granted port, so this adapter uses
 * whichever single port the browser has already granted access to (the user grants it once, in
 * Printer settings). With more than one port granted there is no reliable way to tell them apart,
 * so printing is refused with a message explaining that, rather than guessing which port to use.
 * Chrome and Edge only (desktop); not Firefox or Safari.
 */
export const webSerialAdapter = {
  id: 'serial',
  label: 'Serial / COM port printer',
  unsupportedReason: 'This browser does not support serial printing (Chrome or Edge on a computer)',

  isSupported: isWebSerialSupported,

  /** @param {import('../printService').PrintJob} job */
  async print(job) {
    if (!isWebSerialSupported()) throw new Error('Serial printing is not available on this device');

    const ports = await navigator.serial.getPorts();
    if (ports.length === 0) {
      throw new Error('No serial printer selected. Choose one in Printer settings.');
    }
    if (ports.length > 1) {
      throw new Error('More than one serial port is available to this app. Remove access to the ones you are not using and try again.');
    }
    const port = ports[0];

    try {
      await port.open({ baudRate: job.profile.serialBaudRate });
      const writer = port.writable.getWriter();
      try {
        await writer.write(job.escpos());
      } finally {
        writer.releaseLock();
      }
    } catch (error) {
      throw new Error(describe(error));
    } finally {
      await port.close().catch(() => {});
    }
  },
};
