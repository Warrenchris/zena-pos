import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  CreditCardIcon,
  ArrowPathIcon,
  BuildingStorefrontIcon,
  UserGroupIcon,
  CheckIcon,
  LockClosedIcon,
  ClockIcon,
  SparklesIcon,
  CalendarDaysIcon,
  ExclamationTriangleIcon,
  PhoneIcon,
  XMarkIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Table from '../components/ui/Table';
import Spinner from '../components/ui/Spinner';
import { formatDateLong, formatDateShort } from '../utils/formatters';
import {
  fetchPlans,
  fetchSubscription,
  fetchInvoices,
  renewSubscription,
  cancelSubscription,
  reactivateSubscription,
  resetRenewalState
} from '../store/slices/billingSlice';

const parseFeatures = (features) => {
  if (!features) return [];
  if (Array.isArray(features)) return features;
  if (typeof features === 'string') {
    try {
      const parsed = JSON.parse(features);
      if (Array.isArray(parsed)) return parsed;
      if (typeof parsed === 'object') {
        return Object.entries(parsed)
          .filter(([_, val]) => Boolean(val))
          .map(([key]) => key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()));
      }
    } catch {
      return [features];
    }
  }
  if (typeof features === 'object') {
    return Object.entries(features)
      .filter(([_, val]) => Boolean(val))
      .map(([key]) => key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()));
  }
  return [];
};

const getSubscriptionStatusVariant = (status) => {
  switch (status?.toLowerCase()) {
    case 'active':
      return 'success';
    case 'trialing':
      return 'info';
    case 'past_due':
      return 'warning';
    case 'suspended':
      return 'danger';
    case 'canceled':
      return 'neutral';
    default:
      return 'neutral';
  }
};

const getInvoiceStatusVariant = (status) => {
  switch (status?.toLowerCase()) {
    case 'paid':
      return 'success';
    case 'pending':
      return 'warning';
    case 'failed':
      return 'danger';
    default:
      return 'neutral';
  }
};

