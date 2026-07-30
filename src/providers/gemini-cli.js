/**
 * Gemini CLI Provider (Antigravity CLI / agy subprocess)
 *
 * Provider implementation for Google's Gemini models via the Antigravity CLI
 * (`agy`, v1.0.7+) in print mode (`agy -p`), authenticated through the user's
 * Antigravity Google OAuth login. Replaces the previous
 * `ai-sdk-provider-gemini-cli` implementation, whose OAuth credentials Google
 * sunsets on 2026-06-18.
 *
 * Architecture: one-shot subprocess wrapper. Each invoke() serializes the full
 * messages array into a single prompt, spawns `agy` under a pseudo-terminal,
 * collects the printed response, and returns it. A PTY is REQUIRED: agy print
 * mode silently drops stdout in any non-TTY context (upstream bug
 * google-antigravity/antigravity-cli#76, unfixed as of v1.0.7).
 *
 * Authentication:
 * - Requires the Antigravity CLI (`agy`) installed and authenticated once
 *   interactively (`agy`) via Google OAuth. The first interactive login also
 *   establishes workspace trust for the user's home directory.
 *
 * The provider registry key remains 'gemini-cli' and the user-facing alias
 * remains 'gemini' for routing/normalization stability. Only three user-facing
 * model names are exposed: gemini (= gemini:pro), gemini:pro, gemini:flash.
 */

import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { randomUUID } from 'node:crypto';
import { debugLog, debugError } from '../utils/console.js';
import { ProviderError, ErrorCodes, StopReasons } from './interface.js';

// Prompts at or below this length pass directly as the -p argv value (fast
// path). Larger prompts are written to a file and -p carries a bootstrap
// instruction. Keeps argv well under the Windows 32,767-char CreateProcess
// ceiling (error 206).
const ARGV_PROMPT_LIMIT = 24000;

// Default print timeout (ms) when the tool layer passes none.
const DEFAULT_TIMEOUT_MS = 1800000;

// Extra wall-clock grace before the JS-side hard kill fires (ms).
const HARD_KILL_GRACE_MS = 15000;

// After pty.kill(), force-settle if onExit never fires (ms).
const POST_KILL_GRACE_MS = 5000;

// PTY width: wide enough that response lines rarely soft-wrap (soft-wrap inserts
// \r\n indistinguishable from real newlines). rows are irrelevant in print mode.
const PTY_COLS = 1000;

/**
 * Supported Gemini models. Only three user-facing names are exposed; each maps
 * to an agy display-name base that gets a reasoning-effort suffix appended at
 * spawn time. All are text-only (print mode has no image input channel).
 */
const SUPPORTED_MODELS = {
  gemini: {
    modelName: 'gemini',
    friendlyName: 'Gemini 3.1 Pro (via Antigravity CLI)',
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    supportsStreaming: true,
    supportsImages: false,
    supportsWebSearch: false,
    supportsThinking: true,
    timeout: DEFAULT_TIMEOUT_MS,
    description:
      'Gemini 3.1 Pro via Antigravity CLI (agy) - requires Antigravity Google OAuth login',
    aliases: ['gemini-cli'],
    // agy display-name base; reasoning_effort selects the parenthesized variant
    agyModelBase: 'Gemini 3.1 Pro',
  },
  'gemini:pro': {
    modelName: 'gemini:pro',
    friendlyName: 'Gemini 3.1 Pro (via Antigravity CLI)',
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    supportsStreaming: true,
    supportsImages: false,
    supportsWebSearch: false,
    supportsThinking: true,
    timeout: DEFAULT_TIMEOUT_MS,
    description:
      'Gemini 3.1 Pro via Antigravity CLI (agy) - explicit alias of `gemini`',
    aliases: [],
    agyModelBase: 'Gemini 3.1 Pro',
  },
  'gemini:flash': {
    modelName: 'gemini:flash',
    friendlyName: 'Gemini 3.5 Flash (via Antigravity CLI)',
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    supportsStreaming: true,
    supportsImages: false,
    supportsWebSearch: false,
    supportsThinking: true,
    timeout: DEFAULT_TIMEOUT_MS,
    description:
      'Gemini 3.5 Flash via Antigravity CLI (agy) - requires Antigravity Google OAuth login',
    aliases: ['flash'],
    agyModelBase: 'Gemini 3.5 Flash',
  },
};

