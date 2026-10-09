import React, { useEffect, useState } from 'react';
import {
  FunnelIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExclamationCircleIcon,
  BellAlertIcon,
} from '@heroicons/react/24/outline';
import { platformAPI } from '../../services/platformAPI';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';

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

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'sent':
        return <Badge variant="success" dot size="sm">Sent</Badge>;
      case 'skipped':
        return <Badge variant="neutral" dot size="sm">Skipped</Badge>;
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
        title="Notification Audit Logs"
        description="Audit trail of automated lifecycle reminder and receipt emails dispatched to tenant owners."
      />

      {/* Filters Card */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <label className="text-small font-medium text-text-secondary flex items-center gap-1.5 shrink-0">
                <FunnelIcon className="h-4 w-4 text-text-muted" aria-hidden="true" />
                <span>Event:</span>
              </label>
              <select
                value={eventTypeFilter}
                onChange={(e) => {
                  setEventTypeFilter(e.target.value);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
                className="bg-surface border border-border-default rounded-xl px-3 py-2 text-small text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150 cursor-pointer"
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

            <div className="flex items-center gap-2">
              <label className="text-small font-medium text-text-secondary shrink-0">
                Status:
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
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
                <option value="skipped">Skipped</option>
              </select>
            </div>
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

      {/* Notifications Table */}
      <div className="rounded-2xl border border-border-default bg-surface shadow-floating overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body border-collapse">
            <thead className="bg-surface-2/70 text-text-secondary text-caption font-semibold uppercase tracking-wider border-b border-border-default">
              <tr>
                <th scope="col" className="py-3.5 px-4 font-semibold">Event Type</th>
                <th scope="col" className="py-3.5 px-4 font-semibold">Organization</th>
                <th scope="col" className="py-3.5 px-4 font-semibold">Recipient</th>
                <th scope="col" className="py-3.5 px-4 font-semibold">Period Key</th>
                <th scope="col" className="py-3.5 px-4 font-semibold">Status</th>
                <th scope="col" className="py-3.5 px-4 font-semibold text-right">Sent At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default text-text-primary">
              {loading ? (
                Array.from({ length: 5 }).map((_, rIdx) => (
                  <tr key={rIdx} className="animate-pulse">
                    <td className="py-4 px-4"><div className="h-4 bg-surface-2 rounded-md w-36" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-surface-2 rounded-md w-32" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-surface-2 rounded-md w-40" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-surface-2 rounded-md w-24" /></td>
                    <td className="py-4 px-4"><div className="h-5 bg-surface-2 rounded-full w-16" /></td>
                    <td className="py-4 px-4 text-right"><div className="h-4 bg-surface-2 rounded-md w-28 ml-auto" /></td>
                  </tr>
                ))
              ) : notifications.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-12">
                    <EmptyState
                      icon={BellAlertIcon}
                      title="No notification logs found"
                      description="No notification audit records match your filter criteria."
                    />
                  </td>
                </tr>
              ) : (
                notifications.map((n) => (
                  <tr
                    key={n.id}
                    className="hover:bg-surface-2/60 transition-colors duration-150"
                  >
                    <td className="py-3.5 px-4 font-mono font-semibold text-primary">
                      {n.eventType}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-text-primary">
                      {n.Organization?.name || `Org #${n.organizationId}`}
                    </td>
                    <td className="py-3.5 px-4 text-small font-mono text-text-secondary">
                      {n.recipientEmail}
                    </td>
                    <td className="py-3.5 px-4 text-caption font-mono text-text-muted">
                      {n.periodKey}
                    </td>
                    <td className="py-3.5 px-4">
                      {renderStatusBadge(n.status)}
                    </td>
                    <td className="py-3.5 px-4 text-caption text-text-secondary text-right">
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
