import React from 'react';

/**
 * Badge — Refined enterprise badge component
 */
const variantStyles = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger:  'bg-red-50 text-red-700 border-red-200',
  info:    'bg-sky-50 text-sky-700 border-sky-200',
  neutral: 'bg-gray-100 text-gray-700 border-gray-200',
};

const dotColors = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger:  'bg-red-500',
  info:    'bg-sky-500',
  neutral: 'bg-gray-400',
};

const sizeStyles = {
  sm: 'px-2 py-0.5 text-caption gap-1',
  md: 'px-2.5 py-1 text-small gap-1.5',
};

export default function Badge({
  variant = 'neutral',
  size = 'sm',
  dot = false,
  icon: Icon = null,
  children,
  className = '',
}) {
  return (
    <span
      className={`
        inline-flex items-center font-medium rounded-full border
        whitespace-nowrap leading-none
        ${variantStyles[variant] || variantStyles.neutral}
        ${sizeStyles[size] || sizeStyles.sm}
        ${className}
      `}
    >
      {dot && (
        <span
          className={`
            shrink-0 rounded-full
            ${size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2'}
            ${dotColors[variant] || dotColors.neutral}
          `}
          aria-hidden="true"
        />
      )}
      {Icon && (
        <Icon
          className={`shrink-0 ${size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'}`}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
