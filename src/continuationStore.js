/**
 * Continuation Store - State Management
 *
 * Manages conversation history and state for persistent conversations.
 * Pluggable implementation that can be swapped for different storage backends.
 * Provides a consistent interface (get/set/delete) for state management.
 */

import { nanoid } from 'nanoid';
import { debugLog, debugError } from './utils/console.js';

/**
 * Storage backend interface that all continuation stores must implement
 * This ensures pluggable backend replacement without changing the API
 */
export class ContinuationStoreInterface {
  /**
   * Store conversation state
   * @param {string} _continuationId - Unique continuation identifier
   * @param {object} _state - Conversation state
   * @returns {Promise<void>}
   */
  async set(_continuationId, _state) {
    throw new Error('set() method must be implemented by storage backend');
  }

  /**
   * Retrieve conversation state
   * @param {string} _continuationId - Unique continuation identifier
   * @returns {Promise<object|null>} State or null if not found
   */
  async get(_continuationId) {
    throw new Error('get() method must be implemented by storage backend');
  }

  /**
   * Delete conversation state
   * @param {string} _continuationId - Unique continuation identifier
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async delete(_continuationId) {
    throw new Error('delete() method must be implemented by storage backend');
  }

  /**
   * Check if continuation exists
   * @param {string} continuationId - Unique continuation identifier
   * @returns {Promise<boolean>} True if exists
   */
  async exists(continuationId) {
    const state = await this.get(continuationId);
    return state !== null;
  }

  /**
   * Get storage statistics
   * @returns {Promise<object>} Backend-specific statistics
   */
  async getStats() {
    throw new Error('getStats() method must be implemented by storage backend');
  }

  /**
   * Clean up old data
   * @param {number} _maxAgeMs - Maximum age in milliseconds
   * @returns {Promise<number>} Number of items cleaned up
   */
  async cleanup(_maxAgeMs) {
    throw new Error('cleanup() method must be implemented by storage backend');
  }
}

/**
 * Custom error class for continuation store operations
 */
export class ContinuationStoreError extends Error {
  constructor(message, code = 'CONTINUATION_ERROR') {
    super(message);
    this.name = 'ContinuationStoreError';
    this.code = code;
  }
}

/**
 * In-memory continuation store implementation
 * Implements the ContinuationStoreInterface for pluggable backend replacement
 */
class MemoryContinuationStore extends ContinuationStoreInterface {
  constructor() {
    super(); // Call parent constructor
    this.conversations = new Map();
    this.maxConversations = 1000; // Prevent memory leaks
    this.maxMessagesPerConversation = 100;
  }

  /**
   * Store conversation state
   * @param {string} continuationId - Unique continuation identifier
   * @param {object} state - Conversation state to store
   * @returns {Promise<void>}
   * @throws {ContinuationStoreError} If storage fails
   */
  async set(continuationId, state) {
    try {
      // Validate continuation ID
      if (!continuationId || typeof continuationId !== 'string') {
        throw new ContinuationStoreError(
          'Invalid continuation ID: must be a non-empty string',
          'INVALID_CONTINUATION_ID'
        );
      }

      // Validate state object
      if (!state || typeof state !== 'object') {
        throw new ContinuationStoreError(
          'Invalid state: must be an object',
          'INVALID_STATE'
        );
      }
      // Cleanup old conversations if we hit the limit
      if (this.conversations.size >= this.maxConversations) {
        const oldestKey = this.conversations.keys().next().value;
        this.conversations.delete(oldestKey);
      }

      // Limit messages per conversation to prevent memory issues
      const sanitizedState = { ...state };
      if (sanitizedState.messages && sanitizedState.messages.length > this.maxMessagesPerConversation) {
        sanitizedState.messages = sanitizedState.messages.slice(-this.maxMessagesPerConversation);
      }

      // Store with metadata
      this.conversations.set(continuationId, {
        ...sanitizedState,
        lastAccessed: Date.now(),
        createdAt: this.conversations.has(continuationId)
          ? this.conversations.get(continuationId).createdAt
          : Date.now(),
      });

    } catch (error) {
      if (error instanceof ContinuationStoreError) {
        throw error;
      }
      throw new ContinuationStoreError(
        `Failed to store continuation: ${error.message}`,
        'STORAGE_ERROR'
      );
    }
  }

