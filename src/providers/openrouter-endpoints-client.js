/**
 * OpenRouter Endpoints API Client
 *
 * Handles fetching model capabilities from OpenRouter's endpoints API.
 * Provides caching and error handling for dynamic model discovery.
 */

import { debugLog, debugError } from '../utils/console.js';

/**
 * Parse an OpenRouter model ID into author and slug components
 * @param {string} modelId - Model ID in format "author/slug"
 * @returns {{author: string, slug: string} | null} Parsed components or null if invalid
 */
function parseModelId(modelId) {
  if (!modelId || typeof modelId !== 'string') {
    return null;
  }

  const parts = modelId.split('/');
  if (parts.length !== 2) {
    return null;
  }

  const [author, slug] = parts;
  if (!author || !slug) {
    return null;
  }

  return { author, slug };
}

/**
 * Convert endpoint data to model configuration format
 * @param {Object} endpointData - Raw endpoint data from API
 * @returns {Object} Model configuration object
 */
function convertEndpointToModelConfig(endpointData) {
  const data = endpointData.data;
  const modelId = data.id;

  // Find the best endpoint (prefer primary providers)
  const preferredProviders = ['Anthropic', 'OpenAI', 'Google', 'XAI'];
  let selectedEndpoint = data.endpoints[0]; // Default to first

  for (const endpoint of data.endpoints) {
    if (preferredProviders.includes(endpoint.provider_name)) {
      selectedEndpoint = endpoint;
      break;
    }
  }

  // Extract supported parameters
  const supportedParams = selectedEndpoint.supported_parameters || [];

  return {
    modelName: modelId,
    friendlyName: data.name || `${modelId} (via OpenRouter)`,
    description: data.description || `Dynamic model: ${modelId}`,
    contextWindow: selectedEndpoint.context_length || 8192,
    maxOutputTokens: selectedEndpoint.max_completion_tokens || 4096,
    supportsStreaming: true, // Most models support streaming
    supportsImages:
      data.architecture?.input_modalities?.includes('image') || false,
    supportsTemperature: supportedParams.includes('temperature'),
    supportsWebSearch: false, // Not in API response, conservative default
    supportsThinking: supportedParams.includes('reasoning'),
    supportsTools: supportedParams.includes('tools'),
    timeout: 300000, // 5 minutes default
    isDynamic: true,
    // Store additional metadata
    metadata: {
      architecture: data.architecture,
      endpoints: data.endpoints,
      pricing: selectedEndpoint.pricing,
      selectedProvider: selectedEndpoint.provider_name,
      maxPromptTokens: selectedEndpoint.max_prompt_tokens,
    },
  };
}

/**
 * Fetch model endpoints from OpenRouter API
 * @param {string} modelId - Model ID in format "author/slug"
 * @returns {Promise<Object|null>} Model configuration or null if not found
 */
export async function fetchModelEndpoints(modelId) {
  const parsed = parseModelId(modelId);
  if (!parsed) {
    debugLog(`[OpenRouter Endpoints] Invalid model ID format: ${modelId}`);
    return null;
  }

  const { author, slug } = parsed;
  const url = `https://openrouter.ai/api/v1/models/${author}/${slug}/endpoints`;

  try {
    debugLog(`[OpenRouter Endpoints] Fetching endpoints for ${modelId}`);

    const response = await globalThis.fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (response.status === 404) {
      debugLog(`[OpenRouter Endpoints] Model not found: ${modelId}`);
      return null;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Validate response structure
    if (!data?.data?.id || !data?.data?.endpoints?.length) {
      debugLog(
        `[OpenRouter Endpoints] Invalid response structure for ${modelId}`,
      );
      return null;
    }

    const modelConfig = convertEndpointToModelConfig(data);
    debugLog(
      `[OpenRouter Endpoints] Successfully fetched config for ${modelId}`,
    );

    return modelConfig;
  } catch (error) {
    debugError(`[OpenRouter Endpoints] Error fetching ${modelId}:`, error);
    return null;
  }
}

/**
 * Create a simple in-memory cache for model endpoints
 */
export function createEndpointsCache() {
  const cache = new Map();
  const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours
  const FAILED_TTL = 5 * 60 * 1000; // 5 minutes for failed requests

  return {
    /**
     * Get a cached value
     * @param {string} key - Cache key
     * @returns {{found: boolean, value: any}} Cache result
     */
    get(key) {
      const entry = cache.get(key);
      if (!entry) {
        return { found: false, value: null };
      }

      if (Date.now() > entry.expiry) {
        cache.delete(key);
        return { found: false, value: null };
      }

      return { found: true, value: entry.value };
    },

    /**
     * Set a cached value
     * @param {string} key - Cache key
     * @param {Object|null} value - Value to cache
     * @param {boolean} isFailure - Whether this is a failed request
     */
    set(key, value, isFailure = false) {
      const ttl = isFailure ? FAILED_TTL : DEFAULT_TTL;
      cache.set(key, {
        value,
        expiry: Date.now() + ttl,
      });
    },

    /**
     * Clear the entire cache
     */
    clear() {
      cache.clear();
    },

    /**
     * Get cache size
     * @returns {number} Number of cached entries
     */
    size() {
      return cache.size;
    },
  };
}

// Create a singleton cache instance
export const endpointsCache = createEndpointsCache();

/**
 * Fetch model endpoints with caching
 * @param {string} modelId - Model ID in format "author/slug"
 * @returns {Promise<Object|null>} Model configuration or null if not found
 */
export async function fetchModelEndpointsWithCache(modelId) {
  // Check cache first
  const cached = endpointsCache.get(modelId);
  if (cached.found) {
    debugLog(`[OpenRouter Endpoints] Using cached config for ${modelId}`);
    return cached.value;
  }

  // Fetch from API
  const config = await fetchModelEndpoints(modelId);

  // Cache the result (including null for not found)
  endpointsCache.set(modelId, config, config === null);

  return config;
}
