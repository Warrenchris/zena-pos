import { buildReceipt } from './receiptModel';
import { renderEscPos, renderHtml, renderPlainText } from './renderers';
import { loadProfile, normalizeProfile } from './profile';
import { ADAPTERS, FALLBACK_ADAPTER_ID } from './adapters';
import { sampleSale } from './sample';

/**
 * @typedef {object} PrintJob
 * @property {object} receipt      printer-agnostic receipt model
 * @property {object} profile      normalized printer profile
 * @property {() => Uint8Array} escpos  raw ESC/POS bytes (rendered lazily, once)
 * @property {() => string} html        standalone HTML document
 * @property {() => string} text        plain text
 */

/** @returns {PrintJob} */
export function createPrintJob(receipt, profile, formatMoney) {
  const p = normalizeProfile(profile);
  const cache = {};
  const once = (key, render) => () => {
    if (!(key in cache)) cache[key] = render(receipt, p, formatMoney);
    return cache[key];
  };
  return {
    receipt,
    profile: p,
    escpos: once('escpos', renderEscPos),
    html: once('html', renderHtml),
    text: once('text', renderPlainText),
  };
}

const messageOf = (error) => (error && error.message) || String(error || 'Unknown printing error');

/**
 * Print a receipt using this device's printer profile.
 *
 * Fallback chain: the profile's adapter first; if it is missing, unsupported or
 * throws, the browser adapter. Never throws: a printer problem must not block a
 * sale, so the caller gets a result to show the cashier instead.
 *
 * @returns {Promise<{ok: boolean, adapterId: string|null, fellBack: boolean, error?: string}>}
 */
export async function printReceipt(
  completedSale,
  { formatMoney, business, profile, adapters = ADAPTERS } = {}
) {
  const money = typeof formatMoney === 'function' ? formatMoney : (n) => Number(n || 0).toFixed(2);
  const activeProfile = normalizeProfile(profile || loadProfile());

  let job;
  try {
    job = createPrintJob(buildReceipt(completedSale, { business }), activeProfile, money);
  } catch (error) {
    return { ok: false, adapterId: null, fellBack: false, error: messageOf(error) };
  }

  const preferred = adapters[activeProfile.connection];
  let preferredError = null;

  if (preferred && preferred.isSupported()) {
    try {
      await preferred.print(job);
      return { ok: true, adapterId: preferred.id, fellBack: false };
    } catch (error) {
      preferredError = messageOf(error);
    }
  } else {
    preferredError = `${activeProfile.connection} printing is not available on this device`;
  }

  const fallback = adapters[FALLBACK_ADAPTER_ID];
  const alreadyTriedFallback = preferred === fallback;
  if (!fallback || alreadyTriedFallback || !fallback.isSupported()) {
    return { ok: false, adapterId: null, fellBack: false, error: preferredError };
  }

  try {
    await fallback.print(job);
    return { ok: true, adapterId: fallback.id, fellBack: true, error: preferredError };
  } catch (error) {
    return { ok: false, adapterId: null, fellBack: false, error: messageOf(error) };
  }
}

/** Sample receipt for a "Test print" button in printer settings. */
export function printTestReceipt({ formatMoney, business, profile, adapters } = {}) {
  return printReceipt(sampleSale(), { formatMoney, business, profile, adapters });
}
