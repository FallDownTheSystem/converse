/**
 * Check Status Tool Improvements Tests
 *
 * Tests for the new improvements:
 * 1. No progress percentage for chat tool
 * 2. x/y format for consensus progress
 * 3. Models list instead of 'multiple' for consensus
 * 4. Streaming preview capability
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

describe('Check Status Tool - Improvements', () => {
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

  describe('Chat Tool: No Progress Percentage', () => {
    it('should not show progress percentage for chat tool', async () => {
      const jobCreatedAt = 1000000000000;
      const currentTime = jobCreatedAt + 5000;

      Date.now = vi.fn().mockReturnValue(currentTime);

      const mockChatJob = {
        jobId: 'chat-job-123',
        status: JOB_STATUS.RUNNING,
        tool: 'chat',
        createdAt: jobCreatedAt,
        updatedAt: jobCreatedAt + 2000,
        provider: 'openai',
        model: 'gpt-5',
        accumulated_content:
          'The capital of France is Paris, which is located...',
        overall: {
          progress: 0.5, // This should be ignored for chat
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

      const content = result.content[0].text;

      // Should NOT contain percentage
      expect(content).not.toContain('%');
      expect(content).not.toContain('50%');

      // Should show tool name and continuation ID
      expect(content).toContain('CHAT');
      expect(content).toContain('chat-job-123');

      // Should show streaming preview
      expect(content).toContain('Streaming: "The capital of France is Paris');

      // Should show provider/model
      expect(content).toContain('openai/gpt-5');
    });
  });

  describe('Consensus Tool: x/y Progress Format', () => {
    it('should show x/y initial format during initial phase', async () => {
      const jobCreatedAt = 1000000000000;
      const currentTime = jobCreatedAt + 5000;

      Date.now = vi.fn().mockReturnValue(currentTime);

      const mockConsensusJob = {
        jobId: 'consensus-job-123',
        status: JOB_STATUS.RUNNING,
        tool: 'consensus',
        createdAt: jobCreatedAt,
        updatedAt: jobCreatedAt + 2000,
        models_list: 'gpt-5, gemini-2.5-pro, grok-4',
        consensus_progress: '2/3 initial',
        overall: {
          progress: 0.67,
          startedAt: jobCreatedAt + 100,
          endedAt: null,
          result: null,
          error: null,
        },
        providers: new Map([
          ['openai', { status: 'completed', progress: 1.0 }],
          ['google', { status: 'completed', progress: 1.0 }],
          ['xai', { status: 'running', progress: 0.5 }],
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

      // Should show tool name and continuation ID
      expect(content).toContain('CONSENSUS');
      expect(content).toContain('consensus-job-123');

      // Should show x/y format
      expect(content).toContain('2/3 initial');

      // Should NOT show percentage
      expect(content).not.toContain('67%');
    });

    it('should show x/y refined format during refinement phase', async () => {
      const jobCreatedAt = 1000000000000;
      const currentTime = jobCreatedAt + 10000;

      Date.now = vi.fn().mockReturnValue(currentTime);

      const mockConsensusJob = {
        jobId: 'consensus-job-456',
        status: JOB_STATUS.RUNNING,
        tool: 'consensus',
        createdAt: jobCreatedAt,
        updatedAt: jobCreatedAt + 8000,
        models_list: 'gpt-5, gemini-2.5-pro',
        consensus_progress: '1/2 refined',
        overall: {
          progress: 0.5,
          startedAt: jobCreatedAt + 100,
          endedAt: null,
          result: null,
          error: null,
        },
        providers: new Map([
          ['openai', { status: 'refined', progress: 1.0 }],
          ['google', { status: 'refining', progress: 0.8 }],
        ]),
        events: [],
        seq: 1,
      };

      mockAsyncJobStore.get.mockResolvedValueOnce(mockConsensusJob);

      const result = await checkStatusTool(
        { continuation_id: 'consensus-job-456' },
        { config: mockConfig },
      );

      expect(result.isError).toBe(false);

      const content = result.content[0].text;

      // Should show x/y refined format
      expect(content).toContain('1/2 refined');
    });
  });

  describe('Consensus Tool: Models List Display', () => {
    it('should show list of models instead of "multiple"', async () => {
      const jobCreatedAt = 1000000000000;
      const currentTime = jobCreatedAt + 5000;

      Date.now = vi.fn().mockReturnValue(currentTime);

      const mockConsensusJob = {
        jobId: 'consensus-list-123',
        status: JOB_STATUS.RUNNING,
        tool: 'consensus',
        createdAt: jobCreatedAt,
        updatedAt: jobCreatedAt + 2000,
        models_list: 'gpt-5, gemini-2.5-pro, grok-4, o4-mini',
        consensus_progress: '3/4 initial',
        overall: {
          progress: 0.75,
          startedAt: jobCreatedAt + 100,
          endedAt: null,
          result: null,
          error: null,
        },
        providers: new Map(),
        events: [],
        seq: 1,
      };

      mockAsyncJobStore.get.mockResolvedValueOnce(mockConsensusJob);

      const result = await checkStatusTool(
        { continuation_id: 'consensus-list-123' },
        { config: mockConfig },
      );

      expect(result.isError).toBe(false);

      const content = result.content[0].text;

      // Should show the actual models list
      expect(content).toContain('gpt-5, gemini-2.5-pro, grok-4, o4-mini');

      // Should NOT show "multiple"
      expect(content).not.toContain('multiple');
    });
  });

  describe('Streaming Preview Capability', () => {
    it('should show streaming preview for chat tool', async () => {
      const jobCreatedAt = 1000000000000;
      const currentTime = jobCreatedAt + 3000;

      Date.now = vi.fn().mockReturnValue(currentTime);

      const mockChatJob = {
        jobId: 'chat-stream-123',
        status: JOB_STATUS.RUNNING,
        tool: 'chat',
        createdAt: jobCreatedAt,
        updatedAt: jobCreatedAt + 2500,
        provider: 'openai',
        model: 'gpt-5',
        accumulated_content:
          'To implement a binary search tree in Python, you would start by defining a Node class that has a value and pointers to left and right children. Then you would create a BST class with methods for insertion, searching, and traversal...',
        overall: {
          progress: 0.3,
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
        { continuation_id: 'chat-stream-123' },
        { config: mockConfig },
      );

      expect(result.isError).toBe(false);

      const content = result.content[0].text;

      // Should show streaming preview
      expect(content).toContain('Streaming: "');
      expect(content).toContain('To implement a binary search tree');
      expect(content).toContain('...');
    });

    it('should show provider previews for consensus tool', async () => {
      const jobCreatedAt = 1000000000000;
      const currentTime = jobCreatedAt + 5000;

      Date.now = vi.fn().mockReturnValue(currentTime);

      const mockConsensusJob = {
        jobId: 'consensus-preview-123',
        status: JOB_STATUS.RUNNING,
        tool: 'consensus',
        createdAt: jobCreatedAt,
        updatedAt: jobCreatedAt + 4000,
        models_list: 'gpt-5, gemini-2.5-pro',
        consensus_progress: '2/2 initial',
        provider_0_preview:
          'The best approach would be to use a microservices architecture because it provides better scalability and maintainability...',
        provider_1_preview:
          'I recommend considering a monolithic architecture initially, as it simplifies development and deployment for smaller teams...',
        overall: {
          progress: 1.0,
          startedAt: jobCreatedAt + 100,
          endedAt: null,
          result: null,
          error: null,
        },
        providers: new Map([
          ['openai', { status: 'completed', progress: 1.0 }],
          ['google', { status: 'completed', progress: 1.0 }],
        ]),
        events: [],
        seq: 1,
      };

      mockAsyncJobStore.get.mockResolvedValueOnce(mockConsensusJob);

      const result = await checkStatusTool(
        { continuation_id: 'consensus-preview-123' },
        { config: mockConfig },
      );

      expect(result.isError).toBe(false);

      const content = result.content[0].text;

      // Should show provider streaming info
      expect(content).toContain('2 provider(s) streaming responses');

      // Should show a preview from one of the providers
      expect(content).toContain('Preview: "');
      // Should be truncated to 80 chars
      expect(content.match(/Preview: "[^"]+"/)[0].length).toBeLessThanOrEqual(
        100,
      );
    });
  });
});
