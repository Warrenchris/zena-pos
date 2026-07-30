import React from 'react';

/**
 * Spinner — Accessible loading indicator
 *
 * @param {'sm'|'md'|'lg'} size - Visual size
 * @param {'primary'|'white'|'current'} color - Spinner color
 * @param {string} label - Screen reader label
 * @param {string} className - Additional classes
 */
const sizeMap = {
  sm: 'h-4 w-4 border-[2px]',
  md: 'h-6 w-6 border-[2.5px]',
  lg: 'h-10 w-10 border-[3px]',
};

const colorMap = {
  primary: 'border-primary/30 border-t-primary',
  white:   'border-white/30 border-t-white',
  current: 'border-current/30 border-t-current',
};

export default function Spinner({
  size = 'md',
  color = 'primary',
  label = 'Loading…',
  className = '',
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className={`inline-flex items-center justify-center ${className}`}
    >
      <div
        className={`
          animate-spin rounded-full
          ${sizeMap[size] || sizeMap.md}
          ${colorMap[color] || colorMap.primary}
        `}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
