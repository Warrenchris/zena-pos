/* eslint-disable no-undef */
const formatTimestamp = () => new Date().toISOString();

const SENSITIVE_KEYS = new Set([
  'password', 'confirmpassword', 'currentpassword', 'newpassword',
  'token', 'refreshtoken', 'accesstoken', 'resettoken', 'secret',
  'privatekey', 'cardnumber', 'cvv', 'pin', 'authorization', 'mpesasecret', 'consumersecret'
]);

function sanitizeLogMetadata(meta, depth = 0) {
  if (!meta || typeof meta !== 'object' || depth > 4) return meta;
  if (Array.isArray(meta)) {
    // Truncate large arrays to prevent privacy leaks and log flooding
    if (meta.length > 20) {
      return `[Array of ${meta.length} items (truncated for privacy)]`;
    }
    return meta.map(item => sanitizeLogMetadata(item, depth + 1));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(meta)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('password') || lowerKey.includes('secret')) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      sanitized[key] = sanitizeLogMetadata(value, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// Emoji indicators for different log types
const emoji = {
  error: '🔴',
  warn: '⚠️',
  info: '📢',
  http: '🌐',
  debug: '🔍',
};

// Create base logging function
const baseLog = (level, message, ...rest) => {
  const timestamp = formatTimestamp();
  
  // Check if first extra arg is structured metadata
  let meta = null;
  let otherArgs = rest;
  if (rest.length === 1 && typeof rest[0] === 'object' && rest[0] !== null) {
    meta = sanitizeLogMetadata(rest[0]);
    otherArgs = [];
  } else if (rest.length > 0) {
    otherArgs = rest.map(item => (typeof item === 'object' && item !== null ? sanitizeLogMetadata(item) : item));
  }

  // If JSON logging is enabled or in production container
  if (process.env.LOG_FORMAT === 'json') {
    const logObj = {
      timestamp,
      level,
      message: typeof message === 'string' ? message : JSON.stringify(message),
      ...(meta || {}),
    };
    console[level === 'info' ? 'log' : (level === 'debug' ? 'debug' : level)](JSON.stringify(logObj));
    return;
  }

  const prefix = `${emoji[level] || '📢'} [${timestamp}] [${level.toUpperCase()}]`;
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  console[level === 'info' ? 'log' : (level === 'debug' ? 'debug' : level)](`${prefix} ${message}${metaStr}`, ...otherArgs);
};

// Create logger object
const logger = {
  error: (msg, ...args) => baseLog('error', msg, ...args),
  warn: (msg, ...args) => baseLog('warn', msg, ...args),
  info: (msg, ...args) => baseLog('info', msg, ...args),
  debug: (msg, ...args) => {
    if (process.env.NODE_ENV !== 'production') {
      baseLog('debug', msg, ...args);
    }
  },
  http: (msg, ...args) => baseLog('http', msg, ...args),
};

// Create a stream object for Morgan
logger.stream = {
  write: (message) => logger.http(message.trim()),
};

module.exports = logger;