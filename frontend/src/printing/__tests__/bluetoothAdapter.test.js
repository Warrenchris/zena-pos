import { createBluetoothAdapter } from '../adapters/bluetoothAdapter';

const ADDRESS = '66:32:AB:CD:EF:01';
const bytes = Uint8Array.from([0x1b, 0x40, 0x48, 0x69, 0x0a, 0x1b, 0x70, 0x00, 0x19, 0xfa]);
const decode = (b64) => Array.from(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

const makeJob = (profile = {}) => ({
  profile: { printerAddress: ADDRESS, printerName: 'MHT-P58', ...profile },
  escpos: () => bytes,
});

function makePlugin(overrides = {}) {
  return {
    requestBluetoothPermission: jest.fn().mockResolvedValue({ granted: true }),
    isBluetoothEnabled: jest.fn().mockResolvedValue({ available: true, enabled: true }),
    isConnected: jest.fn().mockResolvedValue({ connected: false }),
    connect: jest.fn().mockResolvedValue({ connected: true }),
    write: jest.fn().mockResolvedValue({ written: bytes.length }),
    disconnect: jest.fn().mockResolvedValue(),
    ...overrides,
  };
}

const adapterFor = (plugin) => createBluetoothAdapter({ getPlugin: () => plugin });

describe('bluetooth adapter', () => {
  it('is supported only when the native plugin exists', () => {
    expect(adapterFor(makePlugin()).isSupported()).toBe(true);
    expect(adapterFor(null).isSupported()).toBe(false);
    expect(adapterFor(null).unsupportedReason).toMatch(/Android app/);
  });

  it('connects, then sends the exact ESC/POS bytes as base64', async () => {
    const plugin = makePlugin();
    await adapterFor(plugin).print(makeJob());

    expect(plugin.connect).toHaveBeenCalledWith({ address: ADDRESS });
    expect(plugin.write).toHaveBeenCalledTimes(1);
    const arg = plugin.write.mock.calls[0][0];
    expect(arg.address).toBe(ADDRESS);
    expect(decode(arg.data)).toEqual(Array.from(bytes)); // including the 0xFA byte
    expect(arg.chunkSize).toBeGreaterThan(0);
  });

  it('reuses an open connection instead of reconnecting', async () => {
    const plugin = makePlugin({ isConnected: jest.fn().mockResolvedValue({ connected: true }) });
    await adapterFor(plugin).print(makeJob());
    expect(plugin.connect).not.toHaveBeenCalled();
    expect(plugin.write).toHaveBeenCalledTimes(1);
  });

  it('reconnects once and retries when a reused connection has gone stale', async () => {
    const plugin = makePlugin({
      isConnected: jest.fn().mockResolvedValue({ connected: true }),
      write: jest.fn().mockRejectedValueOnce(new Error('Broken pipe')).mockResolvedValue({ written: 1 }),
    });
    await adapterFor(plugin).print(makeJob());

    expect(plugin.disconnect).toHaveBeenCalledWith({ address: ADDRESS });
    expect(plugin.connect).toHaveBeenCalledTimes(1);
    expect(plugin.write).toHaveBeenCalledTimes(2);
  });

  it('does not retry a failed fresh connection, so a switched-off printer fails fast', async () => {
    const plugin = makePlugin({ connect: jest.fn().mockRejectedValue(new Error('Could not connect to the printer.')) });
    await expect(adapterFor(plugin).print(makeJob())).rejects.toThrow('MHT-P58: Could not connect to the printer.');
    expect(plugin.connect).toHaveBeenCalledTimes(1);
    expect(plugin.write).not.toHaveBeenCalled();
  });

  it('fails when the write fails after a fresh connection', async () => {
    const plugin = makePlugin({ write: jest.fn().mockRejectedValue(new Error('Write failed')) });
    await expect(adapterFor(plugin).print(makeJob())).rejects.toThrow('MHT-P58: Write failed');
    expect(plugin.write).toHaveBeenCalledTimes(1);
  });

  it('fails when the retry after a stale connection also fails', async () => {
    const plugin = makePlugin({
      isConnected: jest.fn().mockResolvedValue({ connected: true }),
      write: jest.fn().mockRejectedValue(new Error('Broken pipe')),
    });
    await expect(adapterFor(plugin).print(makeJob())).rejects.toThrow('MHT-P58: Broken pipe');
    expect(plugin.write).toHaveBeenCalledTimes(2);
  });

  it('asks the cashier to choose a printer when none is selected', async () => {
    const plugin = makePlugin();
    await expect(adapterFor(plugin).print(makeJob({ printerAddress: '' }))).rejects.toThrow(/No Bluetooth printer selected/);
    expect(plugin.connect).not.toHaveBeenCalled();
  });

  it('explains a denied permission and a switched-off Bluetooth', async () => {
    const denied = makePlugin({ requestBluetoothPermission: jest.fn().mockResolvedValue({ granted: false }) });
    await expect(adapterFor(denied).print(makeJob())).rejects.toThrow(/permission was denied/i);

    const off = makePlugin({ isBluetoothEnabled: jest.fn().mockResolvedValue({ available: true, enabled: false }) });
    await expect(adapterFor(off).print(makeJob())).rejects.toThrow(/Bluetooth is turned off/);
    expect(off.connect).not.toHaveBeenCalled();
  });

  it('falls back to the address when the printer has no name', async () => {
    const plugin = makePlugin({ connect: jest.fn().mockRejectedValue(new Error('nope')) });
    await expect(adapterFor(plugin).print(makeJob({ printerName: '' }))).rejects.toThrow(`${ADDRESS}: nope`);
  });

  it('prints receipts one at a time so they never interleave', async () => {
    const events = [];
    let releaseFirstWrite;
    const plugin = makePlugin({
      write: jest.fn((arg) => {
        events.push(`write:${arg.tag}`);
        if (arg.tag === 'first') return new Promise((resolve) => (releaseFirstWrite = resolve));
        return Promise.resolve();
      }),
    });
    // tag each job's payload through escpos()
    const tagged = (tag) => ({ profile: makeJob().profile, escpos: () => Uint8Array.from([tag === 'first' ? 1 : 2]) });
    plugin.write.mockImplementation((arg) => {
      const tag = decode(arg.data)[0] === 1 ? 'first' : 'second';
      events.push(`start:${tag}`);
      if (tag === 'first') return new Promise((resolve) => (releaseFirstWrite = () => { events.push('end:first'); resolve(); }));
      events.push('end:second');
      return Promise.resolve();
    });

    const adapter = adapterFor(plugin);
    const p1 = adapter.print(tagged('first'));
    const p2 = adapter.print(tagged('second'));

    await new Promise((r) => setTimeout(r, 20));
    expect(events).toEqual(['start:first']); // second must wait
    releaseFirstWrite();
    await Promise.all([p1, p2]);
    expect(events).toEqual(['start:first', 'end:first', 'start:second', 'end:second']);
  });

  it('keeps printing after an earlier print failed', async () => {
    const plugin = makePlugin();
    const adapter = adapterFor(plugin);
    await expect(adapter.print(makeJob({ printerAddress: '' }))).rejects.toThrow();
    await expect(adapter.print(makeJob())).resolves.toBeUndefined();
    expect(plugin.write).toHaveBeenCalledTimes(1);
  });

  it('rejects clearly if the plugin disappears', async () => {
    await expect(createBluetoothAdapter({ getPlugin: () => null }).print(makeJob())).rejects.toThrow(/only available in the Android app/);
  });
});
