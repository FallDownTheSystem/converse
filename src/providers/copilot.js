/**
 * Copilot SDK Provider
 *
 * Provider implementation for GitHub Copilot models using the @github/copilot-sdk.
 * Implements the unified interface: async invoke(messages, options) => { content, stop_reason, rawResponse }
 *
 * Key differences from traditional providers:
 * - Uses GitHub Copilot CLI subscription authentication - NOT API keys
 * - Manages a singleton CopilotClient (spawns CLI process via JSON-RPC)
 * - Creates a fresh CopilotSession per request, destroyed after each request
 * - Bridges SDK push-based events to pull-based async generator for streaming
 * - Requires Copilot CLI installed and authenticated (copilot auth login)
 */

import { debugLog, debugError } from '../utils/console.js';
import { ProviderError, ErrorCodes, StopReasons } from './interface.js';

const SUPPORTED_MODELS = {
  copilot: {
    modelName: 'copilot',
    friendlyName: 'GitHub Copilot (via CLI SDK)',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsStreaming: true,
    supportsImages: false,
    supportsTemperature: false,
    supportsWebSearch: false,
    timeout: 120000,
    description:
      'GitHub Copilot via CLI SDK - requires copilot auth login authentication',
    aliases: ['copilot-sdk', 'github-copilot'],
  },
};

class CopilotProviderError extends ProviderError {
  constructor(message, code, originalError = null) {
    super(message, code, originalError);
    this.name = 'CopilotProviderError';
  }
}

/**
 * Check if Copilot SDK is available (installed as dependency)
 */
let _sdkAvailable = null;
function isCopilotSDKAvailable() {
  if (_sdkAvailable !== null) return _sdkAvailable;
  try {
    // Use synchronous resolve to check if the package exists
    import.meta.resolve('@github/copilot-sdk');
    _sdkAvailable = true;
  } catch {
    _sdkAvailable = false;
  }
  return _sdkAvailable;
}

/**
 * Dynamically import Copilot SDK (lazy loading)
 */
async function getCopilotSDK() {
  try {
    const { CopilotClient } = await import('@github/copilot-sdk');
    return CopilotClient;
  } catch (error) {
    throw new CopilotProviderError(
      'Copilot SDK not available. Ensure @github/copilot-sdk is installed and Copilot CLI is authenticated (copilot auth login).',
      ErrorCodes.API_ERROR,
      error,
    );
  }
}

// Module-level singleton client
let clientInstance = null;
let clientInitPromise = null;

/**
 * Get or create the singleton CopilotClient
 * The client manages the CLI process lifecycle via JSON-RPC
 */
async function getCopilotClient(cwd) {
  if (clientInstance) {
    return clientInstance;
  }

  if (clientInitPromise) {
    return clientInitPromise;
  }

  clientInitPromise = (async () => {
    const CopilotClient = await getCopilotSDK();
    clientInstance = new CopilotClient({
      autoStart: true,
      autoRestart: true,
      useLoggedInUser: true,
      cwd: cwd || process.cwd(),
    });
    await clientInstance.start();
    debugLog('[Copilot SDK] Client started (cwd: %s)', clientInstance.options?.cwd || cwd);
    return clientInstance;
  })();

  try {
    return await clientInitPromise;
  } catch (error) {
    clientInitPromise = null;
    clientInstance = null;
    throw error;
  }
}

/**
 * Convert message array to single prompt for Copilot
 * Copilot expects single prompts, not message history
 */
function convertMessagesToPrompt(messages) {
  if (!Array.isArray(messages)) {
    throw new CopilotProviderError(
      'Messages must be an array',
      ErrorCodes.INVALID_MESSAGES,
    );
  }

  if (messages.length === 0) {
    throw new CopilotProviderError(
      'Messages array cannot be empty',
      ErrorCodes.INVALID_MESSAGES,
    );
  }

  const lastUserMessage = messages.filter((m) => m.role === 'user').pop();

  if (!lastUserMessage) {
    throw new CopilotProviderError(
      'No user message found in messages array',
      ErrorCodes.INVALID_MESSAGES,
    );
  }

  if (typeof lastUserMessage.content === 'string') {
    return lastUserMessage.content;
  }

  if (Array.isArray(lastUserMessage.content)) {
    const hasImages = lastUserMessage.content.some(
      (item) => item.type === 'image',
    );
    if (hasImages) {
      debugLog(
        '[Copilot SDK] Warning: Images in message will be ignored (Copilot SDK does not support base64 images)',
      );
    }

    const textParts = lastUserMessage.content
      .filter((item) => item.type === 'text')
      .map((item) => item.text);

    return textParts.join('\n');
  }

  throw new CopilotProviderError(
    'Invalid message content format',
    ErrorCodes.INVALID_MESSAGES,
  );
}

