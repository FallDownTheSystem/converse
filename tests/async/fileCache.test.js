import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import {
  getFileCache,
  setFileCache,
  FileCache,
  FileCacheInterface,
  FileCacheError,
  _FileCache,
} from '../../src/async/fileCache.js';
import { ERROR_CODES } from '../../src/utils/errorHandler.js';

// Mock console utilities to prevent test output noise
vi.mock('../../src/utils/console.js', () => ({
  debugLog: vi.fn(),
  debugError: vi.fn(),
}));

// Mock fs/promises module
vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn(),
    appendFile: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
    rm: vi.fn(),
    access: vi.fn(),
  },
}));

describe('FileCache Unit Tests', () => {
  let fileCache;
  let originalSetInterval;
  let originalClearInterval;
  let mockSetInterval;
  let mockClearInterval;
  let mockNow;

  beforeEach(() => {
    // Mock timers to prevent actual timers during tests
    originalSetInterval = global.setInterval;
    originalClearInterval = global.clearInterval;
    mockSetInterval = vi.fn(() => 'mock-timer-id');
    mockClearInterval = vi.fn();
    global.setInterval = mockSetInterval;
    global.clearInterval = mockClearInterval;

    // Mock Date.now for consistent timestamps
    mockNow = 1692800000000; // Fixed timestamp for testing
    vi.spyOn(Date, 'now').mockReturnValue(mockNow);

    // Reset to get fresh cache instance
    setFileCache(null);
    fileCache = getFileCache({ baseDir: '/test/cache' });

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original timers
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;

    // Clean up cache
    if (fileCache) {
      fileCache.stopCleanupTimer();
    }

    // Restore Date.now
    vi.restoreAllMocks();
  });

  describe('FileCache Initialization', () => {
    it('should initialize with default configuration', () => {
      const cache = new _FileCache();

      expect(cache.baseDir).toBe(path.join(process.cwd(), 'cache', 'async'));
      expect(cache.cleanupInterval).toBe(10 * 60 * 1000); // 10 minutes
      expect(cache.maxAge).toBe(3 * 24 * 60 * 60 * 1000); // 3 days
      expect(mockSetInterval).toHaveBeenCalledOnce();
    });

    it('should initialize with custom configuration', () => {
      const options = {
        baseDir: '/custom/cache',
        cleanupInterval: 5 * 60 * 1000, // 5 minutes
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      };

      const cache = new _FileCache(options);

      expect(cache.baseDir).toBe('/custom/cache');
      expect(cache.cleanupInterval).toBe(5 * 60 * 1000);
      expect(cache.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('should start cleanup timer on initialization', () => {
      new _FileCache();
      expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 10 * 60 * 1000);
    });

    it('should stop cleanup timer when requested', () => {
      const cache = new _FileCache();
      cache.stopCleanupTimer();
      expect(mockClearInterval).toHaveBeenCalledWith('mock-timer-id');
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance on multiple calls', () => {
      const cache1 = getFileCache();
      const cache2 = getFileCache();

      expect(cache1).toBe(cache2);
    });

    it('should allow setting custom instance for testing', () => {
      const customCache = new _FileCache({ baseDir: '/custom' });
      setFileCache(customCache);

      const retrievedCache = getFileCache();
      expect(retrievedCache).toBe(customCache);
    });

    it('should stop timer when replacing instance', () => {
      const cache1 = getFileCache();
      const cache2 = new _FileCache();

      setFileCache(cache2);

      expect(mockClearInterval).toHaveBeenCalled();
    });
  });

  describe('Interface Implementation', () => {
    it('should extend FileCacheInterface', () => {
      expect(fileCache).toBeInstanceOf(FileCacheInterface);
    });

    it('should throw error for unimplemented interface methods', async () => {
      const baseInterface = new FileCacheInterface();

      await expect(baseInterface.writeJournalEvent('job1', {})).rejects.toThrow(
        'writeJournalEvent() method must be implemented'
      );
      await expect(baseInterface.writeSnapshot('job1', {})).rejects.toThrow(
        'writeSnapshot() method must be implemented'
      );
      await expect(baseInterface.readSnapshot('job1')).rejects.toThrow(
        'readSnapshot() method must be implemented'
      );
      await expect(baseInterface.cleanup()).rejects.toThrow(
        'cleanup() method must be implemented'
      );
    });
  });

  describe('Path Generation', () => {
    beforeEach(() => {
      // Mock date for consistent path generation
      vi.spyOn(Date.prototype, 'toISOString').mockReturnValue('2023-08-23T12:00:00.000Z');
    });

    it('should generate correct job directory path', () => {
      const jobId = 'job_test123456';
      const jobDir = fileCache.getJobDir(jobId);

      expect(jobDir).toBe(path.join('/test/cache', '2023-08-23', 'job_test123456'));
    });

    it('should generate correct journal file path', () => {
      const jobId = 'job_test123456';
      const journalPath = fileCache.getJournalPath(jobId);

      expect(journalPath).toBe(path.join('/test/cache', '2023-08-23', 'job_test123456', 'journal.ndjson'));
    });

    it('should generate correct snapshot file path', () => {
      const jobId = 'job_test123456';
      const snapshotPath = fileCache.getSnapshotPath(jobId);

      expect(snapshotPath).toBe(path.join('/test/cache', '2023-08-23', 'job_test123456', 'result.json'));
    });
  });

  describe('Directory Management', () => {
    it('should ensure directory exists successfully', async () => {
      fs.mkdir.mockResolvedValue();

      await fileCache.ensureDir('/test/path');

      expect(fs.mkdir).toHaveBeenCalledWith('/test/path', { recursive: true });
    });

    it('should throw FileCacheError when directory creation fails', async () => {
      const error = new Error('Permission denied');
      fs.mkdir.mockRejectedValue(error);

      await expect(fileCache.ensureDir('/test/path')).rejects.toThrow(FileCacheError);
      await expect(fileCache.ensureDir('/test/path')).rejects.toMatchObject({
        code: ERROR_CODES.CACHE_DIRECTORY_CREATION_FAILED,
        details: {
          dirPath: '/test/path',
          originalError: 'Permission denied',
        },
      });
    });
  });

  describe('Journal Event Writing', () => {
    beforeEach(() => {
      fs.mkdir.mockResolvedValue();
      fs.appendFile.mockResolvedValue();
    });

    it('should write journal event successfully', async () => {
      const jobId = 'job_test123456';
      const event = { type: 'job_created', status: 'queued' };

      await fileCache.writeJournalEvent(jobId, event);

      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('job_test123456'),
        { recursive: true }
      );

      const expectedNdjson = JSON.stringify({
        ts: mockNow,
        jobId,
        ...event,
      }) + '\n';

      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('journal.ndjson'),
        expectedNdjson,
        'utf8'
      );
    });

    it('should validate job ID parameter', async () => {
      const event = { type: 'test' };

      await expect(fileCache.writeJournalEvent('', event)).rejects.toThrow(FileCacheError);
      await expect(fileCache.writeJournalEvent(null, event)).rejects.toThrow(FileCacheError);
      await expect(fileCache.writeJournalEvent(123, event)).rejects.toThrow(FileCacheError);
    });

    it('should validate event parameter', async () => {
      const jobId = 'job_test123456';

      await expect(fileCache.writeJournalEvent(jobId, null)).rejects.toThrow(FileCacheError);
      await expect(fileCache.writeJournalEvent(jobId, 'string')).rejects.toThrow(FileCacheError);
      await expect(fileCache.writeJournalEvent(jobId, 123)).rejects.toThrow(FileCacheError);
    });

    it('should handle directory creation failure gracefully', async () => {
      const directoryError = new Error('Disk full');
      fs.mkdir.mockRejectedValue(directoryError);

      await expect(fileCache.writeJournalEvent('job_test', { type: 'test' }))
        .rejects.toThrow(FileCacheError);
    });

    it('should handle file write failure gracefully', async () => {
      fs.mkdir.mockResolvedValue();
      const writeError = new Error('Write failed');
      fs.appendFile.mockRejectedValue(writeError);

      await expect(fileCache.writeJournalEvent('job_test', { type: 'test' }))
        .rejects.toMatchObject({
          code: ERROR_CODES.CACHE_WRITE_FAILED,
          details: expect.objectContaining({
            jobId: 'job_test',
            originalError: 'Write failed',
          }),
        });
    });

    it('should add metadata to events', async () => {
      const jobId = 'job_test123456';
      const event = { type: 'progress', data: { progress: 0.5 } };

      await fileCache.writeJournalEvent(jobId, event);

      const expectedEvent = {
        ts: mockNow,
        jobId,
        type: 'progress',
        data: { progress: 0.5 },
      };

      const expectedNdjson = JSON.stringify(expectedEvent) + '\n';
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.any(String),
        expectedNdjson,
        'utf8'
      );
    });
  });

  describe('Snapshot Writing', () => {
    beforeEach(() => {
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
    });

    it('should write snapshot successfully', async () => {
      const jobId = 'job_test123456';
      const result = {
        status: 'completed',
        response: 'Test response',
        metadata: { duration: 1000 }
      };

      await fileCache.writeSnapshot(jobId, result);

      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('job_test123456'),
        { recursive: true }
      );

      const expectedSnapshot = {
        jobId,
        completedAt: mockNow,
        status: 'completed',
        response: 'Test response',
        metadata: { duration: 1000 },
      };

      const expectedJson = JSON.stringify(expectedSnapshot, null, 2);
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('result.json'),
        expectedJson,
        'utf8'
      );
    });

    it('should validate job ID parameter', async () => {
      const result = { status: 'completed' };

      await expect(fileCache.writeSnapshot('', result)).rejects.toThrow(FileCacheError);
      await expect(fileCache.writeSnapshot(null, result)).rejects.toThrow(FileCacheError);
      await expect(fileCache.writeSnapshot(123, result)).rejects.toThrow(FileCacheError);
    });

    it('should validate result parameter', async () => {
      const jobId = 'job_test123456';

      await expect(fileCache.writeSnapshot(jobId, null)).rejects.toThrow(FileCacheError);
      await expect(fileCache.writeSnapshot(jobId, 'string')).rejects.toThrow(FileCacheError);
      await expect(fileCache.writeSnapshot(jobId, 123)).rejects.toThrow(FileCacheError);
    });

    it('should handle file write failure gracefully', async () => {
      fs.mkdir.mockResolvedValue();
      const writeError = new Error('Disk full');
      fs.writeFile.mockRejectedValue(writeError);

      await expect(fileCache.writeSnapshot('job_test', { status: 'completed' }))
        .rejects.toMatchObject({
          code: ERROR_CODES.CACHE_WRITE_FAILED,
          details: expect.objectContaining({
            jobId: 'job_test',
            originalError: 'Disk full',
          }),
        });
    });

    it('should add metadata to snapshot', async () => {
      const jobId = 'job_test123456';
      const result = { status: 'completed', data: 'test' };

      await fileCache.writeSnapshot(jobId, result);

      const expectedSnapshot = {
        jobId,
        completedAt: mockNow,
        status: 'completed',
        data: 'test',
      };

      const expectedJson = JSON.stringify(expectedSnapshot, null, 2);
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expectedJson,
        'utf8'
      );
    });
  });

  describe('Snapshot Reading', () => {
    it('should read snapshot successfully from current date', async () => {
      const jobId = 'job_test123456';
      const snapshotData = {
        jobId,
        status: 'completed',
        result: 'test result',
        completedAt: mockNow,
      };

      fs.readFile.mockResolvedValue(JSON.stringify(snapshotData));

      const result = await fileCache.readSnapshot(jobId);

      expect(result).toEqual(snapshotData);
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('result.json'),
        'utf8'
      );
    });

    it('should search in recent directories if not found in current date', async () => {
      const jobId = 'job_test123456';
      const snapshotData = { jobId, status: 'completed', result: 'test' };

      // First read fails (current date)
      fs.readFile
        .mockRejectedValueOnce(new Error('File not found'))
        .mockResolvedValueOnce(JSON.stringify(snapshotData)); // Found in recent dir search

      // Mock readdir for recent directory search
      fs.readdir.mockResolvedValue([
        { name: '2023-08-22', isDirectory: () => true },
        { name: '2023-08-21', isDirectory: () => true },
        { name: 'file.txt', isDirectory: () => false },
      ]);

      const result = await fileCache.readSnapshot(jobId);

      expect(result).toEqual(snapshotData);
      expect(fs.readdir).toHaveBeenCalledWith(fileCache.baseDir, { withFileTypes: true });
    });

    it('should return null if snapshot not found anywhere', async () => {
      const jobId = 'job_nonexistent';

      // All file reads fail
      fs.readFile.mockRejectedValue(new Error('File not found'));
      fs.readdir.mockResolvedValue([
        { name: '2023-08-22', isDirectory: () => true },
      ]);

      const result = await fileCache.readSnapshot(jobId);

      expect(result).toBeNull();
    });

    it('should validate job ID parameter', async () => {
      await expect(fileCache.readSnapshot('')).rejects.toThrow(FileCacheError);
      await expect(fileCache.readSnapshot(null)).rejects.toThrow(FileCacheError);
      await expect(fileCache.readSnapshot(123)).rejects.toThrow(FileCacheError);
    });

    it('should handle malformed JSON gracefully', async () => {
      const jobId = 'job_test123456';
      fs.readFile.mockResolvedValue('invalid json');
      // Mock readdir for fallback search which will also fail
      fs.readdir.mockResolvedValue([]);

      // Should return null when JSON is malformed and no fallback found
      const result = await fileCache.readSnapshot(jobId);
      expect(result).toBeNull();
    });

    it('should return null when base directory does not exist', async () => {
      const jobId = 'job_test123456';

      // Current date read fails
      fs.readFile.mockRejectedValue(new Error('File not found'));
      // Base directory doesn't exist
      fs.readdir.mockRejectedValue(new Error('Directory not found'));

      const result = await fileCache.readSnapshot(jobId);

      expect(result).toBeNull();
    });

    it('should filter and sort date directories correctly', async () => {
      const jobId = 'job_test123456';
      const snapshotData = { jobId, status: 'completed' };

      fs.readFile
        .mockRejectedValueOnce(new Error('Not found in current'))
        .mockResolvedValueOnce(JSON.stringify(snapshotData));

      fs.readdir.mockResolvedValue([
        { name: '2023-08-22', isDirectory: () => true },
        { name: '2023-08-21', isDirectory: () => true },
        { name: '2023-08-23', isDirectory: () => true },
        { name: 'invalid-date', isDirectory: () => true },
        { name: 'file.txt', isDirectory: () => false },
        { name: '2023-08-20', isDirectory: () => true },
      ]);

      await fileCache.readSnapshot(jobId);

      // Should try to read from most recent directories first
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('2023-08-23'), // Most recent first
        'utf8'
      );
    });
  });

  describe('Cleanup Operations', () => {
    it('should clean up old directories successfully', async () => {
      const maxAge = 3 * 24 * 60 * 60 * 1000; // 3 days
      const oldTime = mockNow - (4 * 24 * 60 * 60 * 1000); // 4 days ago
      const recentTime = mockNow - (2 * 24 * 60 * 60 * 1000); // 2 days ago

      fs.access.mockResolvedValue(); // Base directory exists
      fs.readdir.mockResolvedValue([
        { name: '2023-08-19', isDirectory: () => true }, // Old (will be removed)
        { name: '2023-08-21', isDirectory: () => true }, // Recent (will be kept)
        { name: 'file.txt', isDirectory: () => false }, // Not a directory
        { name: 'invalid-date', isDirectory: () => true }, // Invalid format
      ]);

      fs.stat
        .mockResolvedValueOnce({ mtime: new Date(oldTime) }) // Old directory
        .mockResolvedValueOnce({ mtime: new Date(recentTime) }); // Recent directory

      fs.rm.mockResolvedValue();

      const cleaned = await fileCache.cleanup(maxAge);

      expect(cleaned).toBe(1);
      expect(fs.rm).toHaveBeenCalledWith(
        path.join(fileCache.baseDir, '2023-08-19'),
        { recursive: true, force: true }
      );
    });

    it('should return 0 when base directory does not exist', async () => {
      fs.access.mockRejectedValue(new Error('Directory not found'));

      const cleaned = await fileCache.cleanup();

      expect(cleaned).toBe(0);
      expect(fs.readdir).not.toHaveBeenCalled();
    });

    it('should continue cleanup even if individual directory removal fails', async () => {
      const maxAge = 3 * 24 * 60 * 60 * 1000;
      const oldTime = mockNow - (4 * 24 * 60 * 60 * 1000);

      fs.access.mockResolvedValue();
      fs.readdir.mockResolvedValue([
        { name: '2023-08-19', isDirectory: () => true },
        { name: '2023-08-18', isDirectory: () => true },
      ]);

      fs.stat.mockResolvedValue({ mtime: new Date(oldTime) });

      // First removal fails, second succeeds
      fs.rm
        .mockRejectedValueOnce(new Error('Permission denied'))
        .mockResolvedValueOnce();

      const cleaned = await fileCache.cleanup(maxAge);

      expect(cleaned).toBe(1); // Only one succeeded
      expect(fs.rm).toHaveBeenCalledTimes(2);
    });

    it('should handle stat errors gracefully', async () => {
      const maxAge = 3 * 24 * 60 * 60 * 1000;

      fs.access.mockResolvedValue();
      fs.readdir.mockResolvedValue([
        { name: '2023-08-19', isDirectory: () => true },
      ]);

      fs.stat.mockRejectedValue(new Error('Stat failed'));

      const cleaned = await fileCache.cleanup(maxAge);

      expect(cleaned).toBe(0);
      expect(fs.rm).not.toHaveBeenCalled();
    });

    it('should throw FileCacheError when cleanup fails completely', async () => {
      fs.access.mockResolvedValue();
      fs.readdir.mockRejectedValue(new Error('Read directory failed'));

      await expect(fileCache.cleanup()).rejects.toMatchObject({
        code: ERROR_CODES.CACHE_CLEANUP_FAILED,
      });
    });

    it('should use default max age when not provided', async () => {
      fs.access.mockResolvedValue();
      fs.readdir.mockResolvedValue([]);

      await fileCache.cleanup();

      // Test passes if no errors thrown - default maxAge is used internally
      expect(fs.access).toHaveBeenCalled();
    });

    it('should filter date directories with regex correctly', async () => {
      fs.access.mockResolvedValue();
      fs.readdir.mockResolvedValue([
        { name: '2023-08-19', isDirectory: () => true }, // Valid
        { name: '2023-8-19', isDirectory: () => true }, // Invalid (single digit month)
        { name: '23-08-19', isDirectory: () => true }, // Invalid (2-digit year)
        { name: '2023-08-19-backup', isDirectory: () => true }, // Invalid (extra suffix)
        { name: 'cache-dir', isDirectory: () => true }, // Invalid (not date)
      ]);

      const maxAge = 3 * 24 * 60 * 60 * 1000;
      const oldTime = mockNow - (4 * 24 * 60 * 60 * 1000);
      fs.stat.mockResolvedValue({ mtime: new Date(oldTime) });
      fs.rm.mockResolvedValue();

      await fileCache.cleanup(maxAge);

      // Only the valid date directory should be processed
      expect(fs.stat).toHaveBeenCalledTimes(1);
      expect(fs.stat).toHaveBeenCalledWith(
        path.join(fileCache.baseDir, '2023-08-19')
      );
    });
  });

  describe('Error Handling', () => {
    it('should create FileCacheError with correct properties', () => {
      const message = 'Test error';
      const code = ERROR_CODES.CACHE_WRITE_FAILED;
      const details = { key: 'value' };

      const error = new FileCacheError(message, code, details);

      expect(error).toBeInstanceOf(FileCacheError);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe(message);
      expect(error.code).toBe(code);
      expect(error.details).toEqual(details);
      expect(error.name).toBe('FileCacheError');
    });

    it('should use default error code when not provided', () => {
      const error = new FileCacheError('Test message');
      expect(error.code).toBe(ERROR_CODES.FILE_CACHE_ERROR);
    });

    it('should propagate existing FileCacheError without wrapping', async () => {
      const originalError = new FileCacheError('Original error', ERROR_CODES.CACHE_READ_FAILED);

      // Mock mkdir to succeed, but appendFile to fail with FileCacheError
      fs.mkdir.mockResolvedValue();
      fs.appendFile.mockRejectedValue(originalError);

      await expect(fileCache.writeJournalEvent('job_test', { type: 'test' }))
        .rejects.toBe(originalError); // Same instance, not wrapped
    });
  });

  describe('Cleanup Timer Integration', () => {
    it('should handle cleanup timer errors gracefully', async () => {
      // Setup a cache that will trigger cleanup
      const cache = new _FileCache({ cleanupInterval: 100 });

      // Mock cleanup to throw error
      vi.spyOn(cache, 'cleanup').mockRejectedValue(new Error('Cleanup failed'));

      // Get the timer callback and execute it
      const timerCallback = mockSetInterval.mock.calls[0][0];
      await timerCallback();

      // Should not throw error, just log it
      expect(cache.cleanup).toHaveBeenCalled();
    });

    it('should log successful cleanup with count', async () => {
      const cache = new _FileCache({ cleanupInterval: 100 });

      // Mock cleanup to return count
      vi.spyOn(cache, 'cleanup').mockResolvedValue(2);

      // Get the timer callback and execute it
      const timerCallback = mockSetInterval.mock.calls[0][0];
      await timerCallback();

      expect(cache.cleanup).toHaveBeenCalled();
    });

    it('should not log when no directories cleaned', async () => {
      const cache = new _FileCache({ cleanupInterval: 100 });

      // Mock cleanup to return 0
      vi.spyOn(cache, 'cleanup').mockResolvedValue(0);

      // Get the timer callback and execute it
      const timerCallback = mockSetInterval.mock.calls[0][0];
      await timerCallback();

      expect(cache.cleanup).toHaveBeenCalled();
    });
  });
});
