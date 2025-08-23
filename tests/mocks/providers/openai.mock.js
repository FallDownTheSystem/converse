/**
 * Mock OpenAI provider for testing
 * Implements OpenAI-specific behavior and response formats
 */

import { vi } from 'vitest';
import { createMockProvider, MockResponseBuilder } from './base.mock.js';
import { ProviderError, ErrorCodes, StopReasons } from '../../../src/providers/interface.js';

// OpenAI model configurations matching the real provider
const OPENAI_MODELS = {
  'gpt-4': {
    modelName: 'gpt-4',
    friendlyName: 'GPT-4',
    contextWindow: 8192,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: false,
    supportsThinking: false,
    timeout: 30000,
    description: 'Most capable GPT-4 model, best for complex tasks',
    aliases: ['gpt-4-0613']
  },
  'gpt-4-turbo': {
    modelName: 'gpt-4-turbo',
    friendlyName: 'GPT-4 Turbo',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: false,
    supportsThinking: false,
    timeout: 30000,
    description: 'Latest GPT-4 Turbo with vision capabilities',
    aliases: ['gpt-4-turbo-preview', 'gpt-4-1106-preview', 'gpt-4-vision-preview']
  },
  'gpt-4o': {
    modelName: 'gpt-4o',
    friendlyName: 'GPT-4o',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: true,
    supportsThinking: false,
    timeout: 30000,
    description: 'Multimodal flagship model',
    aliases: ['gpt-4o-2024-11-20', 'chatgpt-4o-latest']
  },
  'gpt-4o-mini': {
    modelName: 'gpt-4o-mini',
    friendlyName: 'GPT-4o Mini',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: true,
    supportsThinking: false,
    timeout: 30000,
    description: 'Small, affordable, intelligent model',
    aliases: ['gpt-4o-mini-2024-07-18']
  },
  'o1': {
    modelName: 'o1',
    friendlyName: 'o1',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    supportsStreaming: false,
    supportsImages: true,
    supportsTemperature: false,
    supportsWebSearch: false,
    supportsThinking: true,
    maxThinkingTokens: 30000,
    timeout: 300000,
    description: 'Reasoning model for complex tasks',
    aliases: ['o1-2024-12-17']
  },
  'o1-mini': {
    modelName: 'o1-mini',
    friendlyName: 'o1 Mini',
    contextWindow: 128000,
    maxOutputTokens: 65536,
    supportsStreaming: false,
    supportsImages: true,
    supportsTemperature: false,
    supportsWebSearch: false,
    supportsThinking: true,
    maxThinkingTokens: 15000,
    timeout: 300000,
    description: 'Faster reasoning model for coding and math',
    aliases: ['o1-mini-2024-09-12']
  },
  'o3-mini': {
    modelName: 'o3-mini',
    friendlyName: 'o3 Mini',
    contextWindow: 200000,
    maxOutputTokens: 100000,
    supportsStreaming: false,
    supportsImages: true,
    supportsTemperature: false,
    supportsWebSearch: false,
    supportsThinking: true,
    maxThinkingTokens: 65536,
    timeout: 300000,
    description: 'Advanced reasoning model',
    aliases: ['o3-mini-2025-01-31']
  }
};

// Mock OpenAI SDK structure
export const MockOpenAI = vi.fn().mockImplementation(() => ({
  chat: {
    completions: {
      create: vi.fn()
    }
  }
}));

