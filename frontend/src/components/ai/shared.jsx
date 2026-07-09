export const QUALITY_BADGES = {
  excellent: { label: 'Excellent', className: 'bg-green-950/40 text-green-400 border-green-500/30 border' },
  good: { label: 'Good', className: 'bg-blue-950/40 text-blue-400 border-blue-500/30 border' },
  fair: { label: 'Fair', className: 'bg-amber-950/40 text-amber-400 border-amber-500/30 border' },
  poor: { label: 'Poor', className: 'bg-red-950/40 text-red-400 border-red-500/30 border' },
};

export const SEGMENT_COLORS = {
  Champions: 'border-green-500 bg-green-950/20 text-green-400 border-l-4 rounded p-3',
  'Loyal Customers': 'border-blue-500 bg-blue-950/20 text-blue-400 border-l-4 rounded p-3',
  'At Risk': 'border-amber-500 bg-amber-950/20 text-amber-400 border-l-4 rounded p-3',
  'One-Time Buyers': 'border-brand-yellow/40 bg-brand-gray text-gray-300 border-l-4 rounded p-3',
  'Regular Customers': 'border-indigo-500 bg-indigo-950/20 text-indigo-400 border-l-4 rounded p-3',
};

export function formatPercent(value) {
  if (value == null) return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return `${(Math.abs(n) > 1 ? n : n * 100).toFixed(1)}%`;
}

export function PageHeader({ title, description }) {
  return (
    <div className="bg-brand-gray border border-zana-borderTint p-6 rounded-lg shadow">
      <h1 className="text-2xl font-semibold text-brand-yellow">{title}</h1>
      {description && <p className="mt-1 text-sm text-gray-400">{description}</p>}
    </div>
  );
}

export function PanelSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-4 bg-gray-700 rounded w-1/3" />
      <div className="h-32 bg-gray-800 rounded" />
    </div>
  );
}

export function PanelError({ message, onRetry }) {
  return (
    <div className="text-sm text-red-400 bg-red-950/20 border border-red-500/30 rounded p-3">
      <p>{message || 'Failed to load data'}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 text-xs underline text-red-300 hover:text-red-200">
          Retry
        </button>
      )}
    </div>
  );
}

export function DemoDataBanner({ message, error }) {
  if (!message) return null;
  return (
    <div className="bg-brand-gray border border-brand-yellow/30 rounded-lg px-4 py-3 text-sm text-brand-yellow">
      {message}
      {error && <span className="block mt-1 text-xs text-brand-yellow/80">({error})</span>}
    </div>
  );
}

export function AiHealthCard({ health, onRefresh, loading }) {
  return (
    <div className="bg-brand-gray border border-zana-borderTint p-4 rounded-lg shadow">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-medium text-brand-yellow">AI Service Health</h4>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="px-2 py-1 text-xs bg-brand-black border border-zana-borderTint text-gray-300 rounded hover:bg-zana-yellow/10 disabled:opacity-50 transition"
          >
            Check
          </button>
        )}
      </div>
      {health.ok === null && <p className="text-sm text-gray-400 mt-2">Unknown</p>}
      {health.ok === true && (
        <p className="text-sm text-green-400 mt-2">
          OK — {health.details?.upstream || health.details?.status || 'connected'}
        </p>
      )}
      {health.ok === false && (
        <p className="text-sm text-red-400 mt-2">
          Down — {typeof health.details === 'string' ? health.details : JSON.stringify(health.details)}
        </p>
      )}
    </div>
  );
}
