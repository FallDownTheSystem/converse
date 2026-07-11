/**
 * Provider Interface Contract
 *
 * This module defines the unified interface that all AI providers must implement.
 * Following decision-1 (functional architecture), all providers export an object
 * with pure functions rather than using classes.
 */

/**
 * Message format for provider input
 * @typedef {Object} Message
 * @property {'system'|'user'|'assistant'} role - The role of the message sender
 * @property {string|Array<ContentItem>} content - Text content or array of content items
 */

/**
 * Content item for multimodal messages
 * @typedef {Object} ContentItem
 * @property {'text'|'image'} type - The type of content
 * @property {string} [text] - Text content (when type is 'text')
 * @property {ImageSource} [source] - Image source (when type is 'image')
 */

/**
 * Image source format (Anthropic/Claude format)
 * @typedef {Object} ImageSource
 * @property {string} media_type - MIME type (e.g., 'image/jpeg', 'image/png')
 * @property {string} data - Base64-encoded image data
 */

/**
 * Options for provider invocation
 * @typedef {Object} InvokeOptions
 * @property {string} [model] - Model identifier (provider-specific)
 * @property {number} [maxTokens] - Maximum tokens to generate
 * @property {boolean} [stream] - Whether to stream the response
 * @property {string} [reasoning_effort] - Reasoning depth for thinking models
 * @property {AbortSignal} [signal] - AbortSignal for cancelling requests
 * @property {Object} config - Provider configuration
 * @property {Object} config.apiKeys - API keys for providers
 * @property {Object} [config.providers] - Provider-specific settings
 */

/**
 * Unified response format
 * @typedef {Object} ProviderResponse
 * @property {string} content - The generated text content
 * @property {string} stop_reason - Reason for stopping (e.g., 'stop', 'length', 'tool_use')
 * @property {Object} rawResponse - Original response from the provider API
 * @property {Object} [metadata] - Additional response metadata
 * @property {string} metadata.model - Actual model used
 * @property {Object} metadata.usage - Token usage information
 * @property {number} metadata.usage.input_tokens - Input token count
 * @property {number} metadata.usage.output_tokens - Output token count
 * @property {number} metadata.usage.total_tokens - Total token count
 * @property {number} metadata.response_time_ms - Response time in milliseconds
 * @property {string} metadata.finish_reason - Provider-specific finish reason
 * @property {string} metadata.provider - Provider name
 */

/**
 * Model configuration
 * @typedef {Object} ModelConfig
 * @property {string} modelName - Official model identifier
 * @property {string} friendlyName - Human-readable name
 * @property {number} contextWindow - Maximum context length in tokens
 * @property {number} maxOutputTokens - Maximum output tokens
 * @property {boolean} supportsStreaming - Whether streaming is supported
 * @property {boolean} supportsImages - Whether images are supported
 * @property {boolean} [supportsWebSearch] - Whether web search is supported
 * @property {boolean} [supportsThinking] - Whether thinking/reasoning is supported
 * @property {number} [maxThinkingTokens] - Maximum thinking tokens
 * @property {number} timeout - Request timeout in milliseconds
 * @property {string} description - Model description
 * @property {string[]} [aliases] - Alternative names for the model
 */

/**
 * Provider interface that all providers must implement
 * @interface Provider
 */
export const ProviderInterface = {
  /**
   * Invoke the provider with messages and options
   * @async
   * @param {Message[]} messages - Array of messages
   * @param {InvokeOptions} options - Invocation options
   * @returns {Promise<ProviderResponse>} - Provider response
   * @throws {Error} - Provider-specific errors should extend Error
   */
  async invoke(messages, _options = {}) {
    throw new Error('Provider must implement invoke method');
  },

  /**
   * Validate provider configuration
   * @param {Object} config - Configuration object
   * @returns {boolean} - True if configuration is valid
   */
  validateConfig(_config) {
    throw new Error('Provider must implement validateConfig method');
  },

  /**
   * Check if provider is available with current configuration
   * @param {Object} config - Configuration object
   * @returns {boolean} - True if provider is available
   */
  isAvailable(_config) {
    throw new Error('Provider must implement isAvailable method');
  },

  /**
   * Get supported models
   * @returns {Object<string, ModelConfig>} - Map of model names to configurations
   */
  getSupportedModels() {
    throw new Error('Provider must implement getSupportedModels method');
  },

  /**
   * Get model configuration
   * @param {string} modelName - Model name or alias
   * @returns {ModelConfig|null} - Model configuration or null if not found
   */
  getModelConfig(_modelName) {
    throw new Error('Provider must implement getModelConfig method');
  },
};

/**
 * Base error class for provider errors
 * All provider-specific errors should extend this class
 */
export class ProviderError extends Error {
  /**
   * @param {string} message - Error message
   * @param {string} code - Error code (e.g., 'QUOTA_EXCEEDED', 'INVALID_API_KEY')
   * @param {Error} [originalError] - Original error from the provider API
   */
  constructor(message, code, originalError = null) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.originalError = originalError;
  }
}

/**
 * Common error codes that providers should use when applicable
 */
export const ErrorCodes = {
  // Configuration errors
  MISSING_API_KEY: 'MISSING_API_KEY',
  INVALID_API_KEY: 'INVALID_API_KEY',

  // Request errors
  INVALID_MESSAGES: 'INVALID_MESSAGES',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  INVALID_ROLE: 'INVALID_ROLE',
  MISSING_CONTENT: 'MISSING_CONTENT',
  INVALID_REQUEST: 'INVALID_REQUEST',

  // Model errors
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
  CONTEXT_LENGTH_EXCEEDED: 'CONTEXT_LENGTH_EXCEEDED',

  // Response errors
  NO_RESPONSE_CONTENT: 'NO_RESPONSE_CONTENT',
  NO_RESPONSE_CHOICE: 'NO_RESPONSE_CHOICE',

  // Rate limiting and quota
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',

  // Other errors
  API_ERROR: 'API_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
};

/**
 * Validate that a provider implementation conforms to the interface
 * @param {Object} provider - Provider implementation to validate
 * @returns {boolean} - True if provider is valid
 * @throws {Error} - If provider is invalid
 */
export function validateProvider(provider) {
  const requiredMethods = [
    'invoke',
    'validateConfig',
    'isAvailable',
    'getSupportedModels',
    'getModelConfig',
  ];

  for (const method of requiredMethods) {
    if (typeof provider[method] !== 'function') {
      throw new Error(`Provider missing required method: ${method}`);
    }
  }

  return true;
}

/**
 * Common stop reasons that providers should map to
 */
export const StopReasons = {
  STOP: 'stop', // Normal completion
  LENGTH: 'length', // Max tokens reached
  TOOL_USE: 'tool_use', // Tool use requested
  CONTENT_FILTER: 'content_filter', // Content filtered
  SAFETY: 'safety', // Safety filter triggered
  ERROR: 'error', // Error occurred
  OTHER: 'other', // Other reason
};
