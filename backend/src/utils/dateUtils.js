/**
 * Reusable date validation and parsing utility for database queries.
 */

const parseDate = (val, fallback = null) => {
  if (val === undefined || val === null || val === '') {
    return fallback;
  }

  // Handle Date instance
  if (val instanceof Date) {
    if (isNaN(val.getTime())) {
      throw new Error(`Invalid Date instance: ${val}`);
    }
    return val;
  }

  // Handle strings
  if (typeof val === 'string') {
    const lower = val.trim().toLowerCase();
    if (lower === 'undefined' || lower === 'null' || lower === 'invalid date' || lower === 'nan') {
      if (fallback !== null) {
        console.warn(`[dateUtils] Received invalid date string "${val}". Falling back to:`, fallback);
        return fallback;
      }
      throw new Error(`Invalid date string: "${val}"`);
    }

    const date = new Date(val);
    if (isNaN(date.getTime())) {
      if (fallback !== null) {
        console.warn(`[dateUtils] Failed to parse date string "${val}". Falling back to:`, fallback);
        return fallback;
      }
      throw new Error(`Invalid date format: "${val}"`);
    }
    return date;
  }

  // Handle numbers (timestamps)
  if (typeof val === 'number') {
    const date = new Date(val);
    if (isNaN(date.getTime())) {
      if (fallback !== null) {
        return fallback;
      }
      throw new Error(`Invalid timestamp: ${val}`);
    }
    return date;
  }

  if (fallback !== null) {
    return fallback;
  }
  throw new Error(`Unsupported date type: ${typeof val}`);
};

const isValidDate = (date) => {
  return date instanceof Date && !isNaN(date.getTime());
};

const assertValidBounds = (bounds) => {
  if (!Array.isArray(bounds) || bounds.length !== 2) {
    throw new Error('Op.between values must be an array of length 2');
  }
  const [start, end] = bounds;
  if (!isValidDate(start)) {
    throw new Error(`Invalid start date bound: ${start}`);
  }
  if (!isValidDate(end)) {
    throw new Error(`Invalid end date bound: ${end}`);
  }
};

module.exports = {
  parseDate,
  isValidDate,
  assertValidBounds
};
