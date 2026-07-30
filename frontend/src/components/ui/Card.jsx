import React from 'react';

/**
 * Card — Floating Enterprise SaaS Widget Primitive
 * Inspired by Linear, Stripe Dashboard, Vercel & Notion.
 * Structure: Card (24px radius, 24px padding) -> Header -> Body -> Footer -> Actions
 */
const variantStyles = {
  default:  'bg-white border-border-default shadow-floating',
  elevated: 'bg-white border-border-default shadow-lg',
  outlined: 'bg-white/60 backdrop-blur-sm border-border-default',
  flat:     'bg-surface-0 border border-border-default',
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
          rounded-2xl border p-6 bg-white border-border-default shadow-floating
          animate-pulse ${className}
        `}
      >
        <div className="h-5 w-1/3 bg-surface-2 rounded-md mb-4" />
        <div className="h-4 w-2/3 bg-surface-2 rounded-md mb-2" />
        <div className="h-4 w-1/2 bg-surface-2 rounded-md" />
      </div>
    );
  }

  return (
    <div
      className={`
        rounded-2xl border transition-all duration-200 ease-out overflow-hidden
        ${variantStyles[variant] || variantStyles.default}
        ${hoverable ? 'hover:shadow-lg hover:border-border-hover' : ''}
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
    <div className={`px-6 py-5 border-b border-border-default/70 flex items-center justify-between gap-4 ${className}`}>
      {children ? children : (
        <>
          <div>
            {title && <h3 className="text-h3 font-semibold text-text-primary tracking-tight">{title}</h3>}
            {subtitle && <p className="text-caption text-text-secondary mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="flex items-center gap-2">{action}</div>}
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
    <div className={`px-6 py-4 border-t border-border-default/70 bg-surface-0/60 flex items-center justify-between gap-4 ${className}`} {...props}>
      {children}
    </div>
  );
};

