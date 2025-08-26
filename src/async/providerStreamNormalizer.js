/**
 * ProviderStreamNormalizer - Unified streaming interface for all LLM providers
 *
 * Normalizes provider-specific streaming formats into a consistent event structure:
 * - start: Stream initialization event
 * - delta: Text content chunk event
 * - usage: Token usage statistics event
 * - end: Stream completion event with final metadata
 * - error: Error event with recovery information
 *
 * This normalizer enables seamless provider switching and uniform async processing
 * across all supported LLM providers (OpenAI, Google, XAI, Anthropic, Mistral, DeepSeek, OpenRouter).
 */

import { debugLog, debugError } from '../utils/console.js';

/**
 * Unified event types for normalized streaming
 */
const EVENT_TYPES = {
  START: 'start',
  DELTA: 'delta',
  USAGE: 'usage',
  END: 'end',
  ERROR: 'error',
  REASONING_SUMMARY: 'reasoning_summary'
};

/**
 * ProviderStreamNormalizer class
 * Converts provider-specific AsyncGenerators into standardized event streams
 */
class ProviderStreamNormalizer {
  constructor() {
    // Provider normalizer registry
    this.normalizers = {
      openai: this.normalizeOpenAIStream.bind(this),
      xai: this.normalizeXAIStream.bind(this),
      google: this.normalizeGoogleStream.bind(this),
      anthropic: this.normalizeAnthropicStream.bind(this),
      mistral: this.normalizeMistralStream.bind(this),
      deepseek: this.normalizeDeepSeekStream.bind(this),
      openrouter: this.normalizeOpenRouterStream.bind(this)
    };
  }

  /**
   * Main normalization method - routes to provider-specific normalizer
   * @param {string} provider - Provider name (e.g., 'openai', 'google')
   * @param {AsyncGenerator} stream - Provider's raw streaming generator
   * @param {Object} context - Additional context (model, requestId, etc.)
   * @returns {AsyncGenerator} - Normalized event stream
   */
  async *normalize(provider, stream, context = {}) {
    const normalizedProvider = provider.toLowerCase();

    if (!this.normalizers[normalizedProvider]) {
      throw new Error(`Unsupported provider for streaming normalization: ${provider}`);
    }

    debugLog(`[StreamNormalizer] Normalizing ${provider} stream for model ${context.model || 'unknown'}`);

    try {
      // Delegate to provider-specific normalizer
      yield* this.normalizers[normalizedProvider](stream, context);
    } catch (error) {
      debugError(`[StreamNormalizer] Error during ${provider} stream normalization:`, error);

      // Yield error event before re-throwing
      yield this.createErrorEvent(error, provider);
      throw error;
    }
  }

  /**
   * Normalize OpenAI streaming format
   * Handles both Chat Completions API and Responses API formats
   */
  async *normalizeOpenAIStream(stream, context) {
    const provider = 'openai';
    const model = context.model || 'unknown';
    const startTime = Date.now();

    let hasStarted = false;
    let accumulatedContent = '';
    let accumulatedUsage = null;
    let finishReason = null;

    try {
      for await (const event of stream) {
        // Handle start event
        if (event.type === 'start' && !hasStarted) {
          hasStarted = true;
          yield this.createStartEvent(provider, model, event);
          continue;
        }

        // Handle delta events
        if (event.type === 'delta') {
          accumulatedContent += event.content || '';
          yield this.createDeltaEvent(event.content || '', provider, model);
          continue;
        }

        // Handle usage events
        if (event.type === 'usage') {
          accumulatedUsage = event.usage;
          yield this.createUsageEvent(event.usage, provider, model);
          continue;
        }

        // Handle reasoning summary events (OpenAI reasoning models)
        if (event.type === 'reasoning_summary') {
          yield this.createReasoningSummaryEvent(event.content, provider, model);
          continue;
        }

        // Handle end event
        if (event.type === 'end') {
          finishReason = event.stop_reason || event.metadata?.finish_reason;
          yield this.createEndEvent({
            content: event.content || accumulatedContent,
            stopReason: finishReason,
            usage: event.metadata?.usage || accumulatedUsage,
            responseTime: Date.now() - startTime,
            metadata: event.metadata
          }, provider, model);
          continue;
        }

        // Handle error events
        if (event.type === 'error') {
          yield this.createErrorEvent(event.error, provider, event.error?.recoverable);
          continue;
        }
      }
    } catch (error) {
      debugError('[StreamNormalizer] OpenAI stream error:', error);
      yield this.createErrorEvent(error, provider);
      throw error;
    }
  }

