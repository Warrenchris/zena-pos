import React from 'react';

/**
 * Badge — Semantic status indicator
 *
 * @param {'success'|'warning'|'danger'|'info'|'neutral'} variant
 * @param {'sm'|'md'} size
 * @param {boolean} dot - Show leading dot indicator
 * @param {React.ReactNode} icon - Optional leading icon
 * @param {React.ReactNode} children - Badge text content
 * @param {string} className - Additional classes
 */
const variantStyles = {
  success: 'bg-success-muted text-success   border-success/30',
  warning: 'bg-warning-muted text-warning   border-warning/30',
  danger:  'bg-danger-muted  text-danger    border-danger/30',
  info:    'bg-info-muted    text-info      border-info/30',
  neutral: 'bg-surface-3    text-text-secondary border-border-default',
};

const dotColors = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger:  'bg-danger',
  info:    'bg-info',
  neutral: 'bg-text-muted',
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
