/**
 * Generates a standard v4 UUID, used as a client-side idempotency key for
 * sale submissions. Extracted as a standalone util (rather than living only
 * inside usePendingSales.js) so any payment flow — single-payment or
 * split-tender — can generate one without pulling in the offline-queue hook.
 */
export function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default generateUUID;
