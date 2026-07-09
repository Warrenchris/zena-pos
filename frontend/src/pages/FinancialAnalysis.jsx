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
    <div className="bg-brand-gray border border-zana-borderTint rounded-lg shadow p-4 text-gray-200">
      <p className="text-xs uppercase tracking-wide text-brand-yellow font-semibold">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
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

      const [statsResp, shopResp, revenueResp] = await Promise.all([
        api.get('/api/dashboard/stats').then((r) => r.data).catch(() => null),
        api.get('/api/shop/me').then((r) => r.data).catch(() => null),
        api.get('/api/insights/monthly-revenue').then((r) => r.data).catch(() => null),
      ]);

      const revenueHistory = statsResp?.revenueHistory ?? [];
      const costHistory = statsResp?.costHistory ?? [];
      const totalRevenue = revenueHistory.reduce((sum, x) => sum + (x.value || 0), 0);
      const totalCosts = costHistory.reduce((sum, x) => sum + (x.value || 0), 0);

      setShopSummary({
        shopName: shopResp?.name || 'Your shop',
        totalRevenue,
        totalCosts,
        monthsTracked: revenueResp?.dates?.length ?? revenueHistory.length,
      });

      const fmPayload = shopResp?.financials || {
        revenue: totalRevenue || 100000,
        costs: totalCosts || 60000,
        expenses: statsResp?.totalExpenses || 15000,
        assets: shopResp?.assets || 120000,
        liabilities: shopResp?.liabilities || 30000,
        date: new Date().toISOString(),
      };

      const usedFallback = !shopResp?.financials && totalRevenue === 0;
      if (usedFallback) {
        setIsUsingDemoData(true);
        setAiError('Using estimated figures — connect shop financials for accurate analysis');
      }

      const fm = await aiService.analyzeFinancial(fmPayload).then((r) => r.data).catch((err) => {
        setIsUsingDemoData(true);
        setAiError(err.response?.data?.error || err.message);
        return null;
      });
      setMetrics(fm);

      const insightPayload = {
        revenue: revenueHistory.length ? revenueHistory.map((x) => x.value) : [1000, 1100, 1050],
        costs: costHistory.length ? costHistory.map((x) => x.value) : [700, 750, 720],
        customer_count: [50, 55, 53],
        transaction_count: [60, 63, 62],
        average_transaction_value: [16.7, 17.4, 16.9],
      };

      const insightsResp = await aiService.analyzeBusiness(insightPayload).then((r) => r.data).catch(() => null);
      setInsights(Array.isArray(insightsResp) ? insightsResp : []);
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
            <div className="lg:col-span-2 bg-brand-gray border border-zana-borderTint rounded-lg shadow p-5 text-gray-200">
              <h2 className="text-lg font-semibold text-brand-yellow mb-4">Key Financial Ratios</h2>
              {!metrics && (
                <p className="text-sm text-gray-400">Financial metrics unavailable — check AI service health.</p>
              )}
              {metrics && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <MetricCard label="Gross Profit Margin" value={formatPercent(metrics.gross_profit_margin)} />
                  <MetricCard label="Net Profit Margin" value={formatPercent(metrics.net_profit_margin)} />
                  <MetricCard label="Current Ratio" value={(metrics.current_ratio ?? 0).toFixed(2)} hint="Liquidity" />
                  <MetricCard label="Inventory Turnover" value={(metrics.inventory_turnover ?? 0).toFixed(2)} />
                </div>
              )}
            </div>

            <div className="space-y-4">
              <AiHealthCard health={health} onRefresh={fetchHealth} loading={loading} />
              <div className="bg-brand-gray border border-zana-borderTint rounded-lg shadow p-4 text-sm text-gray-300 space-y-2">
                <p className="font-semibold text-brand-yellow">Related analytics</p>
                <p>
                  <Link to="/ai/forecasting" className="text-brand-yellow hover:underline">Sales Forecasting</Link>
                  {' — '}revenue projections
                </p>
                <p>
                  <Link to="/ai/insights" className="text-brand-yellow hover:underline">Market Insights</Link>
                  {' — '}segments and anomalies
                </p>
              </div>
            </div>
          </div>

          <div className="bg-brand-gray border border-zana-borderTint rounded-lg shadow p-5 text-gray-200">
            <h2 className="text-lg font-semibold text-brand-yellow mb-4">Business Recommendations</h2>
            {insights.length === 0 && (
              <p className="text-sm text-gray-400">No recommendations returned yet.</p>
            )}
            {insights.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {insights.map((ins, idx) => (
                  <div key={idx} className="bg-brand-black border border-zana-borderTint rounded-lg p-4 text-gray-200">
                    <p className="font-semibold text-brand-yellow">{ins?.insight_type || ins?.type || 'Insight'}</p>
                    <p className="text-sm text-gray-300 mt-1">{ins?.description || ins?.message || ''}</p>
                    {ins?.recommendations?.length > 0 && (
                      <ul className="text-xs text-gray-400 mt-2 list-disc list-inside space-y-1">
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
