/**
 * Error Handler Utility
 *
 * Centralized error handling and response formatting for consistent error management
 * across all modules. Provides structured error responses and proper error propagation.
 */

import { createLogger } from './logger.js';

const logger = createLogger('errorHandler');

/**
 * Standard error codes used throughout the application
 */
export const ERROR_CODES = {
  // Configuration errors
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  MISSING_CONFIG: 'MISSING_CONFIG',
  INVALID_CONFIG: 'INVALID_CONFIG',
  
  // Provider errors
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  PROVIDER_NOT_FOUND: 'PROVIDER_NOT_FOUND',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  INVALID_API_KEY: 'INVALID_API_KEY',
  API_QUOTA_EXCEEDED: 'API_QUOTA_EXCEEDED',
  API_RATE_LIMIT: 'API_RATE_LIMIT',
  
  // Tool errors
  TOOL_ERROR: 'TOOL_ERROR',
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  INVALID_TOOL_ARGS: 'INVALID_TOOL_ARGS',
  TOOL_EXECUTION_FAILED: 'TOOL_EXECUTION_FAILED',
  
  // Router errors
  ROUTER_ERROR: 'ROUTER_ERROR',
  INVALID_REQUEST: 'INVALID_REQUEST',
  REQUEST_VALIDATION_FAILED: 'REQUEST_VALIDATION_FAILED',
  
  // Context processing errors
  CONTEXT_ERROR: 'CONTEXT_ERROR',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_ACCESS_DENIED: 'FILE_ACCESS_DENIED',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  
  // Continuation store errors
  CONTINUATION_ERROR: 'CONTINUATION_ERROR',
  INVALID_CONTINUATION_ID: 'INVALID_CONTINUATION_ID',
  CONTINUATION_NOT_FOUND: 'CONTINUATION_NOT_FOUND',
  
  // Generic errors
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR'
};

/**
 * Base error class for structured error handling
 */
export class ConverseMCPError extends Error {
  constructor(message, code = ERROR_CODES.UNKNOWN_ERROR, details = {}, statusCode = 500) {
    super(message);
    this.name = 'ConverseMCPError';
    this.code = code;
    this.details = details;
    this.statusCode = statusCode;
    this.timestamp = new Date().toISOString();
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ConverseMCPError);
    }
  }

  /**
   * Convert error to JSON-serializable object
   * @returns {object} Serializable error object
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }

  /**
   * Create MCP-compatible error response
   * @returns {object} MCP error response
   */
  toMCPResponse() {
    return {
      content: [
        {
          type: 'text',
          text: this.message
        }
      ],
      isError: true,
      error: {
        type: this.name,
        code: this.code,
        message: this.message,
        details: this.details,
        timestamp: this.timestamp
      }
    };
  }
}

/**
 * Provider-specific error class
 */
export class ProviderError extends ConverseMCPError {
  constructor(message, code = ERROR_CODES.PROVIDER_ERROR, details = {}, provider = 'unknown') {
    super(message, code, { ...details, provider }, 503);
    this.name = 'ProviderError';
    this.provider = provider;
  }
}

/**
 * Tool-specific error class
 */
export class ToolError extends ConverseMCPError {
  constructor(message, code = ERROR_CODES.TOOL_ERROR, details = {}, toolName = 'unknown') {
    super(message, code, { ...details, toolName }, 400);
    this.name = 'ToolError';
    this.toolName = toolName;
  }
}

/**
 * Configuration error class
 */
export class ConfigurationError extends ConverseMCPError {
  constructor(message, code = ERROR_CODES.CONFIGURATION_ERROR, details = {}) {
    super(message, code, details, 500);
    this.name = 'ConfigurationError';
  }
}

/**
 * Validation error class
 */
export class ValidationError extends ConverseMCPError {
  constructor(message, code = ERROR_CODES.VALIDATION_ERROR, details = {}) {
    super(message, code, details, 400);
    this.name = 'ValidationError';
  }
}

/**
 * Context processing error class
 */
export class ContextError extends ConverseMCPError {
  constructor(message, code = ERROR_CODES.CONTEXT_ERROR, details = {}) {
    super(message, code, details, 400);
    this.name = 'ContextError';
  }
}

/**
 * Wrap and enhance existing errors
 * @param {Error} originalError - Original error
 * @param {string} message - New error message
 * @param {string} code - Error code
 * @param {object} details - Additional details
 * @returns {ConverseMCPError} Enhanced error
 */
