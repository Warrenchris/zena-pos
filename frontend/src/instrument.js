import * as Sentry from '@sentry/react';

function getEnv(key, fallback = '') {
  try {
    if (typeof process !== 'undefined' && process?.env && process.env[key]) {
      return process.env[key];
    }
  } catch {}
  try {
    const fn = new Function(`return import.meta.env?.${key}`);
    const val = fn();
    if (val !== undefined && val !== null) return val;
  } catch {}
  return fallback;
}

const SENSITIVE_KEYS = new Set([
  'password', 'confirmpassword', 'currentpassword', 'newpassword',
  'token', 'refreshtoken', 'accesstoken', 'resettoken', 'secret',
  'privatekey', 'cardnumber', 'cvv', 'pin', 'authorization', 'cookie',
  'set-cookie', 'consumerkey', 'consumersecret', 'passkey', 'mpesasecret',
  'partya', 'phonenumber'
]);

function recursiveScrub(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 5) return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => recursiveScrub(item, depth + 1));
  }

  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lower) || lower.includes('password') || lower.includes('secret') || lower.includes('token')) {
      cleaned[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      cleaned[key] = recursiveScrub(value, depth + 1);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

const EXPECTED_CLIENT_STATUSES = new Set([400, 401, 403, 404, 409, 422, 429]);

export function initSentry() {
  const dsn = getEnv('VITE_SENTRY_DSN', '');
  if (!dsn) return;

  const environment = getEnv('VITE_SENTRY_ENVIRONMENT', getEnv('MODE', 'development'));
  const release = getEnv('VITE_SENTRY_RELEASE', 'zana-pos-frontend@1.0.0');
  const tracesSampleRate = environment === 'production'
    ? parseFloat(getEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0.1'))
    : 0;

  try {
    Sentry.init({
      dsn,
      environment,
      release,
      tracesSampleRate,
      beforeSend(event, hint) {
        // Drop expected HTTP client errors (400, 401, 403, 404, 422, 429)
        const error = hint?.originalException;
        const status = error?.response?.status || error?.status;
        if (status && EXPECTED_CLIENT_STATUSES.has(Number(status))) {
          return null; // Ignore normal business flow / validation / client errors
        }

        // Scrub sensitive headers & request data
        if (event.request?.headers) {
          delete event.request.headers['Authorization'];
          delete event.request.headers['authorization'];
          delete event.request.headers['Cookie'];
          delete event.request.headers['cookie'];
        }

        if (event.request?.data) {
          event.request.data = recursiveScrub(event.request.data);
        }

        // Scrub breadcrumbs
        if (Array.isArray(event.breadcrumbs)) {
          event.breadcrumbs = event.breadcrumbs.map(bc => {
            if (bc.data) {
              bc.data = recursiveScrub(bc.data);
            }
            return bc;
          });
        }

        // Enforce pseudonymous user identifier only
        if (event.user) {
          event.user = {
            id: event.user.id ? String(event.user.id) : undefined
          };
        }

        event.tags = event.tags || {};
        event.tags.service = 'frontend';

        return event;
      }
    });
  } catch (err) {
    console.warn('[sentry:frontend] Sentry initialization failed:', err.message);
  }
}

export default Sentry;
