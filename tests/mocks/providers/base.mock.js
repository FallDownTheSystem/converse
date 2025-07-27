/**
 * Base mock provider for testing
 * Provides a consistent interface for mocking provider behavior
 * Implements the complete provider interface with configurable behavior
 */

import { vi } from 'vitest';
import { ProviderError, ErrorCodes, StopReasons } from '../../../src/providers/interface.js';

/**
 * Mock response builder for creating consistent provider responses
 */
export class MockResponseBuilder {
  constructor() {
    this.response = {
      content: 'Mock response',
      stop_reason: StopReasons.STOP,
      rawResponse: {},
      metadata: {
        model: 'mock-model',
        usage: {
          input_tokens: 10,
          output_tokens: 20,
          total_tokens: 30
        },
        response_time_ms: 100,
        finish_reason: 'stop',
        provider: 'mock'
      }
    };
  }

  withContent(content) {
    this.response.content = content;
    return this;
  }

  withStopReason(reason) {
    this.response.stop_reason = reason;
    this.response.metadata.finish_reason = reason;
    return this;
  }

  withModel(model) {
    this.response.metadata.model = model;
    return this;
  }

  withUsage(usage) {
    this.response.metadata.usage = {
      ...this.response.metadata.usage,
      ...usage
    };
    return this;
  }

  withResponseTime(ms) {
    this.response.metadata.response_time_ms = ms;
    return this;
  }

  withProvider(provider) {
    this.response.metadata.provider = provider;
    return this;
  }

  withRawResponse(raw) {
    this.response.rawResponse = raw;
    return this;
  }

  build() {
    return { ...this.response };
  }
}

/**
 * Mock provider behavior configuration
 */
export class MockProviderBehavior {
  constructor() {
    this.delays = [];
    this.errors = [];
    this.responses = [];
    this.callCount = 0;
  }

  /**
   * Add a delay before responding
   */
  addDelay(ms) {
    this.delays.push(ms);
    return this;
  }

  /**
   * Add an error to be thrown on a specific call
   */
  addError(error, onCall = null) {
    this.errors.push({ error, onCall });
    return this;
  }

  /**
   * Add a custom response for a specific call
   */
  addResponse(response, onCall = null) {
    this.responses.push({ response, onCall });
    return this;
  }

  /**
   * Get the behavior for the current call
   */
  async getBehaviorForCall(callNumber) {
    // Check for errors
    const error = this.errors.find(e => e.onCall === null || e.onCall === callNumber);
    if (error) {
      throw error.error;
    }

    // Apply delay
    const delay = this.delays[callNumber % this.delays.length];
    if (delay) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Get response
    const customResponse = this.responses.find(r => r.onCall === null || r.onCall === callNumber);
    return customResponse ? customResponse.response : null;
  }
}

/**
 * Call tracker for assertions
 */
export class CallTracker {
  constructor() {
    this.calls = [];
  }

  recordCall(method, args) {
    const call = {
      method,
      args,
      timestamp: Date.now()
    };
    this.calls.push(call);
    return call;
  }

  getCalls(method = null) {
    if (method) {
      return this.calls.filter(c => c.method === method);
    }
    return this.calls;
  }

  getLastCall(method = null) {
    const calls = this.getCalls(method);
    return calls[calls.length - 1] || null;
  }

  reset() {
    this.calls = [];
  }

  getCallCount(method = null) {
    return this.getCalls(method).length;
  }
}

/**
 * Create a comprehensive mock provider with full interface implementation
 */
