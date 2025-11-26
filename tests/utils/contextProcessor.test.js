import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  processFileContent,
  processMultipleFiles,
  processUnifiedContext,
  createFileContext,
  validateFilePath,
  ContextProcessorError,
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
      mtime: new Date('2024-01-01'),
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
        skipSecurityCheck: true,
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
        skipSecurityCheck: true,
      });

      expect(result.path).toBe(expectedAbsolutePath);
      expect(result.originalPath).toBe(relativePath);
      expect(result.type).toBe('image');
      expect(result.mimeType).toBe('image/png');
      expect(result.content).toBe(
        Buffer.from('fake-png-data').toString('base64'),
      );
    });

    it('should handle nested relative paths', async () => {
      const relativePath = '../sibling-dir/image.jpg';
      const expectedAbsolutePath = resolve(process.cwd(), relativePath);

      readFile.mockImplementation(() =>
        Promise.resolve(Buffer.from('fake-jpg-data')),
      );

      const result = await processFileContent(relativePath, {
        skipSecurityCheck: true,
      });

      expect(result.path).toBe(expectedAbsolutePath);
      expect(result.originalPath).toBe(relativePath);
      expect(result.type).toBe('image');
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('should handle current directory relative paths', async () => {
      const relativePath = 'test.png';
      const expectedAbsolutePath = resolve(process.cwd(), relativePath);

      readFile.mockImplementation(() =>
        Promise.resolve(Buffer.from('fake-png-data')),
      );

      const result = await processFileContent(relativePath, {
        skipSecurityCheck: true,
      });

      expect(result.path).toBe(expectedAbsolutePath);
      expect(result.originalPath).toBe(relativePath);
      expect(result.type).toBe('image');
    });

    it('should process multiple files with mixed relative and absolute paths', async () => {
      const files = [
        'relative-text.txt',
        './relative-dir/image.png',
        resolve(process.cwd(), 'absolute-file.json'),
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
        skipSecurityCheck: true,
      });

      expect(results).toHaveLength(3);
      expect(results[0].path).toBe(resolve(process.cwd(), 'relative-text.txt'));
      expect(results[0].originalPath).toBe('relative-text.txt');
      expect(results[1].path).toBe(
        resolve(process.cwd(), './relative-dir/image.png'),
      );
      expect(results[1].originalPath).toBe('./relative-dir/image.png');
      expect(results[2].path).toBe(
        resolve(process.cwd(), 'absolute-file.json'),
      );
      expect(results[2].originalPath).toBe(
        resolve(process.cwd(), 'absolute-file.json'),
      );
    });
  });

  describe('Unified Context Processing', () => {
    it('should process images with relative paths in unified context', async () => {
      const contextRequest = {
        images: ['test.png', './images/photo.jpg'],
        files: [],
        webSearch: null,
      };

      readFile.mockImplementation((path) => {
        if (path.includes('.png') || path.includes('.jpg')) {
          return Promise.resolve(Buffer.from('image-data'));
        }
        return Promise.resolve('text-data');
      });

      const result = await processUnifiedContext(contextRequest, {
        skipSecurityCheck: true,
      });

      expect(result.images).toHaveLength(2);
      expect(result.images[0].path).toBe(resolve(process.cwd(), 'test.png'));
      expect(result.images[0].type).toBe('image');
      expect(result.images[1].path).toBe(
        resolve(process.cwd(), './images/photo.jpg'),
      );
      expect(result.images[1].type).toBe('image');
    });

    it('should handle mixed files and images with relative paths', async () => {
      const contextRequest = {
        files: ['docs/readme.md', '../config.json'],
        images: ['screenshots/ui.png', './assets/logo.gif'],
        webSearch: null,
      };

      readFile.mockImplementation((path, encoding) => {
        if (encoding === 'utf8') {
          return Promise.resolve('text content');
        }
        return Promise.resolve(Buffer.from('binary content'));
      });

      const result = await processUnifiedContext(contextRequest, {
        skipSecurityCheck: true,
      });

      expect(result.files).toHaveLength(2);
      expect(result.images).toHaveLength(2);

      // Check files
      expect(result.files[0].originalPath).toBe('docs/readme.md');
      expect(result.files[0].path).toBe(
        resolve(process.cwd(), 'docs/readme.md'),
      );
      expect(result.files[1].originalPath).toBe('../config.json');
      expect(result.files[1].path).toBe(
        resolve(process.cwd(), '../config.json'),
      );

      // Check images
      expect(result.images[0].originalPath).toBe('screenshots/ui.png');
      expect(result.images[0].path).toBe(
        resolve(process.cwd(), 'screenshots/ui.png'),
      );
      expect(result.images[1].originalPath).toBe('./assets/logo.gif');
      expect(result.images[1].path).toBe(
        resolve(process.cwd(), './assets/logo.gif'),
      );
    });
  });

  describe('Error Handling with Relative Paths', () => {
    it('should handle non-existent relative path files', async () => {
      access.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const result = await processFileContent('./non-existent.png', {
        skipSecurityCheck: true,
      });

      expect(result.type).toBe('error');
      expect(result.error).toContain('File not accessible');
      expect(result.originalPath).toBe('./non-existent.png');
    });

    it('should preserve original relative path in error messages', async () => {
      access.mockRejectedValue(new Error('Permission denied'));

      const relativePath = '../protected/secret.txt';
      const result = await processFileContent(relativePath, {
        skipSecurityCheck: true,
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
        skipSecurityCheck: false,
      });

      expect(result.type).toBe('text');
      expect(result.path).toBe(resolve(process.cwd(), relativePath));
    });

    it('should reject relative paths outside allowed directories when security is enforced', async () => {
      const relativePath = '../../outside-project/file.txt';
      const allowedDirs = [process.cwd()];

      const result = await processFileContent(relativePath, {
        allowedDirectories: allowedDirs,
        enforceSecurityCheck: true, // Changed to use the new flag
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
          lastModified: new Date('2024-01-01'),
        },
        {
          path: resolve(process.cwd(), 'images/test.png'),
          originalPath: 'images/test.png',
          type: 'image',
          content: 'base64-image-data',
          mimeType: 'image/png',
          size: 500,
          lastModified: new Date('2024-01-01'),
        },
      ];

      const context = createFileContext(processedFiles, {
        includeMetadata: true,
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

describe('Line Range Processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    access.mockResolvedValue(undefined);
    stat.mockResolvedValue({
      isFile: () => true,
      size: 1000,
      mtime: new Date('2024-01-01'),
    });
  });

  const multiLineContent =
    'line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\nline 10';

  it('should extract lines with full range {start:end}', async () => {
    readFile.mockResolvedValue(multiLineContent);

    const result = await processFileContent('test.txt{2:4}', {
      skipSecurityCheck: true,
    });

    expect(result.type).toBe('text');
    expect(result.content).toBe('line 2\nline 3\nline 4');
    expect(result.lineCount).toBe(3);
    expect(result.totalLineCount).toBe(10);
    expect(result.rangeStart).toBe(2);
    expect(result.rangeEnd).toBe(4);
    expect(result.originalPath).toBe('test.txt{2:4}');
  });

  it('should extract lines from start to specified end {:end}', async () => {
    readFile.mockResolvedValue(multiLineContent);

    const result = await processFileContent('test.txt{:3}', {
      skipSecurityCheck: true,
    });

    expect(result.type).toBe('text');
    expect(result.content).toBe('line 1\nline 2\nline 3');
    expect(result.lineCount).toBe(3);
    expect(result.totalLineCount).toBe(10);
    expect(result.rangeStart).toBe(1);
    expect(result.rangeEnd).toBe(3);
  });

  it('should extract lines from specified start to end of file {start:}', async () => {
    readFile.mockResolvedValue(multiLineContent);

    const result = await processFileContent('test.txt{8:}', {
      skipSecurityCheck: true,
    });

    expect(result.type).toBe('text');
    expect(result.content).toBe('line 8\nline 9\nline 10');
    expect(result.lineCount).toBe(3);
    expect(result.totalLineCount).toBe(10);
    expect(result.rangeStart).toBe(8);
    expect(result.rangeEnd).toBe(10);
  });

  it('should clamp end to actual file bounds when range exceeds file length', async () => {
    readFile.mockResolvedValue(multiLineContent);

    const result = await processFileContent('test.txt{8:500}', {
      skipSecurityCheck: true,
    });

    expect(result.type).toBe('text');
    expect(result.content).toBe('line 8\nline 9\nline 10');
    expect(result.lineCount).toBe(3);
    expect(result.rangeEnd).toBe(10);
  });

  it('should return empty content when start > file length', async () => {
    readFile.mockResolvedValue(multiLineContent);

    const result = await processFileContent('test.txt{200:300}', {
      skipSecurityCheck: true,
    });

    expect(result.type).toBe('text');
    expect(result.content).toBe('');
    expect(result.lineCount).toBe(0);
    expect(result.totalLineCount).toBe(10);
  });

  it('should treat start=0 as start=1', async () => {
    readFile.mockResolvedValue(multiLineContent);

    const result = await processFileContent('test.txt{0:3}', {
      skipSecurityCheck: true,
    });

    expect(result.type).toBe('text');
    expect(result.content).toBe('line 1\nline 2\nline 3');
    expect(result.rangeStart).toBe(1);
    expect(result.rangeEnd).toBe(3);
  });

  it('should return error for empty range {:}', async () => {
    const result = await processFileContent('test.txt{:}', {
      skipSecurityCheck: true,
    });

    expect(result.type).toBe('error');
    expect(result.error).toContain('Empty range specifier');
    expect(result.errorCode).toBe('EMPTY_RANGE');
  });

  it('should return error when start > end', async () => {
    const result = await processFileContent('test.txt{50:10}', {
      skipSecurityCheck: true,
    });

    expect(result.type).toBe('error');
    expect(result.error).toContain('start (50) is greater than end (10)');
    expect(result.errorCode).toBe('INVALID_RANGE');
  });

  it('should process file normally without range specifier', async () => {
    readFile.mockResolvedValue(multiLineContent);

    const result = await processFileContent('test.txt', {
      skipSecurityCheck: true,
    });

    expect(result.type).toBe('text');
    expect(result.content).toBe(multiLineContent);
    expect(result.lineCount).toBe(10);
    expect(result.totalLineCount).toBe(10);
    expect(result.rangeStart).toBeUndefined();
    expect(result.rangeEnd).toBeUndefined();
  });

  it('should handle relative paths with ranges', async () => {
    readFile.mockResolvedValue(multiLineContent);

    const result = await processFileContent('./src/utils/helper.js{10:50}', {
      skipSecurityCheck: true,
    });

    expect(result.type).toBe('text');
    expect(result.originalPath).toBe('./src/utils/helper.js{10:50}');
    expect(result.path).toBe(resolve(process.cwd(), './src/utils/helper.js'));
    expect(result.totalLineCount).toBe(10);
  });

  it('should handle single line extraction {n:n}', async () => {
    readFile.mockResolvedValue(multiLineContent);

    const result = await processFileContent('test.txt{5:5}', {
      skipSecurityCheck: true,
    });

    expect(result.type).toBe('text');
    expect(result.content).toBe('line 5');
    expect(result.lineCount).toBe(1);
  });

  it('should handle files with Windows-style line endings (CRLF)', async () => {
    const crlfContent = 'line 1\r\nline 2\r\nline 3\r\nline 4\r\nline 5';
    readFile.mockResolvedValue(crlfContent);

    const result = await processFileContent('test.txt{2:4}', {
      skipSecurityCheck: true,
    });

    expect(result.type).toBe('text');
    expect(result.content).toBe('line 2\nline 3\nline 4');
    expect(result.lineCount).toBe(3);
    expect(result.totalLineCount).toBe(5);
  });

  it('should treat invalid range syntax as part of filename', async () => {
    access.mockRejectedValue(new Error('ENOENT: no such file or directory'));

    const result = await processFileContent('test.txt{abc:xyz}', {
      skipSecurityCheck: true,
    });

    // File with invalid range in name doesn't exist, so it's a file access error
    expect(result.type).toBe('error');
    expect(result.error).toContain('File not accessible');
    expect(result.originalPath).toBe('test.txt{abc:xyz}');
  });
});

describe('createFileContext with Line Ranges', () => {
  it('should include range info in file header when range was applied', () => {
    const processedFiles = [
      {
        path: resolve(process.cwd(), 'test.txt'),
        originalPath: 'test.txt{10:20}',
        type: 'text',
        content: 'extracted lines here',
        size: 1000,
        lineCount: 11,
        totalLineCount: 100,
        rangeStart: 10,
        rangeEnd: 20,
        lastModified: new Date('2024-01-01'),
      },
    ];

    const context = createFileContext(processedFiles);

    expect(context.content[0].text).toContain('test.txt{10:20}');
    expect(context.content[0].text).toContain('(lines 10-20 of 100)');
  });

  it('should not include range info for full file reads', () => {
    const processedFiles = [
      {
        path: resolve(process.cwd(), 'test.txt'),
        originalPath: 'test.txt',
        type: 'text',
        content: 'full file content',
        size: 1000,
        lineCount: 50,
        totalLineCount: 50,
        // No rangeStart/rangeEnd for full file reads
        lastModified: new Date('2024-01-01'),
      },
    ];

    const context = createFileContext(processedFiles);

    expect(context.content[0].text).toContain('test.txt');
    expect(context.content[0].text).not.toContain('(lines');
  });
});
