/**
 * Google (Gemini) Provider
 *
 * Provider implementation for Google Gemini models using the official @google/genai SDK v1.11+.
 * Implements the unified interface: async invoke(messages, options) => { content, stop_reason, rawResponse }
 */

import { GoogleGenAI } from '@google/genai';
import { debugLog, debugError } from '../utils/console.js';

// Define supported Gemini models with their capabilities
const SUPPORTED_MODELS = {
  'gemini-2.0-flash': {
    modelName: 'gemini-2.0-flash',
    friendlyName: 'Gemini (Flash 2.0)',
    contextWindow: 1048576, // 1M tokens
    maxOutputTokens: 65536,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsThinking: false,
    supportsWebSearch: true,
    maxThinkingTokens: 0,
    timeout: 300000,
    description: 'Gemini 2.0 Flash (1M context) - Latest fast model, supports audio/video input and grounding',
    aliases: ['flash-2.0', 'flash2', 'flash 2.0', 'gemini flash 2.0', 'gemini-2.0-flash-latest']
  },
  'gemini-2.0-flash-lite': {
    modelName: 'gemini-2.0-flash-lite',
    friendlyName: 'Gemini (Flash Lite 2.0)',
    contextWindow: 1048576, // 1M tokens
    maxOutputTokens: 65536,
    supportsStreaming: true,
    supportsImages: false,
    supportsTemperature: true,
    supportsThinking: false,
    supportsWebSearch: true,
    maxThinkingTokens: 0,
    timeout: 300000,
    description: 'Gemini 2.0 Flash Lite (1M context) - Lightweight fast model, text-only with grounding',
    aliases: ['flashlite', 'flash-lite', 'flash lite', 'flash-lite-2.0', 'gemini flash lite', 'gemini-2.0-flash-lite-latest']
  },
  'gemini-2.5-flash': {
    modelName: 'gemini-2.5-flash',
    friendlyName: 'Gemini (Flash 2.5)',
    contextWindow: 1048576, // 1M tokens
    maxOutputTokens: 65536,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsThinking: true,
    supportsWebSearch: true,
    maxThinkingTokens: 24576,
    timeout: 300000,
    description: 'Ultra-fast (1M context) - Quick analysis, simple queries, rapid iterations with grounding',
    aliases: ['flash', 'flash2.5', 'gemini-flash', 'gemini-flash-2.5', 'flash 2.5', 'gemini flash 2.5', 'gemini-2.5-flash-latest']
  },
  'gemini-2.5-pro': {
    modelName: 'gemini-2.5-pro',
    friendlyName: 'Gemini (Pro 2.5)',
    contextWindow: 1048576, // 1M tokens
    maxOutputTokens: 65536,
    supportsStreaming: true,
    supportsWebSearch: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsThinking: true,
    maxThinkingTokens: 32768,
    timeout: 300000,
    description: 'Deep reasoning + thinking mode (1M context) - Complex problems, architecture, deep analysis',
    aliases: ['pro', 'gemini pro', 'gemini-pro', 'gemini', 'pro 2.5', 'gemini pro 2.5', 'gemini-2.5-pro-latest']
  }
};

// Thinking mode budget percentages
const THINKING_BUDGETS = {
  minimal: 0.005, // 0.5% of max - minimal thinking for fast responses
  low: 0.08, // 8% of max - light reasoning tasks
  medium: 0.33, // 33% of max - balanced reasoning (default)
  high: 0.67, // 67% of max - complex analysis
  max: 1.0 // 100% of max - full thinking budget
};

/**
 * Custom error class for Google provider errors
 */
class GoogleProviderError extends Error {
  constructor(message, code, originalError = null) {
    super(message);
    this.name = 'GoogleProviderError';
    this.code = code;
    this.originalError = originalError;
  }
}

/**
 * Resolve model name to canonical form, including aliases
 */
