'use strict';

/**
 * Curated list of known disposable, temporary, and throwaway email domains.
 * Provides fast O(1) domain lookup to protect registration (SEC-02 remainder).
 */
const DISPOSABLE_DOMAINS = new Set([
  // Popular throwaway services
  'mailinator.com',
  'tempmail.com',
  'temp-mail.org',
  '10minutemail.com',
  '10minutemail.net',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'sharklasers.com',
  'grr.la',
  'pokemail.net',
  'spam4.me',
  'throwawaymail.com',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'dispostable.com',
  'fakeinbox.com',
  'trashmail.com',
  'trashmail.net',
  'trashmail.me',
  'maildrop.cc',
  'getairmail.com',
  'mohmal.com',
  'mytemp.email',
  'generator.email',
  'burnermail.io',
  'inboxkitten.com',
  'mailcatch.com',
  'mailnesia.com',
  'tempinbox.com',
  'emailondeck.com',
  'crazymailing.com',
  'nada.ltd',
  'getnada.com',
  'dropmail.me',
  'minuteinbox.com',
  'fakemailgenerator.com',
  'throwawayemailaddresses.com',
  'tempmailaddress.com',
  'disposablemail.com',
  'fastmail.fm', // specifically disposable temp aliases
  'harakirimail.com',
  'meltmail.com',
  'spambox.us',
  'tempemail.net',
  'jetable.org',
  'kasmail.com',
  'sneakemail.com',
  'trashymail.com',
  'tempr.email',
  'discard.email',
  'discardmail.com',
  'spamevader.com'
]);

// Allow operations to extend the blocked domains at runtime via environment variable
if (process.env.ADDITIONAL_DISPOSABLE_DOMAINS) {
  process.env.ADDITIONAL_DISPOSABLE_DOMAINS
    .split(',')
    .map(d => d.trim().toLowerCase())
    .filter(Boolean)
    .forEach(domain => DISPOSABLE_DOMAINS.add(domain));
}

/**
 * Checks whether an email address uses a known disposable or temporary email domain.
 *
 * @param {string} email
 * @returns {boolean} True if the email domain is recognized as disposable
 */
function isDisposableEmail(email) {
  if (!email || typeof email !== 'string') return false;

  const trimmed = email.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex === -1 || atIndex === 0 || atIndex === trimmed.length - 1) {
    return false;
  }

  const domain = trimmed.slice(atIndex + 1).trim();
  if (!domain) return false;

  // Direct domain match
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return true;
  }

  // Check subdomains (e.g. user@sub.mailinator.com)
  const parts = domain.split('.');
  if (parts.length > 2) {
    const parentDomain = parts.slice(-2).join('.');
    if (DISPOSABLE_DOMAINS.has(parentDomain)) {
      return true;
    }
  }

  return false;
}

module.exports = {
  isDisposableEmail,
  DISPOSABLE_DOMAINS
};
