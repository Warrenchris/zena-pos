export const QUALITY_BADGES = {
  excellent: { label: 'Excellent', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 border' },
  good: { label: 'Good', className: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20 border' },
  fair: { label: 'Fair', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 border' },
  poor: { label: 'Poor', className: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20 border' },
};

export const SEGMENT_COLORS = {
  Champions: 'border-emerald-500 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-l-4 rounded-xl p-4 shadow-xs',
  'Loyal Customers': 'border-blue-500 bg-blue-500/10 text-blue-800 dark:text-blue-300 border-l-4 rounded-xl p-4 shadow-xs',
  'At Risk': 'border-amber-500 bg-amber-500/10 text-amber-800 dark:text-amber-300 border-l-4 rounded-xl p-4 shadow-xs',
  'One-Time Buyers': 'border-border-default bg-surface-2 text-text-primary border-l-4 rounded-xl p-4 shadow-xs',
  'Regular Customers': 'border-indigo-500 bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 border-l-4 rounded-xl p-4 shadow-xs',
};

export function formatPercent(value) {
  if (value == null) return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return `${(Math.abs(n) > 1 ? n : n * 100).toFixed(1)}%`;
}

export function PageHeader({ title, description }) {
  return (
    <div className="bg-surface border border-border-default p-6 rounded-2xl shadow-floating">
      <h1 className="text-2xl font-bold text-primary tracking-tight">{title}</h1>
      {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
    </div>
  );
}

export function PanelSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-4 bg-surface-2 rounded w-1/3" />
      <div className="h-32 bg-surface-2 rounded-xl" />
    </div>
  );
}

export function PanelError({ message, onRetry }) {
  return (
    <div className="text-sm text-rose-700 dark:text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
      <p className="font-medium">{message || 'Failed to load data'}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 text-xs font-semibold underline text-rose-600 dark:text-rose-400 hover:opacity-80">
          Retry
        </button>
      )}
    </div>
  );
}

export function DemoDataBanner({ message, error }) {
  if (!message) return null;
  return (
    <div className="bg-surface-2 border border-primary/30 rounded-xl px-4 py-3 text-sm text-text-primary shadow-xs">
      {message}
      {error && <span className="block mt-1 text-xs text-text-secondary">({error})</span>}
    </div>
  );
}

export function AiHealthCard({ health, onRefresh, loading }) {
  return (
    <div className="bg-surface border border-border-default p-4 rounded-xl shadow-floating">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-semibold text-primary">AI Service Health</h4>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="px-3 py-1 text-xs bg-surface-2 border border-border-default text-text-primary rounded-lg hover:bg-surface-3 disabled:opacity-50 transition-colors"
          >
            Check
          </button>
        )}
      </div>
      {health.ok === null && <p className="text-sm text-text-muted mt-2">Unknown</p>}
      {health.ok === true && (
        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mt-2">
          OK — {health.details?.upstream || health.details?.status || 'connected'}
        </p>
      )}
      {health.ok === false && (
        <p className="text-sm font-medium text-rose-600 dark:text-rose-400 mt-2">
          Down — {typeof health.details === 'string' ? health.details : JSON.stringify(health.details)}
        </p>
      )}
    </div>
  );
}
