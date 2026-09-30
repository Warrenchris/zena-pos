import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { platformAPI } from '../../services/platformAPI';

export default function PlatformOrgDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadOrg() {
      try {
        setLoading(true);
        const res = await platformAPI.getOrganization(id);
        setData(res.data);
      } catch (err) {
        setError(err.response?.data?.error || err.message || 'Failed to load organization details');
      } finally {
        setLoading(false);
      }
    }
    loadOrg();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link to="/platform/organizations" className="text-xs text-blue-400 hover:text-blue-300 font-medium">
          &larr; Back to Organizations
        </Link>
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-4 rounded-xl text-sm">
          {error || 'Organization not found'}
        </div>
      </div>
    );
  }

  const { organization, subscription, quotaUsage, shops, members, recentInvoices, recentNotifications } = data;

  return (
    <div className="space-y-6">
      {/* Back button & Breadcrumb */}
      <div>
        <Link to="/platform/organizations" className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1">
          &larr; Back to Organizations
        </Link>
      </div>

      {/* Organization Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white tracking-tight">{organization.name}</h1>
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-slate-800 text-slate-300 border border-slate-700 capitalize">
                {organization.status}
              </span>
            </div>
            <div className="text-xs text-slate-400 font-mono mt-1">Slug: {organization.slug} | Org ID: {organization.id}</div>
          </div>
          <div className="text-xs text-slate-400">
            Created on {new Date(organization.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>

      {/* Subscription & Quota Usage Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Subscription Info */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-4">Subscription & Plan</h2>
          {subscription ? (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Current Plan</span>
                <span className="font-semibold text-white">{subscription.plan?.name || 'Unknown'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Status</span>
                <span className="font-semibold text-emerald-400 capitalize">{subscription.status}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Billing Cycle</span>
                <span className="text-slate-200 capitalize">{subscription.billingCycle}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Period Ends At</span>
                <span className="text-slate-200 font-mono text-xs">
                  {subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : 'N/A'}
                </span>
              </div>
              {subscription.trialEndsAt && (
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">Trial Ends At</span>
                  <span className="text-blue-400 font-mono text-xs">
                    {new Date(subscription.trialEndsAt).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No active subscription record.</p>
          )}
        </div>

        {/* Quota Usage */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-4">Operational Quotas</h2>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-slate-400 font-medium">Branch Outlets (Shops)</span>
                <span className="text-slate-200 font-mono text-xs">
                  {quotaUsage?.shops?.current} / {quotaUsage?.shops?.limit === -1 ? 'Unlimited' : quotaUsage?.shops?.limit}
                </span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                <div
                  className="bg-blue-500 h-2 rounded-full"
                  style={{
                    width: quotaUsage?.shops?.limit === -1
                      ? '20%'
                      : `${Math.min(100, (quotaUsage?.shops?.current / (quotaUsage?.shops?.limit || 1)) * 100)}%`
                  }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-slate-400 font-medium">User Accounts</span>
                <span className="text-slate-200 font-mono text-xs">
                  {quotaUsage?.users?.current} / {quotaUsage?.users?.limit === -1 ? 'Unlimited' : quotaUsage?.users?.limit}
                </span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                <div
                  className="bg-indigo-500 h-2 rounded-full"
                  style={{
                    width: quotaUsage?.users?.limit === -1
                      ? '20%'
                      : `${Math.min(100, (quotaUsage?.users?.current / (quotaUsage?.users?.limit || 1)) * 100)}%`
                  }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Branches & Team Members Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Shops */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-3">Shops ({shops?.length || 0})</h2>
          <div className="divide-y divide-slate-800">
            {shops?.map(s => (
              <div key={s.id} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-slate-200">{s.name}</span>
                  <span className="text-slate-500 font-mono ml-2">ID: {s.id}</span>
                </div>
                <span className={`px-2 py-0.5 rounded ${s.active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                  {s.active ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Members */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-3">Team Members ({members?.length || 0})</h2>
          <div className="divide-y divide-slate-800">
            {members?.map(m => (
              <div key={m.membershipId} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-slate-200">{m.user?.name}</span>
                  <span className="text-slate-400 font-mono ml-2">({m.user?.email})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 uppercase font-mono text-[10px]">
                    {m.orgRole}
                  </span>
                  {m.user?.emailVerified && (
                    <span className="text-emerald-400 font-medium">✓ Verified</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Invoices & Notification History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Invoices */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-3">Recent Invoices</h2>
          {recentInvoices?.length === 0 ? (
            <p className="text-xs text-slate-500">No invoices on file.</p>
          ) : (
            <div className="divide-y divide-slate-800">
              {recentInvoices?.map(inv => (
                <div key={inv.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-mono text-slate-200">{inv.invoiceNumber}</span>
                    <span className="text-slate-400 ml-2">KES {Number(inv.amount).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded capitalize ${inv.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                      {inv.status}
                    </span>
                    <span className="text-slate-500 font-mono">{new Date(inv.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-3">Recent Notifications</h2>
          {recentNotifications?.length === 0 ? (
            <p className="text-xs text-slate-500">No notification logs recorded.</p>
          ) : (
            <div className="divide-y divide-slate-800">
              {recentNotifications?.map(notif => (
                <div key={notif.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-mono text-blue-400">{notif.eventType}</span>
                    <span className="text-slate-500 text-[11px] block">{notif.recipientEmail}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded capitalize ${notif.status === 'sent' ? 'bg-emerald-500/10 text-emerald-400' : (notif.status === 'skipped' ? 'bg-slate-800 text-slate-400' : 'bg-rose-500/10 text-rose-400')}`}>
                      {notif.status}
                    </span>
                    <span className="text-slate-500 font-mono">{new Date(notif.sentAt || notif.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
