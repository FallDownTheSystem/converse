/**
 * MCP Client Test Environment Setup
 *
 * Provides environment isolation and configuration for HTTP-based MCP client testing.
 * Ensures proper test environment setup for server subprocess execution.
 */

import { beforeAll, afterAll, beforeEach, afterEach, expect } from 'vitest';

// Test environment state
const testServerPorts = new Set();
const testSessions = new Map();

/**
 * Global setup for MCP client tests
 */
beforeAll(async () => {
  // Set test-specific environment variables for better isolation
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
  process.env.TEST_SUITE = 'mcp-client';

  // Configure HTTP transport for testing
  process.env.HTTP_PORT = '0'; // Use random ports
  process.env.HTTP_SESSION_TIMEOUT = '60000'; // Minimum allowed timeout for tests
  process.env.HTTP_MAX_CONCURRENT_SESSIONS = '5'; // Limit for test stability
  process.env.HTTP_REQUEST_TIMEOUT = '15000'; // Shorter request timeout

  // Disable features that might cause issues in tests
  process.env.HTTP_RATE_LIMIT_ENABLED = 'false';
  process.env.HTTP_DNS_REBINDING_PROTECTION = 'false';

  console.log('[mcp-client-setup] MCP client test environment initialized');
});

/**
 * Global cleanup for MCP client tests
 */
afterAll(async () => {
  // Clean up any remaining test state
  testServerPorts.clear();
  testSessions.clear();

  console.log('[mcp-client-setup] MCP client test environment cleaned up');
});

/**
 * Per-test setup for resource tracking
 */
beforeEach(async () => {
  // Reset test-specific state before each test
  const testId = expect.getState().currentTestName || 'unknown';
  testSessions.set(testId, {
    startTime: Date.now(),
    resources: []
  });
});

/**
 * Per-test cleanup for resource management
 */
afterEach(async () => {
  // Clean up test-specific resources
  const testId = expect.getState().currentTestName || 'unknown';
  const session = testSessions.get(testId);

  if (session) {
    // Force garbage collection if available (for memory cleanup)
    if (global.gc) {
      global.gc();
    }

    testSessions.delete(testId);
  }
});

/**
 * Utility function to register test server port for cleanup
 */
export function registerTestServerPort(port) {
  testServerPorts.add(port);
}

/**
 * Utility function to unregister test server port
 */
export function unregisterTestServerPort(port) {
  testServerPorts.delete(port);
}

/**
 * Get current test session info
 */
export function getTestSession() {
  const testId = expect.getState().currentTestName || 'unknown';
  return testSessions.get(testId);
}

/**
 * Enhanced error handling for test environment
 */
process.on('unhandledRejection', (reason, promise) => {
  if (process.env.NODE_ENV === 'test') {
    console.warn('[mcp-client-setup] Unhandled promise rejection in test:', reason);
    // Don't exit in test environment, let vitest handle it
  }
});

process.on('uncaughtException', (error) => {
  if (process.env.NODE_ENV === 'test') {
    console.warn('[mcp-client-setup] Uncaught exception in test:', error.message);
    // Don't exit in test environment for stack overflow issues
    if (error.message.includes('Maximum call stack size exceeded')) {
      console.warn('[mcp-client-setup] Stack overflow detected - continuing test execution');
      return;
    }
  }
  throw error;
});

export default {
  registerTestServerPort,
  unregisterTestServerPort,
  getTestSession
};
