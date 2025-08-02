/**
 * XAI (Grok) Provider
 *
 * Provider implementation for XAI Grok models using OpenAI-compatible API with custom baseURL.
 * Implements the unified interface: async invoke(messages, options) => { content, stop_reason, rawResponse }
 */

import OpenAI from 'openai';
import { debugLog, debugError } from '../utils/console.js';

// Define supported Grok models with their capabilities
const SUPPORTED_MODELS = {
  'grok-4-0709': {
    modelName: 'grok-4-0709',
    friendlyName: 'X.AI (Grok 4)',
    contextWindow: 256000,
    maxOutputTokens: 256000,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: true,
    timeout: 300000, // 5 minutes
    description: 'GROK-4 (256K context) - Latest advanced model from X.AI with image support and live search',
    aliases: ['grok', 'grok4', 'grok-4', 'grok-4-latest', 'grok 4', 'grok 4 latest']
  },
  'grok-3': {
    modelName: 'grok-3',
    friendlyName: 'X.AI (Grok 3)',
    contextWindow: 131072,
    maxOutputTokens: 131072,
    supportsStreaming: true,
    supportsImages: false,
    supportsTemperature: true,
    supportsWebSearch: false,
    timeout: 300000,
    description: 'GROK-3 (131K context) - Previous generation reasoning model from X.AI',
    aliases: ['grok3', 'grok 3']
  },
  'grok-3-fast': {
    modelName: 'grok-3-fast',
    friendlyName: 'X.AI (Grok 3 Fast)',
    contextWindow: 131072,
    maxOutputTokens: 131072,
    supportsStreaming: true,
    supportsImages: false,
    supportsTemperature: true,
    supportsWebSearch: false,
    timeout: 300000,
    description: 'GROK-3 Fast (131K context) - Higher performance variant, faster processing but more expensive',
    aliases: ['grok3fast', 'grok3-fast', 'grok 3 fast']
  }
};

/**
 * Custom error class for XAI provider errors
 */
class XAIProviderError extends Error {
  constructor(message, code, originalError = null) {
    super(message);
    this.name = 'XAIProviderError';
    this.code = code;
    this.originalError = originalError;
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

  // Return as-is if not found (let XAI API handle unknown models)
  return modelName;
}

/**
 * Validate XAI API key format
 */
function validateApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }

  // XAI API keys typically start with 'xai-' and are at least 20 characters
  return apiKey.startsWith('xai-') && apiKey.length >= 20;
}

/**
 * Convert messages to XAI/OpenAI format
 */
function convertMessages(messages) {
  if (!Array.isArray(messages)) {
    throw new XAIProviderError('Messages must be an array', 'INVALID_MESSAGES');
  }

  return messages.map((msg, index) => {
    if (!msg || typeof msg !== 'object') {
      throw new XAIProviderError(`Message at index ${index} must be an object`, 'INVALID_MESSAGE');
    }

    const { role, content } = msg;

    if (!role || !['system', 'user', 'assistant'].includes(role)) {
      throw new XAIProviderError(`Invalid role "${role}" at message index ${index}`, 'INVALID_ROLE');
    }

    if (!content) {
      throw new XAIProviderError(`Message content is required at index ${index}`, 'MISSING_CONTENT');
    }

    // Handle complex content structure (array with text and images)
    if (Array.isArray(content)) {
      const convertedContent = [];

      for (const item of content) {
        if (item.type === 'text') {
          convertedContent.push({
            type: 'text',
            text: item.text
          });
        } else if (item.type === 'image' && item.source) {
          // Convert Anthropic/Claude format to OpenAI format for XAI
          convertedContent.push({
            type: 'image_url',
            image_url: {
              url: `data:${item.source.media_type};base64,${item.source.data}`,
              detail: 'high'
            }
          });
          debugLog(`[XAI] Converting image: ${item.source.media_type}, data length: ${item.source.data.length}`);
        }
      }

      return { role, content: convertedContent };
    }

    // Simple string content
    return { role, content };
  });
}

/**
 * Main XAI provider implementation
 */
