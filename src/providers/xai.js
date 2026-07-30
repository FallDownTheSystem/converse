/**
 * XAI (Grok) Provider
 *
 * Provider implementation for XAI Grok models using the xAI Responses API
 * (`POST /v1/responses`) via the `openai` SDK pointed at `https://api.x.ai/v1`.
 * The legacy Chat Completions endpoint is deprecated for xAI: it returns no
 * reasoning content and only "function calling" for tools, so grok-4.5's
 * headline capabilities (reasoning content, native web/X search via Agent
 * Tools) are only available through the Responses API.
 *
 * Implements the unified interface: async invoke(messages, options) => { content, stop_reason, rawResponse }
 * (or an AsyncGenerator of start/delta/thinking/usage/end/error events when stream=true).
 */

import OpenAI from 'openai';
import { debugLog, debugError } from '../utils/console.js';

// Curated catalog: grok-4.5 only (verified live 2026-07-11 against
// GET https://api.x.ai/v1/models/grok-4.5 — id, aliases, 500k context).
//
// NOTE ON RETIRED IDS: xAI does NOT return a retirement error for old grok
// identifiers. Direct lookups on retired IDs return HTTP 200 but are silently
// server-remapped upstream (e.g. grok-4-0709 / grok-4-fast-* → grok-4.3,
// grok-code-fast-1 → grok-build-0.1). This contradicts the general
// "surface a clear retirement error" assumption for other providers. Explicit
// retired IDs are passed through unchanged (resolveModelName passthrough) and
// the xAI API remaps them itself — Converse never remaps client-side.
const SUPPORTED_MODELS = {
  'grok-4.5': {
    modelName: 'grok-4.5',
    friendlyName: 'X.AI (Grok 4.5)',
    contextWindow: 500000,
    // No documented output ceiling — reuse the context window as the cap.
    maxOutputTokens: 500000,
    supportsStreaming: true,
    supportsImages: true,
    supportsWebSearch: true,
    supportsReasoning: true,
    timeout: 900000, // 15 minutes
    description:
      'Grok 4.5 (500K context) - Flagship X.AI model with image input, reasoning content, and native web/X search via Agent Tools',
    aliases: ['grok', 'grok-4.5', 'grok-4.5-latest', 'grok-build-latest'],
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

  // Return as-is if not found (let XAI API handle unknown models — retired
  // grok IDs are silently server-remapped upstream, see SUPPORTED_MODELS note).
  return modelName;
}

/**
 * Map Converse reasoning_effort to a value grok-4.5 accepts.
 *
 * grok-4.5 supports ONLY low/medium/high (default high) and cannot disable
 * reasoning — there is no `none`/off value. Sending an unsupported value
 * (e.g. `none`/`minimal`/`max`) returns HTTP 400, so unsupported Converse
 * levels are clamped into {low, medium, high} rather than forwarded.
 */
function resolveReasoningEffort(reasoningEffort) {
  switch (reasoningEffort) {
  case 'none':
  case 'minimal':
  case 'low':
    return 'low';
  case 'medium':
    return 'medium';
  case 'high':
  case 'max':
    return 'high';
  default:
    return 'high';
  }
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
 * Convert messages to xAI Responses API format (input_text / input_image).
 */
function convertMessages(messages) {
  if (!Array.isArray(messages)) {
    throw new XAIProviderError('Messages must be an array', 'INVALID_MESSAGES');
  }

  return messages.map((msg, index) => {
    if (!msg || typeof msg !== 'object') {
      throw new XAIProviderError(
        `Message at index ${index} must be an object`,
        'INVALID_MESSAGE',
      );
    }

    const { role, content } = msg;

    if (!role || !['system', 'user', 'assistant'].includes(role)) {
      throw new XAIProviderError(
        `Invalid role "${role}" at message index ${index}`,
        'INVALID_ROLE',
      );
    }

    if (!content) {
      throw new XAIProviderError(
        `Message content is required at index ${index}`,
        'MISSING_CONTENT',
      );
    }

    // Handle complex content structure (array with text and images)
    if (Array.isArray(content)) {
      const convertedContent = [];

      for (const item of content) {
        if (item.type === 'text') {
          convertedContent.push({
            type: 'input_text',
            text: item.text,
          });
        } else if (item.type === 'image' && item.source) {
          // Convert Anthropic/Claude format to xAI Responses API format
          convertedContent.push({
            type: 'input_image',
            image_url: `data:${item.source.media_type};base64,${item.source.data}`,
          });
          debugLog(
            `[XAI] Converting image: ${item.source.media_type}, data length: ${item.source.data.length}`,
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
 * Extract url citations from a Responses API output (web/X search results).
 * Walks message output_text annotations for `url_citation` entries.
 */
function extractCitations(response) {
  if (!response?.output || !Array.isArray(response.output)) {
    return null;
  }

  const citations = [];
  for (const item of response.output) {
    if (item.type !== 'message' || !Array.isArray(item.content)) {
      continue;
    }
    for (const part of item.content) {
      if (!Array.isArray(part.annotations)) {
        continue;
      }
      for (const annotation of part.annotations) {
        if (annotation.type === 'url_citation') {
          citations.push({
            url: annotation.url,
            title: annotation.title,
            ...(annotation.start_index != null && {
              start_index: annotation.start_index,
            }),
            ...(annotation.end_index != null && {
              end_index: annotation.end_index,
            }),
          });
        }
      }
    }
  }

  return citations.length > 0 ? citations : null;
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
      model = 'grok-4.5',
      maxTokens = null,
      stream = false,
      reasoning_effort = 'medium',
      signal,
      config,
      // Filter out options not meant for the API
      continuation_id, // eslint-disable-line no-unused-vars
      continuationStore, // eslint-disable-line no-unused-vars
      web_search, // eslint-disable-line no-unused-vars -- xAI gates search on modelConfig, not this flag
      ...otherOptions
    } = options;

    // Validate API key
    if (!config?.apiKeys?.xai) {
      throw new XAIProviderError(
        'XAI API key not configured',
        'MISSING_API_KEY',
      );
    }

    if (!validateApiKey(config.apiKeys.xai)) {
      throw new XAIProviderError(
        'Invalid XAI API key format',
        'INVALID_API_KEY',
      );
    }

    // Get base URL from config or use default
    const baseURL = config.providers?.xaiBaseUrl || 'https://api.x.ai/v1';

    // Initialize OpenAI client with XAI base URL (drives the Responses API)
    const openai = new OpenAI({
      apiKey: config.apiKeys.xai,
      baseURL,
    });

    // Resolve model name
    const resolvedModel = resolveModelName(model);
    const modelConfig = SUPPORTED_MODELS[resolvedModel] || {};

    // Convert and validate messages to Responses API input format
    const xaiInput = convertMessages(messages);

    // Build Responses API request payload
    const requestPayload = {
      model: resolvedModel,
      input: xaiInput,
      stream,
      ...otherOptions,
    };

    // Web search via Agent Tools — attached whenever the model supports it
    // (always-on capability gate, no per-request arg). The model decides
    // per-request whether to actually search.
    if (modelConfig.supportsWebSearch) {
      requestPayload.tools = [{ type: 'web_search' }];
    }

    // Reasoning effort — capability-gated. Only attached when the resolved
    // model supports reasoning, so unknown/retired pass-through IDs (which
    // would HTTP-400 on grok-4.5 reasoning params) receive no reasoning field.
    if (modelConfig.supportsReasoning && reasoning_effort) {
      requestPayload.reasoning = {
        effort: resolveReasoningEffort(reasoning_effort),
        summary: 'auto',
      };
    }

    // Add max output tokens if specified
    if (maxTokens) {
      requestPayload.max_output_tokens = Math.min(
        maxTokens,
        modelConfig.maxOutputTokens || 500000,
      );
    }

    // If streaming is requested and model doesn't support it, fall back to non-streaming
    if (stream && modelConfig.supportsStreaming === false) {
      debugLog(
        `[XAI] Model ${resolvedModel} doesn't support streaming, falling back to non-streaming mode`,
      );
      requestPayload.stream = false;
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
        `[XAI] Calling ${resolvedModel} via Responses API with ${xaiInput.length} messages${modelConfig.supportsWebSearch ? ' (with web search)' : ''}`,
      );

      // Check if already aborted before making request
      if (signal?.aborted) {
        throw new Error(`Request aborted: ${signal.reason || 'Cancelled'}`);
      }

      const startTime = Date.now();

      // Make the API call with abort signal support
      const requestOptions = signal ? { signal } : {};
      const response = await openai.responses.create(
        requestPayload,
        requestOptions,
      );

      const responseTime = Date.now() - startTime;
      debugLog(`[XAI] Response received in ${responseTime}ms`);

      // Extract content + reasoning from the Responses API output items
      let content;
      let reasoningSummary = null;

      if (response.output && Array.isArray(response.output)) {
        const messageOutput = response.output.find(
          (item) => item.type === 'message',
        );
        const reasoningOutput = response.output.find(
          (item) => item.type === 'reasoning',
        );

        if (!messageOutput || !messageOutput.content) {
          throw new XAIProviderError(
            'No message content in Responses API response',
            'NO_RESPONSE_CONTENT',
          );
        }

        const textContent = messageOutput.content.find(
          (item) => item.type === 'output_text',
        );
        if (!textContent) {
          throw new XAIProviderError(
            'No text content in message output',
            'NO_RESPONSE_CONTENT',
          );
        }
        content = textContent.text;

        // Extract reasoning summary if present (grok-4.5 returns encrypted
        // reasoning content — only the summary is rendered).
        if (reasoningOutput && Array.isArray(reasoningOutput.summary)) {
          const summaryText = reasoningOutput.summary.find(
            (item) => item.type === 'summary_text',
          );
          if (summaryText) {
            reasoningSummary = summaryText.text;
          }
        }
      } else if (response.output_text) {
        // Legacy/simple format
        content = response.output_text;
      } else {
        throw new XAIProviderError(
          'No output in Responses API response',
          'NO_RESPONSE_CONTENT',
        );
      }

      const stopReason = response.status || 'stop';
      const usage = response.usage || {};
      const citations = extractCitations(response);

      // Return unified response format
      return {
        content,
        stop_reason: stopReason,
        rawResponse: response,
        metadata: {
          model: response.model || resolvedModel,
          usage: {
            input_tokens: usage.input_tokens || usage.prompt_tokens || 0,
            output_tokens: usage.output_tokens || usage.completion_tokens || 0,
            total_tokens: usage.total_tokens || 0,
          },
          response_time_ms: responseTime,
          finish_reason: stopReason,
          provider: 'xai',
          web_search_used: !!modelConfig.supportsWebSearch,
          ...(reasoningSummary && { reasoning: reasoningSummary }),
          ...(citations && { citations }),
        },
      };
    } catch (error) {
      debugError('[XAI] Error during API call:', error);
      throw this._normalizeError(error, resolvedModel);
    }
  },

  /**
   * Create streaming generator for XAI Responses API responses
   * @private
   * @param {OpenAI} openai - OpenAI client instance configured for XAI
   * @param {Object} requestPayload - Request payload
   * @param {string} resolvedModel - Resolved model name
   * @param {Object} modelConfig - Model configuration
   * @param {AbortSignal} signal - Abort signal
   * @returns {AsyncGenerator} - Streaming generator yielding events
   */
  async *_createStreamingGenerator(
    openai,
    requestPayload,
    resolvedModel,
    modelConfig,
    signal,
  ) {
    const searchInfo = modelConfig.supportsWebSearch ? ' (with web search)' : '';

    debugLog(
      `[XAI] Starting streaming for ${resolvedModel} via Responses API with ${requestPayload.input?.length} messages${searchInfo}`,
    );

    const startTime = Date.now();
    let totalContent = '';
    let totalReasoning = '';
    let reasoningStreamed = false;
    let lastUsage = null;
    let finishReason = null;
    let finalModel = resolvedModel;
    let citations = null;

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
        provider: 'xai',
      };

      // Create stream using the Responses API with abort signal support
      const requestOptions = signal ? { signal } : {};
      const stream = await openai.responses.create(
        requestPayload,
        requestOptions,
      );

      // Process stream chunks
      for await (const chunk of stream) {
        try {
          // Check for cancellation during stream processing
          if (signal?.aborted) {
            debugLog(
              `[XAI] Stream aborted during processing: ${signal.reason || 'Cancelled'}`,
            );
            break;
          }

          // Answer-text deltas
          if (chunk.type === 'response.output_text.delta') {
            const content = chunk.delta || '';
            if (content) {
              totalContent += content;
              yield {
                type: 'delta',
                content,
                timestamp: new Date().toISOString(),
              };
            }
          } else if (
            chunk.type === 'response.reasoning_summary_text.delta'
          ) {
            // Reasoning summary streamed incrementally — emit as thinking
            // deltas so the normalizer accumulates them separately from text.
            const summaryDelta = chunk.delta || '';
            if (summaryDelta) {
              totalReasoning += summaryDelta;
              reasoningStreamed = true;
              yield {
                type: 'thinking',
                content: summaryDelta,
                timestamp: new Date().toISOString(),
              };
            }
          } else if (
            chunk.type === 'response.reasoning_summary_part.done' ||
            chunk.type === 'response.reasoning_summary_text.done'
          ) {
            // Some responses deliver the summary only as a terminal "done"
            // event (no deltas). Emit a single thinking event in that case;
            // if deltas already streamed, skip to avoid double-counting.
            if (!reasoningStreamed) {
              const summaryText = chunk.part?.text || chunk.text || '';
              if (summaryText) {
                totalReasoning = summaryText;
                yield {
                  type: 'thinking',
                  content: summaryText,
                  timestamp: new Date().toISOString(),
                };
              }
            }
          } else if (chunk.type === 'response.completed') {
            finishReason = chunk.response?.status || 'stop';
            finalModel = chunk.response?.model || resolvedModel;
            if (chunk.response?.usage) {
              lastUsage = chunk.response.usage;
            }
            const chunkCitations = extractCitations(chunk.response);
            if (chunkCitations) {
              citations = chunkCitations;
            }
          }
        } catch (chunkError) {
          debugError('[XAI] Error processing stream chunk:', chunkError);
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
      debugLog(`[XAI] Streaming completed in ${responseTime}ms`);

      // Yield usage information if available
      if (lastUsage) {
        yield {
          type: 'usage',
          usage: {
            input_tokens: lastUsage.input_tokens || lastUsage.prompt_tokens || 0,
            output_tokens:
              lastUsage.output_tokens || lastUsage.completion_tokens || 0,
            total_tokens: lastUsage.total_tokens || 0,
          },
          timestamp: new Date().toISOString(),
        };
      }

      // Build final metadata
      const metadata = {
        model: finalModel,
        usage: {
          input_tokens: lastUsage?.input_tokens || lastUsage?.prompt_tokens || 0,
          output_tokens:
            lastUsage?.output_tokens || lastUsage?.completion_tokens || 0,
          total_tokens: lastUsage?.total_tokens || 0,
        },
        response_time_ms: responseTime,
        finish_reason: finishReason || 'stop',
        provider: 'xai',
        web_search_used: !!modelConfig.supportsWebSearch,
        ...(totalReasoning && { reasoning: totalReasoning }),
      };

      if (citations) {
        metadata.citations = citations;
      }

      // Yield end event with final metadata
      yield {
        type: 'end',
        content: totalContent,
        stop_reason: finishReason || 'stop',
        metadata,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      debugError('[XAI] Streaming error:', error);

      const normalized = this._normalizeError(error, resolvedModel);
      const recoverable = normalized.code === 'RATE_LIMIT_EXCEEDED';

      // Yield final error event
      yield {
        type: 'error',
        error: {
          message: normalized.message,
          code: normalized.code,
          recoverable,
          originalError: error.message,
        },
        timestamp: new Date().toISOString(),
      };

      // Re-throw to maintain error propagation
      throw normalized;
    }
  },

  /**
   * Normalize an SDK/API error into an XAIProviderError with a stable code.
   * @private
   */
  _normalizeError(error, resolvedModel) {
    if (error instanceof XAIProviderError) {
      return error;
    }

    if (error.code === 'insufficient_quota') {
      return new XAIProviderError('XAI API quota exceeded', 'QUOTA_EXCEEDED', error);
    } else if (error.code === 'invalid_api_key') {
      return new XAIProviderError('Invalid XAI API key', 'INVALID_API_KEY', error);
    } else if (error.code === 'model_not_found') {
      return new XAIProviderError(
        `Model ${resolvedModel} not found`,
        'MODEL_NOT_FOUND',
        error,
      );
    } else if (error.code === 'context_length_exceeded') {
      return new XAIProviderError(
        'Context length exceeded for model',
        'CONTEXT_LENGTH_EXCEEDED',
        error,
      );
    } else if (error.type === 'invalid_request_error') {
      return new XAIProviderError(
        `Invalid request: ${error.message}`,
        'INVALID_REQUEST',
        error,
      );
    } else if (error.type === 'rate_limit_error') {
      return new XAIProviderError(
        'XAI rate limit exceeded',
        'RATE_LIMIT_EXCEEDED',
        error,
      );
    }

    return new XAIProviderError(
      `XAI API error: ${error.message || 'Unknown error'}`,
      'API_ERROR',
      error,
    );
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
  },
};
