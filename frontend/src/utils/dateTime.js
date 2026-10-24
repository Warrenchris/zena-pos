export const SHOP_TIMEZONE = 'Africa/Nairobi';

/**
 * Full date + time pinned to Africa/Nairobi, e.g. "2026-10-24 17:30"
 * Ambiguity-free ISO-like presentation for thermal receipts.
 *
 * @param {Date|string|number} dateString
 * @returns {string} Formatted date and time
 */
export function formatDateTime(dateString) {
  if (!dateString) return '';
  const d = dateString instanceof Date ? dateString : new Date(dateString);
  if (Number.isNaN(d.getTime())) return '';

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: SHOP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

/**
 * Format date for display in Africa/Nairobi timezone
 */
export function formatDate(dateString) {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: SHOP_TIMEZONE,
  });
}
