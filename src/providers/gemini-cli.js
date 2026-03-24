/**
 * Gemini CLI Provider
 *
 * Provider implementation for Google's Gemini models using the ai-sdk-provider-gemini-cli package.
 * Implements the unified interface: async invoke(messages, options) => { content, stop_reason, rawResponse }
 *
 * Key features:
 * - Uses OAuth authentication from Gemini CLI (no API keys needed)
 * - Supports gemini-3-pro-preview model via Google Cloud Code endpoints
 * - Uses AI SDK v6 standard interfaces (generateText/streamText)
 * - Compatible with both chat and consensus tools
 *
 * Authentication:
 * - Requires global Gemini CLI installation: npm install -g @google/gemini-cli
 * - User must authenticate once via: gemini (interactive CLI)
 * - Credentials stored in ~/.gemini/oauth_creds.json
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { debugLog, debugError } from '../utils/console.js';
import { ProviderError, ErrorCodes, StopReasons } from './interface.js';

// Supported Gemini CLI models with their configurations
const SUPPORTED_MODELS = {
  gemini: {
    modelName: 'gemini',
    friendlyName: 'Gemini 3.1 Pro Preview (via CLI)',
    contextWindow: 1048576, // 1M tokens
    maxOutputTokens: 64000,
    supportsStreaming: true,
    supportsImages: true, // Base64 only (no URLs)
    supportsTemperature: true,
    supportsThinking: true,
    supportsWebSearch: true,
    timeout: 600000, // 10 minutes
    description:
      'Gemini 3.1 Pro Preview via OAuth - requires Gemini CLI authentication',
    aliases: ['gemini-cli'],
    // Internal SDK model name (user-facing "gemini" maps to SDK's "gemini-3.1-pro-preview")
    sdkModelName: 'gemini-3.1-pro-preview',
  },
};

/**
 * Custom error class for Gemini CLI provider errors
 */
class GeminiCliProviderError extends ProviderError {
  constructor(message, code, originalError = null) {
    super(message, code, originalError);
    this.name = 'GeminiCliProviderError';
  }
}

/**
 * Check if OAuth credentials file exists
 * @returns {boolean} True if credentials file exists
 */
function hasOAuthCredentials() {
  try {
    const credsPath = join(homedir(), '.gemini', 'oauth_creds.json');
    return existsSync(credsPath);
  } catch (error) {
    debugError('[Gemini CLI] Error checking OAuth credentials', error);
    return false;
  }
}

/**
 * Dynamically import Gemini CLI SDK (lazy loading)
 * This keeps the SDK as an optional dependency
 */
async function getGeminiCliSDK() {
  try {
    // Use dynamic import to load SDK only when needed
    const { createGeminiProvider } = await import('ai-sdk-provider-gemini-cli');
    return createGeminiProvider;
  } catch (error) {
    throw new GeminiCliProviderError(
      'Gemini CLI SDK not installed. Install with: npm install ai-sdk-provider-gemini-cli',
      'GEMINI_CLI_NOT_INSTALLED',
      error,
    );
  }
}

/**
 * Dynamically import AI SDK (lazy loading)
 */
async function getAISDK() {
  try {
    const { generateText, streamText } = await import('ai');
    return { generateText, streamText };
  } catch (error) {
    throw new GeminiCliProviderError(
      'AI SDK not installed. Install with: npm install ai',
      'AI_SDK_NOT_INSTALLED',
      error,
    );
  }
}

/**
 * Create stream generator for Gemini CLI streaming responses
 * Yields normalized events compatible with ProviderStreamNormalizer
 */
async function* createStreamingGenerator(
  modelInstance,
  messages,
  options,
  signal,
  userFacingModelName = 'gemini',
) {
  const { streamText } = await getAISDK();

  try {
    const streamOptions = {
      model: modelInstance,
      messages,
      ...options,
    };

    if (signal) {
      streamOptions.abortSignal = signal;
    }

    const result = await streamText(streamOptions);

    // Yield start event
    yield {
      type: 'start',
      provider: 'gemini-cli',
      model: userFacingModelName,
    };

    // Stream text chunks
    for await (const chunk of result.textStream) {
      // Check for cancellation
      if (signal?.aborted) {
        throw new GeminiCliProviderError('Request cancelled', 'CANCELLED');
      }

      // Yield delta event with content chunk (normalized format)
      yield {
        type: 'delta',
        data: {
          textDelta: chunk,
        },
      };
    }

    // Get final usage stats and metadata
    const usage = await result.usage;
    const finishReason = await result.finishReason;

    // Yield usage event
    if (usage) {
      const tokens = extractUsageTokens(usage);
      yield {
        type: 'usage',
        usage: {
          input_tokens: tokens.input,
          output_tokens: tokens.output,
          total_tokens: tokens.total,
          cached_input_tokens: 0,
        },
      };
    }

    // Yield end event
    yield {
      type: 'end',
      stop_reason: mapFinishReason(finishReason),
      finish_reason: getRawFinishReason(finishReason),
    };
  } catch (error) {
    if (signal?.aborted) {
      throw new GeminiCliProviderError('Request cancelled', 'CANCELLED');
    }
    throw error;
  }
}

