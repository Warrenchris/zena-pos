const logger = require('../utils/logger');

const requestLogger = (req, res, next) => {
  if (req.method === 'PUT' || req.method === 'POST') {
    logger.info(`[${req.method}] ${req.url} - Request Body:`, JSON.stringify(req.body, null, 2));
  }
  next();
};

module.exports = requestLogger;