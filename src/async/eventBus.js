/**
 * EventBus System - Job Lifecycle Event Communication
 *
 * Provides event system for broadcasting job lifecycle events throughout the async execution system.
 * Uses Node.js EventEmitter pattern to decouple components and enable structured event handling.
 * Supports typed events for job creation, updates, completion, and errors with session-based filtering.
 * Communication backbone between JobRunner, AsyncJobStore, and other system components.
 */

import { EventEmitter } from 'events';
import { debugLog, debugError } from '../utils/console.js';

/**
 * Event type constants for typed event system
 */
export const EVENT_TYPES = {
  JOB_CREATED: 'job.created',
  JOB_UPDATED: 'job.updated', 
  JOB_COMPLETED: 'job.completed',
  JOB_FAILED: 'job.failed',
  JOB_CANCELLED: 'job.cancelled',
  JOB_STARTED: 'job.started',
};

/**
 * Custom error class for EventBus operations
 */
export class EventBusError extends Error {
  constructor(message, code = 'EVENT_BUS_ERROR') {
    super(message);
    this.name = 'EventBusError';
    this.code = code;
  }
}

/**
 * EventBus class extending Node.js EventEmitter for job lifecycle events
 * Provides session-based filtering, memory management, and structured event handling
 */
export class EventBus extends EventEmitter {
  /**
   * Create a new EventBus instance
   * @param {object} options - Configuration options
   * @param {number} options.maxListeners - Maximum listeners per event type (default: 100)
   * @param {number} options.maxEventHistory - Maximum events to keep in history per job (default: 100)
   * @param {number} options.maxPayloadSize - Maximum payload size in bytes (default: 1MB)
   * @param {number} options.rateLimit - Max events per second per session (default: 100)
   * @param {number} options.sessionTimeout - Session timeout in ms (default: 24 hours)
   */
  constructor(options = {}) {
    super();

    // Configuration
    this.maxListeners = options.maxListeners || 100;
    this.maxEventHistory = options.maxEventHistory || 100;
    this.maxPayloadSize = options.maxPayloadSize || 1024 * 1024; // 1MB
    this.rateLimit = options.rateLimit || 100; // events per second
    this.sessionTimeout = options.sessionTimeout || 24 * 60 * 60 * 1000; // 24 hours

    // Set max listeners to prevent memory warnings
    this.setMaxListeners(this.maxListeners);

    // Session-based listener tracking for cleanup
    this.sessionListeners = new Map(); // sessionId -> Set of listener metadata
    this.sessionLastActivity = new Map(); // sessionId -> timestamp
    this.eventHistory = new Map(); // jobId -> Array of events
    this.rateLimitCounters = new Map(); // sessionId -> { count, resetTime }

    // Statistics tracking
    this.stats = {
      eventsEmitted: 0,
      listenersAdded: 0,
      listenersRemoved: 0,
      sessionsActive: 0,
      memoryUsage: 0,
    };

    // Start cleanup timer for expired sessions
    this.cleanupTimer = setInterval(() => {
      this._cleanupExpiredSessions();
    }, 10 * 60 * 1000); // Every 10 minutes

    debugLog('EventBus: Initialized with session-based filtering and memory management');
  }

  /**
   * Emit a job created event
   * @param {string} jobId - Job identifier
   * @param {string} sessionId - Session identifier
   * @param {object} data - Event data
   * @returns {boolean} True if event was emitted
   * @throws {EventBusError} If emission fails
   */
  emitJobCreated(jobId, sessionId, data = {}) {
    return this._emitJobEvent(EVENT_TYPES.JOB_CREATED, jobId, sessionId, {
      tool: data.tool,
      options: data.options,
      timestamp: Date.now(),
      ...data
    });
  }

