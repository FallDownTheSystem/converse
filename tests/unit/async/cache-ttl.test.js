/**
 * Unit tests for cache TTL behavior
 * 
 * Tests environment-based TTL configuration for AsyncJobStore and FileCache
 * using Vitest's idiomatic patterns for environment variable testing.
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
    
    // Use fake timers for TTL testing
    vi.useFakeTimers();
    
    // Create temporary cache directory
    cacheDir = path.join(os.tmpdir(), 'converse-test-ttl', nanoid());
    await fs.mkdir(cacheDir, { recursive: true });
  });
  
  afterEach(async () => {
    // Restore real timers
    vi.useRealTimers();
    
    // Clear environment stubs
    vi.unstubAllEnvs();
    
    // Clean up cache directory
    if (cacheDir) {
      try {
        await fs.rm(cacheDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });
  
  describe('AsyncJobStore Memory TTL', () => {
    it('should use environment variable for memory TTL', async () => {
      // Set custom TTL via environment
      vi.stubEnv('ASYNC_MEMORY_TTL_MS', '5000'); // 5 seconds
      
      // Import module after setting environment
      const { getAsyncJobStore } = await import('../../../src/async/asyncJobStore.js');
      const store = getAsyncJobStore();
      
      // Create a job
      const jobId = await store.create('chat', {
        sessionId: 'test-session',
        arguments: { prompt: 'test' }
      });
      
      // Job should exist initially
      const job = await store.get(jobId);
      expect(job).toBeDefined();
      expect(job.status).toBe('queued');
      
      // Advance time to just before TTL
      vi.advanceTimersByTime(4900);
      
      // Job should still exist
      const stillExists = await store.get(jobId);
      expect(stillExists).toBeDefined();
      
      // Advance time past TTL
      vi.advanceTimersByTime(200);
      
      // Job should be expired
      const expired = await store.get(jobId);
      expect(expired).toBeNull();
    });
    
    it('should use default TTL when environment variable not set', async () => {
      // Don't set environment variable
      
      // Import module
      const { getAsyncJobStore } = await import('../../../src/async/asyncJobStore.js');
      const store = getAsyncJobStore();
      
      // Create a job
      const jobId = await store.create('chat', {
        sessionId: 'test-session',
        arguments: { prompt: 'test' }
      });
      
      // Job should exist initially
      const job = await store.get(jobId);
      expect(job).toBeDefined();
      
      // Advance time to 23 hours (less than default 24 hours)
      vi.advanceTimersByTime(23 * 60 * 60 * 1000);
      
      // Job should still exist
      const stillExists = await store.get(jobId);
      expect(stillExists).toBeDefined();
      
      // Advance time past 24 hours
      vi.advanceTimersByTime(2 * 60 * 60 * 1000); // 2 more hours
      
      // Job should be expired
      const expired = await store.get(jobId);
      expect(expired).toBeNull();
    });
    
    it('should handle different TTL values for different instances', async () => {
      // Test with first TTL value
      vi.stubEnv('ASYNC_MEMORY_TTL_MS', '2000'); // 2 seconds
      
      const { getAsyncJobStore: getStore1 } = await import('../../../src/async/asyncJobStore.js');
      const store1 = getStore1();
      
      const jobId1 = await store1.create('chat', {
        sessionId: 'session1',
        arguments: { prompt: 'test1' }
      });
      
      // Advance time past first TTL
      vi.advanceTimersByTime(2500);
      
      // First job should be expired
      expect(await store1.get(jobId1)).toBeNull();
      
      // Reset modules and set different TTL
      vi.resetModules();
      vi.stubEnv('ASYNC_MEMORY_TTL_MS', '8000'); // 8 seconds
      
      const { getAsyncJobStore: getStore2 } = await import('../../../src/async/asyncJobStore.js');
      const store2 = getStore2();
      
      const jobId2 = await store2.create('chat', {
        sessionId: 'session2',
        arguments: { prompt: 'test2' }
      });
      
      // Reset timers for clean test
      vi.clearAllTimers();
      vi.setSystemTime(new Date());
      
      // Advance time less than new TTL
      vi.advanceTimersByTime(6000);
      
      // Second job should still exist
      const job2 = await store2.get(jobId2);
      expect(job2).toBeDefined();
      
      // Advance past new TTL
      vi.advanceTimersByTime(3000);
      
      // Now it should be expired
      expect(await store2.get(jobId2)).toBeNull();
    });
  });
  
  describe('FileCache Disk TTL', () => {
    it('should use environment variable for disk TTL', async () => {
      // Set custom TTL via environment
      vi.stubEnv('ASYNC_DISK_TTL_MS', '7000'); // 7 seconds
      vi.stubEnv('ASYNC_CACHE_DIR', cacheDir);
      
      // Import module after setting environment
      const { getFileCache } = await import('../../../src/async/fileCache.js');
      const cache = getFileCache();
      
      // Store a job result
      const jobId = `job-${nanoid()}`;
      const result = {
        jobId,
        status: 'completed',
        result: { content: 'test result' },
        metadata: { timestamp: Date.now() }
      };
      
      await cache.set(jobId, result);
      
      // Result should exist initially
      const retrieved = await cache.get(jobId);
      expect(retrieved).toBeDefined();
      expect(retrieved.result.content).toBe('test result');
      
      // Advance time to just before TTL
      vi.advanceTimersByTime(6900);
      
      // Should still exist
      const stillExists = await cache.get(jobId);
      expect(stillExists).toBeDefined();
      
      // Advance time past TTL
      vi.advanceTimersByTime(200);
      
      // Should be expired (get returns null for expired items)
      const expired = await cache.get(jobId);
      expect(expired).toBeNull();
    });
    
    it('should use default TTL when environment variable not set', async () => {
      // Set cache directory but not TTL
      vi.stubEnv('ASYNC_CACHE_DIR', cacheDir);
      
      // Import module
      const { getFileCache } = await import('../../../src/async/fileCache.js');
      const cache = getFileCache();
      
      // Store a job result
      const jobId = `job-${nanoid()}`;
      const result = {
        jobId,
        status: 'completed',
        result: { content: 'test result' },
        metadata: { timestamp: Date.now() }
      };
      
      await cache.set(jobId, result);
      
      // Result should exist initially
      const retrieved = await cache.get(jobId);
      expect(retrieved).toBeDefined();
      
      // Advance time to 2 days (less than default 3 days)
      vi.advanceTimersByTime(2 * 24 * 60 * 60 * 1000);
      
      // Should still exist
      const stillExists = await cache.get(jobId);
      expect(stillExists).toBeDefined();
      
      // Advance time past 3 days
      vi.advanceTimersByTime(2 * 24 * 60 * 60 * 1000); // 2 more days
      
      // Should be expired
      const expired = await cache.get(jobId);
      expect(expired).toBeNull();
    });
  });
  
  describe('Memory to Disk Transition with TTL', () => {
    it('should handle job transition from memory to disk with different TTLs', async () => {
      // Set different TTLs for memory and disk
      vi.stubEnv('ASYNC_MEMORY_TTL_MS', '3000');  // 3 seconds
      vi.stubEnv('ASYNC_DISK_TTL_MS', '10000');   // 10 seconds
      vi.stubEnv('ASYNC_CACHE_DIR', cacheDir);
      
      // Import modules
      const { getAsyncJobStore } = await import('../../../src/async/asyncJobStore.js');
      const { getFileCache } = await import('../../../src/async/fileCache.js');
      
      const memoryStore = getAsyncJobStore();
      const diskCache = getFileCache();
      
      // Create a job in memory
      const jobId = await memoryStore.create('chat', {
        sessionId: 'test-session',
        arguments: { prompt: 'test' }
      });
      
      // Complete the job
      await memoryStore.update(jobId, {
        status: 'completed',
        result: { content: 'test complete' },
        completedAt: Date.now()
      });
      
      // Job should be in memory
      const inMemory = await memoryStore.get(jobId);
      expect(inMemory).toBeDefined();
      expect(inMemory.status).toBe('completed');
      
      // Manually transition to disk (simulating what would happen in production)
      await diskCache.set(jobId, inMemory);
      
      // Advance time past memory TTL but not disk TTL
      vi.advanceTimersByTime(5000); // 5 seconds
      
      // Should be expired from memory
      const expiredFromMemory = await memoryStore.get(jobId);
      expect(expiredFromMemory).toBeNull();
      
      // But should still be in disk cache
      const stillInDisk = await diskCache.get(jobId);
      expect(stillInDisk).toBeDefined();
      expect(stillInDisk.status).toBe('completed');
      
      // Advance time past disk TTL
      vi.advanceTimersByTime(6000); // 6 more seconds (total 11 seconds)
      
      // Now should be expired from disk too
      const expiredFromDisk = await diskCache.get(jobId);
      expect(expiredFromDisk).toBeNull();
    });
  });
});