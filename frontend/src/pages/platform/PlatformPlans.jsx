import React, { useEffect, useState } from 'react';
import { platformAPI } from '../../services/platformAPI';

export default function PlatformPlans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadPlans() {
      try {
        setLoading(true);
        const res = await platformAPI.getPlans();
        setPlans(res.data.plans);
      } catch (err) {
        setError(err.response?.data?.error || err.message || 'Failed to load plans');
      } finally {
        setLoading(false);
      }
    }
    loadPlans();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-4 rounded-xl text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Subscription Plans</h1>
        <p className="text-sm text-slate-400 mt-1">Review active SaaS subscription tiers, limits, and subscriber counts.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <div key={plan.id} className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white capitalize">{plan.name}</h3>
                <span className="px-2 py-0.5 text-xs font-mono font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded">
                  {plan.code}
                </span>
              </div>

              <div className="text-2xl font-extrabold text-white mb-4">
                {plan.currency} {Number(plan.priceMonthly).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                <span className="text-xs font-normal text-slate-400 ml-1">/ month</span>
              </div>

              <div className="space-y-2 text-xs text-slate-300 border-t border-slate-800 pt-4 mb-4">
                <div className="flex justify-between">
                  <span className="text-slate-400">Max Shops:</span>
                  <span className="font-semibold">{plan.maxShops === -1 ? 'Unlimited' : plan.maxShops}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Max Users:</span>
                  <span className="font-semibold">{plan.maxUsers === -1 ? 'Unlimited' : plan.maxUsers}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Status:</span>
                  <span className={plan.isActive ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                    {plan.isActive ? 'Active' : 'Archived'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 text-center">
              <span className="text-xs text-slate-400">Active Subscribers: </span>
              <strong className="text-sm text-blue-400 ml-1">{plan.activeSubscribers}</strong>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
