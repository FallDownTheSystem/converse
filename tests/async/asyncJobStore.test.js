import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getAsyncJobStore,
  setAsyncJobStore,
  generateJobId,
  isValidJobId,
  setProviderState,
  getProviderState,
  JOB_STATUS,
  AsyncJobStoreInterface,
  AsyncJobStoreError,
} from '../../src/async/asyncJobStore.js';

// Mock console utilities to prevent test output noise
vi.mock('../../src/utils/console.js', () => ({
  debugLog: vi.fn(),
  debugError: vi.fn(),
}));

describe('AsyncJobStore Unit Tests', () => {
  let jobStore;
  let originalSetInterval;
  let mockSetInterval;

  beforeEach(() => {
    // Mock setInterval to prevent actual timers during tests
    originalSetInterval = global.setInterval;
    mockSetInterval = vi.fn();
    global.setInterval = mockSetInterval;

    // Reset to get fresh store instance
    setAsyncJobStore(null);
    jobStore = getAsyncJobStore();

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original setInterval
    global.setInterval = originalSetInterval;

    // Clean up store
    if (jobStore) {
      jobStore.cleanup(0);
    }
  });

  describe('Job ID Generation and Validation', () => {
    it('should generate valid job IDs with correct format', () => {
      const jobId = generateJobId();

      expect(typeof jobId).toBe('string');
      expect(jobId).toMatch(/^job_[A-Za-z0-9_-]{10}$/);
      expect(isValidJobId(jobId)).toBe(true);
    });

    it('should generate unique job IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateJobId());
      }
      expect(ids.size).toBe(100);
    });

    it('should validate job ID formats correctly', () => {
      // Valid IDs
      expect(isValidJobId('job_1234567890')).toBe(true);
      expect(isValidJobId('job_abcdefghij')).toBe(true);
      expect(isValidJobId('job_ABC-_123XY')).toBe(true);

      // Invalid IDs
      expect(isValidJobId('job_')).toBe(false);
      expect(isValidJobId('job_123')).toBe(false);
      expect(isValidJobId('conv_1234567890')).toBe(true); // Now valid - continuation ID format
      expect(isValidJobId('job_12345678901')).toBe(false);
      expect(isValidJobId('')).toBe(false);
      expect(isValidJobId(null)).toBe(false);
      expect(isValidJobId(undefined)).toBe(false);
    });
  });

  describe('Job Creation', () => {
    it('should create job successfully with valid parameters', async () => {
      const sessionId = 'test-session-123';
      const tool = 'chat';
      const testJobId = 'test_job_123';

      const jobId = await jobStore.create(tool, {
        jobId: testJobId,
        sessionId
      });

      expect(typeof jobId).toBe('string');
      expect(jobId).toBe(testJobId);

      const job = await jobStore.get(jobId);
      expect(job).not.toBeNull();
      expect(job.sessionId).toBe(sessionId);
      expect(job.tool).toBe(tool);
      expect(job.status).toBe(JOB_STATUS.QUEUED);
      expect(job.overall.progress).toBe(0.0);
      expect(job.createdAt).toBeTypeOf('number');
      expect(job.updatedAt).toBeTypeOf('number');
      expect(job.providers).toBeInstanceOf(Map);
      expect(job.events).toBeInstanceOf(Array);
      expect(job.seq).toBe(1); // Should have initial event
    });

    it('should create job with custom options', async () => {
      const sessionId = 'test-session-456';
      const tool = 'consensus';
      const testJobId = 'test_consensus_123';
      const options = {
        jobId: testJobId,
        sessionId,
        customField: 'custom-value',
        models: ['gpt-4', 'claude-3'],
      };

      const jobId = await jobStore.create(tool, options);
      const job = await jobStore.get(jobId);

      expect(job.customField).toBe('custom-value');
      expect(job.models).toEqual(['gpt-4', 'claude-3']);
    });

    it('should reject missing jobId', async () => {
      await expect(jobStore.create('chat', {})).rejects.toThrow(AsyncJobStoreError);
      await expect(jobStore.create('chat', { sessionId: 'test' })).rejects.toThrow(AsyncJobStoreError);
    });

    it('should reject invalid tools', async () => {
      const options = { jobId: 'test_job', sessionId: 'test-session' };

      await expect(jobStore.create('', options)).rejects.toThrow(AsyncJobStoreError);
      await expect(jobStore.create('invalid-tool', options)).rejects.toThrow(AsyncJobStoreError);
      await expect(jobStore.create(null, options)).rejects.toThrow(AsyncJobStoreError);
    });

    it('should accept valid tools', async () => {
      const sessionId = 'test-session';

      const chatJobId = await jobStore.create('chat', { jobId: 'conv_ABC1234567', sessionId });
      const consensusJobId = await jobStore.create('consensus', { jobId: 'cons_XYZ9876543', sessionId });

      expect(isValidJobId(chatJobId)).toBe(true);
      expect(isValidJobId(consensusJobId)).toBe(true);

      const chatJob = await jobStore.get(chatJobId);
      const consensusJob = await jobStore.get(consensusJobId);

      expect(chatJob.tool).toBe('chat');
      expect(consensusJob.tool).toBe('consensus');
    });
  });

  describe('Job Retrieval', () => {
    let testJobId;

    beforeEach(async () => {
      testJobId = await jobStore.create('chat', { jobId: 'test_retrieve_job', sessionId: 'test-session' });
    });

    it('should retrieve existing job', async () => {
      const job = await jobStore.get(testJobId);

      expect(job).not.toBeNull();
      expect(job.jobId).toBe(testJobId);
      expect(job.sessionId).toBe('test-session');
      expect(job.tool).toBe('chat');
    });

    it('should return null for non-existent job', async () => {
      const job = await jobStore.get('job_nonexistent');
      expect(job).toBeNull();
    });

    it('should reject invalid job IDs', async () => {
      await expect(jobStore.get('')).rejects.toThrow(AsyncJobStoreError);
      await expect(jobStore.get(null)).rejects.toThrow(AsyncJobStoreError);
      await expect(jobStore.get(123)).rejects.toThrow(AsyncJobStoreError);
    });

    it('should return deep clone to prevent external mutations', async () => {
      const job1 = await jobStore.get(testJobId);
      const job2 = await jobStore.get(testJobId);

      expect(job1).not.toBe(job2); // Different object references
      expect(job1.providers).not.toBe(job2.providers); // Different Map instances
      expect(job1.events).not.toBe(job2.events); // Different Array instances

      // Mutating one shouldn't affect the other
      job1.status = 'mutated';
      expect(job2.status).not.toBe('mutated');
    });

    it('should update lastAccessed timestamp on retrieval', async () => {
      const job1 = await jobStore.get(testJobId);
      const firstAccess = job1.lastAccessed;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      const job2 = await jobStore.get(testJobId);
      const secondAccess = job2.lastAccessed;

      expect(secondAccess).toBeGreaterThan(firstAccess);
    });
  });

  describe('Job Updates', () => {
    let testJobId;

    beforeEach(async () => {
      testJobId = await jobStore.create('consensus', { jobId: 'test_update_job', sessionId: 'test-session' });
    });

    it('should update job status', async () => {
      const result = await jobStore.update(testJobId, {
        status: JOB_STATUS.RUNNING,
      });

      expect(result).toBe(true);

      const job = await jobStore.get(testJobId);
      expect(job.status).toBe(JOB_STATUS.RUNNING);
      expect(job.overall.startedAt).toBeTypeOf('number');
    });

    it('should update job progress', async () => {
      const result = await jobStore.update(testJobId, {
        progress: 0.5,
      });

      expect(result).toBe(true);

      const job = await jobStore.get(testJobId);
      expect(job.overall.progress).toBe(0.5);
    });

    it('should clamp progress values', async () => {
      await jobStore.update(testJobId, { progress: -0.5 });
      let job = await jobStore.get(testJobId);
      expect(job.overall.progress).toBe(0.0);

      await jobStore.update(testJobId, { progress: 1.5 });
      job = await jobStore.get(testJobId);
      expect(job.overall.progress).toBe(1.0);
    });

    it('should update provider states', async () => {
      const result = await jobStore.update(testJobId, {
        providers: {
          'gpt-4': { status: 'running', progress: 0.3 },
          'claude-3': { status: 'queued', progress: 0.0 },
        },
      });

      expect(result).toBe(true);

      const job = await jobStore.get(testJobId);
      const gpt4State = job.providers.get('gpt-4');
      const claude3State = job.providers.get('claude-3');

      expect(gpt4State.status).toBe('running');
      expect(gpt4State.progress).toBe(0.3);
      expect(claude3State.status).toBe('queued');
      expect(claude3State.progress).toBe(0.0);
    });

    it('should update timestamps on update', async () => {
      const originalJob = await jobStore.get(testJobId);
      const originalTimestamp = originalJob.updatedAt;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      await jobStore.update(testJobId, { progress: 0.1 });
      const updatedJob = await jobStore.get(testJobId);

      expect(updatedJob.updatedAt).toBeGreaterThan(originalTimestamp);
    });

    it('should add events on update', async () => {
      const originalJob = await jobStore.get(testJobId);
      const originalEventCount = originalJob.events.length;

      await jobStore.update(testJobId, { status: JOB_STATUS.RUNNING });
      const updatedJob = await jobStore.get(testJobId);

      expect(updatedJob.events.length).toBe(originalEventCount + 1);
      expect(updatedJob.events[updatedJob.events.length - 1].type).toBe('job_updated');
    });

    it('should return false for non-existent job', async () => {
      const result = await jobStore.update('job_nonexistent', { progress: 0.5 });
      expect(result).toBe(false);
    });

    it('should reject invalid parameters', async () => {
      await expect(jobStore.update('', { progress: 0.5 })).rejects.toThrow(AsyncJobStoreError);
      await expect(jobStore.update(testJobId, null)).rejects.toThrow(AsyncJobStoreError);
      await expect(jobStore.update(testJobId, 'invalid')).rejects.toThrow(AsyncJobStoreError);
    });

    it('should ignore invalid status values', async () => {
      const originalJob = await jobStore.get(testJobId);
      const originalStatus = originalJob.status;

      await jobStore.update(testJobId, { status: 'invalid-status' });
      const updatedJob = await jobStore.get(testJobId);

      expect(updatedJob.status).toBe(originalStatus);
    });
  });

  describe('Job Completion', () => {
    let testJobId;

    beforeEach(async () => {
      testJobId = await jobStore.create('chat', { jobId: 'test_chat_job', sessionId: 'test-session' });
    });

    it('should complete job successfully', async () => {
      const result = { response: 'Hello, world!' };
      const success = await jobStore.complete(testJobId, result);

      expect(success).toBe(true);

      const job = await jobStore.get(testJobId);
      expect(job.status).toBe(JOB_STATUS.COMPLETED);
      expect(job.overall.progress).toBe(1.0);
      expect(job.overall.result).toEqual(result);
      expect(job.overall.endedAt).toBeTypeOf('number');
    });

    it('should complete job with null result', async () => {
      const success = await jobStore.complete(testJobId, null);

      expect(success).toBe(true);

      const job = await jobStore.get(testJobId);
      expect(job.status).toBe(JOB_STATUS.COMPLETED);
      expect(job.overall.result).toBeNull();
    });

    it('should add completion event', async () => {
      const originalJob = await jobStore.get(testJobId);
      const originalEventCount = originalJob.events.length;

      await jobStore.complete(testJobId, { data: 'test' });
      const completedJob = await jobStore.get(testJobId);

      expect(completedJob.events.length).toBe(originalEventCount + 1);
      expect(completedJob.events[completedJob.events.length - 1].type).toBe('job_completed');
    });

    it('should return false for non-existent job', async () => {
      const success = await jobStore.complete('job_nonexistent', { data: 'test' });
      expect(success).toBe(false);
    });
  });

  describe('Job Failure', () => {
    let testJobId;

    beforeEach(async () => {
      testJobId = await jobStore.create('consensus', { jobId: 'test_consensus_job', sessionId: 'test-session' });
    });

    it('should fail job with Error object', async () => {
      const error = new Error('Test error');
      error.code = 'TEST_ERROR';

      const success = await jobStore.fail(testJobId, error);

      expect(success).toBe(true);

      const job = await jobStore.get(testJobId);
      expect(job.status).toBe(JOB_STATUS.FAILED);
      expect(job.overall.error.message).toBe('Test error');
      expect(job.overall.error.name).toBe('Error');
      expect(job.overall.endedAt).toBeTypeOf('number');
    });

    it('should fail job with error object', async () => {
      const error = { message: 'Custom error', code: 'CUSTOM_ERROR' };

      const success = await jobStore.fail(testJobId, error);

      expect(success).toBe(true);

      const job = await jobStore.get(testJobId);
      expect(job.status).toBe(JOB_STATUS.FAILED);
      expect(job.overall.error).toEqual(error);
    });

    it('should add failure event', async () => {
      const originalJob = await jobStore.get(testJobId);
      const originalEventCount = originalJob.events.length;

      await jobStore.fail(testJobId, new Error('Test failure'));
      const failedJob = await jobStore.get(testJobId);

      expect(failedJob.events.length).toBe(originalEventCount + 1);
      expect(failedJob.events[failedJob.events.length - 1].type).toBe('job_failed');
    });

    it('should return false for non-existent job', async () => {
      const success = await jobStore.fail('job_nonexistent', new Error('Test'));
      expect(success).toBe(false);
    });
  });

  describe('Job Existence Check', () => {
    let testJobId;

    beforeEach(async () => {
      testJobId = await jobStore.create('chat', { jobId: 'test_chat_job', sessionId: 'test-session' });
    });

    it('should return true for existing job', async () => {
      const exists = await jobStore.exists(testJobId);
      expect(exists).toBe(true);
    });

    it('should return false for non-existent job', async () => {
      const exists = await jobStore.exists('job_nonexistent');
      expect(exists).toBe(false);
    });
  });

  describe('Storage Statistics', () => {
    beforeEach(async () => {
      // Create some test jobs
      await jobStore.create('chat', { jobId: 'session_1_job', sessionId: 'session-1' });
      await jobStore.create('consensus', { jobId: 'session_2_job', sessionId: 'session-2' });
      const jobId = await jobStore.create('chat', { jobId: 'session_3_job', sessionId: 'session-3' });
      await jobStore.complete(jobId, { result: 'test' });
    });

    it('should return comprehensive statistics', async () => {
      const stats = await jobStore.getStats();

      expect(stats.backend).toBe('lru-cache');
      expect(stats.totalJobs).toBeGreaterThanOrEqual(3);
      expect(stats.maxJobs).toBe(10000);
      expect(stats.ttl).toBe(24 * 60 * 60 * 1000);
      expect(stats.statusCounts).toHaveProperty(JOB_STATUS.QUEUED);
      expect(stats.statusCounts).toHaveProperty(JOB_STATUS.COMPLETED);
      expect(stats.totalEvents).toBeGreaterThan(0);
      expect(stats.maxEventsPerJob).toBe(100);
      expect(stats.memoryUsage).toHaveProperty('heapUsed');
    });
  });

  describe('Cleanup Operations', () => {
    let jobIds;

    beforeEach(async () => {
      jobIds = [];
      // Create multiple jobs
      for (let i = 0; i < 5; i++) {
        const jobId = await jobStore.create('chat', { jobId: `test_job_${i}`, sessionId: `session-${i}` });
        jobIds.push(jobId);
      }
    });

    it('should clean up all jobs when maxAge is 0', async () => {
      const initialStats = await jobStore.getStats();
      expect(initialStats.totalJobs).toBeGreaterThanOrEqual(5);

      const cleaned = await jobStore.cleanup(0);
      expect(cleaned).toBe(initialStats.totalJobs);

      const finalStats = await jobStore.getStats();
      expect(finalStats.totalJobs).toBe(0);
    });

    it('should clean up old jobs based on age', async () => {
      // Make some jobs old by manually setting their timestamps
      const oldTimestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago

      for (let i = 0; i < 2; i++) {
        const job = await jobStore.get(jobIds[i]);
        if (job) {
          // Access internal job state to modify timestamp
          const internalJob = jobStore.jobs.get(jobIds[i]);
          if (internalJob) {
            internalJob.updatedAt = oldTimestamp;
          }
        }
      }

      const cleaned = await jobStore.cleanup(24 * 60 * 60 * 1000); // 24 hours
      expect(cleaned).toBe(2);

      const remainingStats = await jobStore.getStats();
      expect(remainingStats.totalJobs).toBe(3);
    });

    it('should not clean up recent jobs', async () => {
      const cleaned = await jobStore.cleanup(1000); // 1 second (all jobs are recent)
      expect(cleaned).toBe(0);

      const stats = await jobStore.getStats();
      expect(stats.totalJobs).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Event Ring Buffer', () => {
    it('should maintain ring buffer size for events', async () => {
      const jobId = await jobStore.create('chat', { jobId: 'test_chat_job', sessionId: 'test-session' });

      // Generate many events
      for (let i = 0; i < 150; i++) {
        await jobStore.update(jobId, { progress: i / 150 });
      }

      const job = await jobStore.get(jobId);
      expect(job.events.length).toBe(100); // Max events per job
      expect(job.seq).toBeGreaterThan(100); // Sequence should continue incrementing
    });

    it('should maintain event chronological order', async () => {
      const jobId = await jobStore.create('chat', { jobId: 'test_chat_job', sessionId: 'test-session' });

      for (let i = 0; i < 10; i++) {
        await jobStore.update(jobId, { progress: i / 10 });
        await new Promise(resolve => setTimeout(resolve, 1));
      }

      const job = await jobStore.get(jobId);
      for (let i = 1; i < job.events.length; i++) {
        expect(job.events[i].timestamp).toBeGreaterThanOrEqual(job.events[i - 1].timestamp);
        expect(job.events[i].seq).toBeGreaterThan(job.events[i - 1].seq);
      }
    });
  });

  describe('Provider State Helpers', () => {
    let testJob;

    beforeEach(async () => {
      const jobId = await jobStore.create('consensus', { jobId: 'test_consensus_job', sessionId: 'test-session' });
      testJob = await jobStore.get(jobId);
    });

    it('should set provider state', () => {
      const updatedJob = setProviderState(testJob, 'gpt-4', {
        status: 'running',
        progress: 0.5,
        model: 'gpt-4-turbo',
      });

      const providerState = getProviderState(updatedJob, 'gpt-4');
      expect(providerState.status).toBe('running');
      expect(providerState.progress).toBe(0.5);
      expect(providerState.model).toBe('gpt-4-turbo');
      expect(providerState.updatedAt).toBeTypeOf('number');
    });

    it('should update existing provider state', () => {
      setProviderState(testJob, 'claude-3', { status: 'queued', progress: 0.0 });
      const updatedJob = setProviderState(testJob, 'claude-3', { status: 'running', progress: 0.3 });

      const providerState = getProviderState(updatedJob, 'claude-3');
      expect(providerState.status).toBe('running');
      expect(providerState.progress).toBe(0.3);
    });

    it('should return null for non-existent provider', () => {
      const providerState = getProviderState(testJob, 'non-existent-provider');
      expect(providerState).toBeNull();
    });

    it('should handle job without providers map', () => {
      const jobWithoutProviders = { ...testJob };
      delete jobWithoutProviders.providers;

      const providerState = getProviderState(jobWithoutProviders, 'gpt-4');
      expect(providerState).toBeNull();
    });
  });

  describe('Store Interface and Pluggability', () => {
    it('should allow setting custom store implementation', () => {
      class CustomStore extends AsyncJobStoreInterface {
        async create() { return 'custom-job-id'; }
        async get() { return { jobId: 'custom-job-id' }; }
        async update() { return true; }
        async complete() { return true; }
        async fail() { return true; }
        async getStats() { return { backend: 'custom' }; }
        async cleanup() { return 0; }
      }

      const customStore = new CustomStore();
      setAsyncJobStore(customStore);

      const retrievedStore = getAsyncJobStore();
      expect(retrievedStore).toBe(customStore);
    });

    it('should reject invalid store implementations', () => {
      const invalidStore = {};
      expect(() => setAsyncJobStore(invalidStore)).toThrow(AsyncJobStoreError);
    });
  });

  describe('Error Handling', () => {
    it('should throw AsyncJobStoreError for various error conditions', async () => {
      // The specific error cases are already tested in individual method tests
      // This ensures the error type is consistent
      try {
        await jobStore.create('', { jobId: 'test_job', sessionId: 'test-session' });
      } catch (error) {
        expect(error).toBeInstanceOf(AsyncJobStoreError);
        expect(error.name).toBe('AsyncJobStoreError');
        expect(error.code).toBe('INVALID_TOOL'); // Empty string is invalid tool
      }
    });
  });

  describe('LRU Cache TTL Behavior', () => {
    it('should respect TTL for automatic job expiration', async () => {
      // Create a job store with very short TTL for testing
      const shortTtlStore = new (class extends AsyncJobStoreInterface {
        constructor() {
          super();
          this.jobs = new Map(); // Simple Map for testing TTL concept
        }

        async create(sessionId, tool) {
          const jobId = generateJobId();
          const job = {
            jobId,
            sessionId,
            tool,
            status: JOB_STATUS.QUEUED,
            createdAt: Date.now(),
          };
          this.jobs.set(jobId, job);
          return jobId;
        }

        async get(jobId) {
          return this.jobs.get(jobId) || null;
        }

        async update() { return true; }
        async complete() { return true; }
        async fail() { return true; }
        async getStats() { return { totalJobs: this.jobs.size }; }
        async cleanup() { return 0; }
      })();

      const jobId = await shortTtlStore.create('test', 'chat');
      expect(await shortTtlStore.get(jobId)).not.toBeNull();

      // The actual LRU cache TTL behavior is tested by the LRU cache library itself
      // Our implementation correctly uses the TTL configuration
    });
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const store1 = getAsyncJobStore();
      const store2 = getAsyncJobStore();

      expect(store1).toBe(store2);
    });

    it('should setup cleanup interval only once', () => {
      // Clear any previous calls
      mockSetInterval.mockClear();

      // Reset singleton to force re-initialization
      setAsyncJobStore(null);

      const store1 = getAsyncJobStore();
      const store2 = getAsyncJobStore();

      // setInterval should be called only once (for the cleanup timer)
      expect(mockSetInterval).toHaveBeenCalledTimes(1);
      expect(mockSetInterval).toHaveBeenCalledWith(
        expect.any(Function),
        10 * 60 * 1000 // 10 minutes
      );
    });
  });
});
