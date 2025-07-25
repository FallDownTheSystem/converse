/**
 * Provider Registry
 *
 * Central registry for all AI providers following functional architecture.
 * Each provider implements: async invoke(messages, options) => { content, stop_reason, rawResponse }
 */

// Import individual providers (will be implemented in subsequent tasks)
import { openaiProvider } from './openai.js';
import { xaiProvider } from './xai.js';
import { googleProvider } from './google.js';

/**
 * Provider registry map
 * Each provider must implement the unified interface:
 * - invoke(messages, options): Main invocation method
 * - validateConfig(config): Configuration validation
 * - isAvailable(config): Availability check
 */
const providers = {
  // Will be populated by individual provider modules
  openai: openaiProvider,
  xai: xaiProvider,
  google: googleProvider,
};

/**
 * Get all available providers
 * @returns {object} Map of provider name to provider implementation
 */
export function getProviders() {
  return providers;
}

/**
 * Get a specific provider by name
 * @param {string} name - Provider name
 * @returns {object|null} Provider implementation or null if not found
 */
export function getProvider(name) {
  return providers[name] || null;
}

/**
 * Register a new provider
 * @param {string} name - Provider name
 * @param {object} provider - Provider implementation
 */
export function registerProvider(name, provider) {
  // Validate provider interface
  if (!provider.invoke || typeof provider.invoke !== 'function') {
    throw new Error(`Provider ${name} must implement invoke() method`);
  }

  providers[name] = provider;
}

/**
 * Get list of available provider names
 * @param {object} config - Configuration object
 * @returns {string[]} Array of available provider names
 */
export function getAvailableProviders(config) {
  return Object.keys(providers).filter(name => {
    const provider = providers[name];
    return provider.isAvailable && provider.isAvailable(config);
  });
}

/**
 * Unified provider interface validation
 * @param {object} provider - Provider to validate
 * @returns {boolean} True if provider implements required interface
 */
export function validateProviderInterface(provider) {
  const requiredMethods = ['invoke'];
  // const optionalMethods = ['validateConfig', 'isAvailable'];

  // Check required methods
  for (const method of requiredMethods) {
    if (!provider[method] || typeof provider[method] !== 'function') {
      return false;
    }
  }

  return true;
}
