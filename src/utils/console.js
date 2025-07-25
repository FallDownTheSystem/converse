/**
 * Safe Console Utility
 * 
 * Provides console functions that respect MCP transport mode and logging settings.
 * Prevents console output from corrupting stdio transport JSON-RPC streams.
 */

/**
 * Check if console output should be suppressed
 * @returns {boolean} True if console output should be suppressed
 */
function shouldSuppressConsole() {
  return (
    process.env.LOG_LEVEL === 'silent' ||
    process.env.NODE_ENV === 'test' ||
    process.env.MCP_TRANSPORT === 'stdio'
  );
}

/**
 * Safe console.log that respects transport mode
 * @param {...any} args - Arguments to log
 */
export function debugLog(...args) {
  if (!shouldSuppressConsole()) {
    console.log(...args);
  }
}

/**
 * Safe console.error that respects transport mode
 * @param {...any} args - Arguments to log
 */
export function debugError(...args) {
  if (!shouldSuppressConsole()) {
    console.error(...args);
  }
}

/**
 * Safe console.warn that respects transport mode
 * @param {...any} args - Arguments to log
 */
export function debugWarn(...args) {
  if (!shouldSuppressConsole()) {
    console.warn(...args);
  }
}

/**
 * Force console output (for critical errors only)
 * @param {...any} args - Arguments to log
 */
export function forceLog(...args) {
  console.log(...args);
}

/**
 * Force console error output (for critical errors only)
 * @param {...any} args - Arguments to log
 */
export function forceError(...args) {
  console.error(...args);
}