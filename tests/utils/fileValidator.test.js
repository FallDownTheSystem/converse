import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  validateFilePaths,
  validateAllPaths,
} from '../../src/utils/fileValidator.js';
import { access, constants } from 'fs/promises';
import { resolve } from 'path';
import { getTestAbsolutePath } from '../../src/utils/pathUtils.js';

// Mock fs modules
vi.mock('fs/promises');

describe('File Validator Unit Tests', () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Default mock - files exist
    access.mockResolvedValue(undefined);
  });

  describe('validateFilePaths', () => {
    it('should return valid for empty file paths', async () => {
      const result = await validateFilePaths([]);
      expect(result.valid).toBe(true);
      expect(result.missingPaths).toEqual([]);
    });

    it('should return valid for null/undefined input', async () => {
      const result = await validateFilePaths(null);
      expect(result.valid).toBe(true);
      expect(result.missingPaths).toEqual([]);
    });

    it('should validate single existing file', async () => {
      const result = await validateFilePaths(['test.txt']);
      expect(result.valid).toBe(true);
      expect(result.missingPaths).toEqual([]);
      expect(access).toHaveBeenCalledWith(
        resolve(process.cwd(), 'test.txt'),
        constants.R_OK,
      );
    });

    it('should validate multiple existing files', async () => {
      const files = ['file1.txt', 'file2.txt', 'file3.txt'];
      const result = await validateFilePaths(files);
      expect(result.valid).toBe(true);
      expect(result.missingPaths).toEqual([]);
      expect(access).toHaveBeenCalledTimes(3);
    });

    it('should handle absolute paths correctly', async () => {
      const absolutePath = getTestAbsolutePath('Users', 'Test', 'file.txt');
      const result = await validateFilePaths([absolutePath]);
      expect(result.valid).toBe(true);
      expect(access).toHaveBeenCalledWith(absolutePath, constants.R_OK);
    });

    it('should report single missing file', async () => {
      access.mockRejectedValue(new Error('ENOENT'));

      const result = await validateFilePaths(['missing.txt'], 'file');
      expect(result.valid).toBe(false);
      expect(result.missingPaths).toEqual(['missing.txt']);
      expect(result.error.content[0].text).toBe(
        'The following file could not be found: missing.txt',
      );
    });

    it('should report multiple missing files', async () => {
      access.mockRejectedValue(new Error('ENOENT'));

      const files = ['missing1.txt', 'missing2.txt', 'missing3.txt'];
      const result = await validateFilePaths(files, 'file');
      expect(result.valid).toBe(false);
      expect(result.missingPaths).toEqual(files);
      expect(result.error.content[0].text).toBe(
        'The following files could not be found: missing1.txt, missing2.txt, missing3.txt',
      );
    });

    it('should handle mixed existing and missing files', async () => {
      access.mockImplementation((path) => {
        if (path.includes('exists')) return Promise.resolve();
        return Promise.reject(new Error('ENOENT'));
      });

      const files = ['exists1.txt', 'missing.txt', 'exists2.txt'];
      const result = await validateFilePaths(files);
      expect(result.valid).toBe(false);
      expect(result.missingPaths).toEqual(['missing.txt']);
    });

    it('should handle invalid path types', async () => {
      const result = await validateFilePaths([
        null,
        undefined,
        123,
        'valid.txt',
      ]);
      expect(result.valid).toBe(false);
      expect(result.missingPaths).toContain('Invalid path: null');
      expect(result.missingPaths).toContain('Invalid path: undefined');
      expect(result.missingPaths).toContain('Invalid path: 123');
    });

    it('should use custom file type in error message', async () => {
      access.mockRejectedValue(new Error('ENOENT'));

      const result = await validateFilePaths(['missing.png'], 'image');
      expect(result.error.content[0].text).toBe(
        'The following image could not be found: missing.png',
      );
    });
  });

  describe('validateAllPaths', () => {
    it('should return valid for empty input', async () => {
      const result = await validateAllPaths({});
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should validate only files when no images provided', async () => {
      const result = await validateAllPaths({
        files: ['file1.txt', 'file2.txt'],
      });
      expect(result.valid).toBe(true);
      expect(access).toHaveBeenCalledTimes(2);
    });

    it('should validate only images when no files provided', async () => {
      const result = await validateAllPaths({
        images: ['image1.png', 'image2.jpg'],
      });
      expect(result.valid).toBe(true);
      expect(access).toHaveBeenCalledTimes(2);
    });

    it('should validate both files and images', async () => {
      const result = await validateAllPaths({
        files: ['file1.txt', 'file2.txt'],
        images: ['image1.png', 'image2.jpg'],
      });
      expect(result.valid).toBe(true);
      expect(access).toHaveBeenCalledTimes(4);
    });

    it('should report missing files separately from images', async () => {
      access.mockImplementation((path) => {
        if (path.includes('.txt')) return Promise.reject(new Error('ENOENT'));
        return Promise.resolve();
      });

      const result = await validateAllPaths({
        files: ['missing1.txt', 'missing2.txt'],
        images: ['exists.png', 'exists.jpg'],
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBe(
        'Files not found: missing1.txt, missing2.txt',
      );
    });

    it('should report both missing files and images', async () => {
      access.mockRejectedValue(new Error('ENOENT'));

      const result = await validateAllPaths({
        files: ['missing.txt'],
        images: ['missing.png'],
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toBe('Files not found: missing.txt');
      expect(result.errors[1]).toBe('Images not found: missing.png');
      expect(result.errorResponse.content[0].text).toBe(
        'Files not found: missing.txt. Images not found: missing.png',
      );
    });

    it('should handle mixed paths correctly', async () => {
      access.mockImplementation((path) => {
        // Only .txt files missing
        if (path.includes('.txt')) return Promise.reject(new Error('ENOENT'));
        // Only missing.png is missing
        if (path.includes('missing.png'))
          return Promise.reject(new Error('ENOENT'));
        return Promise.resolve();
      });

      const result = await validateAllPaths({
        files: ['missing.txt', '../relative/path.md'],
        images: [
          'exists.jpg',
          'missing.png',
          getTestAbsolutePath('absolute', 'path.gif'),
        ],
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toBe('Files not found: missing.txt');
      expect(result.errors[1]).toBe('Images not found: missing.png');
    });
  });
});

describe('File Validator Integration Tests', () => {
  it('should work with chat tool error format', async () => {
    access.mockRejectedValue(new Error('ENOENT'));

    const result = await validateAllPaths({
      files: ['nonexistent.txt'],
      images: ['nonexistent.png'],
    });

    expect(result.errorResponse).toBeDefined();
    expect(result.errorResponse.isError).toBe(true);
    expect(result.errorResponse.content).toBeInstanceOf(Array);
    expect(result.errorResponse.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('Files not found'),
    });
  });
});
