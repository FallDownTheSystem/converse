/**
 * Common test helper functions
 */

import { vi } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get the absolute path to a fixture file
 */
export function getFixturePath(relativePath) {
  return path.join(__dirname, '../../fixtures', relativePath);
}

/**
 * Create a mock configuration object
 */
export function createMockConfig(overrides = {}) {
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
      ...overrides.providers,
    },
    server: {
      port: 3157,
      maxOutputTokens: 200000,
      logLevel: 'info',
      ...overrides.server,
    },
    ...overrides,
  };
}

/**
 * Create a mock logger
 */
export function createMockLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  };
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(condition, timeout = 5000, interval = 100) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Timeout waiting for condition');
}

/**
 * Create a deferred promise
 */
export function createDeferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Mock file system operations
 */
export function mockFileSystem() {
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
    files,
  };
}
