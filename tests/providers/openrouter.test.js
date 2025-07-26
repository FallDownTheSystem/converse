/**
 * OpenRouter Provider Tests
 *
 * Tests the OpenRouter provider implementation (OpenAI-compatible).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCodes, StopReasons } from '../../src/providers/interface.js';

// Mock the OpenAI module
const mockCreate = vi.fn();

vi.mock('openai', () => {
  const mockOpenAI = vi.fn(() => ({
    chat: {
      completions: {
        create: mockCreate
      }
    }
  }));

  return {
    default: mockOpenAI
  };
});

// Import provider AFTER setting up the mock
import { openrouterProvider } from '../../src/providers/openrouter.js';

describe('OpenRouter Provider', () => {
  let mockConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockClear();

    mockConfig = {
      apiKeys: {
        openrouter: 'sk-or-test-1234567890abcdefghijklmnopqrstuvwxyz1234'
      },
      providers: {
        openrouterReferer: 'https://test.example.com'
      }
    };
  });

  describe('Configuration', () => {
    it('should validate configuration with valid API key', () => {
      expect(openrouterProvider.validateConfig(mockConfig)).toBe(true);
    });

    it('should reject configuration without API key', () => {
      expect(openrouterProvider.validateConfig({})).toBe(false);
      expect(openrouterProvider.validateConfig({ apiKeys: {} })).toBe(false);
    });

    it('should reject configuration with invalid API key format', () => {
      const invalidConfigs = [
        { apiKeys: { openrouter: '' } },
        { apiKeys: { openrouter: 'invalid-key' } },
        { apiKeys: { openrouter: 'sk-or-short' } },
        { apiKeys: { openrouter: 'wrong-prefix-1234567890abcdefghijklmnopqrstuvwxyz' } },
        { apiKeys: { openrouter: 123 } }
      ];

      invalidConfigs.forEach(config => {
        expect(openrouterProvider.validateConfig(config)).toBe(false);
      });
    });

    it('should check availability same as config validation', () => {
      expect(openrouterProvider.isAvailable(mockConfig)).toBe(true);
      expect(openrouterProvider.isAvailable({})).toBe(false);
    });
  });

  describe('Model Management', () => {
    it('should return supported models', () => {
      const models = openrouterProvider.getSupportedModels();

      expect(models).toBeDefined();
      expect(Object.keys(models).length).toBeGreaterThan(0);

      // Check for expected models
      expect(models['qwen/qwen3-235b-a22b-thinking-2507']).toBeDefined();
      expect(models['qwen/qwen3-coder']).toBeDefined();
      expect(models['moonshotai/kimi-k2']).toBeDefined();
    });

    it('should get model config by exact name', () => {
      const config = openrouterProvider.getModelConfig('qwen/qwen3-235b-a22b-thinking-2507');

      expect(config).toBeDefined();
      expect(config.modelName).toBe('qwen/qwen3-235b-a22b-thinking-2507');
      expect(config.contextWindow).toBe(32768);
      expect(config.maxOutputTokens).toBe(8192);
      expect(config.supportsImages).toBe(false);
      expect(config.supportsThinking).toBe(true);
    });

    it('should get model config by alias', () => {
      const config = openrouterProvider.getModelConfig('qwen3-thinking');

      expect(config).toBeDefined();
      expect(config.modelName).toBe('qwen/qwen3-235b-a22b-thinking-2507');
    });

    it('should handle case-insensitive model names', () => {
      const config = openrouterProvider.getModelConfig('MOONSHOTAI/KIMI-K2');

      expect(config).toBeDefined();
      expect(config.modelName).toBe('moonshotai/kimi-k2');
    });

    it('should return null for unknown model', () => {
      const config = openrouterProvider.getModelConfig('unknown-model');
      expect(config).toBeNull();
    });
  });

  describe('Message Invocation', () => {
    let mockResponse;

    beforeEach(() => {
      mockResponse = {
        id: 'chatcmpl-openrouter-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'qwen/qwen3-235b-a22b-thinking-2507',
        provider: 'qwen',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Test response'
          },
          finish_reason: 'stop',
          logprobs: null
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
          prompt_cost: 0.001,
          completion_cost: 0.002,
          total_cost: 0.003
        }
      };

      mockCreate.mockResolvedValue(mockResponse);
    });

    it('should invoke with basic messages', async () => {
      const messages = [
        { role: 'user', content: 'Hello' }
      ];

      const result = await openrouterProvider.invoke(messages, {
        config: mockConfig
      });

      expect(mockCreate).toHaveBeenCalled();
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages).toEqual(messages);
      expect(callArgs.model).toBe('qwen/qwen3-235b-a22b-thinking-2507');

      expect(result).toMatchObject({
        content: 'Test response',
        stop_reason: StopReasons.STOP,
        metadata: {
          model: 'qwen/qwen3-235b-a22b-thinking-2507',
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            total_tokens: 30
          },
          provider: 'openrouter',
          request_id: 'chatcmpl-openrouter-123',
          actual_provider: 'qwen',
          prompt_cost: 0.001,
          completion_cost: 0.002,
          total_cost: 0.003
        }
      });
    });

    it('should reject invocation without referer header', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];

      await expect(
        openrouterProvider.invoke(messages, {
          config: {
            apiKeys: { openrouter: 'sk-or-test-1234567890abcdefghijklmnopqrstuvwxyz1234' }
            // Missing providers.openrouterReferer
          }
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.INVALID_REQUEST,
        message: expect.stringContaining('OpenRouter requires HTTP-Referer header')
      });
    });

    it('should handle custom parameters', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];

      await openrouterProvider.invoke(messages, {
        model: 'qwen/qwen3-coder',
        temperature: 0.5,
        maxTokens: 2000,
        config: mockConfig
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.model).toBe('qwen/qwen3-coder');
      expect(callArgs.temperature).toBe(0.5);
      expect(callArgs.max_tokens).toBe(2000);
      expect(callArgs.top_p).toBe(1); // Default from provider
    });

    it('should include optional title header when provided', async () => {
      const configWithTitle = {
        ...mockConfig,
        providers: {
          ...mockConfig.providers,
          openrouterTitle: 'Test Application'
        }
      };

      await openrouterProvider.invoke(
        [{ role: 'user', content: 'Hello' }],
        { config: configWithTitle }
      );

      expect(mockCreate).toHaveBeenCalled();
    });

    it('should cap max tokens to model limit', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];

      await openrouterProvider.invoke(messages, {
        model: 'moonshotai/kimi-k2',
        maxTokens: 10000,
        config: mockConfig
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.max_tokens).toBe(8192); // Model's max
    });

    it('should handle models that do not support images', async () => {
      const messages = [{
        role: 'user',
        content: [
          { type: 'text', text: 'What is this?' },
          {
            type: 'image',
            source: {
              media_type: 'image/jpeg',
              data: 'base64data'
            }
          }
        ]
      }];

      await expect(
        openrouterProvider.invoke(messages, {
          model: 'qwen/qwen3-coder',
          config: mockConfig
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.INVALID_REQUEST,
        message: expect.stringContaining('does not support images')
      });
    });
  });

  describe('Stop Reason Mapping', () => {
    const testCases = [
      ['stop', StopReasons.STOP],
      ['length', StopReasons.LENGTH],
      ['content_filter', StopReasons.CONTENT_FILTER],
      ['function_call', StopReasons.TOOL_USE],
      ['tool_calls', StopReasons.TOOL_USE]
    ];

    testCases.forEach(([openaiReason, expectedReason]) => {
      it(`should map finish_reason "${openaiReason}" to "${expectedReason}"`, async () => {
        mockCreate.mockResolvedValue({
          choices: [{
            message: { content: 'Test', role: 'assistant' },
            finish_reason: openaiReason
          }],
          usage: {},
          model: 'qwen/qwen3-235b-a22b-thinking-2507'
        });

        const result = await openrouterProvider.invoke(
          [{ role: 'user', content: 'Hello' }],
          { config: mockConfig }
        );

        expect(result.stop_reason).toBe(expectedReason);
      });
    });

    it('should map unknown stop reason to OTHER', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: { content: 'Test', role: 'assistant' },
          finish_reason: 'unknown_reason'
        }],
        usage: {},
        model: 'anthropic/claude-3.5-sonnet'
      });

      const result = await openrouterProvider.invoke(
        [{ role: 'user', content: 'Hello' }],
        { config: mockConfig }
      );

      expect(result.stop_reason).toBe(StopReasons.OTHER);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing API key', async () => {
      await expect(
        openrouterProvider.invoke([{ role: 'user', content: 'Hello' }], {
          config: { providers: { openrouterReferer: 'https://test.com' } }
        })
      ).rejects.toThrow('OpenRouter API key not configured');
    });

    it('should handle API errors', async () => {
      const errorCases = [
        {
          status: 401,
          data: { error: { message: 'Invalid API key' } },
          expectedCode: ErrorCodes.INVALID_API_KEY,
          expectedMessage: 'Invalid OpenRouter API key'
        },
        {
          status: 429,
          data: { error: { message: 'Rate limit exceeded' } },
          expectedCode: ErrorCodes.RATE_LIMIT_EXCEEDED,
          expectedMessage: 'rate limit exceeded'
        },
        {
          status: 403,
          data: { error: { message: 'Quota exceeded' } },
          expectedCode: ErrorCodes.QUOTA_EXCEEDED,
          expectedMessage: 'quota exceeded'
        }
      ];

      for (const { status, data, expectedCode, expectedMessage } of errorCases) {
        mockCreate.mockRejectedValueOnce({
          response: { status, data }
        });

        await expect(
          openrouterProvider.invoke([{ role: 'user', content: 'Hello' }], {
            config: mockConfig
          })
        ).rejects.toMatchObject({
          code: expectedCode,
          message: expect.stringContaining(expectedMessage)
        });
      }
    });

    it('should handle model not found errors', async () => {
      mockCreate.mockRejectedValue({
        response: {
          status: 404,
          data: { error: { message: 'Model unknown/model not found' } }
        }
      });

      await expect(
        openrouterProvider.invoke([{ role: 'user', content: 'Hello' }], {
          model: 'unknown/model',
          config: mockConfig
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.MODEL_NOT_FOUND,
        message: expect.stringContaining('Model unknown/model not found')
      });
    });

    it('should handle context length errors', async () => {
      mockCreate.mockRejectedValue({
        response: {
          status: 400,
          data: { error: { message: 'Context length exceeded' } }
        }
      });

      await expect(
        openrouterProvider.invoke([{ role: 'user', content: 'Hello' }], {
          config: mockConfig
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.CONTEXT_LENGTH_EXCEEDED,
        message: 'Context length exceeded for model'
      });
    });

    it('should handle no response choice', async () => {
      mockCreate.mockResolvedValue({
        choices: [],
        usage: {}
      });

      await expect(
        openrouterProvider.invoke([{ role: 'user', content: 'Hello' }], {
          config: mockConfig
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.NO_RESPONSE_CHOICE,
        message: 'No response choice received'
      });
    });

    it('should handle no response content', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: { role: 'assistant' },
          finish_reason: 'stop'
        }],
        usage: {}
      });

      await expect(
        openrouterProvider.invoke([{ role: 'user', content: 'Hello' }], {
          config: mockConfig
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.NO_RESPONSE_CONTENT,
        message: 'No content in response'
      });
    });
  });
});
