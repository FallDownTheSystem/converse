/**
 * Mock provider exports
 * Central export point for all mock provider implementations
 */

// Base mock utilities
export {
  createMockProvider,
  createMockProviderWithError,
  createMockProviderWithStreaming,
  createMockProviderWithRateLimit,
  createMockProviderWithLatency,
  resetAllMocks,
  MockResponseBuilder,
  MockProviderBehavior,
  CallTracker,
} from './base.mock.js';

// Import provider creators separately to use in registry
import { createMockOpenAIProvider as _createMockOpenAIProvider } from './openai.mock.js';
import { createMockGoogleProvider as _createMockGoogleProvider } from './google.mock.js';
import { createMockXAIProvider as _createMockXAIProvider } from './xai.mock.js';
import { createMockAnthropicProvider as _createMockAnthropicProvider } from './anthropic.mock.js';
import { createMockOpenRouterProvider as _createMockOpenRouterProvider } from './openrouter.mock.js';
import { createMockMistralProvider as _createMockMistralProvider } from './mistral.mock.js';
import { createMockDeepSeekProvider as _createMockDeepSeekProvider } from './deepseek.mock.js';
import { resetAllMocks as _resetAllMocks } from './base.mock.js';

// OpenAI mocks
export {
  createMockOpenAIProvider,
  mockOpenAIProvider,
  MockOpenAI,
  createMockOpenAIResponse,
  createMockOpenAIStreamResponse,
  createMockOpenAIError,
  createMockOpenAIClient,
} from './openai.mock.js';

// Google mocks
export {
  createMockGoogleProvider,
  mockGoogleProvider,
  MockGoogleGenerativeAI,
  createMockGoogleResponse,
  createMockGoogleStreamResponse,
  createMockGoogleError,
  createMockGoogleClient,
} from './google.mock.js';

// XAI mocks
export {
  createMockXAIProvider,
  mockXAIProvider,
  createMockXAIResponse,
  createMockXAIStreamResponse,
  createMockXAIError,
  createMockXAIClient,
} from './xai.mock.js';

// Anthropic mocks
export {
  createMockAnthropicProvider,
  mockAnthropicProvider,
  MockAnthropic,
  createMockAnthropicResponse,
  createMockAnthropicStreamResponse,
  createMockAnthropicError,
  createMockAnthropicClient,
} from './anthropic.mock.js';

// OpenRouter mocks
export {
  createMockOpenRouterProvider,
  mockOpenRouterProvider,
  MockOpenRouterEndpointsClient,
  mockEndpointsResponse,
  createMockOpenRouterResponse,
  createMockOpenRouterStreamResponse,
  createMockOpenRouterError,
  createMockOpenRouterClient,
} from './openrouter.mock.js';

// Mistral mocks
export {
  createMockMistralProvider,
  mockMistralProvider,
  createMockMistralResponse,
  createMockMistralStreamResponse,
  createMockMistralError,
  createMockMistralClient,
} from './mistral.mock.js';

// DeepSeek mocks
export {
  createMockDeepSeekProvider,
  mockDeepSeekProvider,
  createMockDeepSeekResponse,
  createMockDeepSeekStreamResponse,
  createMockDeepSeekError,
  createMockDeepSeekClient,
} from './deepseek.mock.js';

/**
 * Create a mock provider registry for testing
 */
export function createMockProviderRegistry(providers = {}) {
  // Create providers on demand to avoid initialization issues
  const defaultProviders = {
    openai: _createMockOpenAIProvider(),
    google: _createMockGoogleProvider(),
    xai: _createMockXAIProvider(),
    anthropic: _createMockAnthropicProvider(),
    openrouter: _createMockOpenRouterProvider(),
    mistral: _createMockMistralProvider(),
    deepseek: _createMockDeepSeekProvider(),
  };

  return {
    providers: { ...defaultProviders, ...providers },

    get(name) {
      return this.providers[name] || null;
    },

    register(name, provider) {
      this.providers[name] = provider;
    },

    getAvailable(config) {
      return Object.entries(this.providers)
        .filter(([_, provider]) => provider.isAvailable(config))
        .reduce((acc, [name, provider]) => {
          acc[name] = provider;
          return acc;
        }, {});
    },

    reset() {
      _resetAllMocks(...Object.values(this.providers));
    },
  };
}
