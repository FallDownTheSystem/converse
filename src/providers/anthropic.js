/**
 * Anthropic Provider
 *
 * Provider implementation for Anthropic Claude models using the official @anthropic-ai/sdk.
 * Implements the unified interface: async invoke(messages, options) => { content, stop_reason, rawResponse }
 *
 * Note: The Anthropic SDK is ESM-only starting from v0.27.0. This provider dynamically imports
 * the SDK to maintain compatibility with CommonJS environments.
 */

import { debugLog, debugError } from '../utils/console.js';
import { ProviderError, ErrorCodes, StopReasons } from './interface.js';

// Define supported Claude models with their capabilities
const SUPPORTED_MODELS = {
  'claude-fable-5': {
    modelName: 'claude-fable-5',
    friendlyName: 'Claude Fable 5',
    contextWindow: 1000000, // 1M context by default - no beta header required
    maxOutputTokens: 128000,
    supportsStreaming: true,
    supportsImages: true,
    supportsWebSearch: false,
    supportsThinking: true,
    supportsAdaptiveThinking: true, // Adaptive thinking is the only thinking mode
    timeout: 600000,
    supportsEffort: true,
    effortGA: true,
    supportsCompaction: true,
    description:
      'Claude Fable 5 - Most capable model for the most demanding reasoning and long-horizon agentic work',
    aliases: [
      'claude-fable-5',
      'claude-fable',
      'claude-5-fable',
      'fable-5',
      'fable5',
      'fable',
    ],
  },
  'claude-opus-4-8': {
    modelName: 'claude-opus-4-8',
    friendlyName: 'Claude Opus 4.8',
    contextWindow: 200000,
    maxOutputTokens: 128000,
    supportsStreaming: true,
    supportsImages: true,
    supportsWebSearch: false,
    supportsThinking: true,
    supportsAdaptiveThinking: true,
    minThinkingTokens: 1024,
    maxThinkingTokens: 128000,
    timeout: 600000,
    supportsEffort: true,
    effortGA: true,
    supports1MContext: true,
    supportsCompaction: true,
    description:
      'Claude Opus 4.8 - Most capable model for complex reasoning and agentic coding',
    aliases: [
      'claude-opus-4-8',
      'claude-4.8-opus',
      'claude-4-8-opus',
      'opus-4.8',
      'opus-4-8',
      'opus4.8',
      'opus4-8',
      'claude-opus-4.8',
      'opus',
      'claude-opus',
    ],
  },
  'claude-opus-4-7': {
    modelName: 'claude-opus-4-7',
    friendlyName: 'Claude Opus 4.7',
    contextWindow: 200000,
    maxOutputTokens: 128000,
    supportsStreaming: true,
    supportsImages: true,
    supportsWebSearch: false,
    supportsThinking: true,
    supportsAdaptiveThinking: true,
    minThinkingTokens: 1024,
    maxThinkingTokens: 128000,
    timeout: 600000,
    supportsEffort: true,
    effortGA: true,
    supports1MContext: true,
    supportsCompaction: true,
    description:
      'Claude Opus 4.7 - Previous most capable model for complex reasoning and agentic coding',
    aliases: [
      'claude-opus-4-7',
      'claude-4.7-opus',
      'claude-4-7-opus',
      'opus-4.7',
      'opus-4-7',
      'opus4.7',
      'opus4-7',
      'claude-opus-4.7',
    ],
  },
  'claude-opus-4-6': {
    modelName: 'claude-opus-4-6',
    friendlyName: 'Claude Opus 4.6',
    contextWindow: 200000,
    maxOutputTokens: 128000,
    supportsStreaming: true,
    supportsImages: true,
    supportsWebSearch: false,
    supportsThinking: true,
    supportsAdaptiveThinking: true,
    minThinkingTokens: 1024,
    maxThinkingTokens: 128000,
    timeout: 600000,
    supportsEffort: true,
    effortGA: true,
    supports1MContext: true,
    supportsCompaction: true,
    description:
      'Claude Opus 4.6 - Previous most intelligent model with adaptive thinking and 128K output',
    aliases: [
      'claude-opus-4-6',
      'claude-4.6-opus',
      'claude-4-6-opus',
      'opus-4.6',
      'opus-4-6',
      'opus4.6',
      'opus4-6',
      'claude-opus-4.6',
    ],
  },
  'claude-opus-4-5-20251101': {
    modelName: 'claude-opus-4-5-20251101',
    friendlyName: 'Claude Opus 4.5',
    contextWindow: 200000,
    maxOutputTokens: 64000,
    supportsStreaming: true,
    supportsImages: true,
    supportsWebSearch: false,
    supportsThinking: true,
    minThinkingTokens: 1024,
    maxThinkingTokens: 64000,
    timeout: 300000,
    supportsEffort: true, // Opus 4.5 effort parameter (requires beta header)
    description:
      'Claude Opus 4.5 - Previous most intelligent model combining maximum capability with practical performance',
    aliases: [
      'claude-opus-4-5',
      'claude-4.5-opus',
      'claude-4-5-opus',
      'opus-4.5',
      'opus-4-5',
      'opus4.5',
      'opus4-5',
      'claude-opus-4.5',
    ],
  },
  'claude-opus-4-1-20250805': {
    modelName: 'claude-opus-4-1-20250805',
    friendlyName: 'Claude Opus 4.1',
    contextWindow: 200000,
    maxOutputTokens: 32000,
    supportsStreaming: true,
    supportsImages: true,
    supportsWebSearch: false,
    supportsThinking: true,
    minThinkingTokens: 1024,
    maxThinkingTokens: 32000,
    timeout: 300000,
    description:
      'Claude Opus 4.1 - Highest level of intelligence and capability with extended thinking',
    aliases: [
      'claude-opus-4-1',
      'claude-4.1-opus',
      'claude-4-1-opus',
      'opus-4.1',
      'opus-4-1',
      'claude-4-opus',
      'opus-4',
      'opus4',
      'opus4.1',
      'claude-opus-4',
      'claude-opus-4.1',
    ],
  },
  'claude-sonnet-4-6': {
    modelName: 'claude-sonnet-4-6',
    friendlyName: 'Claude Sonnet 4.6',
    contextWindow: 200000,
    maxOutputTokens: 64000,
    supportsStreaming: true,
    supportsImages: true,
    supportsWebSearch: false,
    supportsThinking: true,
    supportsAdaptiveThinking: true, // Sonnet 4.6: thinking: {type: "adaptive"} recommended
    minThinkingTokens: 1024,
    maxThinkingTokens: 64000,
    timeout: 300000,
    supportsEffort: true,
    effortGA: true, // Effort is generally available, no beta header required
    supports1MContext: true, // Beta 1M context support
    supportsCompaction: true, // Beta server-side context compaction
    description:
      'Claude Sonnet 4.6 - Best combination of speed and intelligence with adaptive thinking',
    aliases: [
      'claude-sonnet-4-6',
      'claude-4.6-sonnet',
      'claude-4-6-sonnet',
      'sonnet-4.6',
      'sonnet-4-6',
      'sonnet4.6',
      'sonnet4-6',
      'claude-sonnet-4.6',
      'sonnet',
      'claude-sonnet',
    ],
  },
  'claude-sonnet-4-5-20250929': {
    modelName: 'claude-sonnet-4-5-20250929',
    friendlyName: 'Claude Sonnet 4.5 (Legacy)',
    contextWindow: 200000,
    maxOutputTokens: 64000,
    supportsStreaming: true,
    supportsImages: true,
    supportsWebSearch: false,
    supportsThinking: true,
    minThinkingTokens: 1024,
    maxThinkingTokens: 64000,
    timeout: 300000,
    supports1MContext: true, // Beta 1M context support
    deprecated: true,
    description:
      'Claude Sonnet 4.5 (Legacy) - Use claude-sonnet-4-6 instead',
    aliases: [
      'claude-4.5-sonnet',
      'sonnet-4.5',
      'claude-sonnet-4.5',
      'sonnet4.5',
      'claude-sonnet-4-5',
    ],
  },
  'claude-haiku-4-5-20251001': {
    modelName: 'claude-haiku-4-5-20251001',
    friendlyName: 'Claude Haiku 4.5',
    contextWindow: 200000,
    maxOutputTokens: 64000,
    supportsStreaming: true,
    supportsImages: true,
    supportsWebSearch: false,
    supportsThinking: true,
    minThinkingTokens: 1024,
    maxThinkingTokens: 64000,
    timeout: 300000,
    description:
      'Claude Haiku 4.5 - Fast and intelligent model with extended thinking',
    aliases: [
      'claude-haiku-4-5',
      'claude-4.5-haiku',
      'claude-4-5-haiku',
      'haiku-4.5',
      'haiku-4-5',
      'claude-haiku-4.5',
      'haiku4.5',
      'claude-haiku-4',
      'haiku',
      'claude-haiku',
    ],
  },
};

