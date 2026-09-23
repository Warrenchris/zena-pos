/**
 * Shop-wide receipt customisation (Settings > Receipt & Printer): header text,
 * footer text and the business logo. Same for every device in the shop, unlike
 * the printer profile, which is per device.
 */

const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp);/i;
const ABSOLUTE_HTTP = /^https?:\/\//i;

/**
 * Turn the stored logo value into a URL the browser can load, or null.
 * Uploaded logos are stored as `/uploads/...` paths on the API server, so they are
 * resolved against the API base URL. Anything that isn't an http(s) URL, an image
 * data URL or a server path is rejected.
 */
export function resolveLogoUrl(logo, apiBaseUrl = '') {
  if (typeof logo !== 'string') return null;
  const value = logo.trim();
  if (!value) return null;
  if (DATA_IMAGE.test(value) || ABSOLUTE_HTTP.test(value)) return value;
  if (value.startsWith('/') && !value.startsWith('//')) {
    const base = String(apiBaseUrl || '').replace(/\/+$/, '');
    return base ? `${base}${value}` : value;
  }
  return null;
}

/** Pick the receipt customisation fields out of the app's settings state. */
export function buildReceiptSettings(settings, apiBaseUrl = '') {
  const s = settings || {};
  return {
    header: typeof s.receiptHeader === 'string' ? s.receiptHeader : '',
    footer: typeof s.receiptFooter === 'string' ? s.receiptFooter : '',
    showLogo: s.showLogoOnReceipt !== false,
    logoUrl: resolveLogoUrl(s.businessLogo, apiBaseUrl),
  };
}
