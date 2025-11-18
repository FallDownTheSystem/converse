/**
 * Mock XAI provider for testing
 * Implements XAI Grok-specific behavior and response formats
 */

import { vi } from 'vitest';
import { createMockProvider, MockResponseBuilder } from './base.mock.js';
import { ProviderError, ErrorCodes } from '../../../src/providers/interface.js';

// XAI model configurations matching the real provider
const XAI_MODELS = {
  'grok-4': {
    modelName: 'grok-4',
    friendlyName: 'Grok 4',
    contextWindow: 131072,
    maxOutputTokens: 16384,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: true,
    supportsThinking: false,
    timeout: 60000,
    description: 'Frontier multimodal language model',
    aliases: ['grok-4-0513', 'grok-4-0709'],
  },
  'grok-3': {
    modelName: 'grok-3',
    friendlyName: 'Grok 3',
    contextWindow: 131072,
    maxOutputTokens: 16384,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: true,
    supportsThinking: false,
    timeout: 60000,
    description: 'Top multimodal language model',
    aliases: ['grok-3-0513', 'grok-3-0709'],
  },
  'grok-2-1212': {
    modelName: 'grok-2-1212',
    friendlyName: 'Grok 2 (December 2024)',
    contextWindow: 131072,
    maxOutputTokens: 16384,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: true,
    supportsThinking: false,
    timeout: 60000,
    description: 'Advanced reasoning with real-time knowledge',
    aliases: [],
  },
  'grok-2-vision-1212': {
    modelName: 'grok-2-vision-1212',
    friendlyName: 'Grok 2 Vision',
    contextWindow: 32768,
    maxOutputTokens: 16384,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: true,
    supportsThinking: false,
    timeout: 60000,
    description: 'Grok 2 with enhanced vision capabilities',
    aliases: [],
  },
  'grok-beta': {
    modelName: 'grok-beta',
    friendlyName: 'Grok Beta',
    contextWindow: 131072,
    maxOutputTokens: 16384,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: true,
    supportsThinking: false,
    timeout: 60000,
    description: 'Latest Grok model in development',
    aliases: [],
  },
};

// Create XAI-specific mock provider
export function createMockXAIProvider(overrides = {}) {
  return createMockProvider({
    name: 'xai',

    getSupportedModels: vi.fn().mockImplementation(() => XAI_MODELS),

    getModelConfig: vi.fn().mockImplementation((modelName) => {
      // Check direct match
      if (XAI_MODELS[modelName]) {
        return XAI_MODELS[modelName];
      }

      // Check aliases
      for (const model of Object.values(XAI_MODELS)) {
        if (model.aliases && model.aliases.includes(modelName)) {
          return model;
        }
      }

      return null;
    }),

    invoke: vi.fn().mockImplementation(async (messages, options = {}) => {
      const modelConfig = XAI_MODELS[options.model] || XAI_MODELS['grok-beta'];

      // Simulate XAI-specific validations
      if (!options.config?.apiKeys?.xai) {
        throw new ProviderError(
          'XAI API key is required',
          ErrorCodes.MISSING_API_KEY,
        );
      }

      // Simulate web search behavior
      if (modelConfig.supportsWebSearch && options.use_websearch) {
        return new MockResponseBuilder()
          .withContent(
            'Based on current information from the web, I can tell you that...',
          )
          .withModel(options.model)
          .withProvider('xai')
          .withUsage({
            input_tokens: 200,
            output_tokens: 150,
            total_tokens: 350,
          })
          .withRawResponse({
            id: 'xai-mock-search',
            object: 'chat.completion',
            created: Date.now(),
            model: options.model,
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content:
                    'Based on current information from the web, I can tell you that...',
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 200,
              completion_tokens: 150,
              total_tokens: 350,
            },
            extra: {
              live_search: true,
              search_results: [
                { url: 'https://example.com', title: 'Example Result' },
              ],
            },
          })
          .build();
      }

      // Default response
      return new MockResponseBuilder()
        .withContent('Mock XAI response')
        .withModel(options.model || 'grok-beta')
        .withProvider('xai')
        .build();
    }),

    ...overrides,
  });
}

// Export default instance
export const mockXAIProvider = createMockXAIProvider();

// Mock response generators for XAI format
export function createMockXAIResponse(content = 'Test response', options = {}) {
  const response = {
    id: `xai-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: options.model || 'grok-beta',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
        },
        finish_reason: options.finish_reason || 'stop',
      },
    ],
    usage: {
      prompt_tokens: options.prompt_tokens || 10,
      completion_tokens: options.completion_tokens || 20,
      total_tokens:
        (options.prompt_tokens || 10) + (options.completion_tokens || 20),
    },
  };

  // Add web search results if enabled
  if (options.with_search) {
    response.extra = {
      live_search: true,
      search_results: options.search_results || [],
    };
  }

  return response;
}

// Mock streaming response generator
export function createMockXAIStreamResponse(
  chunks = ['Hello', ' world', '!'],
  options = {},
) {
  return chunks.map((chunk, index) => ({
    id: `xai-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: options.model || 'grok-beta',
    choices: [
      {
        index: 0,
        delta: {
          content: chunk,
        },
        finish_reason: index === chunks.length - 1 ? 'stop' : null,
      },
    ],
  }));
}

// Error response generators
export function createMockXAIError(type = 'invalid_api_key', message = null) {
  const errors = {
    invalid_api_key: {
      error: {
        message: message || 'Invalid API key',
        type: 'invalid_request_error',
        code: 'invalid_api_key',
      },
    },
    rate_limit: {
      error: {
        message: message || 'Rate limit exceeded',
        type: 'rate_limit_error',
        code: 'rate_limit_exceeded',
      },
    },
    model_not_found: {
      error: {
        message: message || 'Model not found',
        type: 'invalid_request_error',
        code: 'model_not_found',
      },
    },
  };

  return errors[type] || errors.invalid_api_key;
}

// Create a mock XAI client with configurable behavior
export function createMockXAIClient(behavior = {}) {
  return {
    post: vi.fn().mockImplementation(async (endpoint, options) => {
      if (behavior.throwError) {
        const error = new Error('Request failed');
        error.response = {
          data: createMockXAIError(behavior.errorType),
        };
        throw error;
      }

      if (options.body.stream) {
        // Return a mock readable stream
        const chunks = behavior.chunks || ['Test', ' streaming', ' response'];
        const streamData = createMockXAIStreamResponse(chunks, {
          model: options.body.model,
        });

        return {
          body: {
            async *[Symbol.asyncIterator]() {
              for (const chunk of streamData) {
                yield `data: ${JSON.stringify(chunk)}\n\n`;
              }
              yield 'data: [DONE]\n\n';
            },
          },
        };
      }

      // Regular response
      return {
        data: createMockXAIResponse(
          behavior.content || 'Mock response',
          behavior.responseOptions || {},
        ),
      };
    }),
  };
}
