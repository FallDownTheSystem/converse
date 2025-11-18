/**
 * EventBus System - Job Lifecycle Event Communication (Simplified for Single-User)
 *
 * Provides event system for broadcasting job lifecycle events throughout the async execution system.
 * Simplified version without session management for single-user local MCP server.
 * Uses Node.js EventEmitter pattern to decouple components and enable structured event handling.
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
 * Simplified EventBus class for single-user local MCP server
 * No session management needed - just job lifecycle events
 */
export class EventBus extends EventEmitter {
  /**
   * Create a new EventBus instance
   * @param {object} options - Configuration options
   * @param {number} options.maxListeners - Maximum listeners per event type (default: 100)
   * @param {number} options.maxEventHistory - Maximum events to keep in history per job (default: 100)
   */
  constructor(options = {}) {
    super();

    // Configuration
    this.maxListeners = options.maxListeners || 100;
    this.maxEventHistory = options.maxEventHistory || 100;

    // Set max listeners to prevent memory warnings
    this.setMaxListeners(this.maxListeners);

    // Event history tracking
    this.eventHistory = new Map(); // jobId -> Array of events

    // Statistics tracking
    this.stats = {
      eventsEmitted: 0,
      listenersAdded: 0,
      listenersRemoved: 0,
      memoryUsage: 0,
    };

    debugLog('EventBus: Initialized (simplified for single-user)');
  }

  /**
   * Emit a job created event
   * @param {string} jobId - Job identifier
   * @param {object} data - Event data
   * @returns {boolean} True if event was emitted
   */
  emitJobCreated(jobId, data = {}) {
    return this._emitJobEvent(EVENT_TYPES.JOB_CREATED, jobId, {
      tool: data.tool,
      options: data.options,
      timestamp: Date.now(),
      ...data,
    });
  }

  /**
   * Emit a job updated event
   * @param {string} jobId - Job identifier
   * @param {object} data - Update data
   * @returns {boolean} True if event was emitted
   */
  emitJobUpdated(jobId, data = {}) {
    return this._emitJobEvent(EVENT_TYPES.JOB_UPDATED, jobId, {
      progress: data.progress,
      status: data.status,
      providers: data.providers,
      timestamp: Date.now(),
      ...data,
    });
  }

  /**
   * Emit a job completed event
   * @param {string} jobId - Job identifier
   * @param {*} result - Job result
   * @returns {boolean} True if event was emitted
   */
  emitJobCompleted(jobId, result) {
    return this._emitJobEvent(EVENT_TYPES.JOB_COMPLETED, jobId, {
      result,
      timestamp: Date.now(),
      duration: this._calculateDuration(jobId),
    });
  }

  /**
   * Emit a job failed event
   * @param {string} jobId - Job identifier
   * @param {Error|string} error - Error information
   * @returns {boolean} True if event was emitted
   */
  emitJobFailed(jobId, error) {
    const errorData =
      error instanceof Error
        ? {
          message: error.message,
          code: error.code || 'UNKNOWN_ERROR',
          stack: error.stack,
        }
        : { message: String(error) };

    return this._emitJobEvent(EVENT_TYPES.JOB_FAILED, jobId, {
      error: errorData,
      timestamp: Date.now(),
      duration: this._calculateDuration(jobId),
    });
  }

  /**
   * Emit a job cancelled event
   * @param {string} jobId - Job identifier
   * @param {object} data - Event data
   * @returns {boolean} True if event was emitted
   */
  emitJobCancelled(jobId, data = {}) {
    return this._emitJobEvent(EVENT_TYPES.JOB_CANCELLED, jobId, {
      reason: data.reason || 'User cancelled',
      partial_result: data.partial_result,
      timestamp: Date.now(),
      ...data,
    });
  }

  /**
   * Emit a job started event
   * @param {string} jobId - Job identifier
   * @param {object} data - Event data
   * @returns {boolean} True if event was emitted
   */
  emitJobStarted(jobId, data = {}) {
    return this._emitJobEvent(EVENT_TYPES.JOB_STARTED, jobId, {
      tool: data.tool,
      timestamp: Date.now(),
      ...data,
    });
  }