  /**
   * Normalize XAI streaming format (OpenAI-compatible)
   */
  async *normalizeXAIStream(stream, context) {
    const provider = 'xai';
    const model = context.model || 'unknown';
    const startTime = Date.now();

    let hasStarted = false;
    let accumulatedContent = '';
    let accumulatedUsage = null;
    let finishReason = null;
    const searchMetadata = {};

    try {
      for await (const event of stream) {
        // Handle start event
        if (event.type === 'start' && !hasStarted) {
          hasStarted = true;
          yield this.createStartEvent(provider, model, event);
          continue;
        }

        // Handle delta events
        if (event.type === 'delta') {
          accumulatedContent += event.content || '';
          yield this.createDeltaEvent(event.content || '', provider, model);
          continue;
        }

        // Handle usage events (with XAI-specific search metadata)
        if (event.type === 'usage') {
          accumulatedUsage = event.usage;
          if (event.usage.search_sources_used) {
            searchMetadata.searchSourcesUsed = event.usage.search_sources_used;
            searchMetadata.searchCostEstimate = event.usage.search_cost_estimate;
          }
          yield this.createUsageEvent(event.usage, provider, model);
          continue;
        }

        // Handle end event
        if (event.type === 'end') {
          finishReason = event.stop_reason || event.metadata?.finish_reason;
          const endMetadata = {
            ...event.metadata,
            ...searchMetadata
          };

          yield this.createEndEvent({
            content: event.content || accumulatedContent,
            stopReason: finishReason,
            usage: event.metadata?.usage || accumulatedUsage,
            responseTime: Date.now() - startTime,
            metadata: endMetadata
          }, provider, model);
          continue;
        }

        // Handle error events
        if (event.type === 'error') {
          yield this.createErrorEvent(event.error, provider, event.error?.recoverable);
          continue;
        }
      }
    } catch (error) {
      debugError('[StreamNormalizer] XAI stream error:', error);
      yield this.createErrorEvent(error, provider);
      throw error;
    }
  }

  /**
   * Normalize Google GenAI streaming format
   */
  async *normalizeGoogleStream(stream, context) {
    const provider = 'google';
    const model = context.model || 'unknown';
    const startTime = Date.now();

    let hasStarted = false;
    let accumulatedContent = '';
    let accumulatedUsage = null;
    let finishReason = null;
    let searchMetadata = {};

    try {
      for await (const event of stream) {
        // Handle start event
        if (event.type === 'start' && !hasStarted) {
          hasStarted = true;
          yield this.createStartEvent(provider, model, event);
          continue;
        }

        // Handle delta events
        if (event.type === 'delta') {
          accumulatedContent += event.content || '';
          yield this.createDeltaEvent(event.content || '', provider, model);
          continue;
        }

        // Handle usage events (with potential grounding metadata)
        if (event.type === 'usage') {
          accumulatedUsage = event.usage;
          if (event.groundingMetadata) {
            searchMetadata = event.groundingMetadata;
          }
          yield this.createUsageEvent(event.usage, provider, model);
          continue;
        }

        // Handle end event
        if (event.type === 'end') {
          finishReason = event.stop_reason || event.metadata?.finish_reason;
          const endMetadata = {
            ...event.metadata,
            ...searchMetadata
          };

          yield this.createEndEvent({
            content: event.content || accumulatedContent,
            stopReason: finishReason,
            usage: event.metadata?.usage || accumulatedUsage,
            responseTime: Date.now() - startTime,
            metadata: endMetadata
          }, provider, model);
          continue;
        }

        // Handle error events
        if (event.type === 'error') {
          yield this.createErrorEvent(event.error, provider, event.error?.recoverable);
          continue;
        }
      }
    } catch (error) {
      debugError('[StreamNormalizer] Google stream error:', error);
      yield this.createErrorEvent(error, provider);
      throw error;
    }
  }

