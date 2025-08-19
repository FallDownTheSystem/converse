/**
 * File Validator Utility
 *
 * Validates that file paths exist before processing them.
 * Returns early with clear error messages if any files are not found.
 */

import { access, constants } from 'fs/promises';
import { resolve, isAbsolute } from 'path';
import { createToolError } from '../tools/index.js';

/**
 * Validate that all provided file paths exist
 * @param {string[]} filePaths - Array of file paths to validate
 * @param {string} fileType - Type of files being validated (e.g., 'file', 'image')
 * @param {object} options - Validation options including clientCwd
 * @returns {Promise<{valid: boolean, missingPaths: string[], error?: object}>}
 */
export async function validateFilePaths(filePaths, fileType = 'file', options = {}) {
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    return { valid: true, missingPaths: [] };
  }

  const missingPaths = [];

  for (const filePath of filePaths) {
    if (!filePath || typeof filePath !== 'string') {
      missingPaths.push(`Invalid path: ${filePath}`);
      continue;
    }

    // Skip validation for base64 data URLs
    if (filePath.startsWith('data:')) {
      continue;
    }

    // Convert to absolute path if needed
    // Use clientCwd if provided (for auto-detected client working directory), otherwise fall back to process.cwd()
    const absolutePath = isAbsolute(filePath)
      ? filePath
      : resolve(options.clientCwd || process.cwd(), filePath);

    try {
      // Check if file exists and is readable
      await access(absolutePath, constants.R_OK);
    } catch (error) {
      // Keep the original path in the error message for clarity
      missingPaths.push(filePath);
    }
  }

  if (missingPaths.length > 0) {
    const errorMessage = `The following ${fileType}${missingPaths.length > 1 ? 's' : ''} could not be found: ${missingPaths.join(', ')}`;
    return {
      valid: false,
      missingPaths,
      error: createToolError(errorMessage)
    };
  }

  return { valid: true, missingPaths: [] };
}

/**
 * Validate both files and images together
 * @param {object} paths - Object containing files and images arrays
 * @param {object} options - Validation options including clientCwd
 * @returns {Promise<{valid: boolean, errors: string[], errorResponse?: object}>}
 */
export async function validateAllPaths({ files = [], images = [] }, options = {}) {
  const errors = [];

  // Validate regular files
  if (files.length > 0) {
    const fileValidation = await validateFilePaths(files, 'file', options);
    if (!fileValidation.valid) {
      errors.push(`Files not found: ${fileValidation.missingPaths.join(', ')}`);
    }
  }

  // Validate image files
  if (images.length > 0) {
    const imageValidation = await validateFilePaths(images, 'image', options);
    if (!imageValidation.valid) {
      errors.push(`Images not found: ${imageValidation.missingPaths.join(', ')}`);
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      errorResponse: createToolError(errors.join('. '))
    };
  }

  return { valid: true, errors: [] };
}
