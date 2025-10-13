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
    if (toasts.length > 0) {
      const timer = setTimeout(() => {
        setToasts(current => current.slice(1));
      }, toasts[0].duration || 4000);

      return () => clearTimeout(timer);
    }
  }, [toasts]);

  const addToast = (toast) => {
    const id = Math.random().toString(36).substring(7);
    setToasts(current => [...current, { ...toast, id }]);
  };

  const removeToast = (id) => {
    setToasts(current => current.filter(toast => toast.id !== id));
  };

  const showToast = ({ type = 'info', title, message, duration = 4000 }) => {
    addToast({ type, title, message, duration });
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
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
  info: InformationCircleIcon,
  warning: ExclamationTriangleIcon
};

const baseStyles = 'pointer-events-auto w-full max-w-sm overflow-hidden rounded-xl shadow-lg ring-1 ring-black/10 backdrop-blur-md transform transition-all duration-300 ease-in-out';

const bgByType = {
  success: 'bg-green-600/15 border border-green-500/30',
  error: 'bg-red-600/15 border border-red-500/30',
  warning: 'bg-yellow-600/15 border border-yellow-500/30',
  info: 'bg-blue-600/15 border border-blue-500/30'
};

const textByType = {
  success: 'text-green-500',
  error: 'text-red-500',
  warning: 'text-yellow-500',
  info: 'text-blue-500'
};
  error: 'bg-red-600/15 border border-red-500/30',
  info: 'bg-blue-600/15 border border-blue-500/30'
};

const textByType = {
  success: 'text-green-300',
  error: 'text-red-300',
  info: 'text-blue-300'
};

export default function Toast({ type = 'info', title, message, onClose, autoCloseMs = 4000 }) {
  const Icon = iconsByType[type] || InformationCircleIcon;

  useEffect(() => {
    if (!autoCloseMs) return;
    const id = setTimeout(() => onClose?.(), autoCloseMs);
    return () => clearTimeout(id);
  }, [autoCloseMs, onClose]);

  return (
    <div className={`${baseStyles} ${bgByType[type] || ''}`}
         role="status" aria-live="polite">
      <div className="p-4 flex items-start gap-3">
        <div className={`shrink-0 rounded-lg p-1.5 bg-black/30 ${textByType[type]}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex-1">
          {title && <p className="text-sm font-semibold text-gray-100">{title}</p>}
          {message && <p className="text-sm text-gray-300 mt-0.5">{message}</p>}
        </div>
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-200 rounded-lg p-1 hover:bg-white/10 transition-colors"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
