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
          No unusual patterns detected in the last 90 days
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
          No products at risk of stockout within the alert window
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {RELATED_LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="bg-white rounded-lg shadow p-4 hover:ring-2 hover:ring-indigo-200 transition"
          >
            <p className="font-medium text-indigo-700">{link.title}</p>
            <p className="text-sm text-gray-500 mt-1">{link.desc}</p>
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
