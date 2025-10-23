const currencySymbols = {
  'USD': '$',
  'KES': 'KSh',
  'NGN': '₦',
  'ZAR': 'R',
  'GHS': 'GH₵',
  'TZS': 'TSh',
  'UGX': 'USh',
  'XOF': 'CFA',
  'XAF': 'FCFA'
};

export const getCurrencySymbol = (code) => currencySymbols[code] || code;

export const validateCurrencyCode = (code) => {
  return Object.keys(currencySymbols).includes(code);
};

export const getAllCurrencies = () => {
  return Object.entries(currencySymbols).map(([code, symbol]) => ({
    code,
    symbol
  }));
};

export const formatCurrencyValue = (value, currency) => {
  if (!value || !currency) return '';
  
  const amount = Number(value);
  if (isNaN(amount)) return '';

  const formatted = amount.toFixed(currency.decimalPlaces || 2);
  return currency.position === 'before'
    ? `${currency.symbol}${formatted}`
    : `${formatted} ${currency.symbol}`;
};