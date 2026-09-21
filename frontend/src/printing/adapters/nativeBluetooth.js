/**
 * Access to the native ZanaBluetoothPrinter Capacitor plugin (Android app only).
 *
 * The plugin is looked up through the `window.Capacitor` global that the native
 * shell injects, instead of importing @capacitor/core, so the normal web build
 * carries no Capacitor dependency at all. Everywhere except inside the Android app
 * this returns null.
 *
 * Plugin API (see mobile/plugins/zana-bluetooth-printer):
 *   requestBluetoothPermission() -> { granted }
 *   isBluetoothEnabled()         -> { available, enabled }
 *   getPairedDevices()           -> { devices: [{ name, address, isPrinter }] }
 *   connect({ address })         -> { connected }
 *   isConnected({ address })     -> { connected }
 *   write({ address, data, chunkSize?, chunkDelayMs? })  (data = base64 bytes) -> { written }
 *   disconnect({ address? })
 *   openBluetoothSettings()
 */

export const PLUGIN_NAME = 'ZanaBluetoothPrinter';

let cachedFor = null;
let cachedPlugin = null;

/** @returns {object|null} the native plugin, or null when not running in the Android app */
export function getNativeBluetoothPlugin() {
  const cap = typeof window !== 'undefined' ? window.Capacitor : undefined;
  if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return null;
  if (typeof cap.getPlatform === 'function' && cap.getPlatform() !== 'android') return null;
  if (typeof cap.isPluginAvailable === 'function' && !cap.isPluginAvailable(PLUGIN_NAME)) return null;

  // registerPlugin() warns if called twice for the same name, so keep the proxy.
  if (cachedFor === cap) return cachedPlugin;
  let plugin = null;
  try {
    plugin = typeof cap.registerPlugin === 'function' ? cap.registerPlugin(PLUGIN_NAME) : cap.Plugins?.[PLUGIN_NAME] || null;
  } catch {
    plugin = null;
  }
  cachedFor = cap;
  cachedPlugin = plugin;
  return plugin;
}

/** True when running inside the native Android shell (with or without our plugin). */
export function isNativeAndroid() {
  const cap = typeof window !== 'undefined' ? window.Capacitor : undefined;
  return Boolean(
    cap &&
      typeof cap.isNativePlatform === 'function' &&
      cap.isNativePlatform() &&
      (typeof cap.getPlatform !== 'function' || cap.getPlatform() === 'android')
  );
}