export const xaiProvider = {
  /**
   * Unified provider interface: invoke messages with options
   * @param {Array} messages - Array of message objects with role and content
   * @param {Object} options - Configuration options
   * @returns {Object} - { content, stop_reason, rawResponse }
   */
  async invoke(messages, options = {}) {
    const {
      model = 'grok-4-0709',
      temperature = 0.7,
      maxTokens = null,
      stream = false,
      reasoning_effort = 'medium',
      use_websearch = false,
      config,
      ...otherOptions
    } = options;

    // Validate API key
    if (!config?.apiKeys?.xai) {
      throw new XAIProviderError('XAI API key not configured', 'MISSING_API_KEY');
    }

    if (!validateApiKey(config.apiKeys.xai)) {
      throw new XAIProviderError('Invalid XAI API key format', 'INVALID_API_KEY');
    }

    // Get base URL from config or use default
    const baseURL = config.providers?.xaiBaseUrl || 'https://api.x.ai/v1';

    // Initialize OpenAI client with XAI base URL
    const openai = new OpenAI({
      apiKey: config.apiKeys.xai,
      baseURL,
    });

    // Resolve model name
    const resolvedModel = resolveModelName(model);
    const modelConfig = SUPPORTED_MODELS[resolvedModel] || {};

    // Convert and validate messages
    const xaiMessages = convertMessages(messages);

    // Filter out unsupported parameters for XAI/Grok models
    const { reasoning_effort: _unused_reasoning_effort, ...supportedOptions } = otherOptions;

    // Build request payload
    const requestPayload = {
      model: resolvedModel,
      messages: xaiMessages,
      stream,
      ...supportedOptions
    };

    // Add temperature (all Grok models support temperature)
    if (temperature !== undefined) {
      requestPayload.temperature = Math.max(0, Math.min(2, temperature));
    }

    // Add max tokens if specified
    if (maxTokens) {
      requestPayload.max_tokens = Math.min(maxTokens, modelConfig.maxOutputTokens || 256000);
    }

    // Add web search parameters if requested and model supports it
    if (use_websearch && modelConfig.supportsWebSearch) {
      requestPayload.search_parameters = {
        mode: 'auto' // Let the model decide when to use web search
      };
    }

    // Note: XAI/Grok models don't currently support reasoning_effort parameter
    // We silently ignore it for API consistency (no need to log warnings in tests)

    try {
      debugLog(`[XAI] Calling ${resolvedModel} with ${xaiMessages.length} messages${use_websearch && modelConfig.supportsWebSearch ? ' (with live search)' : ''}`);

      const startTime = Date.now();

      // Make the API call
      const response = await openai.chat.completions.create(requestPayload);

      const responseTime = Date.now() - startTime;
      debugLog(`[XAI] Response received in ${responseTime}ms`);

      // Extract response data
      const choice = response.choices[0];
      if (!choice) {
        throw new XAIProviderError('No response choice received from XAI', 'NO_RESPONSE_CHOICE');
      }

      const content = choice.message?.content;
      if (!content) {
        throw new XAIProviderError('No content in response from XAI', 'NO_RESPONSE_CONTENT');
      }

      // Extract usage information
      const usage = response.usage || {};

      // Return unified response format
      return {
        content,
        stop_reason: choice.finish_reason || 'stop',
        rawResponse: response,
        metadata: {
          model: response.model || resolvedModel,
          usage: {
            input_tokens: usage.prompt_tokens || 0,
            output_tokens: usage.completion_tokens || 0,
            total_tokens: usage.total_tokens || 0
          },
          response_time_ms: responseTime,
          finish_reason: choice.finish_reason,
          provider: 'xai',
          web_search_used: use_websearch && modelConfig.supportsWebSearch
        }
      };

    } catch (error) {
      debugError('[XAI] Error during API call:', error);

      // Handle specific XAI/OpenAI compatible errors
      if (error.code === 'insufficient_quota') {
        throw new XAIProviderError('XAI API quota exceeded', 'QUOTA_EXCEEDED', error);
      } else if (error.code === 'invalid_api_key') {
        throw new XAIProviderError('Invalid XAI API key', 'INVALID_API_KEY', error);
      } else if (error.code === 'model_not_found') {
        throw new XAIProviderError(`Model ${resolvedModel} not found`, 'MODEL_NOT_FOUND', error);
      } else if (error.code === 'context_length_exceeded') {
        throw new XAIProviderError('Context length exceeded for model', 'CONTEXT_LENGTH_EXCEEDED', error);
      } else if (error.type === 'invalid_request_error') {
        throw new XAIProviderError(`Invalid request: ${error.message}`, 'INVALID_REQUEST', error);
      } else if (error.type === 'rate_limit_error') {
        throw new XAIProviderError('XAI rate limit exceeded', 'RATE_LIMIT_EXCEEDED', error);
      }

      // Generic error handling
      throw new XAIProviderError(
        `XAI API error: ${error.message || 'Unknown error'}`,
        'API_ERROR',
        error
      );
    }
  },

  /**
   * Validate configuration for XAI provider
   * @param {Object} config - Configuration object
   * @returns {boolean} - True if configuration is valid
   */
  validateConfig(config) {
    return !!(config?.apiKeys?.xai && validateApiKey(config.apiKeys.xai));
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
