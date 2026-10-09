import React, { useEffect, useState } from 'react';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExclamationCircleIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import { platformAPI } from '../../services/platformAPI';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';

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

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'paid':
        return <Badge variant="success" dot size="sm">Paid</Badge>;
      case 'pending':
        return <Badge variant="warning" dot size="sm">Pending</Badge>;
      case 'failed':
        return <Badge variant="danger" dot size="sm">Failed</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Platform Invoices"
        description="Global audit ledger of all tenant subscription renewals and receipts."
      />

      {/* Filters Card */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2.5 w-full sm:w-96">
            <div className="relative w-full">
              <div className="pointer-events-none absolute inset-y-0 left-0 pl-3.5 flex items-center text-text-muted">
                <MagnifyingGlassIcon className="h-4 w-4" aria-hidden="true" />
              </div>
              <input
                type="text"
                placeholder="Search by invoice # or ref..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full bg-surface border border-border-default rounded-xl pl-10 pr-3.5 py-2 text-small text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
              />
            </div>
            <Button type="submit" variant="primary" size="sm">
              Search
            </Button>
          </form>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <label className="text-small font-medium text-text-secondary flex items-center gap-1.5 shrink-0">
              <FunnelIcon className="h-4 w-4 text-text-muted" aria-hidden="true" />
              <span>Status:</span>
            </label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPagination(prev => ({ ...prev, page: 1 }));
              }}
              className="bg-surface border border-border-default rounded-xl px-3 py-2 text-small text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150 cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Error alert */}
      {error && (
        <div className="p-4 rounded-2xl bg-danger/10 border border-danger/20 text-danger text-small flex items-center gap-3">
          <ExclamationCircleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Invoices Table */}
      <div className="rounded-2xl border border-border-default bg-surface shadow-floating overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body border-collapse">
            <thead className="bg-surface-2/70 text-text-secondary text-caption font-semibold uppercase tracking-wider border-b border-border-default">
              <tr>
                <th scope="col" className="py-3.5 px-4 font-semibold">Invoice #</th>
                <th scope="col" className="py-3.5 px-4 font-semibold">Organization</th>
                <th scope="col" className="py-3.5 px-4 font-semibold">Plan</th>
                <th scope="col" className="py-3.5 px-4 font-semibold">Amount</th>
                <th scope="col" className="py-3.5 px-4 font-semibold">Channel</th>
                <th scope="col" className="py-3.5 px-4 font-semibold">Status</th>
                <th scope="col" className="py-3.5 px-4 font-semibold text-right">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default text-text-primary">
              {loading ? (
                Array.from({ length: 5 }).map((_, rIdx) => (
                  <tr key={rIdx} className="animate-pulse">
                    <td className="py-4 px-4"><div className="h-4 bg-surface-2 rounded-md w-28" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-surface-2 rounded-md w-36" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-surface-2 rounded-md w-20" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-surface-2 rounded-md w-24" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-surface-2 rounded-md w-16" /></td>
                    <td className="py-4 px-4"><div className="h-5 bg-surface-2 rounded-full w-16" /></td>
                    <td className="py-4 px-4 text-right"><div className="h-4 bg-surface-2 rounded-md w-20 ml-auto" /></td>
                  </tr>
                ))
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12">
                    <EmptyState
                      icon={DocumentTextIcon}
                      title="No invoices found"
                      description="No invoices match your search or filter criteria."
                    />
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="hover:bg-surface-2/60 transition-colors duration-150"
                  >
                    <td className="py-3.5 px-4 font-mono font-semibold text-text-primary">
                      {inv.invoiceNumber}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-text-primary">
                      {inv.Organization?.name || 'N/A'}
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge variant="neutral" size="sm">
                        {inv.Plan?.name || 'Standard'}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-text-primary">
                      {inv.currency || 'KES'} {Number(inv.amount).toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 uppercase text-caption font-mono text-text-secondary">
                      {inv.paymentChannel || 'manual'}
                    </td>
                    <td className="py-3.5 px-4">
                      {renderStatusBadge(inv.status)}
                    </td>
                    <td className="py-3.5 px-4 text-caption text-text-secondary text-right">
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
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 bg-surface-2/40 border-t border-border-default text-small text-text-secondary">
            <div>
              Showing page <strong className="font-semibold text-text-primary">{pagination.page}</strong> of{' '}
              <strong className="font-semibold text-text-primary">{pagination.totalPages}</strong> ({pagination.total} total)
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                leftIcon={ChevronLeftIcon}
                disabled={pagination.page <= 1}
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                rightIcon={ChevronRightIcon}
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
