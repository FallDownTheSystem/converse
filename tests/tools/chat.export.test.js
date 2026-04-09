/**
 * Chat Tool Export Feature Tests
 *
 * Tests the conversation export functionality of the chat tool
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { chatTool } from '../../src/tools/chat.js';
import { exportConversation } from '../../src/utils/conversationExporter.js';
import { generateContinuationId } from '../../src/continuationStore.js';
import os from 'os';
import { nanoid } from 'nanoid';

// Mock dependencies
vi.mock('../../src/utils/logger.js', () => {
	const fn = vi.fn;
	const makeLogger = () => ({
		debug: fn(),
		info: fn(),
		warn: fn(),
		error: fn(),
		trace: fn(),
		operation: fn(() => ({
			debug: fn(),
			info: fn(),
			warn: fn(),
			error: fn(),
			trace: fn(),
		})),
	});
	return { createLogger: makeLogger };
});

// Helper to create test directory
async function createTestDir() {
  const testDir = path.join(os.tmpdir(), 'converse-export-test-' + nanoid());
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

describe('Chat Tool Export Feature', () => {
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
    };

    // Setup mock providers
    mockProviders = {
      openai: {
        isAvailable: () => true,
        invoke: vi.fn(async () => ({
          content: 'This is a test response from the AI assistant.',
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

  it('should export a new conversation when export is enabled', async () => {
    // Run chat with export enabled
    const result = await chatTool(
      {
        prompt: 'Hello, how are you?',
        export: true,
        model: 'gpt-5',
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
    expect(requestContent).toBe('Hello, how are you?');

    // Verify response content
    const responseContent = await fs.readFile(
      path.join(exportDir, '1_response.txt'),
      'utf8',
    );
    expect(responseContent).toBe(
      'This is a test response from the AI assistant.',
    );

    // Verify metadata
    const metadata = JSON.parse(
      await fs.readFile(path.join(exportDir, 'metadata.json'), 'utf8'),
    );
    expect(metadata.continuation_id).toBe(continuationId);
    expect(metadata.model).toBe('gpt-5');
    expect(metadata.provider).toBe('openai');
    expect(metadata.total_turns).toBe(1);
  });

  it('should not export when export is disabled (default)', async () => {
    // Run chat without export parameter (defaults to false)
    const result = await chatTool(
      {
        prompt: 'Hello, how are you?',
        model: 'gpt-5',
      },
      {
        config: mockConfig,
        providers: mockProviders,
        continuationStore: mockContinuationStore,
        contextProcessor: mockContextProcessor,
      },
    );

    expect(result).toBeDefined();
    expect(result.isError).toBe(false);
    expect(result.continuation).toBeDefined();
    expect(result.continuation.id).toBeDefined();
    const continuationId = result.continuation.id;
    const exportDir = path.join(testDir, continuationId);

    // Check that export directory was NOT created
    await expect(fs.stat(exportDir)).rejects.toThrow();
  });

  it('should export continuation of existing conversation', async () => {
    const continuationId = 'conv_test123';

    // Mock existing conversation
    mockContinuationStore.get = vi.fn(async () => ({
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'First response' },
      ],
      provider: 'openai',
      model: 'gpt-5',
      lastUpdated: Date.now(),
    }));

    // Run continuation with export
    await chatTool(
      {
        prompt: 'Second message',
        continuation_id: continuationId,
        export: true,
        model: 'gpt-5',
      },
      {
        config: mockConfig,
        providers: mockProviders,
        continuationStore: mockContinuationStore,
        contextProcessor: mockContextProcessor,
      },
    );

    const exportDir = path.join(testDir, continuationId);

    // Check that both turns are exported
    const files = await fs.readdir(exportDir);
    expect(files).toContain('1_request.txt');
    expect(files).toContain('1_response.txt');
    expect(files).toContain('2_request.txt');
    expect(files).toContain('2_response.txt');
    expect(files).toContain('metadata.json');

    // Verify second turn content
    const request2Content = await fs.readFile(
      path.join(exportDir, '2_request.txt'),
      'utf8',
    );
    expect(request2Content).toBe('Second message');

    // Verify metadata shows 2 turns
    const metadata = JSON.parse(
      await fs.readFile(path.join(exportDir, 'metadata.json'), 'utf8'),
    );
    expect(metadata.total_turns).toBe(2);
  });

  it('should not rewrite existing turn files (incremental export)', async () => {
    const continuationId = 'conv_incremental';
    const exportDir = path.join(testDir, continuationId);

    // Pre-create export directory with first turn
    await fs.mkdir(exportDir, { recursive: true });
    await fs.writeFile(
      path.join(exportDir, '1_request.txt'),
      'Original request',
    );
    await fs.writeFile(
      path.join(exportDir, '1_response.txt'),
      'Original response',
    );

    // Mock conversation with additional turn
    mockContinuationStore.get = vi.fn(async () => ({
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Modified first message' },
        { role: 'assistant', content: 'Modified first response' },
      ],
      provider: 'openai',
      model: 'gpt-5',
      lastUpdated: Date.now(),
    }));

    // Run with export
    await chatTool(
      {
        prompt: 'Second message',
        continuation_id: continuationId,
        export: true,
        model: 'gpt-5',
      },
      {
        config: mockConfig,
        providers: mockProviders,
        continuationStore: mockContinuationStore,
        contextProcessor: mockContextProcessor,
      },
    );

    // Verify first turn files were NOT overwritten
    const request1Content = await fs.readFile(
      path.join(exportDir, '1_request.txt'),
      'utf8',
    );
    expect(request1Content).toBe('Original request');

    const response1Content = await fs.readFile(
      path.join(exportDir, '1_response.txt'),
      'utf8',
    );
    expect(response1Content).toBe('Original response');

    // Verify second turn was written
    const request2Content = await fs.readFile(
      path.join(exportDir, '2_request.txt'),
      'utf8',
    );
    expect(request2Content).toBe('Second message');
  });

  it('should handle path traversal attempts in continuation_id', async () => {
    const maliciousContinuationId = '../../../etc/passwd';

    // Mock continuation store to return existing conversation (so the ID is preserved)
    mockContinuationStore.get = vi.fn(async () => ({
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
      ],
      provider: 'openai',
      model: 'gpt-5',
      lastUpdated: Date.now(),
    }));

    // Run chat with malicious continuation_id
    await chatTool(
      {
        prompt: 'Test message',
        continuation_id: maliciousContinuationId,
        export: true,
        model: 'gpt-5',
      },
      {
        config: mockConfig,
        providers: mockProviders,
        continuationStore: mockContinuationStore,
        contextProcessor: mockContextProcessor,
      },
    );

    // Should create folder with sanitized name (path.basename extracts 'passwd')
    const safeExportDir = path.join(testDir, 'passwd');
    const dirStats = await fs.stat(safeExportDir);
    expect(dirStats.isDirectory()).toBe(true);

    // Should NOT create in malicious path
    await expect(fs.stat('/etc/passwd_request.txt')).rejects.toThrow();
  });

  it('should export conversation with files and images', async () => {
    // Create real test files
    const file1 = path.join(testDir, 'file1.js');
    const file2 = path.join(testDir, 'file2.md');
    const imagePath = path.join(testDir, 'image.png');
    await fs.writeFile(file1, 'const x = 1;');
    await fs.writeFile(file2, '# Test');
    // Create a minimal PNG (1x1 transparent pixel)
    const minimalPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    await fs.writeFile(imagePath, minimalPng);

    // Run chat with files and images
    const result = await chatTool(
      {
        prompt: 'Analyze these files',
        files: [file1, file2],
        images: ['data:image/png;base64,iVBORw0KG...', imagePath],
        export: true,
        model: 'gpt-5',
      },
      {
        config: mockConfig,
        providers: mockProviders,
        continuationStore: mockContinuationStore,
        contextProcessor: mockContextProcessor,
      },
    );

    expect(result).toBeDefined();
    expect(result.isError).toBe(false);
    expect(result.continuation).toBeDefined();
    expect(result.continuation.id).toBeDefined();
    const continuationId = result.continuation.id;
    const exportDir = path.join(testDir, continuationId);

    // Verify metadata includes file references
    const metadata = JSON.parse(
      await fs.readFile(path.join(exportDir, 'metadata.json'), 'utf8'),
    );
    expect(metadata.files).toEqual([file1, file2]);
    expect(metadata.images).toEqual(['[base64 image]', imagePath]);
  });

  it('should handle export errors gracefully without interrupting chat', async () => {
    // Make the export directory read-only to trigger write error
    const readOnlyDir = path.join(testDir, 'readonly');
    await fs.mkdir(readOnlyDir, { mode: 0o444 });

    mockConfig.server.client_cwd = readOnlyDir;

    // Run chat with export - should succeed despite export failure
    const result = await chatTool(
      {
        prompt: 'Test message',
        export: true,
        model: 'gpt-5',
      },
      {
        config: mockConfig,
        providers: mockProviders,
        continuationStore: mockContinuationStore,
        contextProcessor: mockContextProcessor,
      },
    );

    // Chat should complete successfully
    expect(result.isError).toBeFalsy();
    expect(result.continuation).toBeDefined();
  });

  it('should update metadata atomically with each turn', async () => {
    const continuationId = 'conv_atomic_test';

    // Mock continuation store to return existing conversation (so the ID is preserved)
    mockContinuationStore.get = vi.fn(async () => ({
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
      ],
      provider: 'openai',
      model: 'gpt-5',
      lastUpdated: Date.now(),
    }));

    // First conversation
    await chatTool(
      {
        prompt: 'First message',
        continuation_id: continuationId,
        export: true,
        model: 'gpt-5',
        temperature: 0.7,
      },
      {
        config: mockConfig,
        providers: mockProviders,
        continuationStore: mockContinuationStore,
        contextProcessor: mockContextProcessor,
      },
    );

    const exportDir = path.join(testDir, continuationId);

    // Read first metadata
    const metadata1 = JSON.parse(
      await fs.readFile(path.join(exportDir, 'metadata.json'), 'utf8'),
    );
    expect(metadata1.total_turns).toBe(1);
    expect(metadata1.temperature).toBe(0.7);

    // Mock continuation store for second turn (with first conversation content)
    mockContinuationStore.get = vi.fn(async () => ({
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'First message' },
        {
          role: 'assistant',
          content: 'This is a test response from the AI assistant.',
        },
      ],
      provider: 'openai',
      model: 'gpt-5',
      lastUpdated: Date.now(),
    }));

    // Second conversation with different parameters
    await chatTool(
      {
        prompt: 'Second message',
        continuation_id: continuationId,
        export: true,
        model: 'gpt-5',
        temperature: 0.3,
        reasoning_effort: 'high',
      },
      {
        config: mockConfig,
        providers: mockProviders,
        continuationStore: mockContinuationStore,
        contextProcessor: mockContextProcessor,
      },
    );

    // Read updated metadata
    const metadata2 = JSON.parse(
      await fs.readFile(path.join(exportDir, 'metadata.json'), 'utf8'),
    );
    expect(metadata2.total_turns).toBe(2);
    expect(metadata2.temperature).toBe(0.3);
    expect(metadata2.reasoning_effort).toBe('high');
  });
});
