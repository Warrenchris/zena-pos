const { Subscription, Plan } = require('../models');
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
 * Checks if a specific feature flag is granted for an organization.
 * Returns { allowed: boolean, reason?: string }
 *
 * Edge Cases Handled Explicitly:
 * 1. Missing subscription row -> Default-DENY with explicit error reason.
 * 2. Suspended status -> DENY (gated admin features locked).
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

  // Growth-gated state: administrative features blocked if suspended
  if (subscription.status === 'suspended') {
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

  if (subscription.status === 'suspended') {
    return createEntitlementResult(
      false,
      'Subscription is suspended. Expanding resources is locked.',
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
  canUseFeature,
  checkQuota,
  invalidateOrgEntitlements
};
