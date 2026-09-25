const Sentry = require('@sentry/node');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const SENSITIVE_KEYS = new Set([
  'password', 'confirmpassword', 'currentpassword', 'newpassword',
  'token', 'refreshtoken', 'accesstoken', 'resettoken', 'secret',
  'privatekey', 'cardnumber', 'cvv', 'pin', 'authorization', 'cookie',
  'set-cookie', 'consumerkey', 'consumersecret', 'passkey', 'mpesasecret',
  'partya', 'phonenumber', 'flw_secret_key', 'encryption_secret', 'db_pass'
]);

function recursiveScrub(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 5) return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => recursiveScrub(item, depth + 1));
  }

  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lower) || lower.includes('password') || lower.includes('secret') || lower.includes('token') || lower.includes('privatekey')) {
      cleaned[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      cleaned[key] = recursiveScrub(value, depth + 1);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

const sentryDsn = process.env.SENTRY_DSN;
const environment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';
const release = process.env.SENTRY_RELEASE || `zana-pos-backend@${process.env.npm_package_version || '1.0.0'}`;
const tracesSampleRate = process.env.NODE_ENV === 'production'
  ? parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1')
  : 0;

if (sentryDsn) {
  try {
    Sentry.init({
      dsn: sentryDsn,
      environment,
      release,
      tracesSampleRate,
      beforeSend(event, hint) {
        // Strip sensitive HTTP headers
        if (event.request?.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['cookie'];
          delete event.request.headers['set-cookie'];
          delete event.request.headers['x-api-key'];
        }

        // Scrub request body
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

        // Enforce pseudonymous user context: only allow id
        if (event.user) {
          event.user = {
            id: event.user.id ? String(event.user.id) : undefined
          };
        }

        // Set low-cardinality service tag
        event.tags = event.tags || {};
        event.tags.service = 'backend';

        return event;
      }
    });
  } catch (err) {
    // Sentry failure must never crash the service
    console.warn('[sentry:backend] Failed to initialize Sentry:', err.message);
  }
}

module.exports = Sentry;
