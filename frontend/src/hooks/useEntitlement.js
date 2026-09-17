import { useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchSubscription } from '../store/slices/billingSlice';

/**
 * useEntitlement
 * Checks whether an organization has access to a specific feature flag.
 *
 * @param {string} featureKey - e.g. 'multi_shop', 'org_insights', 'api_access'
 * @returns {{ allowed: boolean, loading: boolean, planCode: string | null, planName: string | null, reason: string | null }}
 */
export function useEntitlement(featureKey) {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth?.user);
  const subscription = useSelector((state) => state.billing?.subscription);
  const loading = useSelector((state) => Boolean(state.billing?.loading?.subscription));

  // Self-hydrate subscription if not yet loaded
  useEffect(() => {
    if (!subscription && !loading && user) {
      dispatch(fetchSubscription());
    }
  }, [subscription, loading, user, dispatch]);

  return useMemo(() => {
    if (loading && !subscription) {
      return {
        allowed: false,
        loading: true,
        planCode: null,
        planName: null,
        reason: 'Loading subscription entitlements...',
      };
    }

    if (!subscription) {
      return {
        allowed: false,
        loading: false,
        planCode: null,
        planName: null,
        reason: 'No active subscription found.',
      };
    }

    const { status, plan } = subscription;

    // Check subscription status (active or trialing are valid operational states)
    const isActive = status === 'active' || status === 'trialing';
    if (!isActive) {
      return {
        allowed: false,
        loading: false,
        planCode: plan?.code || null,
        planName: plan?.name || null,
        reason: `Subscription is ${status || 'inactive'}.`,
      };
    }

    // Parse features if stored as a string, or use directly if object
    let features = plan?.features;
    if (typeof features === 'string') {
      try {
        features = JSON.parse(features);
      } catch {
        features = {};
      }
    }

    const hasFeature = Boolean(features && features[featureKey] === true);

    return {
      allowed: hasFeature,
      loading: false,
      planCode: plan?.code || null,
      planName: plan?.name || null,
      reason: hasFeature ? null : `Feature "${featureKey}" requires a higher plan tier.`,
    };
  }, [subscription, loading, featureKey]);
}

/**
 * useQuota
 * Reads quota consumption and limits from state.billing.quotas.
 * Normalizes alias keys:
 *   'shops' | 'shop' | 'maxShops' | 'branch' | 'branches' -> 'shops'
 *   'users' | 'user' | 'maxUsers' | 'employees' | 'staff' -> 'users'
 *
 * @param {string} quotaKey - e.g. 'shops', 'users', 'maxShops', 'maxUsers'
 * @returns {{ allowed: boolean, current: number, limit: number, isUnlimited: boolean, remaining: number, loading: boolean }}
 */
export function useQuota(quotaKey) {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth?.user);
  const subscription = useSelector((state) => state.billing?.subscription);
  const quotas = useSelector((state) => state.billing?.quotas);
  const loading = useSelector((state) => Boolean(state.billing?.loading?.subscription));

  // Self-hydrate subscription if not yet loaded
  useEffect(() => {
    if (!subscription && !loading && user) {
      dispatch(fetchSubscription());
    }
  }, [subscription, loading, user, dispatch]);

  return useMemo(() => {
    const normalizedKey = {
      shops: 'shops',
      shop: 'shops',
      maxShops: 'shops',
      branch: 'shops',
      branches: 'shops',
      users: 'users',
      user: 'users',
      maxUsers: 'users',
      employees: 'users',
      staff: 'users',
    }[quotaKey] || quotaKey;

    const quotaData = quotas?.[normalizedKey];
    const plan = subscription?.plan;

    // Fallback limit from plan if quotas object not yet populated
    let planLimit;
    if (normalizedKey === 'shops') {
      planLimit = plan?.maxShops;
    } else if (normalizedKey === 'users') {
      planLimit = plan?.maxUsers;
    }

    const isUnlimited = Boolean(
      quotaData?.isUnlimited ||
      quotaData?.limit === -1 ||
      planLimit === -1 ||
      plan?.isUnlimited
    );

    const limit = quotaData?.limit !== undefined
      ? quotaData.limit
      : (planLimit !== undefined ? planLimit : 1);

    const current = quotaData?.current !== undefined ? quotaData.current : 0;
    const allowed = isUnlimited || current < limit;
    const remaining = isUnlimited ? Infinity : Math.max(0, limit - current);

    return {
      allowed,
      current,
      limit,
      isUnlimited,
      remaining,
      loading: loading && !quotas,
    };
  }, [quotas, subscription, loading, quotaKey]);
}

export default useEntitlement;
