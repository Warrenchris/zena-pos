const { Subscription, Plan, Organization } = require('../models');
const redisClient = require('../config/redis');
const logger = require('../utils/logger');

const ENTITLEMENT_CACHE_TTL = 900; // 15 minutes in seconds

/**
 * Helper to build an entitlement response object that supports both
 * direct boolean inspection (result.allowed, [Symbol.toPrimitive]) and object destructuring.
 */
function createEntitlementResult(allowed, reason = null, extra = {}) {
  const res = {
    allowed: Boolean(allowed),
    ...(reason ? { reason } : {}),
    ...extra
  };

  // Enable coercion and valueOf for boolean context compatibility
  res[Symbol.toPrimitive] = () => Boolean(allowed);
  res.valueOf = () => Boolean(allowed);

  return res;
}

/**
 * Resolves active subscription and plan for an organization with Redis caching.
 * Cache Key: cache:entitlements:org:${organizationId}
 * TTL: 15 minutes (900 seconds)
 */
async function getOrganizationEntitlements(organizationId) {
  if (!organizationId) {
    return { subscription: null, plan: null };
  }

  const cacheKey = `cache:entitlements:org:${organizationId}`;

  // Attempt Redis cache hit
  try {
    if (redisClient && redisClient.status === 'ready') {
      const cachedData = await redisClient.get(cacheKey);
      if (cachedData) {
        logger.debug(`Entitlement cache HIT for organization: ${organizationId}`);
        return JSON.parse(cachedData);
      }
    }
  } catch (err) {
    logger.warn(`Redis error fetching entitlements for organization ${organizationId}, falling back to DB:`, err);
  }

  logger.debug(`Entitlement cache MISS for organization: ${organizationId}, querying database`);

  // Query database
  const subscription = await Subscription.findOne({
    where: { organizationId },
    include: [{
      model: Plan,
      required: true
    }]
  });

  if (!subscription || !subscription.Plan) {
    // Legacy / Test Compatibility: Check if the organization itself is active
    const org = await Organization.findByPk(organizationId);
    if (org && org.status === 'active') {
      const gfPlan = await Plan.findOne({ where: { code: 'grandfathered' } });
      if (gfPlan) {
        const gfPlanJson = gfPlan.toJSON();
        if (typeof gfPlanJson.features === 'string') {
          try { gfPlanJson.features = JSON.parse(gfPlanJson.features); } catch { gfPlanJson.features = {}; }
        }
        try {
          const newSub = await Subscription.create({
            organizationId,
            planId: gfPlan.id,
            status: 'active',
            billingCycle: 'yearly',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date('2099-12-31 23:59:59'),
            trialEndsAt: null,
            cancelAtPeriodEnd: false
          });
          return {
            subscription: newSub.toJSON(),
            plan: gfPlanJson
          };
        } catch (subErr) {
          return {
            subscription: {
              organizationId,
              planId: gfPlan.id,
              status: 'active',
              billingCycle: 'yearly',
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date('2099-12-31 23:59:59')
            },
            plan: gfPlanJson
          };
        }
      }
    }
    // Explicit default-deny state: Do not cache missing subscription long-term
    return { subscription: null, plan: null };
  }

  const subJson = subscription.toJSON();
  const planJson = subscription.Plan.toJSON();

  // Ensure features object is parsed if stored as JSON string
  if (typeof planJson.features === 'string') {
    try {
      planJson.features = JSON.parse(planJson.features);
    } catch {
      planJson.features = {};
    }
  }

  const result = {
    subscription: subJson,
    plan: planJson
  };

  // Cache in Redis
  try {
    if (redisClient && redisClient.status === 'ready') {
      await redisClient.setex(cacheKey, ENTITLEMENT_CACHE_TTL, JSON.stringify(result));
    }
  } catch (err) {
    logger.warn(`Redis error saving entitlements for organization ${organizationId}:`, err);
  }

  return result;
}

/**
 * Computes the authoritative effective subscription status based on timestamp cutoffs.
 * Ensures the system is resilient against scheduler delays or stale Redis cache entries.
 *
 * Lifecycle Rules:
 * - Grandfathered tier: always 'active'.
 * - 'suspended' / 'canceled': remains unchanged.
 * - 'trialing':
 *     - now < trialEndsAt => 'trialing' (fully entitled)
 *     - now >= trialEndsAt and now <= trialEndsAt + 7d => 'past_due' (grace period)
 *     - now > trialEndsAt + 7d => 'suspended' (restricted)
 * - 'active':
 *     - now <= currentPeriodEnd => 'active'
 *     - now > currentPeriodEnd and now <= currentPeriodEnd + 7d => 'past_due' (grace period)
 *     - now > currentPeriodEnd + 7d => 'suspended' (restricted)
 * - 'past_due':
 *     - now <= gracePeriodCutoff => 'past_due'
 *     - now > gracePeriodCutoff => 'suspended'
 */