export function createMockProvider(overrides = {}) {
  const tracker = new CallTracker();
  const behavior = new MockProviderBehavior();
  
  const mockProvider = {
    // Provider metadata
    name: overrides.name || 'mock-provider',
    
    // Call tracking
    tracker,
    behavior,
    
    // Provider interface methods
    invoke: vi.fn().mockImplementation(async (messages, options = {}) => {
      const call = tracker.recordCall('invoke', { messages, options });
      call.callNumber = tracker.getCallCount('invoke');
      
      // Apply configured behavior
      const customResponse = await behavior.getBehaviorForCall(call.callNumber - 1);
      if (customResponse) {
        return customResponse;
      }
      
      // Default response
      return new MockResponseBuilder()
        .withContent('Mock response')
        .withModel(options.model || 'mock-model')
        .withProvider(mockProvider.name)
        .build();
    }),
    
    validateConfig: vi.fn().mockImplementation((config) => {
      tracker.recordCall('validateConfig', { config });
      return config && config.apiKeys && config.apiKeys[mockProvider.name];
    }),
    
    isAvailable: vi.fn().mockImplementation((config) => {
      tracker.recordCall('isAvailable', { config });
      return mockProvider.validateConfig(config);
    }),
    
    getSupportedModels: vi.fn().mockImplementation(() => {
      tracker.recordCall('getSupportedModels', {});
      return {
        'mock-model-1': {
          modelName: 'mock-model-1',
          friendlyName: 'Mock Model 1',
          contextWindow: 8192,
          maxOutputTokens: 4096,
          supportsStreaming: true,
          supportsImages: true,
          supportsTemperature: true,
          timeout: 30000,
          description: 'A mock model for testing'
        },
        'mock-model-2': {
          modelName: 'mock-model-2',
          friendlyName: 'Mock Model 2',
          contextWindow: 16384,
          maxOutputTokens: 8192,
          supportsStreaming: false,
          supportsImages: false,
          supportsTemperature: true,
          timeout: 60000,
          description: 'Another mock model for testing'
        }
      };
    }),
    
    getModelConfig: vi.fn().mockImplementation((modelName) => {
      tracker.recordCall('getModelConfig', { modelName });
      const models = mockProvider.getSupportedModels();
      return models[modelName] || null;
    }),
    
    // Apply any overrides
    ...overrides
  };
  
  return mockProvider;
}

/**
 * Create a mock provider that throws errors
 */
export function createMockProviderWithError(error) {
  const errorToThrow = error instanceof Error ? error : new ProviderError(
    error.message || 'Mock error',
    error.code || ErrorCodes.API_ERROR,
    error.originalError
  );
  
  return createMockProvider({
    invoke: vi.fn().mockRejectedValue(errorToThrow)
  });
}

/**
 * Create a mock provider with streaming support
 */
export function createMockProviderWithStreaming(chunks = ['Hello', ' world', '!']) {
  return createMockProvider({
    invoke: vi.fn().mockImplementation(async (messages, options = {}) => {
      if (options.stream) {
        // Return an async generator for streaming
        return (async function* () {
          for (const [index, chunk] of chunks.entries()) {
            yield {
              content: chunk,
              delta: true,
              stop_reason: index === chunks.length - 1 ? StopReasons.STOP : null,
              metadata: {
                model: options.model || 'mock-model',
                provider: 'mock'
              }
            };
          }
        })();
      }
      
      // Non-streaming response
      return new MockResponseBuilder()
        .withContent(chunks.join(''))
        .build();
    })
  });
}

/**
 * Create a mock provider with rate limiting behavior
 */
export function createMockProviderWithRateLimit(requestsBeforeLimit = 3) {
  let requestCount = 0;
  
  return createMockProvider({
    invoke: vi.fn().mockImplementation(async () => {
      requestCount++;
      if (requestCount > requestsBeforeLimit) {
        throw new ProviderError(
          'Rate limit exceeded',
          ErrorCodes.RATE_LIMIT_EXCEEDED
        );
      }
      return new MockResponseBuilder().build();
    })
  });
}

/**
 * Create a mock provider with configurable latency
 */
export function createMockProviderWithLatency(minMs = 100, maxMs = 500) {
  return createMockProvider({
    invoke: vi.fn().mockImplementation(async (messages, options = {}) => {
      const latency = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
      await new Promise(resolve => setTimeout(resolve, latency));
      
      return new MockResponseBuilder()
        .withResponseTime(latency)
        .build();
    })
  });
}

/**
 * Reset all mock providers (useful in test cleanup)
 */
export function resetAllMocks(...providers) {
  providers.forEach(provider => {
    if (provider.tracker) {
      provider.tracker.reset();
    }
    Object.values(provider).forEach(value => {
      if (typeof value === 'function' && value.mockClear) {
        value.mockClear();
      }
    });
  });
}