/**
 * Custom error class for Gemini CLI (agy) provider errors
 */
class GeminiCliProviderError extends ProviderError {
  constructor(message, code, originalError = null) {
    super(message, code, originalError);
    this.name = 'GeminiCliProviderError';
  }
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit testing)
// ---------------------------------------------------------------------------

let _cachedAgyPath; // undefined = not probed; null = probed, not found

/**
 * Locate the agy binary: PATH first, then the platform install fallback.
 * Result is cached at module level (null cached if not found).
 * @returns {string|null} Absolute path to agy, or null if not found
 */
export function findAgyBinary() {
  if (_cachedAgyPath !== undefined) {
    return _cachedAgyPath;
  }

  const isWindows = process.platform === 'win32';
  const exe = isWindows ? 'agy.exe' : 'agy';

  // 1. PATH lookup
  const pathEnv = process.env.PATH || process.env.Path || '';
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    try {
      const candidate = join(dir, exe);
      if (existsSync(candidate)) {
        _cachedAgyPath = candidate;
        return _cachedAgyPath;
      }
    } catch {
      // ignore malformed PATH entries
    }
  }

  // 2. Platform install fallback
  try {
    if (isWindows) {
      const localAppData =
        process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
      const candidate = join(localAppData, 'agy', 'bin', 'agy.exe');
      if (existsSync(candidate)) {
        _cachedAgyPath = candidate;
        return _cachedAgyPath;
      }
    } else {
      const candidate = join(homedir(), '.local', 'bin', 'agy');
      if (existsSync(candidate)) {
        _cachedAgyPath = candidate;
        return _cachedAgyPath;
      }
    }
  } catch {
    // ignore
  }

  _cachedAgyPath = null;
  return _cachedAgyPath;
}

/**
 * Map a reasoning_effort value to the agy parenthesized variant suffix.
 * Flash supports Low/Medium/High; Pro supports Low/High (no Medium).
 * @param {string} base - agy model base ('Gemini 3.5 Flash' / 'Gemini 3.1 Pro')
 * @param {string} [reasoningEffort]
 * @returns {string} e.g. '(Low)', '(Medium)', '(High)'
 */
function effortSuffix(base, reasoningEffort) {
  const isPro = /pro/i.test(base);
  const effort = (reasoningEffort || '').toLowerCase();

  switch (effort) {
  case 'none':
  case 'minimal':
  case 'low':
    return '(Low)';
  case 'medium':
    // Pro has no Medium variant — fall back to High
    return isPro ? '(High)' : '(Medium)';
  case 'high':
  case 'max':
    return '(High)';
  default:
    // unset → High
    return '(High)';
  }
}

/**
 * Resolve a user-facing model name + reasoning_effort to the agy display name
 * passed via --model. Strips the gemini: prefix (case-insensitive), maps the
 * alias, and appends the effort suffix. Full agy display names pass through
 * verbatim so power users aren't blocked.
 * @param {string} model - e.g. 'gemini', 'gemini:flash', or a full agy name
 * @param {string} [reasoningEffort]
 * @returns {string} agy --model value, e.g. 'Gemini 3.1 Pro (High)'
 */
export function resolveAgyModel(model, reasoningEffort) {
  const raw = typeof model === 'string' ? model.trim() : '';

  // Full agy display-name passthrough (already contains a parenthesized variant)
  if (/\(.*\)\s*$/.test(raw) && /gemini/i.test(raw)) {
    return raw;
  }

  let name = raw;
  if (name.toLowerCase().startsWith('gemini:')) {
    name = name.slice('gemini:'.length).trim();
  }

  const nameLower = name.toLowerCase();

  // Determine the agy base
  let base;
  if (
    !nameLower ||
    nameLower === 'gemini' ||
    nameLower === 'gemini-cli' ||
    nameLower === 'pro'
  ) {
    base = SUPPORTED_MODELS.gemini.agyModelBase;
  } else if (nameLower === 'flash') {
    base = SUPPORTED_MODELS['gemini:flash'].agyModelBase;
  } else {
    // Unknown suffix: pass through verbatim (power-user agy display name)
    return raw;
  }

  return `${base} ${effortSuffix(base, reasoningEffort)}`;
}

