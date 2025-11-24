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

// Supported Claude SDK models with their configurations
const SUPPORTED_MODELS = {
  claude: {
    modelName: 'claude',
    friendlyName: 'Claude (via Agent SDK)',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsImages: false, // SDK has limited image support
    supportsTemperature: false, // SDK manages temperature internally
    supportsWebSearch: false, // SDK accesses files directly, not web
    timeout: 120000, // 2 minutes
    description:
			'Claude via Agent SDK - requires claude login authentication',
    aliases: ['claude-sdk', 'claude-code'],
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
 * Convert message array to single prompt for Claude SDK
 * Claude SDK expects single prompts, not message history
 *
 * Strategy:
 * - Extract last user message only
 * - Handle both string and multimodal content formats
 */
function convertMessagesToPrompt(messages) {
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
    return lastUserMessage.content;
  }

  // Handle array content (multimodal format)
  if (Array.isArray(lastUserMessage.content)) {
    const textParts = lastUserMessage.content
      .filter((item) => item.type === 'text')
      .map((item) => item.text);

    // Log warning if images present (Claude SDK has limited image support)
    const hasImages = lastUserMessage.content.some(
      (item) => item.type === 'image',
    );
    if (hasImages) {
      debugLog(
        '[Claude SDK] Warning: Images in message will be ignored (Claude SDK does not support multimodal input)',
      );
    }

    return textParts.join('\n');
  }

  throw new ClaudeProviderError(
    'Invalid message content format',
    ErrorCodes.INVALID_MESSAGES,
  );
}

/**
 * Create stream generator for Claude SDK streaming responses
 * Yields normalized events compatible with ProviderStreamNormalizer
 *
 * SDK Message Types:
 * - system (subtype: init): Session initialization
 * - assistant: Model responses with message.content
 * - result (subtype: success/error_*): Final results with usage
 */
async function* createStreamingGenerator(queryFn, prompt, options, signal) {
  try {
    // Build query options
    const queryOptions = {
      maxTurns: 1, // Single turn for chat
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

    // Create query generator
    const response = queryFn({
      prompt,
      options: queryOptions,
    });

    let _sessionId = null;
    let _modelUsed = 'claude';
    let _accumulatedContent = '';

    // Yield start event
    yield {
      type: 'start',
      provider: 'claude',
      model: 'claude',
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
          _modelUsed = message.model || 'claude';
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
      temperature,
      use_websearch,
    } = options;

    // Validate configuration
    if (!config) {
      throw new ClaudeProviderError(
        'Configuration is required',
        ErrorCodes.MISSING_API_KEY,
      );
    }

    // Log unsupported parameters at debug level
    if (temperature !== undefined) {
      debugLog(
        '[Claude SDK] Parameter "temperature" not supported by Claude SDK (ignored)',
      );
    }
    if (use_websearch) {
      debugLog(
        '[Claude SDK] Parameter "use_websearch" not supported by Claude SDK (ignored)',
      );
    }
    if (reasoning_effort !== undefined) {
      debugLog(
        '[Claude SDK] Parameter "reasoning_effort" not supported by Claude SDK (ignored)',
      );
    }

    try {
      // Get Claude SDK
      const query = await getClaudeSDK();

      // Convert messages to prompt
      const prompt = convertMessagesToPrompt(messages);

      // Build SDK options
      const sdkOptions = {
        cwd: config.server?.client_cwd || process.cwd(),
      };

      // Streaming mode
      if (stream) {
        return createStreamingGenerator(query, prompt, sdkOptions, signal);
      }

      // Synchronous mode: consume streaming internally and return complete response
      const startTime = Date.now();
      const generator = createStreamingGenerator(
        query,
        prompt,
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
          model,
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
	 */
  getModelConfig(modelName) {
    const modelNameLower = modelName.toLowerCase();

    // Check exact match
    if (SUPPORTED_MODELS[modelNameLower]) {
      return SUPPORTED_MODELS[modelNameLower];
    }

    // Check aliases
    for (const [_name, config] of Object.entries(SUPPORTED_MODELS)) {
      if (
        config.aliases &&
				config.aliases.some((alias) => alias.toLowerCase() === modelNameLower)
      ) {
        return config;
      }
    }

    return null;
  },
};
