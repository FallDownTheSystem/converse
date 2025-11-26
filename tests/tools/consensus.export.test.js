/**
 * Consensus Tool Export Feature Tests
 *
 * Tests the conversation export functionality of the consensus tool
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { consensusTool } from '../../src/tools/consensus.js';
import os from 'os';
import { nanoid } from 'nanoid';

// Mock dependencies
vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Helper to create test directory
async function createTestDir() {
  const testDir = path.join(os.tmpdir(), 'consensus-export-test-' + nanoid());
  await fs.mkdir(testDir, { recursive: true });
  return testDir;
}

// Helper to clean up test directory
async function cleanupTestDir(dir) {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

describe('Consensus Tool Export Feature', () => {
  let testDir;
  let mockConfig;
  let mockProviders;
  let mockContinuationStore;
  let mockContextProcessor;

  beforeEach(async () => {
    testDir = await createTestDir();

    // Setup mock config
    mockConfig = {
      server: {
        client_cwd: testDir,
      },
      openai: {
        apiKey: 'test-key',
      },
      google: {
        apiKey: 'test-key',
      },
    };

    // Setup mock providers
    mockProviders = {
      openai: {
        isAvailable: () => true,
        invoke: vi.fn(async () => ({
          content: 'OpenAI thinks this is the best approach.',
          metadata: {},
        })),
      },
      google: {
        isAvailable: () => true,
        invoke: vi.fn(async () => ({
          content: 'Google suggests considering this alternative.',
          metadata: {},
        })),
      },
    };

    // Setup mock continuation store
    mockContinuationStore = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => {}),
    };

    // Setup mock context processor
    mockContextProcessor = {
      processUnifiedContext: vi.fn(async () => ({
        files: [],
        images: [],
        webSearch: null,
      })),
    };
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
    vi.clearAllMocks();
  });

  it('should export a consensus conversation when export is enabled', async () => {
    // Run consensus with export enabled
    const result = await consensusTool(
      {
        prompt: 'Should we use microservices or monolith?',
        models: ['gpt-5', 'gemini-pro'],
        export: true,
      },
      {
        config: mockConfig,
        providers: mockProviders,
        continuationStore: mockContinuationStore,
        contextProcessor: mockContextProcessor,
      },
    );

    // Extract continuation_id from result
    expect(result).toBeDefined();
    expect(result.isError).toBe(false);
    expect(result.continuation).toBeDefined();
    expect(result.continuation.id).toBeDefined();
    const continuationId = result.continuation.id;
    const exportDir = path.join(testDir, continuationId);

    // Check that export directory was created
    const dirStats = await fs.stat(exportDir);
    expect(dirStats.isDirectory()).toBe(true);

    // Check that files were created
    const files = await fs.readdir(exportDir);
    expect(files).toContain('1_request.txt');
    expect(files).toContain('1_response.txt');
    expect(files).toContain('metadata.json');

    // Verify request content
    const requestContent = await fs.readFile(
      path.join(exportDir, '1_request.txt'),
      'utf8',
    );
    expect(requestContent).toBe('Should we use microservices or monolith?');

    // Verify response content contains consensus results
    const responseContent = await fs.readFile(
      path.join(exportDir, '1_response.txt'),
      'utf8',
    );
    expect(responseContent).toContain('Consensus gathered');
    expect(responseContent).toContain('responses');

    // Verify metadata
    const metadata = JSON.parse(
      await fs.readFile(path.join(exportDir, 'metadata.json'), 'utf8'),
    );
    expect(metadata.continuation_id).toBe(continuationId);
    expect(metadata.models).toBe('gpt-5,gemini-pro');
    expect(metadata.enable_cross_feedback).toBe(true);
    expect(metadata.total_turns).toBe(1);
  });

  it('should not export when export is disabled (default)', async () => {
    // Run consensus without export parameter (defaults to false)
    const result = await consensusTool(
      {
        prompt: 'Should we use microservices or monolith?',
        models: ['gpt-5'],
      },
      {
        config: mockConfig,
        providers: mockProviders,
        continuationStore: mockContinuationStore,
        contextProcessor: mockContextProcessor,
      },
    );

    const continuationId = result.continuation.id;
    const exportDir = path.join(testDir, continuationId);

    // Check that export directory was NOT created
    await expect(fs.stat(exportDir)).rejects.toThrow();
  });

  it('should export consensus with cross-feedback disabled', async () => {
    // Run consensus with export and cross-feedback disabled
    const result = await consensusTool(
      {
        prompt: 'What database should we use?',
        models: ['gpt-5', 'gemini-pro'],
        enable_cross_feedback: false,
        export: true,
      },
      {
        config: mockConfig,
        providers: mockProviders,
        continuationStore: mockContinuationStore,
        contextProcessor: mockContextProcessor,
      },
    );

    const continuationId = result.continuation.id;
    const exportDir = path.join(testDir, continuationId);

    // Verify metadata shows cross_feedback disabled
    const metadata = JSON.parse(
      await fs.readFile(path.join(exportDir, 'metadata.json'), 'utf8'),
    );
    expect(metadata.enable_cross_feedback).toBe(false);
  });

  it('should export consensus with multiple models and custom temperature', async () => {
    // Run consensus with multiple models and custom settings
    const result = await consensusTool(
      {
        prompt: 'Design a caching strategy',
        models: ['gpt-5', 'gemini-pro', 'claude-sonnet'],
        temperature: 0.5,
        reasoning_effort: 'high',
        export: true,
      },
      {
        config: mockConfig,
        providers: mockProviders,
        continuationStore: mockContinuationStore,
        contextProcessor: mockContextProcessor,
      },
    );

    const continuationId = result.continuation.id;
    const exportDir = path.join(testDir, continuationId);

    // Verify metadata
    const metadata = JSON.parse(
      await fs.readFile(path.join(exportDir, 'metadata.json'), 'utf8'),
    );
    expect(metadata.models).toBe('gpt-5,gemini-pro,claude-sonnet');
    expect(metadata.temperature).toBe(0.5);
    expect(metadata.reasoning_effort).toBe('high');
  });
});
