/**
 * OpenAI-Compatible Provider Base Module
 *
 * Factory function that creates providers for OpenAI-compatible APIs.
 * This module handles common functionality for providers that use the OpenAI SDK
 * with custom base URLs (e.g., DeepSeek, OpenRouter).
 */

import OpenAI from 'openai';
import { debugLog, debugError } from '../utils/console.js';
import { ProviderError, ErrorCodes, StopReasons } from './interface.js';

/**
 * Configuration for OpenAI-compatible provider
 * @typedef {Object} OpenAICompatibleConfig
 * @property {string} baseURL - API base URL
 * @property {string} apiKey - API key
 * @property {Object} [customHeaders] - Custom headers to include in requests
 * @property {string} [providerName] - Provider name for logging/errors
 * @property {Object<string, ModelConfig>} supportedModels - Supported models
 * @property {Function} [validateApiKey] - Custom API key validation function
 * @property {Function} [transformRequest] - Transform request before sending
 * @property {Function} [transformResponse] - Transform response after receiving
 * @property {Object} [defaultParams] - Default parameters for all requests
 */

/**
 * Map common stop/finish reasons to unified format
 */
const STOP_REASON_MAP = {
  // Standard OpenAI reasons
  stop: StopReasons.STOP,
  length: StopReasons.LENGTH,
  max_tokens: StopReasons.LENGTH,
  tool_calls: StopReasons.TOOL_USE,
  function_call: StopReasons.TOOL_USE,
  content_filter: StopReasons.CONTENT_FILTER,

  // Provider-specific variations
  finish: StopReasons.STOP,
  complete: StopReasons.STOP,
  completed: StopReasons.STOP,
  token_limit: StopReasons.LENGTH,
  token_limit_reached: StopReasons.LENGTH,
  safety: StopReasons.SAFETY,
  filtered: StopReasons.CONTENT_FILTER,

  // Default
  null: StopReasons.STOP,
  undefined: StopReasons.STOP,
};

/**
 * Normalize stop reason to unified format
 */
function normalizeStopReason(reason) {
  if (!reason) return StopReasons.STOP;
  const normalized = STOP_REASON_MAP[reason.toLowerCase()];
  return normalized || StopReasons.OTHER;
}

/**
 * Default API key validator (checks for non-empty string)
 */
function defaultValidateApiKey(apiKey) {
  return !!(apiKey && typeof apiKey === 'string' && apiKey.length > 0);
}

/**
 * Convert messages to OpenAI format
 */
function convertMessages(messages, providerName) {
  if (!Array.isArray(messages)) {
    throw new ProviderError(
      'Messages must be an array',
      ErrorCodes.INVALID_MESSAGES,
    );
  }

  return messages.map((msg, index) => {
    if (!msg || typeof msg !== 'object') {
      throw new ProviderError(
        `Message at index ${index} must be an object`,
        ErrorCodes.INVALID_MESSAGE,
      );
    }

    const { role, content } = msg;

    if (!role || !['system', 'user', 'assistant'].includes(role)) {
      throw new ProviderError(
        `Invalid role "${role}" at message index ${index}`,
        ErrorCodes.INVALID_ROLE,
      );
    }

    if (!content) {
      throw new ProviderError(
        `Message content is required at index ${index}`,
        ErrorCodes.MISSING_CONTENT,
      );
    }

    // Handle complex content structure (array with text and images)
    if (Array.isArray(content)) {
      const convertedContent = [];

      for (const item of content) {
        if (item.type === 'text') {
          convertedContent.push({
            type: 'text',
            text: item.text,
          });
        } else if (item.type === 'image' && item.source) {
          // Convert Anthropic/Claude format to OpenAI format
          convertedContent.push({
            type: 'image_url',
            image_url: {
              url: `data:${item.source.media_type};base64,${item.source.data}`,
              detail: 'auto',
            },
          });
          debugLog(
            `[${providerName}] Converting image: ${item.source.media_type}, data length: ${item.source.data.length}`,
          );
        }
      }

      return { role, content: convertedContent };
    }

    // Simple string content
    return { role, content };
  });
}

/**
 * Resolve model name using aliases
 */
function resolveModelName(modelName, supportedModels) {
  const modelNameLower = modelName.toLowerCase();

  // Check exact matches first
  for (const [supportedModel] of Object.entries(supportedModels)) {
    if (supportedModel.toLowerCase() === modelNameLower) {
      return supportedModel;
    }
  }

  // Check aliases
  for (const [supportedModel, config] of Object.entries(supportedModels)) {
    if (config.aliases) {
      for (const alias of config.aliases) {
        if (alias.toLowerCase() === modelNameLower) {
          return supportedModel;
        }
      }
    }
  }

  // Return as-is if not found
  return modelName;
}

/**
 * Handle common OpenAI-compatible API errors
 */
