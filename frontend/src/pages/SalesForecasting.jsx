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
      date: new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }),
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
      date: new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }),
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
      <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2e39" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} />
        <YAxis width={100} tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} tickFormatter={(v) => formatCurrency(v)} />
        <Tooltip
          contentStyle={{ backgroundColor: '#0b0b0c', borderColor: 'rgba(255, 214, 0, 0.2)', borderRadius: '8px', color: '#e5e7eb' }}
          itemStyle={{ color: '#e5e7eb' }}
          labelStyle={{ color: '#FFD600', fontWeight: 'bold' }}
          formatter={(v) => formatCurrency(v)}
        />
        <Area type="monotone" dataKey="upper" stroke="none" fill="rgba(255, 214, 0, 0.08)" connectNulls={false} />
        <Area type="monotone" dataKey="lower" stroke="none" fill="#121214" connectNulls={false} />
        <Line type="monotone" dataKey="actual" stroke="#FFD600" strokeWidth={2} dot={false} connectNulls={false} />
        <Line type="monotone" dataKey="predicted" stroke="#FFD600" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls={false} />
        {historical.dates.length > 0 && (
          <ReferenceLine
            x={new Date(historical.dates[historical.dates.length - 1]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
            stroke="#FFD600"
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
        <div className="lg:col-span-2 bg-brand-gray border border-zana-borderTint rounded-lg shadow p-5 text-gray-200">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-brand-yellow">Revenue Forecast</h2>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="text-sm bg-brand-black border border-zana-borderTint text-gray-300 rounded px-2 py-1 focus:outline-none"
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
                className="w-16 text-sm bg-brand-black border border-zana-borderTint text-gray-300 rounded px-2 py-1 focus:outline-none"
                title="Forecast periods"
              />
              <button
                type="button"
                onClick={generateForecast}
                disabled={loading}
                className="px-3 py-1.5 text-sm bg-brand-yellow hover:bg-brand-yellowDark text-brand-black rounded font-semibold disabled:opacity-50 transition"
              >
                {loading ? 'Generating…' : 'Generate Forecast'}
              </button>
              {forecast && (
                <>
                  <button type="button" onClick={exportForecast} className="px-2 py-1 text-xs bg-brand-black border border-zana-borderTint text-gray-300 rounded hover:bg-zana-yellow/10 transition">
                    Export CSV
                  </button>
                  <button type="button" onClick={() => setExpanded(true)} className="px-2 py-1 text-xs bg-brand-black border border-zana-borderTint text-gray-300 rounded hover:bg-zana-yellow/10 transition">
                    Expand
                  </button>
                </>
              )}
            </div>
          </div>

          {forecast?.cached && (
            <div className="mb-3 text-xs bg-blue-950/20 text-blue-400 border border-blue-500/30 rounded px-3 py-1.5">
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
          <div className="bg-brand-gray border border-zana-borderTint rounded-lg shadow p-4 text-sm text-gray-300 space-y-2">
            <p className="font-semibold text-brand-yellow">Related analytics</p>
            <p>
              <Link to="/ai/insights" className="text-brand-yellow hover:underline">Market Insights</Link>
              {' — '}customer segments, anomalies, stock alerts
            </p>
            <p>
              <Link to="/ai/finance" className="text-brand-yellow hover:underline">Financial Analysis</Link>
              {' — '}margins, ratios, and trends
            </p>
          </div>
        </div>
      </div>

      {expanded && forecast && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-brand-gray border border-brand-yellow/20 w-11/12 lg:w-3/4 p-6 rounded-lg shadow-lg text-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-brand-yellow">Sales Forecast (expanded)</h3>
              <button type="button" onClick={() => setExpanded(false)} className="px-3 py-1 bg-brand-black border border-zana-borderTint text-gray-300 rounded hover:bg-zana-yellow/10 transition">
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
