import { defineConfig } from 'vitest/config'

/**
 * Vitest Configuration for MCP Client Tests
 * 
 * Specialized configuration for HTTP-based MCP client-server integration testing.
 * Features extended timeouts, reduced parallelism for server stability, and 
 * enhanced environment isolation for subprocess execution.
 */
export default defineConfig({
  test: {
    // Test environment
    environment: 'node',
    
    // Test file patterns - MCP client integration tests only
    include: [
      'tests/integration/mcp-client-integration.test.js',
      'tests/integration/mcp-protocol-enhanced.test.js',
      'tests/integration/mcp-server-lifecycle.test.js',
      'tests/utils/HTTPMCPServerManager.test.js',
      'tests/utils/HTTPMCPTestClient.test.js'
    ],
    exclude: [
      'tests/integration/real-api*.test.js',
      'tests/integration/performance*.test.js',
      'tests/providers/**',
      'tests/tools/**'
    ],
    
    // Extended timeout configuration for HTTP transport and server lifecycle
    testTimeout: 45000, // 45 seconds for complex client-server scenarios
    hookTimeout: 20000, // 20 seconds for setup/teardown
    
    // Reduced parallelism for server stability and port management
    pool: 'threads',
    maxWorkers: 1, // Single thread to avoid port conflicts
    
    // Coverage configuration optimized for integration testing
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{js,ts}'],
      exclude: [
        'tests/**',
        'dev-server.js',
        'scripts/**',
        '**/*.config.{js,ts}',
        'bin/**'
      ],
      thresholds: {
        lines: 60,   // Lower thresholds for integration tests
        functions: 60,
        branches: 50,
        statements: 60
      }
    },
    
    // Mock configuration
    clearMocks: true,
    restoreMocks: true,
    
    // Reporter configuration with detailed output
    reporters: ['verbose'],
    
    // Environment variables for MCP client testing
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',        // Suppress noise during testing
      TEST_SUITE: 'mcp-client',  // Identify test suite context
      HTTP_PORT: '0',            // Use random ports to avoid conflicts
      HTTP_SESSION_TIMEOUT: '60000', // Shorter timeout for tests
      HTTP_MAX_CONCURRENT_SESSIONS: '10' // Limit concurrent sessions
    },
    
    // Setup files for MCP client test environment
    setupFiles: ['tests/setup/mcp-client-setup.js'],
    
    // Global test configuration
    globals: false,
    
    // Retry configuration for flaky HTTP tests
    retry: 1, // Retry failed tests once
    
    // Isolation configuration
    isolate: true, // Ensure test isolation for server processes
    
    // File watching configuration (disabled for CI stability)
    watch: false,
    
    // Bail configuration - stop on first failure for faster feedback
    bail: 0, // Don't bail, run all tests for comprehensive results
    
    // Maximum concurrent test files
    maxConcurrency: 1, // Run test files sequentially to avoid server conflicts
    
    // Test sequence configuration
    sequence: {
      shuffle: false, // Don't shuffle for predictable server lifecycle
      concurrent: false // Disable concurrency for stability
    }
  }
})