/**
 * Detects the native Android app shell (Capacitor), via the `window.Capacitor` object it injects.
 * Nothing here imports @capacitor/core, so a normal web build carries no Capacitor dependency.
 *
 * Kept as its own small module (rather than living inside a specific feature's adapter) because
 * more than one part of the app needs to know "am I running inside the Android app right now" -
 * for example, to skip registering a service worker there, since the app ships its own copy of
 * the web app and a service worker would only get in the way.
 */
export function isNativeAndroid() {
  const cap = typeof window !== 'undefined' ? window.Capacitor : undefined;
  return Boolean(
    cap &&
      typeof cap.isNativePlatform === 'function' &&
      cap.isNativePlatform() &&
      (typeof cap.getPlatform !== 'function' || cap.getPlatform() === 'android')
  );
}
