/**
 * Cross-platform path utilities
 * Handles platform-specific path operations to ensure compatibility across Windows, Linux, and macOS
 */

import { platform, tmpdir } from 'os';
import { fileURLToPath, pathToFileURL } from 'url';
import { resolve, join, normalize } from 'path';

/**
 * Get a platform-appropriate temporary directory path
 * @returns {string} Temporary directory path
 */
export function getTempDir() {
  return tmpdir();
}

/**
 * Get a platform-appropriate test file path
 * @param {string} filename - The filename to create in temp directory
 * @returns {string} Full path to test file in temp directory
 */
export function getTestTempPath(filename) {
  return join(getTempDir(), filename);
}

/**
 * Get a platform-specific absolute path for testing
 * @param {string} relativePath - Relative path components
 * @returns {string} Platform-appropriate absolute path
 */
export function getTestAbsolutePath(...relativePath) {
  if (platform() === 'win32') {
    return join('C:\\', 'TestFiles', ...relativePath);
  }
  return join('/tmp', 'testfiles', ...relativePath);
}

/**
 * Normalize a path for consistent comparison across platforms
 * Handles both file URLs and regular paths
 * @param {string} inputPath - Path or file URL to normalize
 * @returns {string} Normalized path
 */
export function normalizePath(inputPath) {
  if (!inputPath) return inputPath;

  // Handle file:// URLs
  if (inputPath.startsWith('file://')) {
    return normalize(fileURLToPath(inputPath));
  }

  // For regular paths, just normalize
  return normalize(inputPath);
}

/**
 * Compare two paths for equality, handling platform differences
 * @param {string} path1 - First path
 * @param {string} path2 - Second path
 * @returns {boolean} True if paths are equivalent
 */
export function pathsEqual(path1, path2) {
  if (!path1 || !path2) return path1 === path2;

  const normalized1 = normalizePath(path1);
  const normalized2 = normalizePath(path2);

  // On Windows, do case-insensitive comparison
  if (platform() === 'win32') {
    return normalized1.toLowerCase() === normalized2.toLowerCase();
  }

  return normalized1 === normalized2;
}

/**
 * Convert a path to a file URL string, handling platform differences
 * @param {string} inputPath - Path to convert
 * @returns {string} File URL string
 */
export function toFileURL(inputPath) {
  return pathToFileURL(resolve(inputPath)).href;
}

/**
 * Count lines in text content, handling different line ending styles
 * @param {string} content - Text content
 * @returns {number} Number of lines
 */
export function countLines(content) {
  if (!content) return 0;
  // Handle both CRLF (Windows) and LF (Unix/Mac) line endings
  return content.split(/\r?\n/).length;
}

/**
 * Get platform-specific command for spawning Node.js processes
 * @returns {string} Node executable command
 */
export function getNodeCommand() {
  // Use process.execPath for the most reliable Node.js executable path
  return process.execPath;
}

/**
 * Get spawn options that work across platforms
 * @param {object} additionalOptions - Additional spawn options
 * @returns {object} Spawn options with platform compatibility
 */
export function getSpawnOptions(additionalOptions = {}) {
  const options = {
    ...additionalOptions,
    // Ensure proper path resolution on Windows
    windowsVerbatimArguments: false
  };

  // On Windows, we might need shell for certain operations
  if (platform() === 'win32' && !options.hasOwnProperty('shell')) {
    // Only use shell if explicitly needed, as it has security implications
    options.shell = false;
  }

  return options;
}

/**
 * Execute a timeout with platform-specific commands
 * @param {number} seconds - Timeout duration in seconds
 * @param {string} command - Command to run after timeout
 * @returns {string} Platform-specific timeout command
 */
export function getTimeoutCommand(seconds, command) {
  if (platform() === 'win32') {
    // Windows uses timeout /t for delays
    return `timeout /t ${seconds} >nul 2>&1 & ${command}`;
  }
  // Unix-like systems use sleep
  return `sleep ${seconds} && ${command}`;
}

/**
 * Get cross-platform environment variable setting prefix
 * @param {object} envVars - Environment variables to set
 * @returns {string} Command prefix for setting environment variables
 */
export function getEnvPrefix(envVars) {
  if (!envVars || Object.keys(envVars).length === 0) return '';

  const pairs = Object.entries(envVars)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');

  if (platform() === 'win32') {
    // For Windows, we need to use 'set' command in shell
    // This is why cross-env is often preferred
    return `set ${pairs} &&`;
  }

  // Unix-like systems can use direct assignment
  return pairs;
}

/**
 * Check if running on Windows
 * @returns {boolean} True if Windows
 */
export function isWindows() {
  return platform() === 'win32';
}

/**
 * Check if running on macOS
 * @returns {boolean} True if macOS
 */
export function isMacOS() {
  return platform() === 'darwin';
}

/**
 * Check if running on Linux
 * @returns {boolean} True if Linux
 */
export function isLinux() {
  return platform() === 'linux';
}

/**
 * Get platform name for display
 * @returns {string} Human-readable platform name
 */
export function getPlatformName() {
  const platformMap = {
    win32: 'Windows',
    darwin: 'macOS',
    linux: 'Linux'
  };
  return platformMap[platform()] || platform();
}