/**
 * Serialize the full messages array into a single role-labeled prompt string.
 * System message becomes a <system> preamble; prior turns render as
 * User:/Assistant: blocks; ends with an instruction to answer the final user
 * message directly without role labels. Throws on image content parts.
 * @param {Array} messages - Converse-format messages
 * @returns {string}
 */
export function buildPrompt(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new GeminiCliProviderError(
      'Messages must be a non-empty array',
      ErrorCodes.INVALID_MESSAGES,
    );
  }

  const renderContent = (content) => {
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      const parts = [];
      for (const part of content) {
        if (part?.type === 'image') {
          throw new GeminiCliProviderError(
            'Images are not supported by the gemini provider (Antigravity CLI print mode has no image input channel)',
            ErrorCodes.INVALID_REQUEST,
          );
        }
        if (part?.type === 'text' && typeof part.text === 'string') {
          parts.push(part.text);
        }
      }
      return parts.join('\n');
    }
    return '';
  };

  const systemParts = [];
  const turns = [];

  for (const message of messages) {
    const role = message?.role;
    const text = renderContent(message?.content);
    if (role === 'system') {
      if (text) systemParts.push(text);
    } else if (role === 'assistant') {
      turns.push(`Assistant: ${text}`);
    } else {
      // treat anything else (user/tool/unknown) as a user turn
      turns.push(`User: ${text}`);
    }
  }

  const sections = [];
  if (systemParts.length > 0) {
    sections.push(`<system>\n${systemParts.join('\n\n')}\n</system>`);
  }

  if (turns.length > 1) {
    sections.push(
      'The following is a conversation transcript. Read the full transcript, then write the assistant\'s next reply to the final User message. Respond directly without any role label.',
    );
    sections.push(turns.join('\n\n'));
  } else {
    // Single user turn — strip the label, just ask directly.
    const onlyTurn = turns[0] || '';
    sections.push(onlyTurn.replace(/^User:\s*/, ''));
  }

  return sections.join('\n\n');
}

/**
 * Clean agy PTY output: strip ANSI escape sequences (CSI, OSC, charset
 * selection), resolve carriage-return overwrites, trim trailing whitespace.
 * Pure function so it can be unit-tested against captured raw output.
 * @param {string} raw
 * @returns {string}
 */
export function cleanAgyOutput(raw) {
  if (typeof raw !== 'string' || raw.length === 0) {
    return '';
  }

  let s = raw;

  // Strip OSC sequences: ESC ] ... terminated by BEL (\x07) or ST (ESC \).
  s = s.replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '');

  // Strip CSI sequences: ESC [ parameter-bytes (0x30-0x3F) intermediate-bytes
  // (0x20-0x2F) final-byte (0x40-0x7E). Full grammar so truecolor / less common
  // sequences don't leak their tail as text.
  s = s.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');

  // Strip charset selection (ESC ( X / ESC ) X) and other single-char escapes
  // (ESC =, ESC >, and any remaining ESC + final byte).
  s = s.replace(/\x1b[()][AB0-2]/g, '');
  s = s.replace(/\x1b[=>]/g, '');
  s = s.replace(/\x1b[@-Z\\-_]/g, '');

  // Resolve carriage-return overwrites within each line: a lone \r (not part of
  // a \r\n line break) means the cursor returned to column 0 and overwrote.
  // Normalize CRLF first so we only handle bare CRs.
  s = s.replace(/\r\n/g, '\n');
  s = s
    .split('\n')
    .map((line) => {
      if (!line.includes('\r')) return line;
      // Last CR-delimited segment wins (spinner frames overwrite each other)
      const segments = line.split('\r');
      return segments[segments.length - 1];
    })
    .join('\n');

  // Strip any remaining lone control chars (BEL, etc.) except tab and newline.
  s = s.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');

  // Trim trailing whitespace/newlines
  return s.replace(/\s+$/, '');
}

