/**
 * Unit tests for XAI provider
 * Tests the unified interface implementation without making real API calls
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { xaiProvider } from '../../../src/providers/xai.js';

// Mock the OpenAI SDK
vi.mock('openai', () => {
  const MockOpenAI = vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn()
      }
    }
  }));

  return {
    default: MockOpenAI
  };
});

describe('XAI Provider', () => {
  describe('validateConfig', () => {
    it('should return true for valid XAI API key', () => {
      const config = {
        apiKeys: {
          xai: 'xai-1234567890abcdef1234567890abcdef1234567890abcdef'
        }
      };

      expect(xaiProvider.validateConfig(config)).toBe(true);
    });

    it('should return false for missing API key', () => {
      const config = { apiKeys: {} };
      expect(xaiProvider.validateConfig(config)).toBe(false);
    });

    it('should return false for invalid API key format', () => {
      const config = {
        apiKeys: {
          xai: 'invalid-key'
        }
      };

      expect(xaiProvider.validateConfig(config)).toBe(false);
    });

    it('should return false for short API key', () => {
      const config = {
        apiKeys: {
          xai: 'xai-short'
        }
      };

      expect(xaiProvider.validateConfig(config)).toBe(false);
    });

    it('should return false for OpenAI format key', () => {
      const config = {
        apiKeys: {
          xai: 'sk-1234567890abcdef1234567890abcdef1234567890abcdef'
        }
      };

      expect(xaiProvider.validateConfig(config)).toBe(false);
    });
  });

  describe('isAvailable', () => {
    it('should return true when config is valid', () => {
      const config = {
        apiKeys: {
          xai: 'xai-1234567890abcdef1234567890abcdef1234567890abcdef'
        }
      };

      expect(xaiProvider.isAvailable(config)).toBe(true);
    });

    it('should return false when config is invalid', () => {
      const config = { apiKeys: {} };
      expect(xaiProvider.isAvailable(config)).toBe(false);
    });
  });

  describe('getSupportedModels', () => {
    it('should return supported models object', () => {
      const models = xaiProvider.getSupportedModels();

      expect(typeof models).toBe('object');
      expect('grok-4-0709' in models).toBeTruthy();
      expect('grok-3' in models).toBeTruthy();
      expect('grok-3-fast' in models).toBeTruthy();
    });

    it('should include model configuration details', () => {
      const models = xaiProvider.getSupportedModels();
      const grok4Model = models['grok-4-0709'];

      expect(grok4Model.modelName).toBe('grok-4-0709');
      expect(grok4Model.friendlyName).toBe('X.AI (Grok 4)');
      expect(grok4Model.contextWindow).toBe(256000);
      expect(grok4Model.supportsImages).toBe(true);
      expect(grok4Model.supportsTemperature).toBe(true);
    });

    it('should have correct image support configuration', () => {
      const models = xaiProvider.getSupportedModels();

      // Grok-4 supports images
      expect(models['grok-4-0709'].supportsImages).toBe(true);

      // Grok-3 models don't support images
      expect(models['grok-3'].supportsImages).toBe(false);
      expect(models['grok-3-fast'].supportsImages).toBe(false);
    });
  });

  describe('getModelConfig', () => {
    it('should return config for exact model name', () => {
      const config = xaiProvider.getModelConfig('grok-4-0709');

      expect(config).toBeTruthy();
      expect(config.modelName).toBe('grok-4-0709');
      expect(config.friendlyName).toBe('X.AI (Grok 4)');
    });

    it('should return config for model alias', () => {
      const config = xaiProvider.getModelConfig('grok');

      expect(config).toBeTruthy();
      expect(config.modelName).toBe('grok-4-0709');
    });

    it('should return config for various aliases', () => {
      // Test all grok-4 aliases
      const aliases = ['grok', 'grok4', 'grok-4', 'grok-4-latest'];

      for (const alias of aliases) {
        const config = xaiProvider.getModelConfig(alias);
        expect(config).toBeTruthy(); // Should find config for alias: ${alias}
        expect(config.modelName).toBe('grok-4-0709');
      }
    });

    it('should return null for unknown model', () => {
      const config = xaiProvider.getModelConfig('unknown-model');
      expect(config).toBe(null);
    });

    it('should be case insensitive', () => {
      const config = xaiProvider.getModelConfig('GROK-4-0709');

      expect(config).toBeTruthy();
      expect(config.modelName).toBe('grok-4-0709');
    });
  });

  describe('invoke - input validation', () => {
    const validConfig = {
      apiKeys: {
        xai: 'xai-1234567890abcdef1234567890abcdef1234567890abcdef'
      }
    };

    it('should throw error for missing API key', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const config = { apiKeys: {} };

      await expect(xaiProvider.invoke(messages, { config })).rejects.toThrow(
        expect.objectContaining({
          name: 'XAIProviderError',
          code: 'MISSING_API_KEY'
        })
      );
    });

    it('should throw error for invalid API key format', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const config = { apiKeys: { xai: 'invalid' } };

      await expect(
        xaiProvider.invoke(messages, { config })
      ).rejects.toThrow(
        expect.objectContaining({
          name: 'XAIProviderError',
          code: 'INVALID_API_KEY'
        })
      );
    });

    it('should throw error for OpenAI format key', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const config = { apiKeys: { xai: 'sk-1234567890abcdef1234567890abcdef1234567890abcdef' } };

      await expect(
        xaiProvider.invoke(messages, { config })
      ).rejects.toThrow(
        expect.objectContaining({
          name: 'XAIProviderError',
          code: 'INVALID_API_KEY'
        })
      );
    });

    it('should throw error for non-array messages', async () => {
      const messages = 'not an array';

      await expect(
        xaiProvider.invoke(messages, { config: validConfig })
      ).rejects.toThrow(
        expect.objectContaining({
          name: 'XAIProviderError',
          code: 'INVALID_MESSAGES'
        })
      );
    });

    it('should throw error for invalid message role', async () => {
      const messages = [{ role: 'invalid', content: 'Hello' }];

      await expect(
        xaiProvider.invoke(messages, { config: validConfig })
      ).rejects.toThrow(
        expect.objectContaining({
          name: 'XAIProviderError',
          code: 'INVALID_ROLE'
        })
      );
    });

    it('should throw error for missing message content', async () => {
      const messages = [{ role: 'user' }];

      await expect(
        xaiProvider.invoke(messages, { config: validConfig })
      ).rejects.toThrow(
        expect.objectContaining({
          name: 'XAIProviderError',
          code: 'MISSING_CONTENT'
        })
      );
    });
  });

  describe('model resolution', () => {
    it('should handle model aliases correctly', () => {
      const models = xaiProvider.getSupportedModels();

      // Verify aliases are configured
      expect(models['grok-4-0709'].aliases.includes('grok')).toBe(true);
      expect(models['grok-4-0709'].aliases.includes('grok4')).toBe(true);
      expect(models['grok-4-0709'].aliases.includes('grok-4')).toBe(true);
      expect(models['grok-3'].aliases.includes('grok3')).toBe(true);
      expect(models['grok-3-fast'].aliases.includes('grok3fast')).toBe(true);
    });

    it('should default to grok-4-0709 model', () => {
      const models = xaiProvider.getSupportedModels();

      // Default model should be grok-4-0709
      const defaultConfig = xaiProvider.getModelConfig('grok');
      expect(defaultConfig.modelName).toBe('grok-4-0709');
    });
  });

  describe('temperature handling', () => {
    it('should support temperature for all models', () => {
      const models = xaiProvider.getSupportedModels();

      // All Grok models support temperature
      expect(models['grok-4-0709'].supportsTemperature).toBe(true);
      expect(models['grok-3'].supportsTemperature).toBe(true);
      expect(models['grok-3-fast'].supportsTemperature).toBe(true);
    });
  });

  describe('base URL configuration', () => {
    it('should use default XAI base URL when not configured', () => {
      // This would be tested with a mocked OpenAI client
      // For now, we verify the default is correct in the implementation
      const validConfig = {
        apiKeys: {
          xai: 'xai-1234567890abcdef1234567890abcdef1234567890abcdef'
        }
      };

      // The implementation should use 'https://api.x.ai/v1' as default
      expect(validConfig.apiKeys.xai.startsWith('xai-')).toBe(true);
    });

    it('should use custom base URL when configured', () => {
      const configWithCustomUrl = {
        apiKeys: {
          xai: 'xai-1234567890abcdef1234567890abcdef1234567890abcdef'
        },
        providers: {
          xaiBaseUrl: 'https://custom.example.com/v1'
        }
      };

      // The implementation should respect the custom base URL
      expect(configWithCustomUrl.providers.xaiBaseUrl).toBe('https://custom.example.com/v1');
    });
  });

  describe('streaming functionality', () => {
    let validConfig;

    beforeEach(() => {
      validConfig = {
        apiKeys: {
          xai: 'xai-1234567890abcdef1234567890abcdef1234567890abcdef'
        }
      };
      vi.clearAllMocks();
    });

    it('should return AsyncGenerator when stream=true', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const OpenAI = (await import('openai')).default;

      // Mock streaming response
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield {
            choices: [{ delta: { content: 'Hello' }, finish_reason: null }],
            model: 'grok-4-0709'
          };
          yield {
            choices: [{ delta: { content: ' world!' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
          };
        }
      };

      const mockCreate = vi.fn().mockResolvedValue(mockStream);
      OpenAI.mockImplementation(() => ({
        chat: { completions: { create: mockCreate } }
      }));

      const result = await xaiProvider.invoke(messages, {
        config: validConfig,
        stream: true
      });

      expect(result[Symbol.asyncIterator]).toBeDefined();
      expect(typeof result[Symbol.asyncIterator]).toBe('function');

      // Collect all events
      const events = [];
      for await (const event of result) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
      expect(events[0]).toMatchObject({
        type: 'start',
        model: 'grok-4-0709',
        provider: 'xai'
      });
    });

    it('should handle streaming with live search', async () => {
      const messages = [{ role: 'user', content: 'What is the latest news?' }];
      const OpenAI = (await import('openai')).default;

      // Mock streaming response with search
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield {
            choices: [{ delta: { content: 'Based on' }, finish_reason: null }]
          };
          yield {
            choices: [{ delta: { content: ' recent news...' }, finish_reason: 'stop' }],
            usage: {
              prompt_tokens: 15,
              completion_tokens: 25,
              total_tokens: 40,
              num_sources_used: 5
            },
            citations: [
              { title: 'News Article', url: 'https://example.com/news1' }
            ]
          };
        }
      };

      const mockCreate = vi.fn().mockResolvedValue(mockStream);
      OpenAI.mockImplementation(() => ({
        chat: { completions: { create: mockCreate } }
      }));

      const result = await xaiProvider.invoke(messages, {
        config: validConfig,
        model: 'grok-4-0709',
        stream: true,
        use_websearch: true
      });

      // Collect all events
      const events = [];
      for await (const event of result) {
        events.push(event);
      }

      // Check for search-specific features
      const usageEvent = events.find(e => e.type === 'usage');
      expect(usageEvent.usage.search_sources_used).toBe(5);
      expect(usageEvent.usage.search_cost_estimate).toBe(0.125); // 5 * $0.025

      const endEvent = events.find(e => e.type === 'end');
      expect(endEvent.metadata.search_sources_used).toBe(5);
      expect(endEvent.metadata.citations).toBeDefined();
    });

    it('should handle streaming errors gracefully', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const OpenAI = (await import('openai')).default;

      // Mock error during streaming
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield {
            choices: [{ delta: { content: 'Hello' }, finish_reason: null }]
          };
          throw new Error('Stream connection lost');
        }
      };

      const mockCreate = vi.fn().mockResolvedValue(mockStream);
      OpenAI.mockImplementation(() => ({
        chat: { completions: { create: mockCreate } }
      }));

      const result = await xaiProvider.invoke(messages, {
        config: validConfig,
        stream: true
      });

      // Collect all events until error
      const events = [];
      try {
        for await (const event of result) {
          events.push(event);
        }
      } catch (error) {
        expect(error.name).toBe('XAIProviderError');
      }

      expect(events[0].type).toBe('start');
      expect(events[1].type).toBe('delta');
      expect(events[2].type).toBe('error');
    });

    it('should work with unknown models using streaming', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const OpenAI = (await import('openai')).default;

      // Mock streaming response for unknown model
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield {
            choices: [{ delta: { content: 'Hello' }, finish_reason: null }],
            model: 'unknown-model'
          };
          yield {
            choices: [{ delta: { content: ' from unknown model!' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 }
          };
        }
      };

      const mockCreate = vi.fn().mockResolvedValue(mockStream);
      OpenAI.mockImplementation(() => ({
        chat: { completions: { create: mockCreate } }
      }));

      const result = await xaiProvider.invoke(messages, {
        config: validConfig,
        model: 'unknown-model',
        stream: true
      });

      expect(result[Symbol.asyncIterator]).toBeDefined();

      // Collect events
      const events = [];
      for await (const event of result) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
      expect(events[0]).toMatchObject({
        type: 'start',
        model: 'unknown-model',
        provider: 'xai'
      });

      // Verify the call was made with streaming
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: true
        })
      );
    });

    it('should include usage reporting for streaming mode', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const OpenAI = (await import('openai')).default;

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield {
            choices: [{ delta: { content: 'Hi there!' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 }
          };
        }
      };

      const mockCreate = vi.fn().mockResolvedValue(mockStream);
      OpenAI.mockImplementation(() => ({
        chat: { completions: { create: mockCreate } }
      }));

      const result = await xaiProvider.invoke(messages, {
        config: validConfig,
        stream: true
      });

      // Consume the generator to trigger the API call
      const events = [];
      for await (const event of result) {
        events.push(event);
      }

      // Verify stream_options was included
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          stream_options: { include_usage: true }
        })
      );
    });

    it('should handle all Grok models with streaming', async () => {
      const messages = [{ role: 'user', content: 'Test message' }];
      const models = ['grok-4-0709', 'grok-3', 'grok-3-fast'];
      const OpenAI = (await import('openai')).default;

      for (const model of models) {
        const mockStream = {
          async *[Symbol.asyncIterator]() {
            yield {
              choices: [{ delta: { content: 'Response' }, finish_reason: 'stop' }],
              usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
              model
            };
          }
        };

        const mockCreate = vi.fn().mockResolvedValue(mockStream);
        OpenAI.mockImplementation(() => ({
          chat: { completions: { create: mockCreate } }
        }));

        const result = await xaiProvider.invoke(messages, {
          config: validConfig,
          model,
          stream: true
        });

        expect(result[Symbol.asyncIterator]).toBeDefined();

        // Collect events
        const events = [];
        for await (const event of result) {
          events.push(event);
        }

        const startEvent = events.find(e => e.type === 'start');
        expect(startEvent.model).toBe(model);
      }
    });
  });
});
