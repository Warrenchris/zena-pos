import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BuildingOffice2Icon,
  CreditCardIcon,
  CurrencyDollarIcon,
  GlobeAltIcon,
  ArrowTrendingUpIcon,
  UsersIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  NoSymbolIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { platformAPI } from '../../services/platformAPI';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';

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
      <div className="space-y-6">
        <PageHeader
          title="Platform Overview"
          description="High-level SaaS performance, tenant health, and revenue metrics."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Card key={idx} loading />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card loading />
          <Card loading />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Platform Overview"
          description="High-level SaaS performance, tenant health, and revenue metrics."
        />
        <div className="p-4 rounded-2xl bg-danger/10 border border-danger/20 text-danger text-small flex items-center gap-3">
          <ExclamationCircleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  const { organizations, infrastructure, revenue, planDistribution } = data || {};

  return (
    <div className="space-y-8">
      {/* Harmonized Page Header */}
      <PageHeader
        title="Platform Overview"
        description="High-level SaaS performance, tenant health, and revenue metrics."
      />

      {/* KPI Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Tenants */}
        <Card hoverable className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-caption font-semibold text-text-muted uppercase tracking-wider">
              Total Tenants
            </span>
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <BuildingOffice2Icon className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
          <div className="text-display font-bold text-text-primary mt-2">
            {organizations?.total ?? 0}
          </div>
          <div className="mt-2.5 flex items-center gap-1.5">
            <Badge variant="success" size="sm" icon={ArrowTrendingUpIcon}>
              +{organizations?.recentSignups30d ?? 0} new in 30d
            </Badge>
          </div>
        </Card>

        {/* Active Subscriptions */}
        <Card hoverable className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-caption font-semibold text-text-muted uppercase tracking-wider">
              Active Paid Subs
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CreditCardIcon className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
          <div className="text-display font-bold text-text-primary mt-2">
            {revenue?.activePaidSubscriptions ?? 0}
          </div>
          <div className="mt-2.5 text-caption text-text-secondary">
            <span className="font-semibold text-text-primary">{organizations?.trialing ?? 0}</span> in active trials
          </div>
        </Card>

        {/* Estimated MRR */}
        <Card hoverable className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-caption font-semibold text-text-muted uppercase tracking-wider">
              Estimated MRR
            </span>
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <CurrencyDollarIcon className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
          <div className="text-h1 font-bold text-text-primary mt-2">
            KES {Number(revenue?.estimatedMRR || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-2.5 text-caption text-text-secondary">
            KES {Number(revenue?.totalRevenuePaid || 0).toLocaleString('en-US', { minimumFractionDigits: 0 })} collected
          </div>
        </Card>

        {/* Total Infrastructure */}
        <Card hoverable className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-caption font-semibold text-text-muted uppercase tracking-wider">
              Global Footprint
            </span>
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <GlobeAltIcon className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
          <div className="text-display font-bold text-text-primary mt-2">
            {infrastructure?.totalShops ?? 0}
          </div>
          <div className="mt-2.5 text-caption text-text-secondary">
            branches across <span className="font-semibold text-text-primary">{infrastructure?.totalUsers ?? 0}</span> active users
          </div>
        </Card>
      </div>

      {/* Tenant Lifecycle Breakdown & Plan Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tenant Lifecycle */}
        <Card>
          <Card.Header
            title="Tenant Lifecycle Breakdown"
            subtitle="Current status distribution across registered organizations"
            action={
              <Link
                to="/platform/organizations"
                className="inline-flex items-center gap-1 text-small font-semibold text-primary hover:text-primary-hover transition-colors"
              >
                <span>View all</span>
                <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            }
          />
          <Card.Body>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3.5 bg-surface-2 rounded-xl border border-border-default/60">
                <div className="flex items-center gap-1.5 text-caption font-medium text-text-secondary">
                  <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Active</span>
                </div>
                <p className="text-h2 font-bold text-text-primary mt-1.5">{organizations?.active ?? 0}</p>
              </div>

              <div className="p-3.5 bg-surface-2 rounded-xl border border-border-default/60">
                <div className="flex items-center gap-1.5 text-caption font-medium text-text-secondary">
                  <ClockIcon className="h-3.5 w-3.5 text-sky-500" />
                  <span>Trialing</span>
                </div>
                <p className="text-h2 font-bold text-text-primary mt-1.5">{organizations?.trialing ?? 0}</p>
              </div>

              <div className="p-3.5 bg-surface-2 rounded-xl border border-border-default/60">
                <div className="flex items-center gap-1.5 text-caption font-medium text-text-secondary">
                  <ExclamationCircleIcon className="h-3.5 w-3.5 text-amber-500" />
                  <span>Past Due</span>
                </div>
                <p className="text-h2 font-bold text-text-primary mt-1.5">{organizations?.pastDue ?? 0}</p>
              </div>

              <div className="p-3.5 bg-surface-2 rounded-xl border border-border-default/60">
                <div className="flex items-center gap-1.5 text-caption font-medium text-text-secondary">
                  <NoSymbolIcon className="h-3.5 w-3.5 text-red-500" />
                  <span>Suspended</span>
                </div>
                <p className="text-h2 font-bold text-text-primary mt-1.5">{organizations?.suspended ?? 0}</p>
              </div>

              <div className="p-3.5 bg-surface-2 rounded-xl border border-border-default/60">
                <div className="flex items-center gap-1.5 text-caption font-medium text-text-secondary">
                  <XCircleIcon className="h-3.5 w-3.5 text-text-muted" />
                  <span>Canceled</span>
                </div>
                <p className="text-h2 font-bold text-text-muted mt-1.5">{organizations?.canceled ?? 0}</p>
              </div>
            </div>
          </Card.Body>
        </Card>

        {/* Plan Distribution */}
        <Card>
          <Card.Header
            title="Active Plan Distribution"
            subtitle="Organizations enrolled by subscription tier"
            action={
              <Link
                to="/platform/plans"
                className="inline-flex items-center gap-1 text-small font-semibold text-primary hover:text-primary-hover transition-colors"
              >
                <span>Manage plans</span>
                <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            }
          />
          <Card.Body>
            <div className="space-y-3">
              {planDistribution && Object.keys(planDistribution).length > 0 ? (
                Object.entries(planDistribution).map(([code, count]) => (
                  <div
                    key={code}
                    className="flex items-center justify-between p-3.5 bg-surface-2 rounded-xl border border-border-default/60"
                  >
                    <span className="text-body font-medium text-text-primary capitalize">
                      {code} Plan
                    </span>
                    <Badge variant="primary" size="md">
                      {count} {count === 1 ? 'sub' : 'subs'}
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="text-small text-text-muted py-4 text-center">
                  No active subscriptions found.
                </p>
              )}
            </div>
          </Card.Body>
        </Card>
      </div>
    </div>
  );
}