  /**
   * Emit a job updated event
   * @param {string} jobId - Job identifier
   * @param {string} sessionId - Session identifier
   * @param {object} data - Update data
   * @returns {boolean} True if event was emitted
   * @throws {EventBusError} If emission fails
   */
  emitJobUpdated(jobId, sessionId, data = {}) {
    return this._emitJobEvent(EVENT_TYPES.JOB_UPDATED, jobId, sessionId, {
      progress: data.progress,
      status: data.status,
      providers: data.providers,
      timestamp: Date.now(),
      ...data
    });
  }

  /**
   * Emit a job completed event
   * @param {string} jobId - Job identifier
   * @param {string} sessionId - Session identifier
   * @param {object} result - Job result
   * @returns {boolean} True if event was emitted
   * @throws {EventBusError} If emission fails
   */
  emitJobCompleted(jobId, sessionId, result) {
    return this._emitJobEvent(EVENT_TYPES.JOB_COMPLETED, jobId, sessionId, {
      result: result ? 'present' : 'null',
      hasResult: Boolean(result),
      timestamp: Date.now(),
    });
  }

  /**
   * Emit a job failed event
   * @param {string} jobId - Job identifier
   * @param {string} sessionId - Session identifier
   * @param {Error|object} error - Error information
   * @returns {boolean} True if event was emitted
   * @throws {EventBusError} If emission fails
   */
  emitJobFailed(jobId, sessionId, error) {
    const errorInfo = error instanceof Error
      ? { message: error.message, name: error.name, code: error.code }
      : error;

    return this._emitJobEvent(EVENT_TYPES.JOB_FAILED, jobId, sessionId, {
      error: errorInfo,
      timestamp: Date.now(),
    });
  }

  /**
   * Emit a job cancelled event
   * @param {string} jobId - Job identifier
   * @param {string} sessionId - Session identifier
   * @param {object} data - Cancellation data
   * @returns {boolean} True if event was emitted
   * @throws {EventBusError} If emission fails
   */
  emitJobCancelled(jobId, sessionId, data = {}) {
    return this._emitJobEvent(EVENT_TYPES.JOB_CANCELLED, jobId, sessionId, {
      reason: data.reason || 'User cancellation',
      timestamp: Date.now(),
      ...data
    });
  }

  /**
   * Emit a job started event
   * @param {string} jobId - Job identifier
   * @param {string} sessionId - Session identifier
   * @param {object} data - Start data
   * @returns {boolean} True if event was emitted
   * @throws {EventBusError} If emission fails
   */
  emitJobStarted(jobId, sessionId, data = {}) {
    return this._emitJobEvent(EVENT_TYPES.JOB_STARTED, jobId, sessionId, {
      tool: data.tool,
      timestamp: Date.now(),
      ...data
    });
  }

  /**
   * Add a session-scoped event listener
   * @param {string} sessionId - Session identifier
   * @param {string} eventType - Event type to listen for
   * @param {Function} callback - Callback function
   * @returns {EventBus} This instance for chaining
   * @throws {EventBusError} If adding listener fails
   */
  addSessionListener(sessionId, eventType, callback) {
    try {
      this._validateSessionId(sessionId);
      this._validateEventType(eventType);
      this._validateCallback(callback);

      // Create wrapped callback that filters by session
      const wrappedCallback = (eventData) => {
        if (eventData.sessionId === sessionId) {
          callback(eventData);
        }
      };

      // Store listener metadata for cleanup
      if (!this.sessionListeners.has(sessionId)) {
        this.sessionListeners.set(sessionId, new Set());
        this.stats.sessionsActive++;
      }

      const listenerMetadata = {
        eventType,
        originalCallback: callback,
        wrappedCallback,
        addedAt: Date.now(),
      };

      this.sessionListeners.get(sessionId).add(listenerMetadata);
      this.sessionLastActivity.set(sessionId, Date.now());

      // Add the wrapped listener
      this.on(eventType, wrappedCallback);

      this.stats.listenersAdded++;
      debugLog(`EventBus: Added session listener for ${sessionId} on ${eventType}`);

      return this;

    } catch (error) {
      if (error instanceof EventBusError) {
        throw error;
      }
      throw new EventBusError(
        `Failed to add session listener: ${error.message}`,
        'ADD_LISTENER_FAILED'
      );
    }
  }

