/**
 * Password utility functions
 */

/**
 * Checks if a string matches standard bcrypt hash format ($2a$, $2b$, or $2y$)
 * @param {string} value
 * @returns {boolean}
 */
function isBcryptHash(value) {
  return typeof value === 'string' && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value);
}

module.exports = {
  isBcryptHash
};
