/**
 * Mistral Provider
 *
 * Provider implementation for Mistral AI models using the official @mistralai/mistralai SDK.
 * Implements the unified interface: async invoke(messages, options) => { content, stop_reason, rawResponse }
 */

import { debugLog, debugError } from '../utils/console.js';
import { ProviderError, ErrorCodes, StopReasons } from './interface.js';

// Define supported Mistral models with their capabilities
const SUPPORTED_MODELS = {
  'magistral-medium-2506': {
    modelName: 'magistral-medium-2506',
    friendlyName: 'Magistral Medium',
    contextWindow: 40000,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsImages: false,
    supportsTemperature: true,
    supportsWebSearch: false,
    supportsReasoning: true,
    timeout: 300000,
    description: 'Magistral Medium - Frontier-class reasoning model (June 2025)',
    aliases: ['magistral-medium', 'magistral-medium-latest', 'magistral', 'magistral medium']
  },
  'magistral-small-2506': {
    modelName: 'magistral-small-2506',
    friendlyName: 'Magistral Small',
    contextWindow: 40000,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsImages: false,
    supportsTemperature: true,
    supportsWebSearch: false,
    supportsReasoning: true,
    timeout: 180000,
    description: 'Magistral Small - Small reasoning model (June 2025)',
    aliases: ['magistral-small', 'magistral-small-latest', 'magistral small']
  },
  'mistral-medium-2505': {
    modelName: 'mistral-medium-2505',
    friendlyName: 'Mistral Medium 3',
    contextWindow: 128000,
    maxOutputTokens: 32768,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: false,
    timeout: 300000,
    description: 'Mistral Medium 3 - Frontier-class multimodal model (May 2025)',
    aliases: ['mistral-medium-3', 'mistral-medium-latest', 'mistral-medium', 'mistral medium 3', 'mistral', 'medium-3']
  }
};

/**
 * Map Mistral finish reasons to unified format
 */
const STOP_REASON_MAP = {
  'stop': StopReasons.STOP,
  'length': StopReasons.LENGTH,
  'model_length': StopReasons.LENGTH,
  'tool_calls': StopReasons.TOOL_USE,
  'error': StopReasons.ERROR
};

/**
 * Custom error class for Mistral provider errors
 */
class MistralProviderError extends ProviderError {
  constructor(message, code, originalError = null) {
    super(message, code, originalError);
    this.name = 'MistralProviderError';
  }
}

/**
 * Resolve model name to canonical form, including aliases
 */
function resolveModelName(modelName) {
  const modelNameLower = modelName.toLowerCase();

  // Check exact matches first
  for (const [supportedModel] of Object.entries(SUPPORTED_MODELS)) {
    if (supportedModel.toLowerCase() === modelNameLower) {
      return supportedModel;
    }
  }

  // Check aliases
  for (const [supportedModel, config] of Object.entries(SUPPORTED_MODELS)) {
    if (config.aliases) {
      for (const alias of config.aliases) {
        if (alias.toLowerCase() === modelNameLower) {
          return supportedModel;
        }
      }
    }
  }

  // Return as-is if not found (let Mistral API handle unknown models)
  return modelName;
}

/**
 * Validate Mistral API key format
 */
function validateApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }

  // Mistral API keys are typically 32+ character strings
  return apiKey.length >= 32;
}

/**
 * Convert messages to Mistral format
 */
function convertMessagesToMistral(messages) {
  if (!Array.isArray(messages)) {
    throw new MistralProviderError('Messages must be an array', ErrorCodes.INVALID_MESSAGES);
  }

  return messages.map((msg, index) => {
    if (!msg || typeof msg !== 'object') {
      throw new MistralProviderError(`Message at index ${index} must be an object`, ErrorCodes.INVALID_MESSAGE);
    }

    const { role, content } = msg;

    if (!role || !['system', 'user', 'assistant'].includes(role)) {
      throw new MistralProviderError(`Invalid role "${role}" at message index ${index}`, ErrorCodes.INVALID_ROLE);
    }

    if (!content) {
      throw new MistralProviderError(`Message content is required at index ${index}`, ErrorCodes.MISSING_CONTENT);
    }

    // Handle complex content structure (array with text and images)
    if (Array.isArray(content)) {
      const mistralContent = [];

      for (const item of content) {
        if (item.type === 'text') {
          mistralContent.push({
            type: 'text',
            text: item.text
          });
        } else if (item.type === 'image' && item.source) {
          // Convert Anthropic/Claude format to Mistral format
          mistralContent.push({
            type: 'image_url',
            imageUrl: `data:${item.source.media_type};base64,${item.source.data}`
          });
          debugLog(`[Mistral] Converting image: ${item.source.media_type}, data length: ${item.source.data.length}`);
        }
      }

      return { role, content: mistralContent };
    }

    // Simple string content
    return { role, content };
  });
}

