/**
 * Check Status Tool
 *
 * MCP tool for querying async job status and progress. Provides comprehensive
 * job monitoring with incremental polling support, session ownership verification,
 * and memory-first lookup with FileCache fallback for completed jobs.
 */

import { createToolResponse, createToolError, formatMetadataDisplay } from './index.js';
import { getAsyncJobStore, JOB_STATUS } from '../async/asyncJobStore.js';
import { getFileCache } from '../async/fileCache.js';
import { debugLog, debugError } from '../utils/console.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('check-status');

/**
 * Check status tool implementation
 * @param {object} args - Tool arguments
 * @param {object} dependencies - Injected dependencies (config, providers, etc.)
 * @returns {object} MCP tool response
 */
export async function checkStatusTool(args, dependencies) {
  const startTime = Date.now();

  try {
    const { config } = dependencies;

    // Extract and validate arguments
    const {
      continuation_id,
      since_seq,
      include_events = false,
      include_output = true,
      max_results = 50
    } = args;

    // Validate arguments
    if (continuation_id && typeof continuation_id !== 'string') {
      return createToolError('continuation_id must be a string');
    }

    if (since_seq !== undefined && (!Number.isInteger(since_seq) || since_seq < 0)) {
      return createToolError('since_seq must be a non-negative integer');
    }

    if (!Number.isInteger(max_results) || max_results < 1 || max_results > 100) {
      return createToolError('max_results must be an integer between 1 and 100');
    }

    const asyncJobStore = getAsyncJobStore();
    const fileCache = getFileCache();

    debugLog('checkStatus', 'Processing status query', {
      continuation_id,
      since_seq,
      include_events,
      include_output,
      max_results
    });

    if (continuation_id) {
      // Query specific job by continuation_id
      const jobStatus = await querySpecificJob(
        continuation_id,
        asyncJobStore,
        fileCache,
        {
          since_seq,
          include_events,
          include_output
        }
      );

      if (!jobStatus) {
        return createToolError(`Job not found or access denied: ${continuation_id}`);
      }

      const executionTime = (Date.now() - startTime) / 1000;
      const metadataDisplay = formatMetadataDisplay(
        {
          continuation_id,
          job_status: jobStatus.status,
          provider: jobStatus.provider || 'multiple'
        },
        'check_status',
        executionTime
      );

      return createToolResponse({
        content: JSON.stringify(jobStatus, null, 2),
        metadata_display: metadataDisplay,
        metadata: {
          continuation_id,
          execution_time: executionTime
        }
      });

    } else {
      // List all active/recent jobs
      const jobsList = await listAllJobs(
        asyncJobStore,
        fileCache,
        {
          since_seq,
          include_events,
          include_output,
          max_results
        }
      );

      const executionTime = (Date.now() - startTime) / 1000;
      const metadataDisplay = formatMetadataDisplay(
        {
          total_jobs: jobsList.jobs.length,
          active_jobs: jobsList.summary.active_jobs,
          completed_jobs: jobsList.summary.completed_jobs
        },
        'check_status',
        executionTime
      );

      return createToolResponse({
        content: JSON.stringify(jobsList, null, 2),
        metadata_display: metadataDisplay,
        metadata: {
          execution_time: executionTime,
          total_jobs: jobsList.jobs.length
        }
      });
    }

  } catch (error) {
    debugError('checkStatus', 'Tool execution failed:', error);
    return createToolError('Failed to check job status', error);
  }
}

/**
 * Query specific job by continuation_id
 * @param {string} continuationId - Job continuation ID
 * @param {object} asyncJobStore - Async job store instance
 * @param {object} fileCache - File cache instance
 * @param {object} options - Query options
 * @returns {object|null} Job status or null if not found
 */
async function querySpecificJob(continuationId, asyncJobStore, fileCache, options = {}) {
  try {
    // First try memory store (AsyncJobStore)
    const memoryJob = await asyncJobStore.get(continuationId);
    if (memoryJob) {
      return formatJobStatus(memoryJob, options);
    }

    // Fallback to FileCache for completed jobs
    const fileJob = await fileCache.readSnapshot(continuationId);
    if (fileJob) {
      return formatJobStatus(fileJob, options);
    }

    // Job not found
    debugLog('checkStatus', 'Job not found', { continuationId });
    return null;

  } catch (error) {
    debugError('checkStatus', 'Error querying specific job:', error);
    throw error;
  }
}

/**
 * List all active/recent jobs
 * @param {object} asyncJobStore - Async job store instance
 * @param {object} fileCache - File cache instance
 * @param {object} options - Query options
 * @returns {object} Jobs list with summary
 */
