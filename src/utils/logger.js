/**
 * Logger Utility
 *
 * Structured logging system with different log levels and development/production modes.
 * Provides consistent logging interface across all modules with proper error handling.
 */

import { inspect } from 'util';

/**
 * Check if console output should be suppressed
 * @returns {boolean} True if console output should be suppressed
 */
function shouldSuppressConsole() {
  return process.env.LOG_LEVEL === 'silent' || 
         process.env.NODE_ENV === 'test' ||
         process.env.MCP_TRANSPORT === 'stdio';
}

/**
 * Log levels in order of severity (lower number = higher severity)
 */
const LOG_LEVELS = {
  silent: -1,
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4
};

/**
 * Logger configuration
 */
let loggerConfig = {
  level: process.env.LOG_LEVEL || 'info',
  isDevelopment: process.env.NODE_ENV === 'development',
  enableColors: process.env.NODE_ENV !== 'production',
  enableTimestamps: true,
  enableStackTrace: process.env.NODE_ENV === 'development'
};

/**
 * ANSI color codes for console output
 */
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

/**
 * Log level color mapping
 */
const LEVEL_COLORS = {
  error: COLORS.red,
  warn: COLORS.yellow,
  info: COLORS.green,
  debug: COLORS.blue,
  trace: COLORS.gray
};

/**
 * Format timestamp for log entries
 * @returns {string} Formatted timestamp
 */
function formatTimestamp() {
  return new Date().toISOString();
}

/**
 * Format log level for display
 * @param {string} level - Log level
 * @returns {string} Formatted log level
 */
function formatLevel(level) {
  const upperLevel = level.toUpperCase().padEnd(5);
  if (loggerConfig.enableColors) {
    const color = LEVEL_COLORS[level] || COLORS.white;
    return `${color}${upperLevel}${COLORS.reset}`;
  }
  return upperLevel;
}

/**
 * Format context information
 * @param {string} module - Module name
 * @param {string} operation - Operation name
 * @returns {string} Formatted context
 */
function formatContext(module, operation) {
  if (!module && !operation) return '';
  
  const context = [module, operation].filter(Boolean).join(':');
  if (loggerConfig.enableColors) {
    return `${COLORS.dim}[${context}]${COLORS.reset}`;
  }
  return `[${context}]`;
}

/**
 * Format error objects for logging
 * @param {Error} error - Error object
 * @returns {object} Formatted error information
 */
function formatError(error) {
  if (!(error instanceof Error)) {
    return { error: error };
  }

  const errorInfo = {
    name: error.name,
    message: error.message,
    code: error.code,
    details: error.details
  };

  if (loggerConfig.enableStackTrace && error.stack) {
    errorInfo.stack = error.stack;
  }

  return errorInfo;
}

/**
 * Format log data for output
 * @param {any} data - Data to format
 * @returns {string} Formatted data
 */
function formatData(data) {
  if (data === null || data === undefined) {
    return '';
  }

  if (typeof data === 'string') {
    return data;
  }

  if (data instanceof Error) {
    const errorInfo = formatError(data);
    if (loggerConfig.isDevelopment) {
      return inspect(errorInfo, { depth: 3, colors: loggerConfig.enableColors });
    }
    return JSON.stringify(errorInfo);
  }

  if (typeof data === 'object') {
    if (loggerConfig.isDevelopment) {
      return inspect(data, { depth: 2, colors: loggerConfig.enableColors });
    }
    return JSON.stringify(data);
  }

  return String(data);
}

/**
 * Check if log level should be output
 * @param {string} level - Log level to check
 * @returns {boolean} True if should log
 */
function shouldLog(level) {
  const currentLevel = LOG_LEVELS[loggerConfig.level] || LOG_LEVELS.info;
  const messageLevel = LOG_LEVELS[level] || LOG_LEVELS.info;
  return messageLevel <= currentLevel;
}

/**
 * Core logging function
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {object} metadata - Additional metadata
 */
function log(level, message, metadata = {}) {
  if (!shouldLog(level)) {
    return;
  }

  const timestamp = loggerConfig.enableTimestamps ? formatTimestamp() : null;
  const formattedLevel = formatLevel(level);
  const context = formatContext(metadata.module, metadata.operation);
  
  // Build log parts
  const parts = [
    timestamp,
    formattedLevel,
    context,
    message
  ].filter(Boolean);

  // Output main log line
  const logLine = parts.join(' ');
  
  if (!shouldSuppressConsole()) {
    if (level === 'error') {
      console.error(logLine);
    } else {
      console.log(logLine);
    }
  }

  // Output additional data if provided
  if (metadata.data !== undefined) {
    const formattedData = formatData(metadata.data);
    if (formattedData) {
      if (!shouldSuppressConsole()) {
        if (level === 'error') {
          console.error(formattedData);
        } else {
          console.log(formattedData);
        }
      }
    }
  }

  // Output error details if provided
  if (metadata.error && metadata.error instanceof Error) {
    const errorInfo = formatError(metadata.error);
    const formattedError = formatData(errorInfo);
    if (level === 'error') {
      if (!shouldSuppressConsole()) {
        console.error(formattedError);
      }
    } else {
      if (!shouldSuppressConsole()) {
        console.log(formattedError);
      }
    }
  }
}

