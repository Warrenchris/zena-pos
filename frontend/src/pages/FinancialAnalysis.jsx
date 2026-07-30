import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import aiService from '../services/ai.service';
import { formatCurrency } from '../utils/formatters';
import {
  PageHeader, PanelSkeleton, PanelError, DemoDataBanner, AiHealthCard, formatPercent
} from '../components/ai/shared';

function MetricCard({ label, value, hint }) {
  return (
    <div className="bg-surface border border-border-default rounded-2xl shadow-floating p-5 text-text-primary">
      <p className="text-xs uppercase tracking-wider text-text-secondary font-semibold">{label}</p>
      <p className="text-2xl font-bold text-text-primary mt-1">{value}</p>
      {hint && <p className="text-xs text-text-muted mt-1">{hint}</p>}
    </div>
  );
}

export default function FinancialAnalysis() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [insights, setInsights] = useState([]);
  const [shopSummary, setShopSummary] = useState(null);
  const [isUsingDemoData, setIsUsingDemoData] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [health, setHealth] = useState({ ok: null, details: null });

  const fetchHealth = useCallback(async () => {
    try {
      const res = await aiService.status();
      setHealth({ ok: true, details: res.data });
    } catch (err) {
      setHealth({ ok: false, details: err.response?.data || err.message });
    }
  }, []);

  const loadFinancialData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsUsingDemoData(false);
    setAiError(null);
    try {
      await fetchHealth();

      const [statsResp, shopResp, revenueResp, expenseStatsResp] = await Promise.all([
        api.get('/api/dashboard/stats').then((r) => r.data).catch(() => null),
        api.get('/api/shop/me').then((r) => r.data).catch(() => null),
        api.get('/api/insights/monthly-revenue').then((r) => r.data).catch(() => null),
        api.get('/api/expenses/statistics').then((r) => r.data).catch(() => null),
      ]);

      const revenueHistory = revenueResp?.dates ? revenueResp.dates.map((date, idx) => ({
        date,
        value: parseFloat(revenueResp.values[idx] || 0)
      })) : [];

      const costHistory = expenseStatsResp?.monthlyTrend ? expenseStatsResp.monthlyTrend.map((item) => ({
        date: item.month,
        value: parseFloat(item.total || 0)
      })) : [];

      let totalRevenue = revenueHistory.reduce((sum, x) => sum + (x.value || 0), 0);
      let totalCosts = costHistory.reduce((sum, x) => sum + (x.value || 0), 0);

      // Fallback to stats totalIncome if monthly revenue history sum is 0 but sales exist
      if (totalRevenue === 0 && statsResp?.totalIncome > 0) {
        totalRevenue = statsResp.totalIncome;
      }

      setShopSummary({
        shopName: shopResp?.name || 'Your shop',
        totalRevenue,
        totalCosts,
        monthsTracked: revenueResp?.dates?.length ?? 1,
      });

      const hasRealData = totalRevenue > 0;
      let fmPayload;

      if (hasRealData) {
        fmPayload = {
          revenue: totalRevenue,
          costs: totalCosts,
          expenses: expenseStatsResp?.totalExpenses || statsResp?.totalExpenses || 0,
          assets: shopResp?.assets || 0,
          liabilities: shopResp?.liabilities || 0,
          date: new Date().toISOString(),
        };
        setIsUsingDemoData(false);
      } else {
        fmPayload = shopResp?.financials || {
          revenue: 100000,
          costs: 60000,
          expenses: 15000,
          assets: shopResp?.assets || 120000,
          liabilities: shopResp?.liabilities || 30000,
          date: new Date().toISOString(),
        };
        setIsUsingDemoData(true);
        setAiError('Using estimated figures — connect shop financials for accurate analysis');
      }

      const fm = await aiService.analyzeFinancial(fmPayload).then((r) => r.data).catch((err) => {
        setIsUsingDemoData(true);
        setAiError(err.response?.data?.error || err.message);
        return null;
      });
      setMetrics(fm);

      const insightsData = await api.get('/api/insights').then((r) => r.data).catch(() => null);
      const rawInsights = insightsData?.recommendations || [];
      const formattedInsights = rawInsights.map(ins => {
        let recs = [];
        if (Array.isArray(ins.details)) {
          recs = ins.details.map(detail => {
            if (typeof detail === 'string') return detail;
            if (detail && typeof detail === 'object') {
              if (detail.daysToDeplete !== undefined) {
                return `${detail.name || 'Product'}: Depleting in ${detail.daysToDeplete} days`;
              }
              if (detail.currentStock !== undefined) {
                return `${detail.name || 'Product'}: ${detail.currentStock} units left (Reorder point: ${detail.reorderPoint ?? 'N/A'})`;
              }
              if (detail.profit !== undefined) {
                return `Profit: ${formatCurrency(detail.profit)}`;
              }
              if (detail.category !== undefined && detail.amount !== undefined) {
                return `${detail.category}: ${formatCurrency(detail.amount)}`;
              }
              if (detail.name) return detail.name;
              return JSON.stringify(detail);
            }
            return String(detail);
          });
        }
        return {
          type: ins.insight_type || ins.type || 'Insight',
          message: ins.description || ins.message || '',
          recommendations: recs
        };
      });
      setInsights(formattedInsights);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [fetchHealth]);

  useEffect(() => {
    loadFinancialData();
  }, [loadFinancialData]);

  return (
    <div className="space-y-6 py-4">
      <PageHeader
        title="Financial Analysis"
        description="Profitability ratios, liquidity metrics, and AI-generated recommendations for your business."
      />

      <DemoDataBanner
        message={isUsingDemoData ? 'Some figures are estimated because live financial or AI data is limited.' : null}
        error={aiError}
      />

      {error && <PanelError message={error} onRetry={loadFinancialData} />}

      {loading && <PanelSkeleton />}

      {!loading && !error && (
        <>
          {shopSummary && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <MetricCard label="Shop" value={shopSummary.shopName} />
              <MetricCard label="Revenue (tracked)" value={formatCurrency(shopSummary.totalRevenue)} />
              <MetricCard
                label="Data window"
                value={`${shopSummary.monthsTracked} months`}
                hint="Based on dashboard history"
              />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-surface border border-border-default rounded-2xl shadow-floating p-6 text-text-primary">
              <h2 className="text-lg font-bold text-primary mb-4">Key Financial Ratios</h2>
              {!metrics && (
                <p className="text-sm text-text-muted">Financial metrics unavailable — check AI service health.</p>
              )}
              {metrics && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <MetricCard label="Gross Profit Margin" value={formatPercent(metrics.gross_profit_margin)} />
                  <MetricCard label="Net Profit Margin" value={formatPercent(metrics.net_profit_margin)} />
                  <MetricCard
                    label="Current Ratio"
                    value={metrics.current_ratio != null ? metrics.current_ratio.toFixed(2) : "N/A"}
                    hint={metrics.current_ratio != null ? "Liquidity" : "No liabilities or assets details"}
                  />
                  <MetricCard
                    label="Inventory Turnover"
                    value={metrics.inventory_turnover != null ? metrics.inventory_turnover.toFixed(2) : "N/A"}
                    hint={metrics.inventory_turnover_note || "Requires direct inventory value"}
                  />
                </div>
              )}
            </div>

            <div className="space-y-4">
              <AiHealthCard health={health} onRefresh={fetchHealth} loading={loading} />
              <div className="bg-surface border border-border-default rounded-2xl shadow-floating p-5 text-sm text-text-secondary space-y-3">
                <p className="font-bold text-primary">Related analytics</p>
                <p>
                  <Link to="/ai/forecasting" className="text-primary font-medium hover:underline">Sales Forecasting</Link>
                  {' — '}revenue projections
                </p>
                <p>
                  <Link to="/ai/insights" className="text-primary font-medium hover:underline">Market Insights</Link>
                  {' — '}segments and anomalies
                </p>
              </div>
            </div>
          </div>

          <div className="bg-surface border border-border-default rounded-2xl shadow-floating p-6 text-text-primary">
            <h2 className="text-lg font-bold text-primary mb-4">Business Recommendations</h2>
            {insights.length === 0 && (
              <p className="text-sm text-text-muted">No recommendations returned yet.</p>
            )}
            {insights.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {insights.map((ins, idx) => (
                  <div key={idx} className="bg-surface-2 border border-border-default rounded-xl p-4 text-text-primary">
                    <p className="font-semibold text-primary">{ins?.insight_type || ins?.type || 'Insight'}</p>
                    <p className="text-sm text-text-secondary mt-1">{ins?.description || ins?.message || ''}</p>
                    {ins?.recommendations?.length > 0 && (
                      <ul className="text-xs text-text-secondary mt-2 list-disc list-inside space-y-1">
                        {ins.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
