import { defineConfig } from 'vitest/config'
import { getTestConfig } from './tests/suites.config.js'

const suiteConfig = getTestConfig('unit')

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',
    
    // Test file patterns - unit tests only
    include: suiteConfig.test.include,
    exclude: suiteConfig.test.exclude,
    
    // Timeout configuration
    testTimeout: suiteConfig.test.testTimeout,
    hookTimeout: 10000,
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'tests/**',
        'dev-server.js',
        'scripts/**',
        '**/*.config.js'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80
      }
    },
    
    // Mock configuration
    clearMocks: true,
    restoreMocks: true,
    
    // Parallel execution
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: 4,
        minThreads: 1
      }
    },
    
    // Reporter configuration
    reporters: ['verbose'],
    
    // Environment variables
    env: suiteConfig.test.env,
    
    // Setup files
    setupFiles: suiteConfig.test.setupFiles
  }
})