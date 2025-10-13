const isDev = process.env.NODE_ENV === 'development';

// Define log levels with emojis for better visibility
const LOG_LEVELS = {
  INFO: '📢',
  WARN: '⚠️',
  ERROR: '🔴',
  DEBUG: '🔍',
  SUCCESS: '✅',
  API: '🌐',
  AUTH: '🔑',
  ROUTE: '🛣️',
  STATE: '💾',
  PERF: '⚡',
};

class Logger {
  constructor() {
    // Store original console methods
    this.originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    };

    // Override console methods in development
    if (isDev) {
      console.log = (...args) => this.info(...args);
      console.warn = (...args) => this.warn(...args);
      console.error = (...args) => this.error(...args);
      console.debug = (...args) => this.debug(...args);
    }
  }

  _formatMessage(level, ...args) {
    const timestamp = new Date().toISOString();
    return [`${timestamp} ${level}`, ...args];
  }

  info(...args) {
    this._log('log', LOG_LEVELS.INFO, ...args);
  }

  warn(...args) {
    this._log('warn', LOG_LEVELS.WARN, ...args);
  }

  error(...args) {
    this._log('error', LOG_LEVELS.ERROR, ...args);
    // In development, also show error trace
    if (isDev && args[0] instanceof Error) {
      this.originalConsole.error(args[0]);
    }
  }

  debug(...args) {
    if (isDev) {
      this._log('debug', LOG_LEVELS.DEBUG, ...args);
    }
  }

  api(method, url, status, duration) {
    this._log('log', LOG_LEVELS.API, `${method} ${url} | Status: ${status} | Duration: ${duration}ms`);
  }

  auth(...args) {
    this._log('log', LOG_LEVELS.AUTH, ...args);
  }

  route(...args) {
    this._log('log', LOG_LEVELS.ROUTE, ...args);
  }

  state(...args) {
    this._log('log', LOG_LEVELS.STATE, ...args);
  }

  success(...args) {
    this._log('log', LOG_LEVELS.SUCCESS, ...args);
  }

  perf(label, duration) {
    this._log('log', LOG_LEVELS.PERF, `${label} | Duration: ${duration}ms`);
  }

  _log(method, level, ...args) {
    if (isDev || method === 'error') {
      this.originalConsole[method](...this._formatMessage(level, ...args));
    }
  }

  // Group related logs
  group(label) {
    if (isDev) {
      console.group(label);
    }
  }

  groupEnd() {
    if (isDev) {
      console.groupEnd();
    }
  }

  // Performance monitoring
  time(label) {
    if (isDev) {
      console.time(label);
    }
  }

  timeEnd(label) {
    if (isDev) {
      console.timeEnd(label);
    }
  }
}

export const logger = new Logger();

// Create axios interceptor config
export const loggerInterceptor = {
  request: (config) => {
    config.metadata = { startTime: new Date() };
    logger.api(config.method.toUpperCase(), config.url, 'PENDING');
    return config;
  },
  response: (response) => {
    const duration = new Date() - response.config.metadata.startTime;
    logger.api(
      response.config.method.toUpperCase(),
      response.config.url,
      response.status,
      duration
    );
    return response;
  },
  error: (error) => {
    if (error.config) {
      const duration = new Date() - error.config.metadata.startTime;
      logger.api(
        error.config.method.toUpperCase(),
        error.config.url,
        error.response?.status || 'FAILED',
        duration
      );
    }
    return Promise.reject(error);
  },
};