  /**
   * Remove a specific session-scoped event listener
   * @param {string} sessionId - Session identifier
   * @param {string} eventType - Event type
   * @param {Function} callback - Original callback function
   * @returns {boolean} True if listener was removed
   */
  removeSessionListener(sessionId, eventType, callback) {
    try {
      this._validateSessionId(sessionId);
      this._validateEventType(eventType);

      const listeners = this.sessionListeners.get(sessionId);
      if (!listeners) {
        return false;
      }

      // Find matching listener metadata
      let removedCount = 0;
      for (const metadata of listeners) {
        if (metadata.eventType === eventType && metadata.originalCallback === callback) {
          // Remove the wrapped listener
          this.off(eventType, metadata.wrappedCallback);
          listeners.delete(metadata);
          removedCount++;
          this.stats.listenersRemoved++;
        }
      }

      // Clean up session if no more listeners
      if (listeners.size === 0) {
        this.sessionListeners.delete(sessionId);
        this.sessionLastActivity.delete(sessionId);
        this.stats.sessionsActive--;
      } else {
        this.sessionLastActivity.set(sessionId, Date.now());
      }

      if (removedCount > 0) {
        debugLog(`EventBus: Removed ${removedCount} session listener(s) for ${sessionId} on ${eventType}`);
      }

      return removedCount > 0;

    } catch (error) {
      debugError('EventBus: Failed to remove session listener:', error);
      return false;
    }
  }

  /**
   * Remove all event listeners for a session
   * @param {string} sessionId - Session identifier
   * @returns {number} Number of listeners removed
   */
  removeAllSessionListeners(sessionId) {
    try {
      this._validateSessionId(sessionId);

      const listeners = this.sessionListeners.get(sessionId);
      if (!listeners) {
        return 0;
      }

      let removedCount = 0;
      
      // Remove all wrapped listeners
      for (const metadata of listeners) {
        this.off(metadata.eventType, metadata.wrappedCallback);
        removedCount++;
        this.stats.listenersRemoved++;
      }

      // Clean up session tracking
      this.sessionListeners.delete(sessionId);
      this.sessionLastActivity.delete(sessionId);
      this.rateLimitCounters.delete(sessionId);
      this.stats.sessionsActive--;

      debugLog(`EventBus: Removed all ${removedCount} listeners for session ${sessionId}`);
      return removedCount;

    } catch (error) {
      debugError(`EventBus: Failed to remove all session listeners for ${sessionId}:`, error);
      return 0;
    }
  }

  /**
   * Get event history for a job (session-filtered)
   * @param {string} jobId - Job identifier
   * @param {string} sessionId - Session identifier (for filtering)
   * @param {number} limit - Maximum number of events to return
   * @returns {Array} Array of events
   */
  getEventHistory(jobId, sessionId, limit = 100) {
    try {
      this._validateJobId(jobId);
      this._validateSessionId(sessionId);

      const events = this.eventHistory.get(jobId) || [];
      
      // Filter by session and apply limit
      const filteredEvents = events
        .filter(event => event.sessionId === sessionId)
        .slice(-limit)
        .sort((a, b) => a.timestamp - b.timestamp);

      return filteredEvents;

    } catch (error) {
      debugError(`EventBus: Failed to get event history for job ${jobId}:`, error);
      return [];
    }
  }