// Lazy load the Mistral SDK
let MistralSDK = null;

async function getMistralSDK() {
  if (!MistralSDK) {
    try {
      const module = await import('@mistralai/mistralai');
      MistralSDK = module.Mistral || module.default;
    } catch (error) {
      throw new MistralProviderError(
        'Failed to load Mistral SDK. Please install @mistralai/mistralai',
        ErrorCodes.API_ERROR,
        error
      );
    }
  }
  return MistralSDK;
}

/**
 * Extract rate limit information from headers
 */
function extractRateLimitInfo(headers) {
  if (!headers) return null;

  const rateLimitInfo = {};

  // Mistral uses standard rate limit headers
  if (headers['x-ratelimit-limit']) {
    rateLimitInfo.limit = parseInt(headers['x-ratelimit-limit']);
  }
  if (headers['x-ratelimit-remaining']) {
    rateLimitInfo.remaining = parseInt(headers['x-ratelimit-remaining']);
  }
  if (headers['x-ratelimit-reset']) {
    rateLimitInfo.reset = new Date(parseInt(headers['x-ratelimit-reset']) * 1000);
  }

  return Object.keys(rateLimitInfo).length > 0 ? rateLimitInfo : null;
}

/**
 * Main Mistral provider implementation
 */
export const mistralProvider = {
  /**
   * Unified provider interface: invoke messages with options
   * @param {Array} messages - Array of message objects with role and content
   * @param {Object} options - Configuration options
   * @returns {Object} - { content, stop_reason, rawResponse }
   */
  async invoke(messages, options = {}) {
    const {
      model = 'magistral-medium-2506',
      temperature = 0.7,
      maxTokens = null,
      stream = false,
      // eslint-disable-next-line no-unused-vars
      reasoning_effort = 'medium', // Not supported by Mistral, ignored
      // eslint-disable-next-line no-unused-vars
      use_websearch = false, // Not supported by Mistral, ignored
      config,
      ...otherOptions
    } = options;

    // Validate API key
    if (!config?.apiKeys?.mistral) {
      throw new MistralProviderError('Mistral API key not configured', ErrorCodes.MISSING_API_KEY);
    }

    if (!validateApiKey(config.apiKeys.mistral)) {
      throw new MistralProviderError('Invalid Mistral API key format', ErrorCodes.INVALID_API_KEY);
    }

    // Get Mistral SDK
    const Mistral = await getMistralSDK();

    // Initialize Mistral client
    const mistral = new Mistral({
      apiKey: config.apiKeys.mistral,
    });

    // Resolve model name
    const resolvedModel = resolveModelName(model);
    const modelConfig = SUPPORTED_MODELS[resolvedModel] || {};

    // Convert and validate messages first
    const mistralMessages = convertMessagesToMistral(messages);

    // Check if messages contain images and if model supports them
    const hasImages = messages.some(msg =>
      Array.isArray(msg.content) &&
      msg.content.some(item => item.type === 'image')
    );

    if (hasImages && !modelConfig.supportsImages) {
      throw new MistralProviderError(
        `Model ${resolvedModel} does not support images`,
        ErrorCodes.INVALID_REQUEST
      );
    }

    // Build request payload
    const requestPayload = {
      model: resolvedModel,
      messages: mistralMessages,
      stream,
      ...otherOptions
    };

    // Add temperature if specified
    if (temperature !== undefined) {
      requestPayload.temperature = Math.max(0, Math.min(1, temperature));
    }

    // Add max tokens if specified
    if (maxTokens) {
      requestPayload.max_tokens = Math.min(maxTokens, modelConfig.maxOutputTokens || 32768);
    }

    // Note: Mistral doesn't currently support streaming in their SDK
    // We acknowledge the stream parameter but don't use it
    if (stream) {
      debugLog('[Mistral] Streaming requested but not currently supported by SDK');
    }

    try {
      debugLog(`[Mistral] Calling ${resolvedModel} with ${mistralMessages.length} messages`);

      const startTime = Date.now();

      // Make the API call
      const response = await mistral.chat.complete(requestPayload);

      const responseTime = Date.now() - startTime;
      debugLog(`[Mistral] Response received in ${responseTime}ms`);

      // Extract response data
      const choice = response.choices?.[0];
      if (!choice) {
        throw new MistralProviderError('No response choice received from Mistral', ErrorCodes.NO_RESPONSE_CHOICE);
      }

      const content = choice.message?.content;
      if (!content) {
        throw new MistralProviderError('No content in response from Mistral', ErrorCodes.NO_RESPONSE_CONTENT);
      }

      // Map finish reason
      const finishReason = choice.finish_reason || 'stop';
      const stopReason = STOP_REASON_MAP[finishReason] || StopReasons.OTHER;

      // Extract usage information
      const usage = response.usage || {};

      // Extract rate limit info if available
      const rateLimitInfo = extractRateLimitInfo(response.headers);

      // Return unified response format
      return {
        content,
        stop_reason: stopReason,
        rawResponse: response,
        metadata: {
          model: response.model || resolvedModel,
          usage: {
            input_tokens: usage.prompt_tokens || 0,
            output_tokens: usage.completion_tokens || 0,
            total_tokens: usage.total_tokens || 0
          },
          response_time_ms: responseTime,
          finish_reason: finishReason,
          provider: 'mistral',
          rate_limit: rateLimitInfo
        }
      };

    } catch (error) {
      debugError('[Mistral] Error during API call:', error);

      // Re-throw our own errors
      if (error instanceof MistralProviderError) {
        throw error;
      }

      // Handle specific Mistral errors
      if (error.status === 401 || error.message?.includes('Unauthorized')) {
        throw new MistralProviderError('Invalid Mistral API key', ErrorCodes.INVALID_API_KEY, error);
      } else if (error.status === 429 || error.message?.includes('rate limit')) {
        throw new MistralProviderError('Mistral rate limit exceeded', ErrorCodes.RATE_LIMIT_EXCEEDED, error);
      } else if (error.status === 403 || error.message?.includes('quota')) {
        throw new MistralProviderError('Mistral API quota exceeded', ErrorCodes.QUOTA_EXCEEDED, error);
      } else if (error.status === 404 || error.message?.includes('model')) {
        throw new MistralProviderError(`Model ${resolvedModel} not found`, ErrorCodes.MODEL_NOT_FOUND, error);
      } else if (error.status === 400 || error.message?.includes('Invalid request')) {
        throw new MistralProviderError(`Invalid request: ${error.message}`, ErrorCodes.INVALID_REQUEST, error);
      } else if (error.message?.includes('Context length exceeded') || error.message?.includes('context')) {
        throw new MistralProviderError('Context length exceeded for model', ErrorCodes.CONTEXT_LENGTH_EXCEEDED, error);
      }

      // Generic error handling
      throw new MistralProviderError(
        `Mistral API error: ${error.message || 'Unknown error'}`,
        ErrorCodes.API_ERROR,
        error
      );
    }
  },

  /**
   * Validate configuration for Mistral provider
   * @param {Object} config - Configuration object
   * @returns {boolean} - True if configuration is valid
   */
  validateConfig(config) {
    return !!(config?.apiKeys?.mistral && validateApiKey(config.apiKeys.mistral));
  },

  /**
   * Check if provider is available with current configuration
   * @param {Object} config - Configuration object
   * @returns {boolean} - True if provider is available
   */
  isAvailable(config) {
    return this.validateConfig(config);
  },

  /**
   * Get supported models
   * @returns {Object} - Map of supported models and their configurations
   */
  getSupportedModels() {
    return SUPPORTED_MODELS;
  },

  /**
   * Get model configuration
   * @param {string} modelName - Model name
   * @returns {Object|null} - Model configuration or null if not found
   */
  getModelConfig(modelName) {
    const resolved = resolveModelName(modelName);
    return SUPPORTED_MODELS[resolved] || null;
  }
};

