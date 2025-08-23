/**
 * Context Processor Utilities
 *
 * Unified interface for handling files, images, and web search context processing.
 * Uses Node.js built-in modules with security validation and comprehensive error handling.
 * Includes placeholders for advanced features that can be enhanced later.
 */

import { readFile, stat, access } from 'fs/promises';
import { extname, resolve, isAbsolute } from 'path';
import { constants } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Security: Define allowed directories for file access
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../../..');

/**
 * Custom error class for context processing operations
 */
export class ContextProcessorError extends Error {
  constructor(message, code = 'CONTEXT_ERROR', details = {}) {
    super(message);
    this.name = 'ContextProcessorError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Supported image extensions (everything else is treated as text)
 */
const SUPPORTED_IMAGE_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'
];

/**
 * Security validation for file paths
 * @param {string} filePath - Path to validate
 * @param {object} options - Validation options
 * @returns {Promise<string>} Validated absolute path
 * @throws {ContextProcessorError} If path is invalid or unsafe
 */
async function validateFilePath(filePath, options = {}) {
  // Check if path is provided
  if (!filePath || typeof filePath !== 'string') {
    throw new ContextProcessorError(
      'File path must be a non-empty string',
      'INVALID_PATH'
    );
  }

  // Convert to absolute path
  // For relative paths, resolve from the client's working directory if provided,
  // otherwise use process.cwd()
  const absolutePath = isAbsolute(filePath) ? filePath : resolve(options.clientCwd || process.cwd(), filePath);

  // Security check is now optional and disabled by default
  if (options.enforceSecurityCheck) {
    const allowedDirs = options.allowedDirectories || [process.cwd(), PROJECT_ROOT];
    const isAllowed = allowedDirs.some(dir => {
      const resolvedDir = resolve(dir);
      return absolutePath.startsWith(resolvedDir);
    });

    if (!isAllowed) {
      throw new ContextProcessorError(
        'File access denied: path outside allowed directories',
        'SECURITY_VIOLATION',
        { path: absolutePath, allowedDirs }
      );
    }
  }

  // Check if file exists and is readable
  try {
    await access(absolutePath, constants.R_OK);
  } catch (error) {
    throw new ContextProcessorError(
      `File not accessible: ${error.message}`,
      'FILE_ACCESS_ERROR',
      { path: absolutePath }
    );
  }

  return absolutePath;
}

/**
 * Process file content for inclusion in AI context
 * @param {string} filePath - Absolute or relative path to the file
 * @param {object} options - Processing options
 * @param {string[]} options.allowedDirectories - Allowed directories for security
 * @param {number} options.maxTextSize - Maximum text file size in bytes
 * @param {number} options.maxImageSize - Maximum image file size in bytes
 * @param {boolean} options.skipSecurityCheck - Skip security validation (for testing)
 * @returns {Promise<object>} Processed content with metadata
 */
export async function processFileContent(filePath, options = {}) {
  try {
    // Handle base64 data URLs
    if (filePath.startsWith('data:')) {
      const dataUrlMatch = filePath.match(/^data:([^;]+);base64,(.+)$/);
      if (!dataUrlMatch) {
        throw new ContextProcessorError(
          'Invalid data URL format',
          'INVALID_DATA_URL'
        );
      }

      const [, mimeType, base64Data] = dataUrlMatch;
      const extension = `.${mimeType.split('/')[1]}`;

      return {
        path: filePath,
        originalPath: filePath,
        size: base64Data.length,
        extension,
        type: 'image',
        content: base64Data,
        error: null,
        lastModified: new Date(),
        encoding: 'base64',
        mimeType
      };
    }

    // Security validation for file paths
    const validatedPath = await validateFilePath(filePath, options);

    const fileStats = await stat(validatedPath);
    const extension = extname(validatedPath).toLowerCase();

    // Check if it's actually a file (not a directory)
    if (!fileStats.isFile()) {
      throw new ContextProcessorError(
        'Path is not a file',
        'NOT_A_FILE',
        { path: validatedPath }
      );
    }

    const result = {
      path: validatedPath,
      originalPath: filePath,
      size: fileStats.size,
      extension,
      type: 'unknown',
      content: null,
      error: null,
      lastModified: fileStats.mtime,
      encoding: null,
    };

    // Check file size limits
    const maxTextSize = options.maxTextSize || 1024 * 1024; // 1MB default
    const maxImageSize = options.maxImageSize || 10 * 1024 * 1024; // 10MB default

    if (SUPPORTED_IMAGE_EXTENSIONS.includes(extension)) {
      result.type = 'image';

      if (fileStats.size > maxImageSize) {
        result.error = `Image too large (${fileStats.size} bytes, max ${maxImageSize})`;
        return result;
      }

      // For images, read as base64 for AI processing
      const buffer = await readFile(validatedPath);
      result.content = buffer.toString('base64');
      result.mimeType = getMimeType(extension);
      result.encoding = 'base64';

    } else {
      // Read everything else as text
      result.type = 'text';

      if (fileStats.size > maxTextSize) {
        result.error = `File too large (${fileStats.size} bytes, max ${maxTextSize})`;
        return result;
      }

      const content = await readFile(validatedPath, 'utf8');
      result.content = content;
      result.lineCount = content.split(/\r?\n/).length;
      result.encoding = 'utf8';
      result.charCount = content.length;
    }

    return result;

  } catch (error) {
    return {
      path: filePath,
      originalPath: filePath,
      type: 'error',
      error: error instanceof ContextProcessorError ? error.message : `Unexpected error: ${error.message}`,
      errorCode: error.code || 'UNKNOWN_ERROR',
      content: null,
      lastModified: null,
    };
  }
}

/**
 * Process multiple files for context with error isolation
 * @param {string[]} filePaths - Array of file paths (absolute or relative)
 * @param {object} options - Processing options
 * @returns {Promise<object[]>} Array of processed file contents
 */
export async function processMultipleFiles(filePaths, options = {}) {
  if (!Array.isArray(filePaths)) {
    throw new ContextProcessorError(
      'filePaths must be an array',
      'INVALID_INPUT'
    );
  }

  // Process files in parallel but isolate errors
  const results = await Promise.allSettled(
    filePaths.map(path => processFileContent(path, options))
  );

  // Convert Promise.allSettled results to consistent format
  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        path: filePaths[index],
        originalPath: filePaths[index],
        type: 'error',
        error: result.reason.message || 'Unknown processing error',
        errorCode: result.reason.code || 'PROCESSING_ERROR',
        content: null,
        lastModified: null,
      };
    }
  });
}