  /**
   * Normalize Anthropic streaming format
   */
  async *normalizeAnthropicStream(stream, context) {
    const provider = 'anthropic';
    const model = context.model || 'unknown';
    const startTime = Date.now();

    let hasStarted = false;
    let accumulatedContent = '';
    let accumulatedUsage = null;
    let finishReason = null;
    const thinkingMetadata = {};

    try {
      for await (const event of stream) {
        // Handle start event
        if (event.type === 'start' && !hasStarted) {
          hasStarted = true;
          yield this.createStartEvent(provider, model, event);
          continue;
        }

        // Handle delta events (including thinking tokens)
        if (event.type === 'delta') {
          accumulatedContent += event.content || '';
          yield this.createDeltaEvent(event.content || '', provider, model, {
            isThinking: event.isThinking || false
          });
          continue;
        }

        // Handle usage events (with Anthropic-specific cache and thinking tokens)
        if (event.type === 'usage') {
          accumulatedUsage = event.usage;
          if (event.usage.thinking_tokens) {
            thinkingMetadata.thinkingTokens = event.usage.thinking_tokens;
          }
          if (event.usage.cache_creation_input_tokens || event.usage.cache_read_input_tokens) {
            thinkingMetadata.cacheUsage = {
              creation: event.usage.cache_creation_input_tokens || 0,
              read: event.usage.cache_read_input_tokens || 0
            };
          }
          yield this.createUsageEvent(event.usage, provider, model);
          continue;
        }

        // Handle end event
        if (event.type === 'end') {
          finishReason = event.stop_reason || event.metadata?.finish_reason;
          const endMetadata = {
            ...event.metadata,
            ...thinkingMetadata
          };

          yield this.createEndEvent({
            content: event.content || accumulatedContent,
            stopReason: finishReason,
            usage: event.metadata?.usage || accumulatedUsage,
            responseTime: Date.now() - startTime,
            metadata: endMetadata
          }, provider, model);
          continue;
        }

        // Handle error events
        if (event.type === 'error') {
          yield this.createErrorEvent(event.error, provider, event.error?.recoverable);
          continue;
        }
      }
    } catch (error) {
      debugError('[StreamNormalizer] Anthropic stream error:', error);
      yield this.createErrorEvent(error, provider);
      throw error;
    }
  }

  /**
   * Normalize Mistral streaming format
   */
  async *normalizeMistralStream(stream, context) {
    const provider = 'mistral';
    const model = context.model || 'unknown';
    const startTime = Date.now();

    let hasStarted = false;
    let accumulatedContent = '';
    let accumulatedUsage = null;
    let finishReason = null;

    try {
      for await (const event of stream) {
        // Handle start event
        if (event.type === 'start' && !hasStarted) {
          hasStarted = true;
          yield this.createStartEvent(provider, model, event);
          continue;
        }

        // Handle delta events
        if (event.type === 'delta') {
          accumulatedContent += event.content || '';
          yield this.createDeltaEvent(event.content || '', provider, model);
          continue;
        }

        // Handle usage events
        if (event.type === 'usage') {
          accumulatedUsage = event.usage;
          yield this.createUsageEvent(event.usage, provider, model);
          continue;
        }

        // Handle end event
        if (event.type === 'end') {
          finishReason = event.stop_reason || event.metadata?.finish_reason;
          yield this.createEndEvent({
            content: event.content || accumulatedContent,
            stopReason: finishReason,
            usage: event.metadata?.usage || accumulatedUsage,
            responseTime: Date.now() - startTime,
            metadata: event.metadata
          }, provider, model);
          continue;
        }

        // Handle error events
        if (event.type === 'error') {
          yield this.createErrorEvent(event.error, provider, event.error?.recoverable);
          continue;
        }
      }
    } catch (error) {
      debugError('[StreamNormalizer] Mistral stream error:', error);
      yield this.createErrorEvent(error, provider);
      throw error;
    }
  }

