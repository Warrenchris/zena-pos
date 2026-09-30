import React, { useEffect, useState } from 'react';
import { platformAPI } from '../../services/platformAPI';

export default function PlatformNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [statusFilter, setStatusFilter] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadNotifications() {
      try {
        setLoading(true);
        const params = {
          page: pagination.page,
          limit: 20,
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(eventTypeFilter ? { eventType: eventTypeFilter } : {})
        };
        const res = await platformAPI.getNotifications(params);
        setNotifications(res.data.notifications);
        setPagination(res.data.pagination);
      } catch (err) {
        setError(err.response?.data?.error || err.message || 'Failed to load notifications');
      } finally {
        setLoading(false);
      }
    }
    loadNotifications();
  }, [pagination.page, statusFilter, eventTypeFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Notification Audit Logs</h1>
        <p className="text-sm text-slate-400 mt-1">Audit trail of automated lifecycle reminder and receipt emails dispatched to tenant owners.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900 p-4 border border-slate-800 rounded-xl">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div>
            <label className="text-xs text-slate-400 font-medium mr-2">Event:</label>
            <select
              value={eventTypeFilter}
              onChange={(e) => {
                setEventTypeFilter(e.target.value);
                setPagination(prev => ({ ...prev, page: 1 }));
              }}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Events</option>
              <option value="TRIAL_ENDING_5D">Trial Ending (5d)</option>
              <option value="TRIAL_ENDING_1D">Trial Ending (1d)</option>
              <option value="RENEWAL_DUE_7D">Renewal Due (7d)</option>
              <option value="RENEWAL_DUE_1D">Renewal Due (1d)</option>
              <option value="PAYMENT_RECEIPT">Payment Receipt</option>
              <option value="PAYMENT_FAILED">Payment Failed</option>
              <option value="ACCOUNT_SUSPENDED">Account Suspended</option>
              <option value="ACCOUNT_REACTIVATED">Account Reactivated</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 font-medium mr-2">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPagination(prev => ({ ...prev, page: 1 }));
              }}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
              <option value="skipped">Skipped</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-4 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Notifications Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950/60 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4">Event Type</th>
                <th className="py-3.5 px-4">Organization</th>
                <th className="py-3.5 px-4">Recipient</th>
                <th className="py-3.5 px-4">Period Key</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Sent At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-slate-500">
                    Loading notification logs...
                  </td>
                </tr>
              ) : notifications.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-slate-500">
                    No notification logs recorded.
                  </td>
                </tr>
              ) : (
                notifications.map((n) => (
                  <tr key={n.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-blue-400">
                      {n.eventType}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-200">
                      {n.Organization?.name || `Org #${n.organizationId}`}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-slate-300">
                      {n.recipientEmail}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-slate-400">
                      {n.periodKey}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full capitalize ${
                        n.status === 'sent'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : (n.status === 'skipped'
                              ? 'bg-slate-800 text-slate-400 border border-slate-700'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20')
                      }`}>
                        {n.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-400 text-right">
                      {new Date(n.sentAt || n.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 bg-slate-950/60 border-t border-slate-800">
            <span className="text-xs text-slate-400">
              Showing page <strong className="text-slate-200">{pagination.page}</strong> of <strong className="text-slate-200">{pagination.totalPages}</strong> ({pagination.total} total)
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={pagination.page <= 1}
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none text-xs font-medium rounded border border-slate-700 transition-colors"
              >
                Previous
              </button>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none text-xs font-medium rounded border border-slate-700 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