/**
 * Map Anthropic stop reasons to unified format
 */
const STOP_REASON_MAP = {
  end_turn: StopReasons.STOP,
  max_tokens: StopReasons.LENGTH,
  stop_sequence: StopReasons.STOP,
  tool_use: StopReasons.TOOL_USE,
};

/**
 * Thinking budget percentages mapped to reasoning_effort
 */
const THINKING_BUDGETS = {
  minimal: 0.05, // 5% of max thinking tokens
  low: 0.15, // 15% of max thinking tokens
  medium: 0.33, // 33% of max thinking tokens (default)
  high: 0.67, // 67% of max thinking tokens
  max: 1.0, // 100% of max thinking tokens
};

/**
 * Effort parameter mapping for Opus 4.8, Opus 4.7, Opus 4.6, Sonnet 4.6, and Opus 4.5
 * Maps reasoning_effort values to Anthropic's effort parameter values
 */
const EFFORT_MAP = {
  none: 'low',
  minimal: 'low',
  low: 'medium',
  medium: 'high',
  high: 'xhigh',
  max: 'max',
};

/**
 * Custom error class for Anthropic provider errors
 */
class AnthropicProviderError extends ProviderError {
  constructor(message, code, originalError = null) {
    super(message, code, originalError);
    this.name = 'AnthropicProviderError';
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

  // Return as-is if not found (let Anthropic API handle unknown models)
  return modelName;
}

/**
 * Validate Anthropic API key format
 */
function validateApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }

  // Anthropic API keys typically start with 'sk-ant-' and are at least 30 characters
  return apiKey.startsWith('sk-ant-') && apiKey.length >= 30;
}