  /**
   * Normalize DeepSeek streaming format
   */
  async *normalizeDeepSeekStream(stream, context) {
    const provider = 'deepseek';
    const model = context.model || 'unknown';
    const startTime = Date.now();

    let hasStarted = false;
    let accumulatedContent = '';
    let accumulatedUsage = null;
    let finishReason = null;
    const reasoningMetadata = {};

    try {
      for await (const event of stream) {
        // Handle start event
        if (event.type === 'start' && !hasStarted) {
          hasStarted = true;
          yield this.createStartEvent(provider, model, event);
          continue;
        }

        // Handle delta events (including reasoning tokens for DeepSeek-R1)
        if (event.type === 'delta') {
          accumulatedContent += event.content || '';
          yield this.createDeltaEvent(event.content || '', provider, model, {
            isReasoning: event.isReasoning || false
          });
          continue;
        }

        // Handle usage events (with DeepSeek-specific reasoning tokens)
        if (event.type === 'usage') {
          accumulatedUsage = event.usage;
          if (event.usage.reasoning_tokens) {
            reasoningMetadata.reasoningTokens = event.usage.reasoning_tokens;
          }
          yield this.createUsageEvent(event.usage, provider, model);
          continue;
        }

        // Handle end event
        if (event.type === 'end') {
          finishReason = event.stop_reason || event.metadata?.finish_reason;
          const endMetadata = {
            ...event.metadata,
            ...reasoningMetadata
          };

          yield this.createEndEvent({
            content: event.content || accumulatedContent,
            stopReason: finishReason,
            usage: event.metadata?.usage || accumulatedUsage,
            responseTime: Date.now() - startTime,
            metadata: endMetadata
          }, provider, model);
          continue;
        }

        // Handle error events
        if (event.type === 'error') {
          yield this.createErrorEvent(event.error, provider, event.error?.recoverable);
          continue;
        }
      }
    } catch (error) {
      debugError('[StreamNormalizer] DeepSeek stream error:', error);
      yield this.createErrorEvent(error, provider);
      throw error;
    }
  }

  /**
   * Normalize OpenRouter streaming format
   */
  async *normalizeOpenRouterStream(stream, context) {
    const provider = 'openrouter';
    const model = context.model || 'unknown';
    const startTime = Date.now();

    let hasStarted = false;
    let accumulatedContent = '';
    let accumulatedUsage = null;
    let finishReason = null;
    let routingMetadata = {};

    try {
      for await (const event of stream) {
        // Handle start event
        if (event.type === 'start' && !hasStarted) {
          hasStarted = true;
          yield this.createStartEvent(provider, model, event);
          continue;
        }

        // Handle delta events
        if (event.type === 'delta') {
          accumulatedContent += event.content || '';
          yield this.createDeltaEvent(event.content || '', provider, model);
          continue;
        }

        // Handle usage events (with OpenRouter-specific routing metadata)
        if (event.type === 'usage') {
          accumulatedUsage = event.usage;
          if (event.routingInfo) {
            routingMetadata = event.routingInfo;
          }
          yield this.createUsageEvent(event.usage, provider, model);
          continue;
        }

        // Handle end event
        if (event.type === 'end') {
          finishReason = event.stop_reason || event.metadata?.finish_reason;
          const endMetadata = {
            ...event.metadata,
            ...routingMetadata
          };

          yield this.createEndEvent({
            content: event.content || accumulatedContent,
            stopReason: finishReason,
            usage: event.metadata?.usage || accumulatedUsage,
            responseTime: Date.now() - startTime,
            metadata: endMetadata
          }, provider, model);
          continue;
        }

        // Handle error events
        if (event.type === 'error') {
          yield this.createErrorEvent(event.error, provider, event.error?.recoverable);
          continue;
        }
      }
    } catch (error) {
      debugError('[StreamNormalizer] OpenRouter stream error:', error);
      yield this.createErrorEvent(error, provider);
      throw error;
    }
  }

  /**
   * Create standardized start event
   */
  createStartEvent(provider, model, originalEvent = {}) {
    return {
      type: EVENT_TYPES.START,
      provider,
      model,
      timestamp: Date.now(),
      data: {
        requestId: originalEvent.requestId || `${provider}-${Date.now()}`,
        estimatedTokens: originalEvent.estimatedTokens || null,
        ...originalEvent.data
      }
    };
  }

  /**
   * Create standardized delta event
   */
  createDeltaEvent(textDelta, provider, model, metadata = {}) {
    return {
      type: EVENT_TYPES.DELTA,
      provider,
      model,
      timestamp: Date.now(),
      data: {
        textDelta,
        role: 'assistant',
        index: 0,
        ...metadata
      }
    };
  }