/**
 * Map AI SDK v6 finish reasons to our StopReasons enum
 * AI SDK v6 returns finishReason as { unified: 'stop', raw: 'STOP' }
 * @param {Object|string} finishReason - The finish reason (object in v6, string in v5)
 */
function mapFinishReason(finishReason) {
  // AI SDK v6 returns an object with 'unified' property
  const reason =
    typeof finishReason === 'object' ? finishReason?.unified : finishReason;

  switch (reason) {
  case 'stop':
    return StopReasons.STOP;
  case 'length':
  case 'max-tokens':
    return StopReasons.LENGTH;
  case 'content-filter':
    return StopReasons.CONTENT_FILTER;
  case 'tool-calls':
    return StopReasons.TOOL_USE;
  case 'error':
    return StopReasons.ERROR;
  default:
    return StopReasons.OTHER;
  }
}

/**
 * Extract raw finish reason string for metadata
 * AI SDK v6 returns finishReason as { unified: 'stop', raw: 'STOP' }
 * @param {Object|string} finishReason - The finish reason
 * @returns {string} The raw finish reason string
 */
function getRawFinishReason(finishReason) {
  if (typeof finishReason === 'object') {
    return finishReason?.unified || finishReason?.raw || 'stop';
  }
  return finishReason || 'stop';
}

/**
 * Extract usage tokens from AI SDK v6 hierarchical structure
 * AI SDK v6 usage: { inputTokens: { total: N }, outputTokens: { total: N } }
 * AI SDK v5 usage: { promptTokens: N, completionTokens: N, totalTokens: N }
 * @param {Object} usage - The usage object from AI SDK
 * @returns {Object} Normalized token counts
 */
function extractUsageTokens(usage) {
  if (!usage) {
    return { input: 0, output: 0, total: 0 };
  }

  // AI SDK v6 hierarchical structure
  if (usage.inputTokens && typeof usage.inputTokens === 'object') {
    const input = usage.inputTokens.total || 0;
    const output = usage.outputTokens?.total || 0;
    return { input, output, total: input + output };
  }

  // AI SDK flat structure (backwards compatibility)
  const input = usage.promptTokens || usage.inputTokens || 0;
  const output = usage.completionTokens || usage.outputTokens || 0;
  const total = usage.totalTokens || input + output;
  return { input, output, total };
}

/**
 * Convert messages from Converse internal format to AI SDK ModelMessage format
 *
 * Converse format (used by other providers like Anthropic):
 * - Images: { type: 'image', source: { type: 'base64', media_type: '...', data: '...' } }
 *
 * AI SDK ModelMessage format (required by generateText/streamText):
 * - Images: { type: 'image', image: '...' }  (base64 string, Buffer, or URL)
 * - Text: { type: 'text', text: '...' }
 *
 * Note: The AI SDK validates ModelMessage format before passing to providers.
 * We must use 'image' property (not 'data') for the AI SDK to accept the message.
 *
 * @param {Array} messages - Messages in Converse internal format
 * @returns {Array} Messages in AI SDK ModelMessage format
 */
function convertToModelMessages(messages) {
  return messages.map((message) => {
    // If content is a string, no conversion needed
    if (typeof message.content === 'string') {
      return message;
    }

    // If content is an array, convert each part
    if (Array.isArray(message.content)) {
      const convertedContent = message.content.map((part) => {
        // Text parts are already in correct format
        if (part.type === 'text') {
          return part;
        }

        // Convert image from Converse format to AI SDK ModelMessage format
        if (part.type === 'image' && part.source) {
          return {
            type: 'image',
            image: part.source.data, // AI SDK expects 'image' property (not 'data')
          };
        }

        // If already in AI SDK v5 format, return as-is
        if (part.type === 'image' && part.image) {
          return part;
        }

        // Handle file parts (already in correct format)
        if (part.type === 'file' && part.data) {
          return part;
        }

        // Unknown part type, return as-is and let SDK handle it
        debugLog(`[Gemini CLI] Unknown content part type: ${part.type}`);
        return part;
      });

      return {
        ...message,
        content: convertedContent,
      };
    }

    // Unknown content type, return as-is
    return message;
  });
}

/**
 * Gemini CLI Provider Implementation
 */
