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
  'claude-opus-4-20250514': {
    modelName: 'claude-opus-4-20250514',
    friendlyName: 'Claude Opus 4',
    contextWindow: 200000,
    maxOutputTokens: 32000,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: false,
    supportsThinking: true,
    minThinkingTokens: 1024,
    maxThinkingTokens: 32000,
    timeout: 300000,
    description: 'Claude Opus 4 - Highest level of intelligence and capability with extended thinking',
    aliases: ['claude-4-opus', 'opus-4', 'opus', 'claude-opus']
  },
  'claude-sonnet-4-20250514': {
    modelName: 'claude-sonnet-4-20250514',
    friendlyName: 'Claude Sonnet 4',
    contextWindow: 200000,
    maxOutputTokens: 64000,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: false,
    supportsThinking: true,
    minThinkingTokens: 1024,
    maxThinkingTokens: 64000,
    timeout: 300000,
    description: 'Claude Sonnet 4 - High intelligence and balanced performance with extended thinking',
    aliases: ['claude-4-sonnet', 'sonnet-4', 'sonnet', 'claude-sonnet']
  },
  'claude-3-7-sonnet-20250219': {
    modelName: 'claude-3-7-sonnet-20250219',
    friendlyName: 'Claude 3.7 Sonnet',
    contextWindow: 200000,
    maxOutputTokens: 64000,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: false,
    supportsThinking: true,
    minThinkingTokens: 1024,
    maxThinkingTokens: 64000,
    timeout: 300000,
    description: 'Claude 3.7 Sonnet - Enhanced 3.x generation with thinking',
    aliases: ['claude-3.7-sonnet', 'sonnet-3.7']
  },
  'claude-3-5-sonnet-20241022': {
    modelName: 'claude-3-5-sonnet-20241022',
    friendlyName: 'Claude 3.5 Sonnet',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: false,
    supportsThinking: false,
    timeout: 300000,
    description: 'Claude 3.5 Sonnet - Fast and intelligent model',
    aliases: ['claude-3.5-sonnet', 'claude-3-5-sonnet-latest']
  },
  'claude-3-5-haiku-20241022': {
    modelName: 'claude-3-5-haiku-20241022',
    friendlyName: 'Claude 3.5 Haiku',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsImages: false,
    supportsTemperature: true,
    supportsWebSearch: false,
    supportsThinking: false,
    timeout: 180000,
    description: 'Claude 3.5 Haiku - Fastest model, best for simple queries',
    aliases: ['claude-3.5-haiku', 'claude-3-5-haiku-latest', 'haiku', 'claude-haiku']
  }
};

/**
 * Map Anthropic stop reasons to unified format
 */
const STOP_REASON_MAP = {
  'end_turn': StopReasons.STOP,
  'max_tokens': StopReasons.LENGTH,
  'stop_sequence': StopReasons.STOP,
  'tool_use': StopReasons.TOOL_USE
};

/**
 * Thinking budget percentages mapped to reasoning_effort
 */
