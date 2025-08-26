/**
 * Cancel Job Tool Tests
 *
 * Tests for the cancel_job MCP tool including cancellation scenarios,
 * partial result preservation, and error handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cancelJobTool } from '../../src/tools/cancelJob.js';

describe('Cancel Job Tool', () => {
  let mockJobRunner;
  let mockAsyncJobStore;
  let dependencies;

  beforeEach(() => {
    // Mock JobRunner
    mockJobRunner = {
      cancel: vi.fn()
    };

    // Mock AsyncJobStore
    mockAsyncJobStore = {
      get: vi.fn()
    };

    dependencies = {
      jobRunner: mockJobRunner,
      asyncJobStore: mockAsyncJobStore
    };
  });

  describe('Input Validation', () => {
    it('should return error for missing continuation_id', async () => {
      const result = await cancelJobTool({}, dependencies);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid continuation_id');
    });

    it('should return error for invalid continuation_id type', async () => {
      const result = await cancelJobTool({ continuation_id: 123 }, dependencies);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid continuation_id');
    });

    it('should return error for empty continuation_id', async () => {
      const result = await cancelJobTool({ continuation_id: '' }, dependencies);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid continuation_id');
    });
  });

  describe('Dependency Validation', () => {
    it('should return error when JobRunner is missing', async () => {
      const depsWithoutJobRunner = { asyncJobStore: mockAsyncJobStore };

      const result = await cancelJobTool(
        { continuation_id: 'test-job-123' },
        depsWithoutJobRunner
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('JobRunner not configured');
    });

    it('should return error when AsyncJobStore is missing', async () => {
      const depsWithoutStore = { jobRunner: mockJobRunner };

      const result = await cancelJobTool(
        { continuation_id: 'test-job-123' },
        depsWithoutStore
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('AsyncJobStore not configured');
    });
  });

  describe('Job Not Found', () => {
    it('should handle job not found', async () => {
      mockAsyncJobStore.get.mockResolvedValue(null);

      const result = await cancelJobTool(
        { continuation_id: 'nonexistent-job' },
        dependencies
      );

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('"status": "not_found"');
      expect(result.content[0].text).toContain('Job nonexistent-job not found');
      expect(mockJobRunner.cancel).not.toHaveBeenCalled();
    });
  });

  describe('Job Status Validation', () => {
    it('should not cancel completed job', async () => {
      const jobState = {
        status: 'completed',
        result: { content: 'test result' }
      };
      mockAsyncJobStore.get.mockResolvedValue(jobState);

      const result = await cancelJobTool(
        { continuation_id: 'completed-job' },
        dependencies
      );

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('"status": "not_cancellable"');
      expect(result.content[0].text).toContain('cannot be cancelled');
      expect(result.content[0].text).toContain('"current_status": "completed"');
      expect(mockJobRunner.cancel).not.toHaveBeenCalled();
    });

    it('should not cancel failed job', async () => {
      const jobState = {
        status: 'failed',
        error: 'Test error'
      };
      mockAsyncJobStore.get.mockResolvedValue(jobState);

      const result = await cancelJobTool(
        { continuation_id: 'failed-job' },
        dependencies
      );

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('"status": "not_cancellable"');
      expect(result.content[0].text).toContain('cannot be cancelled');
      expect(result.content[0].text).toContain('"current_status": "failed"');
      expect(mockJobRunner.cancel).not.toHaveBeenCalled();
    });

    it('should handle already cancelled job', async () => {
      const jobState = {
        status: 'cancelled',
        result: null
      };
      mockAsyncJobStore.get.mockResolvedValue(jobState);

      const result = await cancelJobTool(
        { continuation_id: 'already-cancelled' },
        dependencies
      );

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('"status": "not_cancellable"');
      expect(result.content[0].text).toContain('is already cancelled');
      expect(mockJobRunner.cancel).not.toHaveBeenCalled();
    });
  });

  describe('Successful Cancellation', () => {
    it('should cancel queued job successfully', async () => {
      const jobState = { status: 'queued' };
      const updatedJobState = {
        status: 'cancelled',
        result: null
      };

      mockAsyncJobStore.get
        .mockResolvedValueOnce(jobState)
        .mockResolvedValueOnce(updatedJobState);
      mockJobRunner.cancel.mockResolvedValue(true);

      const result = await cancelJobTool(
        { continuation_id: 'queued-job' },
        dependencies
      );

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('"status": "cancelled"');
      expect(result.content[0].text).toContain('successfully cancelled');
      expect(result.content[0].text).toContain('"previous_status": "queued"');
      expect(result.content[0].text).toContain('"has_partial_results": false');

      expect(mockJobRunner.cancel).toHaveBeenCalledWith('queued-job');
    });

    it('should cancel running job successfully', async () => {
      const jobState = { status: 'running' };
      const updatedJobState = {
        status: 'cancelled',
        result: null
      };

      mockAsyncJobStore.get
        .mockResolvedValueOnce(jobState)
        .mockResolvedValueOnce(updatedJobState);
      mockJobRunner.cancel.mockResolvedValue(true);

      const result = await cancelJobTool(
        { continuation_id: 'running-job' },
        dependencies
      );

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('"status": "cancelled"');
      expect(result.content[0].text).toContain('"previous_status": "running"');
      expect(mockJobRunner.cancel).toHaveBeenCalledWith('running-job');
    });
  });

  describe('Partial Result Preservation', () => {
    it('should preserve partial results when available', async () => {
      const jobState = { status: 'running' };
      const partialResult = {
        initial_responses: [
          { model: 'gpt-4', response: 'Partial response from GPT-4' },
          { model: 'claude-3', response: 'Partial response from Claude' }
        ],
        consensus_status: 'partial'
      };
      const updatedJobState = {
        status: 'cancelled',
        result: partialResult
      };

      mockAsyncJobStore.get
        .mockResolvedValueOnce(jobState)
        .mockResolvedValueOnce(updatedJobState);
      mockJobRunner.cancel.mockResolvedValue(true);

      const result = await cancelJobTool(
        { continuation_id: 'job-with-partial-results' },
        dependencies
      );

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('"status": "cancelled"');
      expect(result.content[0].text).toContain('"has_partial_results": true');
      expect(result.content[0].text).toContain('Partial response from GPT-4');
      expect(result.content[0].text).toContain('Partial response from Claude');
      expect(result.content[0].text).toContain('partial');
    });

    it('should handle null partial results', async () => {
      const jobState = { status: 'running' };
      const updatedJobState = {
        status: 'cancelled',
        result: null
      };

      mockAsyncJobStore.get
        .mockResolvedValueOnce(jobState)
        .mockResolvedValueOnce(updatedJobState);
      mockJobRunner.cancel.mockResolvedValue(true);

      const result = await cancelJobTool(
        { continuation_id: 'job-no-partial' },
        dependencies
      );

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('"partial_results": null');
      expect(result.content[0].text).toContain('"has_partial_results": false');
    });
  });

  describe('Cancellation Failures', () => {
    it('should handle cancellation failure', async () => {
      const jobState = { status: 'running' };
      const currentJobState = { status: 'completed' };

      mockAsyncJobStore.get
        .mockResolvedValueOnce(jobState)
        .mockResolvedValueOnce(currentJobState);
      mockJobRunner.cancel.mockResolvedValue(false);

      const result = await cancelJobTool(
        { continuation_id: 'failed-cancel-job' },
        dependencies
      );

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('"status": "cancellation_failed"');
      expect(result.content[0].text).toContain('could not be cancelled');
      expect(result.content[0].text).toContain('"current_status": "completed"');

      expect(mockJobRunner.cancel).toHaveBeenCalledWith('failed-cancel-job');
    });

    it('should handle job completion during cancellation attempt', async () => {
      const jobState = { status: 'running' };
      const currentJobState = { status: 'completed', result: { content: 'Final result' } };

      mockAsyncJobStore.get
        .mockResolvedValueOnce(jobState)
        .mockResolvedValueOnce(currentJobState);
      mockJobRunner.cancel.mockResolvedValue(false);

      const result = await cancelJobTool(
        { continuation_id: 'race-condition-job' },
        dependencies
      );

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('"status": "cancellation_failed"');
      expect(result.content[0].text).toContain('may have completed');
    });
  });

  describe('Error Handling', () => {
    it('should handle job store errors', async () => {
      mockAsyncJobStore.get.mockRejectedValue(new Error('Database connection failed'));

      const result = await cancelJobTool(
        { continuation_id: 'error-job' },
        dependencies
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to cancel job error-job');
      expect(result.content[0].text).toContain('Database connection failed');
    });

    it('should handle job runner errors', async () => {
      const jobState = { status: 'running' };
      mockAsyncJobStore.get.mockResolvedValue(jobState);
      mockJobRunner.cancel.mockRejectedValue(new Error('Job runner internal error'));

      const result = await cancelJobTool(
        { continuation_id: 'runner-error-job' },
        dependencies
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to cancel job runner-error-job');
    });
  });

  describe('Metadata and Response Format', () => {
    it('should include metadata display with execution time', async () => {
      const jobState = { status: 'queued' };
      const updatedJobState = { status: 'cancelled', result: null };

      mockAsyncJobStore.get
        .mockResolvedValueOnce(jobState)
        .mockResolvedValueOnce(updatedJobState);
      mockJobRunner.cancel.mockResolvedValue(true);

      const result = await cancelJobTool(
        { continuation_id: 'metadata-job' },
        dependencies
      );

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('⏱️');
      expect(result.content[0].text).toContain('🚫 Job cancelled');
      expect(result.content[0].text).toContain('"cancelled_at"');
      expect(result.content[0].text).toContain('"continuation_id": "metadata-job"');
    });

    it('should return proper MCP response structure', async () => {
      const jobState = { status: 'running' };
      const updatedJobState = { status: 'cancelled', result: null };

      mockAsyncJobStore.get
        .mockResolvedValueOnce(jobState)
        .mockResolvedValueOnce(updatedJobState);
      mockJobRunner.cancel.mockResolvedValue(true);

      const result = await cancelJobTool(
        { continuation_id: 'structure-job' },
        dependencies
      );

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
      expect(result).toHaveProperty('isError', false);
    });
  });

  describe('Tool Schema Validation', () => {
    it('should have correct tool description', () => {
      expect(cancelJobTool.description).toContain('Cancel a running async job');
      expect(cancelJobTool.description).toContain('continuation_id');
      expect(cancelJobTool.description).toContain('AbortController');
      expect(cancelJobTool.description).toContain('partial results');
    });

    it('should have correct input schema', () => {
      expect(cancelJobTool.inputSchema).toMatchObject({
        type: 'object',
        properties: {
          continuation_id: {
            type: 'string',
            description: expect.stringContaining('continuation_id')
          }
        },
        required: ['continuation_id'],
        additionalProperties: false
      });
    });
  });
});
