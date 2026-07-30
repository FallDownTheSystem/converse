/**
 * Claude SDK Provider
 *
 * Provider implementation for Anthropic's Claude models using the @anthropic-ai/claude-agent-sdk.
 * Implements the unified interface: async invoke(messages, options) => { content, stop_reason, rawResponse }
 *
 * Key differences from traditional providers:
 * - Uses Claude Code CLI authentication (via `claude login`) - NOT API keys
 * - Converts message arrays to single prompts (SDK expects prompts, not message history)
 * - Spawns local process (bundled CLI binary) for execution
 * - Requires Claude Code authentication (NOT ANTHROPIC_API_KEY)
 *
 * @see agent-sdk/typescript.md for SDK reference documentation
 */

import { debugLog, debugError } from '../utils/console.js';
import { ProviderError, ErrorCodes, StopReasons } from './interface.js';

// Default underlying model when the request is just "claude" (or "claude:fable")
const DEFAULT_SDK_MODEL = 'claude-fable-5';

// Supported Claude SDK models with their configurations
const SUPPORTED_MODELS = {
  fable: {
    modelName: 'claude-fable-5',
    friendlyName: 'Claude Fable 5 (via Agent SDK)',
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    supportsStreaming: true,
    supportsImages: true, // Supported via streaming input mode
    supportsWebSearch: false, // SDK accesses files directly, not web
    timeout: 1800000, // 30 minutes
    description:
      'Claude Fable 5 via Agent SDK (default) - requires claude login authentication',
    aliases: [
      'claude',
      'claude-sdk',
      'claude-code',
      'claude:fable',
      'claude-fable-5',
      'claude-fable',
      'fable-5',
    ],
  },
  opus: {
    modelName: 'claude-opus-5',
    friendlyName: 'Claude Opus 5 (via Agent SDK)',
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    supportsStreaming: true,
    supportsImages: true, // Supported via streaming input mode
    supportsWebSearch: false, // SDK accesses files directly, not web
    timeout: 1800000, // 30 minutes
    description:
      'Claude Opus 5 via Agent SDK - requires claude login authentication',
    aliases: ['claude:opus', 'claude-opus-5'],
  },
};

/**
 * Custom error class for Claude provider errors
 */
class ClaudeProviderError extends ProviderError {
  constructor(message, code, originalError = null) {
    super(message, code, originalError);
    this.name = 'ClaudeProviderError';
  }
}

/**
 * Check if Claude SDK is available (optional dependency)
 */
function isClaudeSDKAvailable() {
  try {
    // Simple presence check that works in ES modules
    // If SDK not available, the actual import() will fail later with clear error
    return true;
  } catch {
    return false;
  }
}

/**
 * Dynamically import Claude SDK (lazy loading)
 * This keeps the SDK as an optional dependency
 */
async function getClaudeSDK() {
  if (!isClaudeSDKAvailable()) {
    throw new ClaudeProviderError(
      'Claude SDK not installed. Install with: npm install @anthropic-ai/claude-agent-sdk',
      'CLAUDE_SDK_NOT_INSTALLED',
    );
  }

  try {
    // Use dynamic import to load SDK only when needed
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    return query;
  } catch (error) {
    throw new ClaudeProviderError(
      'Failed to load Claude SDK. Install with: npm install @anthropic-ai/claude-agent-sdk',
      'CLAUDE_SDK_LOAD_ERROR',
      error,
    );
  }
}

/**
 * Look up model config from SUPPORTED_MODELS by name or alias.
 * Strips the claude: prefix first (e.g. "claude:opus" -> "opus").
 */
function findModelConfig(modelName) {
  if (typeof modelName !== 'string') return null;

  let name = modelName.trim();
  if (name.toLowerCase().startsWith('claude:')) {
    name = name.slice('claude:'.length).trim();
  }
  if (!name) return SUPPORTED_MODELS.fable;

  const nameLower = name.toLowerCase();

  if (SUPPORTED_MODELS[nameLower]) {
    return SUPPORTED_MODELS[nameLower];
  }

  for (const config of Object.values(SUPPORTED_MODELS)) {
    if (
      config.aliases &&
      config.aliases.some((alias) => alias.toLowerCase() === nameLower)
    ) {
      return config;
    }
  }

  return null;
}

