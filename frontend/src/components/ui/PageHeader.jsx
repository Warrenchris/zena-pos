import React from 'react';
import Button from './Button';

/**
 * PageHeader — Clean header component for enterprise SaaS screens
 */
export default function PageHeader({
  title,
  description,
  primaryAction,
  secondaryActions,
  breadcrumbs,
  className = '',
}) {
  return (
    <div className={`mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <div>
        {breadcrumbs && (
          <nav aria-label="Breadcrumb" className="mb-1.5">
            <ol className="flex items-center gap-2 text-caption text-text-muted">
              {breadcrumbs.map((crumb, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  {idx > 0 && <span aria-hidden="true">/</span>}
                  {crumb.href ? (
                    <a href={crumb.href} className="hover:text-text-primary transition-colors">
                      {crumb.label}
                    </a>
                  ) : (
                    <span className="text-text-primary font-medium">{crumb.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}

        <h1 className="text-h2 font-bold text-text-primary tracking-tight">
          {title}
        </h1>

        {description && (
          <p className="text-body text-text-secondary mt-0.5 max-w-3xl">
            {description}
          </p>
        )}
      </div>

      {(primaryAction || secondaryActions) && (
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {secondaryActions}
          {primaryAction && (
            <Button
              variant="primary"
              size="md"
              leftIcon={primaryAction.icon}
              onClick={primaryAction.onClick}
              loading={primaryAction.loading}
              disabled={primaryAction.disabled}
            >
              {primaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
