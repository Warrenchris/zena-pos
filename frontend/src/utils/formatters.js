// Legacy formatCurrency function - now uses settings-based formatting
export const formatCurrency = (amount, settings = null) => {
  // If settings are provided, use the new system
  if (settings) {
    const { currencySymbol, currencyPosition, decimalPlaces } = settings;
    const formattedAmount = parseFloat(amount).toFixed(decimalPlaces);
    
    if (currencyPosition === 'before') {
      return `${currencySymbol} ${formattedAmount}`;
    } else {
      return `${formattedAmount} ${currencySymbol}`;
    }
  }
  
  // Fallback to USD formatting for backward compatibility
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount)
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