const formatTimestamp = () => new Date().toISOString();

const base = (level, ...args) => {
  // eslint-disable-next-line no-console
  console[level](`[${formatTimestamp()}] [${level.toUpperCase()}]`, ...args);
};

module.exports = {
  info: (...args) => base('log', ...args),
  warn: (...args) => base('warn', ...args),
  error: (...args) => base('error', ...args),
  debug: (...args) => base('log', ...args),
};


