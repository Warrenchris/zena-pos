import { formatAmount } from './currencyFormatters';
import { SHOP_TIMEZONE, formatDate, formatDateTime } from './dateTime.js';

export { SHOP_TIMEZONE, formatDate, formatDateTime };

// Wrapper for backward compatibility
export const formatCurrency = (amount, settings = null) => {
  if (settings?.currency) {
    return formatAmount(amount, settings.currency);
  }
  return formatAmount(amount); // Uses default currency (KES)
};

// Long date, e.g. "August 26, 2026" — for invoice "Issued on" style text.
export const formatDateLong = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: SHOP_TIMEZONE,
  });
};

// Short date, e.g. "Aug 26, 2026" — for tables and compact lists.
export const formatDateShort = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: SHOP_TIMEZONE,
  });
};

export default {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDateLong,
  formatDateShort,
};