export function wrapError(originalError, message, code = ERROR_CODES.UNKNOWN_ERROR, details = {}) {
  const enhancedDetails = {
    ...details,
    originalError: {
      name: originalError.name,
      message: originalError.message,
      code: originalError.code,
      stack: originalError.stack
    }
  };
  
  const wrappedError = new ConverseMCPError(message, code, enhancedDetails);
  wrappedError.cause = originalError;
  
  return wrappedError;
}

/**
 * Handle async function errors with proper logging
 * @param {function} fn - Async function to wrap
 * @param {string} operation - Operation name for logging
 * @param {object} context - Additional context
 * @returns {function} Wrapped function
 */
export function withErrorHandler(fn, operation = 'unknown', context = {}) {
  return async (...args) => {
    const operationLogger = logger.operation(operation);
    
    try {
      operationLogger.debug('Starting operation', { data: context });
      const result = await fn(...args);
      operationLogger.debug('Operation completed successfully');
      return result;
    } catch (error) {
      operationLogger.error('Operation failed', { 
        error,
        data: { args: args.length, context }
      });
      
      // Re-throw enhanced error if it's already structured
      if (error instanceof ConverseMCPError) {
        throw error;
      }
      
      // Wrap unknown errors
      throw wrapError(error, `${operation} failed: ${error.message}`, ERROR_CODES.INTERNAL_ERROR, context);
    }
  };
}

/**
 * Create MCP-compatible error response
 * @param {Error} error - Error object
 * @param {string} toolName - Tool name (optional)
 * @param {object} context - Additional context
 * @returns {object} MCP error response
 */
export function createMCPErrorResponse(error, toolName = null, context = {}) {
  // If it's already a structured error, use its MCP response
  if (error instanceof ConverseMCPError) {
    const response = error.toMCPResponse();
    if (toolName) {
      response.error.toolName = toolName;
    }
    response.error.context = context;
    return response;
  }
  
  // Create structured response for unknown errors
  const errorCode = error.code || ERROR_CODES.UNKNOWN_ERROR;
  const message = toolName ? `Error in ${toolName}: ${error.message}` : error.message;
  
  return {
    content: [
      {
        type: 'text',
        text: message
      }
    ],
    isError: true,
    error: {
      type: error.name || 'Error',
      code: errorCode,
      message: error.message,
      toolName,
      context,
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV === 'development' && error.stack && { stack: error.stack })
    }
  };
}

/**
 * Determine if error is recoverable
 * @param {Error} error - Error to check
 * @returns {boolean} True if error is recoverable
 */
export function isRecoverableError(error) {
  if (error instanceof ConverseMCPError) {
    return error.statusCode < 500 && error.code !== ERROR_CODES.INTERNAL_ERROR;
  }
  
  // Check for known recoverable error patterns
  const recoverablePatterns = [
    /network/i,
    /timeout/i,
    /rate limit/i,
    /quota/i,
    /temporary/i
  ];
  
  return recoverablePatterns.some(pattern => pattern.test(error.message));
}

/**
 * Log error with appropriate level based on severity
 * @param {Error} error - Error to log
 * @param {string} operation - Operation context
 * @param {object} metadata - Additional metadata
 */
export function logError(error, operation = 'unknown', metadata = {}) {
  const operationLogger = logger.operation(operation);
  
  if (error instanceof ConverseMCPError) {
    if (error.statusCode >= 500) {
      operationLogger.error('Internal error occurred', { error, data: metadata });
    } else if (error.statusCode >= 400) {
      operationLogger.warn('Client error occurred', { error, data: metadata });
    } else {
      operationLogger.info('Handled error occurred', { error, data: metadata });
    }
  } else {
    operationLogger.error('Unhandled error occurred', { error, data: metadata });
  }
}

/**
 * Error aggregation for batch operations
 */
export class ErrorAggregator {
  constructor(operation = 'batch-operation') {
    this.operation = operation;
    this.errors = [];
    this.successes = [];
    this.logger = logger.operation(operation);
  }

  /**
   * Add success result
   * @param {any} result - Success result
   * @param {string} identifier - Result identifier
   */
  addSuccess(result, identifier = null) {
    this.successes.push({ result, identifier, timestamp: new Date().toISOString() });
  }

