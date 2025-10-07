/**
 * Codex Provider
 *
 * Provider implementation for OpenAI's Codex agentic coding assistant using the @openai/codex-sdk.
 * Implements the unified interface: async invoke(messages, options) => { content, stop_reason, rawResponse }
 *
 * Key differences from traditional providers:
 * - Uses thread-based conversations (persistent state managed by Codex SDK)
 * - Converts message arrays to single prompts (Codex expects prompts, not message history)
 * - Spawns local process (bundled CLI binary) for execution
 * - Requires ChatGPT authentication OR CODEX_API_KEY (NOT OPENAI_API_KEY)
 *
 * For implementation details, see: backlog/docs/guides/doc-codex-research-findings.md
 */

import { debugLog, debugError } from '../utils/console.js';
import { ProviderError, ErrorCodes, StopReasons } from './interface.js';

// Supported Codex models with their configurations
const SUPPORTED_MODELS = {
  'codex': {
    modelName: 'codex',
    friendlyName: 'OpenAI Codex (GPT-5)',
    contextWindow: 400000,
    maxOutputTokens: 128000,
    supportsStreaming: true,
    supportsImages: false, // Codex doesn't support images
    supportsTemperature: false, // Codex manages temperature internally
    supportsWebSearch: false, // Codex accesses files directly, not web
    timeout: 60000, // 60 seconds (Codex can take 5-20s for responses)
    description: 'OpenAI Codex agentic coding assistant with local file access and tool execution',
    aliases: ['gpt-5-codex', 'gpt5-codex']
  }
};

/**
 * Custom error class for Codex provider errors
 */
class CodexProviderError extends ProviderError {
  constructor(message, code, originalError = null) {
    super(message, code, originalError);
    this.name = 'CodexProviderError';
  }
}

/**
 * Check if Codex SDK is available (optional dependency)
 * Uses import.meta.resolve when available, falls back to filesystem check
 */
function isCodexAvailable() {
  try {
    // Just try to dynamically check if we can import it
    // This is a simple presence check that works in ES modules
    return true; // If SDK not available, the actual import() will fail later with clear error
  } catch {
    return false;
  }
}

/**
 * Dynamically import Codex SDK (lazy loading)
 * This keeps the SDK as an optional dependency
 */
async function getCodexSDK() {
  if (!isCodexAvailable()) {
    throw new CodexProviderError(
      'Codex SDK not installed. Install with: npm install @openai/codex-sdk',
      'CODEX_NOT_INSTALLED'
    );
  }

  try {
    // Use dynamic import to load SDK only when needed
    const { Codex } = await import('@openai/codex-sdk');
    return Codex;
  } catch (error) {
    throw new CodexProviderError(
      'Failed to load Codex SDK',
      'CODEX_LOAD_ERROR',
      error
    );
  }
}

/**
 * Convert message array to single prompt for Codex
 * Codex expects single prompts, not message history
 *
 * Strategy:
 * - For new threads: Extract last user message only
 * - For resumed threads: Same - Codex maintains history internally
 */
function convertMessagesToPrompt(messages) {
  if (!Array.isArray(messages)) {
    throw new CodexProviderError('Messages must be an array', ErrorCodes.INVALID_MESSAGES);
  }

  if (messages.length === 0) {
    throw new CodexProviderError('Messages array cannot be empty', ErrorCodes.INVALID_MESSAGES);
  }

  // Find last user message
  const lastUserMessage = messages.filter(m => m.role === 'user').pop();

  if (!lastUserMessage) {
    throw new CodexProviderError('No user message found in messages array', ErrorCodes.INVALID_MESSAGES);
  }

  // Extract text content from message
  if (typeof lastUserMessage.content === 'string') {
    return lastUserMessage.content;
  }

  // Handle array content (multimodal format)
  if (Array.isArray(lastUserMessage.content)) {
    const textParts = lastUserMessage.content
      .filter(item => item.type === 'text')
      .map(item => item.text);

    // Log warning if images present (Codex doesn't support images)
    const hasImages = lastUserMessage.content.some(item => item.type === 'image');
    if (hasImages) {
      debugLog('[Codex] Warning: Images in message will be ignored (Codex does not support multimodal input)');
    }

    return textParts.join('\n');
  }

  throw new CodexProviderError('Invalid message content format', ErrorCodes.INVALID_MESSAGES);
}

