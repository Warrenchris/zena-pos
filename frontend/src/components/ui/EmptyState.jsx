import React from 'react';
import { InboxIcon } from '@heroicons/react/24/outline';

/**
 * EmptyState — Accessible empty state primitive with illustration/icon, title, description, and call to action
 */
export default function EmptyState({
  icon: Icon = InboxIcon,
  title = 'No items found',
  description = 'There are no records to display at this time.',
  primaryAction = null,
  secondaryAction = null,
  className = '',
}) {
  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center min-h-[220px] ${className}`}>
      <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border-default flex items-center justify-center text-primary mb-4 shadow-sm">
        {typeof Icon === 'function' || typeof Icon === 'object' ? (
          <Icon className="h-7 w-7" aria-hidden="true" />
        ) : (
          Icon
        )}
      </div>

      <h4 className="text-h4 font-semibold text-text-primary mb-1">
        {title}
      </h4>

      <p className="text-body text-text-muted max-w-md mb-6 leading-relaxed">
        {description}
      </p>

      {(primaryAction || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {primaryAction}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
