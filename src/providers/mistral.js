/**
 * Mistral Provider
 *
 * Provider implementation for Mistral AI models using the official @mistralai/mistralai SDK.
 * Implements the unified interface: async invoke(messages, options) => { content, stop_reason, rawResponse }
 */

import { debugLog, debugError } from '../utils/console.js';
import { ProviderError, ErrorCodes, StopReasons } from './interface.js';

// Define supported Mistral models with their capabilities.
// Reasoning (`reasoning_effort`) is supported only on Medium 3.5 and Small 4;
// Mistral Large 3 has no adjustable reasoning (see resolveReasoningEffort).
const SUPPORTED_MODELS = {
  'mistral-medium-3-5': {
    modelName: 'mistral-medium-3-5',
    friendlyName: 'Mistral Medium 3.5',
    contextWindow: 262144,
    maxOutputTokens: 32768,
    supportsStreaming: true,
    supportsImages: true,
    supportsWebSearch: false,
    supportsReasoning: true,
    timeout: 900000,
    description:
      'Mistral Medium 3.5 - Frontier-class multimodal model with adjustable reasoning',
    aliases: [
      'mistral',
      'mistral-medium',
      'mistral-medium-latest',
      'mistral-medium-3.5',
    ],
  },
  'mistral-small-2603': {
    modelName: 'mistral-small-2603',
    friendlyName: 'Mistral Small 4',
    contextWindow: 262144,
    maxOutputTokens: 32768,
    supportsStreaming: true,
    supportsImages: true,
    supportsWebSearch: false,
    supportsReasoning: true,
    timeout: 540000,
    description:
      'Mistral Small 4 - Hybrid multimodal model unifying instruct, reasoning, and coding',
    aliases: ['mistral-small', 'mistral-small-latest'],
  },
  'mistral-large-2512': {
    modelName: 'mistral-large-2512',
    friendlyName: 'Mistral Large 3',
    contextWindow: 262144,
    maxOutputTokens: 32768,
    supportsStreaming: true,
    supportsImages: true,
    supportsWebSearch: false,
    supportsReasoning: false,
    timeout: 900000,
    description:
      'Mistral Large 3 - Open-weight MoE flagship (no adjustable reasoning)',
    aliases: ['mistral-large', 'mistral-large-latest'],
  },
};

/**
 * Map a Converse reasoning_effort level to Mistral's documented request value.
 * Mistral documents only "high" and "none". Every enabled level maps to "high"
 * to preserve enabled-reasoning intent (Converse's default `medium` runs
 * thinking-on); only `none` disables. Returns null when reasoning must not be
 * forwarded — i.e. the model does not support it (Large 3) or is an unknown
 * pass-through ID (capability-gated).
 */
function resolveReasoningEffort(level, modelConfig) {
  if (!modelConfig?.supportsReasoning) {
    return null;
  }
  return level === 'none' ? 'none' : 'high';
}

/**
 * Walk a Mistral `message.content` array, separating reasoning (ThinkChunk)
 * from the visible answer (TextChunk). A ReferenceChunk carries citation
 * metadata only (reference_ids, no visible text) and is ignored for text.
 * Any other content-bearing chunk type is unexpected and raises.
 * @returns {{ text: string, reasoning: string }}
 */
function normalizeContentChunks(content) {
  let text = '';
  let reasoning = '';

  for (const chunk of content) {
    const type = chunk?.type;
    if (type === 'thinking') {
      for (const inner of chunk.thinking || []) {
        if (inner?.type === 'text') {
          reasoning += inner.text || '';
        }
      }
    } else if (type === 'text') {
      text += chunk.text || '';
    } else if (type === 'reference') {
      // Citation metadata (reference_ids) — no visible text; ignore.
    } else {
      throw new MistralProviderError(
        `Unexpected Mistral content chunk type "${type}"`,
        ErrorCodes.API_ERROR,
      );
    }
  }

  return { text, reasoning };
}

/**
 * Convert one streaming `delta.content` array into ordered normalized events.
 * ThinkChunk → thinking, TextChunk → delta, ReferenceChunk → ignored. Unknown
 * chunk types in a streamed delta are skipped (non-fatal) rather than aborting
 * an in-flight stream.
 * @returns {Array<{ kind: 'delta'|'thinking', text: string }>}
 */
function streamEventsFromDelta(delta) {
  const events = [];

  for (const chunk of delta) {
    const type = chunk?.type;
    if (type === 'thinking') {
      let thinkText = '';
      for (const inner of chunk.thinking || []) {
        if (inner?.type === 'text') {
          thinkText += inner.text || '';
        }
      }
      if (thinkText) {
        events.push({ kind: 'thinking', text: thinkText });
      }
    } else if (type === 'text') {
      if (chunk.text) {
        events.push({ kind: 'delta', text: chunk.text });
      }
    }
    // ReferenceChunk and any unknown chunk type carry no visible delta text.
  }

  return events;
}

