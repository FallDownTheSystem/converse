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
  'gpt-5': {
    modelName: 'gpt-5',
    friendlyName: 'OpenAI (GPT-5)',
    contextWindow: 400000,
    maxOutputTokens: 128000,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: false,  // GPT-5 doesn't support temperature
    supportsWebSearch: true,
    supportsResponsesAPI: true,
    timeout: 300000, // 5 minutes
    description: 'Latest flagship model (400K context, 128K output) - Superior reasoning, code generation, and analysis',
    aliases: ['gpt5', 'gpt 5', 'gpt-5-2025-08-07']
  },
  'gpt-5-mini': {
    modelName: 'gpt-5-mini',
    friendlyName: 'OpenAI (GPT-5-mini)',
    contextWindow: 400000,
    maxOutputTokens: 128000,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: false,  // GPT-5 models don't support temperature
    supportsWebSearch: true,
    supportsResponsesAPI: true,
    timeout: 180000, // 3 minutes
    description: 'Faster, cost-efficient GPT-5 (400K context, 128K output) - Well-defined tasks, precise prompts',
    aliases: ['gpt5-mini', 'gpt-5mini', 'gpt 5 mini', 'gpt-5-mini-2025-08-07']
  },
  'gpt-5-nano': {
    modelName: 'gpt-5-nano',
    friendlyName: 'OpenAI (GPT-5-nano)',
    contextWindow: 400000,
    maxOutputTokens: 128000,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: false,  // GPT-5 models don't support temperature
    supportsWebSearch: false,    // GPT-5-nano doesn't support web search
    supportsResponsesAPI: true,
    timeout: 120000, // 2 minutes
    description: 'Fastest, most cost-efficient GPT-5 (400K context, 128K output) - Summarization, classification',
    aliases: ['gpt5-nano', 'gpt-5nano', 'gpt 5 nano', 'gpt-5-nano-2025-08-07']
  },
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
  },
  'o3-deep-research-2025-06-26': {
    modelName: 'o3-deep-research-2025-06-26',
    friendlyName: 'OpenAI (O3 Deep Research)',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: false,
    supportsWebSearch: true,
    supportsResponsesAPI: true,
    supportsDeepResearch: true,
    timeout: 5400000, // 90 minutes for deep research
    description: 'Deep research model (200K context) - In-depth synthesis, comprehensive reports, multi-source analysis (30-90 min runtime)',
    aliases: ['o3-deep-research', 'o3-research', 'o3 deep research', 'deep-research-o3']
  },
  'o4-mini-deep-research-2025-06-26': {
    modelName: 'o4-mini-deep-research-2025-06-26',
    friendlyName: 'OpenAI (O4-mini Deep Research)',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: false,
    supportsWebSearch: true,
    supportsResponsesAPI: true,
    supportsDeepResearch: true,
    timeout: 3600000, // 60 minutes for faster deep research
    description: 'Fast deep research model (200K context) - Lightweight research, faster results, latency-sensitive analysis (15-60 min runtime)',
    aliases: ['o4-mini-deep-research', 'o4-mini-research', 'o4-research', 'o4 mini deep research', 'deep-research-o4-mini', 'o4-deep-research']
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
   * @returns {Object|AsyncGenerator} - { content, stop_reason, rawResponse } or AsyncGenerator when stream=true
   */
  async invoke(messages, options = {}) {
    const {
      model = 'gpt-4o-mini',
      temperature = 0.7,
      maxTokens = null,
      stream = false,
      reasoning_effort = 'medium',
      verbosity = 'medium',
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
        // Use web_search_preview tool for all models in Responses API
        requestPayload.tools = [{ type: 'web_search_preview' }];
      }

      // Add temperature if model supports it
      if (modelConfig.supportsTemperature !== false && temperature !== undefined) {
        requestPayload.temperature = Math.max(0, Math.min(2, temperature));
      }

      // Add reasoning effort for thinking models (o3 series and GPT-5 family)
      if ((resolvedModel.startsWith('o3') || resolvedModel.startsWith('gpt-5')) && reasoning_effort) {
        requestPayload.reasoning = { effort: reasoning_effort };
      }

      // Add verbosity for GPT-5 models
      if (resolvedModel.startsWith('gpt-5') && verbosity) {
        requestPayload.text = { verbosity };
      }
    } else {
      // Build Chat Completions API payload
      const { reasoning_effort: _unused, verbosity: _unused2, ...cleanOptions } = otherOptions;
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

      // Add reasoning effort for thinking models (o3 series and GPT-5 family)
      if ((resolvedModel.startsWith('o3') || resolvedModel.startsWith('gpt-5')) && reasoning_effort) {
        requestPayload.reasoning_effort = reasoning_effort;
      }

      // Add verbosity for GPT-5 models
      if (resolvedModel.startsWith('gpt-5') && verbosity) {
        requestPayload.verbosity = verbosity;
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

    // Add usage reporting for streaming mode
    if (stream && !shouldUseResponsesAPI) {
      requestPayload.stream_options = { include_usage: true };
    }

    // If streaming is requested and model doesn't support it, fall back to non-streaming
    if (stream && modelConfig.supportsStreaming === false) {
      debugLog(`[OpenAI] Model ${resolvedModel} doesn't support streaming, falling back to non-streaming mode`);
      requestPayload.stream = false;
    }

    // Handle streaming requests
    if (stream && requestPayload.stream !== false) {
      return this._createStreamingGenerator(openai, requestPayload, shouldUseResponsesAPI, resolvedModel, modelConfig, use_websearch);
    }

    try {
      const apiType = shouldUseResponsesAPI ? 'Responses API' : 'Chat Completions API';
      const searchInfo = (use_websearch && modelConfig.supportsWebSearch) ? ' (with web search)' : '';
      debugLog(`[OpenAI] Calling ${resolvedModel} via ${apiType} with ${openaiMessages.length} messages${searchInfo}`);

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

      // Determine web search usage
      const webSearchUsed = use_websearch && modelConfig.supportsWebSearch;
      const webSearchType = webSearchUsed ? 'web_search_preview' : null;

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
          web_search_used: webSearchUsed,
          web_search_type: webSearchType
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
   * Create streaming generator for OpenAI responses
   * @private
   * @param {OpenAI} openai - OpenAI client instance
   * @param {Object} requestPayload - Request payload
   * @param {boolean} shouldUseResponsesAPI - Whether to use Responses API
   * @param {string} resolvedModel - Resolved model name
   * @param {Object} modelConfig - Model configuration
   * @param {boolean} use_websearch - Whether web search is enabled
   * @returns {AsyncGenerator} - Streaming generator yielding events
   */
  async *_createStreamingGenerator(openai, requestPayload, shouldUseResponsesAPI, resolvedModel, modelConfig, use_websearch) {
    const apiType = shouldUseResponsesAPI ? 'Responses API' : 'Chat Completions API';
    const searchInfo = (use_websearch && modelConfig.supportsWebSearch) ? ' (with web search)' : '';
    
    debugLog(`[OpenAI] Starting streaming for ${resolvedModel} via ${apiType} with ${requestPayload.input?.length || requestPayload.messages?.length} messages${searchInfo}`);

    const startTime = Date.now();
    let totalContent = '';
    let lastUsage = null;
    let finishReason = null;
    let finalModel = resolvedModel;

    try {
      // Yield start event
      yield {
        type: 'start',
        timestamp: new Date().toISOString(),
        model: resolvedModel,
        provider: 'openai',
        api_type: apiType
      };

      // Create stream based on API type
      let stream;
      if (shouldUseResponsesAPI) {
        stream = await openai.responses.create(requestPayload);
      } else {
        stream = await openai.chat.completions.create(requestPayload);
      }

      // Process stream chunks
      for await (const chunk of stream) {
        try {
          if (shouldUseResponsesAPI) {
            // Handle Responses API streaming format
            if (chunk.type === 'response.delta') {
              const content = chunk.delta?.output_text || '';
              if (content) {
                totalContent += content;
                yield {
                  type: 'delta',
                  content,
                  timestamp: new Date().toISOString()
                };
              }
            } else if (chunk.type === 'response.done') {
              finishReason = chunk.response?.status || 'stop';
              finalModel = chunk.response?.model || resolvedModel;
              if (chunk.response?.usage) {
                lastUsage = chunk.response.usage;
              }
            }
          } else {
            // Handle Chat Completions API streaming format
            const choice = chunk.choices?.[0];
            if (choice) {
              const content = choice.delta?.content || '';
              if (content) {
                totalContent += content;
                yield {
                  type: 'delta',
                  content,
                  timestamp: new Date().toISOString()
                };
              }

              if (choice.finish_reason) {
                finishReason = choice.finish_reason;
              }
            }

            // Handle usage information (typically in final chunk)
            if (chunk.usage) {
              lastUsage = chunk.usage;
            }

            // Update model if provided
            if (chunk.model) {
              finalModel = chunk.model;
            }
          }
        } catch (chunkError) {
          debugError('[OpenAI] Error processing stream chunk:', chunkError);
          yield {
            type: 'error',
            error: {
              message: `Chunk processing error: ${chunkError.message}`,
              code: 'CHUNK_PROCESSING_ERROR',
              recoverable: true
            },
            timestamp: new Date().toISOString()
          };
        }
      }

      const responseTime = Date.now() - startTime;
      debugLog(`[OpenAI] Streaming completed in ${responseTime}ms`);

      // Yield usage information if available
      if (lastUsage) {
        yield {
          type: 'usage',
          usage: {
            input_tokens: lastUsage.prompt_tokens || lastUsage.input_tokens || 0,
            output_tokens: lastUsage.completion_tokens || lastUsage.output_tokens || 0,
            total_tokens: lastUsage.total_tokens || 0
          },
          timestamp: new Date().toISOString()
        };
      }

      // Determine web search usage
      const webSearchUsed = use_websearch && modelConfig.supportsWebSearch;
      const webSearchType = webSearchUsed ? 'web_search_preview' : null;

      // Yield end event with final metadata
      yield {
        type: 'end',
        content: totalContent,
        stop_reason: finishReason || 'stop',
        metadata: {
          model: finalModel,
          usage: {
            input_tokens: lastUsage?.prompt_tokens || lastUsage?.input_tokens || 0,
            output_tokens: lastUsage?.completion_tokens || lastUsage?.output_tokens || 0,
            total_tokens: lastUsage?.total_tokens || 0
          },
          response_time_ms: responseTime,
          finish_reason: finishReason || 'stop',
          provider: 'openai',
          api_type: apiType,
          web_search_used: webSearchUsed,
          web_search_type: webSearchType
        },
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      debugError('[OpenAI] Streaming error:', error);

      // Handle specific OpenAI errors in streaming context
      let errorCode = 'STREAMING_ERROR';
      let errorMessage = `OpenAI streaming error: ${error.message || 'Unknown error'}`;
      let recoverable = false;

      if (error.code === 'insufficient_quota') {
        errorCode = 'QUOTA_EXCEEDED';
        errorMessage = 'OpenAI API quota exceeded';
      } else if (error.code === 'invalid_api_key') {
        errorCode = 'INVALID_API_KEY';
        errorMessage = 'Invalid OpenAI API key';
      } else if (error.code === 'model_not_found') {
        errorCode = 'MODEL_NOT_FOUND';
        errorMessage = `Model ${resolvedModel} not found`;
      } else if (error.code === 'context_length_exceeded') {
        errorCode = 'CONTEXT_LENGTH_EXCEEDED';
        errorMessage = 'Context length exceeded for model';
      } else if (error.type === 'rate_limit_error') {
        errorCode = 'RATE_LIMIT_EXCEEDED';
        errorMessage = 'OpenAI rate limit exceeded';
        recoverable = true;
      }

      yield {
        type: 'error',
        error: {
          message: errorMessage,
          code: errorCode,
          recoverable,
          originalError: error
        },
        timestamp: new Date().toISOString()
      };

      // Re-throw the error to maintain existing error handling behavior
      throw new OpenAIProviderError(errorMessage, errorCode, error);
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
