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
      include: ['src/**/*.{js,ts}'],
      exclude: [
        'tests/**',
        'dev-server.js',
        'scripts/**',
        '**/*.config.{js,ts}',
        'bin/**'
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
    maxWorkers: 4,
    
    // Reporter configuration
    reporters: ['verbose'],
    
    // Environment variables
    env: suiteConfig.test.env,
    
    // Setup files
    setupFiles: suiteConfig.test.setupFiles
  }
})