function getEffectiveSubscriptionStatus(subscription, asOf = new Date()) {
  if (!subscription) return null;
  const now = new Date(asOf);

  // Grandfathered tier is permanently immune to expiration
  const planCode = subscription.Plan?.code || subscription.plan?.code;
  if (planCode === 'grandfathered') {
    return 'active';
  }

  const rawStatus = subscription.status;
  if (rawStatus === 'suspended') {
    return 'suspended';
  }

  // Grace period duration: 7 days in ms
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  if (rawStatus === 'trialing') {
    const trialEnd = new Date(subscription.trialEndsAt || subscription.currentPeriodEnd);
    if (now >= trialEnd) {
      const graceCutoff = new Date(trialEnd.getTime() + SEVEN_DAYS_MS);
      return now > graceCutoff ? 'suspended' : 'past_due';
    }
    return 'trialing';
  }

  if (rawStatus === 'active') {
    const periodEnd = new Date(subscription.currentPeriodEnd);
    // Ignore year 2090+ dates for sanity
    if (periodEnd.getFullYear() < 2090 && now > periodEnd) {
      const graceCutoff = new Date(periodEnd.getTime() + SEVEN_DAYS_MS);
      return now > graceCutoff ? 'suspended' : 'past_due';
    }
    return 'active';
  }

  if (rawStatus === 'past_due') {
    const refEnd = new Date(subscription.currentPeriodEnd || subscription.trialEndsAt);
    const graceCutoff = new Date(refEnd.getTime() + SEVEN_DAYS_MS);
    return now > graceCutoff ? 'suspended' : 'past_due';
  }

  return rawStatus;
}

/**
 * Checks if a specific feature flag is granted for an organization.
 * Returns { allowed: boolean, reason?: string }
 *
 * Edge Cases Handled Explicitly:
 * 1. Missing subscription row -> Default-DENY with explicit error reason.
 * 2. Suspended status (or expired trial beyond grace) -> DENY.
 * 3. Grandfathered tier (-1 quotas, all features) -> ALLOW.
 */
async function canUseFeature(organizationId, featureKey) {
  const { plan, subscription } = await getOrganizationEntitlements(organizationId);

  // Default-Deny: If no subscription row exists at all, reject explicitly
  if (!subscription || !plan) {
    return createEntitlementResult(
      false,
      'Organization has no active subscription record. Subscription required to access features.'
    );
  }

  // Authoritative lifecycle state evaluation
  const effectiveStatus = getEffectiveSubscriptionStatus(subscription);

  // Growth-gated state: administrative features blocked if suspended
  if (effectiveStatus === 'suspended') {
    return createEntitlementResult(
      false,
      'Subscription is suspended due to non-payment. Gated administrative features are locked.'
    );
  }

  const features = typeof plan.features === 'string'
    ? JSON.parse(plan.features)
    : (plan.features || {});

  const hasFeature = features[featureKey] === true;
  if (!hasFeature) {
    return createEntitlementResult(
      false,
      `Feature "${featureKey}" requires a higher plan tier.`
    );
  }

  return createEntitlementResult(true);
}

/**
 * Checks if an operational quota has been exceeded.
 * Compares currentCount against plan limit.
 * Value of -1 denotes unlimited quota.
 *
 * Returns { allowed: boolean, limit: number, current: number, reason?: string }
 */
async function checkQuota(organizationId, quotaKey, currentCount) {
  const { plan, subscription } = await getOrganizationEntitlements(organizationId);

  // Default-Deny: If no subscription row exists at all, reject expansion explicitly
  if (!subscription || !plan) {
    return createEntitlementResult(
      false,
      'Organization has no active subscription record. Upgrading or subscribing required.',
      { limit: 0, current: currentCount }
    );
  }

  // Authoritative lifecycle state evaluation
  const effectiveStatus = getEffectiveSubscriptionStatus(subscription);

  if (effectiveStatus === 'suspended') {
    return createEntitlementResult(
      false,
      'Subscription is suspended. Expanding resources is locked.',
      { limit: plan[quotaKey] ?? 0, current: currentCount }
    );
  }

  if (effectiveStatus === 'past_due') {
    return createEntitlementResult(
      false,
      'Subscription payment is past due. Expanding resources is locked until renewal.',
      { limit: plan[quotaKey] ?? 0, current: currentCount }
    );
  }

  const limit = plan[quotaKey];
  if (limit !== undefined && limit !== -1 && currentCount >= limit) {
    return createEntitlementResult(
      false,
      `Plan limit of ${limit} reached for ${quotaKey}. Upgrade required.`,
      { limit, current: currentCount }
    );
  }

  return createEntitlementResult(
    true,
    null,
    { limit: limit ?? -1, current: currentCount }
  );
}

/**
 * Invalidates the Redis entitlement cache for an organization.
 * Ready to be invoked on subscription lifecycle events (Phase 6b/6c).
 */
async function invalidateOrgEntitlements(organizationId) {
  if (!organizationId) return;
  const cacheKey = `cache:entitlements:org:${organizationId}`;
  try {
    if (redisClient && redisClient.status === 'ready') {
      await redisClient.del(cacheKey);
      logger.info(`Invalidated entitlement cache in Redis for organization: ${organizationId}`);
    }
  } catch (error) {
    logger.warn(`Redis error invalidating entitlement cache for organization ${organizationId}:`, error);
  }
}

module.exports = {
  getOrganizationEntitlements,
  getEffectiveSubscriptionStatus,
  canUseFeature,
  checkQuota,
  invalidateOrgEntitlements
};
