/**
 * File Cache System - Persistent Job Storage
 *
 * Provides file-based caching for persisting async job progress and results to disk
 * using Node.js native fs/promises API. Uses NDJSON journal files for streaming
 * progress events and JSON snapshots for final results. Provides durability across
 * server restarts with 3-day retention and automatic cleanup.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { debugLog, debugError } from '../utils/console.js';
import { ConverseMCPError, ERROR_CODES } from '../utils/errorHandler.js';
import { isSafeIdSegment } from '../utils/idValidation.js';

/**
 * File cache specific error class
 */
export class FileCacheError extends ConverseMCPError {
  constructor(message, code = ERROR_CODES.FILE_CACHE_ERROR, details = {}) {
    super(message, code, details);
    this.name = 'FileCacheError';
  }
}

/**
 * Storage backend interface that all file cache implementations must implement
 * This ensures pluggable backend replacement without changing the API
 */
export class FileCacheInterface {
  /**
   * Write journal event to NDJSON file
   * @param {string} _jobId - Job identifier
   * @param {object} _event - Event data to append
   * @returns {Promise<void>}
   */
  async writeJournalEvent(_jobId, _event) {
    throw new Error(
      'writeJournalEvent() method must be implemented by file cache backend',
    );
  }

  /**
   * Write final snapshot to JSON file
   * @param {string} _jobId - Job identifier
   * @param {object} _result - Final result data
   * @returns {Promise<void>}
   */
  async writeSnapshot(_jobId, _result) {
    throw new Error(
      'writeSnapshot() method must be implemented by file cache backend',
    );
  }

  /**
   * Read snapshot from JSON file
   * @param {string} _jobId - Job identifier
   * @returns {Promise<object|null>} Job result or null if not found
   */
  async readSnapshot(_jobId) {
    throw new Error(
      'readSnapshot() method must be implemented by file cache backend',
    );
  }

  /**
   * Clean up old cache directories
   * @param {number} _maxAgeMs - Maximum age in milliseconds (default: 3 days)
   * @returns {Promise<number>} Number of directories cleaned up
   */
  async cleanup(_maxAgeMs = 3 * 24 * 60 * 60 * 1000) {
    throw new Error(
      'cleanup() method must be implemented by file cache backend',
    );
  }
}

/**
 * File-based cache implementation using native fs/promises
 */
export class FileCache extends FileCacheInterface {
  constructor(options = {}) {
    super();
    this.baseDir =
      options.baseDir ||
      process.env.ASYNC_CACHE_DIR ||
      path.join(process.cwd(), 'cache', 'async');
    this.cleanupInterval = options.cleanupInterval || 10 * 60 * 1000; // 10 minutes

    // Check environment variable for disk TTL
    const envDiskTTL = process.env.ASYNC_DISK_TTL_MS
      ? parseInt(process.env.ASYNC_DISK_TTL_MS, 10)
      : null;
    this.maxAge = options.maxAge || envDiskTTL || 3 * 24 * 60 * 60 * 1000; // 3 days default

    this.cleanupTimer = null;

    // Start cleanup timer
    this.startCleanupTimer();

    debugLog(
      'FileCache',
      `Initialized with baseDir: ${this.baseDir}, maxAge: ${this.maxAge}ms`,
    );
  }

  /**
   * Start periodic cleanup timer
   * @private
   */
  startCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(async () => {
      try {
        const cleaned = await this.cleanup();
        if (cleaned > 0) {
          debugLog(
            'FileCache',
            `Cleanup completed: ${cleaned} directories removed`,
          );
        }
      } catch (error) {
        debugError('FileCache', 'Cleanup timer error:', error);
      }
    }, this.cleanupInterval);

    // Unref the interval so it doesn't keep the process alive
    if (this.cleanupTimer && typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop cleanup timer
   */
  stopCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Get job directory path
   * @param {string} jobId - Job identifier
   * @returns {string} Directory path
   * @private
   */
  getJobDir(jobId) {
    if (!isSafeIdSegment(jobId)) {
      throw new FileCacheError(
        'Job ID contains unsafe characters',
        ERROR_CODES.VALIDATION_ERROR,
        { jobId },
      );
    }

    const today = new Date().toISOString().split('T')[0]; // yyyy-mm-dd
    return path.join(this.baseDir, today, jobId);
  }

  /**
   * Get journal file path
   * @param {string} jobId - Job identifier
   * @returns {string} Journal file path
   * @private
   */
  getJournalPath(jobId) {
    return path.join(this.getJobDir(jobId), 'journal.ndjson');
  }

  /**
   * Get snapshot file path
   * @param {string} jobId - Job identifier
   * @returns {string} Snapshot file path
   * @private
   */
  getSnapshotPath(jobId) {
    return path.join(this.getJobDir(jobId), 'result.json');
  }

  /**
   * Ensure directory exists
   * @param {string} dirPath - Directory path to create
   * @returns {Promise<void>}
   * @private
   */
  async ensureDir(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      throw new FileCacheError(
        `Failed to create directory: ${dirPath}`,
        ERROR_CODES.CACHE_DIRECTORY_CREATION_FAILED,
        { dirPath, originalError: error.message },
      );
    }
  }