/**
 * Get tool access level from config
 * @param {object} config - Server configuration object
 * @returns {'read-only' | 'full'}
 */
function getToolAccessLevel(config) {
  const level = config?.providers?.copilottoolaccess || 'read-only';
  return level === 'full' ? 'full' : 'read-only';
}

/**
 * Create permission handler based on tool access level
 */
function createPermissionHandler(accessLevel) {
  return (request) => {
    if (accessLevel === 'full') {
      return { kind: 'approved' };
    }

    // Read-only: allow read, deny everything else
    if (request.kind === 'read') {
      return { kind: 'approved' };
    }

    debugLog(
      `[Copilot SDK] Permission denied for ${request.kind} (tool access: read-only)`,
    );
    return { kind: 'denied-by-rules' };
  };
}

/**
 * Resolve model to pass to SDK session
 * Precedence: explicit model param > config COPILOT_MODEL > omit (SDK default)
 *
 * Note: "copilot" is a Converse routing alias, not a valid SDK model ID.
 * Only pass through model names that are actual SDK model IDs.
 */
function resolveSessionModel(requestModel, config) {
  const converseAliases = ['copilot', 'copilot-sdk', 'github-copilot'];

  // If user specified a non-alias model name, pass it to SDK
  if (requestModel && !converseAliases.includes(requestModel.toLowerCase())) {
    return requestModel;
  }

  // Fall back to config value
  if (config?.providers?.copilotmodel) {
    return config.providers.copilotmodel;
  }

  // Omit — let SDK use its default
  return undefined;
}

/**
 * Create streaming generator that bridges SDK push-based events to pull-based async generator
 * Yields normalized events: start → delta(s) → usage? → end
 *
 * SDK Event Types (from session-events.d.ts):
 * - assistant.message_delta → { data: { deltaContent } }
 * - assistant.message → { data: { content } } (final complete message)
 * - assistant.usage → { data: { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } }
 * - assistant.reasoning_delta → { data: { deltaContent } }
 * - session.idle → processing complete
 * - session.error → { data: { errorType, message } }
 */
async function* createStreamingGenerator(client, prompt, options, signal, config) {
  const { model, timeout = 120000 } = options;

  const sessionModel = resolveSessionModel(model, config);
  const accessLevel = getToolAccessLevel(config);

  const sessionConfig = {
    streaming: true,
    onPermissionRequest: createPermissionHandler(accessLevel),
  };

  if (sessionModel) {
    sessionConfig.model = sessionModel;
  }

  const session = await client.createSession(sessionConfig);

  try {
    yield {
      type: 'start',
      provider: 'copilot',
      model: sessionModel || 'copilot',
    };

    // Bridge push-based SDK events to pull-based generator using queue + promise
    const eventQueue = [];
    let waitResolve = null;
    let done = false;
    let streamError = null;
    let usageData = null;

    const unsubscribe = session.on((event) => {
      switch (event.type) {
      case 'assistant.message_delta':
        eventQueue.push({
          type: 'delta',
          data: { textDelta: event.data.deltaContent },
        });
        break;

      case 'assistant.message':
        // Final complete message — use as fallback if deltas were coalesced
        if (event.data.content) {
          eventQueue.push({
            type: 'delta',
            data: { textDelta: event.data.content },
          });
        }
        break;

      case 'assistant.usage':
        usageData = {
          input_tokens: event.data.inputTokens || 0,
          output_tokens: event.data.outputTokens || 0,
          total_tokens:
              (event.data.inputTokens || 0) + (event.data.outputTokens || 0),
          cached_input_tokens: event.data.cacheReadTokens || 0,
        };
        break;

      case 'session.idle':
        done = true;
        break;

      case 'session.error':
        streamError = new CopilotProviderError(
          event.data.message || 'Session error',
          ErrorCodes.API_ERROR,
        );
        done = true;
        break;
      }

      // Wake up the generator if it's waiting
      if (waitResolve) {
        const resolve = waitResolve;
        waitResolve = null;
        resolve();
      }
    });

    // Set up timeout
    const timeoutId = setTimeout(() => {
      streamError = new CopilotProviderError(
        'Copilot SDK execution timeout',
        ErrorCodes.TIMEOUT_ERROR,
      );
      done = true;
      if (waitResolve) {
        const resolve = waitResolve;
        waitResolve = null;
        resolve();
      }
    }, timeout);

    try {
      // Send the prompt — SDK returns a Promise; await to catch send errors
      await session.send({ prompt });

      // Pull events from queue until done
      while (!done || eventQueue.length > 0) {
        if (signal?.aborted) {
          throw new CopilotProviderError('Request cancelled', 'CANCELLED');
        }

        if (eventQueue.length === 0 && !done) {
          await new Promise((resolve) => {
            waitResolve = resolve;
          });
          continue;
        }

        while (eventQueue.length > 0) {
          yield eventQueue.shift();
        }
      }

      if (streamError) {
        throw streamError;
      }

      // Yield usage if available
      if (usageData) {
        yield { type: 'usage', usage: usageData };
      }

      yield {
        type: 'end',
        stop_reason: StopReasons.STOP,
        finish_reason: 'stop',
      };
    } finally {
      clearTimeout(timeoutId);
      unsubscribe();
    }
  } finally {
    try {
      await session.destroy();
    } catch (destroyError) {
      debugError('[Copilot SDK] Session destroy error', destroyError);
    }
  }
}

