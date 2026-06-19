const logger = require('../utils/logger');

const SENSITIVE_FIELDS = ['password', 'confirmPassword', 'currentPassword', 'newPassword', 'token', 'resetToken', 'secret', 'privateKey', 'cardNumber', 'cvv', 'pin'];

function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return body;
  if (Array.isArray(body)) {
    return body.map(sanitizeBody);
  }
  const sanitized = { ...body };
  for (const field of SENSITIVE_FIELDS) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }
  // Recursively sanitize nested objects
  for (const key in sanitized) {
    if (sanitized[key] && typeof sanitized[key] === 'object') {
      sanitized[key] = sanitizeBody(sanitized[key]);
    }
  }
  return sanitized;
}

const requestLogger = (req, res, next) => {
  if (req.method === 'PUT' || req.method === 'POST') {
    logger.info(`[${req.method}] ${req.url} - Request Body:`, JSON.stringify(sanitizeBody(req.body), null, 2));
  }
  next();
};

module.exports = requestLogger;