/**
 * Convert messages to Anthropic format
 * Anthropic has specific requirements:
 * - System messages must be passed separately
 * - Messages must alternate between user and assistant
 * - First message must be from user
 * - System can now be an array with cache control blocks
 */
function convertMessagesToAnthropic(messages, options = {}) {
  if (!Array.isArray(messages)) {
    throw new AnthropicProviderError(
      'Messages must be an array',
      ErrorCodes.INVALID_MESSAGES,
    );
  }

  const {
    enableSystemCache = true, // Always cache system messages by default
    cacheUserMessages = false,
    cacheMessageThreshold = 5, // Cache messages after this many turns
  } = options;
  const systemContent = [];
  let systemText = '';
  const anthropicMessages = [];

  for (const [index, msg] of messages.entries()) {
    if (!msg || typeof msg !== 'object') {
      throw new AnthropicProviderError(
        `Message at index ${index} must be an object`,
        ErrorCodes.INVALID_MESSAGE,
      );
    }

    const { role, content } = msg;

    if (!role || !['system', 'user', 'assistant'].includes(role)) {
      throw new AnthropicProviderError(
        `Invalid role "${role}" at message index ${index}`,
        ErrorCodes.INVALID_ROLE,
      );
    }

    if (!content) {
      throw new AnthropicProviderError(
        `Message content is required at index ${index}`,
        ErrorCodes.MISSING_CONTENT,
      );
    }

    if (role === 'system') {
      // Collect system messages
      systemText += (systemText ? '\n\n' : '') + content;
    } else {
      // Handle complex content structure (array with text and images)
      if (Array.isArray(content)) {
        const anthropicContent = [];

        for (const item of content) {
          if (item.type === 'text') {
            anthropicContent.push({
              type: 'text',
              text: item.text,
            });
          } else if (item.type === 'image' && item.source) {
            // Content is already in Anthropic format
            anthropicContent.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: item.source.media_type,
                data: item.source.data,
              },
            });
            debugLog(
              `[Anthropic] Processing image: ${item.source.media_type}, data length: ${item.source.data.length}`,
            );
          }
        }

        anthropicMessages.push({
          role,
          content: anthropicContent,
        });
      } else {
        // Simple string content
        anthropicMessages.push({
          role,
          content,
        });
      }
    }
  }

  // Ensure first message is from user
  if (anthropicMessages.length > 0 && anthropicMessages[0].role !== 'user') {
    throw new AnthropicProviderError(
      'First message must be from user role',
      ErrorCodes.INVALID_MESSAGE,
    );
  }

  // Ensure messages alternate between user and assistant
  for (let i = 1; i < anthropicMessages.length; i++) {
    const prevRole = anthropicMessages[i - 1].role;
    const currRole = anthropicMessages[i].role;

    if (prevRole === currRole) {
      throw new AnthropicProviderError(
        `Messages must alternate between user and assistant. Found consecutive ${currRole} messages at index ${i}`,
        ErrorCodes.INVALID_MESSAGE,
      );
    }
  }

  // Build system content based on cache enablement
  let systemResult = null;
  if (systemText) {
    if (enableSystemCache) {
      // Use array format with cache control for system prompt
      systemResult = [
        {
          type: 'text',
          text: systemText,
          cache_control: {
            type: 'ephemeral',
            ttl: '1h', // 1 hour cache duration
          },
        },
      ];
      debugLog(
        `[Anthropic] System prompt caching enabled (ephemeral with ttl-extender for 1 hour) - ${systemText.length} chars`,
      );
    } else {
      // Use simple string format without caching
      systemResult = systemText;
    }
  }

  return { systemPrompt: systemResult, messages: anthropicMessages };
}