const THINKING_BUDGETS = {
  minimal: 0.05,  // 5% of max thinking tokens
  low: 0.15,      // 15% of max thinking tokens
  medium: 0.33,   // 33% of max thinking tokens (default)
  high: 0.67,     // 67% of max thinking tokens
  max: 1.0        // 100% of max thinking tokens
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
 */
function convertMessagesToAnthropic(messages) {
  if (!Array.isArray(messages)) {
    throw new AnthropicProviderError('Messages must be an array', ErrorCodes.INVALID_MESSAGES);
  }

  let systemPrompt = '';
  const anthropicMessages = [];

  for (const [index, msg] of messages.entries()) {
    if (!msg || typeof msg !== 'object') {
      throw new AnthropicProviderError(`Message at index ${index} must be an object`, ErrorCodes.INVALID_MESSAGE);
    }

    const { role, content } = msg;

    if (!role || !['system', 'user', 'assistant'].includes(role)) {
      throw new AnthropicProviderError(`Invalid role "${role}" at message index ${index}`, ErrorCodes.INVALID_ROLE);
    }

    if (!content) {
      throw new AnthropicProviderError(`Message content is required at index ${index}`, ErrorCodes.MISSING_CONTENT);
    }

    if (role === 'system') {
      // Anthropic expects system messages to be concatenated
      systemPrompt += (systemPrompt ? '\n\n' : '') + content;
    } else {
      // Handle complex content structure (array with text and images)
      if (Array.isArray(content)) {
        const anthropicContent = [];

        for (const item of content) {
          if (item.type === 'text') {
            anthropicContent.push({
              type: 'text',
              text: item.text
            });
          } else if (item.type === 'image' && item.source) {
            // Content is already in Anthropic format
            anthropicContent.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: item.source.media_type,
                data: item.source.data
              }
            });
            debugLog(`[Anthropic] Processing image: ${item.source.media_type}, data length: ${item.source.data.length}`);
          }
        }

        anthropicMessages.push({
          role,
          content: anthropicContent
        });
      } else {
        // Simple string content
        anthropicMessages.push({
          role,
          content
        });
      }
    }
  }

  // Ensure first message is from user
  if (anthropicMessages.length > 0 && anthropicMessages[0].role !== 'user') {
    throw new AnthropicProviderError('First message must be from user role', ErrorCodes.INVALID_MESSAGE);
  }

  // Ensure messages alternate between user and assistant
  for (let i = 1; i < anthropicMessages.length; i++) {
    const prevRole = anthropicMessages[i - 1].role;
    const currRole = anthropicMessages[i].role;

    if (prevRole === currRole) {
      throw new AnthropicProviderError(
        `Messages must alternate between user and assistant. Found consecutive ${currRole} messages at index ${i}`,
        ErrorCodes.INVALID_MESSAGE
      );
    }
  }

  return { systemPrompt, messages: anthropicMessages };
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
        error
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
   * @returns {Object} - { content, stop_reason, rawResponse }
   */
  async invoke(messages, options = {}) {
    const {
      model = 'claude-3-5-sonnet-20241022',
      temperature = 0.7,
      maxTokens = null,
      stream = false,
      reasoning_effort = 'medium',
      // eslint-disable-next-line no-unused-vars
      use_websearch = false, // Not supported by Anthropic, ignored
      config,
      ...otherOptions
    } = options;

    // Validate API key
    if (!config?.apiKeys?.anthropic) {
      throw new AnthropicProviderError('Anthropic API key not configured', ErrorCodes.MISSING_API_KEY);
    }

    if (!validateApiKey(config.apiKeys.anthropic)) {
      throw new AnthropicProviderError('Invalid Anthropic API key format', ErrorCodes.INVALID_API_KEY);
    }

    // Get Anthropic SDK
    const Anthropic = await getAnthropicSDK();

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: config.apiKeys.anthropic,
    });

    // Resolve model name
    const resolvedModel = resolveModelName(model);
    const modelConfig = SUPPORTED_MODELS[resolvedModel] || {};

    // Convert messages to Anthropic format
    const { systemPrompt, messages: anthropicMessages } = convertMessagesToAnthropic(messages);

    // Build request payload
    const requestPayload = {
      model: resolvedModel,
      messages: anthropicMessages,
      stream,
      ...otherOptions
    };

    // Add system prompt if present
    if (systemPrompt) {
      requestPayload.system = systemPrompt;
    }

    // Add max tokens (required by Anthropic)
    requestPayload.max_tokens = maxTokens
      ? Math.min(maxTokens, modelConfig.maxOutputTokens || 8192)
      : modelConfig.maxOutputTokens || 8192;

    // Add temperature if specified
    if (temperature !== undefined) {
      requestPayload.temperature = Math.max(0, Math.min(1, temperature));
    }

    // Add thinking configuration for models that support it
    if (modelConfig.supportsThinking && reasoning_effort) {
      const thinkingBudget = calculateThinkingBudget(modelConfig, reasoning_effort);
      if (thinkingBudget > 0) {
        requestPayload.thinking = {
          type: 'enabled',
          budget_tokens: thinkingBudget
        };
        debugLog(`[Anthropic] Thinking enabled with budget: ${thinkingBudget} tokens (${reasoning_effort} effort)`);
      }
    }

    try {
      debugLog(`[Anthropic] Calling ${resolvedModel} with ${anthropicMessages.length} messages`);
      if (systemPrompt) {
        debugLog(`[Anthropic] System prompt length: ${systemPrompt.length} characters`);
      }

      const startTime = Date.now();

      // Make the API call
      const response = await anthropic.messages.create(requestPayload);

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
        throw new AnthropicProviderError('No content in response from Anthropic', ErrorCodes.NO_RESPONSE_CONTENT);
      }

      // Map stop reason
      const stopReason = STOP_REASON_MAP[response.stop_reason] || StopReasons.OTHER;

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
            total_tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
            thinking_tokens: usage.thinking_input_tokens || 0
          },
          response_time_ms: responseTime,
          finish_reason: response.stop_reason,
          provider: 'anthropic',
          reasoning_effort: modelConfig.supportsThinking ? reasoning_effort : null
        }
      };

    } catch (error) {
      debugError('[Anthropic] Error during API call:', error);

      // Re-throw our own errors
      if (error instanceof AnthropicProviderError) {
        throw error;
      }

      // Handle specific Anthropic errors
      if (error.status === 401) {
        throw new AnthropicProviderError('Invalid Anthropic API key', ErrorCodes.INVALID_API_KEY, error);
      } else if (error.status === 429) {
        throw new AnthropicProviderError('Anthropic rate limit exceeded', ErrorCodes.RATE_LIMIT_EXCEEDED, error);
      } else if (error.status === 403) {
        throw new AnthropicProviderError('Anthropic API quota exceeded or forbidden', ErrorCodes.QUOTA_EXCEEDED, error);
      } else if (error.error?.type === 'invalid_request_error') {
        throw new AnthropicProviderError(`Invalid request: ${error.error.message}`, ErrorCodes.INVALID_REQUEST, error);
      } else if (error.error?.type === 'not_found_error') {
        throw new AnthropicProviderError(`Model ${resolvedModel} not found`, ErrorCodes.MODEL_NOT_FOUND, error);
      } else if (error.message?.includes('context length') || error.message?.includes('token')) {
        throw new AnthropicProviderError('Context length exceeded for model', ErrorCodes.CONTEXT_LENGTH_EXCEEDED, error);
      }

      // Generic error handling
      throw new AnthropicProviderError(
        `Anthropic API error: ${error.message || 'Unknown error'}`,
        ErrorCodes.API_ERROR,
        error
      );
    }
  },

  /**
   * Validate configuration for Anthropic provider
   * @param {Object} config - Configuration object
   * @returns {boolean} - True if configuration is valid
   */
  validateConfig(config) {
    return !!(config?.apiKeys?.anthropic && validateApiKey(config.apiKeys.anthropic));
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