  /**
   * Write journal event to NDJSON file
   * @param {string} jobId - Job identifier
   * @param {object} event - Event data to append
   * @returns {Promise<void>}
   */
  async writeJournalEvent(jobId, event) {
    if (!jobId || typeof jobId !== 'string') {
      throw new FileCacheError(
        'Job ID must be a non-empty string',
        ERROR_CODES.VALIDATION_ERROR,
        { jobId },
      );
    }

    if (!isSafeIdSegment(jobId)) {
      throw new FileCacheError(
        'Job ID contains unsafe characters',
        ERROR_CODES.VALIDATION_ERROR,
        { jobId },
      );
    }

    if (!event || typeof event !== 'object') {
      throw new FileCacheError(
        'Event must be an object',
        ERROR_CODES.CACHE_WRITE_FAILED,
        { jobId, event },
      );
    }

    try {
      const jobDir = this.getJobDir(jobId);
      const journalPath = this.getJournalPath(jobId);

      // Ensure directory exists
      await this.ensureDir(jobDir);

      // Add timestamp and sequence if not present
      const eventWithMeta = {
        ts: Date.now(),
        jobId,
        ...event,
      };

      // Append NDJSON line
      const ndjsonLine = JSON.stringify(eventWithMeta) + '\n';
      await fs.appendFile(journalPath, ndjsonLine, 'utf8');

      debugLog(
        'FileCache',
        `Journal event written for job ${jobId}:`,
        event.type || 'unknown',
      );
    } catch (error) {
      if (error instanceof FileCacheError) {
        throw error;
      }

      debugError(
        'FileCache',
        `Failed to write journal event for job ${jobId}:`,
        error,
      );
      throw new FileCacheError(
        `Failed to write journal event for job ${jobId}`,
        ERROR_CODES.CACHE_WRITE_FAILED,
        { jobId, event, originalError: error.message },
      );
    }
  }

  /**
   * Write final snapshot to JSON file
   * @param {string} jobId - Job identifier
   * @param {object} result - Final result data
   * @returns {Promise<void>}
   */
  async writeSnapshot(jobId, result) {
    if (!jobId || typeof jobId !== 'string') {
      throw new FileCacheError(
        'Job ID must be a non-empty string',
        ERROR_CODES.VALIDATION_ERROR,
        { jobId },
      );
    }

    if (!isSafeIdSegment(jobId)) {
      throw new FileCacheError(
        'Job ID contains unsafe characters',
        ERROR_CODES.VALIDATION_ERROR,
        { jobId },
      );
    }

    if (!result || typeof result !== 'object') {
      throw new FileCacheError(
        'Result must be an object',
        ERROR_CODES.CACHE_WRITE_FAILED,
        { jobId, result },
      );
    }

    try {
      const jobDir = this.getJobDir(jobId);
      const snapshotPath = this.getSnapshotPath(jobId);

      // Ensure directory exists
      await this.ensureDir(jobDir);

      // Add metadata if not present
      const snapshot = {
        jobId,
        completedAt: Date.now(),
        ...result,
      };

      // Write pretty-printed JSON
      const jsonContent = JSON.stringify(snapshot, null, 2);
      await fs.writeFile(snapshotPath, jsonContent, 'utf8');

      debugLog('FileCache', `Snapshot written for job ${jobId}`);
    } catch (error) {
      if (error instanceof FileCacheError) {
        throw error;
      }

      debugError(
        'FileCache',
        `Failed to write snapshot for job ${jobId}:`,
        error,
      );
      throw new FileCacheError(
        `Failed to write snapshot for job ${jobId}`,
        ERROR_CODES.CACHE_WRITE_FAILED,
        { jobId, result, originalError: error.message },
      );
    }
  }

