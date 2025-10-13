import React, { useEffect } from 'react';
import { CheckCircleIcon, XCircleIcon, XMarkIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

const iconsByType = {
  success: CheckCircleIcon,
  error: XCircleIcon,
  info: InformationCircleIcon
};

const baseStyles = 'pointer-events-auto w-full max-w-sm overflow-hidden rounded-xl shadow-2xl ring-1 ring-black/10 backdrop-blur-md';

const bgByType = {
  success: 'bg-green-600/15 border border-green-500/30',
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
