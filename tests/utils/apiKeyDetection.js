/**
 * Shared utility for API key detection and conditional test execution
 * Provides consistent skip logic with descriptive messages
 */

/**
 * Check if an API key is valid (not just present but properly formatted)
 * @param {string} keyName - Name of the environment variable (e.g., 'OPENAI_API_KEY')
 * @param {string} prefix - Expected prefix for the key (e.g., 'sk-' for OpenAI)
 * @param {number} minLength - Minimum expected length of the key
 * @returns {boolean} - Whether the API key is valid
 */
function isValidApiKey(keyName, prefix, minLength = 20) {
  const key = process.env[keyName];
  if (!key) return false;

  if (prefix) {
    return key.startsWith(prefix) && key.length >= minLength;
  }

  return key.length >= minLength;
}

/**
 * API key configurations for different providers
 */
const API_KEY_CONFIGS = {
  OPENAI: {
    envVar: 'OPENAI_API_KEY',
    prefix: 'sk-',
    minLength: 20,
    providerName: 'OpenAI'
  },
  XAI: {
    envVar: 'XAI_API_KEY',
    prefix: 'xai-',
    minLength: 20,
    providerName: 'XAI'
  },
  GOOGLE: {
    envVar: 'GOOGLE_API_KEY',
    alternateEnvVar: 'GEMINI_API_KEY',  // Also check GEMINI_API_KEY
    prefix: null,
    minLength: 20,
    providerName: 'Google'
  },
  ANTHROPIC: {
    envVar: 'ANTHROPIC_API_KEY',
    prefix: 'sk-ant-',
    minLength: 20,
    providerName: 'Anthropic'
  },
  MISTRAL: {
    envVar: 'MISTRAL_API_KEY',
    prefix: null,
    minLength: 20,
    providerName: 'Mistral'
  },
  DEEPSEEK: {
    envVar: 'DEEPSEEK_API_KEY',
    prefix: null,
    minLength: 20,
    providerName: 'DeepSeek'
  },
  OPENROUTER: {
    envVar: 'OPENROUTER_API_KEY',
    prefix: 'sk-or-',
    minLength: 20,
    providerName: 'OpenRouter'
  },
  CODEX: {
    envVar: null, // Codex uses cached authentication from user's machine
    prefix: null,
    minLength: 0,
    providerName: 'Codex',
    customCheck: () => {
      // Check if Codex SDK is available
      try {
        // Simple check - try to resolve the module path
        const fs = require('fs');
        const path = require('path');
        const pkgPath = path.resolve('node_modules/@openai/codex-sdk/package.json');
        return fs.existsSync(pkgPath);
      } catch {
        return false;
      }
    }
  }
};

/**
 * Check if a specific provider's API key is available
 * @param {string} provider - Provider name (OPENAI, XAI, GOOGLE, etc.)
 * @returns {boolean} - Whether the provider's API key is valid
 */
function hasApiKey(provider) {
  const config = API_KEY_CONFIGS[provider];
  if (!config) {
    // Instead of throwing an error, return false for unknown providers
    // This makes testing more robust and prevents crashes
    console.warn(`Warning: Unknown provider '${provider}' - treating as unavailable`);
    return false;
  }

  // Check if provider has custom check logic (e.g., Codex SDK availability)
  if (config.customCheck) {
    return config.customCheck();
  }

  // Check primary key first
  const hasPrimaryKey = isValidApiKey(config.envVar, config.prefix, config.minLength);

  // If primary key not found and alternate key is defined, check it
  if (!hasPrimaryKey && config.alternateEnvVar) {
    return isValidApiKey(config.alternateEnvVar, config.prefix, config.minLength);
  }

  return hasPrimaryKey;
}

/**
 * Check if any of the specified providers have valid API keys
 * @param {string[]} providers - Array of provider names
 * @returns {boolean} - Whether any provider has a valid API key
 */
function hasAnyApiKey(providers = ['OPENAI', 'XAI', 'GOOGLE']) {
  return providers.some(provider => hasApiKey(provider));
}

/**
 * Check if all of the specified providers have valid API keys
 * @param {string[]} providers - Array of provider names
 * @returns {boolean} - Whether all providers have valid API keys
 */
function hasAllApiKeys(providers) {
  return providers.every(provider => hasApiKey(provider));
}

