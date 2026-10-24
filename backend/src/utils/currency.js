const formatCurrency = (amount, currency = 'KSh') => {
  const n = Number(amount || 0);
  return `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

module.exports = { formatCurrency };
