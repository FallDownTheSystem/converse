/**
 * Job Runner - Background Execution Orchestration
 *
 * Provides background execution orchestration for async chat and consensus operations.
 * Uses bounded concurrency control with p-limit to manage parallel LLM requests,
 * integrates with AsyncJobStore for state management, and emits events for monitoring.
 * Core execution layer enabling async=true functionality in MCP tools.
 */

import pLimit from 'p-limit';
import { EventEmitter } from 'events';
import { debugLog, debugError } from '../utils/console.js';
import { JOB_STATUS } from './asyncJobStore.js';
import { getEventBus } from './eventBus.js';

/**
 * Custom error class for job runner operations
 */
export class JobRunnerError extends Error {
  constructor(message, code = 'JOB_RUNNER_ERROR') {
    super(message);
    this.name = 'JobRunnerError';
    this.code = code;
  }
}

/**
 * JobRunner - Orchestrates background execution of async operations
 */
export class JobRunner extends EventEmitter {
  /**
   * Create a new JobRunner
   * @param {object} dependencies - Required dependencies
   * @param {object} dependencies.asyncJobStore - AsyncJobStore instance
   * @param {object} dependencies.eventBus - EventBus instance (optional, uses global if not provided)
   * @param {object} options - Configuration options
   * @param {number} options.concurrency - Maximum concurrent jobs (default: 10)
   * @param {number} options.defaultTimeout - Default job timeout in ms (default: 30 minutes)
   */
  constructor(dependencies, options = {}) {
    super();

    // Validate dependencies
    if (!dependencies || !dependencies.asyncJobStore) {
      throw new JobRunnerError(
        'AsyncJobStore is required',
        'MISSING_DEPENDENCIES'
      );
    }

    this.asyncJobStore = dependencies.asyncJobStore;
    this.fileCache = dependencies.fileCache; // Optional for caching support
    this.eventBus = dependencies.eventBus || getEventBus(); // Use provided EventBus or global instance

    // Configuration
    this.concurrency = options.concurrency || 10;
    this.defaultTimeout = options.defaultTimeout || 30 * 60 * 1000; // 30 minutes

    // Create bounded concurrency limiter
    this.limiter = pLimit(this.concurrency);

    // Track active jobs and abort controllers
    this.activeJobs = new Map();
    this.abortControllers = new Map();

    // Statistics
    this.stats = {
      submitted: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      activeCount: 0,
    };

    debugLog(`JobRunner: Initialized with concurrency limit ${this.concurrency}`);
  }

  /**
   * Submit a job for background execution
   * @param {object} jobSpec - Job specification
   * @param {string} jobSpec.sessionId - Session identifier
   * @param {string} jobSpec.tool - Tool name ('chat' | 'consensus')
   * @param {Function} runFunction - Function to execute (async)
   * @param {object} options - Execution options
   * @param {number} options.timeout - Job timeout in ms
   * @param {boolean} options.priority - High priority execution
   * @returns {string} Job ID for status tracking
   * @throws {JobRunnerError} If submission fails
   */
  async submit(jobSpec, runFunction, options = {}) {
    try {
      // Validate parameters
      if (!jobSpec || !jobSpec.sessionId || !jobSpec.tool) {
        throw new JobRunnerError(
          'Invalid job specification: sessionId and tool are required',
          'INVALID_JOB_SPEC'
        );
      }

      if (typeof runFunction !== 'function') {
        throw new JobRunnerError(
          'runFunction must be a callable function',
          'INVALID_RUN_FUNCTION'
        );
      }

      // Create job in store
      const jobId = await this.asyncJobStore.create(
        jobSpec.sessionId,
        jobSpec.tool,
        {
          timeout: options.timeout || this.defaultTimeout,
          priority: options.priority || false,
          ...jobSpec.options,
        }
      );

      // Set up abort controller for timeout and cancellation
      const abortController = new globalThis.AbortController();
      this.abortControllers.set(jobId, abortController);

      // Emit job created event through EventBus
      this.eventBus.emitJobCreated(jobId, jobSpec.sessionId, {
        tool: jobSpec.tool,
        options: jobSpec.options,
      });

      // Also emit through local EventEmitter for backward compatibility
      this.emit('job.created', {
        jobId,
        sessionId: jobSpec.sessionId,
        tool: jobSpec.tool,
        timestamp: Date.now(),
      });

      // Submit to limiter queue for background execution
      const limitedExecution = this.limiter(() =>
        this._executeJob(jobId, runFunction, options, abortController.signal)
      );

      // Don't await - execute in background
      globalThis.setImmediate(() => {
        limitedExecution.catch((error) => {
          debugError(`JobRunner: Background execution failed for ${jobId}:`, error);
        });
      });

      // Track statistics
      this.stats.submitted++;
      this.stats.activeCount++;

      debugLog(`JobRunner: Submitted job ${jobId} for background execution`);
      return jobId;

    } catch (error) {
      if (error instanceof JobRunnerError) {
        throw error;
      }
      throw new JobRunnerError(
        `Failed to submit job: ${error.message}`,
        'SUBMISSION_ERROR'
      );
    }
  }