/**
 * Resolve the requested model to the underlying SDK model ID.
 * - "claude" (and bare "claude:") defaults to Claude Fable 5
 * - "claude:fable" / "claude:opus" select the specific model
 * - Unknown names are passed through (after prefix stripping) so users can
 *   target any model ID the Agent SDK accepts (e.g. "claude:claude-sonnet-4-6")
 */
function resolveSdkModel(modelName) {
  if (typeof modelName !== 'string' || !modelName.trim()) {
    return DEFAULT_SDK_MODEL;
  }

  const config = findModelConfig(modelName);
  if (config) {
    return config.modelName;
  }

  let name = modelName.trim();
  if (name.toLowerCase().startsWith('claude:')) {
    name = name.slice('claude:'.length).trim();
  }
  return name || DEFAULT_SDK_MODEL;
}

/**
 * Convert message array to SDK input format
 * Claude SDK supports two modes:
 * 1. Single message mode (string) - simpler, but no image support
 * 2. Streaming input mode (AsyncGenerator) - supports images
 *
 * Strategy:
 * - Extract last user message
 * - If message contains images, use streaming input mode
 * - Otherwise, return string prompt for single message mode
 *
 * @returns {Object} { prompt: string | null, sdkMessage: Object | null, hasImages: boolean }
 */
function convertMessagesToSdkInput(messages) {
  if (!Array.isArray(messages)) {
    throw new ClaudeProviderError(
      'Messages must be an array',
      ErrorCodes.INVALID_MESSAGES,
    );
  }

  if (messages.length === 0) {
    throw new ClaudeProviderError(
      'Messages array cannot be empty',
      ErrorCodes.INVALID_MESSAGES,
    );
  }

  // Find last user message
  const lastUserMessage = messages.filter((m) => m.role === 'user').pop();

  if (!lastUserMessage) {
    throw new ClaudeProviderError(
      'No user message found in messages array',
      ErrorCodes.INVALID_MESSAGES,
    );
  }

  // Extract text content from message
  if (typeof lastUserMessage.content === 'string') {
    return {
      prompt: lastUserMessage.content,
      sdkMessage: null,
      hasImages: false,
    };
  }

  // Handle array content (multimodal format)
  if (Array.isArray(lastUserMessage.content)) {
    // Check if message contains images
    const hasImages = lastUserMessage.content.some(
      (item) => item.type === 'image',
    );

    if (hasImages) {
      // Use streaming input mode for images
      // Convert to SDK message format
      const sdkContent = lastUserMessage.content.map((item) => {
        if (item.type === 'text') {
          return {
            type: 'text',
            text: item.text,
          };
        } else if (item.type === 'image') {
          // SDK expects Anthropic image format
          return {
            type: 'image',
            source: item.source,
          };
        }
        return item;
      });

      debugLog(
        `[Claude SDK] Using streaming input mode for multimodal content (${lastUserMessage.content.filter((i) => i.type === 'image').length} images)`,
      );

      return {
        prompt: null,
        sdkMessage: {
          type: 'user',
          message: {
            role: 'user',
            content: sdkContent,
          },
        },
        hasImages: true,
      };
    }

    // No images - extract text only
    const textParts = lastUserMessage.content
      .filter((item) => item.type === 'text')
      .map((item) => item.text);

    return {
      prompt: textParts.join('\n'),
      sdkMessage: null,
      hasImages: false,
    };
  }

  throw new ClaudeProviderError(
    'Invalid message content format',
    ErrorCodes.INVALID_MESSAGES,
  );
}

/**
 * Create an async generator that yields a single SDK user message
 * This is required for streaming input mode (image support)
 */
async function* createSdkMessageGenerator(sdkMessage) {
  yield sdkMessage;
}

/**
 * Create stream generator for Claude SDK streaming responses
 * Yields normalized events compatible with ProviderStreamNormalizer
 *
 * SDK Message Types:
 * - system (subtype: init): Session initialization
 * - assistant: Model responses with message.content
 * - result (subtype: success/error_*): Final results with usage
 *
 * @param {Function} queryFn - The SDK query function
 * @param {string|null} prompt - String prompt for single message mode, or null for streaming input mode
 * @param {Object|null} sdkMessage - SDK user message for streaming input mode (with images)
 * @param {Object} options - SDK options (cwd, model, etc.)
 * @param {AbortSignal} signal - Abort signal for cancellation
 */
