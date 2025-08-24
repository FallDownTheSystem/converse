/**
 * Session Context Management
 * 
 * Uses AsyncLocalStorage to maintain session context across async operations.
 * This allows tools to access the current session ID without explicit passing.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

// Create async local storage for session context
const sessionStorage = new AsyncLocalStorage();

/**
 * Run a function with a specific session context
 * @param {string} sessionId - Session ID to use
 * @param {Function} fn - Function to run with the session context
 * @returns {Promise} Result of the function
 */
export function runWithSession(sessionId, fn) {
  return sessionStorage.run({ sessionId }, fn);
}

/**
 * Get the current session ID from context
 * @returns {string} Current session ID or 'local-user' as default
 */
export function getCurrentSessionId() {
  const context = sessionStorage.getStore();
  return context?.sessionId || 'local-user';
}

/**
 * Check if we're running in a session context
 * @returns {boolean} True if session context exists
 */
export function hasSessionContext() {
  return sessionStorage.getStore() !== undefined;
}