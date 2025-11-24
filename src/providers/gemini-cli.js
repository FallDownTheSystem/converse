/**
 * Gemini CLI Provider
 *
 * Provider implementation for Google's Gemini models using the ai-sdk-provider-gemini-cli package.
 * Implements the unified interface: async invoke(messages, options) => { content, stop_reason, rawResponse }
 *
 * Key features:
 * - Uses OAuth authentication from Gemini CLI (no API keys needed)
 * - Supports gemini-3-pro-preview model via Google Cloud Code endpoints
 * - Uses AI SDK v5 standard interfaces (generateText/streamText)
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
    friendlyName: 'Gemini 3.0 Pro Preview (via CLI)',
    contextWindow: 1048576, // 1M tokens
    maxOutputTokens: 64000,
    supportsStreaming: true,
    supportsImages: true, // Base64 only (no URLs)
    supportsTemperature: true,
    supportsThinking: true,
    supportsWebSearch: true,
    timeout: 300000, // 5 minutes
    description:
			'Gemini 3.0 Pro Preview via OAuth - requires Gemini CLI authentication',
    aliases: ['gemini-cli'],
    // Internal SDK model name (user-facing "gemini" maps to SDK's "gemini-3-pro-preview")
    sdkModelName: 'gemini-3-pro-preview',
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
      yield {
        type: 'usage',
        usage: {
          input_tokens: usage.promptTokens || 0,
          output_tokens: usage.completionTokens || 0,
          total_tokens: usage.totalTokens || 0,
          cached_input_tokens: 0,
        },
      };
    }

    // Yield end event
    yield {
      type: 'end',
      stop_reason: mapFinishReason(finishReason),
      finish_reason: finishReason,
    };
  } catch (error) {
    if (signal?.aborted) {
      throw new GeminiCliProviderError('Request cancelled', 'CANCELLED');
    }
    throw error;
  }
}

/**
 * Map AI SDK finish reasons to our StopReasons enum
 */
function mapFinishReason(finishReason) {
  switch (finishReason) {
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
 * Convert messages from Converse internal format to Gemini CLI SDK format
 *
 * Converse format (used by other providers like Anthropic):
 * - Images: { type: 'image', source: { type: 'base64', media_type: '...', data: '...' } }
 *
 * Gemini CLI SDK format (from SDK guide):
 * - Images: { type: 'image', data: '...' }  (base64 string)
 * - Text: { type: 'text', text: '...' }
 *
 * @param {Array} messages - Messages in Converse internal format
 * @returns {Array} Messages in Gemini CLI SDK format
 */
function convertToGeminiCliMessages(messages) {
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

        // Convert image from Converse format to Gemini CLI SDK format
        if (part.type === 'image' && part.source) {
          return {
            type: 'image',
            data: part.source.data, // Extract base64 data (use 'data' not 'image')
          };
        }

        // If already in Gemini CLI format, return as-is
        if (part.type === 'image' && part.data) {
          return part;
        }

        // Handle file parts (future-proofing)
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

      // Convert messages from Converse format to Gemini CLI SDK format
      const convertedMessages = convertToGeminiCliMessages(messages);

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

      // Extract content from AI SDK v5 response format
      const content = result.content?.[0]?.text || result.text || '';

      return {
        content,
        stop_reason: mapFinishReason(result.finishReason),
        rawResponse: result,
        metadata: {
          provider: 'gemini-cli',
          model,
          usage: result.usage
            ? {
              input_tokens: result.usage.promptTokens || 0,
              output_tokens: result.usage.completionTokens || 0,
              total_tokens: result.usage.totalTokens || 0,
              cached_input_tokens: 0,
            }
            : null,
          response_time_ms: responseTime,
          finish_reason: result.finishReason || 'stop',
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
