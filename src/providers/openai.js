/**
 * OpenAI Provider
 *
 * Provider implementation for OpenAI GPT models using the official OpenAI SDK v5.
 * Implements the unified interface: async invoke(messages, options) => { content, stop_reason, rawResponse }
 */

import OpenAI from 'openai';
import { debugLog, debugError } from '../utils/console.js';

// Define supported models with their capabilities
const SUPPORTED_MODELS = {
  'o3': {
    modelName: 'o3',
    friendlyName: 'OpenAI (O3)',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: false,
    supportsWebSearch: true,
    supportsResponsesAPI: true,
    timeout: 300000, // 5 minutes
    description: 'Strong reasoning (200K context) - Logical problems, code generation, systematic analysis',
    aliases: ['o3-2025-01-31']
  },
  'o3-mini': {
    modelName: 'o3-mini',
    friendlyName: 'OpenAI (O3-mini)',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: false,
    supportsWebSearch: false, // o3-mini does not support web search
    supportsResponsesAPI: true,
    timeout: 300000,
    description: 'Fast O3 variant (200K context) - Balanced performance/speed, moderate complexity',
    aliases: ['o3mini', 'o3 mini', 'o3-mini-2025-01-31']
  },
  'o3-pro-2025-06-10': {
    modelName: 'o3-pro-2025-06-10',
    friendlyName: 'OpenAI (O3-Pro)',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: false,
    supportsWebSearch: true,
    supportsResponsesAPI: true,
    timeout: 1800000, // 30 minutes
    description: 'Professional-grade reasoning (200K context) - EXTREMELY EXPENSIVE: Only for the most complex problems',
    aliases: ['o3-pro', 'o3pro', 'o3 pro']
  },
  'o4-mini': {
    modelName: 'o4-mini',
    friendlyName: 'OpenAI (O4-mini)',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: false,
    supportsWebSearch: true,
    supportsResponsesAPI: true,
    timeout: 180000, // 3 minutes
    description: 'Latest reasoning model (200K context) - Optimized for shorter contexts, rapid reasoning',
    aliases: ['o4mini', 'o4', 'o4 mini', 'o4-mini-2025-01-30']
  },
  'gpt-4.1-2025-04-14': {
    modelName: 'gpt-4.1-2025-04-14',
    friendlyName: 'OpenAI (GPT-4.1)',
    contextWindow: 1000000,
    maxOutputTokens: 32768,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: true,
    supportsResponsesAPI: true,
    timeout: 300000,
    description: 'GPT-4.1 (1M context) - Advanced reasoning model with large context window',
    aliases: ['gpt4.1', 'gpt-4.1', 'gpt 4.1', 'gpt-4.1-latest']
  },
  'gpt-4o': {
    modelName: 'gpt-4o',
    friendlyName: 'OpenAI (GPT-4o)',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: true,
    supportsResponsesAPI: true,
    timeout: 180000,
    description: 'GPT-4o (128K context) - Multimodal flagship model with vision capabilities',
    aliases: ['gpt4o', 'gpt 4o', '4o']
  },
  'gpt-4o-mini': {
    modelName: 'gpt-4o-mini',
    friendlyName: 'OpenAI (GPT-4o-mini)',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: true,
    supportsResponsesAPI: true,
    timeout: 120000,
    description: 'GPT-4o-mini (128K context) - Fast and efficient multimodal model',
    aliases: ['gpt4o-mini', 'gpt 4o mini', '4o mini', '4o-mini']
  }
};

/**
 * Custom error class for OpenAI provider errors
 */
class OpenAIProviderError extends Error {
  constructor(message, code, originalError = null) {
    super(message);
    this.name = 'OpenAIProviderError';
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

  // Return as-is if not found (let OpenAI API handle unknown models)
  return modelName;
}

/**
 * Validate OpenAI API key format
 */
function validateApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }

  // OpenAI API keys typically start with 'sk-' and are at least 20 characters
  return apiKey.startsWith('sk-') && apiKey.length >= 20;
}

/**
 * Convert messages to OpenAI format, handling both Responses API and Chat Completions API
 */
