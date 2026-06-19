import React, { useState, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Area, ComposedChart, ReferenceLine
} from 'recharts';
import api from '../services/api';
import aiService from '../services/ai.service';
import { formatCurrency } from '../utils/formatters';

const QUALITY_BADGES = {
  excellent: { label: 'Excellent ✓', className: 'bg-green-100 text-green-800 border-green-300' },
  good: { label: 'Good ✓', className: 'bg-blue-100 text-blue-800 border-blue-300' },
  fair: { label: 'Fair ⚠', className: 'bg-amber-100 text-amber-800 border-amber-300' },
  poor: { label: 'Poor ✗', className: 'bg-red-100 text-red-800 border-red-300' },
};

const SEGMENT_COLORS = {
  Champions: 'border-green-500 bg-green-50',
  'Loyal Customers': 'border-blue-500 bg-blue-50',
  'At Risk': 'border-amber-500 bg-amber-50',
  'One-Time Buyers': 'border-gray-400 bg-gray-50',
  'Regular Customers': 'border-indigo-400 bg-indigo-50',
};

function PanelSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-4 bg-gray-200 rounded w-1/3" />
      <div className="h-32 bg-gray-100 rounded" />
    </div>
  );
}

function PanelError({ message, onRetry }) {
  return (
    <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
      <p>{message || 'Failed to load data'}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 text-xs underline text-red-700">Retry</button>
      )}
    </div>
  );
}

function RevenueForecastPanel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [historical, setHistorical] = useState({ dates: [], values: [] });

  const generateForecast = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const revenueResp = await api.get('/api/insights/monthly-revenue');
      const dates = revenueResp.data?.dates ?? [];
      const values = revenueResp.data?.values ?? [];
      setHistorical({ dates, values });

      if (dates.length < 2) {
        throw new Error('Not enough revenue history to generate a forecast.');
      }

      const isoDates = dates.map((d) => new Date(d).toISOString());
      const fc = await aiService.createForecast(isoDates, values, 6);
      setForecast(fc.data);
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const chartData = React.useMemo(() => {
    if (!forecast) return [];
    const histPoints = (historical.dates ?? []).map((d, i) => ({
      date: new Date(d).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      actual: historical.values[i],
      predicted: null,
      lower: null,
      upper: null,
    }));

    const forecastDates = forecast?.dates ?? [];
    const predictions = forecast?.predictions ?? [];
    const lower = forecast?.lower_bounds ?? [];
    const upper = forecast?.upper_bounds ?? [];

    const predPoints = forecastDates.map((d, i) => ({
      date: new Date(d).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      actual: null,
      predicted: predictions[i],
      lower: lower[i],
      upper: upper[i],
    }));

    return [...histPoints, ...predPoints];
  }, [forecast, historical]);

  const quality = forecast?.model_quality?.quality_label;
  const badge = quality ? QUALITY_BADGES[quality] : null;

  return (
    <div className="bg-white rounded-lg shadow p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Revenue Forecast</h3>
        <button
          onClick={generateForecast}
          disabled={loading}
          className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? 'Generating…' : 'Generate Forecast'}
        </button>
      </div>

      {forecast?.cached && (
        <div className="mb-3 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-3 py-1.5">
          Served from cache — data may be up to 1 hour old.
        </div>
      )}

      {badge && (
        <span className={`inline-block text-xs font-medium px-2 py-1 rounded border mb-3 ${badge.className}`}>
          Model quality: {badge.label}
          {forecast?.model_quality?.mape != null && ` (MAPE ${forecast.model_quality.mape}%)`}
        </span>
      )}

      {loading && <PanelSkeleton />}
      {!loading && error && <PanelError message={error} onRetry={generateForecast} />}

      {!loading && !error && forecast && chartData.length > 0 && (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Area type="monotone" dataKey="upper" stroke="none" fill="rgba(99,102,241,0.08)" connectNulls={false} />
              <Area type="monotone" dataKey="lower" stroke="none" fill="#fff" connectNulls={false} />
              <Line type="monotone" dataKey="actual" stroke="#4F46E5" strokeWidth={2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="predicted" stroke="#4F46E5" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls={false} />
              {historical.dates.length > 0 && (
                <ReferenceLine x={new Date(historical.dates[historical.dates.length - 1]).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })} stroke="#9CA3AF" strokeDasharray="3 3" />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-400 mt-1">Solid line = historical actuals · Dashed line = Prophet forecast</p>
        </div>
      )}

      {!loading && !error && !forecast && (
        <p className="text-sm text-gray-400">Click "Generate Forecast" to run Prophet on your revenue history.</p>
      )}
    </div>
  );
}

function CustomerSegmentsPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await api.get('/api/insights/customer-segments');
      setData(resp.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div className="bg-white rounded-lg shadow p-5">
      <h3 className="text-lg font-semibold mb-4">Customer Segments</h3>
      {loading && <PanelSkeleton />}
      {!loading && error && <PanelError message={error} onRetry={load} />}
      {!loading && !error && data?.message && !data?.segments?.length && (
        <p className="text-sm text-gray-500">{data.message}</p>
      )}
      {!loading && !error && data?.segments?.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.segments.map((seg) => (
            <div
              key={seg.segment_id}
              className={`border-l-4 rounded p-3 ${SEGMENT_COLORS[seg.label] || 'border-gray-300 bg-gray-50'}`}
            >
              <p className="font-medium">{seg.label}</p>
              <p className="text-xs text-gray-500 mt-1">{seg.customer_count} customers ({seg.percentage_of_customers}%)</p>
              <div className="mt-2 text-xs space-y-0.5 text-gray-600">
                <p>Avg spend: {formatCurrency(seg.avg_total_spend)}</p>
                <p>Avg frequency: {seg.avg_purchase_frequency} purchases</p>
                <p>Last purchase: {seg.avg_days_since_last_purchase} days ago</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AnomalyPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [anomalies, setAnomalies] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const salesResp = await api.get('/api/insights/daily-sales');
      const dailyData = salesResp.data?.daily_data ?? [];
      if (dailyData.length < 14) {
        setAnomalies([]);
        setError('At least 14 days of sales data required for anomaly detection.');
        return;
      }
      const aiResp = await aiService.detectAnomalies(dailyData);
      setAnomalies(aiResp.data?.anomalies ?? []);
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div className="bg-white rounded-lg shadow p-5">
      <h3 className="text-lg font-semibold mb-4">Anomaly Detection</h3>
      {loading && <PanelSkeleton />}
      {!loading && error && <PanelError message={error} onRetry={load} />}
      {!loading && !error && anomalies.length === 0 && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3">
          No unusual patterns detected in the last 90 days ✓
        </p>
      )}
      {!loading && !error && anomalies.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2">Date</th>
              <th className="pb-2">Revenue</th>
              <th className="pb-2">Transactions</th>
              <th className="pb-2">Severity</th>
            </tr>
          </thead>
          <tbody>
            {anomalies.map((a) => (
              <tr key={a.date} className="border-b border-gray-100">
                <td className="py-2">{a.date}</td>
                <td className="py-2">{formatCurrency(a.revenue)}</td>
                <td className="py-2">{a.transaction_count}</td>
                <td className="py-2">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${a.severity === 'high' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {a.severity}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function StockDepletionPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [alerts, setAlerts] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await api.get('/api/insights/stock-depletion');
      setAlerts(resp.data?.alerts ?? []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const daysColor = (days) => {
    if (days == null) return 'text-gray-500';
    if (days <= 3) return 'text-red-600 font-semibold';
    if (days <= 7) return 'text-amber-600 font-medium';
    return 'text-green-600';
  };

  return (
    <div className="bg-white rounded-lg shadow p-5">
      <h3 className="text-lg font-semibold mb-4">Stock Depletion Alerts</h3>
      {loading && <PanelSkeleton />}
      {!loading && error && <PanelError message={error} onRetry={load} />}
      {!loading && !error && alerts.length === 0 && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3">
          No products at risk of stockout within the alert window ✓
        </p>
      )}
      {!loading && !error && alerts.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2">Product</th>
              <th className="pb-2">Current Stock</th>
              <th className="pb-2">Days Until Depletion</th>
              <th className="pb-2">Algorithm</th>
              <th className="pb-2">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((item) => (
              <tr key={item.product_id} className="border-b border-gray-100">
                <td className="py-2 font-medium">{item.product_name}</td>
                <td className="py-2">{item.current_stock}</td>
                <td className={`py-2 ${daysColor(item.days_until_depletion)}`}>
                  {item.days_until_depletion != null ? `${item.days_until_depletion} days` : '—'}
                </td>
                <td className="py-2 capitalize">{item.algorithm}</td>
                <td className="py-2 capitalize">{item.confidence || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function AIInsights() {
  return (
    <div className="space-y-6 py-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">AI Insights</h1>
        <p className="mt-1 text-sm text-gray-500">
          ML-powered forecasts, customer segmentation, anomaly detection, and stock depletion alerts.
        </p>
      </div>

      <RevenueForecastPanel />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CustomerSegmentsPanel />
        <AnomalyPanel />
      </div>

      <StockDepletionPanel />
    </div>
  );
}
