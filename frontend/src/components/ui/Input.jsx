import React, { useId, useState } from 'react';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';

/**
 * Input — Accessible form control primitive (text, password, select, textarea, etc.)
 */
export default function Input({
  id: customId,
  label,
  type = 'text',
  error,
  helperText,
  required = false,
  disabled = false,
  placeholder,
  leftIcon: LeftIcon = null,
  rightIcon: RightIcon = null,
  options = [], // For type="select"
  rows = 3,    // For type="textarea"
  maxLength,
  value,
  onChange,
  className = '',
  containerClassName = '',
  ...props
}) {
  const generatedId = useId();
  const inputId = customId || generatedId;
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;

  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;

  const currentLength = typeof value === 'string' || typeof value === 'number' ? String(value).length : 0;

  const ariaDescribedBy = [
    error ? errorId : null,
    helperText ? helperId : null
  ].filter(Boolean).join(' ') || undefined;

  const baseInputStyles = `
    w-full bg-surface-1 text-text-primary placeholder-text-muted
    border rounded-md text-body font-sans transition-colors duration-150
    focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-border-focus
    disabled:opacity-40 disabled:cursor-not-allowed
    ${error ? 'border-danger focus:ring-danger/40 focus:border-danger' : 'border-border-default hover:border-border-hover'}
  `;

  return (
    <div className={`w-full flex flex-col gap-1.5 ${containerClassName}`}>
      {label && (
        <div className="flex justify-between items-center">
          <label
            htmlFor={inputId}
            className="text-small font-medium text-text-secondary select-none flex items-center gap-1"
          >
            {label}
            {required && <span className="text-danger" aria-hidden="true">*</span>}
          </label>
          {maxLength && (
            <span className="text-caption text-text-muted">
              {currentLength}/{maxLength}
            </span>
          )}
        </div>
      )}

      <div className="relative w-full flex items-center">
        {LeftIcon && (
          <div className="absolute left-3 pointer-events-none text-text-muted flex items-center justify-center">
            {typeof LeftIcon === 'function' || typeof LeftIcon === 'object' ? (
              <LeftIcon className="h-5 w-5" aria-hidden="true" />
            ) : (
              LeftIcon
            )}
          </div>
        )}

        {type === 'textarea' ? (
          <textarea
            id={inputId}
            value={value}
            onChange={onChange}
            disabled={disabled}
            required={required}
            maxLength={maxLength}
            placeholder={placeholder}
            rows={rows}
            aria-invalid={error ? 'true' : undefined}
            aria-required={required ? 'true' : undefined}
            aria-describedby={ariaDescribedBy}
            className={`
              ${baseInputStyles} p-3
              ${LeftIcon ? 'pl-10' : ''}
              ${className}
            `}
            {...props}
          />
        ) : type === 'select' ? (
          <select
            id={inputId}
            value={value}
            onChange={onChange}
            disabled={disabled}
            required={required}
            aria-invalid={error ? 'true' : undefined}
            aria-required={required ? 'true' : undefined}
            aria-describedby={ariaDescribedBy}
            className={`
              ${baseInputStyles} px-3 py-2.5 appearance-none pr-8 cursor-pointer
              ${LeftIcon ? 'pl-10' : ''}
              ${className}
            `}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option
                key={typeof opt === 'object' ? opt.value : opt}
                value={typeof opt === 'object' ? opt.value : opt}
                className="bg-surface-2 text-text-primary"
              >
                {typeof opt === 'object' ? opt.label : opt}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={inputId}
            type={inputType}
            value={value}
            onChange={onChange}
            disabled={disabled}
            required={required}
            maxLength={maxLength}
            placeholder={placeholder}
            aria-invalid={error ? 'true' : undefined}
            aria-required={required ? 'true' : undefined}
            aria-describedby={ariaDescribedBy}
            className={`
              ${baseInputStyles} px-3 py-2.5 min-h-[44px]
              ${LeftIcon ? 'pl-10' : ''}
              ${(RightIcon || isPassword) ? 'pr-10' : ''}
              ${className}
            `}
            {...props}
          />
        )}

        {isPassword ? (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
            className="absolute right-3 text-text-muted hover:text-text-primary transition-colors focus:outline-none"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <EyeSlashIcon className="h-5 w-5" />
            ) : (
              <EyeIcon className="h-5 w-5" />
            )}
          </button>
        ) : RightIcon ? (
          <div className="absolute right-3 pointer-events-none text-text-muted flex items-center justify-center">
            {typeof RightIcon === 'function' || typeof RightIcon === 'object' ? (
              <RightIcon className="h-5 w-5" aria-hidden="true" />
            ) : (
              RightIcon
            )}
          </div>
        ) : null}
      </div>

      {error && (
        <p id={errorId} role="alert" className="text-caption text-danger font-medium flex items-center gap-1">
          {error}
        </p>
      )}

      {!error && helperText && (
        <p id={helperId} className="text-caption text-text-muted">
          {helperText}
        </p>
      )}
    </div>
  );
}
