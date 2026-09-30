/**
 * Abliteration Provider
 *
 * Provider implementation for abliteration.ai models using its OpenAI-compatible
 * Chat Completions API.
 * Implements the unified interface: async invoke(messages, options) => { content, stop_reason, rawResponse }
 *
 * Chat Completions is used rather than the Responses surface: abliteration.ai's
 * /v1/responses is stateless (no previous_response_id to gain from), rejects
 * `max` effort on the base model, while Chat Completions accepts every effort
 * tier on all models and returns the trace as `reasoning_content`, which the
 * shared OpenAI-compatible base already surfaces.
 */

import { createOpenAICompatibleProvider } from './openai-compatible.js';
import { debugLog } from '../utils/console.js';
import {
  clampReasoningEffort,
  EFFORT_LADDER,
} from '../utils/reasoningEffort.js';

// All three models always reason by default. `reasoningTiers` lists the
// distinct depths each model actually runs; the API accepts the whole ladder
// but silently collapses it onto these, so clamping here keeps the requested
// tier and the tier that runs in agreement.
const SUPPORTED_MODELS = {
  'abliterated-model-large-v2': {
    modelName: 'abliterated-model-large-v2',
    friendlyName: 'Abliterated Large V2',
    contextWindow: 1000000,
    maxOutputTokens: 999990,
    supportsStreaming: true,
    supportsImages: false, // Text-only; image content is rejected with a 400
    supportsWebSearch: false,
    supportsReasoning: true,
    // Cannot disable reasoning: `none` would run at low with the trace hidden,
    // so it clamps up to an explicit `low` that keeps the trace visible.
    reasoningTiers: ['low', 'high', 'max'],
    supportsJsonOutput: true,
    supportsFunctionCalling: true,
    timeout: 1800000,
    description:
      'Abliterated Large V2 - uncensored GLM-5.3 derived reasoning model with 1M context',
    aliases: ['abliterated-large', 'abliterated-large-v2'],
  },
  'abliterated-model-large': {
    modelName: 'abliterated-model-large',
    friendlyName: 'Abliterated Large',
    contextWindow: 1000000,
    maxOutputTokens: 999990,
    supportsStreaming: true,
    supportsImages: false, // Text-only; image content is rejected with a 400
    supportsWebSearch: false,
    supportsReasoning: true,
    reasoningTiers: ['none', 'high', 'max'],
    supportsJsonOutput: true,
    supportsFunctionCalling: true,
    timeout: 1800000,
    description:
      'Abliterated Large - previous uncensored GLM-5.2 derived reasoning model with 1M context',
    aliases: ['abliterated-large-v1'],
  },
  'abliterated-model': {
    modelName: 'abliterated-model',
    friendlyName: 'Abliterated Model',
    contextWindow: 262144,
    maxOutputTokens: 262134,
    supportsStreaming: true,
    supportsImages: true,
    supportsWebSearch: false,
    supportsReasoning: true,
    reasoningTiers: EFFORT_LADDER,
    supportsJsonOutput: true,
    supportsFunctionCalling: true,
    timeout: 900000,
    description:
      'Abliterated Model - uncensored multimodal reasoning model with 256K context',
    aliases: ['abliterated', 'abliterated-base'],
  },
};

/**
 * abliteration.ai API keys are issued as `ak_...` tokens.
 */
function validateApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }

  return apiKey.startsWith('ak_') && apiKey.length > 10;
}

/**
 * Attach `reasoning_effort` clamped onto the tiers the resolved model runs.
 * Capability-gated: an unknown pass-through ID never receives the field and
 * runs at the server's default depth.
 */
async function transformRequest(requestPayload, context = {}) {
  const { modelConfig, reasoningEffort } = context;

  if (modelConfig?.supportsReasoning && reasoningEffort) {
    requestPayload.reasoning_effort = clampReasoningEffort(
      reasoningEffort,
      modelConfig.reasoningTiers,
    );
  }

  debugLog('[Abliteration] Request payload prepared');
  return requestPayload;
}

export const abliterationProvider = createOpenAICompatibleProvider({
  baseURL: 'https://api.abliteration.ai/v1',
  providerName: 'Abliteration',
  supportedModels: SUPPORTED_MODELS,
  defaultModel: 'abliterated-model-large-v2',
  validateApiKey,
  transformRequest,
});