  /**
   * Read snapshot from JSON file
   * @param {string} jobId - Job identifier
   * @returns {Promise<object|null>} Job result or null if not found or expired
   */
  async readSnapshot(jobId) {
    if (!jobId || typeof jobId !== 'string') {
      throw new FileCacheError(
        'Job ID must be a non-empty string',
        ERROR_CODES.VALIDATION_ERROR,
        { jobId },
      );
    }

    if (!isSafeIdSegment(jobId)) {
      throw new FileCacheError(
        'Job ID contains unsafe characters',
        ERROR_CODES.VALIDATION_ERROR,
        { jobId },
      );
    }

    try {
      // Try current date first
      const snapshotPath = this.getSnapshotPath(jobId);

      try {
        const content = await fs.readFile(snapshotPath, 'utf8');
        const snapshot = JSON.parse(content);

        // Check if snapshot has expired based on TTL
        if (snapshot.updated_at || snapshot.ended_at) {
          const lastUpdate = snapshot.updated_at || snapshot.ended_at;
          const age = Date.now() - lastUpdate;
          if (age > this.maxAge) {
            debugLog(
              'FileCache',
              `Snapshot for job ${jobId} has expired (age: ${age}ms, maxAge: ${this.maxAge}ms)`,
            );
            return null;
          }
        }

        debugLog(
          'FileCache',
          `Snapshot read for job ${jobId} from current date`,
        );
        return snapshot;
      } catch (_currentDateError) {
        // If not found in current date, search in recent directories
        const result = await this.searchSnapshotInRecentDirs(jobId);
        if (result) {
          // Check if found snapshot has expired
          if (result.updated_at || result.ended_at) {
            const lastUpdate = result.updated_at || result.ended_at;
            const age = Date.now() - lastUpdate;
            if (age > this.maxAge) {
              debugLog(
                'FileCache',
                `Snapshot for job ${jobId} has expired (age: ${age}ms, maxAge: ${this.maxAge}ms)`,
              );
              return null;
            }
          }

          debugLog(
            'FileCache',
            `Snapshot read for job ${jobId} from recent directories`,
          );
          return result;
        }

        // If still not found, return null (not an error)
        debugLog('FileCache', `Snapshot not found for job ${jobId}`);
        return null;
      }
    } catch (error) {
      if (error instanceof FileCacheError) {
        throw error;
      }

      debugError(
        'FileCache',
        `Failed to read snapshot for job ${jobId}:`,
        error,
      );
      throw new FileCacheError(
        `Failed to read snapshot for job ${jobId}`,
        ERROR_CODES.CACHE_READ_FAILED,
        { jobId, originalError: error.message },
      );
    }
  }

