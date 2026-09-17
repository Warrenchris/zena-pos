'use strict';

const entitlementService = require('../services/entitlementService');
const { sendUpgradePrompt } = require('../utils/upgradePrompt');
const logger = require('../utils/logger');

/**
 * Middleware: requireActiveSubscription
 *
 * Centralized subscription lifecycle enforcement:
 * - Differentiates operational access from billing recovery.
 * - Allows 'active' and 'trialing' subscriptions.
 * - Allows 'past_due' subscriptions within the 7-day grace period (attaches warning header),
 *   unless options.allowPastDue === false.
 * - Rejects 'suspended' subscriptions with 403 ORGANIZATION_SUSPENDED.
 * - Rejects 'canceled' subscriptions with 403 SUBSCRIPTION_CANCELED.
 * - Attaches req.subscription, req.plan, and req.effectiveSubscriptionStatus for downstream use.
 */
function requireActiveSubscription(options = {}) {
  const { allowPastDue = true } = options;

  return async (req, res, next) => {
    try {
      // Super admins bypass subscription enforcement
      if (req.user && req.user.role === 'super_admin') {
        return next();
      }

      const orgId = req.organizationId
        ? parseInt(req.organizationId, 10)
        : (req.user?.organizationId ? parseInt(req.user.organizationId, 10) : null);

      if (!orgId) {
        // If operation does not have organization context, allow if not tenant-scoped
        return next();
      }

      const entitlements = await entitlementService.getOrganizationEntitlements(orgId);
      const subscription = entitlements.subscription;
      const plan = entitlements.plan;

      if (!subscription || !plan) {
        return res.status(403).json({
          error: 'No active subscription found for this organization.',
          code: 'SUBSCRIPTION_REQUIRED'
        });
      }

      // Authoritative timestamp-evaluated effective status
      const effectiveStatus = entitlementService.getEffectiveSubscriptionStatus(subscription);

      req.subscription = subscription;
      req.plan = plan;
      req.effectiveSubscriptionStatus = effectiveStatus;

      if (effectiveStatus === 'suspended') {
        return res.status(403).json({
          error: 'Organization subscription is suspended. Please settle outstanding invoices to restore access.',
          code: 'ORGANIZATION_SUSPENDED',
          isSuspended: true
        });
      }

      if (effectiveStatus === 'canceled') {
        return res.status(403).json({
          error: 'Organization subscription has been canceled. Please renew or reactivate your subscription.',
          code: 'SUBSCRIPTION_CANCELED',
          isCanceled: true
        });
      }

      if (effectiveStatus === 'past_due') {
        if (!allowPastDue) {
          return res.status(403).json({
            error: 'Subscription is past due. Payment required to perform this action.',
            code: 'SUBSCRIPTION_PAST_DUE'
          });
        }
        // Grace period allows operational access with warning header
        res.setHeader('X-Subscription-Warning', 'past_due');
      }

      next();
    } catch (error) {
      logger.error('Error in requireActiveSubscription middleware:', error);
      return res.status(500).json({ error: 'Internal subscription verification error.' });
    }
  };
}

/**
 * Middleware: requireFeatureEntitlement
 * Checks that the tenant's plan grants the requested feature flag.
 */
function requireFeatureEntitlement(featureKey) {
  return async (req, res, next) => {
    try {
      if (req.user && req.user.role === 'super_admin') {
        return next();
      }

      const orgId = req.organizationId
        ? parseInt(req.organizationId, 10)
        : (req.user?.organizationId ? parseInt(req.user.organizationId, 10) : null);

      if (!orgId) {
        return res.status(403).json({ error: 'Organization context required for feature evaluation.' });
      }

      const result = await entitlementService.canUseFeature(orgId, featureKey);
      if (!result.allowed) {
        const { plan } = await entitlementService.getOrganizationEntitlements(orgId);
        return sendUpgradePrompt(res, {
          type: 'feature',
          key: featureKey,
          currentPlan: plan,
          requiredPlan: 'growth',
          reason: result.reason || `Feature '${featureKey}' is not included in your current plan.`
        });
      }

      next();
    } catch (error) {
      logger.error(`Error in requireFeatureEntitlement(${featureKey}):`, error);
      return res.status(500).json({ error: 'Internal feature verification error.' });
    }
  };
}

module.exports = {
  requireActiveSubscription,
  requireFeatureEntitlement
};
