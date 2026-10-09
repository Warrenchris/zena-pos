import React, { useEffect, useState } from 'react';
import {
  RectangleStackIcon,
  CheckIcon,
  UsersIcon,
  BuildingStorefrontIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import { platformAPI } from '../../services/platformAPI';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';

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
      <div className="space-y-6">
        <PageHeader
          title="Subscription Plans"
          description="Review active SaaS subscription tiers, limits, and subscriber counts."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, idx) => (
            <Card key={idx} loading />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Subscription Plans"
          description="Review active SaaS subscription tiers, limits, and subscriber counts."
        />
        <div className="p-4 rounded-2xl bg-danger/10 border border-danger/20 text-danger text-small flex items-center gap-3">
          <ExclamationCircleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscription Plans"
        description="Review active SaaS subscription tiers, limits, and subscriber counts."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <Card key={plan.id} hoverable className="p-6 flex flex-col justify-between">
            <div>
              {/* Plan Header */}
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-h3 font-bold text-text-primary capitalize tracking-tight">
                  {plan.name}
                </h3>
                <Badge variant="primary" size="sm">
                  {plan.code}
                </Badge>
              </div>

              {/* Price */}
              <div className="mt-3 mb-6">
                <div className="flex items-baseline">
                  <span className="text-display font-bold text-text-primary tracking-tight">
                    {plan.currency} {Number(plan.priceMonthly).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-caption font-normal text-text-muted ml-1.5">
                    / month
                  </span>
                </div>
              </div>

              {/* Specs & Limits */}
              <div className="space-y-3 text-small border-t border-border-default/60 pt-4 mb-6">
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary flex items-center gap-1.5">
                    <BuildingStorefrontIcon className="h-4 w-4 text-text-muted" aria-hidden="true" />
                    <span>Max Shops</span>
                  </span>
                  <span className="font-semibold text-text-primary">
                    {plan.maxShops === -1 ? 'Unlimited' : plan.maxShops}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-text-secondary flex items-center gap-1.5">
                    <UsersIcon className="h-4 w-4 text-text-muted" aria-hidden="true" />
                    <span>Max Users</span>
                  </span>
                  <span className="font-semibold text-text-primary">
                    {plan.maxUsers === -1 ? 'Unlimited' : plan.maxUsers}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Tier Status</span>
                  <Badge variant={plan.isActive ? 'success' : 'neutral'} dot size="sm">
                    {plan.isActive ? 'Active' : 'Archived'}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Subscribers Count Footer */}
            <div className="bg-surface-2 p-3.5 rounded-xl border border-border-default/60 flex items-center justify-between text-small">
              <span className="text-text-secondary font-medium">Active Subscribers</span>
              <Badge variant="primary" size="md">
                {plan.activeSubscribers} {plan.activeSubscribers === 1 ? 'tenant' : 'tenants'}
              </Badge>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