function handleApiError(error, providerName, resolvedModel) {
  // Extract error details from different error formats
  const status = error.response?.status || error.status;
  const errorMessage =
    error.response?.data?.error?.message || error.message || 'Unknown error';
  const errorCode = error.response?.data?.error?.code || error.code;

  // Map common error codes and status codes
  if (
    status === 401 ||
    errorCode === 'invalid_api_key' ||
    errorMessage?.includes('Invalid API key')
  ) {
    throw new ProviderError(
      `Invalid ${providerName} API key`,
      ErrorCodes.INVALID_API_KEY,
      error,
    );
  } else if (
    status === 429 ||
    error.type === 'rate_limit_error' ||
    errorCode === 'rate_limit_exceeded' ||
    errorMessage?.includes('Rate limit exceeded')
  ) {
    throw new ProviderError(
      `${providerName} rate limit exceeded`,
      ErrorCodes.RATE_LIMIT_EXCEEDED,
      error,
    );
  } else if (
    status === 403 ||
    errorCode === 'insufficient_quota' ||
    errorMessage?.includes('quota exceeded')
  ) {
    throw new ProviderError(
      `${providerName} API quota exceeded`,
      ErrorCodes.QUOTA_EXCEEDED,
      error,
    );
  } else if (
    status === 404 ||
    errorCode === 'model_not_found' ||
    (errorMessage?.includes('Model') && errorMessage?.includes('not found'))
  ) {
    throw new ProviderError(
      `Model ${resolvedModel} not found`,
      ErrorCodes.MODEL_NOT_FOUND,
      error,
    );
  } else if (
    status === 400 &&
    (errorMessage?.includes('Context length exceeded') ||
      errorMessage?.includes('context'))
  ) {
    throw new ProviderError(
      'Context length exceeded for model',
      ErrorCodes.CONTEXT_LENGTH_EXCEEDED,
      error,
    );
  } else if (
    error.type === 'invalid_request_error' ||
    (status === 400 && !errorMessage?.includes('context'))
  ) {
    throw new ProviderError(
      `Invalid request: ${errorMessage}`,
      ErrorCodes.INVALID_REQUEST,
      error,
    );
  } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
    throw new ProviderError(
      `${providerName} request timeout`,
      ErrorCodes.TIMEOUT_ERROR,
      error,
    );
  } else if (error.code?.startsWith('E') || errorMessage?.includes('network')) {
    throw new ProviderError(
      `${providerName} network error: ${errorMessage}`,
      ErrorCodes.NETWORK_ERROR,
      error,
    );
  }

  // Generic error
  throw new ProviderError(
    `${providerName} API error: ${error.message || 'Unknown error'}`,
    ErrorCodes.API_ERROR,
    error,
  );
}

/**
 * Create an OpenAI-compatible provider
 * @param {OpenAICompatibleConfig} providerConfig - Provider configuration
 * @returns {Provider} - Provider implementation
 */
