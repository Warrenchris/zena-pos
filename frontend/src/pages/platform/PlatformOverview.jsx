import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { platformAPI } from '../../services/platformAPI';

export default function PlatformOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadOverview() {
      try {
        setLoading(true);
        const res = await platformAPI.getOverview();
        setData(res.data);
      } catch (err) {
        setError(err.response?.data?.error || err.message || 'Failed to load overview data');
      } finally {
        setLoading(false);
      }
    }
    loadOverview();
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

  const { organizations, infrastructure, revenue, planDistribution } = data || {};

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Platform Overview</h1>
        <p className="text-sm text-slate-400 mt-1">
          High-level SaaS performance, tenant health, and revenue metrics.
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Tenants */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Tenants</span>
          <div className="text-3xl font-bold text-white mt-2">{organizations?.total ?? 0}</div>
          <div className="text-xs text-emerald-400 mt-2 flex items-center gap-1 font-medium">
            <span>+{organizations?.recentSignups30d ?? 0} new in last 30d</span>
          </div>
        </div>

        {/* Active Subscriptions */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Active Paid Subs</span>
          <div className="text-3xl font-bold text-emerald-400 mt-2">{revenue?.activePaidSubscriptions ?? 0}</div>
          <div className="text-xs text-slate-400 mt-2">
            {organizations?.trialing ?? 0} in active trials
          </div>
        </div>

        {/* Estimated MRR */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Estimated MRR</span>
          <div className="text-3xl font-bold text-blue-400 mt-2">
            KES {Number(revenue?.estimatedMRR || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-slate-400 mt-2">
            KES {Number(revenue?.totalRevenuePaid || 0).toLocaleString('en-US', { minimumFractionDigits: 0 })} collected
          </div>
        </div>

        {/* Total Infrastructure */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Global Footprint</span>
          <div className="text-3xl font-bold text-indigo-400 mt-2">{infrastructure?.totalShops ?? 0}</div>
          <div className="text-xs text-slate-400 mt-2">
            branches across {infrastructure?.totalUsers ?? 0} active users
          </div>
        </div>
      </div>

      {/* Tenant Lifecycle Breakdown & Plan Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tenant Lifecycle */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">Tenant Lifecycle Breakdown</h2>
            <Link to="/platform/organizations" className="text-xs text-blue-400 hover:text-blue-300 font-medium">
              View all &rarr;
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
              <span className="text-xs text-slate-400">Active</span>
              <p className="text-xl font-bold text-emerald-400 mt-1">{organizations?.active ?? 0}</p>
            </div>
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
              <span className="text-xs text-slate-400">Trialing</span>
              <p className="text-xl font-bold text-blue-400 mt-1">{organizations?.trialing ?? 0}</p>
            </div>
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
              <span className="text-xs text-slate-400">Past Due</span>
              <p className="text-xl font-bold text-amber-400 mt-1">{organizations?.pastDue ?? 0}</p>
            </div>
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
              <span className="text-xs text-slate-400">Suspended</span>
              <p className="text-xl font-bold text-rose-400 mt-1">{organizations?.suspended ?? 0}</p>
            </div>
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
              <span className="text-xs text-slate-400">Canceled</span>
              <p className="text-xl font-bold text-slate-400 mt-1">{organizations?.canceled ?? 0}</p>
            </div>
          </div>
        </div>

        {/* Plan Distribution */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">Active Plan Distribution</h2>
            <Link to="/platform/plans" className="text-xs text-blue-400 hover:text-blue-300 font-medium">
              Manage plans &rarr;
            </Link>
          </div>
          <div className="space-y-3">
            {planDistribution && Object.keys(planDistribution).length > 0 ? (
              Object.entries(planDistribution).map(([code, count]) => (
                <div key={code} className="flex items-center justify-between p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
                  <span className="text-sm font-medium text-slate-300 capitalize">{code} Plan</span>
                  <span className="text-sm font-bold text-white bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-0.5 rounded-full">
                    {count} {count === 1 ? 'sub' : 'subs'}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No active subscriptions found.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