/**
 * Web search context integration (placeholder)
 * @param {string} query - Search query
 * @param {object} options - Search options
 * @returns {Promise<object>} Web search results for context
 */
export async function processWebSearchContext(query, options = {}) {
  // Placeholder implementation - can be enhanced with actual web search API
  return {
    type: 'web_search',
    query,
    results: [],
    error: null,
    timestamp: new Date().toISOString(),
    // Placeholder: Future implementation could integrate with:
    // - Google Search API
    // - Bing Search API
    // - DuckDuckGo API
    // - Custom search engines
    placeholder: true,
    message: 'Web search integration placeholder - not yet implemented'
  };
}

/**
 * Unified context processor - handles all context types
 * @param {object} contextRequest - Context processing request
 * @param {string[]} contextRequest.files - Array of file paths
 * @param {string[]} contextRequest.images - Array of image paths (for explicit image processing)
 * @param {string} contextRequest.webSearch - Web search query
 * @param {object} options - Processing options
 * @returns {Promise<object>} Unified context result
 */
export async function processUnifiedContext(contextRequest, options = {}) {
  const result = {
    files: [],
    images: [],
    webSearch: null,
    errors: [],
    timestamp: new Date().toISOString(),
  };

  try {
    // Process files if provided
    if (contextRequest.files && Array.isArray(contextRequest.files)) {
      result.files = await processMultipleFiles(contextRequest.files, options);
    }

    // Process images if provided (currently same as files, placeholder for advanced features)
    if (contextRequest.images && Array.isArray(contextRequest.images)) {
      result.images = await processMultipleFiles(contextRequest.images, {
        ...options,
        imageProcessingMode: true // Placeholder for future image-specific processing
      });
    }

    // Process web search if provided
    if (contextRequest.webSearch && typeof contextRequest.webSearch === 'string') {
      result.webSearch = await processWebSearchContext(contextRequest.webSearch, options);
    }

  } catch (error) {
    result.errors.push({
      type: 'unified_processing_error',
      message: error.message,
      code: error.code || 'UNKNOWN_ERROR'
    });
  }

  return result;
}

