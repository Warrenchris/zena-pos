/**
 * Helper to safely extract client IP from Express request.
 *
 * With 'trust proxy' set (e.g. app.set('trust proxy', 1)), Express derives
 * req.ip from the trusted hop count, which is spoof-resistant. Express parses
 * X-Forwarded-For from right to left (untrusted upstream) using the configured
 * number of trusted hops.
 *
 * Do NOT read the x-forwarded-for header directly anywhere, as leading entries
 * are controlled by the client and reverse proxies append the real IP.
 *
 * @param {import('express').Request} req
 * @returns {string} Client IP address or 'unknown'
 */
const getClientIp = (req) => {
  return req?.ip || 'unknown';
};

module.exports = getClientIp;
module.exports.getClientIp = getClientIp;