function resolveModelName(modelName) {
  const modelNameLower = modelName.toLowerCase();

  // Check exact matches first
  for (const [supportedModel] of Object.entries(SUPPORTED_MODELS)) {
    if (supportedModel.toLowerCase() === modelNameLower) {
      return supportedModel;
    }
  }

  // Check aliases
  for (const [supportedModel, config] of Object.entries(SUPPORTED_MODELS)) {
    if (config.aliases) {
      for (const alias of config.aliases) {
        if (alias.toLowerCase() === modelNameLower) {
          return supportedModel;
        }
      }
    }
  }

  // Return as-is if not found (let Google API handle unknown models)
  return modelName;
}

/**
 * Validate Google API key format or Vertex AI marker
 */
function validateApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }

  // Special marker for Vertex AI mode
  if (apiKey === 'VERTEX_AI') {
    return true;
  }

  // Google API keys are typically long strings, usually starting with specific patterns
  // They are generally 39+ characters long
  return apiKey.length >= 20;
}

/**
 * Convert messages to Google Gemini format
 */
function convertMessagesToGemini(messages) {
  if (!Array.isArray(messages)) {
    throw new GoogleProviderError('Messages must be an array', 'INVALID_MESSAGES');
  }

  const contents = [];
  let systemPrompt = null;

  for (const [index, msg] of messages.entries()) {
    if (!msg || typeof msg !== 'object') {
      throw new GoogleProviderError(`Message at index ${index} must be an object`, 'INVALID_MESSAGE');
    }

    const { role, content } = msg;

    if (!role || !['system', 'user', 'assistant'].includes(role)) {
      throw new GoogleProviderError(`Invalid role "${role}" at message index ${index}`, 'INVALID_ROLE');
    }

    if (!content) {
      throw new GoogleProviderError(`Message content is required at index ${index}`, 'MISSING_CONTENT');
    }

    if (role === 'system') {
      // Google Gemini handles system prompts differently - they are typically prepended to the first user message
      systemPrompt = content;
    } else if (role === 'user') {
      const parts = [];

      // Handle complex content structure (array with text and images)
      if (Array.isArray(content)) {
        let textContent = '';

        for (const item of content) {
          if (item.type === 'text') {
            textContent += item.text;
          } else if (item.type === 'image' && item.source) {
            // Convert Anthropic/Claude format to Google Gemini format
            parts.push({
              inlineData: {
                mimeType: item.source.media_type,
                data: item.source.data
              }
            });
            debugLog(`[Google] Converting image: ${item.source.media_type}, data length: ${item.source.data.length}`);
          }
        }

        // Combine system prompt with text content if present
        const finalTextContent = systemPrompt ? `${systemPrompt}\n\n${textContent}` : textContent;
        if (finalTextContent) {
          parts.unshift({ text: finalTextContent });
        }
      } else {
        // Simple string content
        const userContent = systemPrompt ? `${systemPrompt}\n\n${content}` : content;
        parts.push({ text: userContent });
      }

      contents.push({
        role: 'user',
        parts
      });
      systemPrompt = null; // Only use system prompt once
    } else if (role === 'assistant') {
      // Handle assistant messages
      if (Array.isArray(content)) {
        const parts = [];
        for (const item of content) {
          if (item.type === 'text') {
            parts.push({ text: item.text });
          }
          // Assistant messages typically don't have images, but handle if needed
        }
        contents.push({
          role: 'model', // Google uses 'model' instead of 'assistant'
          parts
        });
      } else {
        contents.push({
          role: 'model',
          parts: [{ text: content }]
        });
      }
    }
  }

  return contents;
}

/**
 * Calculate thinking budget for models that support it
 */
function calculateThinkingBudget(modelConfig, reasoning_effort) {
  if (!modelConfig.supportsThinking || !modelConfig.maxThinkingTokens) {
    return 0;
  }

  const budget = THINKING_BUDGETS[reasoning_effort] || THINKING_BUDGETS.medium;
  return Math.floor(modelConfig.maxThinkingTokens * budget);
}

/**
 * Check if error is retryable
 */