/**
 * Create context message from file contents
 * @param {object[]} processedFiles - Array of processed file contents
 * @param {object} options - Message creation options
 * @returns {object|null} Context message for AI
 */
export function createFileContext(processedFiles, options = {}) {
  if (!Array.isArray(processedFiles)) {
    return null;
  }

  const textFiles = processedFiles.filter(f => f.type === 'text' && !f.error);
  const imageFiles = processedFiles.filter(f => f.type === 'image' && !f.error);
  const errors = processedFiles.filter(f => f.error);

  const includeErrors = options.includeErrors !== false; // Default to true

  let contextText = '';

  if (textFiles.length > 0) {
    contextText += '=== FILE CONTEXT ===\n\n';
    for (const file of textFiles) {
      contextText += `--- ${file.originalPath || file.path} ---\n`;
      if (options.includeMetadata) {
        contextText += `Size: ${file.size} bytes, Lines: ${file.lineCount || 'N/A'}\n`;
        contextText += `Last Modified: ${file.lastModified || 'N/A'}\n`;
      }
      contextText += `${file.content}\n\n`;
    }
  }

  if (errors.length > 0 && includeErrors) {
    contextText += '=== FILE ERRORS ===\n';
    for (const error of errors) {
      contextText += `${error.originalPath || error.path}: ${error.error}`;
      if (error.errorCode) {
        contextText += ` (${error.errorCode})`;
      }
      contextText += '\n';
    }
    contextText += '\n';
  }

  const message = {
    role: 'user',
    content: [],
  };

  if (contextText) {
    message.content.push({
      type: 'text',
      text: contextText,
    });
  }

  // Add images with metadata
  for (const image of imageFiles) {
    message.content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: image.mimeType,
        data: image.content,
      },
      // Add metadata for debugging
      metadata: options.includeMetadata ? {
        path: image.originalPath || image.path,
        size: image.size,
        lastModified: image.lastModified
      } : undefined
    });
  }

  return message.content.length > 0 ? message : null;
}

/**
 * Get MIME type for file extension
 * @param {string} extension - File extension
 * @returns {string} MIME type
 */
function getMimeType(extension) {
  const mimeTypes = {
    // Images
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    // Text files
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.js': 'text/javascript',
    '.ts': 'text/typescript',
    '.json': 'application/json',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.html': 'text/html',
    '.css': 'text/css',
    '.xml': 'text/xml',
  };

  return mimeTypes[extension] || 'application/octet-stream';
}

/**
 * Validate file paths with security checks
 * @param {string[]} filePaths - Array of file paths to validate
 * @param {object} options - Validation options
 * @returns {Promise<object>} Validation result with valid/invalid paths
 */
export async function validateFilePaths(filePaths, options = {}) {
  if (!Array.isArray(filePaths)) {
    throw new ContextProcessorError(
      'filePaths must be an array',
      'INVALID_INPUT'
    );
  }

  const results = {
    valid: [],
    invalid: [],
    securityViolations: [],
  };

  for (const path of filePaths) {
    try {
      const validatedPath = await validateFilePath(path, options);
      results.valid.push({
        originalPath: path,
        validatedPath,
        isValid: true
      });
    } catch (error) {
      const errorInfo = {
        path,
        error: error.message,
        code: error.code
      };

      if (error.code === 'SECURITY_VIOLATION') {
        results.securityViolations.push(errorInfo);
      } else {
        results.invalid.push(errorInfo);
      }
    }
  }

  return results;
}

