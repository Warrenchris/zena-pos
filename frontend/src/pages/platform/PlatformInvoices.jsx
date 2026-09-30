import React, { useEffect, useState } from 'react';
import { platformAPI } from '../../services/platformAPI';

export default function PlatformInvoices() {
  const [invoices, setInvoices] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadInvoices() {
      try {
        setLoading(true);
        const params = {
          page: pagination.page,
          limit: 20,
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(search ? { search } : {})
        };
        const res = await platformAPI.getInvoices(params);
        setInvoices(res.data.invoices);
        setPagination(res.data.pagination);
      } catch (err) {
        setError(err.response?.data?.error || err.message || 'Failed to load invoices');
      } finally {
        setLoading(false);
      }
    }
    loadInvoices();
  }, [pagination.page, statusFilter, search]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Platform Invoices</h1>
        <p className="text-sm text-slate-400 mt-1">Global audit ledger of all tenant subscription renewals and receipts.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900 p-4 border border-slate-800 rounded-xl">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full sm:w-80">
          <input
            type="text"
            placeholder="Search by invoice # or ref..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Search
          </button>
        </form>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="text-xs text-slate-400 font-medium">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPagination(prev => ({ ...prev, page: 1 }));
            }}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-4 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Invoices Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950/60 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4">Invoice #</th>
                <th className="py-3.5 px-4">Organization</th>
                <th className="py-3.5 px-4">Plan</th>
                <th className="py-3.5 px-4">Amount</th>
                <th className="py-3.5 px-4">Channel</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-500">
                    Loading invoices...
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-500">
                    No invoices matching your criteria.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-white">
                      {inv.invoiceNumber}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-200">
                      {inv.Organization?.name || 'N/A'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs font-medium text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                        {inv.Plan?.name || 'Standard'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-white">
                      {inv.currency || 'KES'} {Number(inv.amount).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 uppercase text-xs font-mono text-slate-400">
                      {inv.paymentChannel || 'manual'}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full capitalize ${
                        inv.status === 'paid'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : (inv.status === 'pending'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20')
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-400 text-right">
                      {new Date(inv.createdAt).toLocaleDateString()}
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