async function* createStreamingGenerator(
  queryFn,
  prompt,
  sdkMessage,
  options,
  signal,
) {
  try {
    // Build query options
    // Use higher maxTurns to allow for file reading operations
    const queryOptions = {
      model: options.model || DEFAULT_SDK_MODEL,
      maxTurns: 20, // Allow multiple turns for file operations
      permissionMode: 'bypassPermissions', // Don't prompt for permissions
    };

    // Add working directory if provided
    if (options.cwd) {
      queryOptions.cwd = options.cwd;
    }

    // Pass abort controller if provided
    // Note: The SDK expects AbortController, not AbortSignal
    if (signal) {
      // Create a new abort controller that we can pass to the SDK
      const controller = new globalThis.AbortController();
      queryOptions.abortController = controller;
      // Forward abort signal from the provided signal to our controller
      signal.addEventListener('abort', () => {
        controller.abort();
      });
    }

    // Determine input mode based on whether we have an SDK message (with images) or plain prompt
    // - Streaming input mode: prompt is AsyncGenerator<SDKUserMessage> - required for images
    // - Single message mode: prompt is string - simpler but no image support
    const queryInput = sdkMessage
      ? createSdkMessageGenerator(sdkMessage) // Streaming input mode for images
      : prompt; // Single message mode for text-only

    // Create query generator
    const response = queryFn({
      prompt: queryInput,
      options: queryOptions,
    });

    let _sessionId = null;
    let _modelUsed = queryOptions.model;
    let _accumulatedContent = '';

    // Yield start event
    yield {
      type: 'start',
      provider: 'claude',
      model: queryOptions.model,
    };

    // Iterate over SDK messages
    for await (const message of response) {
      // Check for cancellation
      if (signal?.aborted) {
        throw new ClaudeProviderError('Request cancelled', 'CANCELLED');
      }

      // Handle different message types
      switch (message.type) {
      case 'system':
        if (message.subtype === 'init') {
          _sessionId = message.session_id;
          _modelUsed = message.model || queryOptions.model;
          debugLog(
            `[Claude SDK] Session initialized: ${_sessionId}, model: ${_modelUsed}`,
          );
        }
        break;

      case 'assistant':
        // Extract content from assistant message
        if (message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === 'text') {
              const text = block.text || '';
              _accumulatedContent += text;

              // Yield delta event with content chunk
              yield {
                type: 'delta',
                data: {
                  textDelta: text,
                },
              };
            }
          }
        }
        break;

      case 'result':
        // Handle final result
        if (message.subtype === 'success') {
          // Yield usage event
          if (message.usage) {
            yield {
              type: 'usage',
              usage: {
                input_tokens: message.usage.input_tokens || 0,
                output_tokens: message.usage.output_tokens || 0,
                total_tokens:
                    (message.usage.input_tokens || 0) +
                    (message.usage.output_tokens || 0),
                cached_input_tokens:
                    message.usage.cache_read_input_tokens || 0,
              },
            };
          }

          // Yield end event
          yield {
            type: 'end',
            stop_reason: StopReasons.STOP,
            finish_reason: 'stop',
          };
        } else if (
          message.subtype === 'error_max_turns' ||
            message.subtype === 'error_during_execution'
        ) {
          throw new ClaudeProviderError(
            `Claude SDK execution failed: ${message.subtype}`,
            ErrorCodes.API_ERROR,
          );
        }
        break;
      }
    }
  } catch (error) {
    if (signal?.aborted) {
      throw new ClaudeProviderError('Request cancelled', 'CANCELLED');
    }
    throw error;
  }
}

/**
 * Claude SDK Provider Implementation
 */
