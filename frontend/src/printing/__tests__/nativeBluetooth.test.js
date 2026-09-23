import { getNativeBluetoothPlugin, isNativeAndroid, PLUGIN_NAME } from '../adapters/nativeBluetooth';

const install = (overrides = {}) => {
  const plugin = { id: 'plugin' };
  const cap = {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    isPluginAvailable: () => true,
    registerPlugin: jest.fn(() => plugin),
    ...overrides,
  };
  window.Capacitor = cap;
  return { cap, plugin };
};

afterEach(() => {
  delete window.Capacitor;
});

describe('getNativeBluetoothPlugin', () => {
  it('is null in a normal browser', () => {
    expect(getNativeBluetoothPlugin()).toBeNull();
    expect(isNativeAndroid()).toBe(false);
  });

  it('is null on the web build of Capacitor and on iOS', () => {
    install({ isNativePlatform: () => false, getPlatform: () => 'web' });
    expect(getNativeBluetoothPlugin()).toBeNull();
    install({ getPlatform: () => 'ios' });
    expect(getNativeBluetoothPlugin()).toBeNull();
    expect(isNativeAndroid()).toBe(false);
  });

  it('is null when the app was built without the plugin', () => {
    const { cap } = install({ isPluginAvailable: () => false });
    expect(getNativeBluetoothPlugin()).toBeNull();
    expect(cap.registerPlugin).not.toHaveBeenCalled();
    expect(isNativeAndroid()).toBe(true); // still the Android shell
  });

  it('returns the registered plugin, registering it only once', () => {
    const { cap, plugin } = install();
    expect(getNativeBluetoothPlugin()).toBe(plugin);
    expect(getNativeBluetoothPlugin()).toBe(plugin);
    expect(cap.registerPlugin).toHaveBeenCalledTimes(1);
    expect(cap.registerPlugin).toHaveBeenCalledWith(PLUGIN_NAME);
  });

  it('survives registerPlugin throwing', () => {
    install({
      registerPlugin: () => {
        throw new Error('boom');
      },
    });
    expect(getNativeBluetoothPlugin()).toBeNull();
  });
});
