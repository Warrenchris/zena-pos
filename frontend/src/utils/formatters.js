import { formatAmount } from './currencyFormatters';

// Wrapper for backward compatibility
export const formatCurrency = (amount, settings = null) => {
  if (settings?.currency) {
    return formatAmount(amount, settings.currency);
  }
  return formatAmount(amount); // Uses default currency (KES)
}

export const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export default {
  formatCurrency,
  formatDate,
}