/**
 * Format Status Utilities
 *
 * Async formatting functions for job status display with support for
 * AI-generated titles and summaries. Provides enhanced status formatting
 * with backward compatibility.
 */

import { SummarizationService } from '../services/summarizationService.js';
import { debugLog, debugError } from './console.js';
import { JOB_STATUS } from '../async/asyncJobStore.js';

/**
 * Format job list as human-readable text with titles and summaries
 * @param {object} jobsList - Jobs list object with summary
 * @param {object} dependencies - Dependencies object with config and providers
 * @returns {Promise<string>} Human-readable jobs list
 */
export async function formatJobListHumanReadable(jobsList, dependencies = {}) {
  const parts = [];

  // Summary line
  parts.push(`📊 Jobs Summary: ${jobsList.summary.active_jobs} active, ${jobsList.summary.completed_jobs} completed, ${jobsList.summary.failed_jobs} failed`);

  if (jobsList.jobs.length === 0) {
    parts.push('No jobs found.');
    return parts.join('\n');
  }

  parts.push('─'.repeat(80));

  // List each job
  for (const job of jobsList.jobs) {
    const timeStr = job.elapsed_seconds >= 60
      ? `${Math.floor(job.elapsed_seconds / 60)}m${Math.round(job.elapsed_seconds % 60)}s`
      : `${job.elapsed_seconds.toFixed(1)}s`;

    const statusEmoji = {
      'queued': '⏳',
      'running': '🔄',
      'completed': '✅',
      'failed': '❌',
      'cancelled': '⛔',
      'completed_with_errors': '⚠️'
    }[job.status] || '❓';

    const provider = job.provider || (job.tool === 'consensus' ? 'multiple' : 'unknown');

    // Format start time as readable date/time
    const startTime = job.created_at ? new Date(job.created_at).toLocaleString() : 'unknown';

    // Format: emoji STATUS | TOOL | id | sequence | started | time | [progress for consensus only] | provider
    const sequenceStr = '1/1';

    // Build base status line
    let statusLine = `${statusEmoji} ${job.status.toUpperCase()} | ${job.tool.toUpperCase()} | ${job.continuation_id} | ${sequenceStr} | ${startTime} | ${timeStr}`;

    // Add consensus progress if applicable
    if (job.tool === 'consensus' && job.consensus_progress) {
      statusLine += ` | ${job.consensus_progress}`;
    }

    statusLine += ` | ${provider}`;

    // Add title if available
    if (job.title) {
      statusLine += ` | "${job.title}"`;
    }

    parts.push(statusLine);

    // Add final summary snippet for completed jobs
    if (job.status === 'completed' && job.final_summary) {
      // Indent and truncate summary for list view
      const summarySnippet = job.final_summary.length > 100
        ? job.final_summary.substring(0, 100) + '...'
        : job.final_summary;
      parts.push(`  └─ ${summarySnippet}`);
    }
  }

  return parts.join('\n');
}

/**
 * Format job status as human-readable text with on-demand summaries
 * @param {object} jobStatus - Formatted job status object
 * @param {object} options - Formatting options
 * @param {string} options.sequence - Sequence indicator (e.g., '1/5')
 * @param {boolean} options.skipContent - Skip showing full content
 * @param {object} dependencies - Dependencies object with config and providers
 * @returns {Promise<string>} Human-readable status text
 */