/**
 * Map Mistral finish reasons to unified format
 */
const STOP_REASON_MAP = {
  stop: StopReasons.STOP,
  length: StopReasons.LENGTH,
  model_length: StopReasons.LENGTH,
  tool_calls: StopReasons.TOOL_USE,
  error: StopReasons.ERROR,
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
    throw new MistralProviderError(
      'Messages must be an array',
      ErrorCodes.INVALID_MESSAGES,
    );
  }

  return messages.map((msg, index) => {
    if (!msg || typeof msg !== 'object') {
      throw new MistralProviderError(
        `Message at index ${index} must be an object`,
        ErrorCodes.INVALID_MESSAGE,
      );
    }

    const { role, content } = msg;

    if (!role || !['system', 'user', 'assistant'].includes(role)) {
      throw new MistralProviderError(
        `Invalid role "${role}" at message index ${index}`,
        ErrorCodes.INVALID_ROLE,
      );
    }

    if (!content) {
      throw new MistralProviderError(
        `Message content is required at index ${index}`,
        ErrorCodes.MISSING_CONTENT,
      );
    }

    // Handle complex content structure (array with text and images)
    if (Array.isArray(content)) {
      const mistralContent = [];

      for (const item of content) {
        if (item.type === 'text') {
          mistralContent.push({
            type: 'text',
            text: item.text,
          });
        } else if (item.type === 'image' && item.source) {
          // Convert Anthropic/Claude format to Mistral format
          mistralContent.push({
            type: 'image_url',
            imageUrl: `data:${item.source.media_type};base64,${item.source.data}`,
          });
          debugLog(
            `[Mistral] Converting image: ${item.source.media_type}, data length: ${item.source.data.length}`,
          );
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
        error,
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
    rateLimitInfo.reset = new Date(
      parseInt(headers['x-ratelimit-reset']) * 1000,
    );
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
   * @returns {Object|AsyncGenerator} - { content, stop_reason, rawResponse } or AsyncGenerator when stream=true
   */
  async invoke(messages, options = {}) {
    const {
      model = 'mistral-medium-3-5',
      maxTokens = null,
      stream = false,
      reasoning_effort = 'medium',
      config,
      // Filter out options not meant for the API
      web_search, // eslint-disable-line no-unused-vars
      continuation_id, // eslint-disable-line no-unused-vars
      continuationStore, // eslint-disable-line no-unused-vars
      ...otherOptions
    } = options;

    // Validate API key
    if (!config?.apiKeys?.mistral) {
      throw new MistralProviderError(
        'Mistral API key not configured',
        ErrorCodes.MISSING_API_KEY,
      );
    }

    if (!validateApiKey(config.apiKeys.mistral)) {
      throw new MistralProviderError(
        'Invalid Mistral API key format',
        ErrorCodes.INVALID_API_KEY,
      );
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
    const hasImages = messages.some(
      (msg) =>
        Array.isArray(msg.content) &&
        msg.content.some((item) => item.type === 'image'),
    );

    if (hasImages && !modelConfig.supportsImages) {
      throw new MistralProviderError(
        `Model ${resolvedModel} does not support images`,
        ErrorCodes.INVALID_REQUEST,
      );
    }

    // Build request payload
    const requestPayload = {
      model: resolvedModel,
      messages: mistralMessages,
      stream,
      ...otherOptions,
    };

    // Forward reasoning effort only when the resolved model supports it
    // (Mistral Large 3 and unknown pass-through IDs receive no reasoning param).
    const reasoningEffort = resolveReasoningEffort(reasoning_effort, modelConfig);
    if (reasoningEffort) {
      requestPayload.reasoning_effort = reasoningEffort;
    }

    // Add max tokens if specified
    if (maxTokens) {
      const tokenLimit = Math.min(
        maxTokens,
        modelConfig.maxOutputTokens || 32768,
      );
      requestPayload.max_tokens = tokenLimit; // Standard parameter name
      requestPayload.maxTokens = tokenLimit; // Alternative parameter name
    }

    // Handle streaming requests
    if (stream && modelConfig.supportsStreaming !== false) {
      return this._createStreamingGenerator(
        mistral,
        requestPayload,
        resolvedModel,
        modelConfig,
      );
    }

    try {
      debugLog(
        `[Mistral] Calling ${resolvedModel} with ${mistralMessages.length} messages`,
      );

      const startTime = Date.now();

      // Make the API call
      const response = await mistral.chat.complete(requestPayload);

      const responseTime = Date.now() - startTime;
      debugLog(`[Mistral] Response received in ${responseTime}ms`);

      // Extract response data
      const choice = response.choices?.[0];
      if (!choice) {
        throw new MistralProviderError(
          'No response choice received from Mistral',
          ErrorCodes.NO_RESPONSE_CHOICE,
        );
      }

      // Content may be a plain string or an array of ThinkChunk/TextChunk/
      // ReferenceChunk (when reasoning_effort="high" or citations are used).
      const rawContent = choice.message?.content;
      let content = '';
      let reasoningContent = '';
      if (typeof rawContent === 'string') {
        content = rawContent;
      } else if (Array.isArray(rawContent)) {
        const parsed = normalizeContentChunks(rawContent);
        content = parsed.text;
        reasoningContent = parsed.reasoning;
      }

      // A reasoning turn may carry empty visible content but present reasoning
      // or tool calls — accept those (an empty tool_calls array does not count).
      const toolCalls = choice.message?.tool_calls;
      const hasToolCalls = Array.isArray(toolCalls) && toolCalls.length > 0;
      if (!content && !reasoningContent && !hasToolCalls) {
        throw new MistralProviderError(
          'No content in response from Mistral',
          ErrorCodes.NO_RESPONSE_CONTENT,
        );
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
            total_tokens: usage.total_tokens || 0,
          },
          response_time_ms: responseTime,
          finish_reason: finishReason,
          provider: 'mistral',
          rate_limit: rateLimitInfo,
          ...(reasoningContent && { reasoning_content: reasoningContent }),
        },
      };
    } catch (error) {
      debugError('[Mistral] Error during API call:', error);

      // Re-throw our own errors
      if (error instanceof MistralProviderError) {
        throw error;
      }

      // Handle specific Mistral errors
      if (error.status === 401 || error.message?.includes('Unauthorized')) {
        throw new MistralProviderError(
          'Invalid Mistral API key',
          ErrorCodes.INVALID_API_KEY,
          error,
        );
      } else if (
        error.status === 429 ||
        error.message?.includes('rate limit')
      ) {
        throw new MistralProviderError(
          'Mistral rate limit exceeded',
          ErrorCodes.RATE_LIMIT_EXCEEDED,
          error,
        );
      } else if (error.status === 403 || error.message?.includes('quota')) {
        throw new MistralProviderError(
          'Mistral API quota exceeded',
          ErrorCodes.QUOTA_EXCEEDED,
          error,
        );
      } else if (error.status === 404 || error.message?.includes('model')) {
        throw new MistralProviderError(
          `Model ${resolvedModel} not found`,
          ErrorCodes.MODEL_NOT_FOUND,
          error,
        );
      } else if (
        error.status === 400 ||
        error.message?.includes('Invalid request')
      ) {
        throw new MistralProviderError(
          `Invalid request: ${error.message}`,
          ErrorCodes.INVALID_REQUEST,
          error,
        );
      } else if (
        error.message?.includes('Context length exceeded') ||
        error.message?.includes('context')
      ) {
        throw new MistralProviderError(
          'Context length exceeded for model',
          ErrorCodes.CONTEXT_LENGTH_EXCEEDED,
          error,
        );
      }

      // Generic error handling
      throw new MistralProviderError(
        `Mistral API error: ${error.message || 'Unknown error'}`,
        ErrorCodes.API_ERROR,
        error,
      );
    }
  },

  /**
   * Create streaming generator for Mistral responses
   * @param {Object} mistral - Mistral client instance
   * @param {Object} requestPayload - Request payload for the API
   * @param {string} resolvedModel - Resolved model name
   * @param {Object} _modelConfig - Model configuration (reserved)
   * @returns {AsyncGenerator} - Streaming generator yielding events
   */
  async *_createStreamingGenerator(
    mistral,
    requestPayload,
    resolvedModel,
    _modelConfig,
  ) {
    debugLog(
      `[Mistral] Starting streaming for ${resolvedModel} with ${requestPayload.messages?.length} messages`,
    );

    const startTime = Date.now();
    let totalContent = '';
    let finalUsage = null;
    let finishReason = null;

    try {
      // Yield start event
      yield {
        type: 'start',
        timestamp: new Date().toISOString(),
        model: resolvedModel,
        provider: 'mistral',
      };

      // Create stream using Mistral SDK's streaming API
      const stream = await mistral.chat.stream(requestPayload);

      // Process streaming chunks
      for await (const chunk of stream) {
        try {
          // Mistral wraps the response in a "data" field
          const chunkData = chunk.data || chunk;

          // Extract content from the chunk. delta.content may be a plain
          // string (answer phase / reasoning_effort="none"), a list of
          // ThinkChunks (thinking phase), or a mixed list carrying a closing
          // ThinkChunk plus the first TextChunk in one delta (transition).
          const choice = chunkData.choices?.[0];
          if (choice) {
            const delta = choice.delta?.content;
            if (typeof delta === 'string') {
              if (delta) {
                totalContent += delta;
                yield {
                  type: 'delta',
                  content: delta,
                  timestamp: new Date().toISOString(),
                };
              }
            } else if (Array.isArray(delta)) {
              for (const event of streamEventsFromDelta(delta)) {
                if (event.kind === 'delta') {
                  totalContent += event.text;
                  yield {
                    type: 'delta',
                    content: event.text,
                    timestamp: new Date().toISOString(),
                  };
                } else {
                  yield {
                    type: 'thinking',
                    content: event.text,
                    timestamp: new Date().toISOString(),
                  };
                }
              }
            }

            // Capture finish reason when available
            if (choice.finish_reason || choice.finishReason) {
              finishReason = choice.finish_reason || choice.finishReason;
            }
          }

          // Handle usage information (typically in final chunk)
          if (chunkData.usage) {
            finalUsage = chunkData.usage;
          }

          // Break if we have a finish reason indicating completion
          if (
            finishReason &&
            finishReason !== null &&
            finishReason !== 'null'
          ) {
            break;
          }
        } catch (chunkError) {
          debugError('[Mistral] Error processing stream chunk:', chunkError);
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
      debugLog(`[Mistral] Streaming completed in ${responseTime}ms`);

      // Yield usage information if available
      if (finalUsage) {
        yield {
          type: 'usage',
          usage: {
            input_tokens: finalUsage.prompt_tokens || 0,
            output_tokens: finalUsage.completion_tokens || 0,
            total_tokens: finalUsage.total_tokens || 0,
          },
          timestamp: new Date().toISOString(),
        };
      }

      // Yield end event with final metadata
      yield {
        type: 'end',
        content: totalContent,
        stop_reason: STOP_REASON_MAP[finishReason] || StopReasons.OTHER,
        metadata: {
          model: resolvedModel,
          usage: {
            input_tokens: finalUsage?.prompt_tokens || 0,
            output_tokens: finalUsage?.completion_tokens || 0,
            total_tokens: finalUsage?.total_tokens || 0,
          },
          response_time_ms: responseTime,
          finish_reason: finishReason || 'stop',
          provider: 'mistral',
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      debugError('[Mistral] Streaming error:', error);

      // Handle specific Mistral errors in streaming context
      let errorCode = ErrorCodes.API_ERROR;
      let errorMessage = `Mistral streaming error: ${error.message || 'Unknown error'}`;
      let recoverable = false;

      if (error.status === 401 || error.message?.includes('Unauthorized')) {
        errorCode = ErrorCodes.INVALID_API_KEY;
        errorMessage = 'Invalid Mistral API key';
      } else if (
        error.status === 429 ||
        error.message?.includes('rate limit')
      ) {
        errorCode = ErrorCodes.RATE_LIMIT_EXCEEDED;
        errorMessage = 'Mistral rate limit exceeded';
        recoverable = true;
      } else if (error.status === 403 || error.message?.includes('quota')) {
        errorCode = ErrorCodes.QUOTA_EXCEEDED;
        errorMessage = 'Mistral API quota exceeded';
      } else if (error.status === 404 || error.message?.includes('model')) {
        errorCode = ErrorCodes.MODEL_NOT_FOUND;
        errorMessage = `Model ${resolvedModel} not found`;
      } else if (
        error.message?.includes('Context length exceeded') ||
        error.message?.includes('context')
      ) {
        errorCode = ErrorCodes.CONTEXT_LENGTH_EXCEEDED;
        errorMessage = 'Context length exceeded for model';
      }

      yield {
        type: 'error',
        error: {
          message: errorMessage,
          code: errorCode,
          recoverable,
        },
        timestamp: new Date().toISOString(),
      };

      // Re-throw as MistralProviderError for consistency
      throw new MistralProviderError(errorMessage, errorCode, error);
    }
  },

  /**
   * Validate configuration for Mistral provider
   * @param {Object} config - Configuration object
   * @returns {boolean} - True if configuration is valid
   */
  validateConfig(config) {
    return !!(
      config?.apiKeys?.mistral && validateApiKey(config.apiKeys.mistral)
    );
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
  },
};
