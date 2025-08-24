/**
 * Async Job Store - Job State Management
 *
 * Manages async execution status, progress, and results using lru-cache for TTL management.
 * Core foundation for async chat and consensus tools, providing fast access to job states
 * with automatic cleanup. Integrates with existing continuation store patterns.
 */

import { LRUCache } from 'lru-cache';
import { nanoid } from 'nanoid';
import { debugLog, debugError } from '../utils/console.js';
import { getEventBus, EVENT_TYPES } from './eventBus.js';

/**
 * Job statuses
 */
export const JOB_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

/**
 * Storage backend interface that all async job stores must implement
 * This ensures pluggable backend replacement without changing the API
 */
export class AsyncJobStoreInterface {
  /**
   * Create new job
   * @param {string} _sessionId - Session identifier
   * @param {string} _tool - Tool name ('chat' | 'consensus')
   * @param {object} _options - Job options
   * @returns {Promise<string>} Job ID
   */
  async create(_sessionId, _tool, _options = {}) {
    throw new Error('create() method must be implemented by storage backend');
  }

  /**
   * Get job state
   * @param {string} _jobId - Job identifier
   * @returns {Promise<object|null>} Job state or null if not found
   */
  async get(_jobId) {
    throw new Error('get() method must be implemented by storage backend');
  }

  /**
   * Update job state
   * @param {string} _jobId - Job identifier
   * @param {object} _updates - State updates
   * @returns {Promise<boolean>} True if updated
   */
  async update(_jobId, _updates) {
    throw new Error('update() method must be implemented by storage backend');
  }

  /**
   * Complete job with result
   * @param {string} _jobId - Job identifier
   * @param {object} _result - Job result
   * @returns {Promise<boolean>} True if completed
   */
  async complete(_jobId, _result) {
    throw new Error('complete() method must be implemented by storage backend');
  }

  /**
   * Fail job with error
   * @param {string} _jobId - Job identifier
   * @param {Error|object} _error - Error information
   * @returns {Promise<boolean>} True if failed
   */
  async fail(_jobId, _error) {
    throw new Error('fail() method must be implemented by storage backend');
  }

  /**
   * Check if job exists
   * @param {string} jobId - Job identifier
   * @returns {Promise<boolean>} True if exists
   */
  async exists(jobId) {
    const job = await this.get(jobId);
    return job !== null;
  }

  /**
   * Get storage statistics
   * @returns {Promise<object>} Backend-specific statistics
   */
  async getStats() {
    throw new Error('getStats() method must be implemented by storage backend');
  }

  /**
   * Clean up old data
   * @param {number} _maxAgeMs - Maximum age in milliseconds
   * @returns {Promise<number>} Number of items cleaned up
   */
  async cleanup(_maxAgeMs) {
    throw new Error('cleanup() method must be implemented by storage backend');
  }
}

/**
 * Custom error class for async job store operations
 */
export class AsyncJobStoreError extends Error {
  constructor(message, code = 'JOB_STORE_ERROR') {
    super(message);
    this.name = 'AsyncJobStoreError';
    this.code = code;
  }
}

/**
 * In-memory async job store implementation using LRU cache
 * Implements the AsyncJobStoreInterface for pluggable backend replacement
 */
class LRUAsyncJobStore extends AsyncJobStoreInterface {
  constructor() {
    super();

    // Configure LRU cache with 24-hour TTL and 10k job capacity
    this.jobs = new LRUCache({
      max: 10000, // Maximum 10k jobs to prevent memory leaks
      ttl: 24 * 60 * 60 * 1000, // 24 hours TTL
      updateAgeOnGet: true, // Update TTL on access
      updateAgeOnHas: false, // Don't update TTL just for existence checks
    });

    this.maxEventsPerJob = 100; // Ring buffer size for events
    this.eventBus = getEventBus(); // Get global EventBus instance
    
    // Set up EventBus listeners to capture events for storage
    this._setupEventBusListeners();
  }

