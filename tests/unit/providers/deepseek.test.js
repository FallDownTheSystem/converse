/**
 * DeepSeek Provider Tests
 *
 * Tests the DeepSeek provider implementation (OpenAI-compatible).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCodes, StopReasons } from '../../../src/providers/interface.js';

// Mock the OpenAI module
const mockCreate = vi.fn();

vi.mock('openai', () => {
  const mockOpenAI = vi.fn(function () {
    return {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    };
  });

  return {
    default: mockOpenAI,
  };
});

// Import provider AFTER setting up the mock
import OpenAI from 'openai';
import { deepseekProvider } from '../../../src/providers/deepseek.js';

/**
 * Build an async iterable of streaming chunks for the mocked SDK.
 */
async function* streamOf(chunks) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

/**
 * Drain a streaming generator into an array of events.
 */
async function collect(generator) {
  const events = [];
  for await (const event of generator) {
    events.push(event);
  }
  return events;
}

describe('DeepSeek Provider', () => {
  let mockConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockClear();

    mockConfig = {
      apiKeys: {
        deepseek: 'test-deepseek-api-key-1234567890abcdefghijklmnopqrstuvwxyz',
      },
    };
  });

  describe('Configuration', () => {
    it('should validate configuration with valid API key', () => {
      expect(deepseekProvider.validateConfig(mockConfig)).toBe(true);
    });

    it('should reject configuration without API key', () => {
      expect(deepseekProvider.validateConfig({})).toBe(false);
      expect(deepseekProvider.validateConfig({ apiKeys: {} })).toBe(false);
    });

    it('should reject configuration with invalid API key format', () => {
      const invalidConfigs = [
        { apiKeys: { deepseek: '' } },
        { apiKeys: { deepseek: 'short-key' } },
        { apiKeys: { deepseek: 123 } },
      ];

      invalidConfigs.forEach((config) => {
        expect(deepseekProvider.validateConfig(config)).toBe(false);
      });
    });

    it('should check availability same as config validation', () => {
      expect(deepseekProvider.isAvailable(mockConfig)).toBe(true);
      expect(deepseekProvider.isAvailable({})).toBe(false);
    });
  });

  describe('Model Catalog', () => {
    it('should advertise exactly the two curated V4 models', () => {
      const models = deepseekProvider.getSupportedModels();

      expect(Object.keys(models)).toEqual([
        'deepseek-v4-pro',
        'deepseek-v4-flash',
      ]);
    });

    it('should default to deepseek-v4-pro (first catalog key)', () => {
      const models = deepseekProvider.getSupportedModels();

      // The shared base uses the first catalog key as the default model.
      expect(Object.keys(models)[0]).toBe('deepseek-v4-pro');
    });

    it('should not advertise the retired legacy models', () => {
      const models = deepseekProvider.getSupportedModels();

      expect(models['deepseek-chat']).toBeUndefined();
      expect(models['deepseek-reasoner']).toBeUndefined();
    });

    it('should carry the updated V4 capability metadata', () => {
      const config = deepseekProvider.getModelConfig('deepseek-v4-pro');

      expect(config).toBeDefined();
      expect(config.modelName).toBe('deepseek-v4-pro');
      expect(config.contextWindow).toBe(1000000);
      expect(config.maxOutputTokens).toBe(384000);
      expect(config.supportsImages).toBe(false);
      expect(config.supportsReasoning).toBe(true);
      expect(config.supportsWebSearch).toBe(false);
    });

    it('should resolve curated aliases to canonical IDs', () => {
      expect(deepseekProvider.getModelConfig('deepseek').modelName).toBe(
        'deepseek-v4-pro',
      );
      expect(deepseekProvider.getModelConfig('deepseek-pro').modelName).toBe(
        'deepseek-v4-pro',
      );
      expect(deepseekProvider.getModelConfig('deepseek-flash').modelName).toBe(
        'deepseek-v4-flash',
      );
    });

    it('should handle case-insensitive model names', () => {
      const config = deepseekProvider.getModelConfig('DEEPSEEK-V4-PRO');

      expect(config).toBeDefined();
      expect(config.modelName).toBe('deepseek-v4-pro');
    });

    it('should return null for unknown model', () => {
      const config = deepseekProvider.getModelConfig('unknown-model');
      expect(config).toBeNull();
    });
  });

  describe('Provider configuration', () => {
    beforeEach(() => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { role: 'assistant', content: 'ok' },
            finish_reason: 'stop',
          },
        ],
        usage: {},
        model: 'deepseek-v4-pro',
      });
    });

    it('should construct the client with the bare baseURL (no /v1)', async () => {
      await deepseekProvider.invoke([{ role: 'user', content: 'Hello' }], {
        config: mockConfig,
      });

      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'https://api.deepseek.com' }),
      );
    });

    it('should not send the deprecated frequency/presence penalties', async () => {
      await deepseekProvider.invoke([{ role: 'user', content: 'Hello' }], {
        config: mockConfig,
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.top_p).toBe(0.95);
      expect(callArgs).not.toHaveProperty('frequency_penalty');
      expect(callArgs).not.toHaveProperty('presence_penalty');
    });
  });

  describe('Reasoning request mapping', () => {
    beforeEach(() => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { role: 'assistant', content: 'answer' },
            finish_reason: 'stop',
          },
        ],
        usage: {},
        model: 'deepseek-v4-pro',
      });
    });

    async function invokeWithEffort(reasoning_effort) {
      await deepseekProvider.invoke([{ role: 'user', content: 'Hello' }], {
        model: 'deepseek-v4-pro',
        reasoning_effort,
        config: mockConfig,
      });
      return mockCreate.mock.calls[0][0];
    }

    it('should disable thinking and omit reasoning_effort for "none"', async () => {
      const callArgs = await invokeWithEffort('none');
      expect(callArgs.thinking).toEqual({ type: 'disabled' });
      expect(callArgs).not.toHaveProperty('reasoning_effort');
    });

    it.each(['minimal', 'low', 'medium', 'high'])(
      'should enable thinking with reasoning_effort "high" for "%s"',
      async (level) => {
        const callArgs = await invokeWithEffort(level);
        expect(callArgs.thinking).toEqual({ type: 'enabled' });
        expect(callArgs.reasoning_effort).toBe('high');
      },
    );

    it.each(['xhigh', 'max'])(
      'should enable thinking with reasoning_effort "max" for "%s"',
      async (level) => {
        const callArgs = await invokeWithEffort(level);
        expect(callArgs.thinking).toEqual({ type: 'enabled' });
        expect(callArgs.reasoning_effort).toBe('max');
      },
    );

    it('should default (no explicit effort) to thinking-on with "high"', async () => {
      // The shared base defaults reasoning_effort to 'medium' when unspecified.
      await deepseekProvider.invoke([{ role: 'user', content: 'Hello' }], {
        model: 'deepseek-v4-pro',
        config: mockConfig,
      });
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.thinking).toEqual({ type: 'enabled' });
      expect(callArgs.reasoning_effort).toBe('high');
    });

    it('should attach NO reasoning fields for an unknown pass-through ID', async () => {
      await deepseekProvider.invoke([{ role: 'user', content: 'Hello' }], {
        model: 'deepseek-chat', // retired ID, no catalog capability metadata
        reasoning_effort: 'high',
        config: mockConfig,
      });
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.model).toBe('deepseek-chat'); // passthrough unchanged
      expect(callArgs).not.toHaveProperty('thinking');
      expect(callArgs).not.toHaveProperty('reasoning_effort');
    });
  });

  describe('Message Invocation', () => {
    let mockResponse;

    beforeEach(() => {
      mockResponse = {
        id: 'chatcmpl-test123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'deepseek-v4-pro',
        system_fingerprint: 'fp_test123',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Test response',
            },
            finish_reason: 'stop',
            logprobs: null,
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);
    });

    it('should invoke with basic messages', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];

      const result = await deepseekProvider.invoke(messages, {
        config: mockConfig,
      });

      expect(mockCreate).toHaveBeenCalled();
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages).toEqual(messages);
      expect(callArgs.model).toBe('deepseek-v4-pro');

      expect(result).toMatchObject({
        content: 'Test response',
        stop_reason: StopReasons.STOP,
        metadata: {
          model: 'deepseek-v4-pro',
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            total_tokens: 30,
          },
          provider: 'deepseek',
          system_fingerprint: 'fp_test123',
        },
      });
    });

    it('should cap max tokens to model limit', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];

      await deepseekProvider.invoke(messages, {
        model: 'deepseek-v4-pro',
        maxTokens: 500000,
        config: mockConfig,
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.max_tokens).toBe(384000); // Model's max
    });

    it('should reject image content since DeepSeek does not support images', async () => {
      const messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is this?' },
            {
              type: 'image',
              source: {
                media_type: 'image/jpeg',
                data: 'base64data',
              },
            },
          ],
        },
      ];

      await expect(
        deepseekProvider.invoke(messages, {
          config: mockConfig,
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.INVALID_REQUEST,
        message: expect.stringContaining('does not support images'),
      });
    });
  });

  describe('Reasoning content handling', () => {
    it('should capture non-streaming reasoning_content without dropping the answer', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Final answer.',
              reasoning_content: 'Step-by-step chain of thought.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {},
        model: 'deepseek-v4-pro',
      });

      const result = await deepseekProvider.invoke(
        [{ role: 'user', content: 'Hello' }],
        { model: 'deepseek-v4-pro', config: mockConfig },
      );

      expect(result.content).toBe('Final answer.');
      expect(result.metadata.reasoning_content).toBe(
        'Step-by-step chain of thought.',
      );
    });

    it('should accept an empty-content turn that carries reasoning_content', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              reasoning_content: 'I reasoned but produced no visible text yet.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {},
        model: 'deepseek-v4-pro',
      });

      const result = await deepseekProvider.invoke(
        [{ role: 'user', content: 'Hello' }],
        { model: 'deepseek-v4-pro', config: mockConfig },
      );

      expect(result.content).toBe('');
      expect(result.metadata.reasoning_content).toBe(
        'I reasoned but produced no visible text yet.',
      );
    });

    it('should emit streamed delta.reasoning_content as thinking events before content', async () => {
      mockCreate.mockResolvedValue(
        streamOf([
          {
            choices: [
              { delta: { reasoning_content: 'thinking part' }, finish_reason: null },
            ],
          },
          {
            choices: [{ delta: { content: 'answer part' }, finish_reason: 'stop' }],
          },
          {
            choices: [],
            usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
          },
        ]),
      );

      const generator = await deepseekProvider.invoke(
        [{ role: 'user', content: 'Hello' }],
        { model: 'deepseek-v4-pro', stream: true, config: mockConfig },
      );
      const events = await collect(generator);

      const thinking = events.filter((e) => e.type === 'thinking');
      const deltas = events.filter((e) => e.type === 'delta');
      expect(thinking).toHaveLength(1);
      expect(thinking[0].content).toBe('thinking part');
      expect(deltas).toHaveLength(1);
      expect(deltas[0].content).toBe('answer part');

      // Reasoning must arrive before the answer text.
      const thinkingIndex = events.findIndex((e) => e.type === 'thinking');
      const deltaIndex = events.findIndex((e) => e.type === 'delta');
      expect(thinkingIndex).toBeLessThan(deltaIndex);
    });
  });

  describe('Stop Reason Mapping', () => {
    const testCases = [
      ['stop', StopReasons.STOP],
      ['length', StopReasons.LENGTH],
      ['content_filter', StopReasons.CONTENT_FILTER],
      ['function_call', StopReasons.TOOL_USE],
      ['tool_calls', StopReasons.TOOL_USE],
    ];

    testCases.forEach(([openaiReason, expectedReason]) => {
      it(`should map finish_reason "${openaiReason}" to "${expectedReason}"`, async () => {
        mockCreate.mockResolvedValue({
          choices: [
            {
              message: { content: 'Test', role: 'assistant' },
              finish_reason: openaiReason,
            },
          ],
          usage: {},
          model: 'deepseek-v4-pro',
        });

        const result = await deepseekProvider.invoke(
          [{ role: 'user', content: 'Hello' }],
          { config: mockConfig },
        );

        expect(result.stop_reason).toBe(expectedReason);
      });
    });

    it('should map unknown stop reason to OTHER', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { content: 'Test', role: 'assistant' },
            finish_reason: 'unknown_reason',
          },
        ],
        usage: {},
        model: 'deepseek-v4-pro',
      });

      const result = await deepseekProvider.invoke(
        [{ role: 'user', content: 'Hello' }],
        { config: mockConfig },
      );

      expect(result.stop_reason).toBe(StopReasons.OTHER);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing API key', async () => {
      await expect(
        deepseekProvider.invoke([{ role: 'user', content: 'Hello' }], {
          config: {},
        }),
      ).rejects.toThrow('DeepSeek API key not configured');
    });

    it('should handle API errors', async () => {
      const errorCases = [
        {
          status: 401,
          data: { error: { message: 'Invalid API key' } },
          expectedCode: ErrorCodes.INVALID_API_KEY,
          expectedMessage: 'Invalid DeepSeek API key',
        },
        {
          status: 429,
          data: { error: { message: 'Rate limit exceeded' } },
          expectedCode: ErrorCodes.RATE_LIMIT_EXCEEDED,
          expectedMessage: 'rate limit exceeded',
        },
        {
          status: 403,
          data: { error: { message: 'Quota exceeded' } },
          expectedCode: ErrorCodes.QUOTA_EXCEEDED,
          expectedMessage: 'quota exceeded',
        },
      ];

      for (const {
        status,
        data,
        expectedCode,
        expectedMessage,
      } of errorCases) {
        mockCreate.mockRejectedValueOnce({
          response: { status, data },
        });

        await expect(
          deepseekProvider.invoke([{ role: 'user', content: 'Hello' }], {
            config: mockConfig,
          }),
        ).rejects.toMatchObject({
          code: expectedCode,
          message: expect.stringContaining(expectedMessage),
        });
      }
    });

    it('should handle model not found errors', async () => {
      mockCreate.mockRejectedValue({
        response: {
          status: 404,
          data: { error: { message: 'Model unknown-model not found' } },
        },
      });

      await expect(
        deepseekProvider.invoke([{ role: 'user', content: 'Hello' }], {
          model: 'unknown-model',
          config: mockConfig,
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.MODEL_NOT_FOUND,
        message: expect.stringContaining('Model unknown-model not found'),
      });
    });

    it('should handle context length errors', async () => {
      mockCreate.mockRejectedValue({
        response: {
          status: 400,
          data: { error: { message: 'Context length exceeded' } },
        },
      });

      await expect(
        deepseekProvider.invoke([{ role: 'user', content: 'Hello' }], {
          config: mockConfig,
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.CONTEXT_LENGTH_EXCEEDED,
        message: 'Context length exceeded for model',
      });
    });

    it('should handle no response choice', async () => {
      mockCreate.mockResolvedValue({
        choices: [],
        usage: {},
      });

      await expect(
        deepseekProvider.invoke([{ role: 'user', content: 'Hello' }], {
          config: mockConfig,
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.NO_RESPONSE_CHOICE,
        message: 'No response choice received',
      });
    });

    it('should handle no response content', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { role: 'assistant' },
            finish_reason: 'stop',
          },
        ],
        usage: {},
      });

      await expect(
        deepseekProvider.invoke([{ role: 'user', content: 'Hello' }], {
          config: mockConfig,
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.NO_RESPONSE_CONTENT,
        message: 'No content in response',
      });
    });
  });
});
