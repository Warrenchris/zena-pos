import React, { useState, useCallback, useMemo } from 'react';
import {
  Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Area, ComposedChart, ReferenceLine
} from 'recharts';
import { Link } from 'react-router-dom';
import api from '../services/api';
import aiService from '../services/ai.service';
import { formatCurrency } from '../utils/formatters';
import { downloadCSV } from '../utils/csv';
import { useToast } from '../components/Toast';
import {
  PageHeader, PanelSkeleton, PanelError, DemoDataBanner, AiHealthCard, QUALITY_BADGES
} from '../components/ai/shared';

export default function SalesForecasting() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [historical, setHistorical] = useState({ dates: [], values: [] });
  const [periods, setPeriods] = useState(14);
  const [model, setModel] = useState('prophet');
  const [expanded, setExpanded] = useState(false);
  const [health, setHealth] = useState({ ok: null, details: null });
  const [isUsingDemoData, setIsUsingDemoData] = useState(false);
  const toast = useToast();

  const fetchHealth = useCallback(async () => {
    try {
      const res = await aiService.status();
      setHealth({ ok: true, details: res.data });
    } catch (err) {
      setHealth({ ok: false, details: err.response?.data || err.message });
    }
  }, []);

  const generateForecast = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsUsingDemoData(false);
    try {
      await fetchHealth();
      const revenueResp = await api.get('/api/insights/monthly-revenue');
      const dates = revenueResp.data?.dates ?? [];
      const values = revenueResp.data?.values ?? [];
      setHistorical({ dates, values });

      if (dates.length < 2) {
        throw new Error('Not enough revenue history to generate a forecast. Record more sales first.');
      }

      const isoDates = dates.map((d) => new Date(d).toISOString());
      const fc = model === 'rf'
        ? await aiService.createRFForecast(isoDates, values, periods)
        : await aiService.createForecast(isoDates, values, periods);

      setForecast(fc.data);
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [fetchHealth, model, periods]);

  const chartData = useMemo(() => {
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

  const exportForecast = () => {
    if (!forecast?.dates) return;
    const rows = (forecast.dates ?? []).map((d, i) => ({
      date: new Date(d).toISOString(),
      prediction: forecast?.predictions?.[i] ?? '',
      lower: forecast?.lower_bounds?.[i] ?? '',
      upper: forecast?.upper_bounds?.[i] ?? '',
    }));
    downloadCSV('sales-forecast.csv', rows);
    try { toast.push('Forecast exported to CSV', { type: 'info' }); } catch (e) { /* noop */ }
  };

  const renderChart = (height) => (
    <ResponsiveContainer width="100%" height={height}>
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
          <ReferenceLine
            x={new Date(historical.dates[historical.dates.length - 1]).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
            stroke="#9CA3AF"
            strokeDasharray="3 3"
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );

  return (
    <div className="space-y-6 py-4">
      <PageHeader
        title="Sales Forecasting"
        description="Prophet and Random Forest revenue projections based on your shop's monthly sales history."
      />

      <DemoDataBanner
        message={isUsingDemoData ? 'Showing sample data because live AI data is unavailable.' : null}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold">Revenue Forecast</h2>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="text-sm border rounded px-2 py-1"
              >
                <option value="prophet">Prophet</option>
                <option value="rf">Random Forest</option>
              </select>
              <input
                type="number"
                min={1}
                max={90}
                value={periods}
                onChange={(e) => setPeriods(Number(e.target.value))}
                className="w-16 text-sm border rounded px-2 py-1"
                title="Forecast periods"
              />
              <button
                type="button"
                onClick={generateForecast}
                disabled={loading}
                className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? 'Generating…' : 'Generate Forecast'}
              </button>
              {forecast && (
                <>
                  <button type="button" onClick={exportForecast} className="px-2 py-1 text-xs bg-gray-100 rounded">
                    Export CSV
                  </button>
                  <button type="button" onClick={() => setExpanded(true)} className="px-2 py-1 text-xs bg-gray-100 rounded">
                    Expand
                  </button>
                </>
              )}
            </div>
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
            <div>
              <div className="h-64">{renderChart(256)}</div>
              <p className="text-xs text-gray-400 mt-2">
                Solid line = historical actuals · Dashed line = forecast · Shaded band = confidence interval
              </p>
            </div>
          )}

          {!loading && !error && !forecast && (
            <p className="text-sm text-gray-400">
              Click &quot;Generate Forecast&quot; to project future revenue from your sales history.
            </p>
          )}
        </div>

        <div className="space-y-4">
          <AiHealthCard health={health} onRefresh={fetchHealth} loading={loading} />
          <div className="bg-white rounded-lg shadow p-4 text-sm text-gray-600 space-y-2">
            <p className="font-medium text-gray-900">Related analytics</p>
            <p>
              <Link to="/ai/insights" className="text-indigo-600 hover:underline">Market Insights</Link>
              {' — '}customer segments, anomalies, stock alerts
            </p>
            <p>
              <Link to="/ai/finance" className="text-indigo-600 hover:underline">Financial Analysis</Link>
              {' — '}margins, ratios, and trends
            </p>
          </div>
        </div>
      </div>

      {expanded && forecast && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white w-11/12 lg:w-3/4 p-6 rounded-lg shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">Sales Forecast (expanded)</h3>
              <button type="button" onClick={() => setExpanded(false)} className="px-3 py-1 bg-gray-100 rounded">
                Close
              </button>
            </div>
            <div style={{ height: 420 }}>{renderChart(420)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
