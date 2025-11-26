/**
 * Path Parser Utility
 *
 * Parses file paths with optional line range specifiers.
 * Syntax: path/to/file{start:end} where start and end are 1-based line numbers.
 *
 * Examples:
 * - file.txt{10:50} - Lines 10-50 inclusive
 * - file.txt{:20}   - Lines 1-20
 * - file.txt{100:}  - Lines 100 to end
 * - file.txt        - Entire file (no range)
 */

/**
 * Regex to match line range specifier at end of path.
 * Captures: (filePath)(startLine)(endLine)
 * Pattern: ^(.*)\{(\d*):(\d*)\}$
 */
const RANGE_PATTERN = /^(.*)\{(\d*):(\d*)\}$/;

/**
 * Parse a file path that may contain a line range specifier.
 *
 * @param {string} filePath - File path potentially with range specifier
 * @returns {{filePath: string, range: {start: number|null, end: number|null, isEmpty: boolean}|null}}
 *
 * @example
 * parseFilePathWithRange('file.txt{10:50}')
 * // => { filePath: 'file.txt', range: { start: 10, end: 50, isEmpty: false } }
 *
 * @example
 * parseFilePathWithRange('file.txt{:20}')
 * // => { filePath: 'file.txt', range: { start: null, end: 20, isEmpty: false } }
 *
 * @example
 * parseFilePathWithRange('file.txt')
 * // => { filePath: 'file.txt', range: null }
 */
export function parseFilePathWithRange(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return { filePath, range: null };
  }

  const match = filePath.match(RANGE_PATTERN);

  if (!match) {
    // No range specifier found, return original path
    return { filePath, range: null };
  }

  const [, extractedPath, startStr, endStr] = match;

  // Check for empty range {:}
  if (startStr === '' && endStr === '') {
    return {
      filePath: extractedPath,
      range: { start: null, end: null, isEmpty: true },
    };
  }

  // Parse start line (treat 0 as 1)
  let start = null;
  if (startStr !== '') {
    start = parseInt(startStr, 10);
    if (start === 0) {
      start = 1;
    }
  }

  // Parse end line
  let end = null;
  if (endStr !== '') {
    end = parseInt(endStr, 10);
  }

  return {
    filePath: extractedPath,
    range: { start, end, isEmpty: false },
  };
}

/**
 * Extract a range of lines from an array of lines.
 * Both start and end are 1-indexed and inclusive.
 *
 * @param {string[]} lines - Array of lines
 * @param {{start: number|null, end: number|null, isEmpty: boolean}} range - Range specification
 * @returns {{lines: string[], actualStart: number, actualEnd: number}}
 *
 * @example
 * extractLineRange(['a', 'b', 'c', 'd', 'e'], { start: 2, end: 4, isEmpty: false })
 * // => { lines: ['b', 'c', 'd'], actualStart: 2, actualEnd: 4 }
 */
export function extractLineRange(lines, range) {
  if (!range || !Array.isArray(lines)) {
    return {
      lines: lines || [],
      actualStart: 1,
      actualEnd: lines ? lines.length : 0,
    };
  }

  const totalLines = lines.length;

  // Determine start index (1-indexed to 0-indexed conversion)
  // Default to 1 if not specified
  let startLine = range.start !== null ? range.start : 1;

  // Clamp start to valid range (at least 1)
  if (startLine < 1) {
    startLine = 1;
  }

  // Determine end index (inclusive)
  // Default to total lines if not specified
  let endLine = range.end !== null ? range.end : totalLines;

  // Clamp end to actual file bounds
  if (endLine > totalLines) {
    endLine = totalLines;
  }

  // Handle case where start > total lines (return empty)
  if (startLine > totalLines) {
    return {
      lines: [],
      actualStart: startLine,
      actualEnd: endLine,
    };
  }

  // Convert to 0-indexed for slice
  // slice(start, end) is exclusive of end, so we use endLine (not endLine - 1)
  const extractedLines = lines.slice(startLine - 1, endLine);

  return {
    lines: extractedLines,
    actualStart: startLine,
    actualEnd: Math.min(endLine, totalLines),
  };
}

/**
 * Validate a line range.
 *
 * @param {{start: number|null, end: number|null, isEmpty: boolean}} range - Range to validate
 * @returns {{valid: boolean, error: string|null, code: string|null}}
 */
export function validateRange(range) {
  if (!range) {
    return { valid: true, error: null, code: null };
  }

  // Empty range {:} is invalid
  if (range.isEmpty) {
    return {
      valid: false,
      error: 'Empty range specifier {:} is not allowed',
      code: 'EMPTY_RANGE',
    };
  }

  // Check if start > end (when both are specified)
  if (range.start !== null && range.end !== null && range.start > range.end) {
    return {
      valid: false,
      error: `Invalid range: start (${range.start}) is greater than end (${range.end})`,
      code: 'INVALID_RANGE',
    };
  }

  return { valid: true, error: null, code: null };
}
