/**
 * Conversation Exporter Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { nanoid } from 'nanoid';
import { exportConversation } from '../../src/utils/conversationExporter.js';

// Mock logger
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
  const testDir = path.join(os.tmpdir(), 'exporter-test-' + nanoid());
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

describe('Conversation Exporter', () => {
  let testDir;

  beforeEach(async () => {
    testDir = await createTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  describe('Basic Export', () => {
    it('should export a simple conversation', async () => {
      const conversationState = {
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello, world!' },
          { role: 'assistant', content: 'Hello! How can I help you today?' },
        ],
        provider: 'openai',
        lastUpdated: Date.now(),
        createdAt: Date.now() - 60000,
      };

      await exportConversation(conversationState, {
        clientCwd: testDir,
        continuation_id: 'conv_test123',
        model: 'gpt-5',
        temperature: 0.5,
      });

      const exportDir = path.join(testDir, 'conv_test123');
      const files = await fs.readdir(exportDir);

      expect(files).toContain('1_request.txt');
      expect(files).toContain('1_response.txt');
      expect(files).toContain('metadata.json');

      // Check content
      const request = await fs.readFile(
        path.join(exportDir, '1_request.txt'),
        'utf8',
      );
      expect(request).toBe('Hello, world!');

      const response = await fs.readFile(
        path.join(exportDir, '1_response.txt'),
        'utf8',
      );
      expect(response).toBe('Hello! How can I help you today?');
    });

    it('should skip system messages in turn numbering', async () => {
      const conversationState = {
        messages: [
          { role: 'system', content: 'System prompt' },
          { role: 'user', content: 'First user message' },
          { role: 'assistant', content: 'First response' },
          { role: 'system', content: 'Another system message' },
          { role: 'user', content: 'Second user message' },
          { role: 'assistant', content: 'Second response' },
        ],
        provider: 'openai',
        lastUpdated: Date.now(),
      };

      await exportConversation(conversationState, {
        clientCwd: testDir,
        continuation_id: 'conv_system_test',
        model: 'gpt-5',
      });

      const exportDir = path.join(testDir, 'conv_system_test');
      const files = await fs.readdir(exportDir);

      // Should only have 2 turns (system messages excluded)
      expect(files).toContain('1_request.txt');
      expect(files).toContain('1_response.txt');
      expect(files).toContain('2_request.txt');
      expect(files).toContain('2_response.txt');
      expect(files).not.toContain('3_request.txt');
    });
  });

  describe('Complex Content Handling', () => {
    it('should handle complex content with files and images', async () => {
      const conversationState = {
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          {
            role: 'user',
            content: [
              {
                type: 'file',
                file_name: 'test.js',
                file_content: 'const x = 1;',
              },
              { type: 'image', image_url: '/path/to/image.png' },
              { type: 'text', text: 'Analyze these files' },
            ],
          },
          {
            role: 'assistant',
            content: 'I can see a JavaScript file and an image.',
          },
        ],
        provider: 'openai',
        lastUpdated: Date.now(),
      };

      await exportConversation(conversationState, {
        clientCwd: testDir,
        continuation_id: 'conv_complex',
        model: 'gpt-5',
      });

      const exportDir = path.join(testDir, 'conv_complex');
      const request = await fs.readFile(
        path.join(exportDir, '1_request.txt'),
        'utf8',
      );

      expect(request).toContain('[File: test.js]');
      expect(request).toContain('[Image: image.png]');
      expect(request).toContain('Analyze these files');
    });

    it('should handle base64 images appropriately', async () => {
      const conversationState = {
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          {
            role: 'user',
            content: [
              {
                type: 'image',
                image_url: 'data:image/png;base64,iVBORw0KG...',
              },
              { type: 'text', text: 'What is in this image?' },
            ],
          },
          { role: 'assistant', content: 'I can see the image.' },
        ],
        provider: 'openai',
        lastUpdated: Date.now(),
      };

      await exportConversation(conversationState, {
        clientCwd: testDir,
        continuation_id: 'conv_base64',
        model: 'gpt-5',
        images: ['data:image/png;base64,iVBORw0KG...'],
      });

      const exportDir = path.join(testDir, 'conv_base64');
      const request = await fs.readFile(
        path.join(exportDir, '1_request.txt'),
        'utf8',
      );

      expect(request).toContain('[Image: embedded image]');
      expect(request).toContain('What is in this image?');

      // Check metadata doesn't store base64 data
      const metadata = JSON.parse(
        await fs.readFile(path.join(exportDir, 'metadata.json'), 'utf8'),
      );
      expect(metadata.images).toEqual(['[base64 image]']);
    });
  });

  describe('Incremental Export', () => {
    it('should not overwrite existing turn files', async () => {
      const exportDir = path.join(testDir, 'conv_incremental');
      await fs.mkdir(exportDir, { recursive: true });

      // Create existing files
      await fs.writeFile(
        path.join(exportDir, '1_request.txt'),
        'Original request',
      );
      await fs.writeFile(
        path.join(exportDir, '1_response.txt'),
        'Original response',
      );

      const originalRequestStat = await fs.stat(
        path.join(exportDir, '1_request.txt'),
      );

      // Wait a bit to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      const conversationState = {
        messages: [
          { role: 'system', content: 'System' },
          { role: 'user', content: 'Modified request' },
          { role: 'assistant', content: 'Modified response' },
          { role: 'user', content: 'Second request' },
          { role: 'assistant', content: 'Second response' },
        ],
        provider: 'openai',
        lastUpdated: Date.now(),
      };

      await exportConversation(conversationState, {
        clientCwd: testDir,
        continuation_id: 'conv_incremental',
        model: 'gpt-5',
      });

      // Check original files were not modified
      const request1 = await fs.readFile(
        path.join(exportDir, '1_request.txt'),
        'utf8',
      );
      expect(request1).toBe('Original request');

      const response1 = await fs.readFile(
        path.join(exportDir, '1_response.txt'),
        'utf8',
      );
      expect(response1).toBe('Original response');

      // Check timestamp wasn't modified
      const newRequestStat = await fs.stat(
        path.join(exportDir, '1_request.txt'),
      );
      expect(newRequestStat.mtimeMs).toBe(originalRequestStat.mtimeMs);

      // Check new files were created
      const request2 = await fs.readFile(
        path.join(exportDir, '2_request.txt'),
        'utf8',
      );
      expect(request2).toBe('Second request');

      const response2 = await fs.readFile(
        path.join(exportDir, '2_response.txt'),
        'utf8',
      );
      expect(response2).toBe('Second response');
    });
  });

  describe('Metadata Generation', () => {
    it('should generate complete metadata', async () => {
      const now = Date.now();
      const conversationState = {
        messages: [
          { role: 'system', content: 'System' },
          { role: 'user', content: 'Message 1' },
          { role: 'assistant', content: 'Response 1' },
          { role: 'user', content: 'Message 2' },
          { role: 'assistant', content: 'Response 2' },
        ],
        provider: 'google',
        lastUpdated: now,
        createdAt: now - 120000,
      };

      await exportConversation(conversationState, {
        clientCwd: testDir,
        continuation_id: 'conv_metadata',
        model: 'gemini-pro',
        temperature: 0.7,
        reasoning_effort: 'high',
        verbosity: 'low',
        use_websearch: true,
        files: ['/path/to/file.txt'],
        images: ['/path/to/image.png', 'data:image/png;base64,xxx'],
      });

      const exportDir = path.join(testDir, 'conv_metadata');
      const metadata = JSON.parse(
        await fs.readFile(path.join(exportDir, 'metadata.json'), 'utf8'),
      );

      expect(metadata.continuation_id).toBe('conv_metadata');
      expect(metadata.model).toBe('gemini-pro');
      expect(metadata.provider).toBe('google');
      expect(metadata.temperature).toBe(0.7);
      expect(metadata.reasoning_effort).toBe('high');
      expect(metadata.verbosity).toBe('low');
      expect(metadata.use_websearch).toBe(true);
      expect(metadata.total_turns).toBe(2);
      expect(metadata.files).toEqual(['/path/to/file.txt']);
      expect(metadata.images).toEqual(['/path/to/image.png', '[base64 image]']);
      expect(new Date(metadata.created_at).getTime()).toBeCloseTo(
        now - 120000,
        -2,
      );
      expect(new Date(metadata.last_updated).getTime()).toBeCloseTo(now, -2);
    });

    it('should update metadata atomically', async () => {
      const exportDir = path.join(testDir, 'conv_atomic');
      await fs.mkdir(exportDir, { recursive: true });

      const metadataPath = path.join(exportDir, 'metadata.json');

      // First export
      const conversationState1 = {
        messages: [
          { role: 'user', content: 'Message 1' },
          { role: 'assistant', content: 'Response 1' },
        ],
        provider: 'openai',
        lastUpdated: Date.now(),
      };

      await exportConversation(conversationState1, {
        clientCwd: testDir,
        continuation_id: 'conv_atomic',
        model: 'gpt-5',
        temperature: 0.5,
      });

      const metadata1 = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
      expect(metadata1.total_turns).toBe(1);
      expect(metadata1.temperature).toBe(0.5);

      // Second export with more turns
      const conversationState2 = {
        messages: [
          { role: 'user', content: 'Message 1' },
          { role: 'assistant', content: 'Response 1' },
          { role: 'user', content: 'Message 2' },
          { role: 'assistant', content: 'Response 2' },
        ],
        provider: 'openai',
        lastUpdated: Date.now() + 60000,
      };

      await exportConversation(conversationState2, {
        clientCwd: testDir,
        continuation_id: 'conv_atomic',
        model: 'gpt-5',
        temperature: 0.8,
      });

      const metadata2 = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
      expect(metadata2.total_turns).toBe(2);
      expect(metadata2.temperature).toBe(0.8);

      // Verify temp file doesn't exist
      await expect(fs.access(metadataPath + '.tmp')).rejects.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle incomplete turn pairs', async () => {
      const conversationState = {
        messages: [
          { role: 'user', content: 'First message' },
          { role: 'assistant', content: 'First response' },
          { role: 'user', content: 'Second message without response' },
        ],
        provider: 'openai',
        lastUpdated: Date.now(),
      };

      await exportConversation(conversationState, {
        clientCwd: testDir,
        continuation_id: 'conv_incomplete',
        model: 'gpt-5',
      });

      const exportDir = path.join(testDir, 'conv_incomplete');
      const files = await fs.readdir(exportDir);

      // Should have both complete and incomplete turns
      expect(files).toContain('1_request.txt');
      expect(files).toContain('1_response.txt');
      expect(files).toContain('2_request.txt');
      expect(files).not.toContain('2_response.txt');

      const metadata = JSON.parse(
        await fs.readFile(path.join(exportDir, 'metadata.json'), 'utf8'),
      );
      expect(metadata.total_turns).toBe(2);
    });

    it('should sanitize continuation_id for folder names', async () => {
      const maliciousId = '../../../etc/passwd';

      const conversationState = {
        messages: [
          { role: 'user', content: 'Test' },
          { role: 'assistant', content: 'Response' },
        ],
        provider: 'openai',
        lastUpdated: Date.now(),
      };

      await exportConversation(conversationState, {
        clientCwd: testDir,
        continuation_id: maliciousId,
        model: 'gpt-5',
      });

      // Should create safe folder name
      const safeDir = path.join(testDir, 'passwd');
      const files = await fs.readdir(safeDir);
      expect(files).toContain('1_request.txt');

      // Should not create in malicious path
      await expect(fs.access('/etc/1_request.txt')).rejects.toThrow();
    });

    it('should handle empty conversations gracefully', async () => {
      const conversationState = {
        messages: [],
        provider: 'openai',
        lastUpdated: Date.now(),
      };

      await exportConversation(conversationState, {
        clientCwd: testDir,
        continuation_id: 'conv_empty',
        model: 'gpt-5',
      });

      // Directory should be created but empty except for metadata
      const exportDir = path.join(testDir, 'conv_empty');
      await expect(fs.access(exportDir)).rejects.toThrow();
    });

    it('should handle missing continuation_id', async () => {
      const conversationState = {
        messages: [
          { role: 'user', content: 'Test' },
          { role: 'assistant', content: 'Response' },
        ],
        provider: 'openai',
        lastUpdated: Date.now(),
      };

      // Should not throw, just skip export
      await expect(
        exportConversation(conversationState, {
          clientCwd: testDir,
          model: 'gpt-5',
        }),
      ).resolves.not.toThrow();

      // No folders should be created
      const files = await fs.readdir(testDir);
      expect(files).toHaveLength(0);
    });

    it('should handle file system errors gracefully', async () => {
      // Create read-only directory to trigger errors
      const readOnlyDir = path.join(testDir, 'readonly');
      await fs.mkdir(readOnlyDir, { mode: 0o444 });

      const conversationState = {
        messages: [
          { role: 'user', content: 'Test' },
          { role: 'assistant', content: 'Response' },
        ],
        provider: 'openai',
        lastUpdated: Date.now(),
      };

      // Should not throw, just log error
      await expect(
        exportConversation(conversationState, {
          clientCwd: readOnlyDir,
          continuation_id: 'conv_error',
          model: 'gpt-5',
        }),
      ).resolves.not.toThrow();
    });
  });

  describe('Cross-platform Support', () => {
    it('should handle Windows-style paths', async () => {
      const windowsPath = testDir.replace(/\//g, '\\');

      const conversationState = {
        messages: [
          { role: 'user', content: 'Test' },
          { role: 'assistant', content: 'Response' },
        ],
        provider: 'openai',
        lastUpdated: Date.now(),
      };

      await exportConversation(conversationState, {
        clientCwd: windowsPath,
        continuation_id: 'conv_windows',
        model: 'gpt-5',
      });

      const exportDir = path.join(testDir, 'conv_windows');
      const files = await fs.readdir(exportDir);
      expect(files).toContain('1_request.txt');
    });

    it('should resolve relative paths correctly', async () => {
      const originalCwd = process.cwd();

      try {
        process.chdir(testDir);

        const conversationState = {
          messages: [
            { role: 'user', content: 'Test' },
            { role: 'assistant', content: 'Response' },
          ],
          provider: 'openai',
          lastUpdated: Date.now(),
        };

        await exportConversation(conversationState, {
          // Use current dir (testDir)
          continuation_id: 'conv_relative',
          model: 'gpt-5',
        });

        const exportDir = path.join(testDir, 'conv_relative');
        const files = await fs.readdir(exportDir);
        expect(files).toContain('1_request.txt');
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});
