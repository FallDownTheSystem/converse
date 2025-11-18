/**
 * Comprehensive test helper utilities
 * Consolidates all common testing helpers
 */

import { vi, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Path utilities
 */
export const paths = {
  /**
   * Get the absolute path to a fixture file
   */
  getFixturePath(relativePath) {
    return path.join(__dirname, '../fixtures', relativePath);
  },

  /**
   * Get the absolute path to a test file
   */
  getTestPath(relativePath) {
    return path.join(__dirname, '../..', relativePath);
  },

  /**
   * Get project root path
   */
  getProjectRoot() {
    return path.join(__dirname, '../../..');
  },
};

/**
 * Configuration utilities
 */
export const config = {
  /**
   * Create a mock configuration object
   */
  createMockConfig(overrides = {}) {
    return {
      apiKeys: {
        openai: 'sk-test-openai',
        google: 'test-google-key',
        xai: 'xai-test-key',
        anthropic: 'sk-ant-test',
        mistral: 'test-mistral-key',
        deepseek: 'sk-test-deepseek',
        openrouter: 'sk-or-test-key',
        ...overrides.apiKeys,
      },
      providers: {
        googleLocation: 'us-central1',
        xaiBaseUrl: 'https://api.x.ai/v1',
        anthropicBaseUrl: 'https://api.anthropic.com',
        mistralBaseUrl: 'https://api.mistral.ai',
        deepseekBaseUrl: 'https://api.deepseek.com',
        openrouterBaseUrl: 'https://openrouter.ai/api',
        ...overrides.providers,
      },
      server: {
        port: 3157,
        maxOutputTokens: 200000,
        logLevel: 'info',
        enableHttpTransport: true,
        ...overrides.server,
      },
      ...overrides,
    };
  },

  /**
   * Create test environment variables
   */
  createTestEnv(overrides = {}) {
    return {
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
      PORT: '3157',
      MAX_MCP_OUTPUT_TOKENS: '200000',
      ...overrides,
    };
  },
};

/**
 * Logger utilities
 */
export const logging = {
  /**
   * Create a mock logger
   */
  createMockLogger() {
    return {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
    };
  },

  /**
   * Create a spy logger that passes through to console
   */
  createSpyLogger() {
    return {
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      trace: vi.spyOn(console, 'trace').mockImplementation(() => {}),
    };
  },
};

/**
 * Async utilities
 */
export const async = {
  /**
   * Wait for a condition to be true
   */
  async waitFor(condition, timeout = 5000, interval = 100) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error('Timeout waiting for condition');
  },

  /**
   * Create a deferred promise
   */
  createDeferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });

    return { promise, resolve, reject };
  },

  /**
   * Sleep for a specified duration
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },

  /**
   * Run a function with timeout
   */
  async withTimeout(fn, timeout = 5000) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Operation timed out')), timeout);
    });

    return Promise.race([fn(), timeoutPromise]);
  },
};

/**
 * File system utilities
 */
export const filesystem = {
  /**
   * Mock file system operations
   */
  mockFileSystem() {
    const files = new Map();

    return {
      readFile: vi.fn().mockImplementation((path) => {
        if (files.has(path)) {
          return Promise.resolve(files.get(path));
        }
        return Promise.reject(new Error(`File not found: ${path}`));
      }),
      writeFile: vi.fn().mockImplementation((path, content) => {
        files.set(path, content);
        return Promise.resolve();
      }),
      exists: vi.fn().mockImplementation((path) => {
        return Promise.resolve(files.has(path));
      }),
      unlink: vi.fn().mockImplementation((path) => {
        files.delete(path);
        return Promise.resolve();
      }),
      mkdir: vi.fn().mockResolvedValue(),
      rmdir: vi.fn().mockResolvedValue(),
      files,
    };
  },

  /**
   * Create temporary test files
   */
  async createTempFile(content, extension = 'txt') {
    const tempDir = path.join(__dirname, '../../temp');
    await fs.mkdir(tempDir, { recursive: true });

    const filename = `test-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
    const filepath = path.join(tempDir, filename);

    await fs.writeFile(filepath, content);

    return {
      path: filepath,
      cleanup: async () => {
        try {
          await fs.unlink(filepath);
        } catch (err) {
          // Ignore cleanup errors
        }
      },
    };
  },
};

/**
 * Store utilities
 */
export const stores = {
  /**
   * Create a mock continuation store
   */
  createMockContinuationStore() {
    const store = new Map();

    return {
      get: vi.fn().mockImplementation((id) => store.get(id)),
      set: vi.fn().mockImplementation((id, data) => {
        store.set(id, data);
        return true;
      }),
      delete: vi.fn().mockImplementation((id) => store.delete(id)),
      exists: vi.fn().mockImplementation((id) => store.has(id)),
      getStats: vi.fn().mockReturnValue({
        size: store.size,
        memoryUsage: store.size * 1000,
      }),
      clear: vi.fn().mockImplementation(() => store.clear()),
      _store: store,
    };
  },
};

/**
 * Context processing utilities
 */
export const context = {
  /**
   * Create a mock context processor
   */
  createMockContextProcessor() {
    return {
      processFiles: vi.fn().mockResolvedValue([]),
      processImages: vi.fn().mockResolvedValue([]),
      formatContext: vi.fn().mockReturnValue(''),
      validatePaths: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
    };
  },

  /**
   * Create mock file content
   */
  createMockFileContent(type = 'text') {
    const contents = {
      text: 'This is a test file content.',
      json: JSON.stringify({ test: true, data: 'mock' }),
      code: 'function test() { return "hello"; }',
      markdown: '# Test\n\nThis is a test markdown file.',
    };

    return contents[type] || contents.text;
  },
};

/**
 * Assertion helpers
 */
export const assertions = {
  /**
   * Assert that a value matches a partial object
   */
  expectPartialMatch(actual, expected) {
    for (const key in expected) {
      expect(actual[key]).toEqual(expected[key]);
    }
  },

  /**
   * Assert that an async function throws
   */
  async expectAsyncThrows(fn, errorMessage) {
    let error;
    try {
      await fn();
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    if (errorMessage) {
      expect(error.message).toContain(errorMessage);
    }
  },
};

/**
 * Test data generators
 */
export const generators = {
  /**
   * Generate a unique ID
   */
  generateId(prefix = 'test') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  },

  /**
   * Generate mock API response
   */
  generateMockApiResponse(overrides = {}) {
    return {
      id: this.generateId('resp'),
      object: 'chat.completion',
      created: Date.now(),
      model: 'mock-model',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'Mock response content',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
      ...overrides,
    };
  },
};

/**
 * Setup and teardown utilities
 */
export const setup = {
  /**
   * Common test setup
   */
  async beforeEachTest() {
    // Clear all mocks
    vi.clearAllMocks();

    // Reset modules if needed
    vi.resetModules();
  },

  /**
   * Common test teardown
   */
  async afterEachTest() {
    // Restore all mocks
    vi.restoreAllMocks();
  },

  /**
   * Setup test environment
   */
  setupTestEnvironment(env = {}) {
    const originalEnv = { ...process.env };

    Object.assign(process.env, config.createTestEnv(env));

    return {
      restore: () => {
        process.env = originalEnv;
      },
    };
  },
};

/**
 * Export all utilities as default
 */
export default {
  paths,
  config,
  logging,
  async,
  filesystem,
  stores,
  context,
  assertions,
  generators,
  setup,
};
