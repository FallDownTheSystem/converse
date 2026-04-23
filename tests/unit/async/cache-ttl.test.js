/**
 * Unit tests for cache TTL behavior
 *
 * Tests environment-based TTL configuration for AsyncJobStore and FileCache.
 *
 * Note on strategy: LRUCache uses performance.now() for its internal TTL
 * tracking, which vitest's fake timers don't reliably advance in this
 * environment. So the memory-store tests verify TTL configuration is wired
 * correctly by inspecting the cache instance's ttl value, and exercise the
 * age-based expiry path via the explicit cleanup(maxAgeMs) API, which is
 * Date.now()-based and responds to fake timers.
 *
 * FileCache tests use fake timers directly since readSnapshot() compares
 * Date.now() to the stored updated_at timestamp.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { nanoid } from 'nanoid';

describe('Cache TTL Configuration', () => {
  let cacheDir;

  beforeEach(async () => {
    // Reset modules to clear singletons
    vi.resetModules();

    // Clear all environment stubs
    vi.unstubAllEnvs();

    // Create temporary cache directory
    cacheDir = path.join(os.tmpdir(), 'converse-test-ttl', nanoid());
    await fs.mkdir(cacheDir, { recursive: true });
  });

  afterEach(async () => {
    // Restore real timers if a test enabled fakes
    vi.useRealTimers();

    // Clear environment stubs
    vi.unstubAllEnvs();

    // Clean up cache directory
    if (cacheDir) {
      try {
        await fs.rm(cacheDir, { recursive: true, force: true });
      } catch (_error) {
        // Ignore cleanup errors
      }
    }
  });

  describe('AsyncJobStore Memory TTL', () => {
    it('should use environment variable for memory TTL', async () => {
      vi.stubEnv('ASYNC_MEMORY_TTL_MS', '5000'); // 5 seconds

      const { getAsyncJobStore, setAsyncJobStore } = await import(
        '../../../src/async/asyncJobStore.js'
      );
      setAsyncJobStore(null);
      const store = getAsyncJobStore();

      // TTL should match the env var
      expect(store.jobs.ttl).toBe(5000);

      // Create a job and verify it exists
      const jobId = `job_${nanoid(10)}`;
      await store.create('chat', {
        jobId,
        sessionId: 'test-session',
        arguments: { prompt: 'test' },
      });

      const job = await store.get(jobId);
      expect(job).toBeDefined();
      expect(job.status).toBe('queued');

      // Exercise age-based cleanup (Date.now() based, not LRU internal TTL)
      vi.useFakeTimers();
      vi.advanceTimersByTime(5100); // past 5000ms TTL

      const cleaned = await store.cleanup(5000);
      expect(cleaned).toBeGreaterThanOrEqual(1);

      expect(await store.get(jobId)).toBeNull();
    });

    it('should use default TTL when environment variable not set', async () => {
      const { getAsyncJobStore, setAsyncJobStore } = await import(
        '../../../src/async/asyncJobStore.js'
      );
      setAsyncJobStore(null);
      const store = getAsyncJobStore();

      // Default is 24 hours
      expect(store.jobs.ttl).toBe(24 * 60 * 60 * 1000);

      const jobId = `job_${nanoid(10)}`;
      await store.create('chat', {
        jobId,
        sessionId: 'test-session',
        arguments: { prompt: 'test' },
      });

      // Within 23 hours, cleanup with default 24h maxAge keeps the job
      vi.useFakeTimers();
      vi.advanceTimersByTime(23 * 60 * 60 * 1000);

      await store.cleanup();
      expect(await store.get(jobId)).toBeDefined();

      // Past 24 hours, cleanup removes it
      vi.advanceTimersByTime(2 * 60 * 60 * 1000);
      await store.cleanup();
      expect(await store.get(jobId)).toBeNull();
    });

    it('should handle different TTL values for different instances', async () => {
      vi.stubEnv('ASYNC_MEMORY_TTL_MS', '2000');

      const { getAsyncJobStore: getStore1, setAsyncJobStore: setStore1 } =
				await import('../../../src/async/asyncJobStore.js');
      setStore1(null);
      const store1 = getStore1();
      expect(store1.jobs.ttl).toBe(2000);

      // Reset modules and set different TTL
      vi.resetModules();
      vi.stubEnv('ASYNC_MEMORY_TTL_MS', '8000');

      const { getAsyncJobStore: getStore2, setAsyncJobStore: setStore2 } =
				await import('../../../src/async/asyncJobStore.js');
      setStore2(null);
      const store2 = getStore2();
      expect(store2.jobs.ttl).toBe(8000);

      // Each store should honor its own configured TTL when cleanup runs
      const jobId2 = `job_${nanoid(10)}`;
      await store2.create('chat', {
        jobId: jobId2,
        sessionId: 'session2',
        arguments: { prompt: 'test2' },
      });

      vi.useFakeTimers();
      vi.advanceTimersByTime(8100);

      await store2.cleanup(8000);
      expect(await store2.get(jobId2)).toBeNull();
    });
  });

  describe('FileCache Disk TTL', () => {
    beforeEach(() => {
      // FileCache TTL uses Date.now() - Date is faked by vitest default timers
      vi.useFakeTimers();
    });

    it('should use environment variable for disk TTL', async () => {
      vi.stubEnv('ASYNC_DISK_TTL_MS', '7000'); // 7 seconds
      vi.stubEnv('ASYNC_CACHE_DIR', cacheDir);

      const { getFileCache, setFileCache } = await import(
        '../../../src/async/fileCache.js'
      );
      setFileCache(null);
      const cache = getFileCache();
      expect(cache.maxAge).toBe(7000);

      const jobId = `job_${nanoid(10)}`;
      const snapshot = {
        jobId,
        status: 'completed',
        result: { content: 'test result' },
        updated_at: Date.now(),
      };

      await cache.writeSnapshot(jobId, snapshot);

      const retrieved = await cache.readSnapshot(jobId);
      expect(retrieved).toBeDefined();
      expect(retrieved.result.content).toBe('test result');

      // Just before TTL
      vi.advanceTimersByTime(6900);
      expect(await cache.readSnapshot(jobId)).toBeDefined();

      // Past TTL
      vi.advanceTimersByTime(200);
      expect(await cache.readSnapshot(jobId)).toBeNull();
    });

    it('should use default TTL when environment variable not set', async () => {
      vi.stubEnv('ASYNC_CACHE_DIR', cacheDir);

      const { getFileCache, setFileCache } = await import(
        '../../../src/async/fileCache.js'
      );
      setFileCache(null);
      const cache = getFileCache();
      expect(cache.maxAge).toBe(3 * 24 * 60 * 60 * 1000); // 3 days

      const jobId = `job_${nanoid(10)}`;
      const snapshot = {
        jobId,
        status: 'completed',
        result: { content: 'test result' },
        updated_at: Date.now(),
      };

      await cache.writeSnapshot(jobId, snapshot);
      expect(await cache.readSnapshot(jobId)).toBeDefined();

      // Within 3 days
      vi.advanceTimersByTime(2 * 24 * 60 * 60 * 1000);
      expect(await cache.readSnapshot(jobId)).toBeDefined();

      // Past 3 days
      vi.advanceTimersByTime(2 * 24 * 60 * 60 * 1000);
      expect(await cache.readSnapshot(jobId)).toBeNull();
    });
  });

  describe('Memory to Disk Transition with TTL', () => {
    it('should handle job transition from memory to disk with different TTLs', async () => {
      vi.stubEnv('ASYNC_MEMORY_TTL_MS', '3000');
      vi.stubEnv('ASYNC_DISK_TTL_MS', '10000');
      vi.stubEnv('ASYNC_CACHE_DIR', cacheDir);

      const { getAsyncJobStore, setAsyncJobStore } = await import(
        '../../../src/async/asyncJobStore.js'
      );
      const { getFileCache, setFileCache } = await import(
        '../../../src/async/fileCache.js'
      );

      setAsyncJobStore(null);
      setFileCache(null);

      const memoryStore = getAsyncJobStore();
      const diskCache = getFileCache();

      expect(memoryStore.jobs.ttl).toBe(3000);
      expect(diskCache.maxAge).toBe(10000);

      const jobId = `job_${nanoid(10)}`;
      await memoryStore.create('chat', {
        jobId,
        sessionId: 'test-session',
        arguments: { prompt: 'test' },
      });

      await memoryStore.update(jobId, {
        status: 'completed',
        result: { content: 'test complete' },
        completedAt: Date.now(),
      });

      const inMemory = await memoryStore.get(jobId);
      expect(inMemory).toBeDefined();
      expect(inMemory.status).toBe('completed');

      // Transition to disk (Maps don't serialize, so strip them)
      await diskCache.writeSnapshot(jobId, {
        ...inMemory,
        providers: undefined,
        updated_at: Date.now(),
      });

      vi.useFakeTimers();

      // Past memory TTL, within disk TTL
      vi.advanceTimersByTime(5000);

      await memoryStore.cleanup(3000);
      expect(await memoryStore.get(jobId)).toBeNull();

      const stillInDisk = await diskCache.readSnapshot(jobId);
      expect(stillInDisk).toBeDefined();
      expect(stillInDisk.status).toBe('completed');

      // Past disk TTL
      vi.advanceTimersByTime(6000);
      expect(await diskCache.readSnapshot(jobId)).toBeNull();
    });
  });
});
