import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  BuildingOffice2Icon,
  CreditCardIcon,
  ChartPieIcon,
  UsersIcon,
  DocumentTextIcon,
  BellAlertIcon,
  CheckCircleIcon,
  ArrowLeftIcon,
  ExclamationCircleIcon,
  ShieldExclamationIcon,
  ClockIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { platformAPI } from '../../services/platformAPI';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import OrgLifecycleModal from '../../components/platform/OrgLifecycleModal';

/**
 * Derives the enabled/disabled state of lifecycle actions based on backend rules in platform.js.
 *
 * Backend rules mirrored:
 * 1. Closed/deleted check (platform.js:530, 639, 746):
 *    if (org.deletedAt) -> 409 'Cannot modify lifecycle of a closed or deleted organization.'
 *    => All actions permanently locked on organization.deletedAt only.
 *
 * 2. Suspend checks (platform.js:536, 540):
 *    - if (org.status === 'suspended' && sub?.manualHold === true) -> 409 'Organization is already suspended under manual hold.'
 *    - if (org.status === 'canceled') -> 409 'Cannot suspend an organization that is canceled/deactivated. Reactivate first.'
 *    => Suspend enabled only when: !deleted && !(status === 'suspended' && manualHold) && status !== 'canceled'.
 *
 * 3. Deactivate checks (platform.js:646):
 *    - if (org.status === 'canceled' && sub?.manualHold === true) -> 409 'Organization is already deactivated under manual hold.'
 *    => Deactivate enabled only when: !deleted && !(status === 'canceled' && manualHold).
 *
 * 4. Reactivate checks (platform.js:753):
 *    - if (org.status === 'active' && sub?.status === 'active' && sub?.manualHold === false) -> 409 'Organization is already active and not on hold.'
 *    => Reactivate enabled only when: !deleted && !(status === 'active' && subStatus === 'active' && !manualHold).
 */
function getLifecycleActionStates(organization, subscription) {
  const isDeleted = Boolean(organization?.deletedAt);
  if (isDeleted) {
    return {
      canSuspend: false,
      canDeactivate: false,
      canReactivate: false,
      suspendTooltip: 'Cannot modify lifecycle of a deleted organization.',
      deactivateTooltip: 'Cannot modify lifecycle of a deleted organization.',
      reactivateTooltip: 'Cannot modify lifecycle of a deleted organization.'
    };
  }

  const orgStatus = organization?.status;
  const subStatus = subscription?.status;
  const isHeld = Boolean(subscription?.manualHold);

  // Suspend: disabled if already held suspended, or if canceled/deactivated
  const isAlreadyHeldSuspended = orgStatus === 'suspended' && isHeld;
  const isCanceled = orgStatus === 'canceled';
  const canSuspend = !isAlreadyHeldSuspended && !isCanceled;

  // Deactivate: disabled if already deactivated under hold
  const isAlreadyHeldDeactivated = orgStatus === 'canceled' && isHeld;
  const canDeactivate = !isAlreadyHeldDeactivated;

  // Reactivate: disabled if already active and not on hold
  const isFullyActive = orgStatus === 'active' && subStatus === 'active' && !isHeld;
  const canReactivate = !isFullyActive;

  return {
    canSuspend,
    canDeactivate,
    canReactivate,
    suspendTooltip: isAlreadyHeldSuspended
      ? 'Organization is already suspended under manual hold'
      : (isCanceled ? 'Cannot suspend an organization that is canceled. Reactivate first.' : undefined),
    deactivateTooltip: isAlreadyHeldDeactivated
      ? 'Organization is already deactivated under manual hold'
      : undefined,
    reactivateTooltip: isFullyActive
      ? 'Organization is already active and not on hold'
      : undefined
  };
}