function convertMessages(messages, useResponsesAPI = false) {
  if (!Array.isArray(messages)) {
    throw new OpenAIProviderError('Messages must be an array', 'INVALID_MESSAGES');
  }

  return messages.map((msg, index) => {
    if (!msg || typeof msg !== 'object') {
      throw new OpenAIProviderError(`Message at index ${index} must be an object`, 'INVALID_MESSAGE');
    }

    const { role, content } = msg;

    if (!role || !['system', 'user', 'assistant'].includes(role)) {
      throw new OpenAIProviderError(`Invalid role "${role}" at message index ${index}`, 'INVALID_ROLE');
    }

    if (!content) {
      throw new OpenAIProviderError(`Message content is required at index ${index}`, 'MISSING_CONTENT');
    }

    // Handle complex content structure (array with text and images)
    if (Array.isArray(content)) {
      debugLog(`[OpenAI] Processing complex content array with ${content.length} items for ${useResponsesAPI ? 'Responses API' : 'Chat Completions API'}`);
      if (useResponsesAPI) {
        // Convert to Responses API format
        const convertedContent = [];

        for (const item of content) {
          if (item.type === 'text') {
            convertedContent.push({
              type: 'input_text',
              text: item.text
            });
          } else if (item.type === 'image' && item.source) {
            // Convert Anthropic/Claude format to OpenAI Responses API format
            const imageUrl = `data:${item.source.media_type};base64,${item.source.data}`;
            debugLog(`[OpenAI] Converting image for Responses API: ${item.source.media_type}, data length: ${item.source.data.length}`);
            convertedContent.push({
              type: 'input_image',
              image_url: imageUrl
            });
          }
        }

        return { role, content: convertedContent };
      } else {
        // Convert to Chat Completions API format
        const convertedContent = [];

        for (const item of content) {
          if (item.type === 'text') {
            convertedContent.push({
              type: 'text',
              text: item.text
            });
          } else if (item.type === 'image' && item.source) {
            // Convert Anthropic/Claude format to OpenAI Chat Completions format
            const imageUrl = `data:${item.source.media_type};base64,${item.source.data}`;
            debugLog(`[OpenAI] Converting image for Chat Completions API: ${item.source.media_type}, data length: ${item.source.data.length}`);
            convertedContent.push({
              type: 'image_url',
              image_url: {
                url: imageUrl,
                detail: 'high'
              }
            });
          }
        }

        return { role, content: convertedContent };
      }
    }

    // Simple string content
    return { role, content };
  });
}

/**
 * Main OpenAI provider implementation
 */
