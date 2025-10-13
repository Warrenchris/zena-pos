/* eslint-disable no-undef */
const formatTimestamp = () => new Date().toISOString();

// Emoji indicators for different log types
const emoji = {
  error: '🔴',
  warn: '⚠️',
  info: '📢',
  http: '🌐',
  debug: '🔍',
};

// Create base logging function
const baseLog = (level, ...args) => {
  const timestamp = formatTimestamp();
  const prefix = `${emoji[level]} [${timestamp}] [${level.toUpperCase()}]`;
  
  // Log to console with emoji and timestamp
  console[level === 'info' ? 'log' : level](`${prefix}`, ...args);
};

// Create logger object
const logger = {
  error: (...args) => baseLog('error', ...args),
  warn: (...args) => baseLog('warn', ...args),
  info: (...args) => baseLog('info', ...args),
  debug: (...args) => {
    if (process.env.NODE_ENV !== 'production') {
      baseLog('debug', ...args);
    }
  },
  http: (...args) => baseLog('http', ...args),
};

// Create a stream object for Morgan
logger.stream = {
  write: (message) => logger.http(message.trim()),
};

module.exports = logger;