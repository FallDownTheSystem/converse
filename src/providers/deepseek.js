/**
 * DeepSeek Provider
 *
 * Provider implementation for DeepSeek models using OpenAI-compatible API.
 * Implements the unified interface: async invoke(messages, options) => { content, stop_reason, rawResponse }
 */

import { createOpenAICompatibleProvider } from './openai-compatible.js';
import { debugLog } from '../utils/console.js';

// Define supported DeepSeek models with their capabilities
const SUPPORTED_MODELS = {
  'deepseek-chat': {
    modelName: 'deepseek-chat',
    friendlyName: 'DeepSeek Chat (V3-0324)',
    contextWindow: 64000, // API supports 64K context
    maxOutputTokens: 8000, // Maximum 8K output tokens
    defaultMaxTokens: 4000, // Default 4K tokens
    supportsStreaming: true,
    supportsImages: false,
    supportsTemperature: true,
    supportsWebSearch: false,
    supportsJsonOutput: true,
    supportsFunctionCalling: true,
    supportsChatPrefixCompletion: true, // Beta
    supportsFIMCompletion: true, // Beta
    timeout: 300000,
    description: 'DeepSeek-V3-0324 - Strong MoE model with 671B total/37B active parameters',
    aliases: ['deepseek', 'chat', 'deepseek chat', 'deepseek-v3']
  },
  'deepseek-reasoner': {
    modelName: 'deepseek-reasoner',
    friendlyName: 'DeepSeek Reasoner (R1-0528)',
    contextWindow: 64000, // API supports 64K context
    maxOutputTokens: 64000, // Maximum 64K output tokens (including CoT)
    defaultMaxTokens: 32000, // Default 32K tokens
    supportsStreaming: true,
    supportsImages: false,
    supportsTemperature: true,
    supportsWebSearch: false,
    supportsJsonOutput: true,
    supportsFunctionCalling: true,
    supportsChatPrefixCompletion: true, // Beta
    supportsFIMCompletion: false, // Not supported
    supportsReasoning: true,
    timeout: 600000, // Longer timeout for reasoning
    description: 'DeepSeek-R1-0528 - Advanced reasoning model with CoT capabilities',
    aliases: ['deepseek reasoner', 'reasoner', 'r1', 'deepseek r1', 'deepseek-r1']
  }
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
 * Transform request to handle DeepSeek-specific requirements
 */
async function transformRequest(requestPayload) {
  // DeepSeek uses standard OpenAI format, no transformation needed
  debugLog('[DeepSeek] Request payload prepared');
  return requestPayload;
}

/**
 * Transform response to handle DeepSeek-specific fields
 */
async function transformResponse(result, rawResponse) {
  // DeepSeek returns standard OpenAI-compatible responses
  // Add any DeepSeek-specific metadata if needed
  if (rawResponse.system_fingerprint) {
    result.metadata.system_fingerprint = rawResponse.system_fingerprint;
  }

  return result;
}

/**
 * Create DeepSeek provider using OpenAI-compatible base
 */
export const deepseekProvider = createOpenAICompatibleProvider({
  baseURL: 'https://api.deepseek.com/v1',
  providerName: 'DeepSeek',
  supportedModels: SUPPORTED_MODELS,
  validateApiKey,
  transformRequest,
  transformResponse,
  defaultParams: {
    // DeepSeek default parameters
    top_p: 0.95,
    frequency_penalty: 0,
    presence_penalty: 0
  }
});

