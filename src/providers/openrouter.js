/**
 * OpenRouter Provider
 *
 * Provider implementation for OpenRouter's unified API gateway using OpenAI-compatible API.
 * Implements the unified interface: async invoke(messages, options) => { content, stop_reason, rawResponse }
 *
 * OpenRouter provides access to multiple AI models through a single API endpoint.
 * IMPORTANT: Requires HTTP-Referer header for compliance tracking.
 */

import { createOpenAICompatibleProvider } from './openai-compatible.js';
import { debugLog } from '../utils/console.js';
import { ProviderError, ErrorCodes } from './interface.js';
import { fetchModelEndpointsWithCache } from './openrouter-endpoints-client.js';

// Define supported OpenRouter models with their capabilities
// Only including the three specific models requested
const SUPPORTED_MODELS = {
  'qwen/qwen3-235b-a22b-thinking-2507': {
    modelName: 'qwen/qwen3-235b-a22b-thinking-2507',
    friendlyName: 'Qwen3 235B Thinking (via OpenRouter)',
    contextWindow: 32768,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsImages: false,
    supportsTemperature: true,
    supportsWebSearch: false,
    supportsThinking: true,
    timeout: 300000,
    description: 'Qwen3 235B Thinking model with enhanced reasoning capabilities',
    aliases: ['qwen3-thinking', 'qwen-thinking', 'qwen3 thinking', 'qwen thinking', 'qwen3-235b-thinking']
  },
  'qwen/qwen3-coder': {
    modelName: 'qwen/qwen3-coder',
    friendlyName: 'Qwen3 Coder (via OpenRouter)',
    contextWindow: 32768,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsImages: false,
    supportsTemperature: true,
    supportsWebSearch: false,
    timeout: 300000,
    description: 'Qwen3 Coder specialized for programming tasks',
    aliases: ['qwen3-coder', 'qwen-coder', 'qwen3 coder', 'qwen coder', 'qwen-3-coder']
  },
  'moonshotai/kimi-k2': {
    modelName: 'moonshotai/kimi-k2',
    friendlyName: 'Kimi K2 (via OpenRouter)',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsImages: false,
    supportsTemperature: true,
    supportsWebSearch: false,
    timeout: 300000,
    description: 'Moonshot AI Kimi K2 with extended context window',
    aliases: ['kimi-k2', 'moonshot-kimi', 'kimi k2', 'kimi', 'moonshot kimi', 'moonshot-k2', 'k2']
  },
  'openrouter/auto': {
    modelName: 'openrouter/auto',
    friendlyName: 'OpenRouter Auto (via NotDiamond)',
    contextWindow: 128000, // Safe default for auto-routing
    maxOutputTokens: 8192, // Safe default
    supportsStreaming: true,
    supportsImages: false, // Conservative default
    supportsTemperature: true,
    supportsWebSearch: false,
    timeout: 300000,
    description: 'Auto-selects the best model for your prompt using NotDiamond routing',
    aliases: ['openrouter auto', 'auto router', 'auto-router', 'openrouter-auto']
  }
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
 * Get custom headers for OpenRouter
 */
function getCustomHeaders(config) {
  const headers = {};

  // REQUIRED: HTTP-Referer header for compliance
  // Handle both camelCase (from tests) and lowercase (from config.js) keys
  const referer = config?.providers?.openrouterreferer ||
                  config?.providers?.openrouterReferer ||
                  'https://github.com/FallDownTheSystem/converse';
  headers['HTTP-Referer'] = referer;

  // Optional: X-Title header for request tracking
  const title = config?.providers?.openroutertitle || config?.providers?.openrouterTitle;
  if (title) {
    headers['X-Title'] = title;
  }

  debugLog(`[OpenRouter] Using referer: ${referer}`);

  return headers;
}

/**
 * Transform request to handle OpenRouter-specific requirements
 */
async function transformRequest(requestPayload, { modelConfig }) {
  // OpenRouter supports additional parameters
  const transformed = { ...requestPayload };

  // Ensure model name includes provider prefix if not already present
  if (!transformed.model.includes('/')) {
    debugLog(`[OpenRouter] Warning: Model name '${transformed.model}' should include provider prefix (e.g., 'anthropic/claude-3.5-sonnet')`);
  }

  // OpenRouter supports provider-specific parameters through 'provider' field
  // This is useful for passing model-specific settings
  if (modelConfig.providerSettings) {
    transformed.provider = modelConfig.providerSettings;
  }

  return transformed;
}

/**
 * Transform response to handle OpenRouter-specific fields
 */
async function transformResponse(result, rawResponse) {
  // OpenRouter adds additional metadata
  if (rawResponse.id) {
    result.metadata.request_id = rawResponse.id;
  }

  // OpenRouter provides pricing information
  if (rawResponse.usage) {
    if (rawResponse.usage.prompt_cost) {
      result.metadata.prompt_cost = rawResponse.usage.prompt_cost;
    }
    if (rawResponse.usage.completion_cost) {
      result.metadata.completion_cost = rawResponse.usage.completion_cost;
    }
    if (rawResponse.usage.total_cost) {
      result.metadata.total_cost = rawResponse.usage.total_cost;
    }
  }

  // OpenRouter may return the actual provider used
  if (rawResponse.provider) {
    result.metadata.actual_provider = rawResponse.provider;
  }

  return result;
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
  customHeaders: {}, // Headers are dynamic, set via getCustomHeaders
  defaultParams: {
    // OpenRouter default parameters
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0
  }
});