  /**
   * Create new job
   * @param {string} sessionId - Session identifier
   * @param {string} tool - Tool name ('chat' | 'consensus')
   * @param {object} options - Job options
   * @returns {Promise<string>} Job ID
   * @throws {AsyncJobStoreError} If creation fails
   */
  async create(sessionId, tool, options = {}) {
    try {
      // Validate parameters
      if (!sessionId || typeof sessionId !== 'string') {
        throw new AsyncJobStoreError(
          'Invalid session ID: must be a non-empty string',
          'INVALID_SESSION_ID'
        );
      }

      if (!tool || !['chat', 'consensus'].includes(tool)) {
        throw new AsyncJobStoreError(
          'Invalid tool: must be "chat" or "consensus"',
          'INVALID_TOOL'
        );
      }

      // Generate job ID using same pattern as continuation store
      const jobId = this._generateJobId();
      const now = Date.now();

      // Create initial job state
      const jobState = {
        jobId,
        sessionId,
        status: JOB_STATUS.QUEUED,
        tool,
        createdAt: now,
        updatedAt: now,
        overall: {
          progress: 0.0, // 0.0 to 1.0
          startedAt: null,
          endedAt: null,
          result: null,
          error: null,
        },
        providers: new Map(), // Per-provider state tracking
        events: [], // Ring buffer for events
        seq: 0, // Sequence counter for events
        ...options, // Allow additional options
      };

      // Store the job
      this.jobs.set(jobId, jobState);

      // Log event
      this._addEvent(jobState, 'job_created', {
        tool,
        sessionId,
      });

      debugLog(`AsyncJobStore: Created job ${jobId} for ${tool}`);
      return jobId;

    } catch (error) {
      if (error instanceof AsyncJobStoreError) {
        throw error;
      }
      throw new AsyncJobStoreError(
        `Failed to create job: ${error.message}`,
        'CREATION_ERROR'
      );
    }
  }

  /**
   * Get job state
   * @param {string} jobId - Job identifier
   * @returns {Promise<object|null>} Job state or null if not found
   * @throws {AsyncJobStoreError} If retrieval fails
   */
  async get(jobId) {
    try {
      // Validate job ID
      if (!jobId || typeof jobId !== 'string') {
        throw new AsyncJobStoreError(
          'Invalid job ID: must be a non-empty string',
          'INVALID_JOB_ID'
        );
      }

      const job = this.jobs.get(jobId);
      if (!job) {
        return null;
      }

      // Update last accessed time
      job.lastAccessed = Date.now();

      // Return deep copy to prevent external mutations
      return this._deepClone(job);

    } catch (error) {
      if (error instanceof AsyncJobStoreError) {
        throw error;
      }
      throw new AsyncJobStoreError(
        `Failed to retrieve job: ${error.message}`,
        'RETRIEVAL_ERROR'
      );
    }
  }

  /**
   * Update job state
   * @param {string} jobId - Job identifier
   * @param {object} updates - State updates
   * @returns {Promise<boolean>} True if updated
   * @throws {AsyncJobStoreError} If update fails
   */
  async update(jobId, updates) {
    try {
      // Validate parameters
      if (!jobId || typeof jobId !== 'string') {
        throw new AsyncJobStoreError(
          'Invalid job ID: must be a non-empty string',
          'INVALID_JOB_ID'
        );
      }

      if (!updates || typeof updates !== 'object') {
        throw new AsyncJobStoreError(
          'Invalid updates: must be an object',
          'INVALID_UPDATES'
        );
      }

      const job = this.jobs.get(jobId);
      if (!job) {
        return false;
      }

      const now = Date.now();

      // Apply updates
      if (updates.status && Object.values(JOB_STATUS).includes(updates.status)) {
        job.status = updates.status;

        // Set startedAt when status changes to running
        if (updates.status === JOB_STATUS.RUNNING && !job.overall.startedAt) {
          job.overall.startedAt = now;
        }
      }

      if (updates.progress !== undefined) {
        job.overall.progress = Math.max(0.0, Math.min(1.0, updates.progress));
      }

      if (updates.providers) {
        // Update provider states
        Object.entries(updates.providers).forEach(([provider, state]) => {
          job.providers.set(provider, { ...job.providers.get(provider), ...state });
        });
      }

      // Update timestamp
      job.updatedAt = now;

      // Log event
      this._addEvent(job, 'job_updated', updates);

      return true;

    } catch (error) {
      if (error instanceof AsyncJobStoreError) {
        throw error;
      }
      throw new AsyncJobStoreError(
        `Failed to update job: ${error.message}`,
        'UPDATE_ERROR'
      );
    }
  }

