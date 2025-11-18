/**
 * Mock DeepSeek provider for testing
 * Implements DeepSeek-specific behavior and response formats
 */

import { vi } from 'vitest';
import { createMockProvider, MockResponseBuilder } from './base.mock.js';
import { ProviderError, ErrorCodes } from '../../../src/providers/interface.js';

// DeepSeek model configurations matching the real provider
const DEEPSEEK_MODELS = {
  'deepseek-reasoner': {
    modelName: 'deepseek-reasoner',
    friendlyName: 'DeepSeek Reasoner',
    contextWindow: 65536,
    maxOutputTokens: 8192,
    supportsStreaming: false,
    supportsImages: false,
    supportsTemperature: false,
    supportsWebSearch: false,
    supportsThinking: true,
    maxThinkingTokens: 32768,
    timeout: 300000,
    description: 'DeepThink reasoning model based on DeepSeek-V3',
    aliases: [],
  },
  'deepseek-chat': {
    modelName: 'deepseek-chat',
    friendlyName: 'DeepSeek Chat',
    contextWindow: 65536,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsImages: false,
    supportsTemperature: true,
    supportsWebSearch: false,
    supportsThinking: false,
    timeout: 60000,
    description: 'DeepSeek-V3 for general chat',
    aliases: [],
  },
};

// Create DeepSeek-specific mock provider
export function createMockDeepSeekProvider(overrides = {}) {
  return createMockProvider({
    name: 'deepseek',

    getSupportedModels: vi.fn().mockImplementation(() => DEEPSEEK_MODELS),

    getModelConfig: vi.fn().mockImplementation((modelName) => {
      return DEEPSEEK_MODELS[modelName] || null;
    }),

    invoke: vi.fn().mockImplementation(async (messages, options = {}) => {
      const modelConfig =
        DEEPSEEK_MODELS[options.model] || DEEPSEEK_MODELS['deepseek-chat'];

      // Simulate DeepSeek-specific validations
      if (!options.config?.apiKeys?.deepseek) {
        throw new ProviderError(
          'DeepSeek API key is required',
          ErrorCodes.MISSING_API_KEY,
        );
      }

      // Simulate reasoning model behavior
      if (modelConfig.supportsThinking) {
        const reasoningTokens =
          options.reasoning_effort === 'high'
            ? 15000
            : options.reasoning_effort === 'low'
              ? 5000
              : 10000;

        return new MockResponseBuilder()
          .withContent('After deep analysis and reasoning, I conclude that...')
          .withModel(options.model)
          .withProvider('deepseek')
          .withUsage({
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
            reasoning_tokens: reasoningTokens,
          })
          .withRawResponse({
            id: 'deepseek-reasoning',
            object: 'chat.completion',
            created: Date.now(),
            model: options.model,
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content:
                    'After deep analysis and reasoning, I conclude that...',
                  reasoning_content:
                    'Let me think through this step by step...',
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 50,
              total_tokens: 150,
              prompt_cache_hit_tokens: 0,
              prompt_cache_miss_tokens: 100,
              reasoning_tokens: reasoningTokens,
            },
          })
          .build();
      }

      // Default response
      return new MockResponseBuilder()
        .withContent('Mock DeepSeek response')
        .withModel(options.model || 'deepseek-chat')
        .withProvider('deepseek')
        .build();
    }),

    ...overrides,
  });
}

// Export default instance
export const mockDeepSeekProvider = createMockDeepSeekProvider();

// Mock response generators for DeepSeek format
export function createMockDeepSeekResponse(
  content = 'Test response',
  options = {},
) {
  const response = {
    id: `deepseek-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: options.model || 'deepseek-chat',
    system_fingerprint: 'fp_deepseek',
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
      prompt_cache_hit_tokens: 0,
      prompt_cache_miss_tokens: options.prompt_tokens || 10,
    },
  };

  // Add reasoning content for reasoning models
  if (options.reasoning_content) {
    response.choices[0].message.reasoning_content = options.reasoning_content;
    response.usage.reasoning_tokens = options.reasoning_tokens || 5000;
  }

  return response;
}

// Mock streaming response generator
export function createMockDeepSeekStreamResponse(
  chunks = ['Hello', ' world', '!'],
  options = {},
) {
  const streamId = `deepseek-${Date.now()}`;

  return chunks.map((chunk, index) => ({
    id: streamId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: options.model || 'deepseek-chat',
    system_fingerprint: 'fp_deepseek',
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
export function createMockDeepSeekError(
  type = 'invalid_api_key',
  message = null,
) {
  const errors = {
    invalid_api_key: {
      error: {
        message: message || 'Invalid Authentication',
        type: 'authentication_error',
        code: 'invalid_api_key',
      },
    },
    rate_limit: {
      error: {
        message: message || 'Rate limit reached',
        type: 'rate_limit_error',
        code: 'rate_limit_exceeded',
      },
    },
    model_not_found: {
      error: {
        message: message || 'The model does not exist',
        type: 'invalid_request_error',
        code: 'model_not_found',
      },
    },
    balance_insufficient: {
      error: {
        message: message || 'Balance insufficient',
        type: 'insufficient_balance',
        code: 'balance_insufficient',
      },
    },
  };

  return errors[type] || errors.invalid_api_key;
}

// Create a mock DeepSeek client with configurable behavior
export function createMockDeepSeekClient(behavior = {}) {
  return {
    post: vi.fn().mockImplementation(async (endpoint, options) => {
      if (behavior.throwError) {
        const error = new Error('DeepSeek API error');
        error.response = {
          status: behavior.errorCode || 400,
          data: createMockDeepSeekError(behavior.errorType),
        };
        throw error;
      }

      if (options.body.stream) {
        const chunks = behavior.chunks || ['Test', ' streaming', ' response'];
        const streamData = createMockDeepSeekStreamResponse(chunks, {
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

      return {
        data: createMockDeepSeekResponse(
          behavior.content || 'Mock response',
          behavior.responseOptions || {},
        ),
      };
    }),
  };
}
