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
  const startTime = Date.now();
  const { continuation_id } = args;

  // Validate dependencies
  if (!dependencies?.jobRunner) {
    debugError('CancelJob: Missing JobRunner dependency');
    return createToolError('Service not available: JobRunner not configured');
  }

  if (!dependencies?.asyncJobStore) {
    debugError('CancelJob: Missing AsyncJobStore dependency');
    return createToolError('Service not available: AsyncJobStore not configured');
  }

  const { jobRunner, asyncJobStore } = dependencies;

  try {
    // Validate continuation_id
    if (!continuation_id || typeof continuation_id !== 'string') {
      return createToolError('Invalid continuation_id: must be a non-empty string');
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

    debugLog(`CancelJob: Found job ${continuation_id} with status: ${jobState.status}`);

    // Check if job is in a cancellable state
    const cancellableStatuses = ['queued', 'running'];
    if (!cancellableStatuses.includes(jobState.status)) {
      const message = jobState.status === 'cancelled'
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

      const executionTime = (Date.now() - startTime) / 1000;
      const metadataDisplay = `⏱️ ${executionTime.toFixed(2)}s | 🚫 Job cancelled`;

      return createToolResponse({
        status: 'cancelled',
        message: `Job ${continuation_id} has been successfully cancelled.`,
        continuation_id,
        cancelled_at: new Date().toISOString(),
        previous_status: jobState.status,
        partial_results: updatedJobState?.result || null,
        metadata_display: metadataDisplay,
        has_partial_results: !!(updatedJobState?.result),
      });
    } else {
      debugLog(`CancelJob: Failed to cancel job ${continuation_id} - may have completed`);

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

    return createToolError(
      `Failed to cancel job ${continuation_id}`,
      error
    );
  }
}

// Add metadata for MCP tool registration
cancelJobTool.description = `Cancel a running async job by its continuation_id.

This tool allows you to cancel jobs that are currently queued or running. It integrates with the JobRunner and provider-level AbortController support to gracefully terminate in-progress LLM requests.

Key features:
- Cancels jobs in 'queued' or 'running' status
- Gracefully terminates streaming requests across all providers
- Preserves partial results for consensus jobs cancelled mid-execution
- Cleans up resources and updates job status to 'cancelled'
- Returns detailed cancellation status and any available partial results

Use this when you need to stop long-running operations or have changed your mind about a request.`;

cancelJobTool.inputSchema = CANCEL_JOB_SCHEMA;