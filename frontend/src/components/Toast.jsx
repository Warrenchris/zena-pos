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
      window.showToast = ({ type = 'info', title, message, duration = 4000 }) => {
        const id = Math.random().toString(36).substr(2, 9);
        const newToast = { id, type, title, message };
        
        setToasts(current => [...current, newToast]);

        // Auto-dismiss after duration
        setTimeout(() => {
          setToasts(current => current.filter(toast => toast.id !== id));
        }, duration);
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

  const showToast = ({ type = 'info', title, message, duration = 4000 }) => {
    if (window.showToast) {
      window.showToast({ type, title, message, duration });
    }
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
  warning: ExclamationTriangleIcon,
  info: InformationCircleIcon
};

const baseStyles = 'pointer-events-auto w-full max-w-sm overflow-hidden rounded-xl shadow-zana ring-1 ring-[rgba(255,214,0,0.2)] backdrop-blur-md transform transition-all duration-300 ease-in-out bg-brand-black border border-zana-borderTint';

const bgByType = {
  success: 'bg-brand-black',
  error: 'bg-brand-black',
  warning: 'bg-brand-black',
  info: 'bg-brand-black'
};

const textByType = {
  success: 'text-green-400',
  error: 'text-red-400',
  warning: 'text-zana-yellow',
  info: 'text-zana-yellow'
};

function Toast({ type = 'info', title, message, onClose }) {
  const Icon = iconsByType[type];

  return (
    <div className={`${baseStyles} ${bgByType[type]} animate-slideIn`}>
      <div className="flex items-start p-4">
        <div className="flex-shrink-0">
          <Icon className={`h-6 w-6 ${textByType[type]}`} aria-hidden="true" />
        </div>
        <div className="ml-3 w-0 flex-1">
          {title && <p className={`text-sm font-medium ${textByType[type]}`}>{title}</p>}
          {message && <p className="mt-1 text-sm text-white/80">{message}</p>}
        </div>
        <div className="ml-4 flex flex-shrink-0">
          <button
            type="button"
            className={`inline-flex rounded-md ${textByType[type]} hover:opacity-75 focus:outline-none focus:ring-2 focus:ring-zana-yellow/50`}
            onClick={onClose}
          >
            <span className="sr-only">Close</span>
            <XMarkIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default Toast;