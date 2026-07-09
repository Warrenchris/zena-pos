import React, { createContext, useContext, useEffect, useState } from 'react';
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

  useEffect(() => {
    // Make toast function globally accessible
    if (typeof window !== 'undefined') {
      window.showToast = ({ type = 'info', title, message, duration = 4000, id }) => {
        const toastId = id || Math.random().toString(36).substr(2, 9);
        
        setToasts(current => {
          // If a toast with the same id already exists, ignore the duplicate
          if (current.some(toast => toast.id === toastId)) {
            return current;
          }

          // Auto-dismiss after duration
          setTimeout(() => {
            setToasts(curr => curr.filter(toast => toast.id !== toastId));
          }, duration);

          const nextToasts = [...current, { id: toastId, type, title, message }];
          // Keep only the last 3 toasts to prevent screen crowding
          if (nextToasts.length > 3) {
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
    };
  }, []);

  const removeToast = (id) => {
    setToasts(current => current.filter(toast => toast.id !== id));
  };

  const showToast = ({ type = 'info', title, message, duration = 4000, id }) => {
    if (window.showToast) {
      window.showToast({ type, title, message, duration, id });
    }
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed z-50 flex flex-col gap-2 items-center bottom-4 left-4 right-4 pb-[env(safe-area-inset-bottom)] md:items-end md:bottom-4 md:right-4 md:left-auto">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            type={toast.type}
            title={toast.title}
            message={toast.message}
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

const baseStyles = 'pointer-events-auto w-full max-w-md md:max-w-lg overflow-hidden rounded-2xl shadow-2xl ring-1 backdrop-blur-xl transform transition-all duration-300 ease-out animate-toast-in border';

const stylesByType = {
  success: 'bg-gradient-to-r from-green-900/80 to-emerald-900/60 border-green-500/40 ring-green-500/30',
  error: 'bg-gradient-to-r from-red-900/80 to-red-800/60 border-red-500/40 ring-red-500/30',
  warning: 'bg-gradient-to-r from-brand-black/80 to-brand-gray/60 border-brand-yellow/40 ring-brand-yellow/30',
  info: 'bg-gradient-to-r from-brand-black/80 to-brand-gray/60 border-brand-yellow/40 ring-brand-yellow/30'
};

const iconColorByType = {
  success: 'text-green-400',
  error: 'text-red-400',
  warning: 'text-brand-yellow',
  info: 'text-brand-yellow'
};

const textColorByType = {
  success: 'text-green-100',
  error: 'text-red-100',
  warning: 'text-brand-yellow/90',
  info: 'text-brand-yellow/90'
};

function Toast({ type = 'info', title, message, onClose }) {
  const Icon = iconsByType[type];

  return (
    <div className={`${baseStyles} ${stylesByType[type]} min-h-[56px] group`}>
      <div className="flex items-start p-5 gap-4">
        <div className={`flex-shrink-0 mt-0.5 ${iconColorByType[type]} animate-pulse`}>
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          {title && (
            <p className={`text-sm font-bold ${textColorByType[type]} break-words break-all`}>
              {title}
            </p>
          )}
          {message && (
            <p className="mt-1 text-sm text-white/80 break-words break-all whitespace-normal leading-snug font-medium">
              {message}
            </p>
          )}
        </div>
        <div className="ml-3 flex flex-shrink-0">
          <button
            type="button"
            className={`inline-flex rounded-lg transition-all duration-200 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2 ${iconColorByType[type]}`}
            onClick={onClose}
          >
            <span className="sr-only">Dismiss</span>
            <XMarkIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
      {/* Progress bar indicator */}
      <div className={`h-1 bg-gradient-to-r ${
        type === 'success' ? 'from-green-400 to-emerald-400' :
        type === 'error' ? 'from-red-400 to-red-500' :
        'from-brand-yellow to-brand-yellowDark'
      } animate-pulse`}></div>
    </div>
  );
}

export default Toast;