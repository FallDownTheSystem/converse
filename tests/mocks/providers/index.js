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
  CallTracker
} from './base.mock.js';

// OpenAI mocks
export {
  createMockOpenAIProvider,
  mockOpenAIProvider,
  MockOpenAI,
  createMockOpenAIResponse,
  createMockOpenAIStreamResponse,
  createMockOpenAIError,
  createMockOpenAIClient
} from './openai.mock.js';

// Google mocks
export {
  createMockGoogleProvider,
  mockGoogleProvider,
  MockGoogleGenerativeAI,
  createMockGoogleResponse,
  createMockGoogleStreamResponse,
  createMockGoogleError,
  createMockGoogleClient
} from './google.mock.js';

// XAI mocks
export {
  createMockXAIProvider,
  mockXAIProvider,
  createMockXAIResponse,
  createMockXAIStreamResponse,
  createMockXAIError,
  createMockXAIClient
} from './xai.mock.js';

// Anthropic mocks
export {
  createMockAnthropicProvider,
  mockAnthropicProvider,
  MockAnthropic,
  createMockAnthropicResponse,
  createMockAnthropicStreamResponse,
  createMockAnthropicError,
  createMockAnthropicClient
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
  createMockOpenRouterClient
} from './openrouter.mock.js';

// Mistral mocks
export {
  createMockMistralProvider,
  mockMistralProvider,
  createMockMistralResponse,
  createMockMistralStreamResponse,
  createMockMistralError,
  createMockMistralClient
} from './mistral.mock.js';

// DeepSeek mocks
export {
  createMockDeepSeekProvider,
  mockDeepSeekProvider,
  createMockDeepSeekResponse,
  createMockDeepSeekStreamResponse,
  createMockDeepSeekError,
  createMockDeepSeekClient
} from './deepseek.mock.js';

/**
 * Create a mock provider registry for testing
 */
export function createMockProviderRegistry(providers = {}) {
  const defaultProviders = {
    openai: mockOpenAIProvider,
    google: mockGoogleProvider,
    xai: mockXAIProvider,
    anthropic: mockAnthropicProvider,
    openrouter: mockOpenRouterProvider,
    mistral: mockMistralProvider,
    deepseek: mockDeepSeekProvider
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
      resetAllMocks(...Object.values(this.providers));
    }
  };
}