export function createOpenAICompatibleProvider(providerConfig) {
  const {
    baseURL,
    apiKey,
    customHeaders = {},
    providerName = 'OpenAI-Compatible',
    supportedModels = {},
    validateApiKey = defaultValidateApiKey,
    transformRequest,
    transformResponse,
    defaultParams = {},
  } = providerConfig;

  // Create custom error class for this provider
  class CustomProviderError extends ProviderError {
    constructor(message, code, originalError = null) {
      super(message, code, originalError);
      this.name = `${providerName}ProviderError`;
    }
  }

  return {
    /**
     * Unified provider interface: invoke messages with options
     */
    async invoke(messages, options = {}) {
      const {
        model = Object.keys(supportedModels)[0], // Default to first model
        temperature = 0.7,
        maxTokens = null,
        stream = false,
        // eslint-disable-next-line no-unused-vars
        reasoning_effort = 'medium',
        // eslint-disable-next-line no-unused-vars
        use_websearch = false,
        signal,
        config,
        // Filter out options not meant for the API
        continuation_id, // eslint-disable-line no-unused-vars
        continuationStore, // eslint-disable-line no-unused-vars
        ...otherOptions
      } = options;

      // Get API key from config or use provider default
      const effectiveApiKey =
        config?.apiKeys?.[providerName.toLowerCase()] || apiKey;

      // Validate API key
      if (!effectiveApiKey) {
        throw new CustomProviderError(
          `${providerName} API key not configured`,
          ErrorCodes.MISSING_API_KEY,
        );
      }

      if (!validateApiKey(effectiveApiKey)) {
        throw new CustomProviderError(
          `Invalid ${providerName} API key format`,
          ErrorCodes.INVALID_API_KEY,
        );
      }

      // Initialize OpenAI client with custom configuration
      const clientOptions = {
        apiKey: effectiveApiKey,
        baseURL,
        defaultHeaders: {
          ...customHeaders,
          // Support dynamic headers from provider config
          ...(config?.providers?._customHeaders || {}),
        },
      };

      // Add timeout if specified in model config
      const resolvedModel = resolveModelName(model, supportedModels);
      const modelConfig = supportedModels[resolvedModel] || {};
      if (modelConfig.timeout) {
        clientOptions.timeout = modelConfig.timeout;
      }

      const openai = new OpenAI(clientOptions);

      // Convert and validate messages
      const openaiMessages = convertMessages(messages, providerName);

      // Check if messages contain images and if model supports them
      const hasImages = messages.some(
        (msg) =>
          Array.isArray(msg.content) &&
          msg.content.some((item) => item.type === 'image'),
      );

      if (hasImages && modelConfig.supportsImages === false) {
        throw new CustomProviderError(
          `Model ${resolvedModel} does not support images`,
          ErrorCodes.INVALID_REQUEST,
        );
      }

      // Build request payload
      let requestPayload = {
        model: resolvedModel,
        messages: openaiMessages,
        stream,
        ...defaultParams,
        ...otherOptions,
      };

      // Add temperature if model supports it and not already set by defaultParams
      if (
        modelConfig.supportsTemperature !== false &&
        temperature !== undefined &&
        !defaultParams.temperature
      ) {
        requestPayload.temperature = Math.max(0, Math.min(2, temperature));
      }

      // Add max tokens if specified
      if (maxTokens) {
        requestPayload.max_tokens = Math.min(
          maxTokens,
          modelConfig.maxOutputTokens || 100000,
        );
      }

      // Add usage reporting for streaming mode
      if (stream) {
        requestPayload.stream_options = { include_usage: true };
      }

      // Note: Most OpenAI-compatible APIs don't support reasoning_effort or use_websearch
      // These are silently ignored unless the provider has custom handling

      // Apply custom request transformation if provided
      if (transformRequest) {
        requestPayload = await transformRequest(requestPayload, {
          model: resolvedModel,
          modelConfig,
        });
      }

      // Handle streaming requests
      if (stream && requestPayload.stream !== false) {
        return this._createStreamingGenerator(
          openai,
          requestPayload,
          resolvedModel,
          modelConfig,
          signal,
        );
      }

      try {
        debugLog(
          `[${providerName}] Calling ${resolvedModel} with ${openaiMessages.length} messages`,
        );

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
        const response =
          await openai.chat.completions.create(requestWithSignal);

        const responseTime = Date.now() - startTime;
        debugLog(`[${providerName}] Response received in ${responseTime}ms`);

        // Extract response data
        const choice = response.choices?.[0];
        if (!choice) {
          throw new CustomProviderError(
            'No response choice received',
            ErrorCodes.NO_RESPONSE_CHOICE,
          );
        }

        const content = choice.message?.content;
        if (!content) {
          throw new CustomProviderError(
            'No content in response',
            ErrorCodes.NO_RESPONSE_CONTENT,
          );
        }

        // Extract and normalize finish reason
        const finishReason = choice.finish_reason || 'stop';
        const stopReason = normalizeStopReason(finishReason);

        // Extract usage information
        const usage = response.usage || {};

        // Build unified response
        let result = {
          content,
          stop_reason: stopReason,
          rawResponse: response,
          metadata: {
            model: response.model || resolvedModel,
            usage: {
              input_tokens: usage.prompt_tokens || usage.input_tokens || 0,
              output_tokens:
                usage.completion_tokens || usage.output_tokens || 0,
              total_tokens: usage.total_tokens || 0,
            },
            response_time_ms: responseTime,
            finish_reason: finishReason,
            provider: providerName.toLowerCase(),
          },
        };

        // Apply custom response transformation if provided
        if (transformResponse) {
          result = await transformResponse(result, response);
        }

        return result;
      } catch (error) {
        debugError(`[${providerName}] Error during API call:`, error);

        // Re-throw our own errors
        if (error instanceof CustomProviderError) {
          throw error;
        }

        handleApiError(error, providerName, resolvedModel);
      }
    },

    /**
     * Create streaming generator for OpenAI-compatible responses
     * @private
     * @param {OpenAI} openai - OpenAI client instance
     * @param {Object} requestPayload - Request payload
     * @param {string} resolvedModel - Resolved model name
     * @param {Object} modelConfig - Model configuration
     * @returns {AsyncGenerator} - Streaming generator yielding events
     */
    async *_createStreamingGenerator(
      openai,
      requestPayload,
      resolvedModel,
      modelConfig,
      signal,
    ) {
      debugLog(
        `[${providerName}] Starting streaming for ${resolvedModel} with ${requestPayload.messages?.length} messages`,
      );

      const startTime = Date.now();
      let totalContent = '';
      let lastUsage = null;
      let finishReason = null;
      let finalModel = resolvedModel;

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
          provider: providerName.toLowerCase(),
        };

        // Create streaming request with abort signal support
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
              debugLog(
                `[${providerName}] Stream aborted during processing: ${signal.reason || 'Cancelled'}`,
              );
              break;
            }
            const choice = chunk.choices?.[0];
            if (choice) {
              const content = choice.delta?.content || '';

              // Handle regular content
              if (content) {
                totalContent += content;
                yield {
                  type: 'delta',
                  content,
                  timestamp: new Date().toISOString(),
                };
              }

              // Handle reasoning/thinking content if supported
              if (choice.delta?.reasoning && modelConfig.supportsReasoning) {
                yield {
                  type: 'thinking',
                  content: choice.delta.reasoning,
                  timestamp: new Date().toISOString(),
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
          } catch (chunkError) {
            debugError(
              `[${providerName}] Error processing stream chunk:`,
              chunkError,
            );
            yield {
              type: 'error',
              error: {
                message: `Chunk processing error: ${chunkError.message}`,
                code: 'CHUNK_PROCESSING_ERROR',
                recoverable: true,
              },
              timestamp: new Date().toISOString(),
            };
          }
        }

        const responseTime = Date.now() - startTime;
        debugLog(`[${providerName}] Streaming completed in ${responseTime}ms`);

        // Yield usage information if available
        if (lastUsage) {
          yield {
            type: 'usage',
            usage: {
              input_tokens:
                lastUsage.prompt_tokens || lastUsage.input_tokens || 0,
              output_tokens:
                lastUsage.completion_tokens || lastUsage.output_tokens || 0,
              total_tokens: lastUsage.total_tokens || 0,
            },
            timestamp: new Date().toISOString(),
          };
        }

        // Apply custom response transformation to final result if provided
        let finalResult = {
          content: totalContent,
          stop_reason: normalizeStopReason(finishReason),
          metadata: {
            model: finalModel,
            usage: {
              input_tokens:
                lastUsage?.prompt_tokens || lastUsage?.input_tokens || 0,
              output_tokens:
                lastUsage?.completion_tokens || lastUsage?.output_tokens || 0,
              total_tokens: lastUsage?.total_tokens || 0,
            },
            response_time_ms: responseTime,
            finish_reason: finishReason || 'stop',
            provider: providerName.toLowerCase(),
          },
        };

        if (transformResponse) {
          const mockRawResponse = {
            choices: [{ finish_reason: finishReason }],
            usage: lastUsage,
            model: finalModel,
          };
          finalResult = await transformResponse(finalResult, mockRawResponse);
        }

        // Yield end event with final metadata
        yield {
          type: 'end',
          content: totalContent,
          stop_reason: finalResult.stop_reason,
          metadata: finalResult.metadata,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        debugError(`[${providerName}] Streaming error:`, error);

        // Handle provider-specific errors using existing error handler
        try {
          handleApiError(error, providerName, resolvedModel);
        } catch (handledError) {
          yield {
            type: 'error',
            error: {
              message: handledError.message,
              code: handledError.code || 'STREAMING_ERROR',
              recoverable: [
                ErrorCodes.RATE_LIMIT_EXCEEDED,
                ErrorCodes.TIMEOUT_ERROR,
                ErrorCodes.NETWORK_ERROR,
              ].includes(handledError.code),
              originalError: error,
            },
            timestamp: new Date().toISOString(),
          };

          // Re-throw to maintain existing error handling behavior
          throw handledError;
        }
      }
    },

    /**
     * Validate configuration
     */
    validateConfig(config) {
      const effectiveApiKey =
        config?.apiKeys?.[providerName.toLowerCase()] || apiKey;
      return !!(effectiveApiKey && validateApiKey(effectiveApiKey));
    },

    /**
     * Check if provider is available
     */
    isAvailable(config) {
      return this.validateConfig(config);
    },

    /**
     * Get supported models
     */
    getSupportedModels() {
      return supportedModels;
    },

    /**
     * Get model configuration
     */
    getModelConfig(modelName) {
      const resolved = resolveModelName(modelName, supportedModels);
      return supportedModels[resolved] || null;
    },
  };
}

/**
 * Retry helper for rate-limited requests
 */
export async function retryWithBackoff(
  fn,
  maxRetries = 3,
  initialDelay = 1000,
) {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on non-retryable errors
      if (
        error.code &&
        ![
          ErrorCodes.RATE_LIMIT_EXCEEDED,
          ErrorCodes.TIMEOUT_ERROR,
          ErrorCodes.NETWORK_ERROR,
        ].includes(error.code)
      ) {
        throw error;
      }

      // Wait before retrying
      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        debugLog(
          `Retrying after ${delay}ms (attempt ${attempt + 1}/${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
