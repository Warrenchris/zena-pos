const logger = require('../utils/logger');

// Regex patterns to strip database internals and system paths from client errors
const TABLE_PATH_REGEX = /(?:`?\w+`?\.)|(?:\/[a-zA-Z0-9_\-\.\/]+)|(?:[a-zA-Z]:\\[a-zA-Z0-9_\-\.\\]+)/g;

module.exports = (err, req, res, next) => {
  const requestId = req.requestId || req.id || req.headers['x-request-id'] || 'unknown';

  // Structured server-side logging with request context
  logger.error(`[ERROR] ${req.method} ${req.originalUrl || req.url}: ${err.message}`, {
    requestId,
    name: err.name,
    code: err.code,
    statusCode: err.statusCode || 500,
    shopId: req.shopId || req.user?.shopId,
    organizationId: req.organizationId || req.user?.organizationId
  });

  if (process.env.NODE_ENV !== 'production' && err.stack) {
    console.error(err.stack);
  }

  // 1. Sequelize validation / unique constraint errors
  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    const rawDetails = err.errors?.map(e => e.message) || [err.message];
    // Sanitize any table/column name leaking in production
    const sanitizedDetails = rawDetails.map(msg => 
      process.env.NODE_ENV === 'production' ? msg.replace(TABLE_PATH_REGEX, '').trim() : msg
    );

    return res.status(400).json({
      success: false,
      error: 'Validation error',
      details: sanitizedDetails.length === 1 ? sanitizedDetails[0] : sanitizedDetails,
      code: 'VALIDATION_ERROR',
      requestId
    });
  }

  // 2. JWT authentication errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
      code: 'UNAUTHORIZED',
      requestId
    });
  }

  // 3. Known application errors with explicit status code
  if (err.statusCode && err.statusCode < 500) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code || undefined,
      requestId
    });
  }

  // 4. Default 500 internal server error
  const safeMessage = process.env.NODE_ENV === 'production'
    ? 'An internal server error occurred'
    : err.message;

  res.status(err.statusCode || 500).json({
    success: false,
    error: safeMessage,
    code: err.code || 'INTERNAL_ERROR',
    requestId
  });
};