  /**
   * Complete job with result
   * @param {string} jobId - Job identifier
   * @param {object} result - Job result
   * @returns {Promise<boolean>} True if completed
   * @throws {AsyncJobStoreError} If completion fails
   */
  async complete(jobId, result) {
    try {
      const job = this.jobs.get(jobId);
      if (!job) {
        return false;
      }

      const now = Date.now();

      // Update job state
      job.status = JOB_STATUS.COMPLETED;
      job.overall.progress = 1.0;
      job.overall.endedAt = now;
      job.overall.result = result;
      job.updatedAt = now;

      // Log event
      this._addEvent(job, 'job_completed', {
        result: result ? 'present' : 'null',
      });

      debugLog(`AsyncJobStore: Completed job ${jobId}`);
      return true;

    } catch (error) {
      throw new AsyncJobStoreError(
        `Failed to complete job: ${error.message}`,
        'COMPLETION_ERROR'
      );
    }
  }

  /**
   * Fail job with error
   * @param {string} jobId - Job identifier
   * @param {Error|object} error - Error information
   * @returns {Promise<boolean>} True if failed
   * @throws {AsyncJobStoreError} If failing fails
   */
  async fail(jobId, error) {
    try {
      const job = this.jobs.get(jobId);
      if (!job) {
        return false;
      }

      const now = Date.now();

      // Serialize error information
      const errorInfo = error instanceof Error
        ? { message: error.message, name: error.name, stack: error.stack }
        : error;

      // Update job state
      job.status = JOB_STATUS.FAILED;
      job.overall.endedAt = now;
      job.overall.error = errorInfo;
      job.updatedAt = now;

      // Log event
      this._addEvent(job, 'job_failed', {
        error: errorInfo?.message || 'Unknown error',
      });

      debugError(`AsyncJobStore: Failed job ${jobId}:`, errorInfo);
      return true;

    } catch (err) {
      throw new AsyncJobStoreError(
        `Failed to fail job: ${err.message}`,
        'FAILURE_ERROR'
      );
    }
  }

  /**
   * Get storage statistics
   * @returns {Promise<object>} Store statistics
   */
  async getStats() {
    const statusCounts = {};
    let totalEvents = 0;

    // Count jobs by status
    Object.values(JOB_STATUS).forEach(status => {
      statusCounts[status] = 0;
    });

    for (const job of this.jobs.values()) {
      statusCounts[job.status]++;
      totalEvents += job.events.length;
    }

    return {
      backend: 'lru-cache',
      totalJobs: this.jobs.size,
      maxJobs: this.jobs.max,
      ttl: this.jobs.ttl,
      statusCounts,
      totalEvents,
      maxEventsPerJob: this.maxEventsPerJob,
      memoryUsage: process.memoryUsage(),
    };
  }