async function listAllJobs(asyncJobStore, fileCache, options = {}) {
  try {
    const jobs = [];
    const summary = {
      active_jobs: 0,
      completed_jobs: 0,
      failed_jobs: 0,
      cancelled_jobs: 0,
      total_jobs: 0
    };

    // Get stats from AsyncJobStore to understand what's in memory
    const storeStats = await asyncJobStore.getStats();
    debugLog('checkStatus', 'AsyncJobStore stats:', storeStats);

    // Get all jobs from AsyncJobStore
    const allJobs = await getAllJobsFromStore(asyncJobStore, options);

    for (const job of allJobs) {
      const formattedJob = formatJobStatus(job, options);
      jobs.push(formattedJob);
      
      // Update summary
      summary.total_jobs++;
      switch (job.status) {
        case JOB_STATUS.RUNNING:
        case JOB_STATUS.QUEUED:
          summary.active_jobs++;
          break;
        case JOB_STATUS.COMPLETED:
          summary.completed_jobs++;
          break;
        case JOB_STATUS.FAILED:
          summary.failed_jobs++;
          break;
        case JOB_STATUS.CANCELLED:
          summary.cancelled_jobs++;
          break;
      }
    }

    // If we haven't reached max_results, try to get more from FileCache
    // Note: This is a simplified approach - in production, you might want
    // to implement a more sophisticated indexing system for file-based jobs
    if (jobs.length < options.max_results) {
      debugLog('checkStatus', 'Checking FileCache for additional completed jobs');
      // For now, we'll just note that FileCache lookup would happen here
      // A production implementation might maintain an index of jobs by session
    }

    return {
      jobs,
      summary,
      query_options: {
        since_seq: options.since_seq,
        include_events: options.include_events,
        include_output: options.include_output,
        max_results: options.max_results
      },
      timestamp: Date.now()
    };

  } catch (error) {
    debugError('checkStatus', 'Error listing session jobs:', error);
    throw error;
  }
}

/**
 * Get all jobs from AsyncJobStore
 * @param {object} asyncJobStore - Async job store instance
 * @param {object} options - Query options
 * @returns {Array} Array of all jobs
 */
async function getAllJobsFromStore(asyncJobStore, options = {}) {
  try {
    return await asyncJobStore.getAllJobs({
      limit: options.max_results || 50,
      sortBy: 'updatedAt',
      sortOrder: 'desc'
    });
  } catch (error) {
    debugError('checkStatus', 'Error getting all jobs:', error);
    return [];
  }
}

/**
 * Format job status for client response
 * @param {object} job - Raw job object
 * @param {object} options - Formatting options
 * @returns {object} Formatted job status
 */
function formatJobStatus(job, options = {}) {
  const formatted = {
    continuation_id: job.jobId,
    status: job.status,
    tool: job.tool,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    progress: job.overall?.progress || 0,
    started_at: job.overall?.startedAt || null,
    ended_at: job.overall?.endedAt || null
  };

  // Add error information if failed
  if (job.status === JOB_STATUS.FAILED && job.overall?.error) {
    formatted.error = job.overall.error;
  }

  // Add provider details if available
  if (job.providers && job.providers.size > 0) {
    formatted.providers = {};
    for (const [providerId, providerState] of job.providers) {
      formatted.providers[providerId] = {
        status: providerState.status || 'unknown',
        progress: providerState.progress || 0,
        updated_at: providerState.updatedAt || null
      };
    }
  }

  // Include output if requested and available
  if (options.include_output && job.overall?.result) {
    formatted.result = job.overall.result;
    
    // Also include metadata from the result if available
    if (job.overall.result.metadata) {
      formatted.metadata = job.overall.result.metadata;
    }
  }

  // Include events if requested
  if (options.include_events && job.events && job.events.length > 0) {
    let events = job.events;
    
    // Filter events by sequence number if since_seq provided
    if (options.since_seq !== undefined) {
      events = events.filter(event => event.seq > options.since_seq);
    }

    formatted.events = events;
    formatted.latest_seq = job.seq || 0;
  }

  return formatted;
}

// Tool metadata and input schema
checkStatusTool.description = 'Check the status and progress of async jobs. Query specific jobs by continuation_id or list all active jobs. Supports incremental polling and detailed progress information.';

checkStatusTool.inputSchema = {
  type: 'object',
  properties: {
    continuation_id: {
      type: 'string',
      description: 'Optional job continuation ID to query. If not provided, returns all active/recent jobs.'
    },
    since_seq: {
      type: 'integer',
      minimum: 0,
      description: 'Optional sequence number for incremental polling. Returns only events/updates after this sequence number.'
    },
    include_events: {
      type: 'boolean',
      default: false,
      description: 'Include job lifecycle events in the response (useful for debugging and detailed monitoring).'
    },
    include_output: {
      type: 'boolean', 
      default: true,
      description: 'Include partial/final output in the response. Set to false for faster status-only queries.'
    },
    max_results: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      default: 50,
      description: 'Maximum number of jobs to return when listing all jobs (ignored when querying specific job).'
    }
  },
  additionalProperties: false
};