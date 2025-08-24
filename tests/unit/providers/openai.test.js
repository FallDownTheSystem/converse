/**
 * Unit tests for OpenAI provider
 * Tests the unified interface implementation without making real API calls
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openaiProvider } from '../../../src/providers/openai.js';

// Mock the OpenAI SDK
vi.mock('openai', () => {
  const MockOpenAI = vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn()
      }
    },
    responses: {
      create: vi.fn()
    }
  }));

  return {
    default: MockOpenAI
  };
});

describe('OpenAI Provider', () => {
  describe('validateConfig', () => {
    it('should return true for valid OpenAI API key', () => {
      const config = {
        apiKeys: {
          openai: 'sk-1234567890abcdef1234567890abcdef1234567890abcdef'
        }
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
          openai: 'invalid-key'
        }
      };

      expect(openaiProvider.validateConfig(config)).toBe(false);
    });

    it('should return false for short API key', () => {
      const config = {
        apiKeys: {
          openai: 'sk-short'
        }
      };

      expect(openaiProvider.validateConfig(config)).toBe(false);
    });
  });

  describe('isAvailable', () => {
    it('should return true when config is valid', () => {
      const config = {
        apiKeys: {
          openai: 'sk-1234567890abcdef1234567890abcdef1234567890abcdef'
        }
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
      expect('o3-mini' in models).toBe(true);
      expect('gpt-4o' in models).toBe(true);
      expect('gpt-4o-mini' in models).toBe(true);
    });

    it('should include model configuration details', () => {
      const models = openaiProvider.getSupportedModels();
      const o3Model = models['o3'];

      expect(o3Model.modelName).toBe('o3');
      expect(o3Model.friendlyName).toBe('OpenAI (O3)');
      expect(o3Model.contextWindow).toBe(200000);
      expect(o3Model.supportsImages).toBe(true);
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
      const config = openaiProvider.getModelConfig('o3mini');

      expect(config).toBeTruthy();
      expect(config.modelName).toBe('o3-mini');
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
  });

  describe('invoke - input validation', () => {
    const validConfig = {
      apiKeys: {
        openai: 'sk-1234567890abcdef1234567890abcdef1234567890abcdef'
      }
    };

    it('should throw error for missing API key', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const config = { apiKeys: {} };

      await expect(openaiProvider.invoke(messages, { config })).rejects.toThrow(
        expect.objectContaining({
          name: 'OpenAIProviderError',
          code: 'MISSING_API_KEY'
        })
      );
    });

    it('should throw error for invalid API key format', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const config = { apiKeys: { openai: 'invalid' } };

      await expect(openaiProvider.invoke(messages, { config })).rejects.toThrow(
        expect.objectContaining({
          name: 'OpenAIProviderError',
          code: 'INVALID_API_KEY'
        })
      );
    });

    it('should throw error for non-array messages', async () => {
      const messages = 'not an array';

      await expect(openaiProvider.invoke(messages, { config: validConfig })).rejects.toThrow(
        expect.objectContaining({
          name: 'OpenAIProviderError',
          code: 'INVALID_MESSAGES'
        })
      );
    });

    it('should throw error for invalid message role', async () => {
      const messages = [{ role: 'invalid', content: 'Hello' }];

      await expect(openaiProvider.invoke(messages, { config: validConfig })).rejects.toThrow(
        expect.objectContaining({
          name: 'OpenAIProviderError',
          code: 'INVALID_ROLE'
        })
      );
    });

    it('should throw error for missing message content', async () => {
      const messages = [{ role: 'user' }];

      await expect(openaiProvider.invoke(messages, { config: validConfig })).rejects.toThrow(
        expect.objectContaining({
          name: 'OpenAIProviderError',
          code: 'MISSING_CONTENT'
        })
      );
    });
  });

  describe('temperature handling', () => {
    it('should clamp temperature to valid range', () => {
      // This would be tested with a mocked OpenAI client
      // For now, we verify the model configurations
      const models = openaiProvider.getSupportedModels();

      // O3 models don't support temperature
      expect(models['o3'].supportsTemperature).toBe(false);
      expect(models['o3-mini'].supportsTemperature).toBe(false);

      // GPT-4o models do support temperature
      expect(models['gpt-4o'].supportsTemperature).toBe(true);
      expect(models['gpt-4o-mini'].supportsTemperature).toBe(true);
    });
  });

  describe('model resolution', () => {
    it('should handle model aliases correctly', () => {
      const models = openaiProvider.getSupportedModels();

      // Verify aliases are configured
      expect(models['o3-mini'].aliases.includes('o3mini')).toBe(true);
      expect(models['o3-pro-2025-06-10'].aliases.includes('o3-pro')).toBe(true);
    });
  });

  describe('invoke with mocked SDK', () => {
    const validConfig = {
      apiKeys: {
        openai: 'sk-1234567890abcdef1234567890abcdef1234567890abcdef'
      }
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
          total_tokens: 18
        },
        model: 'gpt-4o-mini'
      });

      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate
          }
        },
        responses: {
          create: mockCreate
        }
      }));

      const messages = [{ role: 'user', content: 'Hello' }];
      const result = await openaiProvider.invoke(messages, {
        config: validConfig,
        model: 'gpt-4o-mini'
      });

      expect(result).toEqual({
        content: 'Hello! How can I help you today?',
        stop_reason: 'completed',
        rawResponse: expect.any(Object),
        metadata: {
          model: 'gpt-4o-mini',
          usage: {
            input_tokens: 10,
            output_tokens: 8,
            total_tokens: 18
          },
          response_time_ms: expect.any(Number),
          finish_reason: 'completed',
          provider: 'openai',
          api_type: 'Responses API',
          web_search_used: false,
          web_search_type: null
        }
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o-mini',
          input: [{ role: 'user', content: 'Hello' }],
          stream: false
        })
      );
    });

    it('should handle reasoning effort for O3 models', async () => {
      const OpenAI = (await import('openai')).default;
      const mockCreate = vi.fn().mockResolvedValue({
        output_text: 'Reasoning response',
        status: 'completed',
        usage: { input_tokens: 5, output_tokens: 10, total_tokens: 15 }
      });

      OpenAI.mockImplementation(() => ({
        chat: { completions: { create: mockCreate } },
        responses: { create: mockCreate }
      }));

      const messages = [{ role: 'user', content: 'Complex reasoning task' }];
      await openaiProvider.invoke(messages, {
        config: validConfig,
        model: 'o3',
        reasoning_effort: 'high'
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'o3',
          reasoning: { effort: 'high' }
        })
      );
    });

    it('should handle temperature based on model support', async () => {
      const OpenAI = (await import('openai')).default;
      const mockCreate = vi.fn().mockResolvedValue({
        output_text: 'response',
        status: 'completed',
        usage: {}
      });

      OpenAI.mockImplementation(() => ({
        chat: { completions: { create: mockCreate } },
        responses: { create: mockCreate }
      }));

      const messages = [{ role: 'user', content: 'test' }];

      // O3 models don't support temperature
      await openaiProvider.invoke(messages, {
        config: validConfig,
        model: 'o3',
        temperature: 0.8
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.not.objectContaining({
          temperature: expect.any(Number)
        })
      );

      // GPT-4o models do support temperature
      await openaiProvider.invoke(messages, {
        config: validConfig,
        model: 'gpt-4o',
        temperature: 0.8
      });

      expect(mockCreate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          temperature: 0.8
        })
      );
    });

    it('should handle OpenAI API errors gracefully', async () => {
      const OpenAI = (await import('openai')).default;
      const mockCreate = vi.fn().mockRejectedValue(
        Object.assign(new Error('Rate limit exceeded'), {
          type: 'rate_limit_error',
          code: 'rate_limit_exceeded'
        })
      );

      OpenAI.mockImplementation(() => ({
        chat: { completions: { create: mockCreate } },
        responses: { create: mockCreate }
      }));

      const messages = [{ role: 'user', content: 'test' }];

      await expect(openaiProvider.invoke(messages, { config: validConfig }))
        .rejects.toThrow(expect.objectContaining({
          name: 'OpenAIProviderError',
          code: 'RATE_LIMIT_EXCEEDED'
        }));
    });
  });

  describe('streaming functionality', () => {
    const validConfig = {
      apiKeys: {
        openai: 'sk-1234567890abcdef1234567890abcdef1234567890abcdef'
      }
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
          model: 'gpt-4o-mini'
        },
        {
          choices: [{ delta: { content: ' world' }, finish_reason: null }],
          usage: null,
          model: 'gpt-4o-mini'
        },
        {
          choices: [{ delta: { content: '!' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
          model: 'gpt-4o-mini'
        }
      ];

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          for (const chunk of mockStreamChunks) {
            yield chunk;
          }
        }
      };

      const mockCreate = vi.fn().mockResolvedValue(mockStream);

      OpenAI.mockImplementation(() => ({
        chat: { completions: { create: mockCreate } },
        responses: { create: mockCreate }
      }));

      // Temporarily modify model to not support Responses API to force Chat Completions API
      const originalModels = openaiProvider.getSupportedModels();
      const testModel = { ...originalModels['gpt-4o-mini'], supportsResponsesAPI: false };
      originalModels['gpt-4o-mini'] = testModel;

      try {
        const messages = [{ role: 'user', content: 'Hello' }];
        const result = await openaiProvider.invoke(messages, {
          config: validConfig,
          model: 'gpt-4o-mini', // Now forces Chat Completions API
          stream: true
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
          model: 'gpt-4o-mini',
          provider: 'openai',
          api_type: 'Chat Completions API'
        });

        expect(events[1]).toMatchObject({
          type: 'delta',
          content: 'Hello'
        });

        expect(events[2]).toMatchObject({
          type: 'delta',
          content: ' world'
        });

        expect(events[3]).toMatchObject({
          type: 'delta',
          content: '!'
        });

        expect(events[4]).toMatchObject({
          type: 'usage',
          usage: {
            input_tokens: 10,
            output_tokens: 3,
            total_tokens: 13
          }
        });

        expect(events[5]).toMatchObject({
          type: 'end',
          content: 'Hello world!',
          stop_reason: 'stop',
          metadata: {
            model: 'gpt-4o-mini',
            provider: 'openai',
            api_type: 'Chat Completions API',
            finish_reason: 'stop'
          }
        });
      } finally {
        // Restore original model config
        originalModels['gpt-4o-mini'] = { ...originalModels['gpt-4o-mini'], supportsResponsesAPI: true };
      }
    });

    it('should handle Responses API streaming format', async () => {
      const OpenAI = (await import('openai')).default;
      
      // Create mock stream for Responses API
      const mockStreamChunks = [
        {
          type: 'response.delta',
          delta: { output_text: 'Response' }
        },
        {
          type: 'response.delta',
          delta: { output_text: ' text' }
        },
        {
          type: 'response.done',
          response: {
            status: 'completed',
            model: 'gpt-5',
            usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 }
          }
        }
      ];

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          for (const chunk of mockStreamChunks) {
            yield chunk;
          }
        }
      };

      const mockCreate = vi.fn().mockResolvedValue(mockStream);

      OpenAI.mockImplementation(() => ({
        chat: { completions: { create: mockCreate } },
        responses: { create: mockCreate }
      }));

      const messages = [{ role: 'user', content: 'Test' }];
      const result = await openaiProvider.invoke(messages, {
        config: validConfig,
        model: 'gpt-5', // GPT-5 uses Responses API by default
        stream: true
      });

      // Collect all events from the stream
      const events = [];
      for await (const event of result) {
        events.push(event);
      }

      // Verify event structure for Responses API
      expect(events).toHaveLength(5); // start, 2 deltas, usage, end
      
      expect(events[0]).toMatchObject({
        type: 'start',
        model: 'gpt-5',
        api_type: 'Responses API'
      });

      expect(events[1]).toMatchObject({
        type: 'delta',
        content: 'Response'
      });

      expect(events[2]).toMatchObject({
        type: 'delta',
        content: ' text'
      });

      expect(events[4]).toMatchObject({
        type: 'end',
        content: 'Response text',
        stop_reason: 'completed',
        metadata: {
          model: 'gpt-5',
          api_type: 'Responses API'
        }
      });
    });

    it('should handle streaming errors gracefully', async () => {
      const OpenAI = (await import('openai')).default;
      
      const streamError = Object.assign(new Error('Stream error'), {
        type: 'rate_limit_error',
        code: 'rate_limit_exceeded'
      });

      const mockCreate = vi.fn().mockRejectedValue(streamError);

      OpenAI.mockImplementation(() => ({
        chat: { completions: { create: mockCreate } },
        responses: { create: mockCreate }
      }));

      const messages = [{ role: 'user', content: 'Test' }];
      const result = await openaiProvider.invoke(messages, {
        config: validConfig,
        stream: true
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
        usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 }
      });

      OpenAI.mockImplementation(() => ({
        chat: { completions: { create: mockCreate } },
        responses: { create: mockCreate }
      }));

      // Temporarily modify a model to not support streaming
      const originalModels = openaiProvider.getSupportedModels();
      const testModel = { ...originalModels['gpt-4o'], supportsStreaming: false };
      originalModels['gpt-4o'] = testModel;

      const messages = [{ role: 'user', content: 'Test' }];
      const result = await openaiProvider.invoke(messages, {
        config: validConfig,
        model: 'gpt-4o',
        stream: true
      });

      // Should return regular response object, not AsyncGenerator
      expect(typeof result[Symbol.asyncIterator]).toBe('undefined');
      expect(result).toMatchObject({
        content: 'Non-streaming response',
        stop_reason: 'completed'
      });

      // Verify stream was set to false in the request
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ stream: false })
      );

      // Restore original model config
      originalModels['gpt-4o'] = { ...originalModels['gpt-4o'], supportsStreaming: true };
    });

    it('should include usage reporting for Chat Completions API streaming', async () => {
      const OpenAI = (await import('openai')).default;
      
      const mockStreamChunks = [
        {
          choices: [{ delta: { content: 'test' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        }
      ];

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          for (const chunk of mockStreamChunks) {
            yield chunk;
          }
        }
      };

      const mockChatCreate = vi.fn().mockResolvedValue(mockStream);
      const mockResponsesCreate = vi.fn().mockResolvedValue(mockStream);

      OpenAI.mockImplementation(() => ({
        chat: { completions: { create: mockChatCreate } },
        responses: { create: mockResponsesCreate }
      }));

      // Temporarily modify model to not support Responses API to force Chat Completions API
      const originalModels = openaiProvider.getSupportedModels();
      const testModel = { ...originalModels['gpt-4o'], supportsResponsesAPI: false };
      originalModels['gpt-4o'] = testModel;

      try {
        const messages = [{ role: 'user', content: 'Test' }];
        const result = await openaiProvider.invoke(messages, {
          config: validConfig,
          model: 'gpt-4o', // Now forces Chat Completions API
          stream: true
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
            stream_options: { include_usage: true }
          })
        );
        
        // Verify Responses API was not called
        expect(mockResponsesCreate).not.toHaveBeenCalled();
      } finally {
        // Restore original model config
        originalModels['gpt-4o'] = { ...originalModels['gpt-4o'], supportsResponsesAPI: true };
      }
    });
  });
});