/**
 * Get a descriptive message for why a test is being skipped
 * @param {string[]} requiredProviders - Array of required provider names
 * @param {boolean} requireAll - Whether all providers are required (true) or just one (false)
 * @returns {string} - Descriptive skip message
 */
function getSkipMessage(requiredProviders, requireAll = false) {
  const missingProviders = requiredProviders.filter(provider => !hasApiKey(provider));

  if (missingProviders.length === 0) {
    return ''; // No skip needed
  }

  // Handle both known and unknown providers gracefully
  const providerNames = missingProviders.map(p => {
    const config = API_KEY_CONFIGS[p];
    return config ? config.providerName : p; // Use provider name if unknown
  });
  const envVars = missingProviders.map(p => {
    const config = API_KEY_CONFIGS[p];
    return config ? config.envVar : `${p}_API_KEY`; // Guess env var name if unknown
  });

  if (requireAll) {
    return `Skipping test: Missing API keys for ${providerNames.join(', ')}. Set ${envVars.join(', ')} to run this test.`;
  } else {
    if (missingProviders.length === requiredProviders.length) {
      return `Skipping test: No API keys found. Set at least one of: ${envVars.join(', ')} to run this test.`;
    }
    return `Skipping test: Some API keys missing (${providerNames.join(', ')}). Test will run with available providers.`;
  }
}

/**
 * Enhanced test.skipIf with descriptive messages
 * @param {Function} testFn - The test function (it)
 * @param {boolean} condition - Whether to skip
 * @param {string} message - Custom skip message
 * @returns {Function} - Test function or skip function
 */
function skipIfWithMessage(testFn, condition, message) {
  if (condition && message) {
    // Log the skip message for visibility
    console.log(`\x1b[33m${message}\x1b[0m`); // Yellow color for skip messages
  }
  return condition ? testFn.skip : testFn;
}

/**
 * Create a test runner that skips if required API keys are missing
 * This is designed to be used with Vitest's it function
 * @param {Object} options - Configuration options
 * @param {string[]} options.requiredProviders - Array of required provider names
 * @param {boolean} options.requireAll - Whether all providers are required (default: false)
 * @returns {Function} - Test function that handles skipping
 */
function testWithApiKeys({ requiredProviders, requireAll = false }) {
  const shouldSkip = requireAll
    ? !hasAllApiKeys(requiredProviders)
    : !hasAnyApiKey(requiredProviders);

  const skipMessage = getSkipMessage(requiredProviders, requireAll);

  // Return a function that will be called with the test description and function
  return function(description, testFn, timeout) {
    // Import it from vitest dynamically
    const { it } = require('vitest');

    if (shouldSkip) {
      // Log the skip message
      if (skipMessage) {
        console.log(`\x1b[33m${skipMessage}\x1b[0m`);
      }
      return it.skip(description, testFn, timeout);
    } else {
      return it(description, testFn, timeout);
    }
  };
}

// Export convenience functions for common cases
const hasOpenAI = hasApiKey('OPENAI');
const hasXAI = hasApiKey('XAI');
const hasGoogle = hasApiKey('GOOGLE');
const hasAnthropic = hasApiKey('ANTHROPIC');
const hasMistral = hasApiKey('MISTRAL');
const hasDeepSeek = hasApiKey('DEEPSEEK');
const hasOpenRouter = hasApiKey('OPENROUTER');
const hasCodex = hasApiKey('CODEX');

// Common combinations
const hasAnyMainProvider = hasAnyApiKey(['OPENAI', 'XAI', 'GOOGLE']);
const hasAllMainProviders = hasAllApiKeys(['OPENAI', 'XAI', 'GOOGLE']);

module.exports = {
  // Core functions
  hasApiKey,
  hasAnyApiKey,
  hasAllApiKeys,
  getSkipMessage,
  skipIfWithMessage,
  testWithApiKeys,

  // Individual provider checks
  hasOpenAI,
  hasXAI,
  hasGoogle,
  hasAnthropic,
  hasMistral,
  hasDeepSeek,
  hasOpenRouter,
  hasCodex,

  // Common combinations
  hasAnyMainProvider,
  hasAllMainProviders,

  // Constants
  API_KEY_CONFIGS
};
