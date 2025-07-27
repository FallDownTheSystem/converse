import { defineConfig } from 'vitest/config'
import { getTestConfig } from './tests/suites.config.js'

const suiteConfig = getTestConfig('performance')

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',
    
    // Test file patterns - performance tests only
    include: suiteConfig.test.include,
    exclude: suiteConfig.test.exclude,
    
    // Extended timeout for performance tests
    testTimeout: suiteConfig.test.testTimeout,
    hookTimeout: 300000, // 5 minutes
    
    // Coverage configuration (usually not needed for performance tests)
    coverage: {
      enabled: false
    },
    
    // Mock configuration
    clearMocks: true,
    restoreMocks: true,
    
    // Sequential execution for accurate performance measurements
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
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