  /**
   * Create standardized usage event
   */
  createUsageEvent(usage, provider, model) {
    return {
      type: EVENT_TYPES.USAGE,
      provider,
      model,
      timestamp: Date.now(),
      data: {
        usage: {
          inputTokens: usage.input_tokens || usage.prompt_tokens || 0,
          outputTokens: usage.output_tokens || usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0,
          // Preserve provider-specific usage fields
          ...usage
        }
      }
    };
  }

  /**
   * Create standardized reasoning summary event
   */
  createReasoningSummaryEvent(content, provider, model) {
    return {
      type: EVENT_TYPES.REASONING_SUMMARY,
      provider,
      model,
      timestamp: Date.now(),
      data: {
        content: content || '',
        role: 'assistant',
        isReasoningSummary: true
      }
    };
  }

  /**
   * Create standardized end event
   */
  createEndEvent(params, provider, model) {
    return {
      type: EVENT_TYPES.END,
      provider,
      model,
      timestamp: Date.now(),
      data: {
        content: params.content,
        stopReason: params.stopReason || 'stop',
        usage: {
          inputTokens: params.usage?.input_tokens || params.usage?.prompt_tokens || 0,
          outputTokens: params.usage?.output_tokens || params.usage?.completion_tokens || 0,
          totalTokens: params.usage?.total_tokens || 0,
          ...params.usage
        },
        responseTimeMs: params.responseTime,
        metadata: params.metadata || {}
      }
    };
  }

  /**
   * Create standardized error event
   */
  createErrorEvent(error, provider, recoverable = false) {
    // Determine if error is recoverable based on error type
    const isRecoverable = recoverable ||
      error.code === 'RATE_LIMIT_EXCEEDED' ||
      error.code === 'CHUNK_PROCESSING_ERROR' ||
      error.code === 'TIMEOUT' ||
      error.recoverable === true;

    return {
      type: EVENT_TYPES.ERROR,
      provider,
      model: 'unknown',
      timestamp: Date.now(),
      data: {
        error: {
          message: error.message || 'Unknown streaming error',
          code: error.code || 'STREAMING_ERROR',
          recoverable: isRecoverable,
          originalError: error
        }
      }
    };
  }

  /**
   * Validate that a stream produces valid normalized events
   * Used primarily for testing
   */
  async validateStream(stream) {
    const events = [];
    let hasStart = false;
    let hasEnd = false;
    let errorCount = 0;

    try {
      for await (const event of stream) {
        events.push(event);

        // Validate event structure
        if (!event.type || !event.provider || !event.timestamp) {
          throw new Error(`Invalid event structure: ${JSON.stringify(event)}`);
        }

        // Track event types
        if (event.type === EVENT_TYPES.START) hasStart = true;
        if (event.type === EVENT_TYPES.END) hasEnd = true;
        if (event.type === EVENT_TYPES.ERROR) errorCount++;

        // Validate event data based on type
        switch (event.type) {
        case EVENT_TYPES.START:
          if (!event.data?.requestId) {
            throw new Error('Start event missing requestId');
          }
          break;
        case EVENT_TYPES.DELTA:
          if (event.data?.textDelta === undefined) {
            throw new Error('Delta event missing textDelta');
          }
          break;
        case EVENT_TYPES.USAGE:
          if (!event.data?.usage) {
            throw new Error('Usage event missing usage data');
          }
          break;
        case EVENT_TYPES.END:
          if (event.data?.content === undefined || !event.data?.stopReason) {
            throw new Error('End event missing required fields');
          }
          break;
        case EVENT_TYPES.ERROR:
          if (!event.data?.error?.message || !event.data?.error?.code) {
            throw new Error('Error event missing required error fields');
          }
          break;
        }
      }

      return {
        valid: hasStart && hasEnd,
        events,
        hasStart,
        hasEnd,
        errorCount,
        totalEvents: events.length
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
        events,
        hasStart,
        hasEnd,
        errorCount,
        totalEvents: events.length
      };
    }
  }
}

// Create and export singleton instance
const providerStreamNormalizer = new ProviderStreamNormalizer();
export default providerStreamNormalizer;

// Named exports for testing
export { ProviderStreamNormalizer, EVENT_TYPES };