  /**
   * Cancel a running job
   * @param {string} jobId - Job identifier
   * @returns {Promise<boolean>} True if cancelled
   */
  async cancel(jobId) {
    try {
      // Check if job exists and is cancellable
      const jobState = await this.asyncJobStore.get(jobId);
      if (!jobState) {
        return false;
      }

      if (![JOB_STATUS.QUEUED, JOB_STATUS.RUNNING].includes(jobState.status)) {
        return false; // Already completed or failed
      }

      // Signal abort
      const abortController = this.abortControllers.get(jobId);
      if (abortController) {
        abortController.abort('Job cancelled by user');
      }

      // Update job status
      await this.asyncJobStore.update(jobId, {
        status: JOB_STATUS.CANCELLED,
      });

      // Clean up tracking
      this.activeJobs.delete(jobId);
      this.abortControllers.delete(jobId);

      // Update stats
      this.stats.cancelled++;
      this.stats.activeCount = Math.max(0, this.stats.activeCount - 1);

      // Emit cancellation event through EventBus
      this.eventBus.emitJobCancelled(jobId, jobState.sessionId, {
        reason: 'User cancellation',
      });

      // Also emit through local EventEmitter for backward compatibility
      this.emit('job.cancelled', {
        jobId,
        timestamp: Date.now(),
      });

      debugLog(`JobRunner: Cancelled job ${jobId}`);
      return true;

    } catch (error) {
      debugError(`JobRunner: Failed to cancel job ${jobId}:`, error);
      return false;
    }
  }

  /**
   * Get current statistics
   * @returns {object} Runner statistics
   */
  getStats() {
    return {
      ...this.stats,
      concurrency: this.concurrency,
      queueSize: this.limiter.pendingCount,
      activeSize: this.limiter.activeCount,
      totalJobs: this.activeJobs.size,
    };
  }

  /**
   * Execute a job in the background with proper error handling and state management
   * @param {string} jobId - Job identifier
   * @param {Function} runFunction - Function to execute
   * @param {object} options - Execution options
   * @param {AbortSignal} signal - Abort signal for cancellation
   * @private
   */
  async _executeJob(jobId, runFunction, options, signal) {
    let jobState = null;

    try {
      // Get current job state
      jobState = await this.asyncJobStore.get(jobId);
      if (!jobState) {
        throw new JobRunnerError(`Job ${jobId} not found in store`, 'JOB_NOT_FOUND');
      }

      // Check if already cancelled or aborted
      if (signal.aborted) {
        await this.asyncJobStore.update(jobId, {
          status: JOB_STATUS.CANCELLED,
        });
        return;
      }

      // Update status to running
      await this.asyncJobStore.update(jobId, {
        status: JOB_STATUS.RUNNING,
      });

      this.activeJobs.set(jobId, {
        startedAt: Date.now(),
        tool: jobState.tool,
        sessionId: jobState.sessionId,
      });

      // Emit job started event through EventBus
      this.eventBus.emitJobStarted(jobId, jobState.sessionId, {
        tool: jobState.tool,
      });

      // Also emit through local EventEmitter for backward compatibility
      this.emit('job.started', {
        jobId,
        sessionId: jobState.sessionId,
        tool: jobState.tool,
        timestamp: Date.now(),
      });

      // Set up timeout
      const timeout = options.timeout || this.defaultTimeout;
      const timeoutHandle = setTimeout(() => {
        if (!signal.aborted) {
          debugLog(`JobRunner: Job ${jobId} timed out after ${timeout}ms`);
          this.abortControllers.get(jobId)?.abort(`Job timed out after ${timeout}ms`);
        }
      }, timeout);

      try {
        // Create execution context for the run function
        const context = {
          jobId,
          sessionId: jobState.sessionId,
          tool: jobState.tool,
          signal,
          updateJob: (updates) => this.asyncJobStore.update(jobId, updates),
          emitEvent: (eventType, data) => this.emit(eventType, { jobId, ...data }),
        };

        // Execute the job function
        debugLog(`JobRunner: Executing job ${jobId} (${jobState.tool})`);
        const result = await runFunction(context);

        // Clear timeout
        clearTimeout(timeoutHandle);

        // Check if aborted during execution
        if (signal.aborted) {
          await this.asyncJobStore.update(jobId, {
            status: JOB_STATUS.CANCELLED,
          });
          return;
        }

        // Complete the job
        await this.asyncJobStore.complete(jobId, result);

        // Emit completion event through EventBus
        this.eventBus.emitJobCompleted(jobId, jobState.sessionId, result);

        // Also emit through local EventEmitter for backward compatibility
        this.emit('job.completed', {
          jobId,
          sessionId: jobState.sessionId,
          tool: jobState.tool,
          result: result ? 'present' : 'null',
          timestamp: Date.now(),
        });

        this.stats.completed++;
        debugLog(`JobRunner: Completed job ${jobId}`);

      } catch (executionError) {
        // Clear timeout
        clearTimeout(timeoutHandle);

        // Check if this was due to cancellation
        if (signal.aborted) {
          // If the execution function returned a result before cancellation, preserve it
          let partialResult = null;
          if (executionError && executionError.partialResult) {
            partialResult = executionError.partialResult;
          }

          await this.asyncJobStore.update(jobId, {
            status: JOB_STATUS.CANCELLED,
            result: partialResult, // Preserve any partial results
          });

          // Emit cancellation event through EventBus
          this.eventBus.emitJobCancelled(jobId, jobState.sessionId, {
            reason: 'Job aborted during execution',
            partial_result: partialResult,
          });

          // Also emit through local EventEmitter for backward compatibility
          this.emit('job.cancelled', {
            jobId,
            timestamp: Date.now(),
            partial_result: partialResult,
          });

          this.stats.cancelled++;
          debugLog(`JobRunner: Job ${jobId} was cancelled during execution`);
          return;
        }

        // Handle execution error
        await this.asyncJobStore.fail(jobId, executionError);

        // Emit failure event through EventBus
        this.eventBus.emitJobFailed(jobId, jobState.sessionId, executionError);

        // Also emit through local EventEmitter for backward compatibility
        this.emit('job.failed', {
          jobId,
          sessionId: jobState.sessionId,
          tool: jobState.tool,
          error: executionError.message,
          timestamp: Date.now(),
        });

        this.stats.failed++;
        debugError(`JobRunner: Job ${jobId} failed:`, executionError);
      }

    } catch (error) {
      // Handle system-level errors
      debugError('JobRunner: System error during job execution:', error);

      if (jobState) {
        try {
          await this.asyncJobStore.fail(jobId, error);

          // Emit failure event through EventBus
          this.eventBus.emitJobFailed(jobId, jobState.sessionId, error);

          // Also emit through local EventEmitter for backward compatibility
          this.emit('job.failed', {
            jobId,
            sessionId: jobState.sessionId,
            tool: jobState.tool,
            error: error.message,
            timestamp: Date.now(),
          });
        } catch (updateError) {
          debugError(`JobRunner: Failed to update job ${jobId} after system error:`, updateError);
        }
      }

      this.stats.failed++;

    } finally {
      // Clean up tracking
      this.activeJobs.delete(jobId);
      this.abortControllers.delete(jobId);
      this.stats.activeCount = Math.max(0, this.stats.activeCount - 1);
    }
  }

