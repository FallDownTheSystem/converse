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
import { normalizeExtendedPath } from '../utils/pathUtils.js';

// Supported Codex models with their configurations
const SUPPORTED_MODELS = {
  codex: {
    modelName: 'codex',
    friendlyName: 'OpenAI Codex (GPT-5.6)',
    contextWindow: 400000,
    maxOutputTokens: 128000,
    supportsStreaming: true,
    supportsImages: true, // Codex SDK 0.118+ supports images via --image (local_image input)
    supportsWebSearch: false, // Codex accesses files directly, not web
    // Reasoning tiers this model's backend actually accepts. GPT-5.6 dropped
    // 'minimal' and added 'none', while the SDK's ModelReasoningEffort type
    // still advertises the pre-5.6 set — the backend is the authority, so the
    // accepted tiers are declared per model and requests are clamped onto them.
    supportedEfforts: ['none', 'low', 'medium', 'high', 'xhigh'],
    timeout: 1800000, // 30 minutes
    description:
      'OpenAI Codex agentic coding assistant with local file access and tool execution (GPT-5.6)',
    aliases: [
      'gpt-5-codex',
      'gpt5-codex',
      'gpt-5.2-codex',
      'gpt-5.3-codex',
      'gpt5.3-codex',
      'gpt-5.5',
      'gpt5.5',
      'gpt-5.6-codex',
      'gpt5.6-codex',
    ],
  },
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
      'CODEX_NOT_INSTALLED',
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
      error,
    );
  }
}

/**
 * Convert message array to Codex SDK Input (string | UserInput[])
 * Codex expects single prompts (new thread) or incremental input (resumed thread);
 * history is managed SDK-side.
 *
 * Returns a plain string when the last user message is text-only, or an array
 * of { type: 'text' | 'local_image' } parts when images are present. The SDK
 * passes local_image paths to the CLI via --image.
 *
 * Images must be on-disk files — Converse stores the original path in
 * metadata.path (chat.js sets includeMetadata: true). Images
 * without a path (e.g. pasted base64 with no metadata) are skipped.
 */
function convertMessagesToCodexInput(messages) {
  if (!Array.isArray(messages)) {
    throw new CodexProviderError(
      'Messages must be an array',
      ErrorCodes.INVALID_MESSAGES,
    );
  }

  if (messages.length === 0) {
    throw new CodexProviderError(
      'Messages array cannot be empty',
      ErrorCodes.INVALID_MESSAGES,
    );
  }

  const lastUserMessage = messages.filter((m) => m.role === 'user').pop();

  if (!lastUserMessage) {
    throw new CodexProviderError(
      'No user message found in messages array',
      ErrorCodes.INVALID_MESSAGES,
    );
  }

  if (typeof lastUserMessage.content === 'string') {
    return lastUserMessage.content;
  }

  if (Array.isArray(lastUserMessage.content)) {
    const parts = [];
    let droppedImages = 0;
    for (const item of lastUserMessage.content) {
      if (item.type === 'text' && item.text) {
        parts.push({ type: 'text', text: item.text });
      } else if (item.type === 'image') {
        const imagePath = item.metadata?.path || item.metadata?.originalPath;
        if (imagePath) {
          parts.push({ type: 'local_image', path: imagePath });
        } else {
          droppedImages += 1;
        }
      }
    }

    if (droppedImages > 0) {
      debugLog(
        `[Codex] Skipped ${droppedImages} image(s) without a file path — Codex requires on-disk images`,
      );
    }

    if (parts.length === 0) {
      throw new CodexProviderError(
        'Message contained no usable text or image parts',
        ErrorCodes.INVALID_MESSAGES,
      );
    }

    // Collapse to plain string when there are no images — keeps the non-image
    // path identical to the legacy behavior and slightly simpler for the SDK.
    if (parts.every((p) => p.type === 'text')) {
      return parts.map((p) => p.text).join('\n');
    }

    return parts;
  }

  throw new CodexProviderError(
    'Invalid message content format',
    ErrorCodes.INVALID_MESSAGES,
  );
}

/**
 * Extract the combined text from a Codex SDK Input for prompt-based checks
 * like $imagegen detection.
 */
function extractPromptText(input) {
  if (typeof input === 'string') return input;
  return input
    .filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join('\n\n');
}

