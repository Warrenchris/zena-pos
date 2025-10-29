import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  CheckCircleIcon, 
  XCircleIcon, 
  XMarkIcon, 
  InformationCircleIcon, 
  ExclamationTriangleIcon 
} from '@heroicons/react/24/outline';

const SnackbarContext = createContext(null);

export function useSnackbar() {
  const context = useContext(SnackbarContext);
  if (!context) {
    throw new Error('useSnackbar must be used within a SnackbarProvider');
  }
  return context;
}

export function SnackbarProvider({ children }) {
  const [snackbars, setSnackbars] = useState([]);

  useEffect(() => {
    // Make snackbar function globally accessible
    if (typeof window !== 'undefined') {
      window.showSnackbar = ({ type = 'info', message, duration = 3000, action }) => {
        const id = Math.random().toString(36).substr(2, 9);
        const newSnackbar = { id, type, message, action };
        
        setSnackbars(current => [...current, newSnackbar]);

        // Auto-dismiss after duration
        setTimeout(() => {
          setSnackbars(current => current.filter(sb => sb.id !== id));
        }, duration);
      };
    }

    // Cleanup
    return () => {
      if (typeof window !== 'undefined') {
        delete window.showSnackbar;
      }
    };
  }, []);

  const removeSnackbar = (id) => {
    setSnackbars(current => current.filter(sb => sb.id !== id));
  };

  const showSnackbar = ({ type = 'info', message, duration = 3000, action }) => {
    if (window.showSnackbar) {
      window.showSnackbar({ type, message, duration, action });
    }
  };

  return (
    <SnackbarContext.Provider value={{ showSnackbar }}>
      {children}
      {/* Snackbar Container - Bottom-center on mobile, bottom-right on desktop */}
      <div className="fixed z-50 flex flex-col gap-2 bottom-4 left-1/2 -translate-x-1/2 w-[90%] max-w-md px-0 pb-[env(safe-area-inset-bottom)] md:left-auto md:translate-x-0 md:right-4 md:w-full md:max-w-sm">
        {snackbars.map((snackbar) => (
          <Snackbar
            key={snackbar.id}
            type={snackbar.type}
            message={snackbar.message}
            action={snackbar.action}
            onClose={() => removeSnackbar(snackbar.id)}
          />
        ))}
      </div>
    </SnackbarContext.Provider>
  );
}

const iconsByType = {
  success: CheckCircleIcon,
  error: XCircleIcon,
  warning: ExclamationTriangleIcon,
  info: InformationCircleIcon
};

const bgByType = {
  success: 'bg-brand-black',
  error: 'bg-red-700',
  warning: 'bg-brand-black',
  info: 'bg-brand-black'
};

const textByType = {
  success: 'text-zana-yellow',
  error: 'text-white',
  warning: 'text-zana-yellow',
  info: 'text-zana-yellow'
};

function Snackbar({ type = 'info', message, action, onClose }) {
  const Icon = iconsByType[type];

  return (
    <div 
      className={`
        ${bgByType[type]} ${textByType[type]} border border-zana-borderTint ring-1 ring-[rgba(255,214,0,0.2)]
        px-4 py-3 rounded-xl shadow-zana
        flex items-center justify-between gap-4
        animate-slideUp
        min-h-[52px] w-full
      `}
      role="alert"
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Icon className={`h-5 w-5 flex-shrink-0 ${type !== 'error' ? 'text-zana-yellow' : 'text-white'}`} />
        <p className="text-sm font-medium flex-1 break-words break-all whitespace-normal leading-snug">{message}</p>
      </div>
      
      <div className="flex items-center gap-2">
        {action && (
          <button
            onClick={() => {
              action.onClick();
              onClose();
            }}
            className={`text-sm font-semibold hover:opacity-80 underline ${type !== 'error' ? 'text-zana-yellow' : 'text-white'}`}
          >
            {action.label}
          </button>
        )}
        <button
          onClick={onClose}
          className={`hover:opacity-80 transition-opacity ${type !== 'error' ? 'text-zana-yellow' : 'text-white'}`}
          aria-label="Close"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

export default Snackbar;

