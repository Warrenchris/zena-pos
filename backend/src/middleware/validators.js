const { query, validationResult } = require('express-validator');

// Validate query parameters for date range
const validateDateRange = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date format'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date format'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // If endDate is provided but startDate isn't, default startDate to 30 days before endDate
    if (req.query.endDate && !req.query.startDate) {
      const endDate = new Date(req.query.endDate);
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 30);
      req.query.startDate = startDate.toISOString().split('T')[0];
    }

    // If startDate is provided but endDate isn't, default endDate to today
    if (req.query.startDate && !req.query.endDate) {
      req.query.endDate = new Date().toISOString().split('T')[0];
    }

    // If neither is provided, default to last 30 days
    if (!req.query.startDate && !req.query.endDate) {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      req.query.startDate = startDate.toISOString().split('T')[0];
      req.query.endDate = endDate.toISOString().split('T')[0];
    }

    next();
  }
];

// Validate request body and return errors if any
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

module.exports = {
  validateDateRange,
  validateRequest
};