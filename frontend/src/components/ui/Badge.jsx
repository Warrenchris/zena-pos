import React from 'react';

/**
 * Badge — Refined enterprise badge component
 * Dual theme support with subtle pill styling
 */
const variantStyles = {
  success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20',
  danger:  'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
  info:    'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20',
  neutral: 'bg-surface-2 text-text-secondary border-border-default',
  primary: 'bg-primary/10 text-primary border-primary/20',
};

const dotColors = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger:  'bg-red-500',
  info:    'bg-sky-500',
  neutral: 'bg-text-muted',
  primary: 'bg-primary',
};

const sizeStyles = {
  sm: 'px-2.5 py-0.5 text-caption font-semibold gap-1.5',
  md: 'px-3 py-1 text-small font-semibold gap-2',
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
        whitespace-nowrap leading-none transition-colors duration-150
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
          className={`shrink-0 ${size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'}`}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
