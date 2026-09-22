/* eslint-env jest */
import { webSerialAdapter, isWebSerialSupported } from '../adapters/webSerialAdapter';

const bytes = Uint8Array.from([0x1b, 0x40, 0x48, 0x69]);
const job = (baud = 9600) => ({ profile: { serialBaudRate: baud }, escpos: () => bytes });

function fakePort() {
  const writer = { write: jest.fn().mockResolvedValue(), releaseLock: jest.fn() };
  return {
    open: jest.fn().mockResolvedValue(),
    close: jest.fn().mockResolvedValue(),
    writable: { getWriter: jest.fn(() => writer) },
    _writer: writer,
  };
}

const installSerial = (ports) => {
  window.navigator.serial = { getPorts: jest.fn().mockResolvedValue(ports) };
};
const installSecure = (value = true) => Object.defineProperty(window, 'isSecureContext', { value, configurable: true });

beforeEach(() => {
  delete window.navigator.serial;
  installSecure(true);
});

describe('isWebSerialSupported', () => {
  it('requires navigator.serial and a secure context', () => {
    expect(isWebSerialSupported()).toBe(false);
    installSerial([]);
    expect(isWebSerialSupported()).toBe(true);
    installSecure(false);
    expect(isWebSerialSupported()).toBe(false);
  });
});

describe('webSerialAdapter', () => {
  it('opens the one granted port at the configured baud rate and writes the bytes', async () => {
    const port = fakePort();
    installSerial([port]);

    await webSerialAdapter.print(job(19200));

    expect(port.open).toHaveBeenCalledWith({ baudRate: 19200 });
    expect(port._writer.write).toHaveBeenCalledWith(bytes);
    expect(port._writer.releaseLock).toHaveBeenCalled();
    expect(port.close).toHaveBeenCalled();
  });

  it('asks for a port to be selected when none is granted', async () => {
    installSerial([]);
    await expect(webSerialAdapter.print(job())).rejects.toThrow(/No serial printer selected/);
  });

  it('refuses to guess when more than one port is granted', async () => {
    installSerial([fakePort(), fakePort()]);
    await expect(webSerialAdapter.print(job())).rejects.toThrow(/More than one serial port/);
  });

  it('always closes the port, even when the write fails', async () => {
    const port = fakePort();
    port._writer.write.mockRejectedValue(new Error('port busy'));
    installSerial([port]);
    await expect(webSerialAdapter.print(job())).rejects.toThrow('port busy');
    expect(port.close).toHaveBeenCalled();
  });

  it('is not supported without navigator.serial', async () => {
    expect(webSerialAdapter.isSupported()).toBe(false);
    await expect(webSerialAdapter.print(job())).rejects.toThrow(/not available on this device/);
  });
});