  /**
   * Register a listener for job events
   * @param {string} eventType - Event type to listen for
   * @param {Function} listener - Callback function
   * @returns {Function} Unsubscribe function
   */
  onJobEvent(eventType, listener) {
    if (!Object.values(EVENT_TYPES).includes(eventType)) {
      throw new EventBusError(
        `Invalid event type: ${eventType}`,
        'INVALID_EVENT_TYPE',
      );
    }

    if (typeof listener !== 'function') {
      throw new EventBusError(
        'Listener must be a function',
        'INVALID_LISTENER',
      );
    }

    this.on(eventType, listener);
    this.stats.listenersAdded++;

    // Return unsubscribe function
    return () => {
      this.off(eventType, listener);
      this.stats.listenersRemoved++;
    };
  }

  /**
   * Get event history for a specific job
   * @param {string} jobId - Job identifier
   * @returns {Array} Array of events for the job
   */
  getJobHistory(jobId) {
    return this.eventHistory.get(jobId) || [];
  }

  /**
   * Clear event history for a specific job
   * @param {string} jobId - Job identifier
   */
  clearJobHistory(jobId) {
    this.eventHistory.delete(jobId);
  }

  /**
   * Get current statistics
   * @returns {object} Current EventBus statistics
   */
  getStats() {
    return {
      ...this.stats,
      totalListeners: this.listenerCount(),
      eventHistorySize: this.eventHistory.size,
      memoryUsage: this._calculateMemoryUsage(),
    };
  }

  /**
   * Internal method to emit job events with validation and history tracking
   * @param {string} eventType - Event type constant
   * @param {string} jobId - Job identifier
   * @param {object} data - Event data
   * @returns {boolean} True if event was emitted
   * @private
   */
  _emitJobEvent(eventType, jobId, data) {
    try {
      // Validate parameters
      if (!jobId || typeof jobId !== 'string') {
        throw new EventBusError(
          'Invalid job ID: must be a non-empty string',
          'INVALID_JOB_ID',
        );
      }

      // Create event object
      const event = {
        type: eventType,
        jobId,
        data,
        timestamp: data.timestamp || Date.now(),
      };

      // Add to history
      this._addToHistory(jobId, event);

      // Emit event
      const hasListeners = this.emit(eventType, event);

      // Update statistics
      this.stats.eventsEmitted++;

      debugLog(`EventBus: Emitted ${eventType} for job ${jobId}`);
      return hasListeners;
    } catch (error) {
      debugError(
        `EventBus: Failed to emit event ${eventType} for job ${jobId}:`,
        error,
      );
      if (error instanceof EventBusError) {
        throw error;
      }
      throw new EventBusError(
        `Failed to emit event: ${error.message}`,
        'EMISSION_ERROR',
      );
    }
  }

  /**
   * Add event to job history with size limit
   * @param {string} jobId - Job identifier
   * @param {object} event - Event object
   * @private
   */
  _addToHistory(jobId, event) {
    if (!this.eventHistory.has(jobId)) {
      this.eventHistory.set(jobId, []);
    }

    const history = this.eventHistory.get(jobId);
    history.push(event);

    // Limit history size
    if (history.length > this.maxEventHistory) {
      history.shift();
    }
  }

  /**
   * Calculate duration since job creation
   * @param {string} jobId - Job identifier
   * @returns {number|null} Duration in milliseconds or null
   * @private
   */
  _calculateDuration(jobId) {
    const history = this.eventHistory.get(jobId);
    if (!history || history.length === 0) {
      return null;
    }

    const createEvent = history.find((e) => e.type === EVENT_TYPES.JOB_CREATED);
    if (!createEvent) {
      return null;
    }

    return Date.now() - createEvent.timestamp;
  }

  /**
   * Calculate approximate memory usage
   * @returns {number} Approximate memory usage in bytes
   * @private
   */
  _calculateMemoryUsage() {
    // Rough estimation of memory usage
    let totalSize = 0;

    for (const [jobId, events] of this.eventHistory) {
      totalSize += jobId.length * 2; // UTF-16 string size
      totalSize += JSON.stringify(events).length;
    }

    return totalSize;
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.removeAllListeners();
    this.eventHistory.clear();
    debugLog('EventBus: Destroyed and cleaned up resources');
  }
}

// Singleton instance for global event bus
let globalEventBus = null;

/**
 * Get global EventBus instance (singleton)
 * @returns {EventBus} Global EventBus instance
 */
export function getEventBus() {
  if (!globalEventBus) {
    globalEventBus = new EventBus();
  }
  return globalEventBus;
}

/**
 * Reset global EventBus instance (mainly for testing)
 */
export function resetEventBus() {
  if (globalEventBus) {
    globalEventBus.destroy();
    globalEventBus = null;
  }
}

export default EventBus;
