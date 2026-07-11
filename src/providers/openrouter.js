/**
 * OpenRouter Provider
 *
 * Provider implementation for OpenRouter's unified API gateway, built on the
 * shared OpenAI-compatible base. Exposes a curated static catalog of current
 * flagship slugs; any other explicit `provider/model` slug is discovered
 * request-locally through the Foundation discovery adapter (never merged into
 * getSupportedModels()).
 *
 * Capability notes:
 *   - Web search is explicit opt-in via the `:online` slug decoration (parsed by
 *     the shared resolver into `options.web_search`) because OpenRouter web
 *     search adds real per-request cost. `supportsWebSearch` stays false on every
 *     curated model; the plugin is attached from the flag, never silently.
 *   - Reasoning is metadata-driven from each model's structured `reasoning`
 *     object and capability-gated: unknown/retired pass-through IDs get no
 *     reasoning field.
 *   - Attribution headers (`HTTP-Referer`, canonical `X-OpenRouter-Title`) are
 *     optional; omitting them only forgoes OpenRouter ranking credit.
 */

import { createOpenAICompatibleProvider } from './openai-compatible.js';
import { debugLog } from '../utils/console.js';
import { ProviderError, ErrorCodes } from './interface.js';
import {
  lookupOpenRouterModel,
  DiscoveryStatus,
} from './openrouter-discovery.js';

// Curated static catalog (verified live 2026-07-11). getSupportedModels() must
// return exactly these 8 slugs even after a discovery call has run — dynamic
// metadata is request-local and never merged here.
//
// Each entry carries a structured `reasoning` object mirroring the discovery
// adapter's shape so the reasoning mapper (buildOpenRouterReasoning) is uniform
// across static and discovered models:
//   - effort-tiered: { supported_efforts: ['xhigh','high'], default_effort:'high' }
//   - enable/disable-only (binary): { mandatory:false, default_enabled:true }
//   - mandatory: { mandatory:true } (reasoning cannot be disabled)
//   - passthrough: { passthrough:true } (openrouter/auto — the router chooses)
const SUPPORTED_MODELS = {
  'z-ai/glm-5.2': {
    modelName: 'z-ai/glm-5.2',
    friendlyName: 'Z.ai GLM 5.2 (via OpenRouter)',
    contextWindow: 1048576,
    maxOutputTokens: 131072,
    supportsStreaming: true,
    supportsImages: false,
    supportsWebSearch: false,
    supportsReasoning: true,
    reasoning: {
      mandatory: false,
      default_enabled: true,
      supported_efforts: ['xhigh', 'high'],
      default_effort: 'high',
    },
    timeout: 300000,
    description:
      'Z.ai GLM 5.2 — large-scale reasoning model with a 1M-token context',
    aliases: ['glm-5.2', 'glm5.2', 'glm'],
  },
  'deepseek/deepseek-v4-pro': {
    modelName: 'deepseek/deepseek-v4-pro',
    friendlyName: 'DeepSeek V4 Pro (via OpenRouter)',
    contextWindow: 1048576,
    maxOutputTokens: 384000,
    supportsStreaming: true,
    supportsImages: false,
    supportsWebSearch: false,
    supportsReasoning: true,
    reasoning: {
      mandatory: false,
      default_enabled: true,
      supported_efforts: ['xhigh', 'high'],
      default_effort: 'high',
    },
    timeout: 300000,
    description: 'DeepSeek V4 Pro reasoning model (via OpenRouter)',
    aliases: [],
  },
  'deepseek/deepseek-v4-flash': {
    modelName: 'deepseek/deepseek-v4-flash',
    friendlyName: 'DeepSeek V4 Flash (via OpenRouter)',
    contextWindow: 1048576,
    maxOutputTokens: 384000,
    supportsStreaming: true,
    supportsImages: false,
    supportsWebSearch: false,
    supportsReasoning: true,
    reasoning: {
      mandatory: false,
      default_enabled: true,
      supported_efforts: ['xhigh', 'high'],
      default_effort: 'high',
    },
    timeout: 300000,
    description: 'DeepSeek V4 Flash — faster, lower-cost DeepSeek V4 tier',
    aliases: [],
  },
  'qwen/qwen3.7-max': {
    modelName: 'qwen/qwen3.7-max',
    friendlyName: 'Qwen3.7 Max (via OpenRouter)',
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    supportsStreaming: true,
    supportsImages: false,
    supportsWebSearch: false,
    supportsReasoning: true,
    // Enable/disable-only — no effort tiers exposed.
    reasoning: { mandatory: false, default_enabled: true },
    timeout: 300000,
    description: 'Qwen3.7 Max — flagship Qwen with a 1M-token context',
    aliases: ['qwen3.7-max'],
  },
  'qwen/qwen3.7-plus': {
    modelName: 'qwen/qwen3.7-plus',
    friendlyName: 'Qwen3.7 Plus (via OpenRouter)',
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    supportsStreaming: true,
    supportsImages: true,
    supportsWebSearch: false,
    supportsReasoning: true,
    // Enable/disable-only — no effort tiers exposed.
    reasoning: { mandatory: false, default_enabled: true },
    timeout: 300000,
    description: 'Qwen3.7 Plus — image-capable Qwen with a 1M-token context',
    aliases: ['qwen3.7-plus'],
  },
  'moonshotai/kimi-k2.7-code': {
    modelName: 'moonshotai/kimi-k2.7-code',
    friendlyName: 'Kimi K2.7 Code (via OpenRouter)',
    contextWindow: 262144,
    maxOutputTokens: 262144,
    supportsStreaming: true,
    supportsImages: true,
    supportsWebSearch: false,
    supportsReasoning: true,
    // Mandatory reasoning — cannot be disabled.
    reasoning: { mandatory: true, default_enabled: true },
    timeout: 300000,
    description: 'Moonshot Kimi K2.7 Code — coding model with mandatory reasoning',
    aliases: ['kimi-k2.7-code'],
  },
  'moonshotai/kimi-k2.6': {
    modelName: 'moonshotai/kimi-k2.6',
    friendlyName: 'Kimi K2.6 (via OpenRouter)',
    contextWindow: 262144,
    maxOutputTokens: 262144,
    supportsStreaming: true,
    supportsImages: true,
    supportsWebSearch: false,
    supportsReasoning: true,
    // Enable/disable-only — no effort tiers exposed.
    reasoning: { mandatory: false, default_enabled: true },
    timeout: 300000,
    description: 'Moonshot Kimi K2.6 — image-capable general model',
    aliases: ['kimi-k2.6'],
  },
  'openrouter/auto': {
    modelName: 'openrouter/auto',
    friendlyName: 'OpenRouter Auto',
    contextWindow: 2000000,
    maxOutputTokens: 131072,
    supportsStreaming: true,
    supportsImages: true,
    supportsWebSearch: false,
    supportsReasoning: true,
    // Router selects the underlying model (and its effort) — do not fabricate a
    // reasoning field.
    reasoning: { passthrough: true },
    timeout: 300000,
    description: 'Auto-selects the best model for your prompt via OpenRouter',
    aliases: ['auto-router', 'openrouter-auto'],
  },
};

