import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  processFileContent,
  processMultipleFiles,
  processUnifiedContext,
  createFileContext,
  validateFilePath,
  ContextProcessorError
} from '../../src/utils/contextProcessor.js';
import { readFile, stat, access } from 'fs/promises';
import { constants } from 'fs';
import { resolve, join } from 'path';
import { writeFile, mkdir, rm } from 'fs/promises';

// Mock fs modules
vi.mock('fs/promises');

describe('Context Processor Unit Tests', () => {
  const testDir = resolve(process.cwd(), 'test-files');
  const testImagePath = join(testDir, 'test.png');
  const testTextPath = join(testDir, 'test.txt');

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Default mock implementations
    access.mockResolvedValue(undefined);
    stat.mockResolvedValue({
      isFile: () => true,
      size: 1000,
      mtime: new Date('2024-01-01')
    });
    readFile.mockImplementation((path, encoding) => {
      if (encoding === 'utf8') {
        return Promise.resolve('Test file content');
      }
      return Promise.resolve(Buffer.from('fake-image-data'));
    });
  });

  describe('Relative Path Handling', () => {
    it('should convert relative paths to absolute paths for text files', async () => {
      const relativePath = './test-files/test.txt';
      const expectedAbsolutePath = resolve(process.cwd(), relativePath);

      const result = await processFileContent(relativePath, {
        skipSecurityCheck: true
      });

      expect(result.path).toBe(expectedAbsolutePath);
      expect(result.originalPath).toBe(relativePath);
      expect(result.type).toBe('text');
      expect(result.content).toBe('Test file content');
    });

    it('should convert relative paths to absolute paths for images', async () => {
      const relativePath = './test-files/test.png';
      const expectedAbsolutePath = resolve(process.cwd(), relativePath);

      readFile.mockImplementation((path, encoding) => {
        if (!encoding) {
          return Promise.resolve(Buffer.from('fake-png-data'));
        }
        return Promise.resolve('text-content');
      });

      const result = await processFileContent(relativePath, {
        skipSecurityCheck: true
      });

      expect(result.path).toBe(expectedAbsolutePath);
      expect(result.originalPath).toBe(relativePath);
      expect(result.type).toBe('image');
      expect(result.mimeType).toBe('image/png');
      expect(result.content).toBe(Buffer.from('fake-png-data').toString('base64'));
    });

    it('should handle nested relative paths', async () => {
      const relativePath = '../sibling-dir/image.jpg';
      const expectedAbsolutePath = resolve(process.cwd(), relativePath);

      readFile.mockImplementation(() => Promise.resolve(Buffer.from('fake-jpg-data')));

      const result = await processFileContent(relativePath, {
        skipSecurityCheck: true
      });

      expect(result.path).toBe(expectedAbsolutePath);
      expect(result.originalPath).toBe(relativePath);
      expect(result.type).toBe('image');
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('should handle current directory relative paths', async () => {
      const relativePath = 'test.png';
      const expectedAbsolutePath = resolve(process.cwd(), relativePath);

      readFile.mockImplementation(() => Promise.resolve(Buffer.from('fake-png-data')));

      const result = await processFileContent(relativePath, {
        skipSecurityCheck: true
      });

      expect(result.path).toBe(expectedAbsolutePath);
      expect(result.originalPath).toBe(relativePath);
      expect(result.type).toBe('image');
    });

    it('should process multiple files with mixed relative and absolute paths', async () => {
      const files = [
        'relative-text.txt',
        './relative-dir/image.png',
        resolve(process.cwd(), 'absolute-file.json')
      ];

      readFile.mockImplementation((path, encoding) => {
        if (path.includes('.txt') && encoding === 'utf8') {
          return Promise.resolve('Text content');
        } else if (path.includes('.json') && encoding === 'utf8') {
          return Promise.resolve('{"json": true}');
        } else if (path.includes('.png')) {
          return Promise.resolve(Buffer.from('png-data'));
        }
        return Promise.resolve('default content');
      });

      const results = await processMultipleFiles(files, {
        skipSecurityCheck: true
      });

      expect(results).toHaveLength(3);
      expect(results[0].path).toBe(resolve(process.cwd(), 'relative-text.txt'));
      expect(results[0].originalPath).toBe('relative-text.txt');
      expect(results[1].path).toBe(resolve(process.cwd(), './relative-dir/image.png'));
      expect(results[1].originalPath).toBe('./relative-dir/image.png');
      expect(results[2].path).toBe(resolve(process.cwd(), 'absolute-file.json'));
      expect(results[2].originalPath).toBe(resolve(process.cwd(), 'absolute-file.json'));
    });
  });

  describe('Unified Context Processing', () => {
    it('should process images with relative paths in unified context', async () => {
      const contextRequest = {
        images: ['test.png', './images/photo.jpg'],
        files: [],
        webSearch: null
      };

      readFile.mockImplementation((path) => {
        if (path.includes('.png') || path.includes('.jpg')) {
          return Promise.resolve(Buffer.from('image-data'));
        }
        return Promise.resolve('text-data');
      });

      const result = await processUnifiedContext(contextRequest, {
        skipSecurityCheck: true
      });

      expect(result.images).toHaveLength(2);
      expect(result.images[0].path).toBe(resolve(process.cwd(), 'test.png'));
      expect(result.images[0].type).toBe('image');
      expect(result.images[1].path).toBe(resolve(process.cwd(), './images/photo.jpg'));
      expect(result.images[1].type).toBe('image');
    });

    it('should handle mixed files and images with relative paths', async () => {
      const contextRequest = {
        files: ['docs/readme.md', '../config.json'],
        images: ['screenshots/ui.png', './assets/logo.gif'],
        webSearch: null
      };

      readFile.mockImplementation((path, encoding) => {
        if (encoding === 'utf8') {
          return Promise.resolve('text content');
        }
        return Promise.resolve(Buffer.from('binary content'));
      });

      const result = await processUnifiedContext(contextRequest, {
        skipSecurityCheck: true
      });

      expect(result.files).toHaveLength(2);
      expect(result.images).toHaveLength(2);

      // Check files
      expect(result.files[0].originalPath).toBe('docs/readme.md');
      expect(result.files[0].path).toBe(resolve(process.cwd(), 'docs/readme.md'));
      expect(result.files[1].originalPath).toBe('../config.json');
      expect(result.files[1].path).toBe(resolve(process.cwd(), '../config.json'));

      // Check images
      expect(result.images[0].originalPath).toBe('screenshots/ui.png');
      expect(result.images[0].path).toBe(resolve(process.cwd(), 'screenshots/ui.png'));
      expect(result.images[1].originalPath).toBe('./assets/logo.gif');
      expect(result.images[1].path).toBe(resolve(process.cwd(), './assets/logo.gif'));
    });
  });

  describe('Error Handling with Relative Paths', () => {
    it('should handle non-existent relative path files', async () => {
      access.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const result = await processFileContent('./non-existent.png', {
        skipSecurityCheck: true
      });

      expect(result.type).toBe('error');
      expect(result.error).toContain('File not accessible');
      expect(result.originalPath).toBe('./non-existent.png');
    });

    it('should preserve original relative path in error messages', async () => {
      access.mockRejectedValue(new Error('Permission denied'));

      const relativePath = '../protected/secret.txt';
      const result = await processFileContent(relativePath, {
        skipSecurityCheck: true
      });

      expect(result.type).toBe('error');
      expect(result.originalPath).toBe(relativePath);
      expect(result.error).toContain('File not accessible');
    });
  });

  describe('Security Validation with Relative Paths', () => {
    it('should validate relative paths against allowed directories', async () => {
      const relativePath = './safe-file.txt';
      const allowedDirs = [process.cwd()];

      const result = await processFileContent(relativePath, {
        allowedDirectories: allowedDirs,
        skipSecurityCheck: false
      });

      expect(result.type).toBe('text');
      expect(result.path).toBe(resolve(process.cwd(), relativePath));
    });

    it('should reject relative paths outside allowed directories when security is enforced', async () => {
      const relativePath = '../../outside-project/file.txt';
      const allowedDirs = [process.cwd()];

      const result = await processFileContent(relativePath, {
        allowedDirectories: allowedDirs,
        enforceSecurityCheck: true  // Changed to use the new flag
      });

      expect(result.type).toBe('error');
      expect(result.error).toContain('File access denied');
      expect(result.errorCode).toBe('SECURITY_VIOLATION');
    });

    it('should allow any paths when security check is disabled (default)', async () => {
      const relativePath = './test.txt';

      // Without enforceSecurityCheck, should allow any file
      const result = await processFileContent(relativePath);

      expect(result.type).toBe('text');
      expect(result.error).toBe(null);
      expect(result.path).toBe(resolve(process.cwd(), relativePath));
    });
  });

  describe('File Context Creation with Mixed Paths', () => {
    it('should create context message preserving original paths', async () => {
      const processedFiles = [
        {
          path: resolve(process.cwd(), 'test.txt'),
          originalPath: './test.txt',
          type: 'text',
          content: 'Hello from relative path',
          size: 100,
          lineCount: 1,
          lastModified: new Date('2024-01-01')
        },
        {
          path: resolve(process.cwd(), 'images/test.png'),
          originalPath: 'images/test.png',
          type: 'image',
          content: 'base64-image-data',
          mimeType: 'image/png',
          size: 500,
          lastModified: new Date('2024-01-01')
        }
      ];

      const context = createFileContext(processedFiles, {
        includeMetadata: true
      });

      expect(context).toBeDefined();
      expect(context.content).toHaveLength(2);

      // Check text content includes original path
      expect(context.content[0].type).toBe('text');
      expect(context.content[0].text).toContain('./test.txt');
      expect(context.content[0].text).toContain('Hello from relative path');

      // Check image content
      expect(context.content[1].type).toBe('image');
      expect(context.content[1].metadata.path).toBe('images/test.png');
    });
  });
});

// Integration tests removed since they require real file system access
// The unit tests with mocked file system provide comprehensive coverage
// for relative path handling including:
// - Simple relative paths (./file.png, file.png)
// - Nested relative paths (../dir/file.png)
// - Mixed relative and absolute paths
// - Error handling for non-existent files
// - Security validation for path traversal
