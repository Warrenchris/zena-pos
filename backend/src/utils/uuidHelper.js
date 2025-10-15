const { validate: uuidValidate } = require('uuid');

/**
 * Validates and normalizes UUID values
 */
class UuidHelper {
  /**
   * Validates if a string is a valid UUID
   * @param {string} uuid - The UUID to validate
   * @returns {boolean} - True if valid UUID, false otherwise
   */
  static isValid(uuid) {
    if (!uuid) return false;
    return uuidValidate(String(uuid));
  }

  /**
   * Ensures a value is a valid UUID string
   * @param {string|any} value - Value to validate
   * @returns {string} - Normalized UUID string
   * @throws {Error} - If value is not a valid UUID
   */
  static validate(value) {
    const uuidStr = String(value).trim();
    if (!this.isValid(uuidStr)) {
      throw new Error(`Invalid UUID format: ${value}`);
    }
    return uuidStr;
  }

  /**
   * Safely converts a value to UUID string, returns null if invalid
   * @param {string|any} value - Value to convert
   * @returns {string|null} - UUID string or null if invalid
   */
  static toUuidOrNull(value) {
    try {
      return this.validate(value);
    } catch (err) {
      return null;
    }
  }
}

module.exports = UuidHelper;