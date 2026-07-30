import React from 'react';

/**
 * Card — Flexible surface component with Header, Body, Footer compound structure
 */
const variantStyles = {
  default:  'bg-surface-1 border-border-default',
  elevated: 'bg-surface-2 border-border-default shadow-md',
  outlined: 'bg-transparent border-border-default',
};

export default function Card({
  variant = 'default',
  hoverable = false,
  loading = false,
  children,
  className = '',
  ...props
}) {
  if (loading) {
    return (
      <div
        className={`
          rounded-xl border p-6 bg-surface-1 border-border-default
          animate-skeleton ${className}
        `}
      >
        <div className="h-6 w-1/3 bg-surface-2 rounded-md mb-4" />
        <div className="h-4 w-2/3 bg-surface-2 rounded-md mb-2" />
        <div className="h-4 w-1/2 bg-surface-2 rounded-md" />
      </div>
    );
  }

  return (
    <div
      className={`
        rounded-xl border transition-all duration-200 overflow-hidden
        ${variantStyles[variant] || variantStyles.default}
        ${hoverable ? 'hover:-translate-y-0.5 hover:shadow-lg hover:border-border-hover' : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}

Card.Header = function CardHeader({ title, subtitle, action, className = '', children }) {
  return (
    <div className={`px-6 py-4 border-b border-border-default flex items-center justify-between gap-4 ${className}`}>
      {children ? children : (
        <>
          <div>
            {title && <h3 className="text-h4 font-semibold text-text-primary">{title}</h3>}
            {subtitle && <p className="text-small text-text-muted mt-0.5">{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </>
      )}
    </div>
  );
};

Card.Body = function CardBody({ className = '', children, ...props }) {
  return (
    <div className={`p-6 ${className}`} {...props}>
      {children}
    </div>
  );
};

Card.Footer = function CardFooter({ className = '', children, ...props }) {
  return (
    <div className={`px-6 py-4 border-t border-border-default bg-surface-0/30 flex items-center justify-between gap-4 ${className}`} {...props}>
      {children}
    </div>
  );
};
