'use strict';

/**
 * Single source of truth for the public frontend URL used in links we email
 * to users (email verification, password reset).
 *
 * Outside production we fall back to the Vite dev server so local setups work
 * out of the box. In production a missing or localhost value would silently
 * produce dead links in every email, so it is a startup error instead
 * (see validateStartup) and getFrontendUrl() refuses to guess.
 */

const DEV_FALLBACK = 'http://localhost:5173';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isProduction(env = process.env) {
  return env.NODE_ENV === 'production';
}

/**
 * Returns an array of problems with FRONTEND_URL for the given environment.
 * Empty array means OK. Only enforced in production.
 */
function getFrontendUrlProblems(env = process.env) {
  if (!isProduction(env)) return [];

  const raw = (env.FRONTEND_URL || '').trim();
  if (!raw) return ['FRONTEND_URL is not set'];

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return ['FRONTEND_URL is not a valid URL'];
  }

  const problems = [];
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    problems.push('FRONTEND_URL must start with http:// or https://');
  }
  if (LOCAL_HOSTS.has(parsed.hostname)) {
    problems.push('FRONTEND_URL points at localhost; emailed links would be unusable');
  }
  return problems;
}

/**
 * The frontend base URL without a trailing slash.
 * Throws in production when FRONTEND_URL is missing/invalid rather than
 * emitting a localhost link.
 */
function getFrontendUrl(env = process.env) {
  const problems = getFrontendUrlProblems(env);
  if (problems.length > 0) {
    throw new Error(`Invalid frontend URL configuration: ${problems.join('; ')}`);
  }
  const raw = (env.FRONTEND_URL || '').trim() || DEV_FALLBACK;
  return raw.replace(/\/+$/, '');
}

module.exports = { getFrontendUrl, getFrontendUrlProblems, DEV_FALLBACK };
