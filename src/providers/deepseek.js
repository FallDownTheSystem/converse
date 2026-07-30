/**
 * DeepSeek Provider
 *
 * Provider implementation for DeepSeek models using OpenAI-compatible API.
 * Implements the unified interface: async invoke(messages, options) => { content, stop_reason, rawResponse }
 */

import { createOpenAICompatibleProvider } from './openai-compatible.js';
import { debugLog } from '../utils/console.js';

// Define supported DeepSeek models with their capabilities.
// V4 unified the catalog: both tiers share a 1M context window and a 384K output
// ceiling, are text-only (no vision), and expose thinking mode via the
// top-level `thinking` + `reasoning_effort` request fields (see transformRequest).
// The legacy `deepseek-chat` / `deepseek-reasoner` IDs hard-retire 2026-07-24
// 15:59 UTC upstream; they are intentionally absent here but keep working as
// explicit pass-through IDs (resolveModelName returns unknown IDs unchanged)
// until that date.
const SUPPORTED_MODELS = {
  'deepseek-v4-pro': {
    modelName: 'deepseek-v4-pro',
    friendlyName: 'DeepSeek V4 Pro',
    contextWindow: 1000000, // 1M context (V4 default across all official services)
    maxOutputTokens: 384000, // 384K max output ceiling
    defaultMaxTokens: 8000, // Conservative default despite the high ceiling
    supportsStreaming: true,
    supportsImages: false, // Text-only; V4 has no vision input
    supportsWebSearch: false,
    supportsReasoning: true,
    supportsJsonOutput: true,
    supportsFunctionCalling: true,
    timeout: 1800000, // Longer timeout for reasoning
    description:
      'DeepSeek V4 Pro - flagship MoE model with 1M context and thinking mode',
    aliases: ['deepseek', 'deepseek-pro'],
  },
  'deepseek-v4-flash': {
    modelName: 'deepseek-v4-flash',
    friendlyName: 'DeepSeek V4 Flash',
    contextWindow: 1000000, // 1M context
    maxOutputTokens: 384000, // 384K max output ceiling
    defaultMaxTokens: 8000, // Conservative default despite the high ceiling
    supportsStreaming: true,
    supportsImages: false, // Text-only; V4 has no vision input
    supportsWebSearch: false,
    supportsReasoning: true,
    supportsJsonOutput: true,
    supportsFunctionCalling: true,
    timeout: 1800000, // Longer timeout for reasoning
    description:
      'DeepSeek V4 Flash - faster, lower-cost V4 tier with 1M context and thinking mode',
    aliases: ['deepseek-flash'],
  },
};

/**
 * Validate DeepSeek API key format
 */
function validateApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }

  // DeepSeek API keys are typically 32+ character strings
  return apiKey.length >= 32;
}

/**
 * Map a Converse reasoning_effort level to DeepSeek's thinking-mode request
 * fields. DeepSeek exposes only two independent controls: a `thinking` toggle
 * ({type:"enabled"|"disabled"}) and a `reasoning_effort` field that accepts
 * ONLY "high" or "max". Every enabled level below max maps to "high" (there is
 * no lower documented tier), preserving enabled-reasoning intent so the default
 * `medium` runs thinking-on rather than silently disabling it.
 */
function applyReasoning(requestPayload, reasoningEffort) {
  if (reasoningEffort === 'none') {
    // Disable thinking entirely; omit reasoning_effort.
    requestPayload.thinking = { type: 'disabled' };
    return;
  }

  requestPayload.thinking = { type: 'enabled' };
  requestPayload.reasoning_effort = reasoningEffort === 'max' ? 'max' : 'high';
}

/**
 * Transform request to handle DeepSeek-specific requirements.
 *
 * Reads the requested reasoning effort from the shared base's widened context
 * and builds the thinking-mode fields. Reasoning is capability-gated: the fields
 * are attached only when the resolved model supports reasoning, so an
 * unknown/retired pass-through ID never receives them.
 */
async function transformRequest(requestPayload, context = {}) {
  const { modelConfig, reasoningEffort } = context;

  if (modelConfig?.supportsReasoning && reasoningEffort) {
    applyReasoning(requestPayload, reasoningEffort);
  }

  debugLog('[DeepSeek] Request payload prepared');
  return requestPayload;
}

/**
 * Transform response to handle DeepSeek-specific fields.
 *
 * `reasoning_content` (the thinking-mode sibling of `content`) is surfaced to
 * metadata by the shared OpenAI-compatible base when supportsReasoning is set,
 * so no provider-specific reasoning extraction is needed here.
 */
async function transformResponse(result, rawResponse) {
  if (rawResponse.system_fingerprint) {
    result.metadata.system_fingerprint = rawResponse.system_fingerprint;
  }

  return result;
}

/**
 * Create DeepSeek provider using OpenAI-compatible base.
 *
 * baseURL is the bare host (no `/v1`) matching the current official docs and all
 * OpenAI-SDK code samples. `frequency_penalty`/`presence_penalty` are omitted
 * from defaultParams: the API now marks them deprecated no-ops, and thinking
 * mode ignores them (along with temperature/top_p) regardless.
 */
export const deepseekProvider = createOpenAICompatibleProvider({
  baseURL: 'https://api.deepseek.com',
  providerName: 'DeepSeek',
  supportedModels: SUPPORTED_MODELS,
  validateApiKey,
  transformRequest,
  transformResponse,
  defaultParams: {
    top_p: 0.95,
  },
});