// OpenRouter error class
class OpenRouterProviderError extends ProviderError {
  constructor(message, code, originalError = null) {
    super(message, code, originalError);
    this.name = 'OpenRouterProviderError';
  }
}

/**
 * Validate OpenRouter API key format
 */
function validateApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }

  // OpenRouter API keys typically start with 'sk-or-' and are 40+ characters
  return apiKey.startsWith('sk-or-') && apiKey.length >= 40;
}

/**
 * Build optional OpenRouter attribution headers. Both are optional — omitting
 * them only forgoes ranking credit, it never breaks a request. When a title is
 * configured, emit a single canonical `X-OpenRouter-Title` (not the legacy
 * `X-Title`), while still accepting the legacy `openrouterreferer`/
 * `openroutertitle` config-key spellings as input.
 */
function getCustomHeaders(config) {
  const headers = {};

  const referer =
    config?.providers?.openrouterreferer ||
    config?.providers?.openrouterReferer;
  if (referer) {
    headers['HTTP-Referer'] = referer;
  }

  const title =
    config?.providers?.openroutertitle || config?.providers?.openrouterTitle;
  if (title) {
    headers['X-OpenRouter-Title'] = title;
  }

  return headers;
}

/**
 * Concatenate the visible reasoning text from a `reasoning_details[]` array.
 * `reasoning.text` and `reasoning.summary` are visible; `reasoning.encrypted`
 * is provider-side ciphertext and is NEVER rendered as visible reasoning.
 * @param {Array<object>} details
 * @returns {string}
 */
