import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  BuildingOffice2Icon,
  CreditCardIcon,
  ChartPieIcon,
  UsersIcon,
  DocumentTextIcon,
  BellAlertIcon,
  CheckBadgeIcon,
  CheckCircleIcon,
  ArrowLeftIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import { platformAPI } from '../../services/platformAPI';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';

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

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'active':
        return <Badge variant="success" dot size="sm">Active</Badge>;
      case 'trialing':
      case 'trial':
        return <Badge variant="info" dot size="sm">Trial</Badge>;
      case 'past_due':
        return <Badge variant="warning" dot size="sm">Past Due</Badge>;
      case 'suspended':
        return <Badge variant="danger" dot size="sm">Suspended</Badge>;
      case 'canceled':
        return <Badge variant="neutral" dot size="sm">Canceled</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{status}</Badge>;
    }
  };

  if (loading) {
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

  const { organization, subscription, quotaUsage, shops, members, recentInvoices, recentNotifications } = data;

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

      {/* Organization Header Card */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-2xs">
              <BuildingOffice2Icon className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-h2 font-bold text-text-primary tracking-tight">
                  {organization.name}
                </h2>
                {renderStatusBadge(organization.status)}
              </div>
              <p className="text-caption text-text-muted font-mono mt-0.5">
                Created on {new Date(organization.createdAt).toLocaleDateString()}
              </p>
            </div>
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
                  <span className="text-text-secondary">Status</span>
                  <Badge variant={subscription.status === 'active' ? 'success' : 'warning'} size="sm" dot>
                    {subscription.status}
                  </Badge>
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
    </div>
  );
}