export const openaiProvider = {
  /**
   * Unified provider interface: invoke messages with options
   * @param {Array} messages - Array of message objects with role and content
   * @param {Object} options - Configuration options
   * @returns {Object} - { content, stop_reason, rawResponse }
   */
  async invoke(messages, options = {}) {
    const {
      model = 'gpt-4o-mini',
      temperature = 0.7,
      maxTokens = null,
      stream = false,
      reasoning_effort = 'medium',
      use_websearch = false,
      config,
      ...otherOptions
    } = options;

    // Validate API key
    if (!config?.apiKeys?.openai) {
      throw new OpenAIProviderError('OpenAI API key not configured', 'MISSING_API_KEY');
    }

    if (!validateApiKey(config.apiKeys.openai)) {
      throw new OpenAIProviderError('Invalid OpenAI API key format', 'INVALID_API_KEY');
    }

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: config.apiKeys.openai,
    });

    // Resolve model name
    const resolvedModel = resolveModelName(model);
    const modelConfig = SUPPORTED_MODELS[resolvedModel] || {};

    // Always use Responses API since all OpenAI models support it
    // Only fallback to Chat Completions API if Responses API is explicitly not supported
    const shouldUseResponsesAPI = modelConfig.supportsResponsesAPI !== false;

    // Convert and validate messages
    const openaiMessages = convertMessages(messages, shouldUseResponsesAPI);

    // Build request payload based on API type
    let requestPayload;

    if (shouldUseResponsesAPI) {
      // Build Responses API payload
      requestPayload = {
        model: resolvedModel,
        input: openaiMessages,
        stream,
        ...otherOptions
      };

      // Add web search tools only if requested and model supports it
      if (use_websearch && modelConfig.supportsWebSearch) {
        requestPayload.tools = [{ type: 'web_search' }];
      }

      // Add temperature if model supports it
      if (modelConfig.supportsTemperature !== false && temperature !== undefined) {
        requestPayload.temperature = Math.max(0, Math.min(2, temperature));
      }

      // Add reasoning effort for thinking models (o3 series only)
      if (resolvedModel.startsWith('o3') && reasoning_effort) {
        requestPayload.reasoning = { effort: reasoning_effort };
      }
    } else {
      // Build Chat Completions API payload
      const { reasoning_effort: _unused, ...cleanOptions } = otherOptions;
      requestPayload = {
        model: resolvedModel,
        messages: openaiMessages,
        stream,
        ...cleanOptions
      };

      // Add temperature if model supports it
      if (modelConfig.supportsTemperature !== false && temperature !== undefined) {
        requestPayload.temperature = Math.max(0, Math.min(2, temperature));
      }

      // Add reasoning effort for thinking models (o3 series only)
      if (resolvedModel.startsWith('o3') && reasoning_effort) {
        requestPayload.reasoning_effort = reasoning_effort;
      }
    }

    // Add max tokens if specified (both APIs)
    if (maxTokens) {
      if (shouldUseResponsesAPI) {
        requestPayload.max_output_tokens = Math.min(maxTokens, modelConfig.maxOutputTokens || 100000);
      } else {
        requestPayload.max_tokens = Math.min(maxTokens, modelConfig.maxOutputTokens || 100000);
      }
    }

    try {
      const apiType = shouldUseResponsesAPI ? 'Responses API' : 'Chat Completions API';
      debugLog(`[OpenAI] Calling ${resolvedModel} via ${apiType} with ${openaiMessages.length} messages${use_websearch && modelConfig.supportsWebSearch ? ' (with web search)' : ''}`);

      const startTime = Date.now();

      // Make the API call based on API type
      let response;
      if (shouldUseResponsesAPI) {
        response = await openai.responses.create(requestPayload);
      } else {
        response = await openai.chat.completions.create(requestPayload);
      }

      const responseTime = Date.now() - startTime;
      debugLog(`[OpenAI] Response received in ${responseTime}ms`);

      // Extract response data based on API type
      let content, stopReason, usage;

      if (shouldUseResponsesAPI) {
        // Handle Responses API response format
        if (!response.output_text) {
          throw new OpenAIProviderError('No output_text in Responses API response', 'NO_RESPONSE_CONTENT');
        }
        content = response.output_text;
        stopReason = response.status || 'stop';
        usage = response.usage || {};
      } else {
        // Handle Chat Completions API response format
        const choice = response.choices[0];
        if (!choice) {
          throw new OpenAIProviderError('No response choice received from OpenAI', 'NO_RESPONSE_CHOICE');
        }

        content = choice.message?.content;
        if (!content) {
          throw new OpenAIProviderError('No content in response from OpenAI', 'NO_RESPONSE_CONTENT');
        }
        stopReason = choice.finish_reason || 'stop';
        usage = response.usage || {};
      }

      // Return unified response format
      return {
        content,
        stop_reason: stopReason,
        rawResponse: response,
        metadata: {
          model: response.model || resolvedModel,
          usage: {
            input_tokens: usage.prompt_tokens || usage.input_tokens || 0,
            output_tokens: usage.completion_tokens || usage.output_tokens || 0,
            total_tokens: usage.total_tokens || 0
          },
          response_time_ms: responseTime,
          finish_reason: stopReason,
          provider: 'openai',
          api_type: apiType,
          web_search_used: use_websearch && modelConfig.supportsWebSearch
        }
      };

    } catch (error) {
      debugError('[OpenAI] Error during API call:', error);

      // Handle specific OpenAI errors
      if (error.code === 'insufficient_quota') {
        throw new OpenAIProviderError('OpenAI API quota exceeded', 'QUOTA_EXCEEDED', error);
      } else if (error.code === 'invalid_api_key') {
        throw new OpenAIProviderError('Invalid OpenAI API key', 'INVALID_API_KEY', error);
      } else if (error.code === 'model_not_found') {
        throw new OpenAIProviderError(`Model ${resolvedModel} not found`, 'MODEL_NOT_FOUND', error);
      } else if (error.code === 'context_length_exceeded') {
        throw new OpenAIProviderError('Context length exceeded for model', 'CONTEXT_LENGTH_EXCEEDED', error);
      } else if (error.type === 'invalid_request_error') {
        throw new OpenAIProviderError(`Invalid request: ${error.message}`, 'INVALID_REQUEST', error);
      } else if (error.type === 'rate_limit_error') {
        throw new OpenAIProviderError('OpenAI rate limit exceeded', 'RATE_LIMIT_EXCEEDED', error);
      }

      // Generic error handling
      throw new OpenAIProviderError(
        `OpenAI API error: ${error.message || 'Unknown error'}`,
        'API_ERROR',
        error
      );
    }
  },

  /**
   * Validate configuration for OpenAI provider
   * @param {Object} config - Configuration object
   * @returns {boolean} - True if configuration is valid
   */
  validateConfig(config) {
    return !!(config?.apiKeys?.openai && validateApiKey(config.apiKeys.openai));
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