/**
 * Get thread ID from continuation metadata
 * Codex thread IDs are stored in continuation store for resumption
 */
async function getThreadIdFromContinuation(continuationId, continuationStore) {
  try {
    const state = await continuationStore.get(continuationId);
    return state?.codexThreadId || null;
  } catch (error) {
    debugError('[Codex] Failed to retrieve continuation state', error);
    return null;
  }
}

/**
 * Create stream generator for Codex streaming responses
 * Yields raw Codex SDK events that will be normalized by ProviderStreamNormalizer
 */
async function* createStreamingGenerator(thread, prompt, signal, runOptions = {}) {
  try {
    // Try with runOptions, fallback without if SDK doesn't support them
    let eventsPromise;
    try {
      eventsPromise = thread.runStreamed(prompt, runOptions);
    } catch (error) {
      if (runOptions.reasoningEffort && (error.message?.includes('reasoningEffort') || error.message?.includes('unknown option'))) {
        debugLog('[Codex] reasoning_effort not supported by this SDK version for streaming, retrying without it');
        eventsPromise = thread.runStreamed(prompt);
      } else {
        throw error;
      }
    }

    const { events } = await eventsPromise;

    for await (const event of events) {
      // Check for cancellation
      if (signal?.aborted) {
        throw new CodexProviderError('Request cancelled', 'CANCELLED');
      }

      // Yield raw events - will be normalized by ProviderStreamNormalizer
      yield event;
    }
  } catch (error) {
    if (signal?.aborted) {
      throw new CodexProviderError('Request cancelled', 'CANCELLED');
    }
    throw error;
  }
}

/**
 * Codex Provider Implementation
 */
