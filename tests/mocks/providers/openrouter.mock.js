/**
 * Mock OpenRouter provider for testing
 * Implements OpenRouter-specific behavior including dynamic model support
 */

import { vi } from 'vitest';
import { createMockProvider, MockResponseBuilder } from './base.mock.js';
import { ProviderError, ErrorCodes } from '../../../src/providers/interface.js';

// OpenRouter model configurations
const OPENROUTER_MODELS = {
  'openai/gpt-4': {
    modelName: 'openai/gpt-4',
    friendlyName: 'GPT-4 (OpenRouter)',
    contextWindow: 8192,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: false,
    supportsThinking: false,
    timeout: 30000,
    description: 'GPT-4 via OpenRouter',
    aliases: []
  },
  'anthropic/claude-3-opus': {
    modelName: 'anthropic/claude-3-opus',
    friendlyName: 'Claude 3 Opus (OpenRouter)',
    contextWindow: 200000,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: false,
    supportsThinking: false,
    timeout: 60000,
    description: 'Claude 3 Opus via OpenRouter',
    aliases: []
  },
  'google/gemini-pro-1.5': {
    modelName: 'google/gemini-pro-1.5',
    friendlyName: 'Gemini 1.5 Pro (OpenRouter)',
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: false,
    supportsThinking: false,
    timeout: 60000,
    description: 'Gemini 1.5 Pro via OpenRouter',
    aliases: []
  },
  'meta-llama/llama-3.1-405b-instruct': {
    modelName: 'meta-llama/llama-3.1-405b-instruct',
    friendlyName: 'Llama 3.1 405B (OpenRouter)',
    contextWindow: 131072,
    maxOutputTokens: 131072,
    supportsStreaming: true,
    supportsImages: false,
    supportsTemperature: true,
    supportsWebSearch: false,
    supportsThinking: false,
    timeout: 60000,
    description: 'Llama 3.1 405B via OpenRouter',
    aliases: []
  }
};

// Mock endpoints API response
export const mockEndpointsResponse = {
  data: [
    {
      id: 'openai/gpt-4',
      name: 'GPT-4',
      context_length: 8192,
      pricing: { prompt: '0.00003', completion: '0.00006' },
      top_provider: { max_completion_tokens: 4096 },
      architecture: { modality: 'text->text', tokenizer: 'GPT' }
    },
    {
      id: 'anthropic/claude-3-opus',
      name: 'Claude 3 Opus',
      context_length: 200000,
      pricing: { prompt: '0.000015', completion: '0.000075' },
      top_provider: { max_completion_tokens: 4096 },
      architecture: { modality: 'text+image->text', tokenizer: 'Claude' }
    },
    {
      id: 'custom/new-model',
      name: 'New Custom Model',
      context_length: 32768,
      pricing: { prompt: '0.00001', completion: '0.00002' },
      top_provider: { max_completion_tokens: 4096 },
      architecture: { modality: 'text->text', tokenizer: 'Custom' }
    }
  ]
};

// Mock OpenRouter endpoints client
export const MockOpenRouterEndpointsClient = {
  fetchModelInfo: vi.fn().mockResolvedValue(mockEndpointsResponse.data[0]),
  fetchAllModels: vi.fn().mockResolvedValue(mockEndpointsResponse.data),
  getCachedModelInfo: vi.fn().mockReturnValue(null),
  setCachedModelInfo: vi.fn(),
  clearCache: vi.fn()
};