  /**
   * Get EventBus statistics
   * @returns {object} Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      totalSessions: this.sessionListeners.size,
      totalEventHistory: this.eventHistory.size,
      activeRateCounters: this.rateLimitCounters.size,
      maxListeners: this.maxListeners,
      currentListenerCount: this.listenerCount,
      memoryUsage: process.memoryUsage(),
    };
  }

  /**
   * Shutdown the EventBus and clean up resources
   * @returns {Promise<void>}
   */
  async shutdown() {
    try {
      // Clear cleanup timer
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
      }

      // Remove all listeners
      this.removeAllListeners();

      // Clear all tracking maps
      this.sessionListeners.clear();
      this.sessionLastActivity.clear();
      this.eventHistory.clear();
      this.rateLimitCounters.clear();

      // Reset stats
      this.stats.sessionsActive = 0;
      this.stats.listenersAdded = 0;
      this.stats.listenersRemoved = 0;

      debugLog('EventBus: Shutdown complete');

    } catch (error) {
      debugError('EventBus: Error during shutdown:', error);
      throw new EventBusError(
        `EventBus shutdown failed: ${error.message}`,
        'SHUTDOWN_ERROR'
      );
    }
  }

  /**
   * Core event emission method with validation and rate limiting
   * @param {string} eventType - Type of event to emit
   * @param {string} jobId - Job identifier
   * @param {string} sessionId - Session identifier  
   * @param {object} data - Event data
   * @returns {boolean} True if event was emitted
   * @throws {EventBusError} If emission fails
   * @private
   */
  _emitJobEvent(eventType, jobId, sessionId, data) {
    try {
      // Validation
      this._validateEventType(eventType);
      this._validateJobId(jobId);
      this._validateSessionId(sessionId);
      this._validatePayload(data);

      // Rate limiting check
      if (!this._checkRateLimit(sessionId)) {
        throw new EventBusError(
          `Rate limit exceeded for session ${sessionId}`,
          'RATE_LIMIT_EXCEEDED'
        );
      }

      // Create structured event payload
      const eventPayload = {
        eventType,
        jobId,
        sessionId,
        timestamp: Date.now(),
        data: this._sanitizeData(data),
      };

      // Add to event history
      this._addToEventHistory(jobId, eventPayload);

      // Emit the event
      const emitted = this.emit(eventType, eventPayload);

      // Update activity tracking
      this.sessionLastActivity.set(sessionId, Date.now());
      this.stats.eventsEmitted++;

      debugLog(`EventBus: Emitted ${eventType} for job ${jobId} (session: ${sessionId})`);
      return emitted;

    } catch (error) {
      if (error instanceof EventBusError) {
        throw error;
      }
      throw new EventBusError(
        `Failed to emit ${eventType} event: ${error.message}`,
        'EMIT_FAILED'
      );
    }
  }

  /**
   * Add event to job history with ring buffer behavior
   * @param {string} jobId - Job identifier
   * @param {object} eventPayload - Event payload
   * @private
   */
  _addToEventHistory(jobId, eventPayload) {
    if (!this.eventHistory.has(jobId)) {
      this.eventHistory.set(jobId, []);
    }

    const events = this.eventHistory.get(jobId);
    events.push(eventPayload);

    // Maintain ring buffer size
    if (events.length > this.maxEventHistory) {
      events.shift();
    }
  }

  /**
   * Check rate limiting for a session
   * @param {string} sessionId - Session identifier
   * @returns {boolean} True if within rate limits
   * @private
   */
  _checkRateLimit(sessionId) {
    const now = Date.now();
    const counter = this.rateLimitCounters.get(sessionId) || { count: 0, resetTime: now + 1000 };

    // Reset counter if time window has passed
    if (now > counter.resetTime) {
      counter.count = 0;
      counter.resetTime = now + 1000; // 1 second window
    }

    // Check if within limits
    if (counter.count >= this.rateLimit) {
      return false;
    }

    // Increment counter
    counter.count++;
    this.rateLimitCounters.set(sessionId, counter);
    return true;
  }

  /**
   * Clean up expired sessions and their listeners
   * @private
   */
  _cleanupExpiredSessions() {
    const now = Date.now();
    let cleanedSessions = 0;
    let cleanedListeners = 0;

    for (const [sessionId, lastActivity] of this.sessionLastActivity.entries()) {
      if (now - lastActivity > this.sessionTimeout) {
        const removed = this.removeAllSessionListeners(sessionId);
        cleanedListeners += removed;
        cleanedSessions++;
      }
    }

    // Clean up old event history for inactive jobs
    let cleanedHistory = 0;
    for (const [jobId, events] of this.eventHistory.entries()) {
      const lastEvent = events[events.length - 1];
      if (lastEvent && (now - lastEvent.timestamp > this.sessionTimeout)) {
        this.eventHistory.delete(jobId);
        cleanedHistory++;
      }
    }

    if (cleanedSessions > 0) {
      debugLog(`EventBus: Cleaned up ${cleanedSessions} expired sessions, ${cleanedListeners} listeners, ${cleanedHistory} job histories`);
    }
  }

  /**
   * Sanitize data payload to prevent sensitive information leakage
   * @param {object} data - Data to sanitize
   * @returns {object} Sanitized data
   * @private
   */
  _sanitizeData(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    // Create a deep copy to avoid mutations
    const sanitized = JSON.parse(JSON.stringify(data));

    // Remove or mask sensitive fields
    const sensitiveFields = ['password', 'token', 'key', 'secret', 'auth', 'credential'];
    
    const sanitizeObject = (obj) => {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;

      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        
        if (sensitiveFields.some(field => lowerKey.includes(field))) {
          obj[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
          sanitizeObject(value);
        }
      }
      return obj;
    };

    sanitizeObject(sanitized);
    return sanitized;
  }

  /**
   * Validation helpers
   * @private
   */
  _validateEventType(eventType) {
    if (!eventType || typeof eventType !== 'string') {
      throw new EventBusError('Event type must be a non-empty string', 'INVALID_EVENT_TYPE');
    }
    if (!Object.values(EVENT_TYPES).includes(eventType)) {
      throw new EventBusError(`Unknown event type: ${eventType}`, 'UNKNOWN_EVENT_TYPE');
    }
  }

  _validateJobId(jobId) {
    if (!jobId || typeof jobId !== 'string') {
      throw new EventBusError('Job ID must be a non-empty string', 'INVALID_JOB_ID');
    }
  }

  _validateSessionId(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new EventBusError('Session ID must be a non-empty string', 'INVALID_SESSION_ID');
    }
  }

  _validateCallback(callback) {
    if (typeof callback !== 'function') {
      throw new EventBusError('Callback must be a function', 'INVALID_CALLBACK');
    }
  }

  _validatePayload(data) {
    if (data) {
      const size = JSON.stringify(data).length;
      if (size > this.maxPayloadSize) {
        throw new EventBusError(
          `Payload size ${size} exceeds maximum ${this.maxPayloadSize}`,
          'PAYLOAD_TOO_LARGE'
        );
      }
    }
  }
}

// Singleton instance for global usage
let globalEventBus = null;

/**
 * Get the global EventBus instance
 * @param {object} options - Configuration options for initialization
 * @returns {EventBus} Global EventBus instance
 */
export function getEventBus(options = {}) {
  if (!globalEventBus) {
    globalEventBus = new EventBus(options);
  }
  return globalEventBus;
}

/**
 * Set a custom EventBus instance (for testing)
 * @param {EventBus|null} eventBus - EventBus instance or null to reset
 */
export function setEventBus(eventBus) {
  if (eventBus !== null && !(eventBus instanceof EventBus)) {
    throw new EventBusError(
      'EventBus must be an EventBus instance',
      'INVALID_EVENT_BUS'
    );
  }
  
  if (globalEventBus) {
    globalEventBus.shutdown().catch(error => {
      debugError('EventBus: Error during shutdown of previous instance:', error);
    });
  }
  
  globalEventBus = eventBus;
}

/**
 * Create a new EventBus instance
 * @param {object} options - Configuration options
 * @returns {EventBus} New EventBus instance
 */
export function createEventBus(options = {}) {
  return new EventBus(options);
}