/**
 * Get thread ID from continuation metadata.
 * Codex thread IDs are stored per call-plan in `providerThreads`, keyed by a
 * stable `threadKey` (the requested model spec, e.g. "auto" or "codex") passed
 * through provider options — NOT the resolved provider/model, so an "auto" spec
 * that resolves to Codex still finds its thread on the next turn.
 */
async function getThreadIdFromContinuation(
  continuationId,
  continuationStore,
  threadKey,
) {
  try {
    const state = await continuationStore.get(continuationId);
    return state?.providerThreads?.[threadKey] || null;
  } catch (error) {
    debugError('[Codex] Failed to retrieve continuation state', error);
    return null;
  }
}

/**
 * Every Codex reasoning tier, weakest to strongest. Used to clamp a requested
 * tier onto the set a given model actually accepts.
 */
const EFFORT_LADDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];

/**
 * Tool-level reasoning_effort values translated to their Codex equivalent.
 * Tool enum: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'max'
 */
const EFFORT_ALIASES = {
  none: 'none',
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
  max: 'xhigh',
};

/**
 * Map a tool-level reasoning_effort onto a tier the target model accepts.
 *
 * When the requested tier isn't in the model's supported set, the nearest
 * *stronger* tier wins: nudging 'minimal' up to 'low' keeps reasoning on,
 * where falling back to 'none' would silently switch it off.
 *
 * @param {string} effort - Tool-level reasoning_effort value
 * @param {string[]} [supported] - Tiers the model accepts
 * @returns {string} A tier from `supported`
 */
export function mapReasoningEffort(effort, supported = EFFORT_LADDER) {
  const desired = EFFORT_ALIASES[effort] || 'medium';
  if (supported.includes(desired)) {
    return desired;
  }

  const rank = EFFORT_LADDER.indexOf(desired);
  const stronger = EFFORT_LADDER.slice(rank + 1).find((tier) =>
    supported.includes(tier),
  );
  if (stronger) {
    return stronger;
  }

  const weaker = EFFORT_LADDER.slice(0, rank)
    .reverse()
    .find((tier) => supported.includes(tier));
  return weaker || 'medium';
}

/**
 * Resolve a user-facing model name to its entry in SUPPORTED_MODELS.
 * @param {string} modelName
 * @returns {Object|null}
 */
function findModelConfig(modelName) {
  const modelNameLower = String(modelName || '').toLowerCase();

  if (SUPPORTED_MODELS[modelNameLower]) {
    return SUPPORTED_MODELS[modelNameLower];
  }

  for (const config of Object.values(SUPPORTED_MODELS)) {
    if (
      config.aliases &&
      config.aliases.some((alias) => alias.toLowerCase() === modelNameLower)
    ) {
      return config;
    }
  }

  return null;
}

/**
 * Create stream generator for Codex streaming responses.
 * `input` is the Codex SDK Input (string | UserInput[]) — strings for plain
 * text turns, arrays when images are attached.
 * Yields raw Codex SDK events that will be normalized by ProviderStreamNormalizer.
 */
