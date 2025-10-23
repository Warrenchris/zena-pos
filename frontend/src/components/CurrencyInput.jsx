import React from 'react';
import { useCurrency } from '../providers/CurrencyProvider';

export const CurrencyInput = React.forwardRef(({ value, onChange, className = '', ...props }, ref) => {
  const currency = useCurrency();
  
  const handleChange = (e) => {
    const rawValue = e.target.value;
    const parsedValue = currency.parse(rawValue);
    if (onChange) {
      onChange(parsedValue);
    }
  };

  const displayValue = value ? currency.format(value) : '';

  return (
    <div className="relative">
      <input
        ref={ref}
        type="text"
        value={displayValue}
        onChange={handleChange}
        className={`pl-8 ${className}`}
        {...props}
      />
      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
        {currency.symbol}
      </span>
    </div>
  );
});

CurrencyInput.displayName = 'CurrencyInput';