function extractReasoningText(details) {
  if (!Array.isArray(details)) return '';
  const parts = [];
  for (const detail of details) {
    if (!detail || typeof detail !== 'object') continue;
    if (detail.type === 'reasoning.text' && typeof detail.text === 'string') {
      parts.push(detail.text);
    } else if (
      detail.type === 'reasoning.summary' &&
      typeof detail.summary === 'string'
    ) {
      parts.push(detail.summary);
    }
    // reasoning.encrypted → intentionally skipped (never surfaced as reasoning)
  }
  return parts.join('');
}

/**
 * Map a Converse reasoning_effort level to OpenRouter's `reasoning` request
 * field, driven by the model's structured `reasoning` metadata. Capability-gated:
 * returns null (no field) unless the resolved modelConfig indicates reasoning
 * support, so unknown/retired pass-through IDs never receive reasoning params.
 *
 *   1. passthrough (openrouter/auto)  → null (router decides)
 *   2. mandatory (kimi-k2.7-code)     → { enabled: true } (cannot disable)
 *   3. effort-tiered (glm/deepseek)   → clamp into supported_efforts
 *                                       (max→xhigh, else→high; none→disabled)
 *   4. enable/disable-only (qwen/kimi) → { enabled: false } for none, else true
 *   5. unavailable metadata           → null (omit conservatively)
 *
 * `none` uses `{ enabled: false }` where disabling is allowed — never
 * `exclude: true` (exclude still reasons, just hides it).
 * @param {object} modelConfig
 * @param {string} reasoningEffort - Raw Converse level
 * @returns {object|null}
 */
function buildOpenRouterReasoning(modelConfig, reasoningEffort) {
  if (!modelConfig?.supportsReasoning) return null;
  const reasoning = modelConfig.reasoning;
  if (!reasoning) return null;

  if (reasoning.passthrough) return null;
  if (reasoning.mandatory) return { enabled: true };

  const level = reasoningEffort || 'medium';

  if (
    Array.isArray(reasoning.supported_efforts) &&
    reasoning.supported_efforts.length > 0
  ) {
    if (level === 'none') return { enabled: false };
    const wanted = level === 'max' ? 'xhigh' : 'high';
    const efforts = reasoning.supported_efforts;
    const effort = efforts.includes(wanted)
      ? wanted
      : efforts.includes('high')
        ? 'high'
        : efforts[0];
    return { effort };
  }

  // Enable/disable-only.
  if (level === 'none') return { enabled: false };
  return { enabled: true };
}

/**
 * Transform request: attach the metadata-driven, capability-gated `reasoning`
 * field. The requested effort arrives via the Foundation-widened context.
 */
async function transformRequest(requestPayload, { modelConfig, reasoningEffort }) {
  const transformed = { ...requestPayload };

  const reasoning = buildOpenRouterReasoning(modelConfig, reasoningEffort);
  if (reasoning) {
    transformed.reasoning = reasoning;
  }

  return transformed;
}

/**
 * Transform response (non-streaming): capture OpenRouter-specific metadata.
 * Usage cost is automatic now — read `usage.cost` and `usage.cost_details`
 * (the legacy `prompt_cost`/`completion_cost`/`total_cost` fields do not exist).
 * Preserve the top-level upstream `provider`, the request id, typed
 * `reasoning_details` (with a visible-text projection), and `url_citation`
 * annotations. In streaming these ride the streaming metadataPatch instead (the
 * synthetic streaming rawResponse lacks the message body).
 */
async function transformResponse(result, rawResponse) {
  if (rawResponse.id) {
    result.metadata.request_id = rawResponse.id;
  }

  const usage = rawResponse.usage;
  if (usage) {
    if (typeof usage.cost === 'number') {
      result.metadata.cost = usage.cost;
    }
    if (usage.cost_details) {
      result.metadata.cost_details = usage.cost_details;
    }
  }

  if (rawResponse.provider) {
    result.metadata.actual_provider = rawResponse.provider;
  }

  const message = rawResponse.choices?.[0]?.message;
  if (message) {
    if (
      Array.isArray(message.reasoning_details) &&
      message.reasoning_details.length > 0
    ) {
      result.metadata.reasoning_details = message.reasoning_details;
      const reasoningText = extractReasoningText(message.reasoning_details);
      if (reasoningText) {
        result.metadata.reasoning = reasoningText;
      }
    }
    if (Array.isArray(message.annotations) && message.annotations.length > 0) {
      const citations = message.annotations.filter(
        (annotation) => annotation?.type === 'url_citation',
      );
      if (citations.length > 0) {
        result.metadata.citations = citations;
      }
    }
  }

  return result;
}

