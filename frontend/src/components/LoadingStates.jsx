import React from 'react';
import Spinner from './ui/Spinner';

export const InlineLoading = ({ text = 'Loading...', variant = 'default' }) => {
  return (
    <div className="flex items-center justify-center p-4 gap-2" role="status" aria-label={text}>
      <Spinner size="sm" color="primary" />
      <span className="text-small font-medium text-text-secondary">{text}</span>
    </div>
  );
};

export const LoadingOverlay = ({ children, isLoading, text = 'Loading...' }) => {
  if (!isLoading) return children;

  return (
    <div className="relative">
      {children}
      <div className="absolute inset-0 bg-white/60 backdrop-blur-xs flex items-center justify-center transition-all duration-150 z-20" role="status" aria-label={text}>
        <div className="flex items-center gap-3 bg-white border border-border-default shadow-floating rounded-xl px-5 py-3">
          <Spinner size="md" color="primary" />
          <span className="text-small font-semibold text-text-primary">{text}</span>
        </div>
      </div>
    </div>
  );
};

export const SkeletonLoader = ({ lines = 1, className = "" }) => {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array(lines).fill(0).map((_, i) => (
        <div key={i} className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-4 py-1">
            <div className="h-4 bg-surface-3 rounded-md w-3/4"></div>
          </div>
        </div>
      ))}
    </div>
  );
};

export const GridSkeletonLoader = ({ items = 4, className = "" }) => {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
      {Array(items).fill(0).map((_, i) => (
        <div key={i} className="animate-pulse bg-white border border-border-default rounded-xl p-4 shadow-sm">
          <div className="rounded-lg bg-surface-3 h-40 mb-4"></div>
          <div className="h-4 bg-surface-3 rounded-md w-3/4 mb-2"></div>
          <div className="h-4 bg-surface-3 rounded-md w-1/2"></div>
        </div>
      ))}
    </div>
  );
};