export const claudeProvider = {
  /**
   * Invoke Claude SDK with messages and options
   * @param {Array} messages - Message array (Converse format)
   * @param {Object} options - Invocation options
   * @returns {Promise<Object>|AsyncGenerator} Response or stream generator
   */
  async invoke(messages, options = {}) {
    const {
      model = 'claude',
      config,
      stream = false,
      signal,
      reasoning_effort,
    } = options;

    // Validate configuration
    if (!config) {
      throw new ClaudeProviderError(
        'Configuration is required',
        ErrorCodes.MISSING_API_KEY,
      );
    }

    // Log unsupported parameters at debug level
    if (reasoning_effort !== undefined) {
      debugLog(
        '[Claude SDK] Parameter "reasoning_effort" not supported by Claude SDK (ignored)',
      );
    }

    try {
      // Get Claude SDK
      const query = await getClaudeSDK();

      // Convert messages to SDK input format
      // Returns { prompt, sdkMessage, hasImages }
      // - prompt: string for single message mode (text-only)
      // - sdkMessage: SDK user message for streaming input mode (with images)
      const { prompt, sdkMessage, hasImages } =
        convertMessagesToSdkInput(messages);

      if (hasImages) {
        debugLog('[Claude SDK] Using streaming input mode for image support');
      }

      // Resolve requested model (claude/claude:fable -> claude-fable-5, claude:opus -> claude-opus-5)
      const sdkModel = resolveSdkModel(model);
      debugLog(`[Claude SDK] Resolved model "${model}" -> "${sdkModel}"`);

      // Build SDK options
      const sdkOptions = {
        cwd: config.server?.client_cwd || process.cwd(),
        model: sdkModel,
      };

      // Streaming mode
      if (stream) {
        return createStreamingGenerator(
          query,
          prompt,
          sdkMessage,
          sdkOptions,
          signal,
        );
      }

      // Synchronous mode: consume streaming internally and return complete response
      const startTime = Date.now();
      const generator = createStreamingGenerator(
        query,
        prompt,
        sdkMessage,
        sdkOptions,
        signal,
      );

      let content = '';
      let usage = null;

      for await (const event of generator) {
        if (event.type === 'delta' && event.data?.textDelta) {
          content += event.data.textDelta;
        } else if (event.type === 'usage') {
          usage = event.usage;
        }
      }

      const responseTime = Date.now() - startTime;

      return {
        content,
        stop_reason: StopReasons.STOP,
        rawResponse: { content, usage },
        metadata: {
          provider: 'claude',
          model: sdkModel,
          usage: usage
            ? {
              input_tokens: usage.input_tokens || 0,
              output_tokens: usage.output_tokens || 0,
              total_tokens:
                  (usage.input_tokens || 0) + (usage.output_tokens || 0),
              cached_input_tokens: usage.cached_input_tokens || 0,
            }
            : null,
          response_time_ms: responseTime,
          finish_reason: 'stop',
        },
      };
    } catch (error) {
      debugError('[Claude SDK] Execution error', error);

      // Map common errors to standard error codes
      if (
        error.message?.includes('authentication') ||
        error.message?.includes('login') ||
        error.message?.includes('not authenticated')
      ) {
        throw new ClaudeProviderError(
          'Claude SDK authentication failed. Run: claude login',
          ErrorCodes.INVALID_API_KEY,
          error,
        );
      }

      if (error.message?.includes('timeout')) {
        throw new ClaudeProviderError(
          'Claude SDK execution timeout',
          ErrorCodes.TIMEOUT_ERROR,
          error,
        );
      }

      if (error.message?.includes('rate limit')) {
        throw new ClaudeProviderError(
          'Rate limit exceeded',
          ErrorCodes.RATE_LIMIT_EXCEEDED,
          error,
        );
      }

      // Re-throw as Claude error if not already
      if (error instanceof ClaudeProviderError) {
        throw error;
      }

      throw new ClaudeProviderError(
        error.message || 'Claude SDK execution failed',
        ErrorCodes.API_ERROR,
        error,
      );
    }
  },

  /**
   * Validate Claude SDK configuration
   * Claude SDK uses CLI authentication (NOT API keys)
   * Returns true optimistically - authentication errors handled at runtime
   */
  validateConfig(_config) {
    // Claude SDK uses CLI authentication, not API keys
    // We can't reliably check auth status, so return true optimistically
    // and let the SDK handle authentication errors during execution
    return isClaudeSDKAvailable();
  },

  /**
   * Check if Claude SDK provider is available
   */
  isAvailable(config) {
    return this.validateConfig(config);
  },

  /**
   * Get supported Claude SDK models
   */
  getSupportedModels() {
    return SUPPORTED_MODELS;
  },

  /**
   * Get model configuration for specific model
   * Handles claude: prefixed names (e.g. "claude:opus", "claude:fable")
   */
  getModelConfig(modelName) {
    return findModelConfig(modelName);
  },
};