function isErrorRetryable(error) {
  const errorStr = String(error).toLowerCase();

  // Non-retryable errors
  const nonRetryableIndicators = [
    'quota exceeded',
    'quota_exceeded',
    'resource exhausted',
    'resource_exhausted',
    'context length',
    'token limit',
    'request too large',
    'invalid request',
    'invalid_request',
    'read timeout',
    'timeout error',
    '408',
    'deadline exceeded'
  ];

  if (nonRetryableIndicators.some(indicator => errorStr.includes(indicator))) {
    return false;
  }

  // Retryable errors
  const retryableIndicators = [
    'connection',
    'network',
    'temporary',
    'unavailable',
    'retry',
    'internal error',
    '429',
    '500',
    '502',
    '503',
    '504',
    'ssl',
    'handshake'
  ];

  return retryableIndicators.some(indicator => errorStr.includes(indicator));
}

/**
 * Retry with progressive delays
 */
async function retryWithBackoff(fn, maxRetries = 4) {
  const retryDelays = [1000, 3000, 5000, 8000]; // Progressive delays in ms
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // If this is the last attempt or not retryable, give up
      if (attempt === maxRetries - 1 || !isErrorRetryable(error)) {
        break;
      }

      // Wait before retrying
      const delay = retryDelays[attempt];
      debugLog(`[Google] Retrying after ${delay}ms (attempt ${attempt + 1}/${maxRetries}):`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Main Google provider implementation
 */
export const googleProvider = {
  /**
   * Unified provider interface: invoke messages with options
   * @param {Array} messages - Array of message objects with role and content
   * @param {Object} options - Configuration options
   * @returns {Object|AsyncGenerator} - { content, stop_reason, rawResponse } or AsyncGenerator when stream=true
   */
  async invoke(messages, options = {}) {
    const {
      model = 'gemini-2.5-flash',
      temperature = 0.7,
      maxTokens = null,
      stream = false,
      reasoning_effort = 'medium',
      use_websearch = false,
      signal,
      config,
      ..._otherOptions
    } = options;

    // Check if using Vertex AI or Gemini Developer API
    const useVertexAI = config?.providers?.googlegenaiusevertexai;
    const vertexProject = config?.providers?.googlecloudproject;
    const vertexLocation = config?.providers?.googlecloudlocation;
    const apiVersion = config?.providers?.googleapiversion || 'v1beta';

    let genAI;

    if (useVertexAI) {
      // Validate Vertex AI configuration
      if (!vertexProject || !vertexLocation) {
        throw new GoogleProviderError(
          'Vertex AI requires GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION',
          'MISSING_VERTEX_CONFIG'
        );
      }

      debugLog(`[Google] Using Vertex AI: project=${vertexProject}, location=${vertexLocation}, apiVersion=${apiVersion}`);

      // Initialize with Vertex AI configuration
      genAI = new GoogleGenAI({
        vertexai: true,
        project: vertexProject,
        location: vertexLocation,
        apiVersion
      });
    } else {
      // Use Gemini Developer API with API key
      const apiKey = config?.apiKeys?.google;

      if (!apiKey || apiKey === 'VERTEX_AI') {
        throw new GoogleProviderError(
          'Google API key not configured. Set GOOGLE_API_KEY or GEMINI_API_KEY, or configure Vertex AI',
          'MISSING_API_KEY'
        );
      }

      if (!validateApiKey(apiKey)) {
        throw new GoogleProviderError('Invalid Google API key format', 'INVALID_API_KEY');
      }

      debugLog(`[Google] Using Gemini Developer API with configured API key, apiVersion=${apiVersion}`);

      // Initialize with API key - SDK will use GOOGLE_API_KEY as the actual key name
      genAI = new GoogleGenAI({
        apiKey,
        apiVersion
      });
    }

    // Resolve model name
    const resolvedModel = resolveModelName(model);
    const modelConfig = SUPPORTED_MODELS[resolvedModel] || {};

    // Convert messages to Google format
    const geminiContents = convertMessagesToGemini(messages);

    // Note: No need to get model instance, we use genAI.models.generateContent directly

    // Build generation config
    const generationConfig = {};

    // Add temperature if model supports it
    if (modelConfig.supportsTemperature !== false && temperature !== undefined) {
      generationConfig.temperature = Math.max(0, Math.min(2, temperature));
    }

    // Add max tokens if specified
    if (maxTokens) {
      generationConfig.maxOutputTokens = Math.min(maxTokens, modelConfig.maxOutputTokens || 65536);
    }

    // Add thinking configuration for models that support it
    if (modelConfig.supportsThinking && reasoning_effort) {
      const thinkingBudget = calculateThinkingBudget(modelConfig, reasoning_effort);
      if (thinkingBudget > 0) {
        generationConfig.thinkingConfig = { thinkingBudget };
      }
    }

    // Add web search grounding if requested and model supports it
    if (use_websearch && modelConfig.supportsWebSearch) {
      generationConfig.tools = [{ googleSearch: {} }];
    }

    // Handle streaming requests
    if (stream) {
      // Check if model supports streaming
      if (modelConfig.supportsStreaming === false) {
        debugLog(`[Google] Model ${resolvedModel} doesn't support streaming, falling back to non-streaming mode`);
      } else {
        return this._createStreamingGenerator(genAI, resolvedModel, geminiContents, generationConfig, modelConfig, reasoning_effort, use_websearch, signal);
      }
    }

    try {
      debugLog(`[Google] Calling ${resolvedModel} with ${messages.length} messages${use_websearch && modelConfig.supportsWebSearch ? ' (with grounding)' : ''}`);

      // Check if already aborted before making request
      if (signal?.aborted) {
        throw new Error(`Request aborted: ${signal.reason || 'Cancelled'}`);
      }

      const startTime = Date.now();

      // Make the API call with retry logic and abort signal support
      const response = await retryWithBackoff(async () => {
        if (signal?.aborted) {
          throw new Error(`Request aborted: ${signal.reason || 'Cancelled'}`);
        }
        
        return await genAI.models.generateContent({
          model: resolvedModel,
          contents: geminiContents,
          config: generationConfig
        });
      });

      const responseTime = Date.now() - startTime;
      debugLog(`[Google] Response received in ${responseTime}ms`);

      // Extract response data using the new SDK format
      const content = response.text;
      if (!content) {
        throw new GoogleProviderError('No text content received from Google', 'NO_RESPONSE_CONTENT');
      }

      // Extract usage information from the new SDK format
      const usage = {
        input_tokens: response.usageMetadata?.promptTokenCount || 0,
        output_tokens: response.usageMetadata?.candidatesTokenCount || 0,
        total_tokens: response.usageMetadata?.totalTokenCount || 0
      };

      // Extract finish reason from candidates
      const finishReason = response.candidates?.[0]?.finishReason || 'STOP';

      // Return unified response format
      return {
        content,
        stop_reason: finishReason,
        rawResponse: response,
        metadata: {
          model: resolvedModel,
          usage,
          response_time_ms: responseTime,
          finish_reason: finishReason,
          reasoning_effort: modelConfig.supportsThinking ? reasoning_effort : null,
          provider: 'google',
          web_search_used: use_websearch && modelConfig.supportsWebSearch,
          grounding_metadata: response.groundingMetadata || null
        }
      };

    } catch (error) {
      debugError('[Google] Error during API call:', error);

      // Handle specific Google errors
      if (error.message?.includes('quota') || error.message?.includes('QUOTA_EXCEEDED')) {
        throw new GoogleProviderError('Google API quota exceeded', 'QUOTA_EXCEEDED', error);
      } else if (error.message?.includes('API_KEY_INVALID') || error.message?.includes('invalid api key')) {
        throw new GoogleProviderError('Invalid Google API key', 'INVALID_API_KEY', error);
      } else if (error.message?.includes('MODEL_NOT_FOUND')) {
        throw new GoogleProviderError(`Model ${resolvedModel} not found`, 'MODEL_NOT_FOUND', error);
      } else if (error.message?.includes('CONTEXT_LENGTH_EXCEEDED')) {
        throw new GoogleProviderError('Context length exceeded for model', 'CONTEXT_LENGTH_EXCEEDED', error);
      } else if (error.message?.includes('SAFETY')) {
        throw new GoogleProviderError('Content blocked by safety filters', 'SAFETY_ERROR', error);
      } else if (error.message?.includes('RATE_LIMIT_EXCEEDED')) {
        throw new GoogleProviderError('Google rate limit exceeded', 'RATE_LIMIT_EXCEEDED', error);
      }

      // Generic error handling
      throw new GoogleProviderError(
        `Google API error: ${error.message || 'Unknown error'}`,
        'API_ERROR',
        error
      );
    }
  },

  /**
   * Create streaming generator for Google provider
   * @param {Object} genAI - GoogleGenAI instance
   * @param {string} resolvedModel - Resolved model name
   * @param {Array} geminiContents - Converted messages for Gemini format
   * @param {Object} generationConfig - Generation configuration
   * @param {Object} modelConfig - Model configuration
   * @param {string} reasoning_effort - Reasoning effort level
   * @param {boolean} use_websearch - Whether web search is enabled
   * @returns {AsyncGenerator} - Streaming generator yielding chunks
   */
  async *_createStreamingGenerator(genAI, resolvedModel, geminiContents, generationConfig, modelConfig, reasoning_effort, use_websearch, signal) {
    debugLog(`[Google] Starting streaming for ${resolvedModel} with ${geminiContents.length} messages${use_websearch && modelConfig.supportsWebSearch ? ' (with grounding)' : ''}`);

    const startTime = Date.now();
    let totalContent = '';
    let finalUsage = null;
    let finishReason = null;
    let groundingMetadata = null;

    try {
      // Check if already aborted before starting
      if (signal?.aborted) {
        throw new Error(`Request aborted: ${signal.reason || 'Cancelled'}`);
      }

      // Yield start event
      yield {
        type: 'start',
        timestamp: new Date().toISOString(),
        model: resolvedModel,
        provider: 'google',
        thinking_mode: modelConfig.supportsThinking && reasoning_effort,
        web_search: use_websearch && modelConfig.supportsWebSearch
      };

      // Create streaming request with retry logic and abort signal support
      const streamResult = await retryWithBackoff(async () => {
        if (signal?.aborted) {
          throw new Error(`Request aborted: ${signal.reason || 'Cancelled'}`);
        }
        
        // Google GenAI client doesn't directly support AbortSignal in the same way
        // but we can check for cancellation before and during processing
        return await genAI.models.generateContentStream({
          model: resolvedModel,
          contents: geminiContents,
          config: generationConfig
        });
      });

      // Process streaming chunks
      for await (const chunk of streamResult) {
        try {
          // Check for cancellation during stream processing
          if (signal?.aborted) {
            debugLog(`[Google] Stream aborted during processing: ${signal.reason || 'Cancelled'}`);
            break;
          }
          const content = chunk.text || '';

          if (content) {
            totalContent += content;

            yield {
              type: 'delta',
              content,
              timestamp: new Date().toISOString(),
              model: resolvedModel,
              provider: 'google'
            };
          }

          // Check for finish reason in chunk
          if (chunk.candidates?.[0]?.finishReason) {
            finishReason = chunk.candidates[0].finishReason;
          }

        } catch (chunkError) {
          debugError('[Google] Error processing streaming chunk:', chunkError);
          yield {
            type: 'error',
            error: chunkError.message,
            timestamp: new Date().toISOString()
          };
        }
      }

      // Get final aggregated response for metadata
      try {
        const finalResponse = await streamResult.response;

        // Extract usage metadata from final response
        finalUsage = {
          input_tokens: finalResponse.usageMetadata?.promptTokenCount || 0,
          output_tokens: finalResponse.usageMetadata?.candidatesTokenCount || 0,
          total_tokens: finalResponse.usageMetadata?.totalTokenCount || 0
        };

        // Extract grounding metadata if web search was used
        if (use_websearch && modelConfig.supportsWebSearch) {
          groundingMetadata = finalResponse.groundingMetadata || null;
        }

        // Use finish reason from final response if not already set
        if (!finishReason && finalResponse.candidates?.[0]?.finishReason) {
          finishReason = finalResponse.candidates[0].finishReason;
        }

      } catch (finalResponseError) {
        debugError('[Google] Error getting final response metadata:', finalResponseError);
      }

      const responseTime = Date.now() - startTime;

      // Yield completion event with metadata
      yield {
        type: 'completion',
        content: totalContent,
        stop_reason: finishReason || 'STOP',
        timestamp: new Date().toISOString(),
        metadata: {
          model: resolvedModel,
          usage: finalUsage || { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
          response_time_ms: responseTime,
          finish_reason: finishReason || 'STOP',
          reasoning_effort: modelConfig.supportsThinking ? reasoning_effort : null,
          provider: 'google',
          web_search_used: use_websearch && modelConfig.supportsWebSearch,
          grounding_metadata: groundingMetadata,
          thinking_mode_enabled: !!(modelConfig.supportsThinking && reasoning_effort)
        }
      };

      debugLog(`[Google] Streaming completed in ${responseTime}ms, ${finalUsage?.total_tokens || 0} total tokens`);

    } catch (error) {
      debugError('[Google] Streaming error:', error);

      // Yield error event
      yield {
        type: 'error',
        error: error.message || 'Unknown streaming error',
        timestamp: new Date().toISOString(),
        provider: 'google'
      };

      // Re-throw with proper error handling
      if (error.message?.includes('quota') || error.message?.includes('QUOTA_EXCEEDED')) {
        throw new GoogleProviderError('Google API quota exceeded', 'QUOTA_EXCEEDED', error);
      } else if (error.message?.includes('API_KEY_INVALID') || error.message?.includes('invalid api key')) {
        throw new GoogleProviderError('Invalid Google API key', 'INVALID_API_KEY', error);
      } else if (error.message?.includes('MODEL_NOT_FOUND')) {
        throw new GoogleProviderError(`Model ${resolvedModel} not found`, 'MODEL_NOT_FOUND', error);
      } else if (error.message?.includes('CONTEXT_LENGTH_EXCEEDED')) {
        throw new GoogleProviderError('Context length exceeded for model', 'CONTEXT_LENGTH_EXCEEDED', error);
      } else if (error.message?.includes('SAFETY')) {
        throw new GoogleProviderError('Content blocked by safety filters', 'SAFETY_ERROR', error);
      } else if (error.message?.includes('RATE_LIMIT_EXCEEDED')) {
        throw new GoogleProviderError('Google rate limit exceeded', 'RATE_LIMIT_EXCEEDED', error);
      }

      // Generic error handling
      throw new GoogleProviderError(
        `Google streaming error: ${error.message || 'Unknown error'}`,
        'STREAMING_ERROR',
        error
      );
    }
  },

  /**
   * Validate configuration for Google provider
   * @param {Object} config - Configuration object
   * @returns {boolean} - True if configuration is valid
   */
  validateConfig(config) {
    // Check for Vertex AI configuration
    const hasVertexAI = !!(config?.providers?.googlegenaiusevertexai &&
                          config?.providers?.googlecloudproject &&
                          config?.providers?.googlecloudlocation);

    // Check for API key configuration
    const hasApiKey = !!(config?.apiKeys?.google && validateApiKey(config.apiKeys.google));

    return hasVertexAI || hasApiKey;
  },

  /**
   * Check if provider is available with current configuration
   * @param {Object} config - Configuration object
   * @returns {boolean} - True if provider is available
   */
  isAvailable(config) {
    return this.validateConfig(config);
  },

  /**
   * Get supported models
   * @returns {Object} - Map of supported models and their configurations
   */
  getSupportedModels() {
    return SUPPORTED_MODELS;
  },

  /**
   * Get model configuration
   * @param {string} modelName - Model name
   * @returns {Object|null} - Model configuration or null if not found
   */
  getModelConfig(modelName) {
    const resolved = resolveModelName(modelName);
    return SUPPORTED_MODELS[resolved] || null;
  }
};