export default function PlatformOrgDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal state
  const [modalState, setModalState] = useState({
    isOpen: false,
    actionType: 'suspend'
  });

  // Audit state
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditPagination, setAuditPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [auditLoading, setAuditLoading] = useState(false);

  const fetchAudit = useCallback(async (page = 1) => {
    try {
      setAuditLoading(true);
      const res = await platformAPI.getOrganizationAudit(id, { page, limit: 10 });
      setAuditLogs(res.data.auditLogs || []);
      setAuditPagination(res.data.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setAuditLoading(false);
    }
  }, [id]);

  const fetchOrg = useCallback(async () => {
    try {
      setLoading(true);
      const res = await platformAPI.getOrganization(id);
      setData(res.data);
      await fetchAudit(1);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load organization details');
    } finally {
      setLoading(false);
    }
  }, [id, fetchAudit]);

  useEffect(() => {
    fetchOrg();
  }, [fetchOrg]);

  const renderStatusBadge = (status, isHeld) => {
    let baseBadge = null;
    switch (status) {
      case 'active':
        baseBadge = <Badge variant="success" dot size="sm">Active</Badge>;
        break;
      case 'trialing':
      case 'trial':
        baseBadge = <Badge variant="info" dot size="sm">Trial</Badge>;
        break;
      case 'past_due':
        baseBadge = <Badge variant="warning" dot size="sm">Past Due</Badge>;
        break;
      case 'suspended':
        baseBadge = <Badge variant="danger" dot size="sm">Suspended</Badge>;
        break;
      case 'canceled':
        baseBadge = <Badge variant="neutral" dot size="sm">Canceled</Badge>;
        break;
      default:
        baseBadge = <Badge variant="neutral" size="sm">{status}</Badge>;
    }

    if (!isHeld) {
      return baseBadge;
    }

    return (
      <div className="flex items-center gap-2 flex-wrap">
        {baseBadge}
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-caption font-semibold bg-stone-900 text-stone-100 border border-stone-700 shadow-2xs font-mono"
          title="Manual platform hold is active"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
          Platform hold
        </span>
      </div>
    );
  };

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-surface-2 rounded-xl animate-pulse" />
        <Card loading />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card loading />
          <Card loading />
          <Card loading />
          <Card loading />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <Link
          to="/platform/organizations"
          className="inline-flex items-center gap-1.5 text-small font-semibold text-primary hover:text-primary-hover transition-colors"
        >
          <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
          <span>Back to Organizations</span>
        </Link>
        <div className="p-4 rounded-2xl bg-danger/10 border border-danger/20 text-danger text-small flex items-center gap-3">
          <ExclamationCircleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{error || 'Organization not found'}</span>
        </div>
      </div>
    );
  }

  const {
    organization,
    subscription,
    quotaUsage,
    shops,
    members,
    recentInvoices,
    heldPaidInvoices = [],
    recentNotifications
  } = data;

  const isHeld = Boolean(subscription?.manualHold);
  const actionStates = getLifecycleActionStates(organization, subscription);
  const latestAudit = auditLogs.length > 0 ? auditLogs[0] : null;

  const breadcrumbs = [
    { label: 'Organizations', href: '/platform/organizations' },
    { label: organization.name }
  ];

  return (
    <div className="space-y-6">
      {/* Header with Breadcrumb */}
      <PageHeader
        title={organization.name}
        description={`Slug: ${organization.slug} • Tenant ID: ${organization.id}`}
        breadcrumbs={breadcrumbs}
      />

      {/* Red Hold Alert Banner (shown prominently if manual hold is active) */}
      {isHeld && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-danger/10 border border-danger/30 text-danger flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <ShieldExclamationIcon className="h-6 w-6 shrink-0 mt-0.5 text-danger" aria-hidden="true" />
            <div>
              <div className="flex items-center gap-2">
                <p className="font-bold text-small text-danger">Platform Hold Active</p>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-stone-900 text-stone-100 font-mono">
                  Manual Hold
                </span>
              </div>
              <p className="text-caption text-text-secondary mt-0.5 leading-relaxed">
                This organization is locked under manual super-admin hold. Tenant operational requests return 403 and billing renewals are rejected.
                {latestAudit?.reason && (
                  <span className="block mt-1 font-medium text-text-primary">
                    Hold Reason: "{latestAudit.reason}"
                    {latestAudit.actor && ` — by ${latestAudit.actor.name || latestAudit.actor.email}`}
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setModalState({ isOpen: true, actionType: 'reactivate' })}
            disabled={!actionStates.canReactivate}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white font-semibold text-small shrink-0 transition-colors shadow-xs disabled:opacity-50"
          >
            Reactivate Organization
          </button>
        </div>
      )}

      {/* Organization Header Card with Lifecycle Action Bar */}
      <Card className="p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-2xs shrink-0">
              <BuildingOffice2Icon className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-h2 font-bold text-text-primary tracking-tight">
                  {organization.name}
                </h2>
                {renderStatusBadge(organization.status, isHeld)}
              </div>
              <p className="text-caption text-text-muted font-mono mt-0.5">
                Created on {new Date(organization.createdAt).toLocaleDateString()}
                {organization.deletedAt && ` • Deleted on ${new Date(organization.deletedAt).toLocaleDateString()}`}
              </p>
            </div>
          </div>

          {/* Lifecycle Action Bar (Real <button> elements, 44px targets) */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Suspend button: amber/danger, disabled when already held or canceled */}
            <button
              type="button"
              disabled={!actionStates.canSuspend}
              title={actionStates.suspendTooltip}
              onClick={() => setModalState({ isOpen: true, actionType: 'suspend' })}
              className="min-h-[44px] px-4 py-2 rounded-xl font-semibold text-small transition-all bg-amber-600 hover:bg-amber-700 text-white shadow-xs focus:outline-none focus:ring-2 focus:ring-amber-500/40 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-amber-600"
            >
              Suspend
            </button>

            {/* Deactivate button: Red outline */}
            <button
              type="button"
              disabled={!actionStates.canDeactivate}
              title={actionStates.deactivateTooltip}
              onClick={() => setModalState({ isOpen: true, actionType: 'deactivate' })}
              className="min-h-[44px] px-4 py-2 rounded-xl font-semibold text-small transition-all border-2 border-danger text-danger hover:bg-danger/10 shadow-xs focus:outline-none focus:ring-2 focus:ring-danger/40 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              Deactivate
            </button>

            {/* Reactivate button: Primary solid */}
            <button
              type="button"
              disabled={!actionStates.canReactivate}
              title={actionStates.reactivateTooltip}
              onClick={() => setModalState({ isOpen: true, actionType: 'reactivate' })}
              className="min-h-[44px] px-4 py-2 rounded-xl font-semibold text-small transition-all bg-primary hover:bg-primary-hover text-white shadow-xs focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-primary"
            >
              Reactivate
            </button>
          </div>
        </div>
      </Card>

      {/* Subscription & Quota Usage Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Subscription Info */}
        <Card>
          <Card.Header
            title="Subscription & Plan"
            subtitle="Tier details and billing cycle"
          />
          <Card.Body>
            {subscription ? (
              <div className="divide-y divide-border-default/60 text-small">
                <div className="flex justify-between py-2.5">
                  <span className="text-text-secondary">Current Plan</span>
                  <span className="font-semibold text-text-primary">{subscription.plan?.name || 'Unknown'}</span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-text-secondary">Subscription Status</span>
                  {renderStatusBadge(subscription.status, isHeld)}
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-text-secondary">Billing Cycle</span>
                  <span className="font-medium text-text-primary capitalize">{subscription.billingCycle}</span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-text-secondary">Period Ends At</span>
                  <span className="font-mono text-caption text-text-primary">
                    {subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
                {subscription.trialEndsAt && (
                  <div className="flex justify-between py-2.5">
                    <span className="text-text-secondary">Trial Ends At</span>
                    <span className="font-mono text-caption text-info font-medium">
                      {new Date(subscription.trialEndsAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
                <div className="flex justify-between py-2.5">
                  <span className="text-text-secondary">Manual Hold Flag</span>
                  <Badge variant={isHeld ? 'danger' : 'neutral'} size="sm">
                    {isHeld ? 'true (held)' : 'false'}
                  </Badge>
                </div>
              </div>
            ) : (
              <p className="text-small text-text-muted py-4 text-center">
                No active subscription record.
              </p>
            )}
          </Card.Body>
        </Card>

        {/* Quota Usage */}
        <Card>
          <Card.Header
            title="Operational Quotas"
            subtitle="Resource consumption against plan limits"
          />
          <Card.Body>
            <div className="space-y-5">
              {/* Branch Outlets */}
              <div>
                <div className="flex justify-between text-small mb-2">
                  <span className="font-medium text-text-secondary">Branch Outlets (Shops)</span>
                  <span className="font-mono text-caption text-text-primary font-semibold">
                    {quotaUsage?.shops?.current} / {quotaUsage?.shops?.limit === -1 ? 'Unlimited' : quotaUsage?.shops?.limit}
                  </span>
                </div>
                <div className="w-full bg-surface-2 rounded-full h-2.5 overflow-hidden border border-border-default">
                  <div
                    className="bg-primary h-2.5 rounded-full transition-all duration-300"
                    style={{
                      width: quotaUsage?.shops?.limit === -1
                        ? '20%'
                        : `${Math.min(100, (quotaUsage?.shops?.current / (quotaUsage?.shops?.limit || 1)) * 100)}%`
                    }}
                  />
                </div>
              </div>

              {/* User Accounts */}
              <div>
                <div className="flex justify-between text-small mb-2">
                  <span className="font-medium text-text-secondary">User Accounts</span>
                  <span className="font-mono text-caption text-text-primary font-semibold">
                    {quotaUsage?.users?.current} / {quotaUsage?.users?.limit === -1 ? 'Unlimited' : quotaUsage?.users?.limit}
                  </span>
                </div>
                <div className="w-full bg-surface-2 rounded-full h-2.5 overflow-hidden border border-border-default">
                  <div
                    className="bg-info h-2.5 rounded-full transition-all duration-300"
                    style={{
                      width: quotaUsage?.users?.limit === -1
                        ? '20%'
                        : `${Math.min(100, (quotaUsage?.users?.current / (quotaUsage?.users?.limit || 1)) * 100)}%`
                    }}
                  />
                </div>
              </div>
            </div>
          </Card.Body>
        </Card>
      </div>

      {/* Held-Paid Invoices Panel (Surfaces invoices with metadata.heldByPlatform) */}
      {heldPaidInvoices.length > 0 && (
        <Card>
          <Card.Header
            title={`Held-Paid Invoices (${heldPaidInvoices.length})`}
            subtitle="Payments confirmed and marked paid while organization was on platform hold"
          />
          <Card.Body>
            <div className="divide-y divide-border-default/60">
              {heldPaidInvoices.map((inv) => (
                <div key={inv.id} className="py-3 flex items-center justify-between text-small">
                  <div>
                    <span className="font-mono font-semibold text-text-primary">{inv.invoiceNumber}</span>
                    <span className="text-text-secondary ml-2 font-medium">
                      {inv.currency} {Number(inv.amount).toFixed(2)}
                    </span>
                    <span className="text-caption text-text-muted ml-3 font-mono">
                      Paid: {new Date(inv.paidAt || inv.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-caption font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                      Paid (Held by Platform)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card.Body>
        </Card>
      )}

      {/* Platform Audit History Panel */}
      <Card>
        <Card.Header
          title="Platform Audit History"
          subtitle="Super-admin lifecycle transitions and compliance logs"
          action={
            <button
              type="button"
              onClick={() => fetchAudit(auditPagination.page)}
              className="inline-flex items-center gap-1.5 text-caption font-semibold text-primary hover:text-primary-hover transition-colors"
            >
              <ArrowPathIcon className={`h-3.5 w-3.5 ${auditLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>Refresh Logs</span>
            </button>
          }
        />
        <Card.Body>
          {auditLoading && auditLogs.length === 0 ? (
            <div className="py-8 flex justify-center">
              <Spinner size="md" />
            </div>
          ) : auditLogs.length === 0 ? (
            <p className="text-small text-text-muted py-4 text-center">
              No platform audit records logged for this organization.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-small">
                  <thead>
                    <tr className="border-b border-border-default text-caption font-semibold text-text-secondary uppercase tracking-wider">
                      <th className="py-2.5 pr-4">Timestamp</th>
                      <th className="py-2.5 px-4">Action</th>
                      <th className="py-2.5 px-4">Actor</th>
                      <th className="py-2.5 px-4">Transition</th>
                      <th className="py-2.5 px-4">Reason</th>
                      <th className="py-2.5 pl-4">IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-default/60">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-surface-2/50 transition-colors">
                        <td className="py-3 pr-4 font-mono text-caption text-text-muted whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-semibold text-text-primary whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-semibold ${
                              log.action === 'ORGANIZATION_REACTIVATED'
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                                : log.action === 'ORGANIZATION_SUSPENDED'
                                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20'
                                : 'bg-danger/10 text-danger border border-danger/20'
                            }`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-text-primary whitespace-nowrap">
                          <span className="font-medium">{log.actor?.name || 'Platform Admin'}</span>
                          {log.actor?.email && (
                            <span className="text-caption text-text-muted block font-mono">
                              {log.actor.email}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-caption text-text-secondary whitespace-nowrap">
                          {log.fromStatus || 'none'} → <strong className="text-text-primary">{log.toStatus}</strong>
                        </td>
                        <td className="py-3 px-4 text-text-secondary max-w-xs break-words">
                          {log.reason}
                        </td>
                        <td className="py-3 pl-4 font-mono text-caption text-text-muted whitespace-nowrap">
                          {log.ip || 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {auditPagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-3 border-t border-border-default text-caption text-text-secondary">
                  <span>
                    Page {auditPagination.page} of {auditPagination.totalPages} ({auditPagination.total} logs)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={auditPagination.page <= 1 || auditLoading}
                      onClick={() => fetchAudit(auditPagination.page - 1)}
                      className="min-h-[36px] px-3 py-1 rounded-lg border border-border-default hover:bg-surface-2 disabled:opacity-40 transition-colors font-medium"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={auditPagination.page >= auditPagination.totalPages || auditLoading}
                      onClick={() => fetchAudit(auditPagination.page + 1)}
                      className="min-h-[36px] px-3 py-1 rounded-lg border border-border-default hover:bg-surface-2 disabled:opacity-40 transition-colors font-medium"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card.Body>
      </Card>

      {/* Branches & Team Members Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Shops */}
        <Card>
          <Card.Header
            title={`Shops (${shops?.length || 0})`}
            subtitle="Configured retail locations and outlets"
          />
          <Card.Body>
            {shops?.length === 0 ? (
              <p className="text-small text-text-muted py-4 text-center">No branch outlets configured.</p>
            ) : (
              <div className="divide-y divide-border-default/60">
                {shops?.map((s) => (
                  <div key={s.id} className="py-3 flex items-center justify-between text-small">
                    <div>
                      <span className="font-semibold text-text-primary">{s.name}</span>
                      <span className="text-caption text-text-muted font-mono ml-2">ID: {s.id}</span>
                    </div>
                    <Badge variant={s.active ? 'success' : 'neutral'} size="sm" dot>
                      {s.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card.Body>
        </Card>

        {/* Members */}
        <Card>
          <Card.Header
            title={`Team Members (${members?.length || 0})`}
            subtitle="Assigned operators and administrators"
          />
          <Card.Body>
            {members?.length === 0 ? (
              <p className="text-small text-text-muted py-4 text-center">No team members assigned.</p>
            ) : (
              <div className="divide-y divide-border-default/60">
                {members?.map((m) => (
                  <div key={m.membershipId} className="py-3 flex items-center justify-between text-small">
                    <div>
                      <span className="font-semibold text-text-primary">{m.user?.name}</span>
                      <span className="text-caption text-text-muted font-mono ml-2">({m.user?.email})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="neutral" size="sm">
                        {m.orgRole}
                      </Badge>
                      {m.user?.emailVerified && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-caption flex items-center gap-0.5">
                          <CheckCircleIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Verified</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card.Body>
        </Card>
      </div>

      {/* Invoices & Notification History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Invoices */}
        <Card>
          <Card.Header
            title="Recent Invoices"
            subtitle="Latest billing events and renewal receipts"
          />
          <Card.Body>
            {recentInvoices?.length === 0 ? (
              <p className="text-small text-text-muted py-4 text-center">No invoices on file.</p>
            ) : (
              <div className="divide-y divide-border-default/60">
                {recentInvoices?.map((inv) => (
                  <div key={inv.id} className="py-3 flex items-center justify-between text-small">
                    <div>
                      <span className="font-mono font-semibold text-text-primary">{inv.invoiceNumber}</span>
                      <span className="text-text-secondary ml-2 font-medium">KES {Number(inv.amount).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Badge variant={inv.status === 'paid' ? 'success' : 'warning'} size="sm" dot>
                        {inv.status}
                      </Badge>
                      <span className="text-caption text-text-muted font-mono">
                        {new Date(inv.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card.Body>
        </Card>

        {/* Notifications */}
        <Card>
          <Card.Header
            title="Recent Notifications"
            subtitle="Automated email notifications dispatched"
          />
          <Card.Body>
            {recentNotifications?.length === 0 ? (
              <p className="text-small text-text-muted py-4 text-center">No notification logs recorded.</p>
            ) : (
              <div className="divide-y divide-border-default/60">
                {recentNotifications?.map((notif) => (
                  <div key={notif.id} className="py-3 flex items-center justify-between text-small">
                    <div>
                      <span className="font-mono font-semibold text-primary">{notif.eventType}</span>
                      <span className="text-caption text-text-muted block truncate max-w-[220px]">
                        {notif.recipientEmail}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Badge
                        variant={notif.status === 'sent' ? 'success' : (notif.status === 'skipped' ? 'neutral' : 'danger')}
                        size="sm"
                        dot
                      >
                        {notif.status}
                      </Badge>
                      <span className="text-caption text-text-muted font-mono">
                        {new Date(notif.sentAt || notif.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card.Body>
        </Card>
      </div>

      {/* Org Lifecycle Modal */}
      <OrgLifecycleModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ isOpen: false, actionType: 'suspend' })}
        org={organization}
        subscription={subscription}
        actionType={modalState.actionType}
        onSuccess={fetchOrg}
      />
    </div>
  );
}