  /**
   * Add error result
   * @param {Error} error - Error that occurred
   * @param {string} identifier - Error identifier
   */
  addError(error, identifier = null) {
    this.errors.push({ error, identifier, timestamp: new Date().toISOString() });
    this.logger.warn('Batch operation error', { 
      error, 
      data: { identifier, totalErrors: this.errors.length } 
    });
  }

  /**
   * Get summary of results
   * @returns {object} Results summary
   */
  getSummary() {
    return {
      operation: this.operation,
      total: this.errors.length + this.successes.length,
      successes: this.successes.length,
      errors: this.errors.length,
      hasErrors: this.errors.length > 0,
      successRate: this.successes.length / (this.errors.length + this.successes.length)
    };
  }

  /**
   * Throw aggregated error if there are any errors
   * @param {string} message - Error message
   */
  throwIfErrors(message = null) {
    if (this.errors.length > 0) {
      const defaultMessage = `${this.operation} completed with ${this.errors.length} errors`;
      const errorMessage = message || defaultMessage;
      
      const aggregatedError = new ConverseMCPError(
        errorMessage,
        ERROR_CODES.INTERNAL_ERROR,
        {
          summary: this.getSummary(),
          errors: this.errors.map(e => ({
            identifier: e.identifier,
            error: e.error.message,
            code: e.error.code
          }))
        }
      );
      
      throw aggregatedError;
    }
  }

  /**
   * Log final summary
   */
  logSummary() {
    const summary = this.getSummary();
    
    if (summary.hasErrors) {
      this.logger.warn('Batch operation completed with errors', { data: summary });
    } else {
      this.logger.info('Batch operation completed successfully', { data: summary });
    }
  }
}

/**
 * Retry utility with exponential backoff
 * @param {function} fn - Function to retry
 * @param {object} options - Retry options
 * @returns {Promise} Function result
 */
export async function retryWithBackoff(fn, options = {}) {
  const {
    retries = 3,
    delay = 1000,
    backoffFactor = 2,
    maxDelay = 10000,
    operation = 'retry-operation'
  } = options;
  
  const operationLogger = logger.operation(operation);
  let lastError;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        operationLogger.debug(`Retry attempt ${attempt}/${retries}`);
      }
      
      return await fn();
      
    } catch (error) {
      lastError = error;
      
      if (attempt === retries) {
        operationLogger.error('All retry attempts failed', { 
          error, 
          data: { attempts: attempt + 1, maxRetries: retries } 
        });
        break;
      }
      
      if (!isRecoverableError(error)) {
        operationLogger.warn('Non-recoverable error, stopping retries', { error });
        break;
      }
      
      const currentDelay = Math.min(delay * Math.pow(backoffFactor, attempt), maxDelay);
      operationLogger.debug(`Retrying in ${currentDelay}ms`, { 
        error: error.message, 
        data: { attempt: attempt + 1, delay: currentDelay } 
      });
      
      await new Promise(resolve => setTimeout(resolve, currentDelay));
    }
  }
  
  throw lastError;
}

/**
 * Circuit breaker pattern implementation
 */
export class CircuitBreaker {
  constructor(operation, options = {}) {
    this.operation = operation;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.monitorTimeout = options.monitorTimeout || 10000; // 10 seconds
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
    
    this.logger = logger.operation(`circuit-breaker:${operation}`);
  }

  /**
   * Execute function with circuit breaker protection
   * @param {function} fn - Function to execute
   * @returns {Promise} Function result
   */
  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new ConverseMCPError(
          `Circuit breaker is OPEN for ${this.operation}`,
          ERROR_CODES.PROVIDER_UNAVAILABLE,
          { state: this.state, nextAttempt: this.nextAttempt }
        );
      }
      
      this.state = 'HALF_OPEN';
      this.logger.info('Circuit breaker transitioning to HALF_OPEN');
    }

    try {
      const result = await fn();
      
      if (this.state === 'HALF_OPEN') {
        this.reset();
      }
      
      return result;
      
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Record a failure
   */
  recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.resetTimeout;
      
      this.logger.warn('Circuit breaker opened due to failures', {
        data: { 
          failures: this.failures,
          threshold: this.failureThreshold,
          resetTime: new Date(this.nextAttempt).toISOString()
        }
      });
    }
  }

  /**
   * Reset circuit breaker
   */
  reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
    
    this.logger.info('Circuit breaker reset to CLOSED');
  }

  /**
   * Get current status
   * @returns {object} Circuit breaker status
   */
  getStatus() {
    return {
      operation: this.operation,
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      nextAttempt: this.nextAttempt
    };
  }
}