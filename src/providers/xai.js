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
  'grok-code-fast-1': {
    modelName: 'grok-code-fast-1',
    friendlyName: 'X.AI (Grok Code Fast 1)',
    contextWindow: 256000,
    maxOutputTokens: 256000,
    supportsStreaming: true,
    supportsImages: false,
    supportsTemperature: true,
    supportsWebSearch: false,
    timeout: 300000, // 5 minutes
    description: 'GROK Code Fast 1 (256K context) - Speedy and economical reasoning model that excels at agentic coding',
    aliases: ['grok-code-fast', 'grok-code-fast-1-0825', 'grok code fast', 'grok code fast 1']
  },
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
   * @returns {Object|AsyncGenerator} - { content, stop_reason, rawResponse } or AsyncGenerator when stream=true
   */
  async invoke(messages, options = {}) {
    const {
      model = 'grok-4-0709',
      temperature = 0.7,
      maxTokens = null,
      stream = false,
      reasoning_effort = 'medium',
      use_websearch = false,
      signal,
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

    // Add usage reporting for streaming mode
    if (stream) {
      requestPayload.stream_options = { include_usage: true };
    }

    // If streaming is requested and model doesn't support it, fall back to non-streaming
    if (stream && modelConfig.supportsStreaming === false) {
      debugLog(`[XAI] Model ${resolvedModel} doesn't support streaming, falling back to non-streaming mode`);
      requestPayload.stream = false;
    }

    // Handle streaming requests
    if (stream && requestPayload.stream !== false) {
      return this._createStreamingGenerator(openai, requestPayload, resolvedModel, modelConfig, use_websearch, signal);
    }

    // Note: XAI/Grok models don't currently support reasoning_effort parameter
    // We silently ignore it for API consistency (no need to log warnings in tests)

    try {
      debugLog(`[XAI] Calling ${resolvedModel} with ${xaiMessages.length} messages${use_websearch && modelConfig.supportsWebSearch ? ' (with live search)' : ''}`);

      // Check if already aborted before making request
      if (signal?.aborted) {
        throw new Error(`Request aborted: ${signal.reason || 'Cancelled'}`);
      }

      const startTime = Date.now();

      // Make the API call with abort signal support
      const requestWithSignal = { ...requestPayload };
      if (signal) {
        requestWithSignal.signal = signal;
      }
      const response = await openai.chat.completions.create(requestWithSignal);

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
   * Create streaming generator for XAI responses
   * @private
   * @param {OpenAI} openai - OpenAI client instance configured for XAI
   * @param {Object} requestPayload - Request payload
   * @param {string} resolvedModel - Resolved model name
   * @param {Object} modelConfig - Model configuration
   * @param {boolean} use_websearch - Whether web search is enabled
   * @returns {AsyncGenerator} - Streaming generator yielding events
   */
  async *_createStreamingGenerator(openai, requestPayload, resolvedModel, modelConfig, use_websearch, signal) {
    const searchInfo = (use_websearch && modelConfig.supportsWebSearch) ? ' (with live search)' : '';

    debugLog(`[XAI] Starting streaming for ${resolvedModel} with ${requestPayload.messages?.length} messages${searchInfo}`);

    const startTime = Date.now();
    let totalContent = '';
    let lastUsage = null;
    let finishReason = null;
    let finalModel = resolvedModel;
    let citations = null;
    let searchSourcesUsed = 0;

    try {
      // Check if already aborted before starting
      if (signal?.aborted) {
        throw new Error(`Request aborted: ${signal.reason || 'Cancelled'}`);
      }

      // Yield start event
      yield {
        type: 'start',
        timestamp: new Date().toISOString(),
        model: resolvedModel,
        provider: 'xai'
      };

      // Create stream using OpenAI SDK with XAI base URL and abort signal support
      const requestWithSignal = { ...requestPayload };
      if (signal) {
        requestWithSignal.signal = signal;
      }
      const stream = await openai.chat.completions.create(requestWithSignal);

      // Process stream chunks
      for await (const chunk of stream) {
        try {
          // Check for cancellation during stream processing
          if (signal?.aborted) {
            debugLog(`[XAI] Stream aborted during processing: ${signal.reason || 'Cancelled'}`);
            break;
          }
          // Handle Chat Completions API streaming format (XAI uses OpenAI-compatible format)
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
            // Track search sources used for live search cost monitoring
            if (chunk.usage.num_sources_used) {
              searchSourcesUsed = chunk.usage.num_sources_used;
            }
          }

          // Handle citations for live search (XAI-specific feature)
          if (chunk.citations) {
            citations = chunk.citations;
          }

          // Update model if provided
          if (chunk.model) {
            finalModel = chunk.model;
          }
        } catch (chunkError) {
          debugError('[XAI] Error processing stream chunk:', chunkError);
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
      debugLog(`[XAI] Streaming completed in ${responseTime}ms${searchSourcesUsed > 0 ? ` (used ${searchSourcesUsed} search sources)` : ''}`);

      // Yield usage information if available
      if (lastUsage) {
        const usageEvent = {
          type: 'usage',
          usage: {
            input_tokens: lastUsage.prompt_tokens || 0,
            output_tokens: lastUsage.completion_tokens || 0,
            total_tokens: lastUsage.total_tokens || 0
          },
          timestamp: new Date().toISOString()
        };

        // Add search-specific usage information
        if (searchSourcesUsed > 0) {
          usageEvent.usage.search_sources_used = searchSourcesUsed;
          usageEvent.usage.search_cost_estimate = searchSourcesUsed * 0.025; // $0.025 per source
        }

        yield usageEvent;
      }

      // Determine web search usage
      const webSearchUsed = use_websearch && modelConfig.supportsWebSearch;

      // Build final metadata
      const metadata = {
        model: finalModel,
        usage: {
          input_tokens: lastUsage?.prompt_tokens || 0,
          output_tokens: lastUsage?.completion_tokens || 0,
          total_tokens: lastUsage?.total_tokens || 0
        },
        response_time_ms: responseTime,
        finish_reason: finishReason || 'stop',
        provider: 'xai',
        web_search_used: webSearchUsed
      };

      // Add search-specific metadata
      if (searchSourcesUsed > 0) {
        metadata.search_sources_used = searchSourcesUsed;
        metadata.search_cost_estimate = searchSourcesUsed * 0.025;
      }

      if (citations) {
        metadata.citations = citations;
      }

      // Yield end event with final metadata
      yield {
        type: 'end',
        content: totalContent,
        stop_reason: finishReason || 'stop',
        metadata,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      debugError('[XAI] Streaming error:', error);

      // Handle specific XAI/OpenAI compatible errors in streaming context
      let errorCode = 'STREAMING_ERROR';
      let errorMessage = `XAI streaming error: ${error.message || 'Unknown error'}`;
      let recoverable = false;

      if (error.code === 'insufficient_quota') {
        errorCode = 'QUOTA_EXCEEDED';
        errorMessage = 'XAI API quota exceeded';
      } else if (error.code === 'invalid_api_key') {
        errorCode = 'INVALID_API_KEY';
        errorMessage = 'Invalid XAI API key';
      } else if (error.code === 'model_not_found') {
        errorCode = 'MODEL_NOT_FOUND';
        errorMessage = `Model ${resolvedModel} not found`;
      } else if (error.code === 'context_length_exceeded') {
        errorCode = 'CONTEXT_LENGTH_EXCEEDED';
        errorMessage = 'Context length exceeded for model';
      } else if (error.type === 'invalid_request_error') {
        errorCode = 'INVALID_REQUEST';
        errorMessage = `Invalid request: ${error.message}`;
      } else if (error.type === 'rate_limit_error') {
        errorCode = 'RATE_LIMIT_EXCEEDED';
        errorMessage = 'XAI rate limit exceeded';
        recoverable = true;
      }

      // Yield final error event
      yield {
        type: 'error',
        error: {
          message: errorMessage,
          code: errorCode,
          recoverable,
          originalError: error.message
        },
        timestamp: new Date().toISOString()
      };

      // Re-throw to maintain error propagation
      throw new XAIProviderError(errorMessage, errorCode, error);
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
