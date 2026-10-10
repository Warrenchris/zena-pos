'use strict';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POSITIVE_INT_REGEX = /^[1-9]\d*$/;

/**
 * Checks if value is a valid standard 36-character UUID string.
 */
function isUuid(id) {
  if (typeof id !== 'string') return false;
  return UUID_REGEX.test(id.trim());
}

/**
 * Checks if value is a valid positive integer ID (number or digit string).
 */
function isIntegerId(id) {
  if (typeof id === 'number') {
    return Number.isInteger(id) && id > 0 && Number.isSafeInteger(id);
  }
  if (typeof id === 'string') {
    return POSITIVE_INT_REGEX.test(id.trim());
  }
  return false;
}

/**
 * Classifies an identifier into 'uuid', 'integer', or 'invalid'.
 */
function classifyId(id) {
  if (isUuid(id)) return 'uuid';
  if (isIntegerId(id)) return 'integer';
  return 'invalid';
}

module.exports = {
  isUuid,
  isIntegerId,
  classifyId
};
