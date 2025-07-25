import { defineConfig } from 'vitest/config'
import { getTestConfig } from './tests/suites.config.js'

const suiteConfig = getTestConfig('ci')

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',
    
    // Test file patterns - CI-compatible tests only
    include: suiteConfig.test.include,
    exclude: suiteConfig.test.exclude,
    
    // Timeout configuration - conservative for CI
    testTimeout: suiteConfig.test.testTimeout,
    hookTimeout: 20000,
    
    // Coverage configuration - stricter for CI
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/**',
        'tests/**',
        'dev-server.js',
        'scripts/**',
        '**/*.config.js'
      ],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 65,
        statements: 75
      }
    },
    
    // Mock configuration
    clearMocks: true,
    restoreMocks: true,
    
    // Parallel execution - conservative for CI
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: 2,
        minThreads: 1
      }
    },
    
    // Reporter configuration - detailed for CI
    reporters: ['verbose', 'junit'],
    outputFile: {
      junit: './test-results.xml'
    },
    
    // Environment variables
    env: {
      ...suiteConfig.test.env,
      CI: 'true'
    },
    
    // Setup files
    setupFiles: suiteConfig.test.setupFiles,
    
    // CI-specific options
    bail: 1, // Stop on first failure in CI
    passWithNoTests: false // Fail if no tests run
  }
})