  /**
   * Gracefully shutdown the job runner
   * @param {number} timeoutMs - Max time to wait for running jobs (default: 30s)
   * @returns {Promise<void>}
   */
  async shutdown(timeoutMs = 30000) {
    debugLog(`JobRunner: Starting graceful shutdown (timeout: ${timeoutMs}ms)`);

    // Cancel all queued jobs
    for (const [, abortController] of this.abortControllers.entries()) {
      abortController.abort('JobRunner shutdown');
    }

    // Wait for active jobs to complete or timeout
    const shutdownStart = Date.now();
    while (this.stats.activeCount > 0 && (Date.now() - shutdownStart) < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (this.stats.activeCount > 0) {
      debugLog(`JobRunner: Forced shutdown - ${this.stats.activeCount} jobs still active`);
    }

    // Clear all tracking
    this.activeJobs.clear();
    this.abortControllers.clear();
    this.removeAllListeners();

    debugLog('JobRunner: Shutdown complete');
  }
}

/**
 * Create a new JobRunner instance
 * @param {object} dependencies - Required dependencies
 * @param {object} options - Configuration options
 * @returns {JobRunner} JobRunner instance
 */
export function createJobRunner(dependencies, options = {}) {
  return new JobRunner(dependencies, options);
}

// Singleton instance for global usage
let globalJobRunner = null;

/**
 * Get the global JobRunner instance
 * @param {object} dependencies - Dependencies for initialization
 * @param {object} options - Configuration options
 * @returns {JobRunner} Global JobRunner instance
 */
export function getJobRunner(dependencies = null, options = {}) {
  if (!globalJobRunner && dependencies) {
    globalJobRunner = createJobRunner(dependencies, options);
  }
  return globalJobRunner;
}

/**
 * Set a custom JobRunner instance (for testing)
 * @param {JobRunner|null} runner - JobRunner instance or null to reset
 */
export function setJobRunner(runner) {
  if (runner !== null && !(runner instanceof JobRunner)) {
    throw new JobRunnerError(
      'Runner must be a JobRunner instance',
      'INVALID_RUNNER'
    );
  }
  globalJobRunner = runner;
}
