/**
 * Mistral Provider Tests
 *
 * Tests the Mistral provider implementation with mocked SDK.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCodes, StopReasons } from '../../../src/providers/interface.js';

// Create mock before any imports
const mockChatComplete = vi.fn();

// Mock the Mistral SDK
vi.mock('@mistralai/mistralai', () => {
  const MockMistral = function (config) {
    this.apiKey = config.apiKey;

    this.chat = {
      complete: mockChatComplete,
    };
  };

  return {
    default: MockMistral,
    Mistral: MockMistral,
  };
});

// Import provider AFTER setting up the mock
import { mistralProvider } from '../../../src/providers/mistral.js';

describe('Mistral Provider', () => {
  let mockConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    mockChatComplete.mockClear();

    mockConfig = {
      apiKeys: {
        mistral: 'test-mistral-api-key-1234567890abcdefghijklmnopqrstuvwxyz',
      },
    };
  });

  describe('Configuration', () => {
    it('should validate configuration with valid API key', () => {
      expect(mistralProvider.validateConfig(mockConfig)).toBe(true);
    });

    it('should reject configuration without API key', () => {
      expect(mistralProvider.validateConfig({})).toBe(false);
      expect(mistralProvider.validateConfig({ apiKeys: {} })).toBe(false);
    });

    it('should reject configuration with invalid API key format', () => {
      const invalidConfigs = [
        { apiKeys: { mistral: '' } },
        { apiKeys: { mistral: 123 } },
      ];

      invalidConfigs.forEach((config) => {
        expect(mistralProvider.validateConfig(config)).toBe(false);
      });
    });

    it('should check availability same as config validation', () => {
      expect(mistralProvider.isAvailable(mockConfig)).toBe(true);
      expect(mistralProvider.isAvailable({})).toBe(false);
    });
  });

  describe('Model Management', () => {
    it('should return supported models', () => {
      const models = mistralProvider.getSupportedModels();

      expect(models).toBeDefined();
      expect(Object.keys(models).length).toBeGreaterThan(0);

      // Check for expected models
      expect(models['magistral-medium-2509']).toBeDefined();
      expect(models['magistral-small-2509']).toBeDefined();
      expect(models['mistral-medium-2508']).toBeDefined();
    });

    it('should get model config by exact name', () => {
      const config = mistralProvider.getModelConfig('mistral-medium-2508');

      expect(config).toBeDefined();
      expect(config.modelName).toBe('mistral-medium-2508');
      expect(config.contextWindow).toBe(128000);
      expect(config.maxOutputTokens).toBe(32768);
      expect(config.supportsImages).toBe(true);
    });

    it('should get model config by alias', () => {
      const config = mistralProvider.getModelConfig('magistral-medium');

      expect(config).toBeDefined();
      expect(config.modelName).toBe('magistral-medium-2509');
    });

    it('should handle case-insensitive model names', () => {
      const config = mistralProvider.getModelConfig('MAGISTRAL-SMALL-2509');

      expect(config).toBeDefined();
      expect(config.modelName).toBe('magistral-small-2509');
    });

    it('should return null for unknown model', () => {
      const config = mistralProvider.getModelConfig('unknown-model');
      expect(config).toBeNull();
    });
  });

  describe('Message Invocation', () => {
    let mockResponse;

    beforeEach(() => {
      mockResponse = {
        choices: [
          {
            message: {
              content: 'Test response',
              role: 'assistant',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
        model: 'magistral-medium-2509',
      };

      mockChatComplete.mockResolvedValue(mockResponse);
    });

    it('should invoke with basic messages', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];

      const result = await mistralProvider.invoke(messages, {
        config: mockConfig,
      });

      expect(mockChatComplete).toHaveBeenCalled();
      const callArgs = mockChatComplete.mock.calls[0][0];
      expect(callArgs.messages).toEqual(messages);
      expect(callArgs.model).toBe('magistral-medium-2509');

      expect(result).toMatchObject({
        content: 'Test response',
        stop_reason: StopReasons.STOP,
        metadata: {
          model: 'magistral-medium-2509',
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            total_tokens: 30,
          },
          provider: 'mistral',
        },
      });
    });

    it('should handle image content', async () => {
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

      await mistralProvider.invoke(messages, {
        model: 'mistral-medium-2508',
        config: mockConfig,
      });

      const callArgs = mockChatComplete.mock.calls[0][0];
      expect(callArgs.messages[0].content).toEqual([
        { type: 'text', text: 'What is this?' },
        {
          type: 'image_url',
          imageUrl: 'data:image/jpeg;base64,base64data',
        },
      ]);
    });

    it('should handle custom parameters', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];

      await mistralProvider.invoke(messages, {
        model: 'mistral-small-latest',
        temperature: 0.5,
        maxTokens: 2000,
        config: mockConfig,
      });

      const callArgs = mockChatComplete.mock.calls[0][0];
      expect(callArgs.model).toBe('mistral-small-latest');
      expect(callArgs.temperature).toBe(0.5);
      expect(callArgs.max_tokens).toBe(2000);
    });

    it('should cap max tokens to model limit', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];

      await mistralProvider.invoke(messages, {
        model: 'magistral-small-2509',
        maxTokens: 100000,
        config: mockConfig,
      });

      const callArgs = mockChatComplete.mock.calls[0][0];
      expect(callArgs.max_tokens).toBe(32768); // Model's max
    });

    // Note: All current Mistral models support images after the September 2025 update
    // Keeping the test as a placeholder for potential future non-image models
    it.skip('should reject image content for models that do not support it', async () => {
      // This test would be enabled if we add any models that don't support images
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

      // Example with hypothetical non-image model
      await expect(
        mistralProvider.invoke(messages, {
          model: 'hypothetical-text-only-model',
          config: mockConfig,
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.INVALID_REQUEST,
        message: expect.stringContaining('does not support images'),
      });
    });
  });

  describe('Stop Reason Mapping', () => {
    const testCases = [
      ['stop', StopReasons.STOP],
      ['length', StopReasons.LENGTH],
      ['model_length', StopReasons.LENGTH],
      ['tool_calls', StopReasons.TOOL_USE],
    ];

    testCases.forEach(([mistralReason, expectedReason]) => {
      it(`should map finish_reason "${mistralReason}" to "${expectedReason}"`, async () => {
        mockChatComplete.mockResolvedValue({
          choices: [
            {
              message: { content: 'Test', role: 'assistant' },
              finish_reason: mistralReason,
            },
          ],
          usage: {},
        });

        const result = await mistralProvider.invoke(
          [{ role: 'user', content: 'Hello' }],
          { config: mockConfig },
        );

        expect(result.stop_reason).toBe(expectedReason);
      });
    });

    it('should map unknown stop reason to OTHER', async () => {
      mockChatComplete.mockResolvedValue({
        choices: [
          {
            message: { content: 'Test', role: 'assistant' },
            finish_reason: 'unknown_reason',
          },
        ],
        usage: {},
      });

      const result = await mistralProvider.invoke(
        [{ role: 'user', content: 'Hello' }],
        { config: mockConfig },
      );

      expect(result.stop_reason).toBe(StopReasons.OTHER);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing API key', async () => {
      await expect(
        mistralProvider.invoke([{ role: 'user', content: 'Hello' }], {
          config: {},
        }),
      ).rejects.toThrow('Mistral API key not configured');
    });

    it('should validate message format', async () => {
      await expect(
        mistralProvider.invoke('not an array', {
          config: mockConfig,
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.INVALID_MESSAGES,
        message: 'Messages must be an array',
      });
    });

    it('should validate individual messages', async () => {
      await expect(
        mistralProvider.invoke([null], {
          config: mockConfig,
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.INVALID_MESSAGE,
        message: expect.stringContaining(
          'Message at index 0 must be an object',
        ),
      });
    });

    it('should validate message roles', async () => {
      await expect(
        mistralProvider.invoke([{ role: 'invalid', content: 'test' }], {
          config: mockConfig,
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.INVALID_ROLE,
        message: expect.stringContaining('Invalid role "invalid"'),
      });
    });

    it('should validate message content', async () => {
      await expect(
        mistralProvider.invoke([{ role: 'user' }], {
          config: mockConfig,
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.MISSING_CONTENT,
        message: expect.stringContaining('Message content is required'),
      });
    });

    it('should handle no response choice', async () => {
      mockChatComplete.mockResolvedValue({
        choices: [],
        usage: {},
      });

      await expect(
        mistralProvider.invoke([{ role: 'user', content: 'Hello' }], {
          config: mockConfig,
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.NO_RESPONSE_CHOICE,
        message: 'No response choice received from Mistral',
      });
    });

    it('should handle no response content', async () => {
      mockChatComplete.mockResolvedValue({
        choices: [
          {
            message: { role: 'assistant' },
            finish_reason: 'stop',
          },
        ],
        usage: {},
      });

      await expect(
        mistralProvider.invoke([{ role: 'user', content: 'Hello' }], {
          config: mockConfig,
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.NO_RESPONSE_CONTENT,
        message: 'No content in response from Mistral',
      });
    });

    it('should handle API errors', async () => {
      const errorCases = [
        {
          status: 401,
          expectedCode: ErrorCodes.INVALID_API_KEY,
          expectedMessage: 'Invalid Mistral API key',
        },
        {
          status: 429,
          expectedCode: ErrorCodes.RATE_LIMIT_EXCEEDED,
          expectedMessage: 'rate limit exceeded',
        },
        {
          status: 403,
          expectedCode: ErrorCodes.QUOTA_EXCEEDED,
          expectedMessage: 'quota exceeded',
        },
      ];

      for (const { status, expectedCode, expectedMessage } of errorCases) {
        mockChatComplete.mockRejectedValueOnce({ status });

        await expect(
          mistralProvider.invoke([{ role: 'user', content: 'Hello' }], {
            config: mockConfig,
          }),
        ).rejects.toMatchObject({
          code: expectedCode,
          message: expect.stringContaining(expectedMessage),
        });
      }
    });

    it('should handle invalid request errors', async () => {
      mockChatComplete.mockRejectedValue({
        message: 'Invalid request: bad parameter',
      });

      await expect(
        mistralProvider.invoke([{ role: 'user', content: 'Hello' }], {
          config: mockConfig,
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.INVALID_REQUEST,
        message: expect.stringContaining('Invalid request'),
      });
    });

    it('should handle model not found errors', async () => {
      mockChatComplete.mockRejectedValue({
        message: 'Model unknown-model not found',
      });

      await expect(
        mistralProvider.invoke([{ role: 'user', content: 'Hello' }], {
          model: 'unknown-model',
          config: mockConfig,
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.MODEL_NOT_FOUND,
        message: expect.stringContaining('Model unknown-model not found'),
      });
    });

    it('should handle context length errors', async () => {
      mockChatComplete.mockRejectedValue({
        message: 'Context length exceeded',
      });

      await expect(
        mistralProvider.invoke([{ role: 'user', content: 'Hello' }], {
          config: mockConfig,
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.CONTEXT_LENGTH_EXCEEDED,
        message: 'Context length exceeded for model',
      });
    });
  });
});
