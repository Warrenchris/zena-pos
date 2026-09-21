/** Encode raw bytes as base64 (binary-safe, unlike sending them as a string). */
export function bytesToBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  const CHUNK = 0x8000; // keep String.fromCharCode.apply() well under the argument limit
  let binary = '';
  for (let i = 0; i < view.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, view.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
