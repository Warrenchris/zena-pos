import React from 'react';
import { InboxIcon } from '@heroicons/react/24/outline';

/**
 * EmptyState — Clean light mode empty state component
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
      <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border-default flex items-center justify-center text-primary mb-3 shadow-sm">
        {typeof Icon === 'function' || typeof Icon === 'object' ? (
          <Icon className="h-6 w-6" aria-hidden="true" />
        ) : (
          Icon
        )}
      </div>

      <h4 className="text-h4 font-semibold text-text-primary mb-1 tracking-tight">
        {title}
      </h4>

      <p className="text-body text-text-secondary max-w-md mb-6 leading-relaxed">
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
