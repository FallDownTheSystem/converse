/**
 * Unit tests for OpenAI provider
 * Tests the unified interface implementation without making real API calls
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openaiProvider } from '../../../src/providers/openai.js';

// Mock the OpenAI SDK
vi.mock('openai', () => {
  const MockOpenAI = vi.fn().mockImplementation(function () {
    return {
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
      responses: {
        create: vi.fn(),
      },
    };
  });

  return {
    default: MockOpenAI,
  };
});

describe('OpenAI Provider', () => {
  describe('validateConfig', () => {
    it('should return true for valid OpenAI API key', () => {
      const config = {
        apiKeys: {
          openai: 'sk-1234567890abcdef1234567890abcdef1234567890abcdef',
        },
      };

      expect(openaiProvider.validateConfig(config)).toBe(true);
    });

    it('should return false for missing API key', () => {
      const config = { apiKeys: {} };
      expect(openaiProvider.validateConfig(config)).toBe(false);
    });

    it('should return false for invalid API key format', () => {
      const config = {
        apiKeys: {
          openai: 'invalid-key',
        },
      };

      expect(openaiProvider.validateConfig(config)).toBe(false);
    });

    it('should return false for short API key', () => {
      const config = {
        apiKeys: {
          openai: 'sk-short',
        },
      };

      expect(openaiProvider.validateConfig(config)).toBe(false);
    });
  });

  describe('isAvailable', () => {
    it('should return true when config is valid', () => {
      const config = {
        apiKeys: {
          openai: 'sk-1234567890abcdef1234567890abcdef1234567890abcdef',
        },
      };

      expect(openaiProvider.isAvailable(config)).toBe(true);
    });

    it('should return false when config is invalid', () => {
      const config = { apiKeys: {} };
      expect(openaiProvider.isAvailable(config)).toBe(false);
    });
  });

  describe('getSupportedModels', () => {
    it('should return supported models object', () => {
      const models = openaiProvider.getSupportedModels();

      expect(typeof models).toBe('object');
      expect('o3' in models).toBe(true);
      expect('o4-mini' in models).toBe(true);
      expect('gpt-4.1-2025-04-14' in models).toBe(true);
      expect('gpt-5.4' in models).toBe(true);
      expect('gpt-5.4-pro' in models).toBe(true);
      expect('gpt-5.6-sol' in models).toBe(true);
      expect('gpt-5.6-terra' in models).toBe(true);
      expect('gpt-5.6-luna' in models).toBe(true);
    });

    it('should include model configuration details', () => {
      const models = openaiProvider.getSupportedModels();
      const o3Model = models['o3'];

      expect(o3Model.modelName).toBe('o3');
      expect(o3Model.friendlyName).toBe('OpenAI (O3)');
      expect(o3Model.contextWindow).toBe(200000);
      expect(o3Model.supportsImages).toBe(true);
    });

    it('should include GPT-5.4 Pro configuration with correct properties', () => {
      const models = openaiProvider.getSupportedModels();
      const gpt5ProModel = models['gpt-5.4-pro'];

      expect(gpt5ProModel).toBeTruthy();
      expect(gpt5ProModel.modelName).toBe('gpt-5.4-pro');
      expect(gpt5ProModel.friendlyName).toBe('OpenAI (GPT-5.4 Pro)');
      expect(gpt5ProModel.contextWindow).toBe(1000000);
      expect(gpt5ProModel.maxOutputTokens).toBe(272000);
      expect(gpt5ProModel.supportsStreaming).toBe(false);
      expect(gpt5ProModel.supportsImages).toBe(true);
      expect(gpt5ProModel.supportsWebSearch).toBe(true);
      expect(gpt5ProModel.supportsResponsesAPI).toBe(true);
    });
  });

  describe('getModelConfig', () => {
    it('should return config for exact model name', () => {
      const config = openaiProvider.getModelConfig('o3');

      expect(config).toBeTruthy();
      expect(config.modelName).toBe('o3');
      expect(config.friendlyName).toBe('OpenAI (O3)');
    });

    it('should return config for model alias', () => {
      const config = openaiProvider.getModelConfig('o4mini');

      expect(config).toBeTruthy();
      expect(config.modelName).toBe('o4-mini');
    });

    it('should return null for unknown model', () => {
      const config = openaiProvider.getModelConfig('unknown-model');
      expect(config).toBeNull();
    });

    it('should be case insensitive', () => {
      const config = openaiProvider.getModelConfig('O3');

      expect(config).toBeTruthy();
      expect(config.modelName).toBe('o3');
    });

    it('should return config for GPT-5.4 Pro aliases', () => {
      const aliases = ['gpt5-pro', 'gpt-5pro', 'gpt 5 pro', 'gpt-5 pro', 'gpt-5-pro'];

      aliases.forEach((alias) => {
        const config = openaiProvider.getModelConfig(alias);
        expect(config).toBeTruthy();
        expect(config.modelName).toBe('gpt-5.4-pro');
      });
    });

    it('should resolve generic GPT-5 aliases to GPT-5.6 Sol', () => {
      const aliases = ['gpt-5', 'gpt5', 'gpt 5', 'gpt-5.6', 'gpt5.6', 'sol'];

      aliases.forEach((alias) => {
        const config = openaiProvider.getModelConfig(alias);
        expect(config).toBeTruthy();
        expect(config.modelName).toBe('gpt-5.6-sol');
      });
    });

    it('should resolve GPT-5.6 tier aliases', () => {
      expect(openaiProvider.getModelConfig('terra').modelName).toBe(
        'gpt-5.6-terra',
      );
      expect(openaiProvider.getModelConfig('gpt5.6-terra').modelName).toBe(
        'gpt-5.6-terra',
      );
      expect(openaiProvider.getModelConfig('luna').modelName).toBe(
        'gpt-5.6-luna',
      );
      expect(openaiProvider.getModelConfig('gpt5.6-luna').modelName).toBe(
        'gpt-5.6-luna',
      );
    });
  });

  describe('invoke - input validation', () => {
    const validConfig = {
      apiKeys: {
        openai: 'sk-1234567890abcdef1234567890abcdef1234567890abcdef',
      },
    };

    it('should throw error for missing API key', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const config = { apiKeys: {} };

      await expect(openaiProvider.invoke(messages, { config })).rejects.toThrow(
        expect.objectContaining({
          name: 'OpenAIProviderError',
          code: 'MISSING_API_KEY',
        }),
      );
    });

    it('should throw error for invalid API key format', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const config = { apiKeys: { openai: 'invalid' } };

      await expect(openaiProvider.invoke(messages, { config })).rejects.toThrow(
        expect.objectContaining({
          name: 'OpenAIProviderError',
          code: 'INVALID_API_KEY',
        }),
      );
    });

    it('should throw error for non-array messages', async () => {
      const messages = 'not an array';

      await expect(
        openaiProvider.invoke(messages, { config: validConfig }),
      ).rejects.toThrow(
        expect.objectContaining({
          name: 'OpenAIProviderError',
          code: 'INVALID_MESSAGES',
        }),
      );
    });

    it('should throw error for invalid message role', async () => {
      const messages = [{ role: 'invalid', content: 'Hello' }];

      await expect(
        openaiProvider.invoke(messages, { config: validConfig }),
      ).rejects.toThrow(
        expect.objectContaining({
          name: 'OpenAIProviderError',
          code: 'INVALID_ROLE',
        }),
      );
    });

    it('should throw error for missing message content', async () => {
      const messages = [{ role: 'user' }];

      await expect(
        openaiProvider.invoke(messages, { config: validConfig }),
      ).rejects.toThrow(
        expect.objectContaining({
          name: 'OpenAIProviderError',
          code: 'MISSING_CONTENT',
        }),
      );
    });
  });

  describe('model resolution', () => {
    it('should handle model aliases correctly', () => {
      const models = openaiProvider.getSupportedModels();

      // Verify aliases are configured
      expect(models['o4-mini'].aliases.includes('o4mini')).toBe(true);
      expect(models['o3-pro-2025-06-10'].aliases.includes('o3-pro')).toBe(true);
    });
  });

  describe('invoke with mocked SDK', () => {
    const validConfig = {
      apiKeys: {
        openai: 'sk-1234567890abcdef1234567890abcdef1234567890abcdef',
      },
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should successfully call OpenAI API and return unified response', async () => {
      // Import OpenAI to get the mocked instance
      const OpenAI = (await import('openai')).default;
      const mockCreate = vi.fn().mockResolvedValue({
        output_text: 'Hello! How can I help you today?',
        status: 'completed',
        usage: {
          input_tokens: 10,
          output_tokens: 8,
          total_tokens: 18,
        },
        model: 'gpt-5-mini',
      });

      OpenAI.mockImplementation(function () {
        return {
          chat: {
            completions: {
              create: mockCreate,
            },
          },
          responses: {
            create: mockCreate,
          },
        };
      });

      const messages = [{ role: 'user', content: 'Hello' }];
      const result = await openaiProvider.invoke(messages, {
        config: validConfig,
        model: 'gpt-5-mini',
      });

      expect(result).toEqual({
        content: 'Hello! How can I help you today?',
        stop_reason: 'completed',
        rawResponse: expect.any(Object),
        metadata: {
          model: 'gpt-5-mini',
          usage: {
            input_tokens: 10,
            output_tokens: 8,
            total_tokens: 18,
          },
          response_time_ms: expect.any(Number),
          finish_reason: 'completed',
          provider: 'openai',
          api_type: 'Responses API',
          web_search_used: true,
          web_search_type: 'web_search_preview',
        },
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-5-mini',
          input: [{ role: 'user', content: 'Hello' }],
          stream: false,
        }),
        expect.any(Object),
      );
    });

    it('should handle reasoning effort for O3 models', async () => {
      const OpenAI = (await import('openai')).default;
      const mockCreate = vi.fn().mockResolvedValue({
        output_text: 'Reasoning response',
        status: 'completed',
        usage: { input_tokens: 5, output_tokens: 10, total_tokens: 15 },
      });

      OpenAI.mockImplementation(function () {
        return {
          chat: { completions: { create: mockCreate } },
          responses: { create: mockCreate },
        };
      });

      const messages = [{ role: 'user', content: 'Complex reasoning task' }];
      await openaiProvider.invoke(messages, {
        config: validConfig,
        model: 'o3',
        reasoning_effort: 'high',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'o3',
          reasoning: expect.objectContaining({ effort: 'high' }),
        }),
        expect.any(Object),
      );
    });

    it.each([
      // GPT-5.6 accepts the whole ladder except minimal
      ['gpt-5.6-sol', 'none', 'none'],
      ['gpt-5.6-sol', 'minimal', 'low'],
      ['gpt-5.6-sol', 'xhigh', 'xhigh'],
      ['gpt-5.6-sol', 'max', 'max'],
      // GPT-5.4 stops at xhigh
      ['gpt-5.4', 'xhigh', 'xhigh'],
      ['gpt-5.4', 'max', 'xhigh'],
      ['gpt-5.4-mini', 'none', 'none'],
      // GPT-5 mini/nano keep minimal but never gained xhigh
      ['gpt-5-mini', 'minimal', 'minimal'],
      ['gpt-5-mini', 'xhigh', 'high'],
      ['gpt-5-nano', 'none', 'minimal'],
      // o-series accepts only low/medium/high
      ['o3', 'none', 'low'],
      ['o3', 'xhigh', 'high'],
      ['o4-mini', 'max', 'high'],
      // GPT-5.4 Pro starts at medium and stops at xhigh
      ['gpt-5.4-pro', 'low', 'medium'],
      ['gpt-5.4-pro', 'max', 'xhigh'],
      // Uncatalogued snapshots resolve by family: GPT-5.6 keeps its ladder,
      // older Pro snapshots are only known to accept high
      ['gpt-5.6-2026-09-01', 'minimal', 'low'],
      ['gpt-5.6-2026-09-01', 'max', 'max'],
      ['gpt-5.2-pro', 'xhigh', 'high'],
    ])(
      'clamps reasoning effort onto the tiers %s accepts (%s -> %s)',
      async (model, level, expected) => {
        const OpenAI = (await import('openai')).default;
        const mockCreate = vi.fn().mockResolvedValue({
          output_text: 'ok',
          status: 'completed',
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        });

        OpenAI.mockImplementation(function () {
          return {
            chat: { completions: { create: mockCreate } },
            responses: { create: mockCreate },
          };
        });

        await openaiProvider.invoke([{ role: 'user', content: 'Hi' }], {
          config: validConfig,
          model,
          reasoning_effort: level,
        });

        expect(mockCreate.mock.calls[0][0].reasoning.effort).toBe(expected);
      },
    );

    it('should attach web search whenever the model supports it (no flag)', async () => {
      const OpenAI = (await import('openai')).default;
      const mockCreate = vi.fn().mockResolvedValue({
        output_text: 'response',
        status: 'completed',
        usage: {},
      });

      OpenAI.mockImplementation(function () {
        return {
          chat: { completions: { create: mockCreate } },
          responses: { create: mockCreate },
        };
      });

      const messages = [{ role: 'user', content: 'test' }];

      // gpt-5-mini supports web search — the tool attaches with no flag
      await openaiProvider.invoke(messages, {
        config: validConfig,
        model: 'gpt-5-mini',
      });

      expect(mockCreate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          tools: [{ type: 'web_search_preview' }],
        }),
        expect.any(Object),
      );

      // gpt-5-nano does not support web search — the tool is not attached
      await openaiProvider.invoke(messages, {
        config: validConfig,
        model: 'gpt-5-nano',
      });

      expect(mockCreate).toHaveBeenLastCalledWith(
        expect.not.objectContaining({
          tools: expect.anything(),
        }),
        expect.any(Object),
      );
    });

    it('should handle OpenAI API errors gracefully', async () => {
      const OpenAI = (await import('openai')).default;
      const mockCreate = vi.fn().mockRejectedValue(
        Object.assign(new Error('Rate limit exceeded'), {
          type: 'rate_limit_error',
          code: 'rate_limit_exceeded',
        }),
      );

      OpenAI.mockImplementation(function () {
        return {
          chat: { completions: { create: mockCreate } },
          responses: { create: mockCreate },
        };
      });

      const messages = [{ role: 'user', content: 'test' }];

      await expect(
        openaiProvider.invoke(messages, { config: validConfig }),
      ).rejects.toThrow(
        expect.objectContaining({
          name: 'OpenAIProviderError',
          code: 'RATE_LIMIT_EXCEEDED',
        }),
      );
    });
  });

  describe('streaming functionality', () => {
    const validConfig = {
      apiKeys: {
        openai: 'sk-1234567890abcdef1234567890abcdef1234567890abcdef',
      },
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return AsyncGenerator when stream=true', async () => {
      const OpenAI = (await import('openai')).default;

      // Create mock stream for Chat Completions API
      const mockStreamChunks = [
        {
          choices: [{ delta: { content: 'Hello' }, finish_reason: null }],
          usage: null,
          model: 'gpt-5-mini',
        },
        {
          choices: [{ delta: { content: ' world' }, finish_reason: null }],
          usage: null,
          model: 'gpt-5-mini',
        },
        {
          choices: [{ delta: { content: '!' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
          model: 'gpt-5-mini',
        },
      ];

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          for (const chunk of mockStreamChunks) {
            yield chunk;
          }
        },
      };

      const mockCreate = vi.fn().mockResolvedValue(mockStream);

      OpenAI.mockImplementation(function () {
        return {
          chat: { completions: { create: mockCreate } },
          responses: { create: mockCreate },
        };
      });

      // Temporarily modify model to not support Responses API to force Chat Completions API
      const originalModels = openaiProvider.getSupportedModels();
      const testModel = {
        ...originalModels['gpt-5-mini'],
        supportsResponsesAPI: false,
      };
      originalModels['gpt-5-mini'] = testModel;

      try {
        const messages = [{ role: 'user', content: 'Hello' }];
        const result = await openaiProvider.invoke(messages, {
          config: validConfig,
          model: 'gpt-5-mini', // Now forces Chat Completions API
          stream: true,
        });

        // Verify it returns an AsyncGenerator
        expect(result).toBeDefined();
        expect(typeof result[Symbol.asyncIterator]).toBe('function');

        // Collect all events from the stream
        const events = [];
        for await (const event of result) {
          events.push(event);
        }

        // Verify event structure
        expect(events).toHaveLength(6); // start, 3 deltas, usage, end

        expect(events[0]).toMatchObject({
          type: 'start',
          model: 'gpt-5-mini',
          provider: 'openai',
          api_type: 'Chat Completions API',
        });

        expect(events[1]).toMatchObject({
          type: 'delta',
          content: 'Hello',
        });

        expect(events[2]).toMatchObject({
          type: 'delta',
          content: ' world',
        });

        expect(events[3]).toMatchObject({
          type: 'delta',
          content: '!',
        });

        expect(events[4]).toMatchObject({
          type: 'usage',
          usage: {
            input_tokens: 10,
            output_tokens: 3,
            total_tokens: 13,
          },
        });

        expect(events[5]).toMatchObject({
          type: 'end',
          content: 'Hello world!',
          stop_reason: 'stop',
          metadata: {
            model: 'gpt-5-mini',
            provider: 'openai',
            api_type: 'Chat Completions API',
            finish_reason: 'stop',
          },
        });
      } finally {
        // Restore original model config
        originalModels['gpt-5-mini'] = {
          ...originalModels['gpt-5-mini'],
          supportsResponsesAPI: true,
        };
      }
    });

    it('should handle Responses API streaming format', async () => {
      const OpenAI = (await import('openai')).default;

      // Create mock stream for Responses API
      const mockStreamChunks = [
        {
          type: 'response.output_text.delta',
          delta: 'Response',
        },
        {
          type: 'response.output_text.delta',
          delta: ' text',
        },
        {
          type: 'response.completed',
          response: {
            status: 'completed',
            model: 'gpt-5',
            usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 },
          },
        },
      ];

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          for (const chunk of mockStreamChunks) {
            yield chunk;
          }
        },
      };

      const mockCreate = vi.fn().mockResolvedValue(mockStream);

      OpenAI.mockImplementation(function () {
        return {
          chat: { completions: { create: mockCreate } },
          responses: { create: mockCreate },
        };
      });

      const messages = [{ role: 'user', content: 'Test' }];
      const result = await openaiProvider.invoke(messages, {
        config: validConfig,
        model: 'gpt-5', // GPT-5 uses Responses API by default
        stream: true,
      });

      // Collect all events from the stream
      const events = [];
      for await (const event of result) {
        events.push(event);
      }

      // Debug: log actual events
      console.log(
        'Actual events:',
        events.map((e) => ({ type: e.type, content: e.content, ...e })),
      );

      // Verify event structure for Responses API
      expect(events).toHaveLength(5); // start, 2 deltas, usage, end

      expect(events[0]).toMatchObject({
        type: 'start',
        model: 'gpt-5.6-sol', // 'gpt-5' resolves to 'gpt-5.6-sol'
        api_type: 'Responses API',
      });

      expect(events[1]).toMatchObject({
        type: 'delta',
        content: 'Response',
      });

      expect(events[2]).toMatchObject({
        type: 'delta',
        content: ' text',
      });

      expect(events[4]).toMatchObject({
        type: 'end',
        content: 'Response text',
        stop_reason: 'completed',
        metadata: {
          model: 'gpt-5', // end event uses model from response, not resolved
          api_type: 'Responses API',
        },
      });
    });

    it('should handle streaming errors gracefully', async () => {
      const OpenAI = (await import('openai')).default;

      const streamError = Object.assign(new Error('Stream error'), {
        type: 'rate_limit_error',
        code: 'rate_limit_exceeded',
      });

      const mockCreate = vi.fn().mockRejectedValue(streamError);

      OpenAI.mockImplementation(function () {
        return {
          chat: { completions: { create: mockCreate } },
          responses: { create: mockCreate },
        };
      });

      const messages = [{ role: 'user', content: 'Test' }];
      const result = await openaiProvider.invoke(messages, {
        config: validConfig,
        stream: true,
      });

      // Expect the generator to yield an error event and then throw
      const events = [];
      try {
        for await (const event of result) {
          events.push(event);
        }
      } catch (error) {
        // Verify the error is properly wrapped
        expect(error.name).toBe('OpenAIProviderError');
        expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      }

      // Should have start event and error event
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('start');
      expect(events[1].type).toBe('error');
      expect(events[1].error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(events[1].error.recoverable).toBe(true);
    });

    it('should fall back to non-streaming for unsupported models', async () => {
      const OpenAI = (await import('openai')).default;
      const mockCreate = vi.fn().mockResolvedValue({
        output_text: 'Non-streaming response',
        status: 'completed',
        usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 },
      });

      OpenAI.mockImplementation(function () {
        return {
          chat: { completions: { create: mockCreate } },
          responses: { create: mockCreate },
        };
      });

      // Temporarily modify a model to not support streaming
      const originalModels = openaiProvider.getSupportedModels();
      const testModel = {
        ...originalModels['gpt-4.1-2025-04-14'],
        supportsStreaming: false,
      };
      originalModels['gpt-4.1-2025-04-14'] = testModel;

      const messages = [{ role: 'user', content: 'Test' }];
      const result = await openaiProvider.invoke(messages, {
        config: validConfig,
        model: 'gpt-4.1-2025-04-14',
        stream: true,
      });

      // Should return regular response object, not AsyncGenerator
      expect(typeof result[Symbol.asyncIterator]).toBe('undefined');
      expect(result).toMatchObject({
        content: 'Non-streaming response',
        stop_reason: 'completed',
      });

      // Verify stream was set to false in the request
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ stream: false }),
        expect.any(Object),
      );

      // Restore original model config
      originalModels['gpt-4.1-2025-04-14'] = {
        ...originalModels['gpt-4.1-2025-04-14'],
        supportsStreaming: true,
      };
    });

    it('should include usage reporting for Chat Completions API streaming', async () => {
      const OpenAI = (await import('openai')).default;

      const mockStreamChunks = [
        {
          choices: [{ delta: { content: 'test' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      ];

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          for (const chunk of mockStreamChunks) {
            yield chunk;
          }
        },
      };

      const mockChatCreate = vi.fn().mockResolvedValue(mockStream);
      const mockResponsesCreate = vi.fn().mockResolvedValue(mockStream);

      OpenAI.mockImplementation(function () {
        return {
          chat: { completions: { create: mockChatCreate } },
          responses: { create: mockResponsesCreate },
        };
      });

      // Temporarily modify model to not support Responses API to force Chat Completions API
      const originalModels = openaiProvider.getSupportedModels();
      const testModel = {
        ...originalModels['gpt-4.1-2025-04-14'],
        supportsResponsesAPI: false,
      };
      originalModels['gpt-4.1-2025-04-14'] = testModel;

      try {
        const messages = [{ role: 'user', content: 'Test' }];
        const result = await openaiProvider.invoke(messages, {
          config: validConfig,
          model: 'gpt-4.1-2025-04-14', // Now forces Chat Completions API
          stream: true,
        });

        // Consume events from the generator to trigger the API call
        const iterator = result[Symbol.asyncIterator]();
        const firstEvent = await iterator.next();
        expect(firstEvent.value.type).toBe('start'); // Verify it's streaming

        // Consume one more event to trigger the actual API call (which happens after start event)
        const secondEvent = await iterator.next();

        // Verify Chat Completions API was called with usage reporting
        expect(mockChatCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            stream_options: { include_usage: true },
          }),
          expect.any(Object),
        );

        // Verify Responses API was not called
        expect(mockResponsesCreate).not.toHaveBeenCalled();
      } finally {
        // Restore original model config
        originalModels['gpt-4.1-2025-04-14'] = {
          ...originalModels['gpt-4.1-2025-04-14'],
          supportsResponsesAPI: true,
        };
      }
    });
  });
});
