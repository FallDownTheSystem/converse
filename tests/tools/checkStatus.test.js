/**
 * Check Status Tool Tests
 *
 * Comprehensive tests for the check_status MCP tool, including job querying,
 * session filtering, incremental polling, and error handling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkStatusTool } from '../../src/tools/checkStatus.js';
import {
  getAsyncJobStore,
  JOB_STATUS,
  setAsyncJobStore,
  AsyncJobStoreInterface,
} from '../../src/async/asyncJobStore.js';
import {
  getFileCache,
  setFileCache,
  FileCacheInterface,
} from '../../src/async/fileCache.js';
import { parseStatusResponse } from '../utils/responseParser.js';

describe('Check Status Tool', () => {
  let mockAsyncJobStore;
  let mockFileCache;
  let mockConfig;
  let mockRequest;

  beforeEach(() => {
    // Mock AsyncJobStore that extends AsyncJobStoreInterface
    mockAsyncJobStore = new (class extends AsyncJobStoreInterface {
      get = vi.fn();
      getJobsBySession = vi.fn();
      getAllJobs = vi.fn().mockResolvedValue([]);
      getStats = vi.fn().mockResolvedValue({ totalJobs: 0 });
      create = vi.fn();
      update = vi.fn();
      complete = vi.fn();
      fail = vi.fn();
      exists = vi.fn();
      cleanup = vi.fn();
    })();

    // Mock FileCache that extends FileCacheInterface
    mockFileCache = new (class extends FileCacheInterface {
      readSnapshot = vi.fn();
      writeJournalEvent = vi.fn();
      writeSnapshot = vi.fn();
      cleanup = vi.fn();
      stopCleanupTimer = vi.fn();
    })();

    // Mock config and request
    mockConfig = {};
    mockRequest = {
      headers: {
        'mcp-session-id': 'test-session-123',
      },
    };

    // Set mock instances
    setAsyncJobStore(mockAsyncJobStore);
    setFileCache(mockFileCache);
  });

  afterEach(() => {
    // Reset to default instances
    setAsyncJobStore(null);
    setFileCache(null);
  });

  describe('Input Validation', () => {
    // Session ID is no longer required - using 'local-user' for single-user local server
    it.skip('should require session ID (deprecated - now using local-user)', async () => {
      const result = await checkStatusTool(
        {},
        {
          config: mockConfig,
          request: { headers: {} },
        },
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Session ID is required');
    });

    it('should validate continuation_id type', async () => {
      const result = await checkStatusTool(
        { continuation_id: 123 },
        { config: mockConfig, request: mockRequest },
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'continuation_id must be a string',
      );
    });

    // Tests for deprecated parameters removed - since_seq, max_results, include_events no longer supported
  });

  describe('Specific Job Queries', () => {
    const mockJob = {
      jobId: 'job_test123',
      sessionId: 'local-user',
      status: JOB_STATUS.RUNNING,
      tool: 'chat',
      createdAt: Date.now() - 60000,
      updatedAt: Date.now(),
      overall: {
        progress: 0.5,
        startedAt: Date.now() - 30000,
        endedAt: null,
        result: null,
        error: null,
      },
      providers: new Map([
        ['openai', { status: 'running', progress: 0.5, updatedAt: Date.now() }],
      ]),
      events: [
        {
          seq: 1,
          timestamp: Date.now() - 30000,
          type: 'job_started',
          data: {},
        },
      ],
      seq: 1,
    };

    it('should query specific job from memory store', async () => {
      mockAsyncJobStore.get.mockResolvedValue(mockJob);

      const result = await checkStatusTool(
        { continuation_id: 'job_test123' },
        { config: mockConfig, request: mockRequest },
      );

      expect(result.isError).toBe(false);
      expect(mockAsyncJobStore.get).toHaveBeenCalledWith('job_test123');

      // Parse human-readable format
      const text = result.content[0].text;
      const response = parseStatusResponse(text);
      expect(response.continuation_id).toBe('job_test123');
      expect(response.status).toBe('running');
      // Progress is no longer shown for chat tool
    });

    it('should fallback to file cache for completed jobs', async () => {
      const completedJob = { ...mockJob, status: JOB_STATUS.COMPLETED };
      mockAsyncJobStore.get.mockResolvedValue(null);
      mockFileCache.readSnapshot.mockResolvedValue(completedJob);

      const result = await checkStatusTool(
        { continuation_id: 'job_test123' },
        { config: mockConfig, request: mockRequest },
      );

      expect(result.isError).toBe(false);
      expect(mockAsyncJobStore.get).toHaveBeenCalledWith('job_test123');
      expect(mockFileCache.readSnapshot).toHaveBeenCalledWith('job_test123');

      // Parse human-readable format
      const text = result.content[0].text;
      const response = parseStatusResponse(text);
      expect(response.continuation_id).toBe('job_test123');
      expect(response.status).toBe('completed');
    });

    it('should return job regardless of sessionId (single-user local server)', async () => {
      // In single-user local server, all jobs use 'local-user' sessionId
      const job = { ...mockJob, sessionId: 'local-user' };
      mockAsyncJobStore.get.mockResolvedValue(job);

      const result = await checkStatusTool(
        { continuation_id: 'job_test123' },
        { config: mockConfig, request: mockRequest },
      );

      // Should return the job since we don't enforce session ownership
      expect(result.isError).toBe(false);
      const text = result.content[0].text;
      const response = parseStatusResponse(text);
      expect(response.continuation_id).toBe('job_test123');
      expect(response.status).toBe('running');
    });

    it('should handle job not found', async () => {
      mockAsyncJobStore.get.mockResolvedValue(null);
      mockFileCache.readSnapshot.mockResolvedValue(null);

      const result = await checkStatusTool(
        { continuation_id: 'nonexistent_job' },
        { config: mockConfig, request: mockRequest },
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Job not found or access denied',
      );
    });
  });

  describe('Session Job Listing', () => {
    const mockJobs = [
      {
        jobId: 'job_1',
        sessionId: 'local-user',
        status: JOB_STATUS.RUNNING,
        tool: 'chat',
        createdAt: Date.now() - 120000,
        updatedAt: Date.now() - 60000,
        overall: { progress: 0.3 },
        providers: new Map(),
        events: [],
        seq: 0,
      },
      {
        jobId: 'job_2',
        sessionId: 'local-user',
        status: JOB_STATUS.COMPLETED,
        tool: 'consensus',
        createdAt: Date.now() - 60000,
        updatedAt: Date.now(),
        overall: { progress: 1.0 },
        providers: new Map(),
        events: [],
        seq: 0,
      },
    ];

    it('should list all jobs for session', async () => {
      mockAsyncJobStore.getAllJobs.mockResolvedValue(mockJobs);

      const result = await checkStatusTool(
        {},
        { config: mockConfig, request: mockRequest },
      );

      expect(result.isError).toBe(false);
      expect(mockAsyncJobStore.getAllJobs).toHaveBeenCalledWith({
        limit: 10,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      });

      // Parse human-readable job list
      const text = result.content[0].text;
      // Check for summary line
      expect(text).toContain('Jobs Summary');
      expect(text).toContain('1 active');
      expect(text).toContain('1 completed');
    });

    it('should return 10 most recent jobs by default', async () => {
      mockAsyncJobStore.getAllJobs.mockResolvedValue([mockJobs[0]]);

      const result = await checkStatusTool(
        {},
        { config: mockConfig, request: mockRequest },
      );

      expect(result.isError).toBe(false);
      expect(mockAsyncJobStore.getAllJobs).toHaveBeenCalledWith({
        limit: 10,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      });

      // Parse human-readable job list
      const text = result.content[0].text;
      expect(text).toContain('Jobs Summary');
      expect(text).toContain('RUNNING | CHAT | job_1');
    });

    it('should handle empty job list', async () => {
      mockAsyncJobStore.getAllJobs.mockResolvedValue([]);

      const result = await checkStatusTool(
        {},
        { config: mockConfig, request: mockRequest },
      );

      expect(result.isError).toBe(false);

      // Parse human-readable job list
      const text = result.content[0].text;
      expect(text).toContain('Jobs Summary: 0 jobs');
      expect(text).toContain('No jobs found');
    });
  });

  describe('Response Formatting', () => {
    const mockJob = {
      jobId: 'job_test123',
      sessionId: 'local-user',
      status: JOB_STATUS.COMPLETED,
      tool: 'chat',
      createdAt: Date.now() - 120000,
      updatedAt: Date.now(),
      overall: {
        progress: 1.0,
        startedAt: Date.now() - 120000,
        endedAt: Date.now(),
        result: { content: 'Test response' },
        error: null,
      },
      providers: new Map([
        [
          'openai',
          { status: 'completed', progress: 1.0, updatedAt: Date.now() },
        ],
      ]),
      events: [
        {
          seq: 1,
          timestamp: Date.now() - 120000,
          type: 'job_started',
          data: {},
        },
        { seq: 2, timestamp: Date.now(), type: 'job_completed', data: {} },
      ],
      seq: 2,
    };

    it('should always include result (output always enabled)', async () => {
      mockAsyncJobStore.get.mockResolvedValue(mockJob);

      const result = await checkStatusTool(
        { continuation_id: 'job_test123' },
        { config: mockConfig, request: mockRequest },
      );

      expect(result.isError).toBe(false);

      // Parse human-readable format
      const text = result.content[0].text;
      // Check for response content in completed jobs
      expect(text).toContain('Test response');
    });

    it('should include provider details', async () => {
      mockAsyncJobStore.get.mockResolvedValue(mockJob);

      const result = await checkStatusTool(
        { continuation_id: 'job_test123' },
        { config: mockConfig, request: mockRequest },
      );

      expect(result.isError).toBe(false);

      // Parse human-readable format
      const text = result.content[0].text;
      // Provider details shown in consensus tool format
      expect(text).toContain('Providers: openai: completed');
    });
  });

  describe('Error Handling', () => {
    it('should handle AsyncJobStore errors gracefully', async () => {
      mockAsyncJobStore.get.mockRejectedValue(new Error('Store error'));

      const result = await checkStatusTool(
        { continuation_id: 'job_test123' },
        { config: mockConfig, request: mockRequest },
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to check job status');
    });

    it('should handle FileCache errors gracefully', async () => {
      mockAsyncJobStore.get.mockResolvedValue(null);
      mockFileCache.readSnapshot.mockRejectedValue(new Error('Cache error'));

      const result = await checkStatusTool(
        { continuation_id: 'job_test123' },
        { config: mockConfig, request: mockRequest },
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to check job status');
    });
  });

  describe('Tool Metadata', () => {
    it('should have correct tool description', () => {
      expect(checkStatusTool.description).toContain(
        'Check the status and progress of async jobs',
      );
    });

    it('should have valid input schema', () => {
      const schema = checkStatusTool.inputSchema;

      expect(schema.type).toBe('object');
      expect(schema.properties.continuation_id).toBeDefined();
      // Deprecated parameters should no longer exist
      expect(schema.properties.since_seq).toBeUndefined();
      expect(schema.properties.include_events).toBeUndefined();
      expect(schema.properties.max_results).toBeUndefined();
    });
  });
});