  /**
   * Clean up old jobs
   * @param {number} maxAgeMs - Maximum age in milliseconds (default: 24 hours)
   * @returns {Promise<number>} Number of jobs cleaned up
   */
  async cleanup(maxAgeMs = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    let cleanedCount = 0;

    // Special case: if maxAgeMs is 0, clean up all jobs
    if (maxAgeMs === 0) {
      cleanedCount = this.jobs.size;
      this.jobs.clear();
      return cleanedCount;
    }

    // Clean up old jobs based on last update time
    for (const [jobId, job] of this.jobs.entries()) {
      if (now - job.updatedAt > maxAgeMs) {
        this.jobs.delete(jobId);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Set up EventBus listeners to capture job lifecycle events
   * @private
   */
  _setupEventBusListeners() {
    // Listen for all job lifecycle events and store them in job ring buffers
    const eventTypes = [
      EVENT_TYPES.JOB_CREATED,
      EVENT_TYPES.JOB_STARTED,
      EVENT_TYPES.JOB_UPDATED,
      EVENT_TYPES.JOB_COMPLETED,
      EVENT_TYPES.JOB_FAILED,
      EVENT_TYPES.JOB_CANCELLED,
    ];

    eventTypes.forEach(eventType => {
      this.eventBus.on(eventType, (eventData) => {
        this._storeEventInJob(eventData);
      });
    });

    debugLog('AsyncJobStore: Set up EventBus listeners for job lifecycle events');
  }

  /**
   * Store EventBus event in job's ring buffer
   * @param {object} eventData - Event data from EventBus
   * @private
   */
  _storeEventInJob(eventData) {
    try {
      const job = this.jobs.get(eventData.jobId);
      if (!job) {
        // Job might have been cleaned up, skip event storage
        return;
      }

      // Convert EventBus event format to job event format
      const jobEvent = {
        seq: ++job.seq,
        timestamp: eventData.timestamp,
        type: eventData.eventType,
        data: eventData.data || {},
        source: 'eventbus',
      };

      // Add to job's event ring buffer
      job.events.push(jobEvent);

      // Maintain ring buffer size
      if (job.events.length > this.maxEventsPerJob) {
        job.events.shift();
      }

      // Update job's last activity
      job.updatedAt = Date.now();

    } catch (error) {
      debugError('AsyncJobStore: Failed to store EventBus event in job:', error);
    }
  }

  /**
   * Get events from job with optional filtering
   * @param {string} jobId - Job identifier
   * @param {object} options - Filtering options
   * @param {string} options.eventType - Filter by event type
   * @param {number} options.limit - Maximum events to return
   * @param {number} options.afterSeq - Return events after this sequence number
   * @returns {Promise<Array>} Array of events
   */
  async getJobEvents(jobId, options = {}) {
    try {
      const job = this.jobs.get(jobId);
      if (!job) {
        return [];
      }

      let events = job.events;

      // Apply filters
      if (options.eventType) {
        events = events.filter(event => event.type === options.eventType);
      }

      if (options.afterSeq !== undefined) {
        events = events.filter(event => event.seq > options.afterSeq);
      }

      // Apply limit
      if (options.limit) {
        events = events.slice(-options.limit);
      }

      // Return deep copy to prevent mutations
      return this._deepClone(events);

    } catch (error) {
      debugError(`AsyncJobStore: Failed to get events for job ${jobId}:`, error);
      return [];
    }
  }

  /**
   * Get latest event for a job
   * @param {string} jobId - Job identifier
   * @returns {Promise<object|null>} Latest event or null
   */
  async getLatestJobEvent(jobId) {
    try {
      const job = this.jobs.get(jobId);
      if (!job || job.events.length === 0) {
        return null;
      }

      const latestEvent = job.events[job.events.length - 1];
      return this._deepClone(latestEvent);

    } catch (error) {
      debugError(`AsyncJobStore: Failed to get latest event for job ${jobId}:`, error);
      return null;
    }
  }

  /**
   * Generate a new job ID using same pattern as continuation store
   * @returns {string} Unique job ID (format: job_XXXXXXXXXX)
   * @private
   */
  _generateJobId() {
    // Generate a 10-character nanoid for short but unique IDs
    return `job_${nanoid(10)}`;
  }

  /**
   * Add event to job history with ring buffer behavior
   * @param {object} job - Job state object
   * @param {string} eventType - Type of event
   * @param {object} data - Event data
   * @private
   */
  _addEvent(job, eventType, data = {}) {
    const event = {
      seq: ++job.seq,
      timestamp: Date.now(),
      type: eventType,
      data,
    };

    job.events.push(event);

    // Maintain ring buffer size
    if (job.events.length > this.maxEventsPerJob) {
      job.events.shift();
    }
  }

  /**
   * Deep clone object to prevent external mutations
   * @param {object} obj - Object to clone
   * @returns {object} Deep clone
   * @private
   */
  _deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Map) {
      const clonedMap = new Map();
      for (const [key, value] of obj.entries()) {
        clonedMap.set(key, this._deepClone(value));
      }
      return clonedMap;
    }

    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this._deepClone(item));
    }

