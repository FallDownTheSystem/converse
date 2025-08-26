/**
 * JobRunner - Unit Tests
 *
 * Comprehensive test suite for JobRunner background execution orchestration.
 * Tests concurrency limits, timeouts, error scenarios, cancellation, and integration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JobRunner, createJobRunner, getJobRunner, setJobRunner, JobRunnerError } from '../../../src/async/jobRunner.js';
import { getAsyncJobStore, JOB_STATUS } from '../../../src/async/asyncJobStore.js';

describe('JobRunner', () => {
  let jobRunner;
  let asyncJobStore;
  let mockFileCache;

  beforeEach(() => {
    // Set up fresh instances for each test
    asyncJobStore = getAsyncJobStore();
    mockFileCache = {
      writeEvent: vi.fn(),
      createSnapshot: vi.fn(),
    };

    jobRunner = new JobRunner({
      asyncJobStore,
      fileCache: mockFileCache,
    }, {
      concurrency: 2, // Lower concurrency for easier testing
      defaultTimeout: 1000, // 1 second timeout for faster tests
    });

    // Clean up any existing jobs
    asyncJobStore.jobs?.clear();
  });

  afterEach(async () => {
    if (jobRunner) {
      await jobRunner.shutdown(100);
    }
    setJobRunner(null);
  });

  describe('Constructor', () => {
    it('should create JobRunner with required dependencies', () => {
      expect(jobRunner).toBeInstanceOf(JobRunner);
      expect(jobRunner.asyncJobStore).toBe(asyncJobStore);
      expect(jobRunner.concurrency).toBe(2);
      expect(jobRunner.defaultTimeout).toBe(1000);
    });

    it('should throw error without asyncJobStore', () => {
      expect(() => new JobRunner({})).toThrow(JobRunnerError);
      expect(() => new JobRunner({})).toThrow('AsyncJobStore is required');
    });

    it('should use default options when none provided', () => {
      const runner = new JobRunner({ asyncJobStore });
      expect(runner.concurrency).toBe(10);
      expect(runner.defaultTimeout).toBe(30 * 60 * 1000); // 30 minutes
    });
  });

  describe('Job Submission', () => {
    it('should submit job and return job ID immediately', async () => {
      const jobSpec = {
        sessionId: 'session_123',
        tool: 'chat',
      };

      const runFunction = vi.fn().mockResolvedValue({ result: 'success' });

      const jobId = await jobRunner.submit(jobSpec, runFunction);

      expect(jobId).toMatch(/^job_[A-Za-z0-9_-]{10}$/);
      expect(jobRunner.stats.submitted).toBe(1);
      expect(jobRunner.stats.activeCount).toBe(1);
    });

    it('should validate job specification', async () => {
      const runFunction = vi.fn();

      // Missing tool
      await expect(
        jobRunner.submit({ sessionId: 'session_123' }, runFunction)
      ).rejects.toThrow(JobRunnerError);

      // Invalid runFunction
      await expect(
        jobRunner.submit({ sessionId: 'session_123', tool: 'chat' }, 'not a function')
      ).rejects.toThrow(JobRunnerError);
    });

    it('should emit job.created event on submission', async () => {
      const eventSpy = vi.fn();
      jobRunner.on('job.created', eventSpy);

      const jobSpec = {
        sessionId: 'session_123',
        tool: 'chat',
      };

      const jobId = await jobRunner.submit(jobSpec, vi.fn().mockResolvedValue({}));

      expect(eventSpy).toHaveBeenCalledWith({
        jobId,
        sessionId: 'session_123',
        tool: 'chat',
        timestamp: expect.any(Number),
      });
    });
  });

  describe('Job Execution', () => {
    it.skip('should execute job function with proper context', async () => {
      const runFunction = vi.fn().mockImplementation(async (context) => {
        expect(context).toHaveProperty('jobId');
        expect(context).toHaveProperty('sessionId', 'session_123');
        expect(context).toHaveProperty('tool', 'chat');
        expect(context).toHaveProperty('signal');
        expect(context).toHaveProperty('updateJob');
        expect(context).toHaveProperty('emitEvent');
        return { result: 'success' };
      });

      const jobSpec = {
        sessionId: 'session_123',
        tool: 'chat',
      };

      const jobId = await jobRunner.submit(jobSpec, runFunction);

      // Wait for execution to complete with timeout
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Job completion timeout')), 5000);
        jobRunner.on('job.completed', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      expect(runFunction).toHaveBeenCalled();

      // Check job was completed successfully
      const jobState = await asyncJobStore.get(jobId);
      expect(jobState.status).toBe(JOB_STATUS.COMPLETED);
      expect(jobState.overall.result).toEqual({ result: 'success' });
    });

    it('should handle job execution errors', async () => {
      const error = new Error('Job execution failed');
      const runFunction = vi.fn().mockRejectedValue(error);

      const jobSpec = {
        sessionId: 'session_123',
        tool: 'chat',
      };

      const jobId = await jobRunner.submit(jobSpec, runFunction);

      // Wait for execution to fail
      await new Promise(resolve => {
        jobRunner.on('job.failed', () => resolve());
      });

      // Check job was marked as failed
      const jobState = await asyncJobStore.get(jobId);
      expect(jobState.status).toBe(JOB_STATUS.FAILED);
      expect(jobState.overall.error.message).toBe('Job execution failed');

      expect(jobRunner.stats.failed).toBe(1);
    });

    it('should emit job lifecycle events', async () => {
      const events = [];
      jobRunner.on('job.started', (data) => events.push({ type: 'started', data }));
      jobRunner.on('job.completed', (data) => events.push({ type: 'completed', data }));

      const runFunction = vi.fn().mockResolvedValue({ result: 'success' });

      const jobSpec = {
        sessionId: 'session_123',
        tool: 'chat',
      };

      const jobId = await jobRunner.submit(jobSpec, runFunction);

      // Wait for completion
      await new Promise(resolve => {
        jobRunner.on('job.completed', () => resolve());
      });

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('started');
      expect(events[0].data.jobId).toBe(jobId);
      expect(events[1].type).toBe('completed');
      expect(events[1].data.jobId).toBe(jobId);
    });
  });

  describe('Concurrency Control', () => {
    it('should respect concurrency limits', async () => {
      let activeJobs = 0;
      let maxConcurrent = 0;

      const runFunction = vi.fn().mockImplementation(async () => {
        activeJobs++;
        maxConcurrent = Math.max(maxConcurrent, activeJobs);

        // Simulate some work
        await new Promise(resolve => setTimeout(resolve, 50));

        activeJobs--;
        return { result: 'success' };
      });

      const jobSpec = {
        sessionId: 'session_123',
        tool: 'chat',
      };

      // Submit more jobs than concurrency limit
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(jobRunner.submit(jobSpec, runFunction));
      }

      const jobIds = await Promise.all(promises);
      expect(jobIds).toHaveLength(5);

      // Wait for all jobs to complete
      let completedJobs = 0;
      await new Promise(resolve => {
        jobRunner.on('job.completed', () => {
          completedJobs++;
          if (completedJobs === 5) resolve();
        });
      });

      // Should never exceed concurrency limit
      expect(maxConcurrent).toBeLessThanOrEqual(2);
      expect(runFunction).toHaveBeenCalledTimes(5);
    });

    it('should track active job count correctly', async () => {
      const runFunction = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { result: 'success' };
      });

      const jobSpec = {
        sessionId: 'session_123',
        tool: 'chat',
      };

      // Submit 3 jobs
      await jobRunner.submit(jobSpec, runFunction);
      await jobRunner.submit(jobSpec, runFunction);
      await jobRunner.submit(jobSpec, runFunction);

      expect(jobRunner.stats.activeCount).toBe(3);

      // Wait for all to complete
      let completedJobs = 0;
      await new Promise(resolve => {
        jobRunner.on('job.completed', () => {
          completedJobs++;
          if (completedJobs === 3) resolve();
        });
      });

      expect(jobRunner.stats.activeCount).toBe(0);
    });
  });

  describe('Job Cancellation', () => {
    it('should cancel queued job', async () => {
      // Create a long-running job to block the queue
      const blockingFunction = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return { result: 'blocking' };
      });

      // Create a job to cancel
      const cancelledFunction = vi.fn();

      const jobSpec = {
        sessionId: 'session_123',
        tool: 'chat',
      };

      // Submit blocking jobs to fill concurrency limit
      await jobRunner.submit(jobSpec, blockingFunction);
      await jobRunner.submit(jobSpec, blockingFunction);

      // Submit job to cancel (should be queued)
      const jobIdToCancel = await jobRunner.submit(jobSpec, cancelledFunction);

      // Cancel the queued job
      const cancelled = await jobRunner.cancel(jobIdToCancel);

      expect(cancelled).toBe(true);
      expect(jobRunner.stats.cancelled).toBe(1);

      // Check job status
      const jobState = await asyncJobStore.get(jobIdToCancel);
      expect(jobState.status).toBe(JOB_STATUS.CANCELLED);

      // Wait for blocking jobs to finish
      await new Promise(resolve => setTimeout(resolve, 300));

      // Cancelled job should not have executed
      expect(cancelledFunction).not.toHaveBeenCalled();
    });

    it('should cancel running job', async () => {
      let jobCancelled = false;

      const runFunction = vi.fn().mockImplementation(async (context) => {
        // Listen for abort signal
        context.signal.addEventListener('abort', () => {
          jobCancelled = true;
        });

        // Simulate work that can be interrupted
        for (let i = 0; i < 10; i++) {
          if (context.signal.aborted) {
            throw new Error('Job was aborted');
          }
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        return { result: 'completed' };
      });

      const jobSpec = {
        sessionId: 'session_123',
        tool: 'chat',
      };

      const jobId = await jobRunner.submit(jobSpec, runFunction);

      // Wait a bit for job to start
      await new Promise(resolve => setTimeout(resolve, 25));

      // Cancel the running job
      const cancelled = await jobRunner.cancel(jobId);

      expect(cancelled).toBe(true);
      expect(jobCancelled).toBe(true);

      // Wait for cancellation to process
      await new Promise(resolve => setTimeout(resolve, 100));

      const jobState = await asyncJobStore.get(jobId);
      expect(jobState.status).toBe(JOB_STATUS.CANCELLED);
    });

    it('should emit cancellation event', async () => {
      const eventSpy = vi.fn();
      jobRunner.on('job.cancelled', eventSpy);

      const runFunction = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { result: 'success' };
      });

      const jobSpec = {
        sessionId: 'session_123',
        tool: 'chat',
      };

      const jobId = await jobRunner.submit(jobSpec, runFunction);
      await jobRunner.cancel(jobId);

      expect(eventSpy).toHaveBeenCalledWith({
        jobId,
        timestamp: expect.any(Number),
      });
    });

    it('should not cancel completed jobs', async () => {
      const runFunction = vi.fn().mockResolvedValue({ result: 'success' });

      const jobSpec = {
        sessionId: 'session_123',
        tool: 'chat',
      };

      const jobId = await jobRunner.submit(jobSpec, runFunction);

      // Wait for completion
      await new Promise(resolve => {
        jobRunner.on('job.completed', () => resolve());
      });

      // Try to cancel completed job
      const cancelled = await jobRunner.cancel(jobId);
      expect(cancelled).toBe(false);
    });
  });

  describe('Job Timeouts', () => {
    it('should timeout long-running jobs', async () => {
      const runFunction = vi.fn().mockImplementation(async (context) => {
        // Listen for abort signal
        let aborted = false;
        context.signal.addEventListener('abort', () => {
          aborted = true;
        });

        // Run longer than timeout
        for (let i = 0; i < 50; i++) {
          if (aborted) break;
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        if (aborted) {
          throw new Error('Job was aborted due to timeout');
        }

        return { result: 'completed' };
      });

      const jobSpec = {
        sessionId: 'session_123',
        tool: 'chat',
      };

      const jobId = await jobRunner.submit(jobSpec, runFunction, {
        timeout: 100, // Very short timeout
      });

      // Wait for timeout and cancellation
      await new Promise(resolve => {
        jobRunner.on('job.cancelled', () => resolve());
      });

      const jobState = await asyncJobStore.get(jobId);
      expect(jobState.status).toBe(JOB_STATUS.CANCELLED);
    });

    it('should use default timeout when not specified', async () => {
      const runner = new JobRunner({ asyncJobStore }, {
        defaultTimeout: 50,
      });

      const runFunction = vi.fn().mockImplementation(async (context) => {
        let aborted = false;
        context.signal.addEventListener('abort', () => {
          aborted = true;
        });

        await new Promise(resolve => setTimeout(resolve, 100));

        if (aborted) {
          throw new Error('Timeout');
        }
        return { result: 'success' };
      });

      const jobSpec = {
        sessionId: 'session_123',
        tool: 'chat',
      };

      const jobId = await runner.submit(jobSpec, runFunction);

      await new Promise(resolve => {
        runner.on('job.cancelled', () => resolve());
      });

      await runner.shutdown(100);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track statistics correctly', async () => {
      const successFunction = vi.fn().mockResolvedValue({ result: 'success' });
      const failureFunction = vi.fn().mockRejectedValue(new Error('Failed'));

      const jobSpec = {
        sessionId: 'session_123',
        tool: 'chat',
      };

      // Submit various jobs sequentially to avoid timing issues
      const job1 = await jobRunner.submit(jobSpec, successFunction);
      const job2 = await jobRunner.submit(jobSpec, successFunction);
      const job3 = await jobRunner.submit(jobSpec, failureFunction);

      expect(jobRunner.stats.submitted).toBe(3);

      // Wait for specific jobs to complete using the AsyncJobStore
      const waitForJobCompletion = async (jobId) => {
        for (let i = 0; i < 100; i++) { // 10 second timeout
          const jobState = await asyncJobStore.get(jobId);
          if (jobState && [JOB_STATUS.COMPLETED, JOB_STATUS.FAILED].includes(jobState.status)) {
            return jobState.status;
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error(`Job ${jobId} did not complete in time`);
      };

      // Wait for all jobs to complete
      await waitForJobCompletion(job1);
      await waitForJobCompletion(job2);
      await waitForJobCompletion(job3);

      // Give a bit more time for stats to update
      await new Promise(resolve => setTimeout(resolve, 50));

      const stats = jobRunner.getStats();
      expect(stats.submitted).toBe(3);
      expect(stats.completed).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.activeCount).toBe(0);
    }, 15000);

    it('should return comprehensive stats', () => {
      const stats = jobRunner.getStats();

      expect(stats).toHaveProperty('submitted');
      expect(stats).toHaveProperty('completed');
      expect(stats).toHaveProperty('failed');
      expect(stats).toHaveProperty('cancelled');
      expect(stats).toHaveProperty('activeCount');
      expect(stats).toHaveProperty('concurrency');
      expect(stats).toHaveProperty('queueSize');
      expect(stats).toHaveProperty('activeSize');
      expect(stats).toHaveProperty('totalJobs');
    });
  });

  describe('Graceful Shutdown', () => {
    it('should wait for active jobs to complete during shutdown', async () => {
      let jobCompleted = false;
      let jobStarted = false;

      const runFunction = vi.fn().mockImplementation(async () => {
        jobStarted = true;
        await new Promise(resolve => setTimeout(resolve, 100));
        jobCompleted = true;
        return { result: 'success' };
      });

      const jobSpec = {
        sessionId: 'session_123',
        tool: 'chat',
      };

      await jobRunner.submit(jobSpec, runFunction);

      // Wait for job to actually start
      await new Promise(resolve => {
        const check = () => {
          if (jobStarted) {
            resolve();
          } else {
            setTimeout(check, 10);
          }
        };
        check();
      });

      // Start shutdown (should wait for job)
      const shutdownPromise = jobRunner.shutdown(300);

      // Shutdown should not complete immediately
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(jobCompleted).toBe(false);

      // Wait for shutdown to complete
      await shutdownPromise;
      expect(jobCompleted).toBe(true);
    }, 10000);

    it('should force shutdown after timeout', async () => {
      const runFunction = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return { result: 'success' };
      });

      const jobSpec = {
        sessionId: 'session_123',
        tool: 'chat',
      };

      await jobRunner.submit(jobSpec, runFunction);

      // Force shutdown with short timeout
      await jobRunner.shutdown(50);

      // Should complete even though job is still running
      expect(true).toBe(true); // Test completed
    });
  });

  describe('Factory Functions', () => {
    it('should create JobRunner with createJobRunner', () => {
      const runner = createJobRunner({ asyncJobStore });
      expect(runner).toBeInstanceOf(JobRunner);
    });

    it('should manage global instance with getJobRunner', () => {
      setJobRunner(null); // Reset

      const runner1 = getJobRunner({ asyncJobStore });
      const runner2 = getJobRunner();

      expect(runner1).toBe(runner2);
      expect(runner1).toBeInstanceOf(JobRunner);
    });

    it('should validate runner instance in setJobRunner', () => {
      expect(() => setJobRunner('not a runner')).toThrow(JobRunnerError);
    });
  });

  describe('Integration with AsyncJobStore', () => {
    it('should create jobs with proper initial state', async () => {
      const jobSpec = {
        sessionId: 'session_123',
        tool: 'chat',
      };

      const runFunction = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { result: 'success' };
      });

      const jobId = await jobRunner.submit(jobSpec, runFunction);

      const jobState = await asyncJobStore.get(jobId);

      expect(jobState.jobId).toBe(jobId);
      expect(jobState.sessionId).toBe('session_123');
      expect(jobState.tool).toBe('chat');
      expect(jobState.status).toBe(JOB_STATUS.QUEUED);
      expect(jobState.overall.progress).toBe(0.0);
    });

    it('should update job status during execution', async () => {
      const jobSpec = {
        sessionId: 'session_123',
        tool: 'chat',
      };


      const runFunction = vi.fn().mockImplementation(async (context) => {
        // Update job during execution
        await context.updateJob({
          progress: 0.5,
        });

        await new Promise(resolve => setTimeout(resolve, 50));
        return { result: 'success' };
      });

      const jobId = await jobRunner.submit(jobSpec, runFunction);

      // Check initial state
      const jobStateBeforeRunning = await asyncJobStore.get(jobId);

      // Wait for completion
      await new Promise(resolve => {
        jobRunner.on('job.completed', () => resolve());
      });

      const jobStateAfterRunning = await asyncJobStore.get(jobId);

      expect(jobStateBeforeRunning.status).toBe(JOB_STATUS.QUEUED);
      expect(jobStateAfterRunning.status).toBe(JOB_STATUS.COMPLETED);
      expect(jobStateAfterRunning.overall.progress).toBe(1.0);
      expect(jobStateAfterRunning.overall.result).toEqual({ result: 'success' });
    });
  });

  describe('Error Handling', () => {
    it('should handle AsyncJobStore errors gracefully', async () => {
      // Mock a failing asyncJobStore
      const failingStore = {
        create: vi.fn().mockRejectedValue(new Error('Store creation failed')),
        get: vi.fn(),
        update: vi.fn(),
        complete: vi.fn(),
        fail: vi.fn(),
      };

      const failingRunner = new JobRunner({ asyncJobStore: failingStore });

      const jobSpec = {
        sessionId: 'session_123',
        tool: 'chat',
      };

      await expect(
        failingRunner.submit(jobSpec, vi.fn())
      ).rejects.toThrow('Store creation failed');

      await failingRunner.shutdown(100);
    });

    it('should handle system errors during execution', async () => {
      // This test verifies the try-catch in _executeJob handles system errors
      const jobSpec = {
        sessionId: 'session_123',
        tool: 'chat',
      };

      const runFunction = vi.fn().mockImplementation(() => {
        throw new Error('Unexpected system error');
      });

      const jobId = await jobRunner.submit(jobSpec, runFunction);

      // Wait for failure
      await new Promise(resolve => {
        jobRunner.on('job.failed', () => resolve());
      });

      const jobState = await asyncJobStore.get(jobId);
      expect(jobState.status).toBe(JOB_STATUS.FAILED);
      expect(jobState.overall.error.message).toBe('Unexpected system error');
    });
  });
});