/**
 * Create logger instance for a specific module
 * @param {string} moduleName - Name of the module
 * @returns {object} Logger instance
 */
export function createLogger(moduleName) {
  return {
    /**
     * Log error message
     * @param {string} message - Error message
     * @param {object} metadata - Additional metadata
     */
    error(message, metadata = {}) {
      log('error', message, { ...metadata, module: moduleName });
    },

    /**
     * Log warning message
     * @param {string} message - Warning message
     * @param {object} metadata - Additional metadata
     */
    warn(message, metadata = {}) {
      log('warn', message, { ...metadata, module: moduleName });
    },

    /**
     * Log info message
     * @param {string} message - Info message
     * @param {object} metadata - Additional metadata
     */
    info(message, metadata = {}) {
      log('info', message, { ...metadata, module: moduleName });
    },

    /**
     * Log debug message
     * @param {string} message - Debug message
     * @param {object} metadata - Additional metadata
     */
    debug(message, metadata = {}) {
      log('debug', message, { ...metadata, module: moduleName });
    },

    /**
     * Log trace message
     * @param {string} message - Trace message
     * @param {object} metadata - Additional metadata
     */
    trace(message, metadata = {}) {
      log('trace', message, { ...metadata, module: moduleName });
    },

    /**
     * Log with custom operation context
     * @param {string} operation - Operation name
     * @returns {object} Logger with operation context
     */
    operation(operation) {
      return {
        error: (message, metadata = {}) => log('error', message, { ...metadata, module: moduleName, operation }),
        warn: (message, metadata = {}) => log('warn', message, { ...metadata, module: moduleName, operation }),
        info: (message, metadata = {}) => log('info', message, { ...metadata, module: moduleName, operation }),
        debug: (message, metadata = {}) => log('debug', message, { ...metadata, module: moduleName, operation }),
        trace: (message, metadata = {}) => log('trace', message, { ...metadata, module: moduleName, operation })
      };
    }
  };
}

/**
 * Configure logger settings
 * @param {object} config - Logger configuration
 */
export function configureLogger(config) {
  loggerConfig = { ...loggerConfig, ...config };
}

/**
 * Get current logger configuration
 * @returns {object} Current configuration
 */
export function getLoggerConfig() {
  return { ...loggerConfig };
}

/**
 * Global logger instance
 */
export const logger = createLogger('global');

/**
 * Create structured error for logging
 * @param {string} message - Error message
 * @param {string} code - Error code
 * @param {object} details - Error details
 * @param {Error} originalError - Original error
 * @returns {Error} Structured error
 */
export function createStructuredError(message, code = 'UNKNOWN_ERROR', details = {}, originalError = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  
  if (originalError) {
    error.originalError = originalError;
    error.cause = originalError;
  }
  
  return error;
}

/**
 * Log performance timing
 * @param {string} operation - Operation name
 * @param {number} startTime - Start time in milliseconds
 * @param {object} metadata - Additional metadata
 */
export function logTiming(operation, startTime, metadata = {}) {
  const duration = Date.now() - startTime;
  
  if (duration > 1000) {
    logger.warn(`Slow operation: ${operation}`, { 
      ...metadata, 
      data: { duration: `${duration}ms` } 
    });
  } else if (duration > 100) {
    logger.info(`Operation completed: ${operation}`, { 
      ...metadata, 
      data: { duration: `${duration}ms` } 
    });
  } else {
    logger.debug(`Operation completed: ${operation}`, { 
      ...metadata, 
      data: { duration: `${duration}ms` } 
    });
  }
}

/**
 * Performance timer utility
 * @param {string} operation - Operation name
 * @param {string} module - Module name
 * @returns {function} Function to end timing
 */
export function startTimer(operation, module = 'timer') {
  const startTime = Date.now();
  const moduleLogger = createLogger(module);
  
  moduleLogger.debug(`Starting: ${operation}`);
  
  return (result = 'completed', metadata = {}) => {
    const duration = Date.now() - startTime;
    moduleLogger.debug(`${result}: ${operation}`, { 
      ...metadata, 
      data: { duration: `${duration}ms` } 
    });
    return duration;
  };
}

/**
 * Log function entry and exit (for debugging)
 * @param {string} functionName - Function name
 * @param {string} module - Module name
 * @returns {function} Function to end logging
 */
export function logFunction(functionName, module = 'function') {
  const moduleLogger = createLogger(module);
  const startTime = Date.now();
  
  moduleLogger.trace(`Entering: ${functionName}`);
  
  return (result = 'completed', error = null) => {
    const duration = Date.now() - startTime;
    
    if (error) {
      moduleLogger.trace(`Exiting with error: ${functionName}`, { 
        data: { duration: `${duration}ms` },
        error 
      });
    } else {
      moduleLogger.trace(`Exiting: ${functionName}`, { 
        data: { duration: `${duration}ms`, result } 
      });
    }
  };
}

/**
 * Express error for consistent error logging across modules
 */
export class LoggedError extends Error {
  constructor(message, code = 'LOGGED_ERROR', details = {}, logger = null) {
    super(message);
    this.name = 'LoggedError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
    
    // Log the error immediately
    if (logger) {
      logger.error(`${this.name}: ${message}`, { 
        data: { code, details } 
      });
    } else {
      global.logger?.error(`${this.name}: ${message}`, { 
        data: { code, details } 
      });
    }
  }
}