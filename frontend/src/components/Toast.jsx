import React, { createContext, useContext, useState, useCallback } from 'react';
import { TOAST_DURATION } from '../config/config';

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, { duration = TOAST_DURATION.MEDIUM, type = 'info' } = {}) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => {
      setToasts((t) => t.filter(x => x.id !== id));
    }, duration);
    return id;
  }, []);

  const remove = useCallback((id) => {
    setToasts((t) => t.filter(x => x.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ push, remove }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col space-y-2">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-2 rounded shadow ${t.type === 'error' ? 'bg-red-600 text-white' : 'bg-black text-white'}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

export default ToastContext;