/**
 * Calculate thinking budget for models that support it
 */
function calculateThinkingBudget(modelConfig, reasoning_effort) {
  if (!modelConfig.supportsThinking || !modelConfig.maxThinkingTokens) {
    return 0;
  }

  const budget = THINKING_BUDGETS[reasoning_effort] || THINKING_BUDGETS.medium;
  const calculatedBudget = Math.floor(modelConfig.maxThinkingTokens * budget);

  // Ensure minimum thinking tokens
  return Math.max(calculatedBudget, modelConfig.minThinkingTokens || 1024);
}

// Lazy load the Anthropic SDK (ESM module)
let AnthropicSDK = null;

async function getAnthropicSDK() {
  if (!AnthropicSDK) {
    try {
      const module = await import('@anthropic-ai/sdk');
      AnthropicSDK = module.default || module.Anthropic;
    } catch (error) {
      throw new AnthropicProviderError(
        'Failed to load Anthropic SDK. Please install @anthropic-ai/sdk',
        ErrorCodes.API_ERROR,
        error,
      );
    }
  }
  return AnthropicSDK;
}

/**
 * Main Anthropic provider implementation
 */
export const anthropicProvider = {
  /**
   * Unified provider interface: invoke messages with options
   * @param {Array} messages - Array of message objects with role and content
   * @param {Object} options - Configuration options
   * @returns {Object|AsyncGenerator} - { content, stop_reason, rawResponse } or AsyncGenerator when stream=true
   */
  async invoke(messages, options = {}) {
    const {
      model = 'claude-3-5-sonnet-20241022',
      maxTokens = null,
      stream = false,
      reasoning_effort = 'medium',
      config,
      // Note: We don't use ...otherOptions because it can include non-API parameters
      // like continuationStore that cause "Extra inputs are not permitted" errors
    } = options;

    // Validate API key
    if (!config?.apiKeys?.anthropic) {
      throw new AnthropicProviderError(
        'Anthropic API key not configured',
        ErrorCodes.MISSING_API_KEY,
      );
    }

    if (!validateApiKey(config.apiKeys.anthropic)) {
      throw new AnthropicProviderError(
        'Invalid Anthropic API key format',
        ErrorCodes.INVALID_API_KEY,
      );
    }

    // Get Anthropic SDK
    const Anthropic = await getAnthropicSDK();

    // Resolve model name first
    const resolvedModel = resolveModelName(model);
    const modelConfig = SUPPORTED_MODELS[resolvedModel] || {};

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: config.apiKeys.anthropic,
      // Increase timeout to 20 minutes for thinking models that may take longer
      timeout: 20 * 60 * 1000,
    });

    // Build beta features array for the request
    // Use both prompt caching and extended cache duration for 1-hour caching
    const betas = [
      'prompt-caching-2024-07-31',
      'extended-cache-ttl-2025-04-11',
    ];

    // Add 1M context beta feature if model supports it
    if (modelConfig.supports1MContext) {
      betas.push('context-1m-2025-08-07');
      debugLog(
        `[Anthropic] Model ${resolvedModel} supports 1M context window with beta feature`,
      );
    }

    // Add compaction beta feature if model supports it
    if (modelConfig.supportsCompaction) {
      betas.push('compact-2026-01-12');
      debugLog(
        `[Anthropic] Model ${resolvedModel} supports server-side context compaction with beta feature`,
      );
    }

    // Add effort beta feature for models that need it (not GA yet)
    if (modelConfig.supportsEffort && reasoning_effort && !modelConfig.effortGA) {
      betas.push('effort-2025-11-24');
      debugLog(
        `[Anthropic] Model ${resolvedModel} supports effort parameter with beta feature`,
      );
    } else if (modelConfig.effortGA && reasoning_effort) {
      debugLog(
        `[Anthropic] Model ${resolvedModel} using GA effort parameter (no beta header needed)`,
      );
    }

    // Convert messages to Anthropic format (system messages are always cached)
    const { systemPrompt, messages: anthropicMessages } =
      convertMessagesToAnthropic(messages);

    // Build request payload
    const requestPayload = {
      model: resolvedModel,
      messages: anthropicMessages,
      stream,
      betas, // Include beta features
    };

    // Add system prompt if present
    if (systemPrompt) {
      requestPayload.system = systemPrompt;
    }

    // Set max tokens - API requires this field
    if (maxTokens) {
      requestPayload.max_tokens = Math.min(
        maxTokens,
        modelConfig.maxOutputTokens || 8192,
      );
    } else {
      // Use model's default max output tokens
      requestPayload.max_tokens = modelConfig.maxOutputTokens || 8192;
    }

    // Add thinking configuration for models that support it
    if (modelConfig.supportsThinking && reasoning_effort) {
      if (modelConfig.supportsAdaptiveThinking) {
        // Opus 4.6 / Sonnet 4.6: Use adaptive thinking (recommended)
        // Claude dynamically decides when and how much to think
        // Effort parameter controls thinking depth
        requestPayload.thinking = {
          type: 'adaptive',
        };
        debugLog(
          `[Anthropic] Adaptive thinking enabled for ${resolvedModel} (effort controls depth via effort parameter)`,
        );
      } else {
        // Legacy models: Use budget-based thinking
        const thinkingBudget = calculateThinkingBudget(
          modelConfig,
          reasoning_effort,
        );
        debugLog(
          `[Anthropic] Model ${resolvedModel}: maxOutputTokens=${modelConfig.maxOutputTokens}, maxThinkingTokens=${modelConfig.maxThinkingTokens}, thinkingBudget=${thinkingBudget}`,
        );

        const maxTokensLimit =
          requestPayload.max_tokens ||
          (resolvedModel.includes('claude-opus-4-5')
            ? 64000
            : resolvedModel.includes('claude-opus-4')
              ? 32000
              : resolvedModel.includes('claude-sonnet-4-5') ||
                  resolvedModel.includes('claude-sonnet-4')
                ? 64000
                : modelConfig.maxOutputTokens);

        if (thinkingBudget > 0 && thinkingBudget < maxTokensLimit) {
          requestPayload.thinking = {
            type: 'enabled',
            budget_tokens: thinkingBudget,
          };
          debugLog(
            `[Anthropic] Thinking enabled with budget: ${thinkingBudget} tokens (${reasoning_effort} effort)`,
          );
        } else {
          debugLog(
            `[Anthropic] Thinking not enabled: budget ${thinkingBudget} must be < max_tokens limit ${maxTokensLimit}`,
          );
        }
      }
    }

    // Add effort parameter for models that support it (uses output_config)
    if (modelConfig.supportsEffort && reasoning_effort) {
      const effortValue = EFFORT_MAP[reasoning_effort];
      if (effortValue) {
        requestPayload.output_config = {
          ...requestPayload.output_config,
          effort: effortValue,
        };
        debugLog(
          `[Anthropic] Effort parameter set to "${effortValue}" for ${resolvedModel} (from reasoning_effort: ${reasoning_effort})`,
        );
      }
    }

    // If streaming is requested and model doesn't support it, fall back to non-streaming
    if (stream && modelConfig.supportsStreaming === false) {
      debugLog(
        `[Anthropic] Model ${resolvedModel} doesn't support streaming, falling back to non-streaming mode`,
      );
      requestPayload.stream = false;
    }

    // Handle streaming requests
    if (stream && requestPayload.stream !== false) {
      return this._createStreamingGenerator(
        anthropic,
        requestPayload,
        resolvedModel,
        modelConfig,
        reasoning_effort,
      );
    }

    try {
      debugLog(
        `[Anthropic] Calling ${resolvedModel} with ${anthropicMessages.length} messages`,
      );
      debugLog(
        '[Anthropic] Request payload:',
        JSON.stringify(
          {
            model: requestPayload.model,
            max_tokens: requestPayload.max_tokens,
            thinking: requestPayload.thinking,
            output_config: requestPayload.output_config,
            betas: requestPayload.betas,
            message_count: requestPayload.messages?.length,
            system_length: Array.isArray(requestPayload.system)
              ? requestPayload.system[0]?.text?.length
              : requestPayload.system?.length,
          },
          null,
          2,
        ),
      );
      if (systemPrompt) {
        debugLog(
          `[Anthropic] System prompt length: ${systemPrompt.length} characters`,
        );
      }

      const startTime = Date.now();

      // Make the API call - use beta endpoint when beta features are enabled
      const hasBetaFeatures = betas && betas.length > 0;
      const response = hasBetaFeatures
        ? await anthropic.beta.messages.create(requestPayload)
        : await anthropic.messages.create(requestPayload);

      const responseTime = Date.now() - startTime;
      debugLog(`[Anthropic] Response received in ${responseTime}ms`);

      // Extract response content
      let content = '';

      // Handle different content types in the response
      if (response.content && Array.isArray(response.content)) {
        for (const block of response.content) {
          if (block.type === 'text') {
            content += block.text;
          }
          // Handle other content types if needed (tool_use, etc.)
        }
      } else if (typeof response.content === 'string') {
        content = response.content;
      }

      if (!content) {
        throw new AnthropicProviderError(
          'No content in response from Anthropic',
          ErrorCodes.NO_RESPONSE_CONTENT,
        );
      }

      // Map stop reason
      const stopReason =
        STOP_REASON_MAP[response.stop_reason] || StopReasons.OTHER;

      // Extract usage information
      const usage = response.usage || {};

      // Return unified response format
      return {
        content,
        stop_reason: stopReason,
        rawResponse: response,
        metadata: {
          model: response.model || resolvedModel,
          usage: {
            input_tokens: usage.input_tokens || 0,
            output_tokens: usage.output_tokens || 0,
            total_tokens:
              (usage.input_tokens || 0) + (usage.output_tokens || 0),
            thinking_tokens: usage.thinking_input_tokens || 0,
            cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
            cache_read_input_tokens: usage.cache_read_input_tokens || 0,
          },
          response_time_ms: responseTime,
          finish_reason: response.stop_reason,
          provider: 'anthropic',
          reasoning_effort: modelConfig.supportsThinking
            ? reasoning_effort
            : null,
        },
      };
    } catch (error) {
      debugError('[Anthropic] Error during API call:', error);

      // Re-throw our own errors
      if (error instanceof AnthropicProviderError) {
        throw error;
      }

      // Handle specific Anthropic errors
      if (error.status === 401) {
        throw new AnthropicProviderError(
          'Invalid Anthropic API key',
          ErrorCodes.INVALID_API_KEY,
          error,
        );
      } else if (error.status === 429) {
        throw new AnthropicProviderError(
          'Anthropic rate limit exceeded',
          ErrorCodes.RATE_LIMIT_EXCEEDED,
          error,
        );
      } else if (error.status === 403) {
        throw new AnthropicProviderError(
          'Anthropic API quota exceeded or forbidden',
          ErrorCodes.QUOTA_EXCEEDED,
          error,
        );
      } else if (error.error?.type === 'invalid_request_error') {
        throw new AnthropicProviderError(
          `Invalid request: ${error.error.message}`,
          ErrorCodes.INVALID_REQUEST,
          error,
        );
      } else if (error.error?.type === 'not_found_error') {
        throw new AnthropicProviderError(
          `Model ${resolvedModel} not found`,
          ErrorCodes.MODEL_NOT_FOUND,
          error,
        );
      } else if (
        error.message?.includes('context length') ||
        error.message?.includes('context_length') ||
        (error.message?.includes('token') && error.message?.includes('limit'))
      ) {
        debugError('[Anthropic] Context length error - Full error:', error);
        debugError('[Anthropic] Error message:', error.message);
        debugError('[Anthropic] Error response:', error.response);
        throw new AnthropicProviderError(
          `Context length exceeded for model: ${error.message}`,
          ErrorCodes.CONTEXT_LENGTH_EXCEEDED,
          error,
        );
      }

      // Generic error handling
      throw new AnthropicProviderError(
        `Anthropic API error: ${error.message || 'Unknown error'}`,
        ErrorCodes.API_ERROR,
        error,
      );
    }
  },

  /**
   * Create streaming generator for Anthropic responses
   * @private
   * @param {Anthropic} anthropic - Anthropic client instance
   * @param {Object} requestPayload - Request payload
   * @param {string} resolvedModel - Resolved model name
   * @param {Object} modelConfig - Model configuration
   * @param {string} reasoning_effort - Reasoning effort level
   * @returns {AsyncGenerator} - Async generator yielding streaming events
   */
  async *_createStreamingGenerator(
    anthropic,
    requestPayload,
    resolvedModel,
    modelConfig,
    reasoning_effort,
  ) {
    debugLog(
      `[Anthropic] Starting streaming for ${resolvedModel} with ${requestPayload.messages?.length} messages`,
    );

    const startTime = Date.now();
    let totalContent = '';
    let thinkingContent = '';
    let lastUsage = null;
    let finishReason = null;

    try {
      // Yield start event
      yield {
        type: 'start',
        timestamp: new Date().toISOString(),
        model: resolvedModel,
        provider: 'anthropic',
        thinking_mode: modelConfig.supportsThinking && !!reasoning_effort,
      };

      // Enable streaming in request payload
      const streamingPayload = { ...requestPayload, stream: true };

      // Create the streaming request - use beta endpoint when beta features are enabled
      const hasBetaFeatures =
        requestPayload.betas && requestPayload.betas.length > 0;
      const stream = hasBetaFeatures
        ? await anthropic.beta.messages.create(streamingPayload)
        : await anthropic.messages.create(streamingPayload);

      // Process stream events
      for await (const event of stream) {
        try {
          switch (event.type) {
          case 'message_start':
            // Initial message with metadata
            if (event.message?.usage) {
              lastUsage = event.message.usage;
            }
            break;

          case 'content_block_start':
            // Content block started (text, thinking, etc.)
            debugLog(
              `[Anthropic] Content block started: ${event.content_block?.type}`,
            );
            break;

          case 'content_block_delta':
            // Process content deltas
            if (event.delta?.type === 'text_delta') {
              const content = event.delta.text || '';
              if (content) {
                totalContent += content;
                yield {
                  type: 'delta',
                  content,
                  timestamp: new Date().toISOString(),
                };
              }
            } else if (event.delta?.type === 'thinking_delta') {
              // Handle thinking content separately
              const thinking = event.delta.thinking || '';
              if (thinking) {
                thinkingContent += thinking;
                // Optionally yield thinking deltas for debugging
                debugLog(
                  `[Anthropic] Thinking delta: ${thinking.substring(0, 100)}...`,
                );
              }
            }
            break;

          case 'content_block_stop':
            // Content block completed
            debugLog(
              `[Anthropic] Content block stopped at index ${event.index}`,
            );
            break;

          case 'message_delta':
            // Message-level updates (usage, stop_reason)
            if (event.delta?.stop_reason) {
              finishReason = event.delta.stop_reason;
            }
            if (event.usage) {
              lastUsage = event.usage;
            }
            break;

          case 'message_stop':
            // Final event - streaming completed
            debugLog('[Anthropic] Streaming completed');
            break;

          case 'ping':
            // Keep-alive events - ignore
            break;

          case 'error':
            // Handle error events from the stream
            throw new AnthropicProviderError(
              `Streaming error: ${event.error?.message || 'Unknown streaming error'}`,
              ErrorCodes.API_ERROR,
              event.error,
            );

          default:
            debugLog(
              `[Anthropic] Unknown streaming event type: ${event.type}`,
            );
            break;
          }
        } catch (eventError) {
          debugError('[Anthropic] Error processing stream event:', eventError);
          yield {
            type: 'error',
            error: {
              message: `Event processing error: ${eventError.message}`,
              code: 'EVENT_PROCESSING_ERROR',
              recoverable: true,
            },
            timestamp: new Date().toISOString(),
          };
        }
      }

      const responseTime = Date.now() - startTime;
      debugLog(`[Anthropic] Streaming completed in ${responseTime}ms`);

      // Yield usage information if available
      if (lastUsage) {
        yield {
          type: 'usage',
          usage: {
            input_tokens: lastUsage.input_tokens || 0,
            output_tokens: lastUsage.output_tokens || 0,
            total_tokens:
              (lastUsage.input_tokens || 0) + (lastUsage.output_tokens || 0),
            thinking_tokens: lastUsage.thinking_input_tokens || 0,
            cache_creation_input_tokens:
              lastUsage.cache_creation_input_tokens || 0,
            cache_read_input_tokens: lastUsage.cache_read_input_tokens || 0,
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
            input_tokens: lastUsage?.input_tokens || 0,
            output_tokens: lastUsage?.output_tokens || 0,
            total_tokens:
              (lastUsage?.input_tokens || 0) + (lastUsage?.output_tokens || 0),
            thinking_tokens: lastUsage?.thinking_input_tokens || 0,
            cache_creation_input_tokens:
              lastUsage?.cache_creation_input_tokens || 0,
            cache_read_input_tokens: lastUsage?.cache_read_input_tokens || 0,
          },
          response_time_ms: responseTime,
          finish_reason: finishReason,
          provider: 'anthropic',
          reasoning_effort: modelConfig.supportsThinking
            ? reasoning_effort
            : null,
          thinking_content: thinkingContent || null,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      debugError('[Anthropic] Streaming error:', error);

      // Handle specific Anthropic errors in streaming context
      let errorCode = 'STREAMING_ERROR';
      let errorMessage = `Anthropic streaming error: ${error.message || 'Unknown error'}`;
      let recoverable = false;

      if (error instanceof AnthropicProviderError) {
        // Re-throw our own errors
        errorCode = error.code;
        errorMessage = error.message;
      } else if (error.status === 401) {
        errorCode = 'INVALID_API_KEY';
        errorMessage = 'Invalid Anthropic API key';
      } else if (error.status === 429) {
        errorCode = 'RATE_LIMIT_EXCEEDED';
        errorMessage = 'Anthropic rate limit exceeded';
        recoverable = true;
      } else if (error.status === 403) {
        errorCode = 'QUOTA_EXCEEDED';
        errorMessage = 'Anthropic API quota exceeded or forbidden';
      } else if (error.error?.type === 'invalid_request_error') {
        errorCode = 'INVALID_REQUEST';
        errorMessage = `Invalid request: ${error.error.message}`;
      } else if (error.error?.type === 'not_found_error') {
        errorCode = 'MODEL_NOT_FOUND';
        errorMessage = `Model ${resolvedModel} not found`;
      } else if (
        error.message?.includes('context length') ||
        error.message?.includes('context_length') ||
        (error.message?.includes('token') && error.message?.includes('limit'))
      ) {
        errorCode = 'CONTEXT_LENGTH_EXCEEDED';
        errorMessage = `Context length exceeded for model: ${error.message}`;
      }

      yield {
        type: 'error',
        error: {
          message: errorMessage,
          code: errorCode,
          recoverable,
          originalError: error,
        },
        timestamp: new Date().toISOString(),
      };

      // Re-throw the error to maintain existing error handling behavior
      throw new AnthropicProviderError(errorMessage, errorCode, error);
    }
  },

  /**
   * Validate configuration for Anthropic provider
   * @param {Object} config - Configuration object
   * @returns {boolean} - True if configuration is valid
   */
  validateConfig(config) {
    return !!(
      config?.apiKeys?.anthropic && validateApiKey(config.apiKeys.anthropic)
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
