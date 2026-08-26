import React from 'react';

export default function Container({
  children,
  className = '',
  wide = false,
  as: Component = 'div',
}) {
  return (
    <Component
      className={`mx-auto w-full ${
        wide ? 'max-w-[1440px] px-[var(--layout-padding-inline-wide)]' : 'max-w-[1280px] px-[var(--layout-padding-inline)]'
      } ${className}`}
    >
      {children}
    </Component>
  );
}