// Create OpenAI-specific mock provider
export function createMockOpenAIProvider(overrides = {}) {
  const baseProvider = createMockProvider({
    name: 'openai'
  });

  // Create OpenAI-specific provider with proper tracker access
  const openAIProvider = {
    ...baseProvider,

    getSupportedModels: vi.fn().mockImplementation(() => OPENAI_MODELS),

    getModelConfig: vi.fn().mockImplementation((modelName) => {
      // Check direct match
      if (OPENAI_MODELS[modelName]) {
        return OPENAI_MODELS[modelName];
      }

      // Check aliases
      for (const model of Object.values(OPENAI_MODELS)) {
        if (model.aliases && model.aliases.includes(modelName)) {
          return model;
        }
      }

      return null;
    }),

    invoke: vi.fn().mockImplementation(async (messages, options = {}) => {
      // Track the call
      baseProvider.tracker.recordCall('invoke', { messages, options });

      const modelConfig = OPENAI_MODELS[options.model] || OPENAI_MODELS['gpt-4'];

      // Simulate OpenAI-specific validations
      if (!options.config?.apiKeys?.openai) {
        throw new ProviderError('OpenAI API key is required', ErrorCodes.MISSING_API_KEY);
      }

      // Simulate thinking models behavior
      if (modelConfig.supportsThinking && options.reasoning_effort) {
        const thinkingTokens = options.reasoning_effort === 'high' ? 5000 : 2000;

        return new MockResponseBuilder()
          .withContent('After careful consideration, here is my response...')
          .withModel(options.model)
          .withProvider('openai')
          .withUsage({
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
            reasoning_tokens: thinkingTokens
          })
          .withRawResponse({
            id: 'chatcmpl-thinking',
            model: options.model,
            usage: {
              prompt_tokens: 100,
              completion_tokens: 50,
              total_tokens: 150,
              completion_tokens_details: {
                reasoning_tokens: thinkingTokens
              }
            }
          })
          .build();
      }

      // Simulate web search for supported models
      if (modelConfig.supportsWebSearch && options.use_websearch) {
        return new MockResponseBuilder()
          .withContent('Based on my web search, I found that...')
          .withModel(options.model)
          .withProvider('openai')
          .withRawResponse({
            id: 'chatcmpl-websearch',
            model: options.model,
            service_tier: 'default',
            usage: {
              prompt_tokens: 150,
              completion_tokens: 100,
              total_tokens: 250
            }
          })
          .build();
      }

      // Default response
      return new MockResponseBuilder()
        .withContent('Mock OpenAI response')
        .withModel(options.model || 'gpt-4')
        .withProvider('openai')
        .build();
    })
  };

  // Apply overrides and return
  return Object.assign(openAIProvider, overrides);
}

// Export default instance
export const mockOpenAIProvider = createMockOpenAIProvider();

// Mock response generators for OpenAI format
export function createMockOpenAIResponse(content = 'Test response', options = {}) {
  const response = {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: options.model || 'gpt-4',
    system_fingerprint: 'fp_mock123',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content,
        refusal: null
      },
      logprobs: null,
      finish_reason: options.finish_reason || 'stop'
    }],
    usage: {
      prompt_tokens: options.prompt_tokens || 10,
      completion_tokens: options.completion_tokens || 20,
      total_tokens: (options.prompt_tokens || 10) + (options.completion_tokens || 20)
    }
  };

  // Add reasoning tokens for thinking models
  if (options.reasoning_tokens) {
    response.usage.completion_tokens_details = {
      reasoning_tokens: options.reasoning_tokens
    };
  }

  return response;
}

// Mock streaming response generator
export function createMockOpenAIStreamResponse(chunks = ['Hello', ' world', '!'], options = {}) {
  return chunks.map((chunk, index) => ({
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: options.model || 'gpt-4',
    system_fingerprint: 'fp_mock123',
    choices: [{
      index: 0,
      delta: {
        content: chunk
      },
      logprobs: null,
      finish_reason: index === chunks.length - 1 ? 'stop' : null
    }]
  }));
}

// Error response generators
export function createMockOpenAIError(type = 'rate_limit', message = null) {
  const errors = {
    rate_limit: {
      error: {
        message: message || 'Rate limit reached for requests',
        type: 'rate_limit_error',
        param: null,
        code: 'rate_limit_exceeded'
      }
    },
    invalid_api_key: {
      error: {
        message: message || 'Incorrect API key provided',
        type: 'invalid_request_error',
        param: null,
        code: 'invalid_api_key'
      }
    },
    model_not_found: {
      error: {
        message: message || 'The model does not exist',
        type: 'invalid_request_error',
        param: 'model',
        code: 'model_not_found'
      }
    },
    context_length: {
      error: {
        message: message || 'This model\'s maximum context length exceeded',
        type: 'invalid_request_error',
        param: 'messages',
        code: 'context_length_exceeded'
      }
    }
  };

  return errors[type] || errors.rate_limit;
}

// Create a mock OpenAI client with configurable behavior
export function createMockOpenAIClient(behavior = {}) {
  const client = {
    chat: {
      completions: {
        create: vi.fn().mockImplementation(async (params) => {
          // Check for configured errors
          if (behavior.throwError) {
            throw new Error(JSON.stringify(createMockOpenAIError(behavior.errorType)));
          }

          // Check for streaming
          if (params.stream) {
            const chunks = behavior.chunks || ['Test', ' streaming', ' response'];
            return {
              async *[Symbol.asyncIterator] () {
                for (const chunk of createMockOpenAIStreamResponse(chunks, params)) {
                  yield chunk;
                }
              }
            };
          }

          // Regular response
          return createMockOpenAIResponse(
            behavior.content || 'Mock response',
            behavior.responseOptions || {}
          );
        })
      }
    }
  };

  return client;
}