/**
 * Per-chunk streaming hook. Emits streamed reasoning as `thinking` events (so it
 * survives the normalizer), accumulates typed reasoning_details / `url_citation`
 * annotations / cost / upstream provider / request id into the final metadata,
 * and terminates the stream as FAILED on an in-band SSE error — detected
 * independently as a top-level `error` object OR `finish_reason: "error"` —
 * while leaving already-emitted deltas intact.
 * @param {object} chunk - Parsed SSE chunk
 * @param {object} streamState - Persistent per-stream scratch object
 * @returns {{events: Array, metadataPatch: (object|null), suppressDefault: boolean, terminalError: (object|null)}}
 */
function transformStreamChunk(chunk, streamState) {
  const choice = chunk?.choices?.[0];

  // In-band SSE errors terminate the stream as failed. Detect a top-level error
  // object and finish_reason==='error' independently.
  if (chunk?.error) {
    return {
      events: [],
      metadataPatch: null,
      suppressDefault: true,
      terminalError: {
        message: chunk.error.message || 'OpenRouter stream error',
        code:
          typeof chunk.error.code === 'string'
            ? chunk.error.code
            : 'OPENROUTER_STREAM_ERROR',
      },
    };
  }
  if (choice?.finish_reason === 'error') {
    return {
      events: [],
      metadataPatch: null,
      suppressDefault: true,
      terminalError: {
        message: 'OpenRouter stream terminated (finish_reason=error)',
        code: 'OPENROUTER_STREAM_ERROR',
      },
    };
  }

  const events = [];

  // Streamed reasoning_details → thinking events; accumulate the full typed
  // array for the end metadata. The thinking text carries the reasoning to the
  // normalizer (which accumulates it into metadata.reasoning) — so we do NOT
  // also put a reasoning text string in the metadataPatch (avoids double count).
  const deltaDetails = choice?.delta?.reasoning_details;
  if (Array.isArray(deltaDetails) && deltaDetails.length > 0) {
    if (!streamState.reasoningDetails) streamState.reasoningDetails = [];
    for (const detail of deltaDetails) {
      streamState.reasoningDetails.push(detail);
    }
    const text = extractReasoningText(deltaDetails);
    if (text) {
      events.push({
        type: 'thinking',
        content: text,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Accumulate url_citation annotations, deduped by URL across chunks.
  const deltaAnnotations =
    choice?.delta?.annotations || choice?.message?.annotations;
  if (Array.isArray(deltaAnnotations) && deltaAnnotations.length > 0) {
    if (!streamState.annotations) streamState.annotations = [];
    if (!streamState.citationUrls) streamState.citationUrls = new Set();
    for (const annotation of deltaAnnotations) {
      const url = annotation?.url_citation?.url;
      if (
        annotation?.type === 'url_citation' &&
        url &&
        !streamState.citationUrls.has(url)
      ) {
        streamState.citationUrls.add(url);
        streamState.annotations.push(annotation);
      }
    }
  }

  const patch = {};
  if (chunk?.usage) {
    if (typeof chunk.usage.cost === 'number') patch.cost = chunk.usage.cost;
    if (chunk.usage.cost_details) patch.cost_details = chunk.usage.cost_details;
  }
  if (chunk?.provider) patch.actual_provider = chunk.provider;
  if (chunk?.id && !streamState.requestIdCaptured) {
    patch.request_id = chunk.id;
    streamState.requestIdCaptured = true;
  }
  // Live references, not snapshots: streamState is per-stream scratch that is
  // never mutated after the stream ends, and only the final merged patch is
  // consumed — re-slicing the growing arrays every chunk would be O(n²).
  if (streamState.reasoningDetails?.length) {
    patch.reasoning_details = streamState.reasoningDetails;
  }
  if (streamState.annotations?.length) {
    patch.citations = streamState.annotations;
  }

  return {
    events,
    metadataPatch: Object.keys(patch).length > 0 ? patch : null,
    suppressDefault: false,
    terminalError: null,
  };
}

/**
 * Conservative request-local config for an explicit slug when discovery is
 * transiently unavailable (auth/rate_limit/timeout/malformed). Lets the request
 * proceed with cautious capabilities: reasoning is omitted (capability-gated
 * off), and `supportsImages` is left undefined so images are not hard-blocked
 * during a discovery outage.
 */
function createConservativeModelConfig(modelName) {
  return {
    modelName,
    friendlyName: `${modelName} (via OpenRouter)`,
    contextWindow: 8192,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsWebSearch: false,
    timeout: 300000,
    isDynamic: true,
  };
}

/**
 * Request-local model-config resolver. Static curated
 * models are authoritative and never trigger discovery. An explicit non-curated
 * `provider/model` slug is looked up through the discovery adapter:
 *   - ok         → use the discovered metadata;
 *   - catalog_miss → throw MODEL_NOT_FOUND (fails before inference);
 *   - transient  → proceed with conservative capabilities.
 * Dynamic metadata stays request-local and is never merged into
 * getSupportedModels().
 */
async function resolveModelConfig(resolvedModel, { signal }) {
  // A `:free`-style decoration may ride on the request model; discovery/static
  // lookup uses the bare base slug.
  const base = String(resolvedModel).split(':')[0];

  const staticConfig = SUPPORTED_MODELS[base];
  if (staticConfig) {
    return staticConfig;
  }

  // Rolling aliases (`~author/model-latest`) are explicit opt-in pass-through
  // values: OpenRouter resolves them server-side and they never appear under
  // that name in the bulk catalog, so validating them through discovery would
  // wrongly fail them as absent. Proceed with conservative capabilities and let
  // the API resolve the target.
  if (base.startsWith('~')) {
    return createConservativeModelConfig(base);
  }

  // Not a slash-format slug: nothing to discover; the base falls back to an
  // empty config (unknown-ID passthrough).
  if (!base.includes('/')) {
    return null;
  }

  const { status, modelConfig } = await lookupOpenRouterModel(base, { signal });

  if (status === DiscoveryStatus.OK && modelConfig) {
    return modelConfig;
  }
  if (status === DiscoveryStatus.CATALOG_MISS) {
    throw new OpenRouterProviderError(
      `Model '${base}' was not found in the OpenRouter catalog`,
      ErrorCodes.MODEL_NOT_FOUND,
    );
  }

  debugLog(
    `[OpenRouter] Discovery unavailable for ${base} (${status}); proceeding with conservative capabilities`,
  );
  return createConservativeModelConfig(base);
}

/**
 * Create OpenRouter provider using OpenAI-compatible base
 */
export const openrouterProvider = createOpenAICompatibleProvider({
  baseURL: 'https://openrouter.ai/api/v1',
  providerName: 'OpenRouter',
  supportedModels: SUPPORTED_MODELS,
  validateApiKey,
  transformRequest,
  transformResponse,
  transformStreamChunk,
  resolveModelConfig,
  customHeaders: {}, // Attribution headers are dynamic, injected via invoke override
  defaultParams: {
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
  },
});

// Override invoke to inject optional attribution headers and translate the
// resolver's `:online` web-search opt-in into an OpenRouter `web` plugin. All
// dynamic-model handling lives in the resolveModelConfig hook above.
const originalInvoke = openrouterProvider.invoke;
openrouterProvider.invoke = async function (messages, options = {}) {
  const modifiedOptions = {
    ...options,
    config: {
      ...options.config,
      providers: {
        ...options.config?.providers,
        _customHeaders: getCustomHeaders(options.config),
      },
    },
  };

  // Web search is strictly opt-in: the shared resolver sets options.web_search
  // from a parsed `:online` decoration. Attach the web plugin exactly once
  // (never both a `:online` slug and a plugin). Ordinary requests attach
  // nothing — no plugin, no `:online`, no web-search option.
  if (options.web_search) {
    const existing = Array.isArray(options.plugins) ? options.plugins : [];
    modifiedOptions.plugins = [...existing, { id: 'web' }];
  }

  return originalInvoke.call(this, messages, modifiedOptions);
};
