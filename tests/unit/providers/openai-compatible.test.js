/**
 * OpenAI-Compatible Provider Base Module Tests
 *
 * Tests the factory function that creates providers for OpenAI-compatible APIs.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCodes, StopReasons } from '../../../src/providers/interface.js';

// Mock OpenAI SDK
const mockCreate = vi.fn();
const mockOpenAIInstances = [];

vi.mock('openai', () => {
  const mockOpenAI = vi.fn((config) => {
    const instance = {
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      defaultHeaders: config.defaultHeaders,
      timeout: config.timeout,
      chat: {
        completions: {
          create: mockCreate
        }
      }
    };
    mockOpenAIInstances.push({ config, instance });
    return instance;
  });

  return {
    default: mockOpenAI
  };
});

// Import after mocking
import { createOpenAICompatibleProvider, retryWithBackoff } from '../../../src/providers/openai-compatible.js';

describe('OpenAI-Compatible Provider Base Module', () => {
  let provider;
  let mockConfig;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCreate.mockClear();
    mockOpenAIInstances.length = 0;

    mockConfig = {
      baseURL: 'https://api.example.com/v1',
      providerName: 'TestProvider',
      supportedModels: {
        'test-model-1': {
          modelName: 'test-model-1',
          friendlyName: 'Test Model 1',
          contextWindow: 8192,
          maxOutputTokens: 4096,
          supportsStreaming: true,
          supportsImages: true,
          supportsTemperature: true,
          timeout: 60000,
          description: 'Test model 1',
          aliases: ['test-1', 'model-1']
        },
        'test-model-2': {
          modelName: 'test-model-2',
          friendlyName: 'Test Model 2',
          contextWindow: 16384,
          maxOutputTokens: 8192,
          supportsStreaming: false,
          supportsImages: false,
          supportsTemperature: false,
          timeout: 120000,
          description: 'Test model 2'
        }
      }
    };

    provider = createOpenAICompatibleProvider(mockConfig);
  });

  describe('Provider Creation', () => {
    it('should create provider with required methods', () => {
      expect(provider).toBeDefined();
      expect(provider.invoke).toBeInstanceOf(Function);
      expect(provider.validateConfig).toBeInstanceOf(Function);
      expect(provider.isAvailable).toBeInstanceOf(Function);
      expect(provider.getSupportedModels).toBeInstanceOf(Function);
      expect(provider.getModelConfig).toBeInstanceOf(Function);
    });

    it('should accept custom headers in configuration', () => {
      const customProvider = createOpenAICompatibleProvider({
        ...mockConfig,
        customHeaders: { 'X-Custom-Header': 'value' }
      });
      expect(customProvider).toBeDefined();
    });

    it('should accept custom validation function', () => {
      const customValidator = vi.fn().mockReturnValue(true);
      const customProvider = createOpenAICompatibleProvider({
        ...mockConfig,
        validateApiKey: customValidator
      });

      const config = { apiKeys: { testprovider: 'custom-key' } };
      customProvider.validateConfig(config);

      expect(customValidator).toHaveBeenCalledWith('custom-key');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate configuration with API key', () => {
      const config = { apiKeys: { testprovider: 'test-key' } };
      expect(provider.validateConfig(config)).toBe(true);
    });

    it('should reject configuration without API key', () => {
      const config = { apiKeys: {} };
      expect(provider.validateConfig(config)).toBe(false);
    });

    it('should reject configuration with empty API key', () => {
      const config = { apiKeys: { testprovider: '' } };
      expect(provider.validateConfig(config)).toBe(false);
    });

    it('should use default API key if provider-specific key not found', () => {
      const customProvider = createOpenAICompatibleProvider({
        ...mockConfig,
        apiKey: 'default-key'
      });
      expect(customProvider.validateConfig({})).toBe(true);
    });

    it('should check availability same as config validation', () => {
      const config = { apiKeys: { testprovider: 'test-key' } };
      expect(provider.isAvailable(config)).toBe(true);
      expect(provider.isAvailable({})).toBe(false);
    });
  });

  describe('Model Management', () => {
    it('should return supported models', () => {
      const models = provider.getSupportedModels();
      expect(models).toEqual(mockConfig.supportedModels);
    });

    it('should get model config by exact name', () => {
      const config = provider.getModelConfig('test-model-1');
      expect(config).toEqual(mockConfig.supportedModels['test-model-1']);
    });

    it('should get model config by alias', () => {
      const config = provider.getModelConfig('test-1');
      expect(config).toEqual(mockConfig.supportedModels['test-model-1']);
    });

    it('should handle case-insensitive model names', () => {
      const config = provider.getModelConfig('TEST-MODEL-1');
      expect(config).toEqual(mockConfig.supportedModels['test-model-1']);
    });

    it('should return null for unknown model', () => {
      const config = provider.getModelConfig('unknown-model');
      expect(config).toBeNull();
    });
  });

  describe('Message Invocation', () => {
    let mockResponse;

    beforeEach(() => {
      mockResponse = {
        choices: [{
          message: { content: 'Test response' },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30
        },
        model: 'test-model-1'
      };

      mockCreate.mockResolvedValue(mockResponse);
    });

    it('should invoke with basic messages', async () => {
      const messages = [
        { role: 'user', content: 'Hello' }
      ];

      const result = await provider.invoke(messages, {
        config: { apiKeys: { testprovider: 'test-key' } }
      });

      expect(mockCreate).toHaveBeenCalled();
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages).toEqual(messages);
      expect(callArgs.model).toBe('test-model-1');

      expect(result).toMatchObject({
        content: 'Test response',
        stop_reason: StopReasons.STOP,
        metadata: {
          model: 'test-model-1',
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            total_tokens: 30
          },
          provider: 'testprovider'
        }
      });
    });

    it('should handle custom parameters', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];

      await provider.invoke(messages, {
        model: 'test-model-2',
        temperature: 0.5,
        maxTokens: 2000,
        custom_param: 'value',
        config: { apiKeys: { testprovider: 'test-key' } }
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.model).toBe('test-model-2');
      expect(callArgs.temperature).toBeUndefined(); // Model doesn't support temperature
      expect(callArgs.max_tokens).toBe(2000);
      expect(callArgs.custom_param).toBe('value');
    });

    it('should handle image content', async () => {
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

      await provider.invoke(messages, {
        config: { apiKeys: { testprovider: 'test-key' } }
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages[0].content).toEqual([
        { type: 'text', text: 'What is this?' },
        {
          type: 'image_url',
          image_url: {
            url: 'data:image/jpeg;base64,base64data',
            detail: 'auto'
          }
        }
      ]);
    });

    it('should apply default parameters', async () => {
      const customProvider = createOpenAICompatibleProvider({
        ...mockConfig,
        defaultParams: {
          temperature: 0.3,
          top_p: 0.9
        }
      });

      const messages = [{ role: 'user', content: 'Hello' }];
      await customProvider.invoke(messages, {
        config: { apiKeys: { testprovider: 'test-key' } }
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.temperature).toBe(0.3);
      expect(callArgs.top_p).toBe(0.9);
    });

    it('should apply request transformation', async () => {
      const transformRequest = vi.fn().mockImplementation((payload) => ({
        ...payload,
        transformed: true
      }));

      const customProvider = createOpenAICompatibleProvider({
        ...mockConfig,
        transformRequest
      });

      const messages = [{ role: 'user', content: 'Hello' }];
      await customProvider.invoke(messages, {
        config: { apiKeys: { testprovider: 'test-key' } }
      });

      expect(transformRequest).toHaveBeenCalled();
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.transformed).toBe(true);
    });

    it('should apply response transformation', async () => {
      const transformResponse = vi.fn().mockImplementation((result) => ({
        ...result,
        transformed: true
      }));

      const customProvider = createOpenAICompatibleProvider({
        ...mockConfig,
        transformResponse
      });

      const messages = [{ role: 'user', content: 'Hello' }];
      const result = await customProvider.invoke(messages, {
        config: { apiKeys: { testprovider: 'test-key' } }
      });

      expect(transformResponse).toHaveBeenCalled();
      expect(result.transformed).toBe(true);
    });

    it('should respect model timeout configuration', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];

      await provider.invoke(messages, {
        model: 'test-model-1',
        config: { apiKeys: { testprovider: 'test-key' } }
      });

      // Check that OpenAI client was created with timeout
      expect(mockCreate).toHaveBeenCalled();
      expect(mockOpenAIInstances).toHaveLength(1);
      expect(mockOpenAIInstances[0].config).toMatchObject({
        timeout: 60000
      });
    });

    it('should handle models without temperature support', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];

      await provider.invoke(messages, {
        model: 'test-model-2',
        temperature: 0.8,
        config: { apiKeys: { testprovider: 'test-key' } }
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.temperature).toBeUndefined();
    });

    it('should cap max tokens to model limit', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];

      await provider.invoke(messages, {
        model: 'test-model-1',
        maxTokens: 10000,
        config: { apiKeys: { testprovider: 'test-key' } }
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.max_tokens).toBe(4096); // Model's max
    });
  });

  describe('Stop Reason Mapping', () => {
    const testCases = [
      ['stop', StopReasons.STOP],
      ['length', StopReasons.LENGTH],
      ['max_tokens', StopReasons.LENGTH],
      ['tool_calls', StopReasons.TOOL_USE],
      ['content_filter', StopReasons.CONTENT_FILTER],
      ['safety', StopReasons.SAFETY],
      ['unknown_reason', StopReasons.OTHER],
      [null, StopReasons.STOP],
      [undefined, StopReasons.STOP]
    ];

    testCases.forEach(([finishReason, expectedStopReason]) => {
      it(`should map finish_reason "${finishReason}" to "${expectedStopReason}"`, async () => {
        mockCreate.mockResolvedValue({
          choices: [{
            message: { content: 'Test' },
            finish_reason: finishReason
          }],
          usage: {}
        });

        const result = await provider.invoke(
          [{ role: 'user', content: 'Hello' }],
          { config: { apiKeys: { testprovider: 'test-key' } } }
        );

        expect(result.stop_reason).toBe(expectedStopReason);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle missing API key', async () => {
      await expect(
        provider.invoke([{ role: 'user', content: 'Hello' }], {})
      ).rejects.toThrow('TestProvider API key not configured');
    });

    it('should handle invalid API key error', async () => {
      mockCreate.mockRejectedValue({
        code: 'invalid_api_key',
        message: 'Invalid API key provided'
      });

      await expect(
        provider.invoke([{ role: 'user', content: 'Hello' }], {
          config: { apiKeys: { testprovider: 'test-key' } }
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.INVALID_API_KEY,
        message: expect.stringContaining('Invalid TestProvider API key')
      });
    });

    it('should handle quota exceeded error', async () => {
      mockCreate.mockRejectedValue({
        code: 'insufficient_quota',
        message: 'Quota exceeded'
      });

      await expect(
        provider.invoke([{ role: 'user', content: 'Hello' }], {
          config: { apiKeys: { testprovider: 'test-key' } }
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.QUOTA_EXCEEDED,
        message: expect.stringContaining('quota exceeded')
      });
    });

    it('should handle rate limit error', async () => {
      mockCreate.mockRejectedValue({
        type: 'rate_limit_error',
        message: 'Rate limit exceeded'
      });

      await expect(
        provider.invoke([{ role: 'user', content: 'Hello' }], {
          config: { apiKeys: { testprovider: 'test-key' } }
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.RATE_LIMIT_EXCEEDED,
        message: expect.stringContaining('rate limit exceeded')
      });
    });

    it('should handle model not found error', async () => {
      mockCreate.mockRejectedValue({
        code: 'model_not_found',
        message: 'Model not found'
      });

      await expect(
        provider.invoke([{ role: 'user', content: 'Hello' }], {
          config: { apiKeys: { testprovider: 'test-key' } }
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.MODEL_NOT_FOUND,
        message: expect.stringContaining('Model test-model-1 not found')
      });
    });

    it('should handle context length error', async () => {
      mockCreate.mockRejectedValue({
        response: {
          status: 400,
          data: { error: { message: 'Context length exceeded for this model' } }
        },
        message: 'Context length exceeded for this model'
      });

      await expect(
        provider.invoke([{ role: 'user', content: 'Hello' }], {
          config: { apiKeys: { testprovider: 'test-key' } }
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.CONTEXT_LENGTH_EXCEEDED,
        message: expect.stringContaining('Context length exceeded')
      });
    });

    it('should handle timeout error', async () => {
      mockCreate.mockRejectedValue({
        code: 'ETIMEDOUT',
        message: 'Request timeout'
      });

      await expect(
        provider.invoke([{ role: 'user', content: 'Hello' }], {
          config: { apiKeys: { testprovider: 'test-key' } }
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.TIMEOUT_ERROR,
        message: expect.stringContaining('request timeout')
      });
    });

    it('should handle network error', async () => {
      mockCreate.mockRejectedValue({
        code: 'ECONNREFUSED',
        message: 'Connection refused'
      });

      await expect(
        provider.invoke([{ role: 'user', content: 'Hello' }], {
          config: { apiKeys: { testprovider: 'test-key' } }
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.NETWORK_ERROR,
        message: expect.stringContaining('network error')
      });
    });

    it('should handle no response choice', async () => {
      mockCreate.mockResolvedValue({
        choices: [],
        usage: {}
      });

      await expect(
        provider.invoke([{ role: 'user', content: 'Hello' }], {
          config: { apiKeys: { testprovider: 'test-key' } }
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.NO_RESPONSE_CHOICE,
        message: 'No response choice received'
      });
    });

    it('should handle no response content', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {},
          finish_reason: 'stop'
        }],
        usage: {}
      });

      await expect(
        provider.invoke([{ role: 'user', content: 'Hello' }], {
          config: { apiKeys: { testprovider: 'test-key' } }
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.NO_RESPONSE_CONTENT,
        message: 'No content in response'
      });
    });

    it('should validate message format', async () => {
      await expect(
        provider.invoke('not an array', {
          config: { apiKeys: { testprovider: 'test-key' } }
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.INVALID_MESSAGES,
        message: 'Messages must be an array'
      });
    });

    it('should validate individual messages', async () => {
      await expect(
        provider.invoke([null], {
          config: { apiKeys: { testprovider: 'test-key' } }
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.INVALID_MESSAGE,
        message: expect.stringContaining('Message at index 0 must be an object')
      });
    });

    it('should validate message roles', async () => {
      await expect(
        provider.invoke([{ role: 'invalid', content: 'test' }], {
          config: { apiKeys: { testprovider: 'test-key' } }
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.INVALID_ROLE,
        message: expect.stringContaining('Invalid role "invalid"')
      });
    });

    it('should validate message content', async () => {
      await expect(
        provider.invoke([{ role: 'user' }], {
          config: { apiKeys: { testprovider: 'test-key' } }
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.MISSING_CONTENT,
        message: expect.stringContaining('Message content is required')
      });
    });
  });

  describe('Retry Helper', () => {
    it('should retry on rate limit errors', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce({ code: ErrorCodes.RATE_LIMIT_EXCEEDED })
        .mockResolvedValueOnce('success');

      const result = await retryWithBackoff(fn, 3, 10);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry on timeout errors', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce({ code: ErrorCodes.TIMEOUT_ERROR })
        .mockRejectedValueOnce({ code: ErrorCodes.TIMEOUT_ERROR })
        .mockResolvedValueOnce('success');

      const result = await retryWithBackoff(fn, 3, 10);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable errors', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce({ code: ErrorCodes.INVALID_API_KEY });

      await expect(retryWithBackoff(fn, 3, 10))
        .rejects.toMatchObject({ code: ErrorCodes.INVALID_API_KEY });

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should throw last error after max retries', async () => {
      const error = { code: ErrorCodes.RATE_LIMIT_EXCEEDED, message: 'Rate limited' };
      const fn = vi.fn().mockRejectedValue(error);

      await expect(retryWithBackoff(fn, 2, 10))
        .rejects.toMatchObject(error);

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should use exponential backoff', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce({ code: ErrorCodes.TIMEOUT_ERROR })
        .mockRejectedValueOnce({ code: ErrorCodes.TIMEOUT_ERROR })
        .mockResolvedValueOnce('success');

      const start = Date.now();
      await retryWithBackoff(fn, 3, 100);
      const duration = Date.now() - start;

      // First retry after 100ms, second after 200ms = 300ms total minimum
      expect(duration).toBeGreaterThanOrEqual(280); // Allow some variance
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });
});
