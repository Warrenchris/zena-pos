import React from 'react';
import Spinner from './Spinner';

/**
 * Button — Refined enterprise SaaS button primitive
 * Warm Mocha Accent with high contrast light & dark states.
 */
const variantStyles = {
  primary: `
    bg-primary text-white font-semibold
    hover:bg-primary-hover active:bg-primary-active
    shadow-sm border border-primary/20
  `,
  secondary: `
    bg-surface text-text-primary border border-border-default font-medium
    hover:bg-surface-2 hover:border-border-hover active:bg-surface-3
    shadow-2xs
  `,
  outline: `
    bg-transparent text-text-primary border border-border-default font-medium
    hover:bg-surface-2 hover:border-border-hover active:bg-surface-3
  `,
  ghost: `
    bg-transparent text-text-secondary font-medium
    hover:bg-surface-2 hover:text-text-primary active:bg-surface-3
  `,
  danger: `
    bg-danger text-white font-semibold
    hover:bg-red-600 active:bg-red-700
    shadow-sm
  `,
  success: `
    bg-success text-white font-semibold
    hover:bg-emerald-600 active:bg-emerald-700
    shadow-sm
  `,
};

const sizeStyles = {
  sm: 'px-3 py-1.5 text-small rounded-xl gap-1.5 min-h-[36px]',
  md: 'px-4 py-2 text-body rounded-xl gap-2 min-h-[40px]',
  lg: 'px-5 py-2.5 text-h3 rounded-2xl gap-2.5 min-h-[46px]',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  leftIcon: LeftIcon = null,
  rightIcon: RightIcon = null,
  fullWidth = false,
  as: Component = 'button',
  children,
  className = '',
  type = 'button',
  onClick,
  ...props
}) {
  const isDisabled = disabled || loading;

  const handleClick = (e) => {
    if (isDisabled) {
      e.preventDefault();
      return;
    }
    if (onClick) {
      onClick(e);
    }
  };

  return (
    <Component
      type={Component === 'button' ? type : undefined}
      disabled={Component === 'button' ? isDisabled : undefined}
      aria-disabled={isDisabled ? 'true' : undefined}
      aria-busy={loading ? 'true' : undefined}
      onClick={handleClick}
      className={`
        inline-flex items-center justify-center font-sans transition-all duration-150 ease-out
        select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-app
        ${fullWidth ? 'w-full' : ''}
        ${isDisabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : 'cursor-pointer active:scale-[0.98]'}
        ${variantStyles[variant] || variantStyles.primary}
        ${sizeStyles[size] || sizeStyles.md}
        ${className}
      `}
      {...props}
    >
      {loading ? (
        <>
          <Spinner size={size === 'lg' ? 'md' : 'sm'} color="white" />
          <span>{children}</span>
        </>
      ) : (
        <>
          {LeftIcon && (
            <span className="shrink-0">
              {typeof LeftIcon === 'function' || typeof LeftIcon === 'object' ? (
                <LeftIcon className={size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} aria-hidden="true" />
              ) : (
                LeftIcon
              )}
            </span>
          )}
          <span>{children}</span>
          {RightIcon && (
            <span className="shrink-0">
              {typeof RightIcon === 'function' || typeof RightIcon === 'object' ? (
                <RightIcon className={size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} aria-hidden="true" />
              ) : (
                RightIcon
              )}
            </span>
          )}
        </>
      )}
    </Component>
  );
}
