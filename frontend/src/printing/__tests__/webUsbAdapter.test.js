/* eslint-env jest */
import { webUsbAdapter, isWebUsbSupported } from '../adapters/webUsbAdapter';

const PROFILE = { usbVendorId: 0x0483, usbProductId: 0x5743, usbSerialNumber: '' };
const bytes = Uint8Array.from([0x1b, 0x40, 0x48, 0x69]);
const job = (profile = PROFILE) => ({ profile, escpos: () => bytes });

function fakeDevice(overrides = {}) {
  return {
    vendorId: 0x0483,
    productId: 0x5743,
    serialNumber: 'SN1',
    configuration: {
      interfaces: [{ interfaceNumber: 0, alternates: [{ endpoints: [{ direction: 'out', type: 'bulk', endpointNumber: 1 }] }] }],
    },
    open: jest.fn().mockResolvedValue(),
    close: jest.fn().mockResolvedValue(),
    selectConfiguration: jest.fn().mockResolvedValue(),
    claimInterface: jest.fn().mockResolvedValue(),
    releaseInterface: jest.fn().mockResolvedValue(),
    transferOut: jest.fn().mockResolvedValue({ status: 'ok' }),
    ...overrides,
  };
}

const installUsb = (devices) => {
  window.navigator.usb = { getDevices: jest.fn().mockResolvedValue(devices) };
};
const installSecure = (value = true) => Object.defineProperty(window, 'isSecureContext', { value, configurable: true });

beforeEach(() => {
  delete window.navigator.usb;
  installSecure(true);
});

describe('isWebUsbSupported', () => {
  it('requires navigator.usb and a secure context', () => {
    expect(isWebUsbSupported()).toBe(false);
    installUsb([]);
    expect(isWebUsbSupported()).toBe(true);
    installSecure(false);
    expect(isWebUsbSupported()).toBe(false);
  });
});

describe('webUsbAdapter', () => {
  it('connects to the matching granted device and writes the ESC/POS bytes', async () => {
    const device = fakeDevice();
    installUsb([device]);

    await webUsbAdapter.print(job());

    expect(device.open).toHaveBeenCalledTimes(1);
    expect(device.claimInterface).toHaveBeenCalledWith(0);
    expect(device.transferOut).toHaveBeenCalledWith(1, bytes);
    expect(device.releaseInterface).toHaveBeenCalledWith(0);
    expect(device.close).toHaveBeenCalledTimes(1);
  });

  it('matches by vendor+product+serial when a serial number is stored', async () => {
    const wrong = fakeDevice({ serialNumber: 'OTHER' });
    const right = fakeDevice({ serialNumber: 'SN1' });
    installUsb([wrong, right]);

    await webUsbAdapter.print(job({ ...PROFILE, usbSerialNumber: 'SN1' }));

    expect(wrong.open).not.toHaveBeenCalled();
    expect(right.open).toHaveBeenCalled();
  });

  it('asks for a printer to be selected when none is stored', async () => {
    installUsb([fakeDevice()]);
    await expect(webUsbAdapter.print(job({ usbVendorId: null, usbProductId: null }))).rejects.toThrow(/No USB printer selected/);
  });

  it('explains when the selected device is not currently connected', async () => {
    installUsb([]);
    await expect(webUsbAdapter.print(job())).rejects.toThrow(/was not found/);
  });

  it('selects a configuration first if the device has none active', async () => {
    const device = fakeDevice({ configuration: null, configurations: [{ interfaces: [{ interfaceNumber: 0, alternates: [{ endpoints: [{ direction: 'out', type: 'bulk', endpointNumber: 2 }] }] }] }] });
    installUsb([device]);
    await webUsbAdapter.print(job());
    expect(device.selectConfiguration).toHaveBeenCalledWith(1);
  });

  it('fails clearly when the device has no bulk OUT endpoint', async () => {
    const device = fakeDevice({ configuration: { interfaces: [] } });
    installUsb([device]);
    await expect(webUsbAdapter.print(job())).rejects.toThrow(/no printer data endpoint/);
    expect(device.close).toHaveBeenCalled();
  });

  it('always closes the device, even when the write fails', async () => {
    const device = fakeDevice({ transferOut: jest.fn().mockRejectedValue(new Error('cable unplugged')) });
    installUsb([device]);
    await expect(webUsbAdapter.print(job())).rejects.toThrow('cable unplugged');
    expect(device.releaseInterface).toHaveBeenCalled();
    expect(device.close).toHaveBeenCalled();
  });

  it('sends large payloads in chunks', async () => {
    const device = fakeDevice();
    installUsb([device]);
    const big = new Uint8Array(9000).fill(1);
    await webUsbAdapter.print({ profile: PROFILE, escpos: () => big });
    expect(device.transferOut).toHaveBeenCalledTimes(3); // 4096 + 4096 + 808
  });

  it('is not supported without navigator.usb', async () => {
    expect(webUsbAdapter.isSupported()).toBe(false);
    await expect(webUsbAdapter.print(job())).rejects.toThrow(/not available on this device/);
  });
});
