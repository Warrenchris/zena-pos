import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Link } from 'react-router-dom';
import {
  ClockIcon,
  ExclamationTriangleIcon,
  ExclamationCircleIcon,
  NoSymbolIcon,
  XMarkIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import { fetchSubscription } from '../store/slices/billingSlice';

/**
 * SubscriptionBanner
 * Globally visible, dismissible notice for trial expiry, past due, canceled, or suspended status.
 * Renders nothing when status is healthy 'active'.
 * Strictly gates actionable "Upgrade" / "Manage billing" CTAs to organization owners (user.orgRole === 'owner').
 */
export default function SubscriptionBanner() {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const { subscription, loading } = useSelector((state) => state.billing);

  const [isDismissed, setIsDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('zana_sub_banner_dismissed') === 'true';
    }
    return false;
  });

  useEffect(() => {
    if (!subscription && !loading.subscription && user) {
      dispatch(fetchSubscription());
    }
  }, [subscription, loading.subscription, user, dispatch]);

  if (isDismissed || !subscription) {
    return null;
  }

  const { status, daysRemainingInTrial } = subscription;
  const isOwner = user?.orgRole === 'owner';

  // Healthy active subscription requires no banner
  if (status === 'active') {
    return null;
  }

  // Handle trialing status: only show when <= 5 days remaining
  if (status === 'trialing') {
    if (daysRemainingInTrial === null || daysRemainingInTrial === undefined || daysRemainingInTrial > 5) {
      return null;
    }
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('zana_sub_banner_dismissed', 'true');
    }
  };

  // Determine banner presentation based on subscription status
  let bannerConfig = null;

  if (status === 'trialing') {
    const days = Math.max(0, daysRemainingInTrial);
    const dayText = days === 1 ? '1 day' : `${days} days`;

    bannerConfig = {
      containerClass: 'bg-primary/10 border-primary/30 text-primary-dark dark:text-primary-light',
      icon: ClockIcon,
      iconClass: 'text-primary',
      badge: 'Trial Notice',
      badgeClass: 'bg-primary/20 text-primary',
      title: days === 0 ? 'Your trial period has ended' : `Trial ends in ${dayText}`,
      description: isOwner
        ? `Your free trial expires in ${dayText}. Upgrade your plan now to maintain multi-branch operations and advanced features.`
        : `This organization's free trial expires in ${dayText}. Please contact your organization owner to upgrade the subscription.`,
      actionLabel: 'Upgrade Plan',
      buttonClass: 'bg-primary text-white hover:bg-primary-hover shadow-sm',
    };
  } else if (status === 'past_due') {
    bannerConfig = {
      containerClass: 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200',
      icon: ExclamationTriangleIcon,
      iconClass: 'text-amber-600 dark:text-amber-400',
      badge: 'Payment Past Due',
      badgeClass: 'bg-amber-500/20 text-amber-800 dark:text-amber-300',
      title: 'Subscription payment is past due',
      description: isOwner
        ? 'Your last renewal payment was unsuccessful and is currently in grace period. Please review your billing details to avoid interruption.'
        : "Your organization's subscription payment is past due. Please notify your organization owner to prevent service disruption.",
      actionLabel: 'Manage Billing',
      buttonClass: 'bg-amber-600 text-white hover:bg-amber-700 shadow-sm',
    };
  } else if (status === 'canceled') {
    // Deliberately distinct from past_due: slate/neutral monochromatic styling
    bannerConfig = {
      containerClass: 'bg-stone-500/10 border-stone-500/30 text-stone-800 dark:text-stone-300',
      icon: NoSymbolIcon,
      iconClass: 'text-stone-600 dark:text-stone-400',
      badge: 'Subscription Canceled',
      badgeClass: 'bg-stone-500/20 text-stone-700 dark:text-stone-300',
      title: 'Subscription is canceled',
      description: isOwner
        ? 'Your organization subscription has been canceled. To regain access to premium branch features, reactivate your subscription.'
        : "This organization's subscription has been canceled. Please contact your organization owner.",
      actionLabel: 'Reactivate Subscription',
      buttonClass: 'bg-stone-800 dark:bg-stone-700 text-white hover:bg-stone-900 dark:hover:bg-stone-600 shadow-sm',
    };
  } else if (status === 'suspended') {
    bannerConfig = {
      containerClass: 'bg-danger/10 border-danger/30 text-danger-dark dark:text-danger-light',
      icon: ExclamationCircleIcon,
      iconClass: 'text-danger',
      badge: 'Service Suspended',
      badgeClass: 'bg-danger/20 text-danger',
      title: 'Subscription suspended due to non-payment',
      description: isOwner
        ? 'Administrative features and branch expansion are locked. Reactivate your subscription to restore complete access.'
        : 'Your organization subscription is suspended due to non-payment. Please contact your organization owner to restore access.',
      actionLabel: 'Reactivate Billing',
      buttonClass: 'bg-danger text-white hover:bg-danger-hover shadow-sm',
    };
  }

  if (!bannerConfig) {
    return null;
  }

  const IconComponent = bannerConfig.icon;

  return (
    <div
      role="region"
      aria-label="Subscription Status Notice"
      className={`w-full border-b px-4 py-3 sm:px-6 transition-all duration-200 ${bannerConfig.containerClass}`}
    >
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0 mt-0.5">
            <IconComponent className={`h-5 w-5 ${bannerConfig.iconClass}`} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${bannerConfig.badgeClass}`}>
                {bannerConfig.badge}
              </span>
              <span className="text-small font-bold text-text-primary tracking-tight">
                {bannerConfig.title}
              </span>
            </div>
            <p className="text-caption text-text-secondary mt-0.5 leading-relaxed">
              {bannerConfig.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-center shrink-0">
          {isOwner && bannerConfig.actionLabel && (
            <Link
              to="/billing"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-caption font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${bannerConfig.buttonClass}`}
            >
              <span>{bannerConfig.actionLabel}</span>
              <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}

          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss subscription notification"
            className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <XMarkIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
