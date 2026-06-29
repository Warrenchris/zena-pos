const { parseDate } = require('../utils/dateUtils');

const validateDateRange = (req, res, next) => {
  let { startDate, endDate, period } = req.query;

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

    // If period is provided and no custom startDate/endDate is set
    if (!parsedStart && !parsedEnd && period) {
      const now = new Date();
      parsedEnd = now;
      parsedStart = new Date();
      switch (period) {
        case 'weekly':
        case 'week':
          parsedStart.setDate(now.getDate() - 7);
          break;
        case 'monthly':
        case 'month':
          parsedStart.setMonth(now.getMonth() - 1);
          break;
        case 'yearly':
        case 'year':
          parsedStart.setFullYear(now.getFullYear() - 1);
          break;
        default:
          parsedStart.setDate(now.getDate() - 7); // Default to 7 days for stats
      }
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
};

module.exports = validateDateRange;