  /**
   * Retrieve conversation state
   * @param {string} continuationId - Unique continuation identifier
   * @returns {Promise<object|null>} Conversation state or null if not found
   * @throws {ContinuationStoreError} If retrieval fails
   */
  async get(continuationId) {
    try {
      // Validate continuation ID
      if (!continuationId || typeof continuationId !== 'string') {
        throw new ContinuationStoreError(
          'Invalid continuation ID: must be a non-empty string',
          'INVALID_CONTINUATION_ID'
        );
      }

      const state = this.conversations.get(continuationId);
      if (state) {
        // Update last accessed time
        state.lastAccessed = Date.now();
        // Return copy without internal metadata
        const { createdAt, lastAccessed, ...cleanState } = state;
        return {
          ...cleanState,
          _metadata: { createdAt, lastAccessed }
        };
      }
      return null;

    } catch (error) {
      if (error instanceof ContinuationStoreError) {
        throw error;
      }
      throw new ContinuationStoreError(
        `Failed to retrieve continuation: ${error.message}`,
        'RETRIEVAL_ERROR'
      );
    }
  }

  /**
   * Delete conversation state
   * @param {string} continuationId - Unique continuation identifier
   * @returns {Promise<boolean>} True if deleted, false if not found
   * @throws {ContinuationStoreError} If deletion fails
   */
  async delete(continuationId) {
    try {
      // Validate continuation ID
      if (!continuationId || typeof continuationId !== 'string') {
        throw new ContinuationStoreError(
          'Invalid continuation ID: must be a non-empty string',
          'INVALID_CONTINUATION_ID'
        );
      }

      const existed = this.conversations.has(continuationId);
      this.conversations.delete(continuationId);
      return existed;

    } catch (error) {
      if (error instanceof ContinuationStoreError) {
        throw error;
      }
      throw new ContinuationStoreError(
        `Failed to delete continuation: ${error.message}`,
        'DELETION_ERROR'
      );
    }
  }

  /**
   * Get storage statistics
   * @returns {Promise<object>} Store statistics
   */
  async getStats() {
    return {
      backend: 'memory',
      totalConversations: this.conversations.size,
      maxConversations: this.maxConversations,
      maxMessagesPerConversation: this.maxMessagesPerConversation,
      memoryUsage: process.memoryUsage(),
    };
  }

  /**
   * Clean up old conversations
   * @param {number} maxAgeMs - Maximum age in milliseconds (default: 24 hours)
   * @returns {Promise<number>} Number of conversations cleaned up
   */
  async cleanup(maxAgeMs = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    let cleanedCount = 0;

    // Special case: if maxAgeMs is 0, clean up all conversations
    if (maxAgeMs === 0) {
      cleanedCount = this.conversations.size;
      this.conversations.clear();
      return cleanedCount;
    }

    for (const [id, state] of this.conversations.entries()) {
      if (now - state.lastAccessed > maxAgeMs) {
        this.conversations.delete(id);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }
}

// Singleton instance - can be replaced for different backends
let continuationStore = null;

/**
 * Get the continuation store instance
 * @returns {ContinuationStoreInterface} Continuation store instance
 */
export function getContinuationStore() {
  if (!continuationStore) {
    continuationStore = new MemoryContinuationStore();

    // Set up periodic cleanup (runs every hour)
    setInterval(async () => {
      try {
        const cleaned = await continuationStore.cleanup();
        if (cleaned > 0) {
          debugLog(`ContinuationStore: Cleaned up ${cleaned} old conversations`);
        }
      } catch (error) {
        debugError('ContinuationStore cleanup failed:', error);
      }
    }, 60 * 60 * 1000);
  }
  return continuationStore;
}

/**
 * Set a custom continuation store backend (for testing or different implementations)
 * @param {ContinuationStoreInterface} store - Custom store implementation
 */
export function setContinuationStore(store) {
  if (!(store instanceof ContinuationStoreInterface)) {
    throw new ContinuationStoreError(
      'Store must extend ContinuationStoreInterface',
      'INVALID_STORE'
    );
  }
  continuationStore = store;
}

/**
 * Generate a new short continuation ID
 * @returns {string} Unique continuation ID (format: conv_XXXXXXXXXX)
 */
export function generateContinuationId() {
  // Generate a 10-character nanoid for short but unique IDs
  return `conv_${nanoid(10)}`;
}

/**
 * Validate continuation ID format
 * @param {string} continuationId - ID to validate
 * @returns {boolean} True if valid format
 */
export function isValidContinuationId(continuationId) {
  if (!continuationId || typeof continuationId !== 'string') {
    return false;
  }

  // Check for conv_ prefix and nanoid format (10 characters, URL-safe)
  // nanoid uses URL-safe alphabet: A-Za-z0-9_-
  const nanoidPattern = /^conv_[A-Za-z0-9_-]{10}$/;

  // Also accept legacy UUID format for backward compatibility
  const uuidPattern = /^conv_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return nanoidPattern.test(continuationId) || uuidPattern.test(continuationId);
}

/**
 * Helper function to add a message to conversation history
 * @param {object} state - Current conversation state
 * @param {object} message - Message to add
 * @returns {object} Updated state
 */
export function addMessageToHistory(state, message) {
  const messages = state.messages || [];
  return {
    ...state,
    messages: [...messages, message],
    lastUpdated: Date.now(),
  };
}
