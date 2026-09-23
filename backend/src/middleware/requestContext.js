const crypto = require('crypto');

// Allowed characters for client-provided request IDs: alphanumeric, dashes, underscores
const SAFE_REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Lightweight request context middleware for request correlation.
 * Accepts safe incoming X-Request-Id or generates a cryptographically random UUID v4.
 * Injects req.requestId / req.id and sets X-Request-Id response header.
 */
function requestContext(req, res, next) {
  const incomingId = req.headers['x-request-id'] || req.headers['x-correlation-id'];
  let requestId;

  if (typeof incomingId === 'string' && SAFE_REQUEST_ID_REGEX.test(incomingId.trim())) {
    requestId = incomingId.trim();
  } else {
    requestId = crypto.randomUUID();
  }

  req.requestId = requestId;
  req.id = requestId;
  req._startTime = Date.now();

  res.setHeader('X-Request-Id', requestId);
  next();
}

module.exports = requestContext;
