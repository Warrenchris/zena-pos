import React from 'react';

export const QUALITY_BADGES = {
  excellent: { label: 'Excellent', className: 'bg-green-100 text-green-800 border-green-300' },
  good: { label: 'Good', className: 'bg-blue-100 text-blue-800 border-blue-300' },
  fair: { label: 'Fair', className: 'bg-amber-100 text-amber-800 border-amber-300' },
  poor: { label: 'Poor', className: 'bg-red-100 text-red-800 border-red-300' },
};

export const SEGMENT_COLORS = {
  Champions: 'border-green-500 bg-green-50',
  'Loyal Customers': 'border-blue-500 bg-blue-50',
  'At Risk': 'border-amber-500 bg-amber-50',
  'One-Time Buyers': 'border-gray-400 bg-gray-50',
  'Regular Customers': 'border-indigo-400 bg-indigo-50',
};

export function formatPercent(value) {
  if (value == null) return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return `${(Math.abs(n) > 1 ? n : n * 100).toFixed(1)}%`;
}

export function PageHeader({ title, description }) {
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
    </div>
  );
}

export function PanelSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-4 bg-gray-200 rounded w-1/3" />
      <div className="h-32 bg-gray-100 rounded" />
    </div>
  );
}

export function PanelError({ message, onRetry }) {
  return (
    <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
      <p>{message || 'Failed to load data'}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 text-xs underline text-red-700">
          Retry
        </button>
      )}
    </div>
  );
}

export function DemoDataBanner({ message, error }) {
  if (!message) return null;
  return (
    <div className="bg-amber-50 border border-amber-400 rounded-lg px-4 py-3 text-sm text-amber-900">
      {message}
      {error && <span className="block mt-1 text-xs text-amber-800">({error})</span>}
    </div>
  );
}

export function AiHealthCard({ health, onRefresh, loading }) {
  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-medium text-gray-900">AI Service Health</h4>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            Check
          </button>
        )}
      </div>
      {health.ok === null && <p className="text-sm text-gray-500 mt-2">Unknown</p>}
      {health.ok === true && (
        <p className="text-sm text-green-600 mt-2">
          OK — {health.details?.upstream || health.details?.status || 'connected'}
        </p>
      )}
      {health.ok === false && (
        <p className="text-sm text-red-600 mt-2">
          Down — {typeof health.details === 'string' ? health.details : JSON.stringify(health.details)}
        </p>
      )}
    </div>
  );
}