// Create OpenRouter-specific mock provider
export function createMockOpenRouterProvider(overrides = {}) {
  const provider = createMockProvider({
    name: 'openrouter',
    
    // Include endpoints client
    endpointsClient: MockOpenRouterEndpointsClient,
    
    getSupportedModels: vi.fn().mockImplementation(() => OPENROUTER_MODELS),
    
    getModelConfig: vi.fn().mockImplementation(async (modelName) => {
      // Check static models
      if (OPENROUTER_MODELS[modelName]) {
        return OPENROUTER_MODELS[modelName];
      }
      
      // Check if it's a dynamic model pattern
      if (modelName.includes('/')) {
        // Simulate fetching from endpoints API
        const mockDynamicModel = {
          modelName,
          friendlyName: `${modelName} (OpenRouter)`,
          contextWindow: 32768,
          maxOutputTokens: 4096,
          supportsStreaming: true,
          supportsImages: modelName.includes('vision') || modelName.includes('multimodal'),
          supportsTemperature: true,
          supportsWebSearch: false,
          supportsThinking: false,
          timeout: 60000,
          description: `Dynamic model ${modelName} via OpenRouter`,
          aliases: []
        };
        
        // Cache the result
        MockOpenRouterEndpointsClient.setCachedModelInfo(modelName, mockDynamicModel);
        
        return mockDynamicModel;
      }
      
      return null;
    }),
    
    invoke: vi.fn().mockImplementation(async (messages, options = {}) => {
      // Simulate OpenRouter-specific validations
      if (!options.config?.apiKeys?.openrouter) {
        throw new ProviderError('OpenRouter API key is required', ErrorCodes.MISSING_API_KEY);
      }
      
      // Handle dynamic models
      const modelName = options.model || 'openai/gpt-4';
      const isDynamicModel = !OPENROUTER_MODELS[modelName] && modelName.includes('/');
      
      if (isDynamicModel) {
        // Simulate dynamic model invocation
        return new MockResponseBuilder()
          .withContent(`Mock response from dynamic model: ${modelName}`)
          .withModel(modelName)
          .withProvider('openrouter')
          .withRawResponse({
            id: 'openrouter-dynamic',
            model: modelName,
            usage: {
              prompt_tokens: 50,
              completion_tokens: 30,
              total_tokens: 80
            }
          })
          .build();
      }
      
      // Default response
      return new MockResponseBuilder()
        .withContent('Mock OpenRouter response')
        .withModel(modelName)
        .withProvider('openrouter')
        .build();
    }),
    
    ...overrides
  });
  
  // Add method to simulate endpoints API behavior
  provider.refreshModelList = vi.fn().mockImplementation(async () => {
    const dynamicModels = {};
    for (const model of mockEndpointsResponse.data) {
      dynamicModels[model.id] = {
        modelName: model.id,
        friendlyName: model.name,
        contextWindow: model.context_length,
        maxOutputTokens: model.top_provider.max_completion_tokens || 4096,
        supportsStreaming: true,
        supportsImages: model.architecture.modality.includes('image'),
        supportsTemperature: true,
        supportsWebSearch: false,
        supportsThinking: false,
        timeout: 60000,
        description: `${model.name} via OpenRouter`,
        aliases: []
      };
    }
    return dynamicModels;
  });
  
  return provider;
}

// Export default instance
export const mockOpenRouterProvider = createMockOpenRouterProvider();

// Mock response generators for OpenRouter format
export function createMockOpenRouterResponse(content = 'Test response', options = {}) {
  return {
    id: `openrouter-${Date.now()}`,
    model: options.model || 'openai/gpt-4',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content
      },
      finish_reason: options.finish_reason || 'stop'
    }],
    usage: {
      prompt_tokens: options.prompt_tokens || 10,
      completion_tokens: options.completion_tokens || 20,
      total_tokens: (options.prompt_tokens || 10) + (options.completion_tokens || 20)
    }
  };
}

// Mock streaming response generator
export function createMockOpenRouterStreamResponse(chunks = ['Hello', ' world', '!'], options = {}) {
  return chunks.map((chunk, index) => ({
    id: `openrouter-${Date.now()}`,
    model: options.model || 'openai/gpt-4',
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    choices: [{
      index: 0,
      delta: {
        content: chunk
      },
      finish_reason: index === chunks.length - 1 ? 'stop' : null
    }]
  }));
}

// Error response generators
export function createMockOpenRouterError(type = 'invalid_api_key', message = null) {
  const errors = {
    invalid_api_key: {
      error: {
        message: message || 'Invalid API key',
        type: 'invalid_api_key',
        code: 401
      }
    },
    rate_limit: {
      error: {
        message: message || 'Rate limit exceeded',
        type: 'rate_limit_exceeded',
        code: 429
      }
    },
    model_not_found: {
      error: {
        message: message || `Model not found. Available models: ${Object.keys(OPENROUTER_MODELS).join(', ')}`,
        type: 'model_not_found',
        code: 404
      }
    },
    insufficient_funds: {
      error: {
        message: message || 'Insufficient funds',
        type: 'insufficient_funds',
        code: 402
      }
    }
  };
  
  return errors[type] || errors.invalid_api_key;
}

// Create a mock OpenRouter client with configurable behavior
export function createMockOpenRouterClient(behavior = {}) {
  return {
    chat: {
      completions: {
        create: vi.fn().mockImplementation(async (params) => {
          if (behavior.throwError) {
            const error = new Error('OpenRouter error');
            error.response = {
              status: behavior.errorCode || 400,
              data: createMockOpenRouterError(behavior.errorType)
            };
            throw error;
          }
          
          if (params.stream) {
            const chunks = behavior.chunks || ['Test', ' streaming', ' response'];
            return {
              [Symbol.asyncIterator]: async function* () {
                for (const chunk of createMockOpenRouterStreamResponse(chunks, params)) {
                  yield chunk;
                }
              }
            };
          }
          
          return createMockOpenRouterResponse(
            behavior.content || 'Mock response',
            behavior.responseOptions || {}
          );
        })
      }
    }
  };
}