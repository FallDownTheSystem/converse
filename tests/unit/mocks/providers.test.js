/**
 * Tests for mock provider implementations
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createMockProvider,
  createMockProviderWithError,
  createMockProviderWithStreaming,
  createMockProviderWithRateLimit,
  createMockProviderWithLatency,
  MockResponseBuilder,
  CallTracker,
  MockProviderBehavior,
  resetAllMocks,
  createMockOpenAIProvider,
  createMockGoogleProvider,
  createMockXAIProvider,
  createMockAnthropicProvider,
  createMockOpenRouterProvider,
  createMockMistralProvider,
  createMockDeepSeekProvider,
  createMockProviderRegistry
} from '../../mocks/providers/index.js';
import { ProviderError, ErrorCodes, StopReasons } from '../../../src/providers/interface.js';

describe('Mock Provider Base', () => {
  describe('createMockProvider', () => {
    it('should create a provider with default behavior', async () => {
      const provider = createMockProvider();

      expect(provider.name).toBe('mock-provider');
      expect(provider.invoke).toBeDefined();
      expect(provider.validateConfig).toBeDefined();
      expect(provider.isAvailable).toBeDefined();
      expect(provider.getSupportedModels).toBeDefined();
      expect(provider.getModelConfig).toBeDefined();
    });

    it('should track method calls', async () => {
      const provider = createMockProvider();
      const messages = [{ role: 'user', content: 'Hello' }];
      const options = { model: 'test-model' };

      await provider.invoke(messages, options);

      expect(provider.tracker.getCallCount('invoke')).toBe(1);
      expect(provider.tracker.getLastCall('invoke').args).toEqual({
        messages,
        options
      });
    });

    it('should allow behavior configuration', async () => {
      const provider = createMockProvider();
      const customResponse = new MockResponseBuilder()
        .withContent('Custom response')
        .build();

      provider.behavior.addResponse(customResponse, 0);

      const response = await provider.invoke([]);
      expect(response.content).toBe('Custom response');
    });
  });

  describe('MockResponseBuilder', () => {
    it('should build a complete response', () => {
      const response = new MockResponseBuilder()
        .withContent('Test content')
        .withModel('test-model')
        .withUsage({ input_tokens: 50, output_tokens: 100 })
        .withStopReason(StopReasons.LENGTH)
        .withProvider('test-provider')
        .withResponseTime(250)
        .build();

      expect(response).toEqual({
        content: 'Test content',
        stop_reason: StopReasons.LENGTH,
        rawResponse: {},
        metadata: {
          model: 'test-model',
          usage: {
            input_tokens: 50,
            output_tokens: 100,
            total_tokens: 30
          },
          response_time_ms: 250,
          finish_reason: StopReasons.LENGTH,
          provider: 'test-provider'
        }
      });
    });
  });

  describe('CallTracker', () => {
    let tracker;

    beforeEach(() => {
      tracker = new CallTracker();
    });

    it('should track multiple calls', () => {
      tracker.recordCall('method1', { arg: 1 });
      tracker.recordCall('method2', { arg: 2 });
      tracker.recordCall('method1', { arg: 3 });

      expect(tracker.getCallCount()).toBe(3);
      expect(tracker.getCallCount('method1')).toBe(2);
      expect(tracker.getCallCount('method2')).toBe(1);
    });

    it('should get last call', () => {
      tracker.recordCall('test', { arg: 1 });
      tracker.recordCall('test', { arg: 2 });

      const lastCall = tracker.getLastCall('test');
      expect(lastCall.args).toEqual({ arg: 2 });
    });

    it('should reset tracking', () => {
      tracker.recordCall('test', {});
      expect(tracker.getCallCount()).toBe(1);

      tracker.reset();
      expect(tracker.getCallCount()).toBe(0);
    });
  });

  describe('MockProviderBehavior', () => {
    let behavior;

    beforeEach(() => {
      behavior = new MockProviderBehavior();
    });

    it('should handle delays', async () => {
      behavior.addDelay(100);

      const start = Date.now();
      await behavior.getBehaviorForCall(0);
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(90); // Allow some variance
    });

    it('should throw errors on specific calls', async () => {
      const error = new Error('Test error');
      behavior.addError(error, 1); // Throw on second call (0-indexed)

      // First call should succeed
      await expect(behavior.getBehaviorForCall(0)).resolves.toBe(null);

      // Second call should throw
      await expect(behavior.getBehaviorForCall(1)).rejects.toThrow('Test error');
    });

    it('should return custom responses', async () => {
      const response1 = { content: 'Response 1' };
      const response2 = { content: 'Response 2' };

      behavior.addResponse(response1, 0);
      behavior.addResponse(response2, 2);

      expect(await behavior.getBehaviorForCall(0)).toBe(response1);
      expect(await behavior.getBehaviorForCall(1)).toBe(null);
      expect(await behavior.getBehaviorForCall(2)).toBe(response2);
    });
  });
});

describe('Mock Provider Variants', () => {
  describe('createMockProviderWithError', () => {
    it('should create provider that throws ProviderError', async () => {
      const provider = createMockProviderWithError({
        message: 'API Error',
        code: ErrorCodes.API_ERROR
      });

      await expect(provider.invoke([])).rejects.toThrow(ProviderError);
      await expect(provider.invoke([])).rejects.toMatchObject({
        message: 'API Error',
        code: ErrorCodes.API_ERROR
      });
    });
  });

  describe('createMockProviderWithStreaming', () => {
    it('should handle streaming responses', async () => {
      const chunks = ['Hello', ' ', 'world'];
      const provider = createMockProviderWithStreaming(chunks);

      const generator = await provider.invoke([], { stream: true });
      const collected = [];

      for await (const chunk of generator) {
        collected.push(chunk.content);
      }

      expect(collected).toEqual(chunks);
    });

    it('should handle non-streaming requests', async () => {
      const chunks = ['Hello', ' ', 'world'];
      const provider = createMockProviderWithStreaming(chunks);

      const response = await provider.invoke([], { stream: false });
      expect(response.content).toBe('Hello world');
    });
  });

  describe('createMockProviderWithRateLimit', () => {
    it('should throw after limit is reached', async () => {
      const provider = createMockProviderWithRateLimit(2);

      // First two calls succeed
      await expect(provider.invoke([])).resolves.toBeDefined();
      await expect(provider.invoke([])).resolves.toBeDefined();

      // Third call fails
      await expect(provider.invoke([])).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('createMockProviderWithLatency', () => {
    it('should add random latency within range', async () => {
      const provider = createMockProviderWithLatency(50, 150);

      const start = Date.now();
      const response = await provider.invoke([]);
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(45); // Allow variance
      expect(duration).toBeLessThanOrEqual(160);
      expect(response.metadata.response_time_ms).toBeGreaterThanOrEqual(50);
      expect(response.metadata.response_time_ms).toBeLessThanOrEqual(150);
    });
  });
});

describe('Provider-Specific Mocks', () => {
  describe('OpenAI Mock', () => {
    it('should handle thinking models', async () => {
      const provider = createMockOpenAIProvider();
      const response = await provider.invoke([], {
        model: 'o1',
        reasoning_effort: 'high',
        config: { apiKeys: { openai: 'test-key' } }
      });

      expect(response.metadata.usage.reasoning_tokens).toBe(5000);
      expect(response.content).toContain('careful consideration');
    });

    it('should handle web search', async () => {
      const provider = createMockOpenAIProvider();
      const response = await provider.invoke([], {
        model: 'gpt-4o',
        use_websearch: true,
        config: { apiKeys: { openai: 'test-key' } }
      });

      expect(response.content).toContain('web search');
    });

    it('should validate API key', async () => {
      const provider = createMockOpenAIProvider();
      await expect(provider.invoke([], {})).rejects.toThrow('OpenAI API key is required');
    });
  });

  describe('Google Mock', () => {
    it('should handle thinking models', async () => {
      const provider = createMockGoogleProvider();
      const response = await provider.invoke([], {
        model: 'gemini-2.0-flash-thinking-exp',
        config: { apiKeys: { google: 'test-key' } }
      });

      expect(response.content).toContain('think step by step');
    });
  });

  describe('XAI Mock', () => {
    it('should handle web search', async () => {
      const provider = createMockXAIProvider();
      const response = await provider.invoke([], {
        model: 'grok-4',
        use_websearch: true,
        config: { apiKeys: { xai: 'test-key' } }
      });

      expect(response.content).toContain('current information from the web');
      expect(response.rawResponse.extra.live_search).toBe(true);
    });
  });

  describe('Anthropic Mock', () => {
    it('should validate image support', async () => {
      const provider = createMockAnthropicProvider();
      const messages = [{
        role: 'user',
        content: [
          { type: 'text', text: 'What is this?' },
          { type: 'image', source: { media_type: 'image/png', data: 'base64...' } }
        ]
      }];

      await expect(provider.invoke(messages, {
        model: 'claude-3-5-haiku-20241022',
        config: { apiKeys: { anthropic: 'test-key' } }
      })).rejects.toThrow('does not support images');
    });
  });

  describe('OpenRouter Mock', () => {
    it('should handle dynamic models', async () => {
      const provider = createMockOpenRouterProvider();
      const response = await provider.invoke([], {
        model: 'custom/new-model',
        config: { apiKeys: { openrouter: 'test-key' } }
      });

      expect(response.content).toContain('dynamic model: custom/new-model');
    });

    it('should refresh model list', async () => {
      const provider = createMockOpenRouterProvider();
      const models = await provider.refreshModelList();

      expect(models).toHaveProperty('openai/gpt-4');
      expect(models).toHaveProperty('custom/new-model');
    });
  });

  describe('Mistral Mock', () => {
    it('should handle code generation', async () => {
      const provider = createMockMistralProvider();
      const response = await provider.invoke([], {
        model: 'codestral-latest',
        config: { apiKeys: { mistral: 'test-key' } }
      });

      expect(response.content).toContain('```python');
      expect(response.content).toContain('Generated by Codestral');
    });
  });

  describe('DeepSeek Mock', () => {
    it('should handle reasoning models', async () => {
      const provider = createMockDeepSeekProvider();
      const response = await provider.invoke([], {
        model: 'deepseek-reasoner',
        reasoning_effort: 'high',
        config: { apiKeys: { deepseek: 'test-key' } }
      });

      expect(response.metadata.usage.reasoning_tokens).toBe(15000);
      expect(response.content).toContain('deep analysis and reasoning');
    });
  });
});

describe('Mock Provider Registry', () => {
  let registry;

  beforeEach(() => {
    registry = createMockProviderRegistry();
  });

  afterEach(() => {
    registry.reset();
  });

  it('should include all default providers', () => {
    expect(registry.get('openai')).toBeDefined();
    expect(registry.get('google')).toBeDefined();
    expect(registry.get('xai')).toBeDefined();
    expect(registry.get('anthropic')).toBeDefined();
    expect(registry.get('openrouter')).toBeDefined();
    expect(registry.get('mistral')).toBeDefined();
    expect(registry.get('deepseek')).toBeDefined();
  });

  it('should register custom providers', () => {
    const customProvider = createMockProvider({ name: 'custom' });
    registry.register('custom', customProvider);

    expect(registry.get('custom')).toBe(customProvider);
  });

  it('should get available providers', () => {
    const config = {
      apiKeys: {
        openai: 'key1',
        google: 'key2'
      }
    };

    const available = registry.getAvailable(config);
    expect(Object.keys(available)).toContain('openai');
    expect(Object.keys(available)).toContain('google');
  });

  it('should reset all providers', () => {
    const openai = registry.get('openai');
    const google = registry.get('google');

    // Make some calls
    openai.invoke([]);
    google.invoke([]);

    expect(openai.tracker.getCallCount()).toBe(1);
    expect(google.tracker.getCallCount()).toBe(1);

    // Reset
    registry.reset();

    expect(openai.tracker.getCallCount()).toBe(0);
    expect(google.tracker.getCallCount()).toBe(0);
  });
});

describe('Reset All Mocks', () => {
  it('should reset multiple providers', () => {
    const provider1 = createMockProvider();
    const provider2 = createMockProvider();

    // Make calls
    provider1.invoke([]);
    provider2.validateConfig({});

    expect(provider1.tracker.getCallCount()).toBe(1);
    expect(provider2.tracker.getCallCount()).toBe(1);

    // Reset all
    resetAllMocks(provider1, provider2);

    expect(provider1.tracker.getCallCount()).toBe(0);
    expect(provider2.tracker.getCallCount()).toBe(0);
  });
});
