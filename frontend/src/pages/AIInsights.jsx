import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import aiService from '../services/ai.service';
import { formatCurrency } from '../utils/formatters';
import {
  PageHeader, PanelSkeleton, PanelError, SEGMENT_COLORS
} from '../components/ai/shared';

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
    <div className="bg-surface border border-border-default rounded-2xl shadow-floating p-6 text-text-primary">
      <h3 className="text-lg font-bold text-primary mb-4">Customer Segments</h3>
      {loading && <PanelSkeleton />}
      {!loading && error && <PanelError message={error} onRetry={load} />}
      {!loading && !error && data?.message && !data?.segments?.length && (
        <p className="text-sm text-text-muted">{data.message}</p>
      )}
      {!loading && !error && data?.segments?.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.segments.map((seg) => (
            <div
              key={seg.segment_id}
              className={SEGMENT_COLORS[seg.label] || 'border-l-4 border-border-default bg-surface-2 p-4 rounded-xl text-text-primary'}
            >
              <p className="font-semibold text-text-primary">{seg.label}</p>
              <p className="text-xs text-text-secondary font-medium mt-1">{seg.customer_count} customers ({seg.percentage_of_customers}%)</p>
              <div className="mt-2 text-xs space-y-0.5 text-text-secondary">
                <p>Avg spend: <span className="font-semibold text-text-primary">{formatCurrency(seg.avg_total_spend)}</span></p>
                <p>Avg frequency: <span className="font-semibold text-text-primary">{seg.avg_purchase_frequency} purchases</span></p>
                <p>Last purchase: <span className="font-semibold text-text-primary">{seg.avg_days_since_last_purchase} days ago</span></p>
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
    <div className="bg-surface border border-border-default rounded-2xl shadow-floating p-6 text-text-primary">
      <h3 className="text-lg font-bold text-primary mb-4">Anomaly Detection</h3>
      {loading && <PanelSkeleton />}
      {!loading && error && <PanelError message={error} onRetry={load} />}
      {!loading && !error && anomalies.length === 0 && (
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
          No unusual patterns detected in the last 90 days
        </p>
      )}
      {!loading && !error && anomalies.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-secondary border-b border-border-default">
              <th className="pb-3 font-semibold">Date</th>
              <th className="pb-3 font-semibold">Revenue</th>
              <th className="pb-3 font-semibold">Transactions</th>
              <th className="pb-3 font-semibold">Severity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default">
            {anomalies.map((a) => (
              <tr key={a.date} className="hover:bg-surface-2/60 transition-colors">
                <td className="py-3 text-text-primary font-medium">{a.date}</td>
                <td className="py-3 text-text-primary font-semibold">{formatCurrency(a.revenue)}</td>
                <td className="py-3 text-text-secondary">{a.transaction_count}</td>
                <td className="py-3">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${a.severity === 'high' ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20'}`}>
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
    if (days == null) return 'text-text-muted';
    if (days <= 3) return 'text-rose-600 dark:text-rose-400 font-semibold';
    if (days <= 7) return 'text-amber-600 dark:text-amber-400 font-medium';
    return 'text-emerald-600 dark:text-emerald-400';
  };

  return (
    <div className="bg-surface border border-border-default rounded-2xl shadow-floating p-6 text-text-primary">
      <h3 className="text-lg font-bold text-primary mb-4">Stock Depletion Alerts</h3>
      {loading && <PanelSkeleton />}
      {!loading && error && <PanelError message={error} onRetry={load} />}
      {!loading && !error && alerts.length === 0 && (
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
          No products at risk of stockout within the alert window
        </p>
      )}
      {!loading && !error && alerts.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-secondary border-b border-border-default">
              <th className="pb-3 font-semibold">Product</th>
              <th className="pb-3 font-semibold">Current Stock</th>
              <th className="pb-3 font-semibold">Days Until Depletion</th>
              <th className="pb-3 font-semibold">Algorithm</th>
              <th className="pb-3 font-semibold">Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default">
            {alerts.map((item) => (
              <tr key={item.product_id} className="hover:bg-surface-2/60 transition-colors">
                <td className="py-3 font-medium text-text-primary">{item.product_name}</td>
                <td className="py-3 text-text-secondary">{item.current_stock}</td>
                <td className={`py-3 ${daysColor(item.days_until_depletion)}`}>
                  {item.days_until_depletion != null ? `${item.days_until_depletion} days` : '—'}
                </td>
                <td className="py-3 capitalize text-text-secondary">{item.algorithm}</td>
                <td className="py-3 capitalize text-text-secondary">{item.confidence || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const RELATED_LINKS = [
  { to: '/ai/forecasting', title: 'Sales Forecasting', desc: 'Prophet and RF revenue projections' },
  { to: '/ai/finance', title: 'Financial Analysis', desc: 'Margins, ratios, and recommendations' },
];

export default function AIInsights() {
  return (
    <div className="space-y-6 py-4">
      <PageHeader
        title="Market Insights"
        description="Customer segmentation, sales anomaly detection, and stock depletion alerts powered by ML."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {RELATED_LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="bg-surface border border-border-default rounded-2xl shadow-floating p-5 hover:bg-surface-2 transition-all duration-200 block group"
          >
            <p className="font-bold text-primary group-hover:text-primary-hover">{link.title}</p>
            <p className="text-sm text-text-secondary mt-1">{link.desc}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CustomerSegmentsPanel />
        <AnomalyPanel />
      </div>

      <StockDepletionPanel />
    </div>
  );
}
