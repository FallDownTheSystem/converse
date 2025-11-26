import { describe, it, expect } from 'vitest';
import {
  parseFilePathWithRange,
  extractLineRange,
  validateRange,
} from '../../src/utils/pathParser.js';

describe('Path Parser', () => {
  describe('parseFilePathWithRange', () => {
    it('should return original path when no range specifier', () => {
      const result = parseFilePathWithRange('file.txt');
      expect(result).toEqual({ filePath: 'file.txt', range: null });
    });

    it('should parse full range specifier {start:end}', () => {
      const result = parseFilePathWithRange('file.txt{10:50}');
      expect(result).toEqual({
        filePath: 'file.txt',
        range: { start: 10, end: 50, isEmpty: false },
      });
    });

    it('should parse range with start only {start:}', () => {
      const result = parseFilePathWithRange('file.txt{100:}');
      expect(result).toEqual({
        filePath: 'file.txt',
        range: { start: 100, end: null, isEmpty: false },
      });
    });

    it('should parse range with end only {:end}', () => {
      const result = parseFilePathWithRange('file.txt{:20}');
      expect(result).toEqual({
        filePath: 'file.txt',
        range: { start: null, end: 20, isEmpty: false },
      });
    });

    it('should detect empty range {:} as isEmpty', () => {
      const result = parseFilePathWithRange('file.txt{:}');
      expect(result).toEqual({
        filePath: 'file.txt',
        range: { start: null, end: null, isEmpty: true },
      });
    });

    it('should treat 0 as 1 for start line', () => {
      const result = parseFilePathWithRange('file.txt{0:50}');
      expect(result).toEqual({
        filePath: 'file.txt',
        range: { start: 1, end: 50, isEmpty: false },
      });
    });

    it('should handle relative paths with ranges', () => {
      const result = parseFilePathWithRange('./src/utils/helper.js{10:50}');
      expect(result).toEqual({
        filePath: './src/utils/helper.js',
        range: { start: 10, end: 50, isEmpty: false },
      });
    });

    it('should handle absolute Windows paths with ranges', () => {
      const result = parseFilePathWithRange(
        'C:\\Users\\username\\project\\file.txt{5:15}',
      );
      expect(result).toEqual({
        filePath: 'C:\\Users\\username\\project\\file.txt',
        range: { start: 5, end: 15, isEmpty: false },
      });
    });

    it('should handle paths with nested directories', () => {
      const result = parseFilePathWithRange(
        '../sibling-dir/subdir/file.txt{1:100}',
      );
      expect(result).toEqual({
        filePath: '../sibling-dir/subdir/file.txt',
        range: { start: 1, end: 100, isEmpty: false },
      });
    });

    it('should treat invalid syntax as part of filename (letters in range)', () => {
      const result = parseFilePathWithRange('file.txt{abc:xyz}');
      expect(result).toEqual({
        filePath: 'file.txt{abc:xyz}',
        range: null,
      });
    });

    it('should treat negative numbers as part of filename', () => {
      const result = parseFilePathWithRange('file.txt{-5:10}');
      expect(result).toEqual({
        filePath: 'file.txt{-5:10}',
        range: null,
      });
    });

    it('should treat braces not at end as part of filename', () => {
      const result = parseFilePathWithRange('file{1:5}.txt');
      expect(result).toEqual({
        filePath: 'file{1:5}.txt',
        range: null,
      });
    });

    it('should handle empty string input', () => {
      const result = parseFilePathWithRange('');
      expect(result).toEqual({ filePath: '', range: null });
    });

    it('should handle null input', () => {
      const result = parseFilePathWithRange(null);
      expect(result).toEqual({ filePath: null, range: null });
    });

    it('should handle undefined input', () => {
      const result = parseFilePathWithRange(undefined);
      expect(result).toEqual({ filePath: undefined, range: null });
    });

    it('should handle files that look like they have ranges but with spaces', () => {
      const result = parseFilePathWithRange('file.txt{ 1 : 5 }');
      expect(result).toEqual({
        filePath: 'file.txt{ 1 : 5 }',
        range: null,
      });
    });

    it('should handle single line range {n:n}', () => {
      const result = parseFilePathWithRange('file.txt{5:5}');
      expect(result).toEqual({
        filePath: 'file.txt',
        range: { start: 5, end: 5, isEmpty: false },
      });
    });
  });

  describe('extractLineRange', () => {
    const sampleLines = ['line 1', 'line 2', 'line 3', 'line 4', 'line 5'];

    it('should extract lines with full range', () => {
      const result = extractLineRange(sampleLines, {
        start: 2,
        end: 4,
        isEmpty: false,
      });
      expect(result.lines).toEqual(['line 2', 'line 3', 'line 4']);
      expect(result.actualStart).toBe(2);
      expect(result.actualEnd).toBe(4);
    });

    it('should extract from start to specified end', () => {
      const result = extractLineRange(sampleLines, {
        start: null,
        end: 3,
        isEmpty: false,
      });
      expect(result.lines).toEqual(['line 1', 'line 2', 'line 3']);
      expect(result.actualStart).toBe(1);
      expect(result.actualEnd).toBe(3);
    });

    it('should extract from specified start to end of file', () => {
      const result = extractLineRange(sampleLines, {
        start: 3,
        end: null,
        isEmpty: false,
      });
      expect(result.lines).toEqual(['line 3', 'line 4', 'line 5']);
      expect(result.actualStart).toBe(3);
      expect(result.actualEnd).toBe(5);
    });

    it('should clamp end to actual file bounds', () => {
      const result = extractLineRange(sampleLines, {
        start: 3,
        end: 100,
        isEmpty: false,
      });
      expect(result.lines).toEqual(['line 3', 'line 4', 'line 5']);
      expect(result.actualStart).toBe(3);
      expect(result.actualEnd).toBe(5);
    });

    it('should return empty when start > file length', () => {
      const result = extractLineRange(sampleLines, {
        start: 10,
        end: 20,
        isEmpty: false,
      });
      expect(result.lines).toEqual([]);
      expect(result.actualStart).toBe(10);
      // actualEnd is clamped to file bounds (5), not the requested end (20)
      expect(result.actualEnd).toBe(5);
    });

    it('should treat start < 1 as 1', () => {
      const result = extractLineRange(sampleLines, {
        start: 0,
        end: 2,
        isEmpty: false,
      });
      expect(result.lines).toEqual(['line 1', 'line 2']);
      expect(result.actualStart).toBe(1);
      expect(result.actualEnd).toBe(2);
    });

    it('should return all lines when range is null', () => {
      const result = extractLineRange(sampleLines, null);
      expect(result.lines).toEqual(sampleLines);
      expect(result.actualStart).toBe(1);
      expect(result.actualEnd).toBe(5);
    });

    it('should handle empty lines array', () => {
      const result = extractLineRange([], { start: 1, end: 5, isEmpty: false });
      expect(result.lines).toEqual([]);
      expect(result.actualStart).toBe(1);
      // actualEnd is clamped to file bounds (0), not the requested end (5)
      expect(result.actualEnd).toBe(0);
    });

    it('should handle single line extraction', () => {
      const result = extractLineRange(sampleLines, {
        start: 3,
        end: 3,
        isEmpty: false,
      });
      expect(result.lines).toEqual(['line 3']);
      expect(result.actualStart).toBe(3);
      expect(result.actualEnd).toBe(3);
    });

    it('should handle null lines array', () => {
      const result = extractLineRange(null, {
        start: 1,
        end: 5,
        isEmpty: false,
      });
      expect(result.lines).toEqual([]);
    });
  });

  describe('validateRange', () => {
    it('should return valid for null range', () => {
      const result = validateRange(null);
      expect(result).toEqual({ valid: true, error: null, code: null });
    });

    it('should return valid for normal range', () => {
      const result = validateRange({ start: 5, end: 10, isEmpty: false });
      expect(result).toEqual({ valid: true, error: null, code: null });
    });

    it('should return invalid for empty range', () => {
      const result = validateRange({ start: null, end: null, isEmpty: true });
      expect(result.valid).toBe(false);
      expect(result.code).toBe('EMPTY_RANGE');
      expect(result.error).toContain('Empty range specifier');
    });

    it('should return invalid when start > end', () => {
      const result = validateRange({ start: 50, end: 10, isEmpty: false });
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_RANGE');
      expect(result.error).toContain('start (50) is greater than end (10)');
    });

    it('should return valid when start = end', () => {
      const result = validateRange({ start: 5, end: 5, isEmpty: false });
      expect(result).toEqual({ valid: true, error: null, code: null });
    });

    it('should return valid for start-only range', () => {
      const result = validateRange({ start: 5, end: null, isEmpty: false });
      expect(result).toEqual({ valid: true, error: null, code: null });
    });

    it('should return valid for end-only range', () => {
      const result = validateRange({ start: null, end: 20, isEmpty: false });
      expect(result).toEqual({ valid: true, error: null, code: null });
    });
  });
});
