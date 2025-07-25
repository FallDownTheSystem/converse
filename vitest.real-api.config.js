import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import { getTestConfig } from './tests/suites.config.js'

const suiteConfig = getTestConfig('real-api')

export default defineConfig(({ mode }) => {
  // Load environment variables based on mode (test mode loads .env.test)
  const env = loadEnv(mode || 'test', process.cwd(), '')
  
  return {
    test: {
      // Test environment
      environment: 'node',
      
      // Test file patterns - real API tests only
      include: suiteConfig.test.include,
      exclude: suiteConfig.test.exclude,
      
      // Timeout configuration - longer for real API calls
      testTimeout: suiteConfig.test.testTimeout,
      hookTimeout: 30000,
      
      // Coverage configuration - relaxed for real API tests
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json'],
        exclude: [
          'node_modules/**',
          'tests/**',
          'dev-server.js',
          'scripts/**',
          '**/*.config.js'
        ]
      },
      
      // Mock configuration
      clearMocks: true,
      restoreMocks: true,
      
      // Sequential execution for real API tests to avoid rate limiting
      pool: 'threads',
      poolOptions: {
        threads: {
          maxThreads: 1,
          minThreads: 1
        }
      },
      
      // Reporter configuration
      reporters: ['verbose'],
      
      // Environment variables - properly loaded from .env.test
      env: {
        ...suiteConfig.test.env,
        ...env
      },
      
      // Setup files
      setupFiles: suiteConfig.test.setupFiles,
      
      // Retry configuration for flaky API tests
      retry: 1
    }
  }
})