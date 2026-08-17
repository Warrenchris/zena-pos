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
            className="bg-surface border border-border-default rounded-2xl shadow-floating p-6 hover:bg-surface-2 transition-all block"
          >
            <span className="text-2xl" aria-hidden>{page.icon}</span>
            <h2 className="text-h3 font-semibold text-text-primary mt-3">{page.title}</h2>
            <p className="text-small text-text-secondary mt-2">{page.description}</p>
            <span className="inline-block mt-4 text-small font-semibold text-primary">Open →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