async function* createStreamingGenerator(thread, input, signal) {
  try {
    const { events } = await thread.runStreamed(input, { signal });

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
      threadKey,
      reasoning_effort,
    } = options;

    // Validate configuration
    if (!config) {
      throw new CodexProviderError(
        'Configuration is required',
        ErrorCodes.MISSING_API_KEY,
      );
    }

    try {
      // Get Codex SDK
      const Codex = await getCodexSDK();

      // Convert messages to Codex SDK input (string or structured parts with images)
      const input = convertMessagesToCodexInput(messages);
      const promptText = extractPromptText(input);

      // Get thread ID if resuming conversation
      const threadId =
        continuation_id && continuationStore && threadKey
          ? await getThreadIdFromContinuation(
            continuation_id,
            continuationStore,
            threadKey,
          )
          : null;

      // Initialize Codex with API key if provided
      const codexApiKey = config.providers?.codexapikey;
      const codexOptions = {};

      if (codexApiKey) {
        codexOptions.apiKey = codexApiKey;
      }

      const codex = new Codex(codexOptions);

      // Read configuration values (with secure defaults)
      // Note: Using CLIENT_CWD directly, no separate CODEX_WORKING_DIRECTORY
      const rawWorkingDirectory = config.server?.client_cwd || process.cwd();
      // Normalize Windows extended-length paths (\\?\C:\...) to regular paths
      const workingDirectory = normalizeExtendedPath(rawWorkingDirectory);
      const configuredSandboxMode =
        config.providers?.codexsandboxmode || 'read-only';
      // Auto-elevate read-only sandbox to workspace-write when the prompt opts
      // into image generation via $imagegen — otherwise Codex can't save the
      // generated file. Leave higher modes (workspace-write, danger-full-access)
      // alone so an explicit user choice is never downgraded or escalated.
      const wantsImageGen = /\$imagegen\b/i.test(promptText);
      const sandboxMode =
        wantsImageGen && configuredSandboxMode === 'read-only'
          ? 'workspace-write'
          : configuredSandboxMode;
      if (sandboxMode !== configuredSandboxMode) {
        debugLog(
          '[Codex] $imagegen detected — elevating sandboxMode from read-only to workspace-write so the image file can be written',
        );
      }
      const skipGitRepoCheck =
        config.providers?.codexskipgitcheck !== undefined
          ? config.providers.codexskipgitcheck
          : true;
      const approvalPolicy = config.providers?.codexapprovalpolicy || 'never';

      // Create or resume thread
      const threadOptions = {
        model: config.providers?.codexmodel,
        workingDirectory,
        sandboxMode,
        skipGitRepoCheck,
        approvalPolicy,
      };

      if (reasoning_effort) {
        const supportedEfforts =
          findModelConfig(model)?.supportedEfforts ||
          SUPPORTED_MODELS.codex.supportedEfforts;
        const mappedEffort = mapReasoningEffort(reasoning_effort, supportedEfforts);
        threadOptions.modelReasoningEffort = mappedEffort;
        if (mappedEffort !== EFFORT_ALIASES[reasoning_effort]) {
          debugLog(
            `[Codex] reasoning_effort "${reasoning_effort}" not supported by ${model} — using "${mappedEffort}"`,
          );
        }
      }

      const thread = threadId
        ? codex.resumeThread(threadId, threadOptions)
        : codex.startThread(threadOptions);

      // WORKAROUND: SDK's thread.run() hangs due to missing break after turn.completed
      // Always use streaming internally, consume synchronously when stream=false
      if (stream) {
        return createStreamingGenerator(thread, input, signal);
      }

      // Synchronous mode: consume streaming internally and return complete response
      const startTime = Date.now();
      const generator = createStreamingGenerator(thread, input, signal);

      let content = '';
      let usage = null;
      let threadIdFromStream = null;

      for await (const event of generator) {
        if (event?.type === 'thread.started') {
          threadIdFromStream = event.thread_id;
        } else if (
          event?.type === 'item.completed' &&
          event.item?.type === 'agent_message'
        ) {
          content += event.item.text || '';
        } else if (event?.type === 'turn.completed') {
          usage = event.usage;
          break; // Exit after turn.completed
        } else if (event?.type === 'turn.failed') {
          throw new CodexProviderError(
            event.error?.message || 'Turn failed',
            'TURN_FAILED',
          );
        }
      }

      const responseTime = Date.now() - startTime;

      return {
        content,
        stop_reason: StopReasons.STOP,
        rawResponse: { content, usage },
        metadata: {
          provider: 'codex',
          model,
          threadId: threadIdFromStream || thread.id,
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
      debugError('[Codex] Execution error', error);

      // Map common errors to standard error codes
      if (error.message?.includes('authentication')) {
        throw new CodexProviderError(
          'Codex authentication failed. Ensure ChatGPT login or CODEX_API_KEY is set.',
          ErrorCodes.INVALID_API_KEY,
          error,
        );
      }

      if (error.message?.includes('not a git repository')) {
        throw new CodexProviderError(
          'Not a Git repository. Use CODEX_SKIP_GIT_CHECK=true or run \'git init\'',
          'CONFIGURATION_ERROR',
          error,
        );
      }

      if (error.message?.includes('timeout')) {
        throw new CodexProviderError(
          'Codex execution timeout',
          ErrorCodes.TIMEOUT_ERROR,
          error,
        );
      }

      // Re-throw as Codex error
      throw new CodexProviderError(
        error.message || 'Codex execution failed',
        ErrorCodes.API_ERROR,
        error,
      );
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
    return findModelConfig(modelName);
  },
};
