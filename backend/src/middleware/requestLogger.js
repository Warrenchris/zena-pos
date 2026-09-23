const logger = require('../utils/logger');

const SENSITIVE_FIELDS = [
  'password', 'confirmPassword', 'currentPassword', 'newPassword',
  'token', 'resetToken', 'secret', 'privateKey', 'cardNumber', 'cvv', 'pin',
  'authorization', 'refreshToken', 'accessToken'
];

function sanitizeBody(body, isAiRoute = false) {
  if (!body || typeof body !== 'object') return body;

  // Protect AI business prompts and raw time-series data
  if (isAiRoute) {
    return {
      isAiPayload: true,
      datesCount: Array.isArray(body.dates) ? body.dates.length : undefined,
      valuesCount: Array.isArray(body.values) ? body.values.length : undefined,
      periods: body.periods,
      model: body.model,
      isOrgForecast: body.isOrgForecast,
      summary: '[AI time-series prompt data redacted for privacy]'
    };
  }

  if (Array.isArray(body)) {
    if (body.length > 10) {
      return body.slice(0, 10).map(item => sanitizeBody(item, false)).concat(`... [${body.length - 10} more items truncated]`);
    }
    return body.map(item => sanitizeBody(item, false));
  }

  const sanitized = { ...body };
  for (const field of SENSITIVE_FIELDS) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }

  // Truncate large arrays in body properties
  for (const key of Object.keys(sanitized)) {
    if (Array.isArray(sanitized[key]) && sanitized[key].length > 10) {
      sanitized[key] = `[Array of ${sanitized[key].length} items truncated for privacy]`;
    } else if (sanitized[key] && typeof sanitized[key] === 'object') {
      sanitized[key] = sanitizeBody(sanitized[key], false);
    }
  }

  return sanitized;
}

const requestLogger = (req, res, next) => {
  if (req.method === 'PUT' || req.method === 'POST' || req.method === 'PATCH') {
    const isAiRoute = (req.originalUrl || req.url || '').includes('/api/ai');
    const sanitized = sanitizeBody(req.body, isAiRoute);
    const reqMeta = {
      requestId: req.requestId || req.id,
      shopId: req.shopId || req.user?.shopId,
      organizationId: req.organizationId || req.user?.organizationId
    };

    logger.info(`[${req.method}] ${req.originalUrl || req.url} - Request Body:`, JSON.stringify(sanitized, null, 2), reqMeta);
  }
  next();
};

module.exports = requestLogger;