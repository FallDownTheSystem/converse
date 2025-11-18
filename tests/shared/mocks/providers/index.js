/**
 * Comprehensive mock providers for testing
 * Consolidates all provider mocking utilities
 */

import { vi } from 'vitest';

/**
 * Base mock provider factory with common provider interface
 */
export function createMockProvider(overrides = {}) {
  return {
    name: overrides.name || 'mock-provider',
    invoke: vi.fn().mockResolvedValue({
      content: 'Mock response',
      usage: { input_tokens: 10, output_tokens: 20 },
    }),
    validateConfig: vi.fn().mockReturnValue(true),
    isAvailable: vi.fn().mockReturnValue(true),
    getSupportedModels: vi
      .fn()
      .mockReturnValue(['mock-model-1', 'mock-model-2']),
    getModelConfig: vi.fn().mockReturnValue({
      maxTokens: 4096,
      supportsFunctions: true,
      supportsImages: true,
      supportsStreaming: true,
      supportsWebSearch: false,
    }),
    ...overrides,
  };
}

/**
 * Create a mock provider that returns an error
 */
export function createMockProviderWithError(error) {
  return createMockProvider({
    invoke: vi.fn().mockRejectedValue(error),
  });
}

/**
 * Create a mock provider with streaming support
 */
export function createMockProviderWithStreaming() {
  return createMockProvider({
    invoke: vi.fn().mockImplementation(async function* () {
      yield { content: 'Chunk 1', delta: true };
      yield { content: 'Chunk 2', delta: true };
      yield { content: 'Chunk 3', delta: true };
    }),
  });
}

/**
 * Create a mock OpenAI provider with realistic responses
 */
export function createMockOpenAIProvider(overrides = {}) {
  return createMockProvider({
    name: 'openai',
    getSupportedModels: vi
      .fn()
      .mockReturnValue([
        'gpt-4',
        'gpt-4-turbo',
        'gpt-3.5-turbo',
        'o1-preview',
        'o1-mini',
      ]),
    getModelConfig: vi.fn().mockImplementation((model) => {
      const configs = {
        'gpt-4': {
          maxTokens: 8192,
          supportsFunctions: true,
          supportsImages: true,
          supportsWebSearch: true,
        },
        'gpt-4-turbo': {
          maxTokens: 128000,
          supportsFunctions: true,
          supportsImages: true,
          supportsWebSearch: true,
        },
        'gpt-3.5-turbo': {
          maxTokens: 16384,
          supportsFunctions: true,
          supportsImages: false,
          supportsWebSearch: false,
        },
        'o1-preview': {
          maxTokens: 128000,
          supportsFunctions: false,
          supportsImages: true,
          supportsWebSearch: false,
        },
        'o1-mini': {
          maxTokens: 65536,
          supportsFunctions: false,
          supportsImages: true,
          supportsWebSearch: false,
        },
      };
      return configs[model] || configs['gpt-4'];
    }),
    ...overrides,
  });
}

/**
 * Create a mock Google provider
 */
export function createMockGoogleProvider(overrides = {}) {
  return createMockProvider({
    name: 'google',
    getSupportedModels: vi
      .fn()
      .mockReturnValue([
        'gemini-2.0-flash',
        'gemini-2.5-pro',
        'gemini-2.5-flash',
      ]),
    getModelConfig: vi.fn().mockImplementation((model) => {
      const configs = {
        'gemini-2.0-flash': {
          maxTokens: 8192,
          supportsFunctions: true,
          supportsImages: true,
          supportsWebSearch: false,
        },
        'gemini-2.5-pro': {
          maxTokens: 128000,
          supportsFunctions: true,
          supportsImages: true,
          supportsWebSearch: false,
        },
        'gemini-2.5-flash': {
          maxTokens: 8192,
          supportsFunctions: true,
          supportsImages: true,
          supportsWebSearch: false,
        },
      };
      return configs[model] || configs['gemini-2.5-flash'];
    }),
    ...overrides,
  });
}

/**
 * Create a mock XAI provider
 */
export function createMockXAIProvider(overrides = {}) {
  return createMockProvider({
    name: 'xai',
    getSupportedModels: vi
      .fn()
      .mockReturnValue(['grok-2', 'grok-2-mini', 'grok-3', 'grok-3-mini']),
    getModelConfig: vi.fn().mockImplementation((model) => {
      const configs = {
        'grok-2': {
          maxTokens: 131072,
          supportsFunctions: false,
          supportsImages: true,
          supportsWebSearch: true,
        },
        'grok-2-mini': {
          maxTokens: 131072,
          supportsFunctions: false,
          supportsImages: true,
          supportsWebSearch: true,
        },
        'grok-3': {
          maxTokens: 131072,
          supportsFunctions: false,
          supportsImages: true,
          supportsWebSearch: true,
        },
        'grok-3-mini': {
          maxTokens: 131072,
          supportsFunctions: false,
          supportsImages: true,
          supportsWebSearch: true,
        },
      };
      return configs[model] || configs['grok-2'];
    }),
    ...overrides,
  });
}

/**
 * Create a mock Anthropic provider
 */
export function createMockAnthropicProvider(overrides = {}) {
  return createMockProvider({
    name: 'anthropic',
    getSupportedModels: vi
      .fn()
      .mockReturnValue([
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229',
      ]),
    getModelConfig: vi.fn().mockImplementation((model) => {
      const configs = {
        'claude-3-5-sonnet-20241022': {
          maxTokens: 8192,
          supportsFunctions: true,
          supportsImages: true,
          supportsWebSearch: false,
        },
        'claude-3-5-haiku-20241022': {
          maxTokens: 8192,
          supportsFunctions: true,
          supportsImages: true,
          supportsWebSearch: false,
        },
        'claude-3-opus-20240229': {
          maxTokens: 4096,
          supportsFunctions: true,
          supportsImages: true,
          supportsWebSearch: false,
        },
      };
      return configs[model] || configs['claude-3-5-sonnet-20241022'];
    }),
    ...overrides,
  });
}

/**
 * Create mock response objects
 */
export function createMockResponse(overrides = {}) {
  return {
    content: overrides.content || 'This is a mock response',
    usage: {
      input_tokens: overrides.inputTokens || 10,
      output_tokens: overrides.outputTokens || 20,
      total_tokens:
        (overrides.inputTokens || 10) + (overrides.outputTokens || 20),
    },
    model: overrides.model || 'mock-model',
    finish_reason: overrides.finishReason || 'stop',
    ...overrides,
  };
}

/**
 * Create mock streaming response chunks
 */
export function createMockStreamingChunks(text, chunkSize = 10) {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push({
      content: text.slice(i, i + chunkSize),
      delta: true,
    });
  }
  return chunks;
}

/**
 * Create a collection of mock providers for testing
 */
export function createMockProviderRegistry(providers = {}) {
  const defaultProviders = {
    openai: createMockOpenAIProvider(),
    google: createMockGoogleProvider(),
    xai: createMockXAIProvider(),
    anthropic: createMockAnthropicProvider(),
    ...providers,
  };

  return {
    providers: defaultProviders,
    get: (name) => defaultProviders[name],
    list: () => Object.keys(defaultProviders),
    register: (name, provider) => {
      defaultProviders[name] = provider;
    },
  };
}