// ---------------------------------------------------------------------------
// Subprocess runner
// ---------------------------------------------------------------------------

/**
 * Lazily import @lydell/node-pty. Kept lazy so the module loads even when the
 * native binary is unavailable (e.g. unit tests that mock the layer).
 */
async function getPty() {
  try {
    const mod = await import('@lydell/node-pty');
    return mod.default || mod;
  } catch (error) {
    throw new GeminiCliProviderError(
      '@lydell/node-pty is not installed. Run: pnpm add @lydell/node-pty',
      ErrorCodes.API_ERROR,
      error,
    );
  }
}

/**
 * Spawn agy under a PTY, deliver the prompt, collect output, resolve on exit.
 *
 * @param {object} params
 * @param {string} params.prompt - Fully serialized prompt
 * @param {string} params.model - Resolved agy --model value
 * @param {number} params.timeoutMs - Print timeout in ms
 * @param {AbortSignal} [params.signal]
 * @param {object} [params.ptyLib] - Injected pty module (tests)
 * @param {string} [params.agyPath] - Override binary path (tests)
 * @returns {Promise<{output: string, exitCode: number}>}
 */
export async function runAgy({
  prompt,
  model,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal,
  ptyLib,
  agyPath,
}) {
  const binary = agyPath || findAgyBinary();
  if (!binary) {
    throw new GeminiCliProviderError(
      'Antigravity CLI (agy) not found. Install it and run `agy` once to log in (https://antigravity.google)',
      ErrorCodes.MISSING_API_KEY,
    );
  }

  if (signal?.aborted) {
    throw new GeminiCliProviderError('Request cancelled', 'CANCELLED');
  }

  const pty = ptyLib || (await getPty());

  // Per-call cwd under HOME (covered by agy workspace trust on first login).
  // On POSIX, restrict the dir to the owner (0700) since it may hold prompt.md.
  const runId = randomUUID();
  let runDir = join(homedir(), '.converse', 'agy-runs', runId);
  const mkOpts =
    process.platform === 'win32'
      ? { recursive: true }
      : { recursive: true, mode: 0o700 };
  try {
    mkdirSync(runDir, mkOpts);
  } catch (error) {
    // Fall back to a per-call dir under tmpdir if HOME isn't writable. Still a
    // unique dir (never a bare tmpdir) so concurrent calls don't collide and
    // cleanup still applies.
    debugError(
      '[Gemini CLI] Failed to create run dir, falling back to tmp',
      error,
    );
    runDir = join(tmpdir(), 'converse-agy-runs', runId);
    try {
      mkdirSync(runDir, mkOpts);
    } catch (fallbackErr) {
      throw new GeminiCliProviderError(
        `Failed to create agy run directory: ${fallbackErr.message}`,
        ErrorCodes.API_ERROR,
        fallbackErr,
      );
    }
  }
  // Decide prompt delivery: argv (fast) vs file (large-prompt bootstrap).
  let promptArg;
  if (prompt.length > ARGV_PROMPT_LIMIT) {
    const promptFile = join(runDir, 'prompt.md');
    // 0600 on POSIX — prompt may contain sensitive context.
    const writeOpts =
      process.platform === 'win32'
        ? { encoding: 'utf8' }
        : { encoding: 'utf8', mode: 0o600 };
    writeFileSync(promptFile, prompt, writeOpts);
    // Reference the absolute path to minimize the agent's file-search flailing.
    promptArg = `Read the file located at ${promptFile} and respond to its contents directly. Do not summarize the file; answer it.`;
  } else {
    promptArg = prompt;
  }

  const timeoutSeconds = Math.ceil(timeoutMs / 1000);
  // --sandbox is intentionally omitted: it blocks the large-prompt file read in
  // print mode (verified 2026-06-10 — agy times out unable to read prompt.md).
  const args = [
    '-p',
    promptArg,
    '--model',
    model,
    '--print-timeout',
    `${timeoutSeconds}s`,
  ];

  return new Promise((resolve, reject) => {
    let child;
    let output = '';
    let settled = false;
    // Set when abort/timeout has requested termination. Once set, a subsequent
    // onExit (which kill() may fire synchronously) must NOT resolve as a normal
    // exit — the termination error wins.
    let terminationError = null;
    let hardTimer = null;
    let postKillTimer = null;
    let onDataSub = null;
    let onExitSub = null;

    const cleanup = () => {
      if (hardTimer) {
        clearTimeout(hardTimer);
        hardTimer = null;
      }
      if (postKillTimer) {
        clearTimeout(postKillTimer);
        postKillTimer = null;
      }
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      try {
        onDataSub?.dispose?.();
      } catch {
        /* ignore */
      }
      try {
        onExitSub?.dispose?.();
      } catch {
        /* ignore */
      }
      // Best-effort run-dir cleanup; never throw. On abort the killed process
      // may still hold a handle on prompt.md (EBUSY), so retry once detached.
      try {
        rmSync(runDir, { recursive: true, force: true });
      } catch (err) {
        debugLog('[Gemini CLI] Run dir cleanup failed, retrying: %s', err?.message);
        setTimeout(() => {
          try {
            rmSync(runDir, { recursive: true, force: true });
          } catch (retryErr) {
            debugLog(
              '[Gemini CLI] Run dir cleanup retry failed: %s',
              retryErr?.message,
            );
          }
        }, 2000).unref?.();
      }
    };

    const settleResolve = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const settleReject = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    // Terminate the child for a known reason (abort/timeout). Records the error
    // first so a synchronous onExit from kill() rejects rather than resolves,
    // then schedules a post-kill grace timer so we never hang if onExit never
    // fires.
    const terminate = (err) => {
      if (settled) return;
      terminationError = err;
      try {
        child?.kill();
      } catch (killErr) {
        debugLog('[Gemini CLI] pty.kill() failed: %s', killErr?.message);
      }
      if (!postKillTimer) {
        postKillTimer = setTimeout(() => {
          settleReject(terminationError);
        }, POST_KILL_GRACE_MS);
      }
    };

    function onAbort() {
      terminate(new GeminiCliProviderError('Request cancelled', 'CANCELLED'));
    }

    try {
      child = pty.spawn(binary, args, {
        name: 'xterm-256color',
        cols: PTY_COLS,
        rows: 30,
        cwd: runDir,
        env: process.env,
      });
    } catch (error) {
      cleanup();
      reject(
        new GeminiCliProviderError(
          `Failed to spawn agy: ${error.message}`,
          ErrorCodes.API_ERROR,
          error,
        ),
      );
      return;
    }

    onDataSub = child.onData((data) => {
      output += data;
    });

    onExitSub = child.onExit(({ exitCode }) => {
      // If termination was requested, the abort/timeout error wins over a
      // (possibly kill()-induced) exit.
      if (terminationError) {
        settleReject(terminationError);
      } else {
        settleResolve({ output, exitCode });
      }
    });

    hardTimer = setTimeout(() => {
      terminate(
        new GeminiCliProviderError(
          `Antigravity CLI (agy) timed out after ${timeoutMs}ms`,
          ErrorCodes.TIMEOUT_ERROR,
        ),
      );
    }, timeoutMs + HARD_KILL_GRACE_MS);

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
      // Guard the window between the early aborted-check and listener
      // registration: if it aborted in between, the listener won't fire.
      if (signal.aborted) {
        onAbort();
      }
    }
  });
}