/**
 * Check if a model string follows OpenRouter's provider/model format
 */
function isOpenRouterModelFormat(modelName) {
  return typeof modelName === 'string' && modelName.includes('/');
}

/**
 * Create a dynamic model configuration from minimal information
 */
function createDynamicModelConfig(modelName) {
  return {
    modelName,
    friendlyName: `${modelName} (via OpenRouter)`,
    contextWindow: 8192, // Safe default
    maxOutputTokens: 4096, // Safe default
    supportsStreaming: true,
    supportsImages: false, // Conservative default
    supportsTemperature: true,
    supportsWebSearch: false,
    timeout: 300000,
    description: `Dynamic model: ${modelName}`,
    isDynamic: true // Flag to identify dynamic models
  };
}

// Store for dynamically discovered models
const dynamicModels = new Map();

// Override methods to support dynamic models
const originalGetSupportedModels = openrouterProvider.getSupportedModels;
openrouterProvider.getSupportedModels = function() {
  const staticModels = originalGetSupportedModels.call(this);

  // Merge dynamic models if any exist
  if (dynamicModels.size > 0) {
    const allModels = { ...staticModels };
    for (const [modelName, config] of dynamicModels) {
      allModels[modelName] = config;
    }
    return allModels;
  }

  return staticModels;
};

// Create an async version of getModelConfig for API fetching
openrouterProvider.getModelConfigAsync = async function(modelName) {
  // First check static models
  const staticConfig = this.getModelConfig(modelName);
  if (staticConfig && !staticConfig.isDynamic) {
    return staticConfig;
  }

  // Check if already in dynamic models cache
  if (dynamicModels.has(modelName)) {
    return dynamicModels.get(modelName);
  }

  // If dynamic models are enabled and model follows format, fetch from API
  const config = this._lastConfig || {};
  const dynamicModelsEnabled = config?.providers?.openrouterdynamicmodels || 
                               config?.providers?.openrouterDynamicModels;
  if (dynamicModelsEnabled && isOpenRouterModelFormat(modelName)) {
    debugLog(`[OpenRouter] Fetching dynamic model config for: ${modelName}`);
    
    // Fetch from API with caching
    const apiConfig = await fetchModelEndpointsWithCache(modelName);
    
    if (apiConfig) {
      // Store in dynamic models cache
      dynamicModels.set(modelName, apiConfig);
      return apiConfig;
    } else {
      // Model not found on API, create default config to avoid repeated lookups
      const defaultConfig = createDynamicModelConfig(modelName);
      defaultConfig.notFoundOnApi = true;
      dynamicModels.set(modelName, defaultConfig);
      return defaultConfig;
    }
  }

  return null;
};

const originalGetModelConfig = openrouterProvider.getModelConfig;
openrouterProvider.getModelConfig = function(modelName) {
  // First check static models
  const staticConfig = originalGetModelConfig.call(this, modelName);
  if (staticConfig) {
    return staticConfig;
  }

  // Check dynamic models
  if (dynamicModels.has(modelName)) {
    return dynamicModels.get(modelName);
  }

  // For synchronous calls, create default config if dynamic models enabled
  const config = this._lastConfig || {};
  const dynamicModelsEnabled = config?.providers?.openrouterdynamicmodels || 
                               config?.providers?.openrouterDynamicModels;
  if (dynamicModelsEnabled && isOpenRouterModelFormat(modelName)) {
    // Note: This is a fallback for synchronous calls
    // The async version should be preferred for accurate model info
    const dynamicConfig = createDynamicModelConfig(modelName);
    dynamicConfig.needsApiUpdate = true;
    return dynamicConfig;
  }

  return null;
};

// Override the invoke method to add dynamic headers and model support
const originalInvoke = openrouterProvider.invoke;
openrouterProvider.invoke = async function(messages, options = {}) {
  // Store config for use in getModelConfig
  this._lastConfig = options.config;

  // Validate referer configuration
  // Handle both camelCase (from tests) and lowercase (from config.js) keys
  if (!options.config?.providers?.openrouterreferer && !options.config?.providers?.openrouterReferer) {
    throw new OpenRouterProviderError(
      'OpenRouter requires HTTP-Referer header. Please set OPENROUTER_REFERER in your environment',
      ErrorCodes.INVALID_REQUEST
    );
  }

  // Check if we need to fetch dynamic model config
  const modelName = options.model;
  if (modelName) {
    const existingConfig = this.getModelConfig(modelName);
    
    // If the model needs API update, fetch it now
    if (existingConfig?.needsApiUpdate) {
      const dynamicModelsEnabled = options.config?.providers?.openrouterdynamicmodels || 
                                  options.config?.providers?.openrouterDynamicModels;
      if (dynamicModelsEnabled) {
        debugLog(`[OpenRouter] Fetching API config for model: ${modelName}`);
        await this.getModelConfigAsync(modelName);
      }
    }
  }

  // Create a modified config with custom headers
  const modifiedOptions = {
    ...options,
    config: {
      ...options.config,
      // Inject custom headers into the provider config
      providers: {
        ...options.config.providers,
        _customHeaders: getCustomHeaders(options.config)
      }
    }
  };

  // Call original invoke with modified options
  return originalInvoke.call(this, messages, modifiedOptions);
};

// Note: The base module needs to be updated to use _customHeaders if present
// This is a temporary workaround - in production, the openai-compatible.js
// should be updated to accept a function for customHeaders

