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
      let revenueResp = await api.get('/api/insights/daily-sales').catch(() => null);
      let dates = revenueResp?.data?.dates ?? [];
      let values = revenueResp?.data?.values ?? [];

      if (dates.length < 2) {
        revenueResp = await api.get('/api/insights/monthly-revenue');
        dates = revenueResp?.data?.dates ?? [];
        values = revenueResp?.data?.values ?? [];
      }
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
      predicted: predictions[i] != null ? Math.max(0, predictions[i]) : null,
      lower: lower[i] != null ? Math.max(0, lower[i]) : null,
      upper: upper[i] != null ? Math.max(0, upper[i]) : null,
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
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} tickLine={false} />
        <YAxis width={100} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} tickLine={false} tickFormatter={(v) => formatCurrency(v)} />
        <Tooltip
          contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)', borderRadius: '12px', color: 'var(--text-primary)', boxShadow: '0 12px 32px rgba(0,0,0,0.12)' }}
          itemStyle={{ color: 'var(--text-primary)' }}
          labelStyle={{ color: 'var(--color-primary)', fontWeight: 'bold' }}
          formatter={(v) => formatCurrency(v)}
        />
        <Area type="monotone" dataKey="upper" stroke="none" fill="var(--color-primary)" fillOpacity={0.1} connectNulls={false} />
        <Area type="monotone" dataKey="lower" stroke="none" fill="var(--bg-surface)" connectNulls={false} />
        <Line type="monotone" dataKey="actual" stroke="var(--color-primary)" strokeWidth={2.5} dot={false} connectNulls={false} />
        <Line type="monotone" dataKey="predicted" stroke="var(--color-primary)" strokeWidth={2.5} strokeDasharray="6 4" dot={false} connectNulls={false} />
        {historical.dates.length > 0 && (
          <ReferenceLine
            x={new Date(historical.dates[historical.dates.length - 1]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
            stroke="var(--color-primary)"
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
        <div className="lg:col-span-2 bg-surface border border-border-default rounded-2xl shadow-floating p-6 text-text-primary">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-bold text-primary">Revenue Forecast</h2>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="text-sm bg-surface border border-border-default text-text-primary rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                className="w-16 text-sm bg-surface border border-border-default text-text-primary rounded-xl px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                title="Forecast periods"
              />
              <button
                type="button"
                onClick={generateForecast}
                disabled={loading}
                className="px-4 py-1.5 text-sm bg-primary hover:bg-primary-hover text-white rounded-xl font-bold disabled:opacity-50 transition-colors shadow-xs"
              >
                {loading ? 'Generating…' : 'Generate Forecast'}
              </button>
              {forecast && (
                <>
                  <button type="button" onClick={exportForecast} className="px-3 py-1.5 text-xs bg-surface-2 border border-border-default text-text-primary rounded-xl hover:bg-surface-3 transition-colors">
                    Export CSV
                  </button>
                  <button type="button" onClick={() => setExpanded(true)} className="px-3 py-1.5 text-xs bg-surface-2 border border-border-default text-text-primary rounded-xl hover:bg-surface-3 transition-colors">
                    Expand
                  </button>
                </>
              )}
            </div>
          </div>

          {forecast?.cached && (
            <div className="mb-3 text-xs bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 rounded-xl px-3 py-2 font-medium">
              Served from cache — data may be up to 1 hour old.
            </div>
          )}

          {badge && (
            <span className={`inline-block text-xs font-semibold px-3 py-1 rounded-full border mb-3 ${badge.className}`}>
              Model quality: {badge.label}
              {forecast?.model_quality?.mape != null && ` (MAPE ${forecast.model_quality.mape}%)`}
            </span>
          )}

          {loading && <PanelSkeleton />}
          {!loading && error && <PanelError message={error} onRetry={generateForecast} />}

          {!loading && !error && forecast && chartData.length > 0 && (
            <div>
              <div className="h-64">{renderChart(256)}</div>
              <p className="text-xs text-text-muted mt-3">
                Solid line = historical actuals · Dashed line = forecast · Shaded band = confidence interval
              </p>
            </div>
          )}

          {!loading && !error && !forecast && (
            <p className="text-sm text-text-muted mt-4">
              Click &quot;Generate Forecast&quot; to project future revenue from your sales history.
            </p>
          )}
        </div>

        <div className="space-y-4">
          <AiHealthCard health={health} onRefresh={fetchHealth} loading={loading} />
          <div className="bg-surface border border-border-default rounded-2xl shadow-floating p-5 text-sm text-text-secondary space-y-3">
            <p className="font-bold text-primary">Related analytics</p>
            <p>
              <Link to="/ai/insights" className="text-primary font-medium hover:underline">Market Insights</Link>
              {' — '}customer segments, anomalies, stock alerts
            </p>
            <p>
              <Link to="/ai/finance" className="text-primary font-medium hover:underline">Financial Analysis</Link>
              {' — '}margins, ratios, and trends
            </p>
          </div>
        </div>
      </div>

      {expanded && forecast && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
          <div className="bg-surface border border-border-default w-11/12 lg:w-3/4 p-6 rounded-2xl shadow-modal text-text-primary">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-primary">Sales Forecast (expanded)</h3>
              <button type="button" onClick={() => setExpanded(false)} className="px-3 py-1.5 bg-surface-2 border border-border-default text-text-primary rounded-xl hover:bg-surface-3 transition-colors text-xs font-semibold">
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
