/**
 * FileCache Integration Tests
 *
 * Tests the complete FileCache integration:
 * 1. JobRunner writes to FileCache on completion/failure/cancellation
 * 2. check_status retrieves jobs from FileCache
 * 3. Persistence across restarts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { getFileCache, setFileCache } from '../../../src/async/fileCache.js';
import {
  getAsyncJobStore,
  setAsyncJobStore,
} from '../../../src/async/asyncJobStore.js';
import { getJobRunner, setJobRunner } from '../../../src/async/jobRunner.js';
import { getEventBus } from '../../../src/async/eventBus.js';
import { checkStatusTool } from '../../../src/tools/checkStatus.js';
import { chatTool } from '../../../src/tools/chat.js';
import { loadConfig } from '../../../src/config.js';
import { getProviders } from '../../../src/providers/index.js';
import { getContinuationStore } from '../../../src/continuationStore.js';
import * as contextProcessor from '../../../src/utils/contextProcessor.js';
import { ProviderStreamNormalizer } from '../../../src/async/providerStreamNormalizer.js';
import { hasAnyApiKey } from '../../utils/conditionalTest.js';

describe('FileCache Integration Tests', () => {
  let fileCache;
  let asyncJobStore;
  let jobRunner;
  let eventBus;
  let config;
  let testCacheDir;
  let dependencies;

  beforeEach(async () => {
    // Create a temporary cache directory for testing
    testCacheDir = path.join(os.tmpdir(), `filecache-test-${Date.now()}`);

    // Clear any existing instances
    setFileCache(null);
    setAsyncJobStore(null);
    setJobRunner(null);

    // Initialize components
    config = loadConfig();
    config.summarization = { enabled: true, model: 'gpt-5-nano' };

    // Initialize FileCache with test directory
    fileCache = getFileCache({
      baseDir: testCacheDir,
      maxAge: 3 * 24 * 60 * 60 * 1000, // 3 days
    });

    // Initialize AsyncJobStore
    asyncJobStore = getAsyncJobStore();

    // Initialize EventBus
    eventBus = getEventBus();

    // Initialize JobRunner with FileCache
    jobRunner = getJobRunner({
      asyncJobStore,
      eventBus,
      fileCache, // Pass FileCache to JobRunner
    });

    // Set up dependencies
    const providers = getProviders();
    const continuationStore = getContinuationStore();
    const providerStreamNormalizer = new ProviderStreamNormalizer();

    dependencies = {
      config,
      providers,
      continuationStore,
      contextProcessor,
      asyncJobStore,
      jobRunner,
      fileCache,
      providerStreamNormalizer,
    };
  });

  afterEach(async () => {
    // Clean up
    if (jobRunner) {
      await jobRunner.shutdown();
    }

    // Clean up test cache directory
    if (testCacheDir) {
      try {
        await fs.rm(testCacheDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    // Reset singletons
    setFileCache(null);
    setAsyncJobStore(null);
    setJobRunner(null);
  });

  describe('FileCache Write Operations', () => {
    it('should write snapshot when job completes successfully', async () => {
      // Submit a simple job
      const testJobId = `test_job_${Date.now()}`;
      const jobSpec = {
        tool: 'chat', // Must be 'chat' or 'consensus'
        sessionId: 'test-session',
        options: {
          jobId: testJobId, // Required by JobRunner
          provider: 'openai',
          model: 'gpt-5-nano',
          title: 'Test Job Title',
        },
      };

      const runFunction = async (context) => {
        // Simulate some work
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { success: true, message: 'Job completed' };
      };

      const jobId = await jobRunner.submit(jobSpec, runFunction);

      // Wait for job to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check that snapshot was written to FileCache
      const snapshot = await fileCache.readSnapshot(jobId);
      expect(snapshot).toBeDefined();
      expect(snapshot.jobId).toBe(jobId);
      expect(snapshot.status).toBe('completed');
      expect(snapshot.tool).toBe('chat');
      expect(snapshot.result).toEqual({
        success: true,
        message: 'Job completed',
      });
      expect(snapshot.provider).toBe('openai');
      expect(snapshot.model).toBe('gpt-5-nano');
      expect(snapshot.title).toBe('Test Job Title');
    });

    it('should write snapshot when job fails', async () => {
      const testJobId = `test_fail_${Date.now()}`;
      const jobSpec = {
        tool: 'consensus', // Must be 'chat' or 'consensus'
        sessionId: 'test-session',
        options: {
          jobId: testJobId, // Required by JobRunner
          provider: 'google',
          model: 'gemini-2.5-flash',
          title: 'Test Failed Job',
        },
      };

      const runFunction = async (context) => {
        throw new Error('Simulated job failure');
      };

      const jobId = await jobRunner.submit(jobSpec, runFunction);

      // Wait for job to fail
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check that snapshot was written to FileCache
      const snapshot = await fileCache.readSnapshot(jobId);
      expect(snapshot).toBeDefined();
      expect(snapshot.jobId).toBe(jobId);
      expect(snapshot.status).toBe('failed');
      expect(snapshot.tool).toBe('consensus');
      expect(snapshot.error).toContain('Simulated job failure');
      expect(snapshot.provider).toBe('google');
      expect(snapshot.model).toBe('gemini-2.5-flash');
    });

    it('should write snapshot when job is cancelled', async () => {
      const testJobId = `test_cancel_${Date.now()}`;
      const jobSpec = {
        tool: 'chat', // Must be 'chat' or 'consensus'
        sessionId: 'test-session',
        options: {
          jobId: testJobId, // Required by JobRunner
          provider: 'xai',
          model: 'grok-4',
          title: 'Test Cancelled Job',
        },
      };

      const runFunction = async (context) => {
        // Wait long enough to be cancelled
        await new Promise((resolve, reject) => {
          const checkInterval = setInterval(() => {
            if (context.signal.aborted) {
              clearInterval(checkInterval);
              reject(new Error('Job cancelled'));
            }
          }, 50);
        });
      };

      const jobId = await jobRunner.submit(jobSpec, runFunction);

      // Cancel the job after a short delay
      setTimeout(() => {
        jobRunner.cancel(jobId);
      }, 100);

      // Wait for cancellation to complete
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Check that snapshot was written to FileCache
      const snapshot = await fileCache.readSnapshot(jobId);
      expect(snapshot).toBeDefined();
      expect(snapshot.jobId).toBe(jobId);
      expect(snapshot.status).toBe('cancelled');
      expect(snapshot.tool).toBe('chat');
      expect(snapshot.provider).toBe('xai');
      expect(snapshot.model).toBe('grok-4');
    });
  });

  describe('check_status FileCache Retrieval', () => {
    it('should retrieve completed jobs from FileCache', async () => {
      // Directly write some test snapshots to FileCache
      const testJobs = [
        {
          jobId: 'test_job_1',
          status: 'completed',
          tool: 'chat',
          result: { content: 'Test response 1' },
          completedAt: Date.now() - 10000,
          createdAt: Date.now() - 20000,
          startedAt: Date.now() - 15000,
          provider: 'openai',
          model: 'gpt-5',
          title: 'Test Chat 1',
          final_summary: 'Completed test chat',
        },
        {
          jobId: 'test_job_2',
          status: 'failed',
          tool: 'consensus',
          error: 'Network timeout',
          failedAt: Date.now() - 5000,
          createdAt: Date.now() - 15000,
          startedAt: Date.now() - 10000,
          provider: 'google',
          model: 'gemini-2.5-pro',
          title: 'Test Consensus Failed',
        },
        {
          jobId: 'test_job_3',
          status: 'completed',
          tool: 'chat',
          result: { content: 'Test response 3' },
          completedAt: Date.now() - 30000,
          createdAt: Date.now() - 40000,
          startedAt: Date.now() - 35000,
          provider: 'xai',
          model: 'grok-4',
          title: 'Test Chat 3',
        },
      ];

      // Write snapshots to FileCache
      for (const job of testJobs) {
        await fileCache.writeSnapshot(job.jobId, job);
      }

      // Clear in-memory store to force FileCache retrieval
      // Note: AsyncJobStore doesn't have a clear method, so we'll just rely on it being empty

      // Call check_status without specific continuation_id to list all jobs
      const result = await checkStatusTool({}, dependencies);

      // Parse the result - handle MCP format
      const content = Array.isArray(result.content)
        ? result.content.find((c) => c.type === 'text')?.text || ''
        : result.content;
      expect(content).toContain('test_job_1');
      expect(content).toContain('test_job_2');
      expect(content).toContain('test_job_3');
      expect(content).toContain('Test Chat 1');
      expect(content).toContain('Test Consensus Failed');
      expect(content).toContain('COMPLETED');
      expect(content).toContain('FAILED');
    });

    it('should retrieve specific job from FileCache by continuation_id', async () => {
      const testJob = {
        jobId: 'conv_specific_test',
        status: 'completed',
        tool: 'chat',
        result: {
          content: 'This is a specific test response',
          continuation_id: 'conv_specific_test',
        },
        completedAt: Date.now() - 1000,
        createdAt: Date.now() - 5000,
        startedAt: Date.now() - 4000,
        provider: 'openai',
        model: 'gpt-5',
        title: 'Specific Test Job',
        final_summary: 'Successfully completed specific test',
      };

      // Write snapshot to FileCache
      await fileCache.writeSnapshot(testJob.jobId, testJob);

      // Also add to AsyncJobStore for proper retrieval
      await asyncJobStore.create('chat', {
        sessionId: 'test-session',
        jobId: 'conv_specific_test',
        provider: 'openai',
        model: 'gpt-5',
        title: 'Specific Test Job',
      });
      await asyncJobStore.complete('conv_specific_test', testJob.result);

      // Retrieve specific job by continuation_id
      const result = await checkStatusTool(
        { continuation_id: 'conv_specific_test' },
        dependencies,
      );

      // Check result contains the specific job - handle MCP format
      const content = Array.isArray(result.content)
        ? result.content.find((c) => c.type === 'text')?.text || ''
        : result.content;
      expect(content).toContain('conv_specific_test');
      expect(content).toContain('Specific Test Job');
      expect(content).toContain('COMPLETED');
      // The actual response content should appear after the status line
      expect(content).toContain('This is a specific test response');
    });
  });

  describe('End-to-End Async Flow with FileCache', () => {
    const testWithAnyKey = hasAnyApiKey() ? it : it.skip;

    testWithAnyKey(
      'should persist async chat job to FileCache',
      async () => {
        // Submit an async chat request
        const chatArgs = {
          prompt: 'What is 2+2?',
          async: true,
          models: ['gpt-5-nano'],
        };

        const response = await chatTool(chatArgs, dependencies);

        // Extract continuation_id from response
        // The response.content might be an array in MCP format
        const content = Array.isArray(response.content)
          ? response.content.find((c) => c.type === 'text')?.text || ''
          : response.content;
        expect(content).toContain('continuation_id:');
        const continuationId = content
          .split('continuation_id: ')[1]
          .split('\n')[0]
          .trim();

        // Wait for job to complete or fail
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Check snapshot was written
        const snapshot = await fileCache.readSnapshot(continuationId);
        expect(snapshot).toBeDefined();
        expect(snapshot.jobId).toBe(continuationId);
        expect(snapshot.tool).toBe('chat');
        // Accept both completed and failed status (API might fail)
        expect(['completed', 'failed']).toContain(snapshot.status);

        // Clear in-memory store to test retrieval from FileCache
        // Note: AsyncJobStore doesn't have a clear method, so we'll just rely on it being empty

        // Retrieve from FileCache using check_status
        const statusResult = await checkStatusTool(
          { continuation_id: continuationId },
          dependencies,
        );

        // Handle MCP format
        const statusContent = Array.isArray(statusResult.content)
          ? statusResult.content.find((c) => c.type === 'text')?.text || ''
          : statusResult.content;
        expect(statusContent).toContain(continuationId);
        // Check that the job was persisted (either completed or failed due to API)
        expect(statusContent).toMatch(/COMPLETED|FAILED/);

        // If it failed due to API, verify it's the expected error
        if (statusContent.includes('FAILED')) {
          expect(statusContent).toMatch(/Provider.*not available|API key/);
        }
      },
      10000,
    );

    testWithAnyKey(
      'should list mixed jobs from memory and FileCache',
      async () => {
        // Add some old jobs directly to FileCache
        const oldJobs = [
          {
            jobId: 'old_job_1',
            status: 'completed',
            tool: 'chat',
            result: { content: 'Old job 1' },
            completedAt: Date.now() - 3600000,
            createdAt: Date.now() - 3700000,
            provider: 'openai',
            model: 'gpt-4',
            title: 'Old Chat 1',
          },
          {
            jobId: 'old_job_2',
            status: 'completed',
            tool: 'consensus',
            result: { content: 'Old job 2' },
            completedAt: Date.now() - 7200000,
            createdAt: Date.now() - 7300000,
            provider: 'google',
            model: 'gemini-pro',
            title: 'Old Consensus 2',
          },
        ];

        for (const job of oldJobs) {
          await fileCache.writeSnapshot(job.jobId, job);
        }

        // Submit a new async job
        const chatArgs = {
          prompt: 'What is the weather today?',
          async: true,
          models: ['gpt-5-nano'],
        };

        const response = await chatTool(chatArgs, dependencies);
        // The response.content might be an array in MCP format
        const content = Array.isArray(response.content)
          ? response.content.find((c) => c.type === 'text')?.text || ''
          : response.content;
        const newJobId = content
          .split('continuation_id: ')[1]
          .split('\n')[0]
          .trim();

        // Wait for it to complete
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // List all jobs (should include both memory and FileCache)
        const statusResult = await checkStatusTool({}, dependencies);

        // Handle MCP format
        const statusContent = Array.isArray(statusResult.content)
          ? statusResult.content.find((c) => c.type === 'text')?.text || ''
          : statusResult.content;

        // Should include new job from memory
        expect(statusContent).toContain(newJobId);

        // Should include old jobs from FileCache
        expect(statusContent).toContain('old_job_1');
        expect(statusContent).toContain('old_job_2');
        expect(statusContent).toContain('Old Chat 1');
        expect(statusContent).toContain('Old Consensus 2');
      },
      10000,
    );
  });

  describe('FileCache Directory Structure', () => {
    it('should organize snapshots by date', async () => {
      const testJob = {
        jobId: 'date_test_job',
        status: 'completed',
        tool: 'chat',
        result: { content: 'Test' },
        completedAt: Date.now(),
        createdAt: Date.now() - 1000,
      };

      await fileCache.writeSnapshot(testJob.jobId, testJob);

      // Check directory structure
      const today = new Date().toISOString().split('T')[0];
      const expectedDir = path.join(testCacheDir, today, 'date_test_job');
      const expectedFile = path.join(expectedDir, 'result.json');

      const fileExists = await fs
        .access(expectedFile)
        .then(() => true)
        .catch(() => false);

      expect(fileExists).toBe(true);

      // Read and verify content
      const content = await fs.readFile(expectedFile, 'utf8');
      const snapshot = JSON.parse(content);
      expect(snapshot.jobId).toBe('date_test_job');
      expect(snapshot.status).toBe('completed');
    });

    it('should handle journal events', async () => {
      const jobId = 'journal_test_job';

      // Write journal events
      await fileCache.writeJournalEvent(jobId, {
        type: 'job.started',
        timestamp: Date.now(),
        tool: 'chat',
      });

      await fileCache.writeJournalEvent(jobId, {
        type: 'job.progress',
        timestamp: Date.now(),
        progress: 50,
      });

      await fileCache.writeJournalEvent(jobId, {
        type: 'job.completed',
        timestamp: Date.now(),
        result: 'success',
      });

      // Check journal file exists
      const today = new Date().toISOString().split('T')[0];
      const journalPath = path.join(
        testCacheDir,
        today,
        jobId,
        'journal.ndjson',
      );

      const fileExists = await fs
        .access(journalPath)
        .then(() => true)
        .catch(() => false);

      expect(fileExists).toBe(true);

      // Read and verify NDJSON content
      const content = await fs.readFile(journalPath, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBe(3);

      const firstEvent = JSON.parse(lines[0]);
      expect(firstEvent.type).toBe('job.started');
      expect(firstEvent.tool).toBe('chat');
    });
  });
});
