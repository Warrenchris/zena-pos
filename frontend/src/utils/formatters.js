import { formatAmount } from './currencyFormatters';

// Zana POS is built for Kenyan businesses. Receipts, sales lists, and
// reports must always show Africa/Nairobi time regardless of the device's
// own system timezone (a shop owner checking the dashboard while traveling
// abroad, or a misconfigured device clock, would otherwise see shifted
// times/dates). This only affects display — timestamps are still stored
// and transmitted exactly as before.
const SHOP_TIMEZONE = 'Africa/Nairobi';

// Wrapper for backward compatibility
export const formatCurrency = (amount, settings = null) => {
  if (settings?.currency) {
    return formatAmount(amount, settings.currency);
  }
  return formatAmount(amount); // Uses default currency (KES)
}

export const formatDate = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: SHOP_TIMEZONE
  })
}

// Full date + time, e.g. "Aug 26, 2026 • 09:52 AM" — for receipts and
// anywhere the full sale date/time needs to be unambiguous.
export const formatDateTime = (dateString) => {
  if (!dateString) return '';
  const datePart = new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    timeZone: SHOP_TIMEZONE
  });
  const timePart = new Date(dateString).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: SHOP_TIMEZONE
  });
  return `${datePart} • ${timePart}`;
}

// Long date, e.g. "August 26, 2026" — for invoice "Issued on" style text.
export const formatDateLong = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: SHOP_TIMEZONE
  });
}

// Short date, e.g. "Aug 26, 2026" — for tables and compact lists.
export const formatDateShort = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: SHOP_TIMEZONE
  });
}

export default {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDateLong,
  formatDateShort,
}