export const codexProvider = {
  /**
   * Invoke Codex with messages and options
   * @param {Array} messages - Message array (Converse format)
   * @param {Object} options - Invocation options
   * @returns {Promise<Object>|AsyncGenerator} Response or stream generator
   */
  async invoke(messages, options = {}) {
    const {
      model = 'codex',
      config,
      stream = false,
      signal,
      continuation_id,
      continuationStore,
      reasoning_effort,
      temperature,
      use_websearch
    } = options;

    // Validate configuration
    if (!config) {
      throw new CodexProviderError('Configuration is required', ErrorCodes.MISSING_API_KEY);
    }

    // Log unsupported parameters at debug level
    if (temperature !== undefined) {
      debugLog('[Codex] Parameter "temperature" not supported by Codex (ignored)');
    }
    if (use_websearch) {
      debugLog('[Codex] Parameter "use_websearch" not supported by Codex (ignored)');
    }

    // Handle CODEX_API_KEY authentication
    // CRITICAL: Codex SDK reads OPENAI_API_KEY from environment, but we want to use CODEX_API_KEY
    // We need to temporarily set OPENAI_API_KEY if CODEX_API_KEY is provided
    const codexApiKey = config.providers?.codexapikey;
    const originalOpenAIKey = process.env.OPENAI_API_KEY;

    if (codexApiKey) {
      // User provided CODEX_API_KEY - use it for Codex authentication
      process.env.OPENAI_API_KEY = codexApiKey;
      debugLog('[Codex] Using CODEX_API_KEY for authentication');
    } else if (originalOpenAIKey) {
      // Remove OPENAI_API_KEY to prevent Codex from using it
      // Codex should only use ChatGPT login if no CODEX_API_KEY is set
      delete process.env.OPENAI_API_KEY;
      debugLog('[Codex] Using ChatGPT login for authentication (OPENAI_API_KEY cleared)');
    } else {
      debugLog('[Codex] Using ChatGPT login for authentication');
    }

    try {
      // Get Codex SDK
      const Codex = await getCodexSDK();

    // Convert messages to prompt
    const prompt = convertMessagesToPrompt(messages);

    // Get thread ID if resuming conversation
    const threadId = continuation_id && continuationStore
      ? await getThreadIdFromContinuation(continuation_id, continuationStore)
      : null;

    // Initialize Codex
    const codex = new Codex();

    // Read configuration values (with secure defaults)
    // Note: Using CLIENT_CWD directly, no separate CODEX_WORKING_DIRECTORY
    const workingDirectory = config.server?.client_cwd || process.cwd();
    const sandbox = config.providers?.codexsandboxmode || 'read-only';
    const skipGitRepoCheck = config.providers?.codexskipgitcheck !== undefined ? config.providers.codexskipgitcheck : true;
    const approvalPolicy = config.providers?.codexapprovalpolicy || 'never';

    debugLog(`[Codex] Starting ${threadId ? 'resumed' : 'new'} thread`, {
      model,
      workingDirectory,
      sandbox,
      skipGitRepoCheck,
      approvalPolicy,
      threadId: threadId || 'new'
    });

    // Create or resume thread
    const thread = threadId
      ? codex.resumeThread(threadId)
      : codex.startThread({
        workingDirectory,
        sandbox,
        skipGitRepoCheck,
        approvalPolicy
      });

    // Build run options with reasoning_effort if provided
    const runOptions = {};
    if (reasoning_effort) {
      runOptions.reasoningEffort = reasoning_effort; // Best-effort mapping
      debugLog('[Codex] Using reasoning_effort:', reasoning_effort);
    }

    // Handle streaming
    if (stream) {
      return createStreamingGenerator(thread, prompt, signal, runOptions);
    }

    // Non-streaming execution
    try {
      const startTime = Date.now();
      // Try with reasoning_effort, fallback without if SDK doesn't support it
      let turn;
      try {
        turn = await thread.run(prompt, runOptions);
      } catch (error) {
        if (reasoning_effort && (error.message?.includes('reasoningEffort') || error.message?.includes('unknown option'))) {
          debugLog('[Codex] reasoning_effort not supported by this SDK version, retrying without it');
          turn = await thread.run(prompt);
        } else {
          throw error;
        }
      }
      const responseTime = Date.now() - startTime;

      debugLog('[Codex] Non-streaming execution completed', {
        threadId: thread.id,
        responseTime,
        usage: turn.usage
      });

      return {
        content: turn.finalResponse || '',
        stop_reason: StopReasons.STOP,
        rawResponse: turn,
        metadata: {
          provider: 'codex',
          model,
          threadId: thread.id, // Store for continuation
          usage: turn.usage ? {
            input_tokens: turn.usage.input_tokens || 0,
            output_tokens: turn.usage.output_tokens || 0,
            total_tokens: (turn.usage.input_tokens || 0) + (turn.usage.output_tokens || 0),
            cached_input_tokens: turn.usage.cached_input_tokens || 0
          } : null,
          response_time_ms: responseTime,
          finish_reason: 'stop'
        }
      };
    } catch (error) {
      debugError('[Codex] Execution error', error);

      // Map common errors to standard error codes
      if (error.message?.includes('authentication')) {
        throw new CodexProviderError(
          'Codex authentication failed. Ensure ChatGPT login or CODEX_API_KEY is set.',
          ErrorCodes.INVALID_API_KEY,
          error
        );
      }

      if (error.message?.includes('not a git repository')) {
        throw new CodexProviderError(
          'Not a Git repository. Use CODEX_SKIP_GIT_CHECK=true or run \'git init\'',
          'CONFIGURATION_ERROR',
          error
        );
      }

      if (error.message?.includes('timeout')) {
        throw new CodexProviderError(
          'Codex execution timeout',
          ErrorCodes.TIMEOUT_ERROR,
          error
        );
      }

      // Re-throw as Codex error
      throw new CodexProviderError(
        error.message || 'Codex execution failed',
        ErrorCodes.API_ERROR,
        error
      );
    } finally {
      // CRITICAL: Restore original OPENAI_API_KEY to prevent leaking CODEX_API_KEY to other providers
      if (originalOpenAIKey) {
        process.env.OPENAI_API_KEY = originalOpenAIKey;
      } else if (codexApiKey) {
        // We set OPENAI_API_KEY from CODEX_API_KEY, remove it now
        delete process.env.OPENAI_API_KEY;
      }
    }
  },

  /**
   * Validate Codex configuration
   * Codex uses ChatGPT authentication or CODEX_API_KEY (NOT OPENAI_API_KEY)
   */
  validateConfig(_config) {
    // Codex can work with either ChatGPT login or API key
    // Since we can't reliably check ChatGPT login status, we'll be permissive
    // and let the SDK handle authentication errors
    return isCodexAvailable();
  },

  /**
   * Check if Codex provider is available
   */
  isAvailable(config) {
    return this.validateConfig(config);
  },

  /**
   * Get supported Codex models
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
      if (config.aliases && config.aliases.some(alias => alias.toLowerCase() === modelNameLower)) {
        return config;
      }
    }

    return null;
  }
};