/**
 * Yield the passthrough event sequence for stream mode:
 * start -> delta(fullText) -> usage(zeroed) -> end
 */
async function* createStreamingGenerator(fullText, userFacingModel) {
  yield {
    type: 'start',
    provider: 'gemini-cli',
    model: userFacingModel,
  };
  yield {
    type: 'delta',
    data: { textDelta: fullText },
  };
  yield {
    type: 'usage',
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      cached_input_tokens: 0,
    },
  };
  yield {
    type: 'end',
    stop_reason: 'stop',
    finish_reason: 'stop',
  };
}

/**
 * Run agy and return the cleaned response text, mapping failure modes to
 * provider errors.
 */
async function executeAgy(messages, options) {
  const { model = 'gemini', reasoning_effort, signal, timeout } = options;

  const prompt = buildPrompt(messages);
  const agyModel = resolveAgyModel(model, reasoning_effort);
  const timeoutMs =
    typeof timeout === 'number' && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS;

  const { output, exitCode } = await runAgy({
    prompt,
    model: agyModel,
    timeoutMs,
    signal,
  });

  const cleaned = cleanAgyOutput(output);

  if (exitCode !== 0) {
    const tail = cleaned.slice(-500);
    throw new GeminiCliProviderError(
      `Antigravity CLI (agy) exited with code ${exitCode}. ${tail ? `Output tail: ${tail}` : 'No output.'} If this persists, run \`agy\` interactively once to authenticate (Antigravity Google OAuth).`,
      ErrorCodes.API_ERROR,
    );
  }

  if (!cleaned) {
    throw new GeminiCliProviderError(
      'Antigravity CLI (agy) returned empty output. This usually means the CLI is not authenticated — run `agy` interactively once to authenticate (Antigravity Google OAuth). (See upstream bug google-antigravity/antigravity-cli#76 for the non-TTY case.)',
      ErrorCodes.API_ERROR,
    );
  }

  return cleaned;
}

