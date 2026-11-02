import React, { lazy } from 'react';

// Safe Lazy Loader with automatic retry and graceful fallback on Vite HMR/Chunk loading errors
export const safeLazy = (importFunc) => {
  return lazy(() =>
    importFunc().catch(error => {
      console.error('Dynamic module import failed:', error);
      if (typeof window !== 'undefined') {
        const key = 'chunk_retry_' + window.location.pathname;
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, 'true');
          window.location.reload();
          return new Promise(() => {});
        }
        sessionStorage.removeItem(key);
      }
      return {
        default: () => (
          <div className="p-8 max-w-md mx-auto my-12 bg-surface border border-border-default rounded-2xl shadow-floating text-center">
            <div className="w-12 h-12 bg-warning/10 text-warning rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-h3 font-bold text-text-primary mb-1">Page Update Available</h3>
            <p className="text-small text-text-muted mb-4">A new application update or component file was updated. Please refresh your browser.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover transition-colors"
            >
              Reload Page
            </button>
          </div>
        )
      };
    })
  );
};

export default safeLazy;

