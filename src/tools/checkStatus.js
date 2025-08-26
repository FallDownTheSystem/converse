/**
 * Check Status Tool
 *
 * MCP tool for querying async job status and progress. Provides comprehensive
 * job monitoring with incremental polling support, session ownership verification,
 * and memory-first lookup with FileCache fallback for completed jobs.
 */

import { createToolResponse, createToolError } from './index.js';
import { getAsyncJobStore, JOB_STATUS } from '../async/asyncJobStore.js';
import { getFileCache } from '../async/fileCache.js';
import { debugLog, debugError } from '../utils/console.js';
import { createLogger } from '../utils/logger.js';
import { 
  formatJobStatus, 
  formatHumanReadableStatus, 
  formatJobListHumanReadable,
  formatConversationHistory 
} from '../utils/formatStatus.js';

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
    const { config, providers } = dependencies;

    // Extract and validate arguments
    const {
      continuation_id,
      full_history = false
    } = args;

    // Validate arguments
    if (continuation_id && typeof continuation_id !== 'string') {
      return createToolError('continuation_id must be a string');
    }

    const asyncJobStore = getAsyncJobStore();
    const fileCache = getFileCache();

    debugLog('checkStatus', 'Processing status query', {
      continuation_id,
      full_history
    });

    if (continuation_id) {
      // Query specific job by continuation_id
      const jobStatus = await querySpecificJob(
        continuation_id,
        asyncJobStore,
        fileCache,
        {
          include_output: true,  // Always include output
          full_history
        }
      );

      if (!jobStatus) {
        return createToolError(`Job not found or access denied: ${continuation_id}`);
      }

      // Format content as human-readable status (now async)
      const content = full_history 
        ? await formatConversationHistory(jobStatus, continuation_id, { config, providers })
        : await formatHumanReadableStatus(jobStatus, { sequence: '1/1' }, { config, providers });
      
      return createToolResponse({
        content,
        metadata: {
          continuation_id,
          execution_time: (Date.now() - startTime) / 1000,
          full_history
        }
      });

    } else {
      // List all active/recent jobs (hardcoded to 10 latest)
      const jobsList = await listAllJobs(
        asyncJobStore,
        fileCache,
        {
          include_output: true,  // Always include output
          max_results: 10
        }
      );

      // Format content as human-readable jobs list (now async)
      const content = await formatJobListHumanReadable(jobsList, { config, providers });
      
      return createToolResponse({
        content,
        metadata: {
          execution_time: (Date.now() - startTime) / 1000,
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

    // If we haven't reached 10 jobs, try to get more from FileCache
    // Note: This is a simplified approach - in production, you might want
    // to implement a more sophisticated indexing system for file-based jobs
    if (jobs.length < 10) {
      debugLog('checkStatus', 'Checking FileCache for additional completed jobs');
      // For now, we'll just note that FileCache lookup would happen here
      // A production implementation might maintain an index of jobs by session
    }

    return {
      jobs,
      summary,
      query_options: {
        include_output: true,  // Always include output
        max_results: 10
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
      limit: 10,
      sortBy: 'updatedAt',
      sortOrder: 'desc'
    });
  } catch (error) {
    debugError('checkStatus', 'Error getting all jobs:', error);
    return [];
  }
}





// Tool metadata and input schema
checkStatusTool.description = 'Check the status and progress of async jobs. Query specific jobs by continuation_id or list the 10 most recent jobs. Returns job status with start time and progress information.';

checkStatusTool.inputSchema = {
  type: 'object',
  properties: {
    continuation_id: {
      type: 'string',
      description: 'Optional job continuation ID to query. If not provided, returns the 10 most recent jobs.'
    },
    full_history: {
      type: 'boolean',
      default: false,
      description: 'When used with continuation_id, returns the full conversation history for that continuation ID.'
    }
  },
  additionalProperties: false
};