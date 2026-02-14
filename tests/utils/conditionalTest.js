/**
 * Enhanced conditional test execution with descriptive skip messages
 * Provides a wrapper around Vitest's it.skipIf with better messaging
 */

import { it } from 'vitest';
import {
  hasApiKey,
  hasAnyApiKey,
  hasAllApiKeys,
  getSkipMessage,
  API_KEY_CONFIGS,
} from './apiKeyDetection.js';

/**
 * Create a conditional test that skips with a descriptive message
 * @param {Object} options - Configuration options
 * @param {string[]} options.requiredProviders - Array of required provider names
 * @param {boolean} options.requireAll - Whether all providers are required (default: false)
 * @returns {Function} - Test function that handles skipping with messages
 */
export function testWithApiKeys({ requiredProviders, requireAll = false }) {
  const shouldSkip = requireAll
    ? !hasAllApiKeys(requiredProviders)
    : !hasAnyApiKey(requiredProviders);

  const skipMessage = getSkipMessage(requiredProviders, requireAll);

  // Return the appropriate test function
  return function (description, testFn, timeout) {
    if (shouldSkip) {
      // Log skip message with color for better visibility
      if (skipMessage) {
        console.log(`\x1b[33m[SKIP] ${skipMessage}\x1b[0m`);
      }

      // Add the skip message to the test description for clarity
      const enhancedDescription = skipMessage
        ? `${description} [SKIPPED: ${skipMessage.replace('Skipping test: ', '')}]`
        : description;

      // Use it.skip with enhanced description
      return it.skip(enhancedDescription, testFn, timeout);
    } else {
      // Run the test normally
      return it(description, testFn, timeout);
    }
  };
}

// Re-export all the detection functions for convenience
export {
  hasApiKey,
  hasAnyApiKey,
  hasAllApiKeys,
  getSkipMessage,
  API_KEY_CONFIGS,
};

// Export individual provider checks
export const hasOpenAI = hasApiKey('OPENAI');
export const hasXAI = hasApiKey('XAI');
export const hasGoogle = hasApiKey('GOOGLE');
export const hasAnthropic = hasApiKey('ANTHROPIC');
export const hasMistral = hasApiKey('MISTRAL');
export const hasDeepSeek = hasApiKey('DEEPSEEK');
export const hasOpenRouter = hasApiKey('OPENROUTER');
export const hasCodex = hasApiKey('CODEX');
export const hasGeminiCli = hasApiKey('GEMINI_CLI');
export const hasCopilot = hasApiKey('COPILOT');

// Common combinations
export const hasAnyMainProvider = hasAnyApiKey(['OPENAI', 'XAI', 'GOOGLE']);
export const hasAllMainProviders = hasAllApiKeys(['OPENAI', 'XAI', 'GOOGLE']);