    const cloned = {};
    for (const [key, value] of Object.entries(obj)) {
      cloned[key] = this._deepClone(value);
    }
    return cloned;
  }
}

// Singleton instance - can be replaced for different backends
let asyncJobStore = null;

/**
 * Get the async job store instance
 * @returns {AsyncJobStoreInterface} Async job store instance
 */
export function getAsyncJobStore() {
  if (!asyncJobStore) {
    asyncJobStore = new LRUAsyncJobStore();

    // Set up periodic cleanup (runs every 10 minutes, same as continuation store)
    setInterval(async () => {
      try {
        const cleaned = await asyncJobStore.cleanup();
        if (cleaned > 0) {
          debugLog(`AsyncJobStore: Cleaned up ${cleaned} old jobs`);
        }
      } catch (error) {
        debugError('AsyncJobStore cleanup failed:', error);
      }
    }, 10 * 60 * 1000);
  }
  return asyncJobStore;
}

/**
 * Set a custom async job store backend (for testing or different implementations)
 * @param {AsyncJobStoreInterface|null} store - Custom store implementation or null to reset
 */
export function setAsyncJobStore(store) {
  if (store !== null && !(store instanceof AsyncJobStoreInterface)) {
    throw new AsyncJobStoreError(
      'Store must extend AsyncJobStoreInterface',
      'INVALID_STORE'
    );
  }
  asyncJobStore = store;
}

/**
 * Generate a new job ID
 * @returns {string} Unique job ID (format: job_XXXXXXXXXX)
 */
export function generateJobId() {
  // Generate a 10-character nanoid for short but unique IDs
  return `job_${nanoid(10)}`;
}

/**
 * Validate job ID format
 * @param {string} jobId - ID to validate
 * @returns {boolean} True if valid format
 */
export function isValidJobId(jobId) {
  if (!jobId || typeof jobId !== 'string') {
    return false;
  }

  // Check for job_ prefix and nanoid format (10 characters, URL-safe)
  // nanoid uses URL-safe alphabet: A-Za-z0-9_-
  const nanoidPattern = /^job_[A-Za-z0-9_-]{10}$/;

  return nanoidPattern.test(jobId);
}

/**
 * Helper function to add provider state to job
 * @param {object} jobState - Current job state
 * @param {string} providerId - Provider identifier
 * @param {object} providerState - Provider state to set
 * @returns {object} Updated state
 */
export function setProviderState(jobState, providerId, providerState) {
  if (!jobState.providers) {
    jobState.providers = new Map();
  }

  jobState.providers.set(providerId, {
    ...jobState.providers.get(providerId),
    ...providerState,
    updatedAt: Date.now(),
  });

  return jobState;
}

/**
 * Helper function to get provider state from job
 * @param {object} jobState - Current job state
 * @param {string} providerId - Provider identifier
 * @returns {object|null} Provider state or null if not found
 */
export function getProviderState(jobState, providerId) {
  if (!jobState.providers) {
    return null;
  }

  return jobState.providers.get(providerId) || null;
}