/**
 * Copilot SDK Provider Implementation
 */
export const copilotProvider = {
  async invoke(messages, options = {}) {
    const {
      model = 'copilot',
      config,
      stream = false,
      signal,
      reasoning_effort,
      temperature,
      use_websearch,
    } = options;

    if (!config) {
      throw new CopilotProviderError(
        'Configuration is required',
        ErrorCodes.MISSING_API_KEY,
      );
    }

    if (temperature !== undefined) {
      debugLog(
        '[Copilot SDK] Parameter "temperature" not supported by Copilot SDK (ignored)',
      );
    }
    if (use_websearch) {
      debugLog(
        '[Copilot SDK] Parameter "use_websearch" not supported by Copilot SDK (ignored)',
      );
    }
    if (reasoning_effort !== undefined) {
      debugLog(
        '[Copilot SDK] Parameter "reasoning_effort" not supported by Copilot SDK (ignored)',
      );
    }

    try {
      const cwd = config.server?.client_cwd || process.cwd();
      const client = await getCopilotClient(cwd);
      const prompt = convertMessagesToPrompt(messages);

      const modelConfig = SUPPORTED_MODELS.copilot;
      const invokeOptions = {
        model,
        timeout: modelConfig.timeout,
      };

      if (stream) {
        return createStreamingGenerator(client, prompt, invokeOptions, signal, config);
      }

      // Synchronous mode: consume streaming internally
      const startTime = Date.now();
      const generator = createStreamingGenerator(
        client,
        prompt,
        invokeOptions,
        signal,
        config,
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
          provider: 'copilot',
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
      debugError('[Copilot SDK] Execution error', error);

      if (
        error.message?.includes('authentication') ||
        error.message?.includes('auth') ||
        error.message?.includes('not authenticated') ||
        error.message?.includes('login')
      ) {
        throw new CopilotProviderError(
          'Copilot SDK authentication failed. Install and authenticate Copilot CLI: copilot auth login',
          ErrorCodes.INVALID_API_KEY,
          error,
        );
      }

      if (error.message?.includes('timeout')) {
        throw new CopilotProviderError(
          'Copilot SDK execution timeout',
          ErrorCodes.TIMEOUT_ERROR,
          error,
        );
      }

      if (error.message?.includes('rate limit')) {
        throw new CopilotProviderError(
          'Rate limit exceeded',
          ErrorCodes.RATE_LIMIT_EXCEEDED,
          error,
        );
      }

      if (error instanceof CopilotProviderError) {
        throw error;
      }

      throw new CopilotProviderError(
        error.message || 'Copilot SDK execution failed',
        ErrorCodes.API_ERROR,
        error,
      );
    }
  },

  /**
   * Validate Copilot SDK configuration
   * Returns true optimistically — auth errors surface at runtime
   */
  validateConfig(_config) {
    return isCopilotSDKAvailable();
  },

  isAvailable(config) {
    return this.validateConfig(config);
  },

  getSupportedModels() {
    return SUPPORTED_MODELS;
  },

  getModelConfig(modelName) {
    const modelNameLower = modelName.toLowerCase();

    if (SUPPORTED_MODELS[modelNameLower]) {
      return SUPPORTED_MODELS[modelNameLower];
    }

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