export async function formatHumanReadableStatus(jobStatus, options = {}, dependencies = {}) {
  const parts = [];

  // Format elapsed time
  let timeStr;
  if (jobStatus.elapsed_seconds >= 60) {
    const minutes = Math.floor(jobStatus.elapsed_seconds / 60);
    const seconds = Math.round(jobStatus.elapsed_seconds % 60);
    timeStr = `${minutes}m${seconds}s`;
  } else {
    timeStr = `${jobStatus.elapsed_seconds.toFixed(1)}s`;
  }

  // Build status line based on status
  const statusEmoji = {
    'queued': '⏳',
    'running': '🔄',
    'completed': '✅',
    'failed': '❌',
    'cancelled': '⛔',
    'completed_with_errors': '⚠️'
  }[jobStatus.status] || '❓';

  // Format start time as readable date/time
  const startTime = jobStatus.created_at ? new Date(jobStatus.created_at).toLocaleString() : 'unknown';

  // Add sequence info if provided
  const sequenceStr = options.sequence ? ` | ${options.sequence}` : '';

  // Build complete status line with all info
  let statusLine = `${statusEmoji} ${jobStatus.status.toUpperCase()} | ${jobStatus.tool.toUpperCase()} | ${jobStatus.continuation_id}${sequenceStr} | Started: ${startTime} | ${timeStr} elapsed`;

  // Add title if available
  if (jobStatus.title) {
    statusLine += ` | "${jobStatus.title}"`;
  }

  // Add progress for consensus tool only (show x/y format)
  if (jobStatus.tool === 'consensus') {
    if (jobStatus.consensus_progress) {
      statusLine += ` | ${jobStatus.consensus_progress}`;
    } else if (jobStatus.providers) {
      // Calculate progress from provider states
      const providerEntries = Object.entries(jobStatus.providers);
      const completed = providerEntries.filter(([_, state]) =>
        state.status === 'completed' || state.status === 'refined'
      ).length;
      const total = providerEntries.length;
      statusLine += ` | ${completed}/${total} responded`;
    }
    // Add models list for consensus
    if (jobStatus.models_list) {
      statusLine += ` | ${jobStatus.models_list}`;
    }
  } else if (jobStatus.tool === 'chat') {
    // Add provider/model for chat
    if (jobStatus.provider && jobStatus.model) {
      statusLine += ` | ${jobStatus.provider}/${jobStatus.model}`;
    } else if (jobStatus.provider) {
      statusLine += ` | ${jobStatus.provider}`;
    }
  }

  parts.push(statusLine);

  // Generate streaming summary for running jobs if accumulated content available
  if (jobStatus.status === 'running' && jobStatus.accumulated_content) {
    try {
      if (dependencies.config && dependencies.providers) {
        const summarizationService = new SummarizationService(dependencies.providers, dependencies.config);

        // Use accumulated content to infer current focus, or default
        const currentFocus = 'Processing response...';

        // Generate streaming summary
        const streamingSummary = await summarizationService.generateStreamingSummary(
          jobStatus.accumulated_content,
          currentFocus
        );

        if (streamingSummary) {
          parts.push(`Summary: ${streamingSummary}`);
        } else {
          // Fallback: show truncated accumulated content as streaming preview
          const preview = jobStatus.accumulated_content.length > 200
            ? jobStatus.accumulated_content.substring(0, 200) + '...'
            : jobStatus.accumulated_content;
          parts.push(`Streaming: "${preview}"`);
        }
      } else {
        // Fallback when summarization unavailable: show truncated accumulated content
        const preview = jobStatus.accumulated_content.length > 200
          ? jobStatus.accumulated_content.substring(0, 200) + '...'
          : jobStatus.accumulated_content;
        parts.push(`Streaming: "${preview}"`);
      }
    } catch (error) {
      debugError('formatHumanReadableStatus: Failed to generate streaming summary', error);
      // Fall back to showing truncated accumulated content
      const preview = jobStatus.accumulated_content.length > 200
        ? jobStatus.accumulated_content.substring(0, 200) + '...'
        : jobStatus.accumulated_content;
      parts.push(`Streaming: "${preview}"`);
    }
  }

  // Add provider previews for consensus
  if (jobStatus.status === 'running' && jobStatus.provider_previews) {
    const previewCount = Object.keys(jobStatus.provider_previews).length;
    if (previewCount > 0) {
      parts.push(`${previewCount} provider(s) streaming responses...`);
      // Optionally show first provider's preview
      const firstPreview = Object.values(jobStatus.provider_previews)[0];
      if (firstPreview) {
        const truncated = firstPreview.length > 80 ? firstPreview.substring(0, 80) + '...' : firstPreview;
        parts.push(`Preview: "${truncated}"`);
      }
    }
  }

  // Add full result if completed
  if (jobStatus.status === 'completed' && jobStatus.result) {
    // Add continuation_id if present (for multi-step conversations)
    if (jobStatus.result.continuation?.id) {
      parts.push(`\ncontinuation_id: ${jobStatus.result.continuation.id}`);
    } else if (jobStatus.result.continuation_id) {
      parts.push(`\ncontinuation_id: ${jobStatus.result.continuation_id}`);
    }

    // Show final summary if available, otherwise show full content
    if (jobStatus.final_summary) {
      parts.push(`\nSummary: ${jobStatus.final_summary}`);
      // Optionally show full content if not skipped
      if (!options.skipContent && jobStatus.result.content) {
        parts.push(`\nFull Response:\n${jobStatus.result.content}`);
      }
    } else if (jobStatus.result.content) {
      parts.push(`\n${jobStatus.result.content}`);
    }
  }

  // Add error info if failed
  if (jobStatus.status === 'failed' && jobStatus.error) {
    parts.push(`Error: ${jobStatus.error.message || jobStatus.error}`);
  }

  // Add provider details for consensus
  if (jobStatus.providers && Object.keys(jobStatus.providers).length > 0) {
    const providerStatuses = Object.entries(jobStatus.providers)
      .map(([id, state]) => `${id}: ${state.status}`)
      .join(', ');
    parts.push(`Providers: ${providerStatuses}`);
  }

  return parts.join('\n');
}