export const geminiCliProvider = {
  /**
   * Invoke Gemini CLI with messages and options
   * @param {Array} messages - Message array (Converse format)
   * @param {Object} options - Invocation options
   * @returns {Promise<Object>|AsyncGenerator} Response or stream generator
   */
  async invoke(messages, options = {}) {
    const {
      model = 'gemini',
      config,
      stream = false,
      signal,
      reasoning_effort,
      temperature,
      use_websearch,
    } = options;

    // Validate configuration
    if (!config) {
      throw new GeminiCliProviderError(
        'Configuration is required',
        ErrorCodes.MISSING_API_KEY,
      );
    }

    // Check OAuth credentials
    if (!hasOAuthCredentials()) {
      throw new GeminiCliProviderError(
        'Gemini CLI authentication required. Run: gemini (interactive CLI) to authenticate',
        ErrorCodes.INVALID_API_KEY,
      );
    }

    try {
      // Get model configuration to map user-facing name to SDK model name
      const modelConfig = this.getModelConfig(model);
      if (!modelConfig) {
        throw new GeminiCliProviderError(
          `Model ${model} not supported by Gemini CLI provider`,
          ErrorCodes.MODEL_NOT_FOUND,
        );
      }

      // Get the SDK model name (e.g., "gemini" -> "gemini-3-pro-preview")
      const sdkModelName = modelConfig.sdkModelName || model;

      // Get SDKs
      const createGeminiProvider = await getGeminiCliSDK();
      const { generateText } = await getAISDK();

      // Create provider instance with OAuth authentication
      const gemini = createGeminiProvider({
        authType: 'oauth-personal',
      });

      // Create model instance with SDK model name
      const modelInstance = gemini(sdkModelName);

      // Convert messages from Converse format to AI SDK ModelMessage format
      const convertedMessages = convertToModelMessages(messages);

      // Build AI SDK options
      const aiOptions = {
        messages: convertedMessages,
      };

      // Add optional parameters
      if (temperature !== undefined) {
        aiOptions.temperature = temperature;
      }

      // Note: reasoning_effort and use_websearch are not directly supported by AI SDK
      // These would need to be handled at the API level if the provider supports them
      if (reasoning_effort !== undefined) {
        debugLog(
          '[Gemini CLI] Parameter "reasoning_effort" not directly supported (ignored)',
        );
      }
      if (use_websearch) {
        debugLog(
          '[Gemini CLI] Parameter "use_websearch" not directly supported (ignored)',
        );
      }

      // Streaming mode
      if (stream) {
        return createStreamingGenerator(
          modelInstance,
          convertedMessages,
          aiOptions,
          signal,
          model, // Pass user-facing model name for metadata
        );
      }

      // Synchronous mode
      const startTime = Date.now();

      const result = await generateText({
        model: modelInstance,
        ...aiOptions,
        ...(signal && { abortSignal: signal }),
      });

      const responseTime = Date.now() - startTime;

      // Extract content from AI SDK v6 response format
      const content = result.content?.[0]?.text || result.text || '';

      // Extract usage tokens with AI SDK v6 compatibility
      const tokens = extractUsageTokens(result.usage);

      return {
        content,
        stop_reason: mapFinishReason(result.finishReason),
        rawResponse: result,
        metadata: {
          provider: 'gemini-cli',
          model,
          usage: result.usage
            ? {
              input_tokens: tokens.input,
              output_tokens: tokens.output,
              total_tokens: tokens.total,
              cached_input_tokens: 0,
            }
            : null,
          response_time_ms: responseTime,
          finish_reason: getRawFinishReason(result.finishReason),
        },
      };
    } catch (error) {
      debugError('[Gemini CLI] Execution error', error);

      // Map common errors to standard error codes
      if (
        error.message?.includes('authentication') ||
        error.message?.includes('oauth') ||
        error.message?.includes('credentials')
      ) {
        throw new GeminiCliProviderError(
          'Gemini CLI authentication failed. Run: gemini (interactive CLI) to authenticate',
          ErrorCodes.INVALID_API_KEY,
          error,
        );
      }

      if (error.message?.includes('rate limit')) {
        throw new GeminiCliProviderError(
          'Rate limit exceeded',
          ErrorCodes.RATE_LIMIT_EXCEEDED,
          error,
        );
      }

      if (error.message?.includes('timeout')) {
        throw new GeminiCliProviderError(
          'Request timeout',
          ErrorCodes.TIMEOUT_ERROR,
          error,
        );
      }

      // Re-throw as Gemini CLI error
      throw new GeminiCliProviderError(
        error.message || 'Gemini CLI execution failed',
        ErrorCodes.API_ERROR,
        error,
      );
    }
  },

  /**
   * Validate Gemini CLI configuration
   * Gemini CLI uses OAuth authentication (no API keys needed)
   */
  validateConfig(_config) {
    // Check if OAuth credentials file exists
    return hasOAuthCredentials();
  },

  /**
   * Check if Gemini CLI provider is available
   */
  isAvailable(config) {
    return this.validateConfig(config);
  },

  /**
   * Get supported Gemini CLI models
   */
  getSupportedModels() {
    return SUPPORTED_MODELS;
  },

  /**
   * Get model configuration for specific model
   */
  getModelConfig(modelName) {
    const modelNameLower = modelName.toLowerCase();

    // Check exact match
    if (SUPPORTED_MODELS[modelNameLower]) {
      return SUPPORTED_MODELS[modelNameLower];
    }

    // Check aliases
    for (const [supportedModel, config] of Object.entries(SUPPORTED_MODELS)) {
      if (config.aliases) {
        for (const alias of config.aliases) {
          if (alias.toLowerCase() === modelNameLower) {
            return config;
          }
        }
      }
    }

    return null;
  },
};