export default function Billing() {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const {
    plans,
    subscription,
    quotas,
    invoices,
    invoicesPagination,
    renewal,
    actionLoading,
    loading,
    error,
  } = useSelector((state) => state.billing);

  const isOwner = user?.orgRole === 'owner';

  // Modal State
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [paymentChannel, setPaymentChannel] = useState('mpesa');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);

  useEffect(() => {
    dispatch(fetchSubscription());
    dispatch(fetchPlans());
    if (isOwner) {
      dispatch(fetchInvoices({ page: 1, limit: 10 }));
    }
  }, [dispatch, isOwner]);

  const handleRefresh = () => {
    dispatch(fetchSubscription());
    dispatch(fetchPlans());
    if (isOwner) {
      dispatch(fetchInvoices({ page: invoicesPagination.currentPage || 1, limit: 10 }));
    }
  };

  const handlePageChange = (newPage) => {
    if (isOwner) {
      dispatch(fetchInvoices({ page: newPage, limit: 10 }));
    }
  };

  const openRenewalModal = (plan) => {
    setSelectedPlan(plan);
    dispatch(resetRenewalState());
  };

  const closeRenewalModal = () => {
    setSelectedPlan(null);
    dispatch(resetRenewalState());
    handleRefresh();
  };

  const handleInitiatePayment = async (e) => {
    e.preventDefault();
    if (!selectedPlan) return;

    if (paymentChannel === 'mpesa' && !phoneNumber.trim()) {
      return;
    }

    const resultAction = await dispatch(renewSubscription({
      channel: paymentChannel,
      phone: phoneNumber.trim(),
      planId: selectedPlan.id
    }));

    if (renewSubscription.fulfilled.match(resultAction)) {
      if (resultAction.payload?.redirectUrl) {
        window.location.href = resultAction.payload.redirectUrl;
      }
    }
  };

  const handleCancelSubscription = async () => {
    await dispatch(cancelSubscription());
    setShowCancelModal(false);
    handleRefresh();
  };

  const handleReactivateSubscription = async () => {
    await dispatch(reactivateSubscription());
    handleRefresh();
  };

  const currentPlan = subscription?.plan;
  const isGrandfathered = currentPlan?.code === 'grandfathered' || currentPlan?.isUnlimited;

  // Quotas calculations (handle -1 and isUnlimited defensively)
  const shopCurrent = quotas?.shops?.current ?? 0;
  const isShopsUnlimited = isGrandfathered || quotas?.shops?.isUnlimited || quotas?.shops?.limit === -1 || currentPlan?.maxShops === -1;
  const shopLimit = quotas?.shops?.limit;
  const shopLimitDisplay = isShopsUnlimited ? 'Unlimited' : (shopLimit !== undefined && shopLimit !== null ? shopLimit : '—');
  const shopUsageDisplay = `${shopCurrent} / ${shopLimitDisplay}`;
  const shopUsagePercent = isShopsUnlimited ? 0 : (shopLimit > 0 ? Math.min(100, Math.round((shopCurrent / shopLimit) * 100)) : 0);

  const userCurrent = quotas?.users?.current ?? 0;
  const isUsersUnlimited = isGrandfathered || quotas?.users?.isUnlimited || quotas?.users?.limit === -1 || currentPlan?.maxUsers === -1;
  const userLimit = quotas?.users?.limit;
  const userLimitDisplay = isUsersUnlimited ? 'Unlimited' : (userLimit !== undefined && userLimit !== null ? userLimit : '—');
  const userUsageDisplay = `${userCurrent} / ${userLimitDisplay}`;
  const userUsagePercent = isUsersUnlimited ? 0 : (userLimit > 0 ? Math.min(100, Math.round((userCurrent / userLimit) * 100)) : 0);

  // Invoice table columns
  const invoiceColumns = [
    {
      key: 'invoiceNumber',
      label: 'Invoice #',
      render: (val) => <span className="font-semibold text-text-primary">{val || '—'}</span>,
    },
    {
      key: 'createdAt',
      label: 'Date Issued',
      render: (val) => <span className="text-text-secondary text-small">{val ? formatDateShort(val) : '—'}</span>,
    },
    {
      key: 'amount',
      label: 'Amount',
      render: (val, row) => (
        <span className="font-bold text-text-primary">
          {row.currency || 'KES'} {Number(val || 0).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'paymentChannel',
      label: 'Channel',
      render: (val) => (
        <span className="text-caption uppercase font-medium text-text-muted bg-surface-2 px-2 py-0.5 rounded-md">
          {val || 'N/A'}
        </span>
      ),
    },
    {
      key: 'paidAt',
      label: 'Paid Date',
      render: (val) => <span className="text-text-secondary text-small">{val ? formatDateShort(val) : '—'}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (val) => (
        <Badge variant={getInvoiceStatusVariant(val)} dot>
          {val ? val.toUpperCase() : 'PENDING'}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <PageHeader
        title="Billing & Plans"
        description="Monitor your organization's subscription tier, active resource quotas, and official billing invoices."
        secondaryActions={
          <Button
            variant="outline"
            size="md"
            leftIcon={ArrowPathIcon}
            onClick={handleRefresh}
            loading={loading.subscription || loading.plans || loading.invoices}
          >
            Refresh
          </Button>
        }
      />

      {/* Subscription Status Alerts */}
      {subscription?.status === 'suspended' && (
        <div role="alert" className="p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ExclamationTriangleIcon className="h-6 w-6 shrink-0" />
            <div>
              <p className="font-bold text-small">Subscription Suspended</p>
              <p className="text-caption text-danger/90">
                Operational POS and catalog activities are locked. Please renew to restore full branch access.
              </p>
            </div>
          </div>
          {isOwner && currentPlan && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => openRenewalModal(currentPlan)}
            >
              Pay Now & Restore Access
            </Button>
          )}
        </div>
      )}

      {subscription?.status === 'past_due' && (
        <div role="alert" className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ClockIcon className="h-6 w-6 shrink-0 text-amber-500" />
            <div>
              <p className="font-bold text-small">Payment Past Due (Grace Period Active)</p>
              <p className="text-caption">
                Your subscription renewal is pending. Operational services remain available during the grace period.
              </p>
            </div>
          </div>
          {isOwner && currentPlan && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => openRenewalModal(currentPlan)}
            >
              Settle Invoice
            </Button>
          )}
        </div>
      )}

      {subscription?.cancelAtPeriodEnd && (
        <div role="alert" className="p-4 rounded-xl bg-surface-2 border border-border-default text-text-secondary flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ClockIcon className="h-5 w-5 shrink-0 text-text-muted" />
            <p className="text-small">
              Subscription cancellation scheduled for <strong className="text-text-primary">{subscription.currentPeriodEnd ? formatDateLong(subscription.currentPeriodEnd) : 'end of period'}</strong>.
            </p>
          </div>
          {isOwner && (
            <Button
              variant="outline"
              size="sm"
              loading={actionLoading.reactivate}
              onClick={handleReactivateSubscription}
            >
              Reactivate Subscription
            </Button>
          )}
        </div>
      )}

      {error.subscription && (
        <div role="alert" className="p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-small">
          {error.subscription}
        </div>
      )}

      {/* Section 1: Current Plan & Quota Usage */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Current Plan Overview Card */}
        <Card variant="default" className="p-6 relative flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <span className="text-caption font-semibold uppercase tracking-wider text-text-muted">
                Active Subscription
              </span>
              {subscription?.status && (
                <Badge variant={getSubscriptionStatusVariant(subscription.status)} dot>
                  {subscription.status.toUpperCase()}
                </Badge>
              )}
            </div>

            <div className="flex items-baseline gap-2 mb-2">
              <h2 className="text-h2 font-bold text-text-primary tracking-tight">
                {currentPlan?.name || (loading.subscription ? 'Loading...' : 'Current Plan')}
              </h2>
            </div>

            <p className="text-body font-semibold text-primary mb-4">
              {currentPlan?.priceMonthly !== undefined && currentPlan?.priceMonthly !== null
                ? `${currentPlan.currency || 'KES'} ${Number(currentPlan.priceMonthly).toLocaleString()} / month`
                : 'Custom Plan'}
            </p>

            <div className="space-y-2.5 pt-2 border-t border-border-default/60 text-small text-text-secondary">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-text-muted">
                  <CalendarDaysIcon className="h-4 w-4" />
                  Billing Cycle
                </span>
                <span className="font-medium text-text-primary capitalize">
                  {subscription?.billingCycle || 'Monthly'}
                </span>
              </div>

              {subscription?.status === 'trialing' && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-text-muted">
                    <ClockIcon className="h-4 w-4" />
                    Trial Status
                  </span>
                  <span className="font-semibold text-primary">
                    {subscription.daysRemainingInTrial !== null && subscription.daysRemainingInTrial !== undefined
                      ? `${subscription.daysRemainingInTrial} day(s) remaining`
                      : 'Active Trial'}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-text-muted">
                  {subscription?.status === 'trialing' ? 'Trial Ends' : 'Current Period End'}
                </span>
                <span className="font-medium text-text-primary">
                  {subscription?.currentPeriodEnd ? formatDateLong(subscription.currentPeriodEnd) : '—'}
                </span>
              </div>

              {subscription?.lastPaymentMethod && (
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Last Payment Method</span>
                  <span className="font-medium text-text-primary uppercase text-caption">
                    {subscription.lastPaymentMethod}
                  </span>
                </div>
              )}
            </div>
          </div>

          {isOwner && (
            <div className="pt-4 border-t border-border-default/60 mt-4 flex items-center justify-between gap-2">
              {currentPlan && (
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full"
                  onClick={() => openRenewalModal(currentPlan)}
                >
                  {subscription?.status === 'trialing' ? 'Activate Commercial Plan' : 'Renew Subscription'}
                </Button>
              )}
              {!subscription?.cancelAtPeriodEnd && subscription?.status === 'active' && (
                <button
                  type="button"
                  onClick={() => setShowCancelModal(true)}
                  className="text-caption text-text-muted hover:text-danger underline transition-colors px-2 py-1 shrink-0"
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </Card>

        {/* Quota 1: Branch Seats */}
        <Card variant="default" className="p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 rounded-xl bg-surface-2 text-text-primary">
                <BuildingStorefrontIcon className="h-5 w-5" />
              </div>
              <span className="text-caption font-semibold uppercase tracking-wider text-text-muted">
                Resource Allocation
              </span>
            </div>

            <h3 className="text-h3 font-bold text-text-primary tracking-tight">Branch Seats</h3>
            <p className="text-small text-text-muted mt-0.5">Physical store locations provisioned</p>

            <div className="mt-6">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-3xl font-extrabold text-text-primary tracking-tight">
                  {shopCurrent}
                </span>
                <span className="text-small text-text-muted font-medium">
                  {isShopsUnlimited ? 'Unlimited branches' : `of ${shopLimit} maximum`}
                </span>
              </div>

              <div className="w-full h-2.5 bg-surface-2 rounded-full overflow-hidden">
                {isShopsUnlimited ? (
                  <div className="h-full w-full bg-primary/20 rounded-full" />
                ) : (
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      shopUsagePercent >= 100
                        ? 'bg-danger'
                        : shopUsagePercent >= 80
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${shopUsagePercent}%` }}
                  />
                )}
              </div>
            </div>
          </div>

          <p className="text-caption text-text-muted mt-4 pt-3 border-t border-border-default/60">
            {isShopsUnlimited
              ? 'Your organization is licensed for unlimited operational retail branches.'
              : `${Math.max(0, (shopLimit || 0) - shopCurrent)} branch seat(s) remaining on your current plan.`}
          </p>
        </Card>

        {/* Quota 2: User / Employee Seats */}
        <Card variant="default" className="p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 rounded-xl bg-surface-2 text-text-primary">
                <UserGroupIcon className="h-5 w-5" />
              </div>
              <span className="text-caption font-semibold uppercase tracking-wider text-text-muted">
                Seat Allocation
              </span>
            </div>

            <h3 className="text-h3 font-bold text-text-primary tracking-tight">Staff & Admin Seats</h3>
            <p className="text-small text-text-muted mt-0.5">Total active accounts and employees</p>

            <div className="mt-6">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-3xl font-extrabold text-text-primary tracking-tight">
                  {userCurrent}
                </span>
                <span className="text-small text-text-muted font-medium">
                  {isUsersUnlimited ? 'Unlimited seats' : `of ${userLimit} maximum`}
                </span>
              </div>

              <div className="w-full h-2.5 bg-surface-2 rounded-full overflow-hidden">
                {isUsersUnlimited ? (
                  <div className="h-full w-full bg-primary/20 rounded-full" />
                ) : (
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      userUsagePercent >= 100
                        ? 'bg-danger'
                        : userUsagePercent >= 80
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${userUsagePercent}%` }}
                  />
                )}
              </div>
            </div>
          </div>

          <p className="text-caption text-text-muted mt-4 pt-3 border-t border-border-default/60">
            {isUsersUnlimited
              ? 'Your plan accommodates unlimited administrative and staff user seats.'
              : `${Math.max(0, (userLimit || 0) - userCurrent)} user seat(s) remaining on your current plan.`}
          </p>
        </Card>
      </div>

      {/* Section 2: Available Plan Tiers Comparison Grid */}
      <div>
        <div className="mb-6">
          <h2 className="text-h2 font-bold text-text-primary tracking-tight">Available Plans</h2>
          <p className="text-body text-text-secondary mt-1">
            Compare subscription tiers, branch allowances, and feature capabilities.
          </p>
        </div>

        {loading.plans && plans.length === 0 ? (
          <div className="p-12 text-center bg-surface border border-border-default rounded-2xl">
            <Spinner size="lg" className="mx-auto mb-3" />
            <p className="text-small text-text-muted">Loading available billing plans...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const isCurrent = currentPlan?.id === plan.id || currentPlan?.code === plan.code;
              const featuresList = parseFeatures(plan.features);

              return (
                <div
                  key={plan.id}
                  className={`rounded-2xl border p-6 flex flex-col justify-between transition-all duration-200 ${
                    isCurrent
                      ? 'bg-surface border-primary ring-2 ring-primary/20 shadow-floating'
                      : 'bg-surface border-border-default shadow-sm hover:shadow-md'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <h3 className="text-h3 font-bold text-text-primary tracking-tight">
                        {plan.name}
                      </h3>
                      {isCurrent && (
                        <span className="px-2.5 py-1 text-caption font-bold bg-primary text-white rounded-full">
                          Current Plan
                        </span>
                      )}
                    </div>

                    <div className="mb-4">
                      <span className="text-3xl font-extrabold text-text-primary tracking-tight">
                        {plan.currency || 'KES'} {Number(plan.priceMonthly || 0).toLocaleString()}
                      </span>
                      <span className="text-small text-text-muted font-normal ml-1.5">/ month</span>
                    </div>

                    {/* Quota Highlights */}
                    <div className="p-3 mb-5 rounded-xl bg-surface-2/60 border border-border-default space-y-1.5 text-small">
                      <div className="flex items-center justify-between text-text-secondary">
                        <span>Branches Allowed:</span>
                        <span className="font-semibold text-text-primary">
                          {plan.maxShops === -1 ? 'Unlimited' : `${plan.maxShops} shops`}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-text-secondary">
                        <span>Team Members:</span>
                        <span className="font-semibold text-text-primary">
                          {plan.maxUsers === -1 ? 'Unlimited' : `${plan.maxUsers} users`}
                        </span>
                      </div>
                    </div>

                    {/* Features list */}
                    <div className="space-y-2.5 mb-6">
                      <span className="text-caption font-semibold uppercase tracking-wider text-text-muted">
                        Included Features
                      </span>
                      {featuresList.length > 0 ? (
                        featuresList.map((feature, fIdx) => (
                          <div key={fIdx} className="flex items-start gap-2.5 text-small text-text-secondary">
                            <CheckIcon className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                            <span>{feature}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-caption text-text-muted italic">Standard retail POS features included</p>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-border-default/60">
                    {isOwner ? (
                      <Button
                        variant={isCurrent ? 'outline' : 'primary'}
                        size="md"
                        className="w-full"
                        onClick={() => openRenewalModal(plan)}
                      >
                        {isCurrent ? 'Renew Current Plan' : `Switch to ${plan.name}`}
                      </Button>
                    ) : (
                      <div className="text-center py-2 text-caption text-text-muted">
                        {isCurrent ? 'Active Organization Plan' : 'Contact Owner to Switch'}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 3: Official Invoice History */}
      <div>
        <div className="mb-4">
          <h2 className="text-h2 font-bold text-text-primary tracking-tight">Billing Invoices</h2>
          <p className="text-body text-text-secondary mt-1">
            Official tax invoices and receipts issued for subscription renewal cycles.
          </p>
        </div>

        {isOwner ? (
          <Table
            columns={invoiceColumns}
            data={invoices}
            loading={loading.invoices}
            emptyTitle="No Invoices Found"
            emptyDescription="Official billing invoices will appear here following subscription renewal cycles."
            pagination={{
              currentPage: invoicesPagination.currentPage,
              totalPages: invoicesPagination.totalPages,
              totalItems: invoicesPagination.total,
              pageSize: 10,
              onPageChange: handlePageChange,
            }}
          />
        ) : (
          <div className="p-8 rounded-2xl border border-border-default bg-surface text-center max-w-2xl mx-auto my-6 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-surface-2 text-text-muted flex items-center justify-center mx-auto mb-4">
              <LockClosedIcon className="h-6 w-6" />
            </div>
            <h3 className="text-h3 font-bold text-text-primary mb-1">
              Invoice History Restricted
            </h3>
            <p className="text-small text-text-secondary max-w-md mx-auto leading-relaxed">
              Subscription invoices and official billing statements can only be accessed by the organization owner.
              Please contact your organization owner if you require past invoice receipts.
            </p>
          </div>
        )}
      </div>

      {/* Renewal / Upgrade Modal */}
      {selectedPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fadeIn">
          <div className="bg-surface border border-border-default rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              type="button"
              onClick={closeRenewalModal}
              className="absolute top-4 right-4 text-text-muted hover:text-text-primary p-1 rounded-lg"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>

            <h3 className="text-h3 font-bold text-text-primary mb-1">
              {currentPlan?.id === selectedPlan.id ? 'Renew Subscription' : `Switch to ${selectedPlan.name}`}
            </h3>
            <p className="text-small text-text-secondary mb-4">
              Amount due: <strong className="text-text-primary">{selectedPlan.currency || 'KES'} {Number(selectedPlan.priceMonthly || 0).toLocaleString()}</strong> for 1 month renewal.
            </p>

            {/* Conflict Warning if Downgrade Conflict */}
            {renewal.error?.code === 'PLAN_RESOURCE_CONFLICT' && (
              <div className="p-3 mb-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-small">
                <p className="font-bold mb-1">Resource Limit Conflict</p>
                <p className="text-caption mb-2">
                  Cannot switch to {selectedPlan.name} because your organization exceeds the new limits:
                </p>
                {renewal.error.details?.shops && (
                  <p className="text-caption">
                    • Branches: {renewal.error.details.shops.active} active (limit: {renewal.error.details.shops.limit})
                  </p>
                )}
                {renewal.error.details?.users && (
                  <p className="text-caption">
                    • Team Members: {renewal.error.details.users.active} active (limit: {renewal.error.details.users.limit})
                  </p>
                )}
                <p className="text-caption mt-2 italic">
                  Please deactivate excess branches or members before initiating this downgrade.
                </p>
              </div>
            )}

            {renewal.error && renewal.error.code !== 'PLAN_RESOURCE_CONFLICT' && (
              <div className="p-3 mb-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-small">
                {renewal.error.message || 'Payment initiation failed. Please try again.'}
              </div>
            )}

            {renewal.success ? (
              <div className="py-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
                  <CheckCircleIcon className="h-8 w-8" />
                </div>
                <h4 className="font-bold text-text-primary">STK Push Sent!</h4>
                <p className="text-small text-text-secondary">
                  Please check your phone ({phoneNumber}) and enter your M-Pesa PIN to complete the transaction.
                </p>
                <Button variant="primary" size="md" onClick={closeRenewalModal} className="mt-4 w-full">
                  Done
                </Button>
              </div>
            ) : (
              <form onSubmit={handleInitiatePayment} className="space-y-4">
                <div>
                  <label className="block text-caption font-semibold text-text-secondary mb-2">
                    Select Payment Method
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPaymentChannel('mpesa')}
                      className={`p-3 rounded-xl border text-small font-semibold flex items-center justify-center gap-2 transition-all ${
                        paymentChannel === 'mpesa'
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border-default bg-surface-2 text-text-secondary'
                      }`}
                    >
                      <PhoneIcon className="h-4 w-4" />
                      M-Pesa
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentChannel('card')}
                      className={`p-3 rounded-xl border text-small font-semibold flex items-center justify-center gap-2 transition-all ${
                        paymentChannel === 'card'
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border-default bg-surface-2 text-text-secondary'
                      }`}
                    >
                      <CreditCardIcon className="h-4 w-4" />
                      Card
                    </button>
                  </div>
                </div>

                {paymentChannel === 'mpesa' && (
                  <div>
                    <label className="block text-caption font-semibold text-text-secondary mb-1">
                      M-Pesa Phone Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 0712345678 or 254712345678"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface-2 text-text-primary text-small focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <p className="text-caption text-text-muted mt-1">
                      An STK push prompt will appear on this handset.
                    </p>
                  </div>
                )}

                <div className="pt-2 flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="md"
                    className="w-1/2"
                    onClick={closeRenewalModal}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    className="w-1/2"
                    loading={renewal.loading}
                  >
                    Pay Now
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fadeIn">
          <div className="bg-surface border border-border-default rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-h3 font-bold text-text-primary mb-2">
              Cancel Subscription?
            </h3>
            <p className="text-small text-text-secondary mb-5">
              Your subscription will remain active until the end of your billing cycle on {subscription?.currentPeriodEnd ? formatDateShort(subscription.currentPeriodEnd) : 'current period end'}. You can reactivate anytime before then.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="md"
                className="w-1/2"
                onClick={() => setShowCancelModal(false)}
              >
                Keep Active
              </Button>
              <Button
                variant="danger"
                size="md"
                className="w-1/2"
                loading={actionLoading.cancel}
                onClick={handleCancelSubscription}
              >
                Confirm Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
