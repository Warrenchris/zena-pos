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
      {/* Snackbar Container - Fixed at bottom center */}
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 flex flex-col gap-2 max-w-md w-full px-4">
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
  success: 'bg-green-600',
  error: 'bg-red-600',
  warning: 'bg-yellow-600',
  info: 'bg-blue-600'
};

const textByType = {
  success: 'text-white',
  error: 'text-white',
  warning: 'text-white',
  info: 'text-white'
};

function Snackbar({ type = 'info', message, action, onClose }) {
  const Icon = iconsByType[type];

  return (
    <div 
      className={`
        ${bgByType[type]} ${textByType[type]}
        px-4 py-3 rounded-lg shadow-lg
        flex items-center justify-between gap-4
        animate-slideUp
        min-h-[48px]
      `}
      role="alert"
    >
      <div className="flex items-center gap-3 flex-1">
        <Icon className="h-5 w-5 flex-shrink-0" />
        <p className="text-sm font-medium flex-1">{message}</p>
      </div>
      
      <div className="flex items-center gap-2">
        {action && (
          <button
            onClick={() => {
              action.onClick();
              onClose();
            }}
            className="text-sm font-semibold hover:opacity-80 underline"
          >
            {action.label}
          </button>
        )}
        <button
          onClick={onClose}
          className="hover:opacity-80 transition-opacity"
          aria-label="Close"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

export default Snackbar;

