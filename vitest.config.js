import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Test environment - using Node.js native environment for our MCP server
    environment: 'node',
    
    // Global test configuration
    globals: false, // We'll import test functions explicitly for better IDE support
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'tests/**',
        'dev-server.js',
        'scripts/**',
        '**/*.config.js',
        '**/*.config.ts'
      ]
    },
    
    // Mock configuration
    clearMocks: true,        // Clear mock call history before each test
    restoreMocks: true,      // Restore original implementations after each test
    
    // Test file patterns
    include: ['tests/**/*.{test,spec}.{js,ts}'],
    exclude: [
      'node_modules/**',
      'dist/**',
      '**/*.d.ts'
    ],
    
    // Test timeout (30 seconds for integration tests with real API calls)
    testTimeout: 30000,
    hookTimeout: 30000,
    
    // Parallel execution for faster test runs
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: 4,
        minThreads: 1
      }
    },
    
    // Reporter configuration
    reporters: ['verbose'],
    
    // Setup files for test utilities and global configuration
    setupFiles: [],
    
    // Environment variables for testing
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'error' // Suppress logs during testing
    }
  }
})