/**
 * Check Status Tool Fix Tests
 *
 * Tests for the three specific fixes:
 * 1. Provider showing correctly for chat tool (not 'multiple')
 * 2. Elapsed time calculating correctly
 * 3. Human-readable status format
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

describe('Check Status Tool - Fixes', () => {
  let mockAsyncJobStore;
  let mockFileCache;
  let mockConfig;
  let originalDateNow;

  beforeEach(() => {
    // Store original Date.now
    originalDateNow = Date.now;

    // Mock AsyncJobStore
    mockAsyncJobStore = new (class extends AsyncJobStoreInterface {
      get = vi.fn();
      getAllJobs = vi.fn().mockResolvedValue([]);
      getStats = vi.fn().mockResolvedValue({ totalJobs: 0 });
      create = vi.fn();
      update = vi.fn();
      complete = vi.fn();
      fail = vi.fn();
      exists = vi.fn();
      cleanup = vi.fn();
    })();

    // Mock FileCache
    mockFileCache = new (class extends FileCacheInterface {
      readSnapshot = vi.fn();
      writeJournalEvent = vi.fn();
      writeSnapshot = vi.fn();
      cleanup = vi.fn();
      stopCleanupTimer = vi.fn();
    })();

    mockConfig = {};

    // Set mock instances
    setAsyncJobStore(mockAsyncJobStore);
    setFileCache(mockFileCache);
  });

  afterEach(() => {
    // Restore Date.now
    Date.now = originalDateNow;
    vi.clearAllMocks();
  });

  describe('Fix 1: Provider shows correctly for chat tool', () => {
    it('should show the correct provider for a chat job', async () => {
      const jobCreatedAt = 1000000000000;
      const currentTime = jobCreatedAt + 5000; // 5 seconds later

      // Mock Date.now to control time
      Date.now = vi.fn().mockReturnValue(currentTime);

      const mockChatJob = {
        jobId: 'chat-job-123',
        status: JOB_STATUS.RUNNING,
        tool: 'chat',
        createdAt: jobCreatedAt,
        updatedAt: jobCreatedAt + 2000,
        provider: 'openai', // This should be set by the chat tool
        model: 'gpt-5',
        overall: {
          progress: 0.5,
          startedAt: jobCreatedAt + 100,
          endedAt: null,
          result: null,
          error: null,
        },
        providers: new Map(),
        events: [],
        seq: 1,
      };

      mockAsyncJobStore.get.mockResolvedValueOnce(mockChatJob);

      const result = await checkStatusTool(
        { continuation_id: 'chat-job-123' },
        { config: mockConfig },
      );

      expect(result.isError).toBe(false);

      // Parse the human-readable content
      const content = result.content[0].text;

      // Should contain openai/gpt-5
      expect(content).toContain('openai/gpt-5');
      expect(content).not.toContain('multiple');
    });

    it('should show "multiple" for consensus tool', async () => {
      const jobCreatedAt = 1000000000000;
      const currentTime = jobCreatedAt + 5000;

      Date.now = vi.fn().mockReturnValue(currentTime);

      const mockConsensusJob = {
        jobId: 'consensus-job-123',
        status: JOB_STATUS.RUNNING,
        tool: 'consensus',
        createdAt: jobCreatedAt,
        updatedAt: jobCreatedAt + 2000,
        // No provider field for consensus
        overall: {
          progress: 0.5,
          startedAt: jobCreatedAt + 100,
          endedAt: null,
          result: null,
          error: null,
        },
        providers: new Map([
          ['openai', { status: 'running', progress: 0.5 }],
          ['google', { status: 'running', progress: 0.4 }],
        ]),
        events: [],
        seq: 1,
      };

      mockAsyncJobStore.get.mockResolvedValueOnce(mockConsensusJob);

      const result = await checkStatusTool(
        { continuation_id: 'consensus-job-123' },
        { config: mockConfig },
      );

      expect(result.isError).toBe(false);

      const content = result.content[0].text;

      // Should NOT contain 'multiple' anymore - we show actual models
      expect(content).not.toContain('multiple');
      // Should show x/y format instead
      expect(content).toContain('0/2 responded');
      expect(content).toContain('Providers:');
    });
  });

  describe('Fix 2: Elapsed time calculates correctly', () => {
    it('should show correct elapsed time for a running job', async () => {
      const jobCreatedAt = 1000000000000;
      const currentTime = jobCreatedAt + 15300; // 15.3 seconds later

      Date.now = vi.fn().mockReturnValue(currentTime);

      const mockJob = {
        jobId: 'test-job-123',
        status: JOB_STATUS.RUNNING,
        tool: 'chat',
        createdAt: jobCreatedAt,
        updatedAt: jobCreatedAt + 5000,
        provider: 'openai',
        model: 'gpt-5',
        overall: {
          progress: 0.5,
          startedAt: jobCreatedAt + 100,
          endedAt: null,
          result: null,
          error: null,
        },
        providers: new Map(),
        events: [],
        seq: 1,
      };

      mockAsyncJobStore.get.mockResolvedValueOnce(mockJob);

      const result = await checkStatusTool(
        { continuation_id: 'test-job-123' },
        { config: mockConfig },
      );

      expect(result.isError).toBe(false);

      const content = result.content[0].text;

      // Should show 15.3 seconds elapsed
      expect(content).toContain('15.3s elapsed');
    });

    it('should show minutes and seconds for long-running jobs', async () => {
      const jobCreatedAt = 1000000000000;
      const currentTime = jobCreatedAt + 125000; // 125 seconds = 2m5s later

      Date.now = vi.fn().mockReturnValue(currentTime);

      const mockJob = {
        jobId: 'long-job-123',
        status: JOB_STATUS.RUNNING,
        tool: 'consensus',
        createdAt: jobCreatedAt,
        updatedAt: jobCreatedAt + 60000,
        overall: {
          progress: 0.8,
          startedAt: jobCreatedAt + 100,
          endedAt: null,
          result: null,
          error: null,
        },
        providers: new Map(),
        events: [],
        seq: 1,
      };

      mockAsyncJobStore.get.mockResolvedValueOnce(mockJob);

      const result = await checkStatusTool(
        { continuation_id: 'long-job-123' },
        { config: mockConfig },
      );

      expect(result.isError).toBe(false);

      const content = result.content[0].text;

      // Should show 2m5s elapsed
      expect(content).toContain('2m5s elapsed');
    });

    it('should show sub-second time correctly', async () => {
      const jobCreatedAt = 1000000000000;
      const currentTime = jobCreatedAt + 750; // 0.75 seconds later

      Date.now = vi.fn().mockReturnValue(currentTime);

      const mockJob = {
        jobId: 'quick-job-123',
        status: JOB_STATUS.RUNNING,
        tool: 'chat',
        createdAt: jobCreatedAt,
        updatedAt: jobCreatedAt + 500,
        provider: 'openai',
        model: 'gpt-5',
        overall: {
          progress: 0.2,
          startedAt: jobCreatedAt + 50,
          endedAt: null,
          result: null,
          error: null,
        },
        providers: new Map(),
        events: [],
        seq: 1,
      };

      mockAsyncJobStore.get.mockResolvedValueOnce(mockJob);

      const result = await checkStatusTool(
        { continuation_id: 'quick-job-123' },
        { config: mockConfig },
      );

      expect(result.isError).toBe(false);

      const content = result.content[0].text;

      // Should show 0.8s elapsed (rounded)
      expect(content).toContain('0.8s elapsed');
    });
  });

  describe('Fix 3: Human-readable status format', () => {
    it('should format running job status in human-readable format', async () => {
      const jobCreatedAt = 1000000000000;
      const currentTime = jobCreatedAt + 10000;

      Date.now = vi.fn().mockReturnValue(currentTime);

      const mockJob = {
        jobId: 'format-test-123',
        status: JOB_STATUS.RUNNING,
        tool: 'chat',
        createdAt: jobCreatedAt,
        updatedAt: jobCreatedAt + 5000,
        provider: 'openai',
        model: 'gpt-5',
        overall: {
          progress: 0.35,
          startedAt: jobCreatedAt + 100,
          endedAt: null,
          result: null,
          error: null,
        },
        providers: new Map(),
        events: [],
        seq: 1,
      };

      mockAsyncJobStore.get.mockResolvedValueOnce(mockJob);

      const result = await checkStatusTool(
        { continuation_id: 'format-test-123' },
        { config: mockConfig },
      );

      expect(result.isError).toBe(false);

      const content = result.content[0].text;

      // Should be human-readable, not JSON
      expect(content).not.toContain('{');
      expect(content).not.toContain('}');
      expect(content).not.toContain('"continuation_id"');

      // Should contain readable status elements
      expect(content).toContain('🔄 RUNNING');
      expect(content).toContain('10.0s elapsed');
      // No percentage for chat tool anymore
      expect(content).not.toContain('35% complete');
      expect(content).toContain('openai/gpt-5');
    });

    it('should format completed job with full response content', async () => {
      const jobCreatedAt = 1000000000000;
      const currentTime = jobCreatedAt + 25000;

      Date.now = vi.fn().mockReturnValue(currentTime);

      const longResponse =
        'This is a very long response that should be truncated in the status display to avoid overwhelming the user with too much text content in a status check';

      const mockJob = {
        jobId: 'completed-job-123',
        status: JOB_STATUS.COMPLETED,
        tool: 'chat',
        createdAt: jobCreatedAt,
        updatedAt: jobCreatedAt + 24000,
        provider: 'google',
        model: 'gemini-2.5-pro',
        overall: {
          progress: 1.0,
          startedAt: jobCreatedAt + 100,
          endedAt: jobCreatedAt + 24000,
          result: {
            content: longResponse,
            metadata: { tokens: 150 },
          },
          error: null,
        },
        providers: new Map(),
        events: [],
        seq: 5,
      };

      mockAsyncJobStore.get.mockResolvedValueOnce(mockJob);

      const result = await checkStatusTool(
        { continuation_id: 'completed-job-123' },
        { config: mockConfig },
      );

      expect(result.isError).toBe(false);

      const content = result.content[0].text;

      // Should show completed status
      expect(content).toContain('✅ COMPLETED');
      // No percentage for chat tool
      expect(content).not.toContain('100% complete');

      // Should show full response content
      expect(content).toContain(longResponse); // Full response should be shown
    });

    it('should format failed job with error message', async () => {
      const jobCreatedAt = 1000000000000;
      const currentTime = jobCreatedAt + 5000;

      Date.now = vi.fn().mockReturnValue(currentTime);

      const mockJob = {
        jobId: 'failed-job-123',
        status: JOB_STATUS.FAILED,
        tool: 'chat',
        createdAt: jobCreatedAt,
        updatedAt: jobCreatedAt + 4500,
        provider: 'openai',
        model: 'gpt-5',
        overall: {
          progress: 0.15,
          startedAt: jobCreatedAt + 100,
          endedAt: jobCreatedAt + 4500,
          result: null,
          error: {
            message: 'API rate limit exceeded',
            code: 'RATE_LIMIT',
          },
        },
        providers: new Map(),
        events: [],
        seq: 3,
      };

      mockAsyncJobStore.get.mockResolvedValueOnce(mockJob);

      const result = await checkStatusTool(
        { continuation_id: 'failed-job-123' },
        { config: mockConfig },
      );

      expect(result.isError).toBe(false);

      const content = result.content[0].text;

      // Should show failed status
      expect(content).toContain('❌ FAILED');

      // Should show error message
      expect(content).toContain('Error: API rate limit exceeded');
    });

    it('should format consensus job with provider details', async () => {
      const jobCreatedAt = 1000000000000;
      const currentTime = jobCreatedAt + 30000;

      Date.now = vi.fn().mockReturnValue(currentTime);

      const mockJob = {
        jobId: 'consensus-format-123',
        status: JOB_STATUS.RUNNING,
        tool: 'consensus',
        createdAt: jobCreatedAt,
        updatedAt: jobCreatedAt + 25000,
        overall: {
          progress: 0.6,
          startedAt: jobCreatedAt + 100,
          endedAt: null,
          result: null,
          error: null,
        },
        providers: new Map([
          [
            'openai',
            {
              status: 'completed',
              progress: 1.0,
              updatedAt: jobCreatedAt + 20000,
            },
          ],
          [
            'google',
            {
              status: 'running',
              progress: 0.8,
              updatedAt: jobCreatedAt + 25000,
            },
          ],
          [
            'xai',
            {
              status: 'failed',
              progress: 0.0,
              updatedAt: jobCreatedAt + 15000,
            },
          ],
        ]),
        events: [],
        seq: 10,
      };

      mockAsyncJobStore.get.mockResolvedValueOnce(mockJob);

      const result = await checkStatusTool(
        { continuation_id: 'consensus-format-123' },
        { config: mockConfig },
      );

      expect(result.isError).toBe(false);

      const content = result.content[0].text;

      // Should NOT show 'multiple' - shows x/y format instead
      expect(content).not.toContain('multiple');
      expect(content).toContain('1/3 responded');

      // Should list provider statuses
      expect(content).toContain('Providers:');
      expect(content).toContain('openai: completed');
      expect(content).toContain('google: running');
      expect(content).toContain('xai: failed');
    });
  });

  describe('Integration: All fixes work together', () => {
    it('should correctly handle a real chat job scenario', async () => {
      const jobCreatedAt = Date.now() - 8500; // 8.5 seconds ago

      const mockJob = {
        jobId: 'real-chat-job',
        status: JOB_STATUS.RUNNING,
        tool: 'chat',
        createdAt: jobCreatedAt,
        updatedAt: jobCreatedAt + 5000,
        provider: 'openai',
        model: 'gpt-5',
        overall: {
          progress: 0.75,
          startedAt: jobCreatedAt + 50,
          endedAt: null,
          result: null,
          error: null,
        },
        providers: new Map(),
        events: [],
        seq: 8,
      };

      mockAsyncJobStore.get.mockResolvedValueOnce(mockJob);

      const result = await checkStatusTool(
        { continuation_id: 'real-chat-job' },
        { config: mockConfig },
      );

      expect(result.isError).toBe(false);

      const content = result.content[0].text;

      // All three fixes should work together:
      // 1. Provider should be openai, not multiple
      expect(content).toContain('openai/gpt-5');
      expect(content).not.toContain('multiple');

      // 2. Elapsed time should be around 8.5s
      expect(content).toMatch(/8\.\ds elapsed/);

      // 3. Format should be human-readable
      expect(content).toContain('🔄 RUNNING');
      // No percentage for chat tool
      expect(content).not.toContain('75% complete');
      expect(content).not.toContain('"jobId"');
      expect(content).not.toContain('{');
    });
  });
});
