import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import aiService from '../services/ai.service';
import { PageHeader, AiHealthCard } from '../components/ai/shared';

const AI_PAGES = [
  {
    to: '/ai/forecasting',
    title: 'Sales Forecasting',
    description: 'Prophet and Random Forest revenue projections from your monthly sales history.',
    icon: '📈',
  },
  {
    to: '/ai/insights',
    title: 'Market Insights',
    description: 'Customer segments, sales anomalies, and stock depletion alerts.',
    icon: '💡',
  },
  {
    to: '/ai/finance',
    title: 'Financial Analysis',
    description: 'Profitability ratios, liquidity metrics, and AI recommendations.',
    icon: '💰',
  },
];

export default function AiServices() {
  const [health, setHealth] = useState({ ok: null, details: null });
  const [loading, setLoading] = useState(false);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await aiService.status();
      setHealth({ ok: true, details: res.data });
    } catch (err) {
      setHealth({ ok: false, details: err.response?.data || err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  return (
    <div className="space-y-6 py-4">
      <PageHeader
        title="AI Services Center"
        description="Choose an analytics area below. Each section has its own dedicated workspace."
      />

      <AiHealthCard health={health} onRefresh={fetchHealth} loading={loading} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {AI_PAGES.map((page) => (
          <Link
            key={page.to}
            to={page.to}
            className="bg-brand-gray border border-zana-borderTint rounded-lg shadow p-6 hover:bg-zana-yellow/10 transition block"
          >
            <span className="text-2xl" aria-hidden>{page.icon}</span>
            <h2 className="text-lg font-semibold text-brand-yellow mt-3">{page.title}</h2>
            <p className="text-sm text-gray-300 mt-2">{page.description}</p>
            <span className="inline-block mt-4 text-sm font-medium text-brand-yellow">Open →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