/**
 * Format job status for client response - includes new metadata fields
 * @param {object} job - Raw job object
 * @param {object} options - Formatting options
 * @returns {object} Formatted job status
 */
export function formatJobStatus(job, options = {}) {
  // Calculate elapsed time
  const now = Date.now();
  const startTime = job.createdAt || now;
  const elapsedMs = now - startTime;
  const elapsedSeconds = elapsedMs / 1000;

  const formatted = {
    continuation_id: job.jobId,
    status: job.status,
    tool: job.tool,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    progress: job.overall?.progress || 0,
    started_at: job.overall?.startedAt || null,
    ended_at: job.overall?.endedAt || null,
    elapsed_seconds: elapsedSeconds,
    provider: job.provider || null,
    model: job.model || null,
    models_list: job.models_list || null,
    consensus_progress: job.consensus_progress || null,
    // Include new metadata fields if present
    accumulated_content: job.accumulated_content || null,
    title: job.title || null,
    final_summary: job.final_summary || null
  };

  // For consensus, gather provider previews
  if (job.tool === 'consensus') {
    const providerPreviews = {};
    for (let i = 0; i < 10; i++) { // Check up to 10 providers
      if (job[`provider_${i}_preview`]) {
        providerPreviews[`provider_${i}`] = job[`provider_${i}_preview`];
      }
    }
    if (Object.keys(providerPreviews).length > 0) {
      formatted.provider_previews = providerPreviews;
    }
  }

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

  // Include output (always included)
  if (job.overall?.result) {
    formatted.result = job.overall.result;

    // Also include metadata from the result if available
    if (job.overall.result.metadata) {
      formatted.metadata = job.overall.result.metadata;
    }
  }

  return formatted;
}

/**
 * Format conversation history for a continuation ID
 * @param {object} jobStatus - Formatted job status object
 * @param {string} continuationId - The continuation ID
 * @param {object} dependencies - Dependencies object with config and providers
 * @returns {Promise<string>} Human-readable conversation history
 */
export async function formatConversationHistory(jobStatus, continuationId, dependencies = {}) {
  const parts = [];

  parts.push(`📊 Conversation History for ${continuationId}:`);
  parts.push('─'.repeat(80));
  parts.push('');

  // For now, show the single job with sequence 1/1
  // TODO: Implement proper conversation tracking when multi-job conversations are supported
  const statusLine = await formatHumanReadableStatus(jobStatus, { sequence: '1/1', skipContent: false }, dependencies);
  parts.push(statusLine);

  return parts.join('\n');
}