  /**
   * Search for snapshot in recent directories
   * @param {string} jobId - Job identifier
   * @returns {Promise<object|null>} Job result or null if not found
   * @private
   */
  async searchSnapshotInRecentDirs(jobId) {
    try {
      // Get directories in base directory
      const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
      const dateDirs = entries
        .filter(
          (entry) =>
            entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name),
        )
        .sort((a, b) => b.name.localeCompare(a.name)) // Most recent first
        .slice(0, 10); // Only check last 10 days

      for (const dateDir of dateDirs) {
        const snapshotPath = path.join(
          this.baseDir,
          dateDir.name,
          jobId,
          'result.json',
        );
        try {
          const content = await fs.readFile(snapshotPath, 'utf8');
          return JSON.parse(content);
        } catch {
          // Continue searching in other directories
        }
      }

      return null;
    } catch {
      // If base directory doesn't exist or other error, return null
      return null;
    }
  }

  /**
   * List recent completed jobs from cache
   * @param {object} options - Query options
   * @param {number} options.limit - Maximum number of jobs to return (default: 10)
   * @param {number} options.daysBack - Number of days to look back (default: 3)
   * @returns {Promise<Array>} Array of job snapshots
   */
  async listRecentJobs(options = {}) {
    const { limit = 10, daysBack = 3 } = options;
    const jobs = [];

    try {
      // Check if base directory exists
      try {
        await fs.access(this.baseDir);
      } catch {
        // Base directory doesn't exist, return empty array
        return jobs;
      }

      // Get directories in base directory
      const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
      const dateDirs = entries
        .filter(
          (entry) =>
            entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name),
        )
        .sort((a, b) => b.name.localeCompare(a.name)) // Most recent first
        .slice(0, daysBack); // Only check specified days back

      // Iterate through date directories
      for (const dateDir of dateDirs) {
        if (jobs.length >= limit) break;

        const dateDirPath = path.join(this.baseDir, dateDir.name);

        try {
          // Get all job directories in this date
          const jobEntries = await fs.readdir(dateDirPath, {
            withFileTypes: true,
          });
          const jobDirs = jobEntries
            .filter((entry) => entry.isDirectory())
            .sort((a, b) => {
              // Try to sort by modification time if possible
              try {
                const aPath = path.join(dateDirPath, a.name);
                const bPath = path.join(dateDirPath, b.name);
                const aStat = fs.statSync(aPath);
                const bStat = fs.statSync(bPath);
                return bStat.mtime.getTime() - aStat.mtime.getTime();
              } catch {
                return 0;
              }
            });

          // Check each job directory for a result.json
          for (const jobDir of jobDirs) {
            if (jobs.length >= limit) break;

            const snapshotPath = path.join(
              dateDirPath,
              jobDir.name,
              'result.json',
            );

            try {
              const content = await fs.readFile(snapshotPath, 'utf8');
              const snapshot = JSON.parse(content);

              // Add the job to our list if it's completed
              if (
                snapshot &&
                (snapshot.status === 'completed' ||
                  snapshot.status === 'failed' ||
                  snapshot.status === 'cancelled')
              ) {
                jobs.push(snapshot);
              }
            } catch {
              // Skip jobs without valid snapshots
              continue;
            }
          }
        } catch (error) {
          debugError(
            'FileCache',
            `Failed to read date directory ${dateDir.name}:`,
            error,
          );
          // Continue with other directories
        }
      }

      debugLog('FileCache', `Listed ${jobs.length} recent jobs from cache`);
      return jobs;
    } catch (error) {
      debugError('FileCache', 'Failed to list recent jobs:', error);
      // Return whatever we've collected so far
      return jobs;
    }
  }

  /**
   * Clean up old cache directories
   * @param {number} maxAgeMs - Maximum age in milliseconds (default: 3 days)
   * @returns {Promise<number>} Number of directories cleaned up
   */
  async cleanup(maxAgeMs = this.maxAge) {
    try {
      const now = Date.now();
      let cleanedCount = 0;

      // Check if base directory exists
      try {
        await fs.access(this.baseDir);
      } catch {
        // Base directory doesn't exist, nothing to clean
        debugLog(
          'FileCache',
          'Base directory does not exist, skipping cleanup',
        );
        return 0;
      }

      // Get all date directories
      const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
      const dateDirs = entries.filter(
        (entry) =>
          entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name),
      );

      for (const dateDir of dateDirs) {
        const dirPath = path.join(this.baseDir, dateDir.name);

        try {
          const stats = await fs.stat(dirPath);
          const age = now - stats.mtime.getTime();

          if (age > maxAgeMs) {
            await fs.rm(dirPath, { recursive: true, force: true });
            cleanedCount++;
            debugLog('FileCache', `Cleaned up old directory: ${dateDir.name}`);
          }
        } catch (error) {
          debugError(
            'FileCache',
            `Failed to clean directory ${dateDir.name}:`,
            error,
          );
          // Continue with other directories
        }
      }

      return cleanedCount;
    } catch (error) {
      debugError('FileCache', 'Cleanup failed:', error);
      throw new FileCacheError(
        'Failed to cleanup old cache directories',
        ERROR_CODES.CACHE_CLEANUP_FAILED,
        { maxAgeMs, originalError: error.message },
      );
    }
  }
}

// Singleton instance
let fileCacheInstance = null;

/**
 * Get the singleton FileCache instance
 * @param {object} options - Configuration options
 * @returns {FileCache} FileCache instance
 */
export function getFileCache(options = {}) {
  if (!fileCacheInstance) {
    fileCacheInstance = new FileCache(options);
  }
  return fileCacheInstance;
}

/**
 * Set the FileCache instance (primarily for testing)
 * @param {FileCache|null} instance - FileCache instance or null to reset
 */
export function setFileCache(instance) {
  if (fileCacheInstance) {
    fileCacheInstance.stopCleanupTimer();
  }
  fileCacheInstance = instance;
}

/**
 * Stop the file cache cleanup timer
 */
export function stopFileCacheCleanup() {
  if (fileCacheInstance) {
    fileCacheInstance.stopCleanupTimer();
  }
}

// Export for testing
export { FileCache as _FileCache };
