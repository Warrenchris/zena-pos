import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { CheckCircleIcon, XCircleIcon, XMarkIcon, InformationCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

const ToastContext = createContext(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timeoutsRef = useRef(new Map());

  const removeToast = (id) => {
    if (timeoutsRef.current.has(id)) {
      clearTimeout(timeoutsRef.current.get(id));
      timeoutsRef.current.delete(id);
    }
    setToasts(current => current.filter(toast => toast.id !== id));
  };

  useEffect(() => {
    // Make toast function globally accessible
    if (typeof window !== 'undefined') {
      window.showToast = ({ type = 'info', title, message, duration = 4000, id }) => {
        const toastId = id || Math.random().toString(36).substring(2, 11);

        setToasts(current => {
          // If a toast with the same id already exists, ignore duplicate
          if (current.some(toast => toast.id === toastId)) {
            return current;
          }

          // Schedule auto-dismiss
          const timeoutId = setTimeout(() => {
            timeoutsRef.current.delete(toastId);
            setToasts(curr => curr.filter(toast => toast.id !== toastId));
          }, duration);

          timeoutsRef.current.set(toastId, timeoutId);

          const newToast = { id: toastId, type, title, message, duration };
          const nextToasts = [...current, newToast];

          // Keep at most 3 toasts visible to prevent vertical clutter
          if (nextToasts.length > 3) {
            const evicted = nextToasts.slice(0, nextToasts.length - 3);
            evicted.forEach(t => {
              if (timeoutsRef.current.has(t.id)) {
                clearTimeout(timeoutsRef.current.get(t.id));
                timeoutsRef.current.delete(t.id);
              }
            });
            return nextToasts.slice(nextToasts.length - 3);
          }
          return nextToasts;
        });
      };
    }

    // Cleanup
    return () => {
      if (typeof window !== 'undefined') {
        delete window.showToast;
      }
      timeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
      timeoutsRef.current.clear();
    };
  }, []);

  const showToast = ({ type = 'info', title, message, duration = 4000, id }) => {
    if (window.showToast) {
      window.showToast({ type, title, message, duration, id });
    }
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="fixed z-[9999] pointer-events-none flex flex-col gap-3 items-center bottom-5 left-4 right-4 pb-[env(safe-area-inset-bottom)] md:items-end md:bottom-5 md:right-5 md:left-auto max-w-md w-full sm:w-auto"
        aria-live="polite"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            type={toast.type}
            title={toast.title}
            message={toast.message}
            duration={toast.duration}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const iconsByType = {
  success: CheckCircleIcon,
  error: XCircleIcon,
  warning: ExclamationTriangleIcon,
  info: InformationCircleIcon
};

const baseStyles = 'pointer-events-auto w-full max-w-md sm:max-w-sm overflow-hidden rounded-2xl shadow-floating ring-1 backdrop-blur-xl transition-all duration-300 ease-out border bg-surface text-text-primary';

const stylesByType = {
  success: 'border-emerald-500/40 ring-emerald-500/20',
  error: 'border-red-500/40 ring-red-500/20',
  warning: 'border-amber-500/40 ring-amber-500/20',
  info: 'border-sky-500/40 ring-sky-500/20'
};

const iconBgByType = {
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  error: 'bg-red-500/10 text-red-600 dark:text-red-400',
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  info: 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
};

const progressBarByType = {
  success: 'bg-gradient-to-r from-emerald-500 to-teal-500',
  error: 'bg-gradient-to-r from-red-500 to-rose-600',
  warning: 'bg-gradient-to-r from-amber-500 to-amber-600',
  info: 'bg-gradient-to-r from-sky-500 to-blue-500'
};

function Toast({ type = 'info', title, message, duration = 4000, onClose }) {
  const Icon = iconsByType[type] || InformationCircleIcon;

  return (
    <div className={`${baseStyles} ${stylesByType[type] || stylesByType.info} group`}>
      <div className="flex items-start p-4 gap-3.5">
        <div className={`flex-shrink-0 p-2 rounded-xl ${iconBgByType[type] || iconBgByType.info}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          {title && (
            <p className="text-sm font-semibold text-text-primary break-words">
              {title}
            </p>
          )}
          {message && (
            <p className="mt-1 text-sm text-text-secondary break-words whitespace-normal leading-relaxed font-normal">
              {message}
            </p>
          )}
        </div>
        <div className="flex flex-shrink-0 ml-1">
          <button
            type="button"
            className="inline-flex rounded-lg p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
            onClick={onClose}
            aria-label="Dismiss notification"
          >
            <XMarkIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {/* Progress bar indicator */}
      <div className="h-1 w-full bg-surface-2/60 overflow-hidden">
        <div
          className={`h-full ${progressBarByType[type] || progressBarByType.info}`}
          style={{
            animation: `toast-progress ${duration}ms linear forwards`
          }}
        />
      </div>
    </div>
  );
}

export default Toast;