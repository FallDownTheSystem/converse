/**
 * Cancel Job Tool - Job Cancellation via AbortController
 *
 * Provides the ability to cancel running async jobs through the cancel_job MCP tool.
 * Integrates with JobRunner and AbortController for graceful cancellation of in-progress
 * LLM requests across all providers. Updates job status to 'cancelled' and cleans up
 * resources appropriately.
 */

import { debugLog, debugError } from '../utils/console.js';
import { createToolResponse, createToolError } from './index.js';

/**
 * Schema for the cancel_job tool
 */
const CANCEL_JOB_SCHEMA = {
  type: 'object',
  properties: {
    continuation_id: {
      type: 'string',
      description: 'The continuation_id of the job to cancel',
    },
  },
  required: ['continuation_id'],
  additionalProperties: false,
};

/**
 * Cancel Job MCP Tool
 * @param {object} args - Tool arguments
 * @param {string} args.continuation_id - Job continuation ID to cancel
 * @param {object} dependencies - Injected dependencies
 * @param {object} dependencies.jobRunner - JobRunner instance for job management
 * @param {object} dependencies.asyncJobStore - AsyncJobStore for job state access
 * @returns {Promise<object>} MCP tool response
 */
export async function cancelJobTool(args, dependencies) {
  const { continuation_id } = args;

  // Validate dependencies
  if (!dependencies?.jobRunner) {
    debugError('CancelJob: Missing JobRunner dependency');
    return createToolError('Service not available: JobRunner not configured');
  }

  if (!dependencies?.asyncJobStore) {
    debugError('CancelJob: Missing AsyncJobStore dependency');
    return createToolError(
      'Service not available: AsyncJobStore not configured',
    );
  }

  const { jobRunner, asyncJobStore, config, providers } = dependencies;

  try {
    // Validate continuation_id
    if (!continuation_id || typeof continuation_id !== 'string') {
      return createToolError(
        'Invalid continuation_id: must be a non-empty string',
      );
    }

    debugLog(`CancelJob: Attempting to cancel job ${continuation_id}`);

    // Check if job exists
    const jobState = await asyncJobStore.get(continuation_id);
    if (!jobState) {
      return createToolResponse({
        status: 'not_found',
        message: `Job ${continuation_id} not found. It may have already completed or expired.`,
        continuation_id,
      });
    }

    debugLog(
      `CancelJob: Found job ${continuation_id} with status: ${jobState.status}`,
    );

    // Check if job is in a cancellable state
    const cancellableStatuses = ['queued', 'running'];
    if (!cancellableStatuses.includes(jobState.status)) {
      const message =
        jobState.status === 'cancelled'
          ? `Job ${continuation_id} is already cancelled`
          : `Job ${continuation_id} cannot be cancelled (status: ${jobState.status})`;

      return createToolResponse({
        status: 'not_cancellable',
        message,
        continuation_id,
        current_status: jobState.status,
      });
    }

    // Attempt to cancel the job through JobRunner
    const cancelled = await jobRunner.cancel(continuation_id);

    if (cancelled) {
      debugLog(`CancelJob: Successfully cancelled job ${continuation_id}`);

      // Get updated job state to return current information
      const updatedJobState = await asyncJobStore.get(continuation_id);

      // Calculate actual elapsed time from job creation
      const elapsedMs =
        Date.now() -
        (updatedJobState?.createdAt || jobState.createdAt || Date.now());
      const elapsedSeconds = elapsedMs / 1000;

      // Format elapsed time
      let timeStr;
      if (elapsedSeconds >= 60) {
        const minutes = Math.floor(elapsedSeconds / 60);
        const seconds = Math.round(elapsedSeconds % 60);
        timeStr = `${minutes}m${seconds}s`;
      } else {
        timeStr = `${elapsedSeconds.toFixed(1)}s`;
      }

      // Build human-readable response parts
      const parts = [];

      // Status line with proper timing
      const statusEmoji = '⛔';
      const startTime = updatedJobState?.createdAt
        ? new Date(updatedJobState.createdAt).toLocaleString()
        : 'unknown';

      const modeLabel =
        updatedJobState?.mode ||
        updatedJobState?.tool ||
        jobState.mode ||
        jobState.tool ||
        'UNKNOWN';
      let statusLine = `${statusEmoji} CANCELLED | ${modeLabel.toUpperCase()} | ${continuation_id} | Started: ${startTime} | ${timeStr} elapsed`;

      // Add title if available
      if (updatedJobState?.title) {
        statusLine += ` | "${updatedJobState.title}"`;
      }

      parts.push(statusLine);

      // Add cancellation info
      parts.push(`Cancelled at: ${new Date().toLocaleString()}`);
      parts.push(`Previous status: ${jobState.status}`);

      // Add partial results info if available
      if (updatedJobState?.accumulated_content) {
        const preview =
          updatedJobState.accumulated_content.length > 200
            ? updatedJobState.accumulated_content.substring(0, 200) + '...'
            : updatedJobState.accumulated_content;
        parts.push(`Partial results available: "${preview}"`);
      } else if (updatedJobState?.result) {
        parts.push('Partial results available in job state');
      }

      // Add continuation_id for easy reference
      parts.push(`continuation_id: ${continuation_id}`);

      return createToolResponse({
        content: parts.join('\n'),
        metadata: {
          status: 'cancelled',
          continuation_id,
          cancelled_at: new Date().toISOString(),
          previous_status: jobState.status,
          elapsed_seconds: elapsedSeconds,
          has_partial_results: !!(
            updatedJobState?.result || updatedJobState?.accumulated_content
          ),
        },
      });
    } else {
      debugLog(
        `CancelJob: Failed to cancel job ${continuation_id} - may have completed`,
      );

      // Job may have completed between our checks
      const currentJobState = await asyncJobStore.get(continuation_id);

      return createToolResponse({
        status: 'cancellation_failed',
        message: `Job ${continuation_id} could not be cancelled. It may have completed or failed during the cancellation attempt.`,
        continuation_id,
        current_status: currentJobState?.status || 'unknown',
      });
    }
  } catch (error) {
    debugError(`CancelJob: Error cancelling job ${continuation_id}:`, error);

    return createToolError(`Failed to cancel job ${continuation_id}`, error);
  }
}

// Add metadata for MCP tool registration
cancelJobTool.description = `Cancel a running async job by its continuation_id.

Terminates queued or running jobs with graceful cleanup. Preserves partial results when available.`;

cancelJobTool.inputSchema = CANCEL_JOB_SCHEMA;
