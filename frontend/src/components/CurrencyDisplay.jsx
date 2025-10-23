import React from 'react';
import { useCurrency } from '../hooks/useCurrency';

/**
 * CurrencyDisplay component for consistent currency formatting
 * @param {Object} props - Component props
 * @param {number|string} props.amount - Amount to display
 * @param {boolean} props.showSymbol - Whether to show currency symbol
 * @param {string} props.className - CSS classes
 * @param {string} props.variant - Display variant ('default', 'large', 'small', 'bold')
 * @param {boolean} props.zeroAsDash - Show dash for zero amounts
 * @returns {JSX.Element} Formatted currency display
 */
const CurrencyDisplay = ({ 
  amount, 
  showSymbol = true, 
  className = '', 
  variant = 'default',
  zeroAsDash = false,
  ...props 
}) => {
  const { format, getSymbol } = useCurrency();

  // Handle zero amounts
  if (zeroAsDash && (amount === 0 || amount === '0' || !amount)) {
    return <span className={className} {...props}>-</span>;
  }

  // Format the amount
  const formattedAmount = format(amount);

  // Get base classes based on variant
  const getVariantClasses = () => {
    switch (variant) {
      case 'large':
        return 'text-2xl font-bold';
      case 'small':
        return 'text-sm';
      case 'bold':
        return 'font-bold';
      default:
        return 'text-base';
    }
  };

  const baseClasses = getVariantClasses();
  const combinedClasses = `${baseClasses} ${className}`.trim();

  return (
    <span className={combinedClasses} {...props}>
      {formattedAmount}
    </span>
  );
};

/**
 * CurrencyInput component for currency input fields
 * @param {Object} props - Component props
 * @param {number|string} props.value - Input value
 * @param {Function} props.onChange - Change handler
 * @param {string} props.placeholder - Placeholder text
 * @param {string} props.className - CSS classes
 * @param {boolean} props.disabled - Whether input is disabled
 * @param {boolean} props.required - Whether input is required
 * @returns {JSX.Element} Currency input field
 */
export const CurrencyInput = ({ 
  value, 
  onChange, 
  placeholder = '0.00', 
  className = '',
  disabled = false,
  required = false,
  ...props 
}) => {
  const { getSymbol, getPosition, isValidAmount } = useCurrency();

  const handleChange = (e) => {
    const inputValue = e.target.value;
    
    // Allow empty input
    if (inputValue === '') {
      onChange('');
      return;
    }

    // Validate input
    if (!isValidAmount(inputValue)) {
      return; // Don't update if invalid
    }

    onChange(inputValue);
  };

  const handleBlur = (e) => {
    // Format the value on blur
    const inputValue = e.target.value;
    if (inputValue && !isNaN(parseFloat(inputValue))) {
      const formatted = parseFloat(inputValue).toFixed(2);
      onChange(formatted);
    }
  };

  const getInputClasses = () => {
    const baseClasses = 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';
    const disabledClasses = disabled ? 'bg-gray-100 cursor-not-allowed' : '';
    return `${baseClasses} ${disabledClasses} ${className}`.trim();
  };

  return (
    <div className="relative">
      {getPosition() === 'before' && (
        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 pointer-events-none">
          {getSymbol()}
        </span>
      )}
      <input
        type="text"
        value={value || ''}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={getInputClasses()}
        disabled={disabled}
        required={required}
        style={{ paddingLeft: getPosition() === 'before' ? '2.5rem' : '0.75rem' }}
        {...props}
      />
      {getPosition() === 'after' && (
        <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 pointer-events-none">
          {getSymbol()}
        </span>
      )}
    </div>
  );
};

/**
 * CurrencyBadge component for displaying currency in badges/chips
 * @param {Object} props - Component props
 * @param {number|string} props.amount - Amount to display
 * @param {string} props.variant - Badge variant ('success', 'warning', 'danger', 'info')
 * @param {string} props.className - CSS classes
 * @returns {JSX.Element} Currency badge
 */
export const CurrencyBadge = ({ 
  amount, 
  variant = 'default', 
  className = '',
  ...props 
}) => {
  const { format } = useCurrency();

  const getVariantClasses = () => {
    switch (variant) {
      case 'success':
        return 'bg-green-100 text-green-800';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800';
      case 'danger':
        return 'bg-red-100 text-red-800';
      case 'info':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const baseClasses = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';
  const variantClasses = getVariantClasses();
  const combinedClasses = `${baseClasses} ${variantClasses} ${className}`.trim();

  return (
    <span className={combinedClasses} {...props}>
      {format(amount)}
    </span>
  );
};

export default CurrencyDisplay;
