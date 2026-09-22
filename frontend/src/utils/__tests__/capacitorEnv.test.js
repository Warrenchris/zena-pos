/* eslint-env jest */
import { isNativeAndroid } from '../capacitorEnv';

afterEach(() => {
  delete window.Capacitor;
});

describe('isNativeAndroid', () => {
  it('is false in a normal browser', () => {
    expect(isNativeAndroid()).toBe(false);
  });

  it('is true inside the Android app shell', () => {
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
    expect(isNativeAndroid()).toBe(true);
  });

  it('is false on the web build of Capacitor and on iOS', () => {
    window.Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };
    expect(isNativeAndroid()).toBe(false);
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
    expect(isNativeAndroid()).toBe(false);
  });

  it('assumes Android when the shell has no getPlatform (older/minimal shells)', () => {
    window.Capacitor = { isNativePlatform: () => true };
    expect(isNativeAndroid()).toBe(true);
  });
});
