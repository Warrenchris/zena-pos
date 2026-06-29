const { query, validationResult } = require('express-validator');

const { parseDate } = require('../utils/dateUtils');

const validateDateRange = [
  (req, res, next) => {
    let { startDate, endDate } = req.query;

    try {
      if (startDate === 'undefined' || startDate === 'null' || startDate === '') startDate = undefined;
      if (endDate === 'undefined' || endDate === 'null' || endDate === '') endDate = undefined;

      let parsedStart = null;
      let parsedEnd = null;

      if (startDate) {
        parsedStart = parseDate(startDate);
      }
      if (endDate) {
        parsedEnd = parseDate(endDate);
      }

      if (parsedEnd && !parsedStart) {
        parsedStart = new Date(parsedEnd);
        parsedStart.setDate(parsedStart.getDate() - 30);
      } else if (parsedStart && !parsedEnd) {
        parsedEnd = new Date();
      } else if (!parsedStart && !parsedEnd) {
        parsedEnd = new Date();
        parsedStart = new Date();
        parsedStart.setDate(parsedStart.getDate() - 30);
      }

      req.startDate = parsedStart;
      req.endDate = parsedEnd;
      req.query.startDate = parsedStart;
      req.query.endDate = parsedEnd;

      next();
    } catch (error) {
      return res.status(400).json({
        error: 'Invalid date parameter provided',
        details: error.message
      });
    }
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