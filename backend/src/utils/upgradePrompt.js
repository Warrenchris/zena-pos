'use strict';

/**
 * Shared helper for building structured upgrade-prompt error responses
 * for quota limits and feature gates across all Phase 6c enforcement points.
 *
 * Consistent Shape:
 * {
 *   error: string,
 *   code: 'QUOTA_EXCEEDED' | 'FEATURE_NOT_AVAILABLE' | 'SUBSCRIPTION_SUSPENDED',
 *   currentPlan: string | null,
 *   requiredPlan: string,
 *   [quota]: string (if type === 'quota'),
 *   [limit]: number (if type === 'quota'),
 *   [current]: number (if type === 'quota'),
 *   [feature]: string (if type === 'feature')
 * }
 */
function sendUpgradePrompt(res, {
  type = 'quota', // 'quota' | 'feature'
  key,
  current,
  limit,
  currentPlan = null,
  requiredPlan = 'growth',
  reason = null,
  code = null
}) {
  const isSuspended = reason && reason.toLowerCase().includes('suspended');
  const defaultCode = isSuspended
    ? 'SUBSCRIPTION_SUSPENDED'
    : (type === 'quota' ? 'QUOTA_EXCEEDED' : 'FEATURE_NOT_AVAILABLE');

  const payload = {
    error: reason || (type === 'quota'
      ? `Plan limit of ${limit} reached for ${key}. Upgrade required.`
      : `Feature "${key}" requires a higher plan tier.`),
    code: code || defaultCode,
    currentPlan: currentPlan?.code || currentPlan?.name || (typeof currentPlan === 'string' ? currentPlan : null),
    requiredPlan: requiredPlan || 'growth',
    upgradeRequired: true
  };

  if (type === 'quota') {
    payload.quota = key;
    if (limit !== undefined) payload.limit = limit;
    if (current !== undefined) payload.current = current;
  } else {
    payload.feature = key;
  }

  return res.status(403).json(payload);
}

module.exports = {
  sendUpgradePrompt
};