/**
 * Gemini CLI (Antigravity) Provider Implementation
 */
export const geminiCliProvider = {
  /**
   * Invoke agy with messages and options.
   * @param {Array} messages - Message array (Converse format)
   * @param {Object} options - Invocation options
   * @returns {Promise<Object>|AsyncGenerator} Response or stream generator
   */
  async invoke(messages, options = {}) {
    const { model = 'gemini', stream = false, signal } = options;

    if (signal?.aborted) {
      throw new GeminiCliProviderError('Request cancelled', 'CANCELLED');
    }

    if (stream) {
      // Run agy first (one-shot), then replay as a passthrough stream.
      const fullText = await executeAgy(messages, options);
      return createStreamingGenerator(fullText, model);
    }

    const startTime = Date.now();
    const content = await executeAgy(messages, options);
    const responseTime = Date.now() - startTime;

    return {
      content,
      stop_reason: StopReasons.STOP,
      rawResponse: { content },
      metadata: {
        provider: 'gemini-cli',
        model,
        usage: null,
        response_time_ms: responseTime,
        finish_reason: 'stop',
      },
    };
  },

  /**
   * Validate configuration. agy uses OAuth (no env keys); always true.
   * Availability is determined by isAvailable (binary presence).
   */
  validateConfig(_config) {
    return true;
  },

  /**
   * Check if the provider is available (agy binary present).
   */
  isAvailable(_config) {
    return findAgyBinary() !== null;
  },

  /**
   * Get supported Gemini models.
   */
  getSupportedModels() {
    return SUPPORTED_MODELS;
  },

  /**
   * Get model configuration for a specific model (alias-aware, prefix-aware).
   */
  getModelConfig(modelName) {
    if (typeof modelName !== 'string') return null;

    const name = modelName.toLowerCase().trim();

    // Full agy display-name passthrough → matching base config.
    if (/gemini 3\.5 flash/i.test(modelName)) {
      return SUPPORTED_MODELS['gemini:flash'];
    }
    if (/gemini 3\.1 pro/i.test(modelName)) {
      return SUPPORTED_MODELS.gemini;
    }

    if (name === 'pro') {
      return SUPPORTED_MODELS['gemini:pro'];
    }

    // Exact key match (gemini, gemini:pro, gemini:flash)
    if (SUPPORTED_MODELS[name]) {
      return SUPPORTED_MODELS[name];
    }

    // Alias match
    for (const config of Object.values(SUPPORTED_MODELS)) {
      if (
        config.aliases &&
        config.aliases.some((alias) => alias.toLowerCase() === name)
      ) {
        return config;
      }
    }

    return null;
  },
};
