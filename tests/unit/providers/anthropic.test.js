/**
 * Anthropic Provider Tests
 *
 * Tests the Anthropic provider implementation with mocked SDK.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCodes, StopReasons } from '../../../src/providers/interface.js';

// Create mock before any imports
const mockCreate = vi.fn();
const mockStream = vi.fn();

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = function(config) {
    this.apiKey = config.apiKey;
    this.messages = {
      create: vi.fn((options) => {
        // Route to appropriate mock based on stream parameter
        if (options.stream) {
          return mockStream(options);
        }
        return mockCreate(options);
      }),
      stream: mockStream
    };
  };

  return {
    default: MockAnthropic,
    Anthropic: MockAnthropic
  };
});

// Import provider AFTER setting up the mock
import { anthropicProvider } from '../../../src/providers/anthropic.js';

describe('Anthropic Provider', () => {
  let mockConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockClear();
    mockStream.mockClear();

    mockConfig = {
      apiKeys: {
        anthropic: 'sk-ant-test-key-1234567890abcdefghijklmnopqrstuvwxyz'
      }
    };
  });

  describe('Configuration', () => {
    it('should validate configuration with valid API key', () => {
      expect(anthropicProvider.validateConfig(mockConfig)).toBe(true);
    });

    it('should reject configuration without API key', () => {
      expect(anthropicProvider.validateConfig({})).toBe(false);
      expect(anthropicProvider.validateConfig({ apiKeys: {} })).toBe(false);
    });

    it('should reject configuration with invalid API key format', () => {
      const invalidConfigs = [
        { apiKeys: { anthropic: '' } },
        { apiKeys: { anthropic: 'invalid-key' } },
        { apiKeys: { anthropic: 'sk-ant-short' } },
        { apiKeys: { anthropic: 123 } }
      ];

      invalidConfigs.forEach(config => {
        expect(anthropicProvider.validateConfig(config)).toBe(false);
      });
    });

    it('should check availability same as config validation', () => {
      expect(anthropicProvider.isAvailable(mockConfig)).toBe(true);
      expect(anthropicProvider.isAvailable({})).toBe(false);
    });
  });

  describe('Model Management', () => {
    it('should return supported models', () => {
      const models = anthropicProvider.getSupportedModels();

      expect(models).toBeDefined();
      expect(Object.keys(models).length).toBeGreaterThan(0);

      // Check for some expected models
      expect(models['claude-3-5-sonnet-20241022']).toBeDefined();
      expect(models['claude-3-5-haiku-20241022']).toBeDefined();
    });

    it('should get model config by exact name', () => {
      const config = anthropicProvider.getModelConfig('claude-3-5-sonnet-20241022');

      expect(config).toBeDefined();
      expect(config.modelName).toBe('claude-3-5-sonnet-20241022');
      expect(config.contextWindow).toBe(200000);
      expect(config.maxOutputTokens).toBe(8192);
      expect(config.supportsImages).toBe(true);
    });

    it('should get model config by alias', () => {
      const config = anthropicProvider.getModelConfig('sonnet');

      expect(config).toBeDefined();
      expect(config.modelName).toBe('claude-sonnet-4-20250514');
    });

    it('should handle case-insensitive model names', () => {
      const config = anthropicProvider.getModelConfig('CLAUDE-3-5-SONNET-20241022');

      expect(config).toBeDefined();
      expect(config.modelName).toBe('claude-3-5-sonnet-20241022');
    });

    it('should return null for unknown model', () => {
      const config = anthropicProvider.getModelConfig('unknown-model');
      expect(config).toBeNull();
    });
  });

  describe('Message Invocation', () => {
    let mockResponse;

    beforeEach(() => {
      mockResponse = {
        content: [{ type: 'text', text: 'Test response' }],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 20
        },
        model: 'claude-3-5-sonnet-20241022'
      };

      mockCreate.mockResolvedValue(mockResponse);
    });

    it('should invoke with basic messages', async () => {
      const messages = [
        { role: 'user', content: 'Hello' }
      ];

      const result = await anthropicProvider.invoke(messages, {
        config: mockConfig
      });

      expect(mockCreate).toHaveBeenCalled();
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages).toEqual(messages);
      expect(callArgs.model).toBe('claude-3-5-sonnet-20241022');
      expect(callArgs.max_tokens).toBe(8192); // Default for this model

      expect(result).toMatchObject({
        content: 'Test response',
        stop_reason: StopReasons.STOP,
        metadata: {
          model: 'claude-3-5-sonnet-20241022',
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            total_tokens: 30
          },
          provider: 'anthropic'
        }
      });
    });

    it('should handle system messages', async () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello' }
      ];

      await anthropicProvider.invoke(messages, {
        config: mockConfig
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.system).toEqual([{
        type: 'text',
        text: 'You are a helpful assistant',
        cache_control: {
          type: 'ephemeral',
          ttl: '1h'
        }
      }]);
      expect(callArgs.messages).toEqual([
        { role: 'user', content: 'Hello' }
      ]);
    });

    it('should concatenate multiple system messages', async () => {
      const messages = [
        { role: 'system', content: 'First system message' },
        { role: 'system', content: 'Second system message' },
        { role: 'user', content: 'Hello' }
      ];

      await anthropicProvider.invoke(messages, {
        config: mockConfig
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.system).toEqual([{
        type: 'text',
        text: 'First system message\n\nSecond system message',
        cache_control: {
          type: 'ephemeral',
          ttl: '1h'
        }
      }]);
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

      await anthropicProvider.invoke(messages, {
        config: mockConfig
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages[0].content).toEqual([
        { type: 'text', text: 'What is this?' },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: 'base64data'
          }
        }
      ]);
    });

    it('should handle custom parameters', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];

      await anthropicProvider.invoke(messages, {
        model: 'claude-3-5-haiku-20241022',
        temperature: 0.5,
        maxTokens: 2000,
        config: mockConfig
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.model).toBe('claude-3-5-haiku-20241022');
      expect(callArgs.temperature).toBe(0.5);
      expect(callArgs.max_tokens).toBe(2000);
    });

    it('should handle thinking models with reasoning_effort', async () => {
      const messages = [{ role: 'user', content: 'Complex problem' }];

      // Test different reasoning efforts
      // Note: thinking budget must be < max_tokens (32000 for opus-4)
      const efforts = ['minimal', 'low', 'medium', 'high'];
      const expectedBudgets = {
        minimal: 1600,   // 5% of 32000, min 1024
        low: 4800,       // 15% of 32000
        medium: 10560,   // 33% of 32000
        high: 21440,     // 67% of 32000
      };

      for (const effort of efforts) {
        mockCreate.mockClear();

        await anthropicProvider.invoke(messages, {
          model: 'claude-opus-4-1-20250805',
          reasoning_effort: effort,
          config: mockConfig
        });

        const callArgs = mockCreate.mock.calls[0][0];
        expect(callArgs.thinking).toEqual({
          type: 'enabled',
          budget_tokens: expectedBudgets[effort]
        });
        // Verify max_tokens is set correctly for Claude 4 models
        expect(callArgs.max_tokens).toBe(32000);
      }

      // Test 'max' effort - should not enable thinking since budget (32000) is not < max_tokens (32000)
      mockCreate.mockClear();
      await anthropicProvider.invoke(messages, {
        model: 'claude-opus-4-1-20250805',
        reasoning_effort: 'max',
        config: mockConfig
      });

      const maxEffortCallArgs = mockCreate.mock.calls[0][0];
      expect(maxEffortCallArgs.thinking).toBeUndefined();
      expect(maxEffortCallArgs.max_tokens).toBe(32000);
    });

    it('should handle claude-sonnet-4 with thinking enabled', async () => {
      const messages = [{ role: 'user', content: 'Test sonnet-4' }];

      await anthropicProvider.invoke(messages, {
        model: 'claude-sonnet-4',
        reasoning_effort: 'medium',
        config: mockConfig
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.model).toBe('claude-sonnet-4-20250514');
      expect(callArgs.max_tokens).toBe(64000); // Set for Claude 4 models
      expect(callArgs.thinking).toEqual({
        type: 'enabled',
        budget_tokens: 21120 // 33% of 64000
      });
    });

    it('should not add thinking for models that do not support it', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];

      await anthropicProvider.invoke(messages, {
        model: 'claude-3-5-sonnet-20241022',
        reasoning_effort: 'high',
        config: mockConfig
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.thinking).toBeUndefined();
    });

    it('should cap max tokens to model limit', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];

      await anthropicProvider.invoke(messages, {
        model: 'claude-3-5-sonnet-20241022',
        maxTokens: 100000,
        config: mockConfig
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.max_tokens).toBe(8192); // Model's max
    });

    it('should handle string response content', async () => {
      mockCreate.mockResolvedValue({
        content: 'String response',
        stop_reason: 'end_turn',
        usage: { input_tokens: 5, output_tokens: 10 }
      });

      const result = await anthropicProvider.invoke(
        [{ role: 'user', content: 'Hello' }],
        { config: mockConfig }
      );

      expect(result.content).toBe('String response');
    });
  });

  describe('Stop Reason Mapping', () => {
    const testCases = [
      ['end_turn', StopReasons.STOP],
      ['max_tokens', StopReasons.LENGTH],
      ['stop_sequence', StopReasons.STOP],
      ['tool_use', StopReasons.TOOL_USE]
    ];

    testCases.forEach(([anthropicReason, expectedReason]) => {
      it(`should map stop_reason "${anthropicReason}" to "${expectedReason}"`, async () => {
        mockCreate.mockResolvedValue({
          content: [{ type: 'text', text: 'Test' }],
          stop_reason: anthropicReason,
          usage: {}
        });

        const result = await anthropicProvider.invoke(
          [{ role: 'user', content: 'Hello' }],
          { config: mockConfig }
        );

        expect(result.stop_reason).toBe(expectedReason);
      });
    });

    it('should map unknown stop reason to OTHER', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Test' }],
        stop_reason: 'unknown_reason',
        usage: {}
      });

      const result = await anthropicProvider.invoke(
        [{ role: 'user', content: 'Hello' }],
        { config: mockConfig }
      );

      expect(result.stop_reason).toBe(StopReasons.OTHER);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing API key', async () => {
      await expect(
        anthropicProvider.invoke([{ role: 'user', content: 'Hello' }], {
          config: {}
        })
      ).rejects.toThrow('Anthropic API key not configured');
    });

    it('should handle invalid API key format', async () => {
      await expect(
        anthropicProvider.invoke([{ role: 'user', content: 'Hello' }], {
          config: { apiKeys: { anthropic: 'invalid-key' } }
        })
      ).rejects.toThrow('Invalid Anthropic API key format');
    });

    it('should validate message format', async () => {
      await expect(
        anthropicProvider.invoke('not an array', {
          config: mockConfig
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.INVALID_MESSAGES,
        message: 'Messages must be an array'
      });
    });

    it('should validate individual messages', async () => {
      await expect(
        anthropicProvider.invoke([null], {
          config: mockConfig
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.INVALID_MESSAGE,
        message: expect.stringContaining('Message at index 0 must be an object')
      });
    });

    it('should validate message roles', async () => {
      await expect(
        anthropicProvider.invoke([{ role: 'invalid', content: 'test' }], {
          config: mockConfig
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.INVALID_ROLE,
        message: expect.stringContaining('Invalid role "invalid"')
      });
    });

    it('should validate message content', async () => {
      await expect(
        anthropicProvider.invoke([{ role: 'user' }], {
          config: mockConfig
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.MISSING_CONTENT,
        message: expect.stringContaining('Message content is required')
      });
    });

    it('should validate first message is from user', async () => {
      await expect(
        anthropicProvider.invoke([{ role: 'assistant', content: 'Hello' }], {
          config: mockConfig
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.INVALID_MESSAGE,
        message: 'First message must be from user role'
      });
    });

    it('should validate message alternation', async () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'user', content: 'Hello again' }
      ];

      await expect(
        anthropicProvider.invoke(messages, { config: mockConfig })
      ).rejects.toMatchObject({
        code: ErrorCodes.INVALID_MESSAGE,
        message: expect.stringContaining('Messages must alternate between user and assistant')
      });
    });

    it('should handle no response content', async () => {
      mockCreate.mockResolvedValue({
        content: [],
        stop_reason: 'end_turn',
        usage: {}
      });

      await expect(
        anthropicProvider.invoke([{ role: 'user', content: 'Hello' }], {
          config: mockConfig
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.NO_RESPONSE_CONTENT,
        message: 'No content in response from Anthropic'
      });
    });

    it('should handle API errors', async () => {
      const errorCases = [
        { status: 401, expectedCode: ErrorCodes.INVALID_API_KEY, expectedMessage: 'Invalid Anthropic API key' },
        { status: 429, expectedCode: ErrorCodes.RATE_LIMIT_EXCEEDED, expectedMessage: 'rate limit exceeded' },
        { status: 403, expectedCode: ErrorCodes.QUOTA_EXCEEDED, expectedMessage: 'quota exceeded' }
      ];

      for (const { status, expectedCode, expectedMessage } of errorCases) {
        mockCreate.mockRejectedValueOnce({ status });

        await expect(
          anthropicProvider.invoke([{ role: 'user', content: 'Hello' }], {
            config: mockConfig
          })
        ).rejects.toMatchObject({
          code: expectedCode,
          message: expect.stringContaining(expectedMessage)
        });
      }
    });

    it('should handle invalid request errors', async () => {
      mockCreate.mockRejectedValue({
        error: {
          type: 'invalid_request_error',
          message: 'Invalid parameter'
        }
      });

      await expect(
        anthropicProvider.invoke([{ role: 'user', content: 'Hello' }], {
          config: mockConfig
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.INVALID_REQUEST,
        message: expect.stringContaining('Invalid request: Invalid parameter')
      });
    });

    it('should handle model not found errors', async () => {
      mockCreate.mockRejectedValue({
        error: {
          type: 'not_found_error',
          message: 'Model not found'
        }
      });

      await expect(
        anthropicProvider.invoke([{ role: 'user', content: 'Hello' }], {
          config: mockConfig
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.MODEL_NOT_FOUND,
        message: expect.stringContaining('Model claude-3-5-sonnet-20241022 not found')
      });
    });

    it('should handle context length errors', async () => {
      mockCreate.mockRejectedValue({
        message: 'Your request exceeds the model context length limit'
      });

      await expect(
        anthropicProvider.invoke([{ role: 'user', content: 'Hello' }], {
          config: mockConfig
        })
      ).rejects.toMatchObject({
        code: ErrorCodes.CONTEXT_LENGTH_EXCEEDED,
        message: expect.stringContaining('Context length exceeded for model')
      });
    });
  });

  describe('Streaming Functionality', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockCreate.mockClear();
      mockStream.mockClear();
    });

    it('should return AsyncGenerator when stream=true', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];

      // Create a simple async generator for the mock
      async function* mockStreamGenerator() {
        yield {
          type: 'message_start',
          message: { usage: { input_tokens: 10, output_tokens: 1 } }
        };
        yield {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Hello' }
        };
        yield {
          type: 'message_stop'
        };
      }

      mockStream.mockResolvedValue(mockStreamGenerator());

      const result = await anthropicProvider.invoke(messages, {
        stream: true,
        config: mockConfig
      });

      expect(result).toBeInstanceOf(Object);
      expect(result[Symbol.asyncIterator]).toBeInstanceOf(Function);
    });

    it('should handle streaming events correctly', async () => {
      const messages = [{ role: 'user', content: 'Test streaming' }];

      // Mock the streaming response
      const mockStreamEvents = [
        {
          type: 'message_start',
          message: {
            usage: { input_tokens: 10, output_tokens: 1 }
          }
        },
        {
          type: 'content_block_start',
          content_block: { type: 'text' }
        },
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Hello' }
        },
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: ' world' }
        },
        {
          type: 'content_block_stop',
          index: 0
        },
        {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { input_tokens: 10, output_tokens: 15, total_tokens: 25 }
        },
        {
          type: 'message_stop'
        }
      ];

      // Create async generator for mock stream
      async function* mockStreamGenerator() {
        for (const event of mockStreamEvents) {
          yield event;
        }
      }

      mockCreate.mockResolvedValue(mockStreamGenerator());

      const streamResult = anthropicProvider.invoke(messages, {
        stream: true,
        config: mockConfig
      });

      const events = [];
      for await (const event of streamResult) {
        events.push(event);
      }

      // Verify the streaming payload was configured correctly
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.stream).toBe(true);

      // Verify we get the expected events
      expect(events).toHaveLength(5);

      // Check start event
      expect(events[0]).toMatchObject({
        type: 'start',
        model: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        thinking_mode: false
      });

      // Check delta events
      expect(events[1]).toMatchObject({
        type: 'delta',
        content: 'Hello'
      });

      expect(events[2]).toMatchObject({
        type: 'delta',
        content: ' world'
      });

      // Check usage event
      expect(events[3]).toMatchObject({
        type: 'usage',
        usage: {
          input_tokens: 10,
          output_tokens: 15,
          total_tokens: 25,
          thinking_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0
        }
      });

      // Check end event
      expect(events[4]).toMatchObject({
        type: 'end',
        content: 'Hello world',
        stop_reason: 'stop',
        metadata: {
          model: 'claude-3-5-sonnet-20241022',
          provider: 'anthropic',
          reasoning_effort: null
        }
      });
    });

    it('should handle thinking deltas in streaming', async () => {
      const messages = [{ role: 'user', content: 'Complex problem' }];

      const mockStreamEvents = [
        {
          type: 'message_start',
          message: { usage: { input_tokens: 10, output_tokens: 1 } }
        },
        {
          type: 'content_block_start',
          content_block: { type: 'thinking' }
        },
        {
          type: 'content_block_delta',
          delta: { type: 'thinking_delta', thinking: 'Let me think...' }
        },
        {
          type: 'content_block_delta',
          delta: { type: 'thinking_delta', thinking: ' about this problem.' }
        },
        {
          type: 'content_block_stop',
          index: 0
        },
        {
          type: 'content_block_start',
          content_block: { type: 'text' }
        },
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'The answer is 42.' }
        },
        {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { input_tokens: 10, output_tokens: 20, thinking_input_tokens: 50 }
        },
        {
          type: 'message_stop'
        }
      ];

      async function* mockStreamGenerator() {
        for (const event of mockStreamEvents) {
          yield event;
        }
      }

      mockCreate.mockResolvedValue(mockStreamGenerator());

      const streamResult = anthropicProvider.invoke(messages, {
        stream: true,
        model: 'claude-opus-4-1-20250805',
        reasoning_effort: 'medium',
        config: mockConfig
      });

      const events = [];
      for await (const event of streamResult) {
        events.push(event);
      }

      // Should have start, text delta, usage, and end events (thinking deltas are logged, not yielded)
      expect(events).toHaveLength(4);

      // Check start event has thinking mode enabled
      expect(events[0]).toMatchObject({
        type: 'start',
        thinking_mode: true
      });

      // Check text delta
      expect(events[1]).toMatchObject({
        type: 'delta',
        content: 'The answer is 42.'
      });

      // Check usage includes thinking tokens
      expect(events[2]).toMatchObject({
        type: 'usage',
        usage: {
          thinking_tokens: 50
        }
      });

      // Check end event includes thinking content in metadata
      expect(events[3]).toMatchObject({
        type: 'end',
        metadata: {
          reasoning_effort: 'medium',
          thinking_content: 'Let me think... about this problem.'
        }
      });
    });

    it('should fall back to non-streaming for unsupported models', async () => {
      // Mock a model that doesn't support streaming
      const originalModels = anthropicProvider.getSupportedModels();
      const testModel = { ...originalModels['claude-3-5-haiku-20241022'], supportsStreaming: false };
      vi.spyOn(anthropicProvider, 'getModelConfig').mockReturnValue(testModel);

      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Non-streaming response' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 5, output_tokens: 10 }
      });

      const result = await anthropicProvider.invoke([{ role: 'user', content: 'Hello' }], {
        stream: true,
        model: 'claude-3-5-haiku-20241022',
        config: mockConfig
      });

      // Should return regular response object, not AsyncGenerator
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('stop_reason');
      expect(result).toHaveProperty('metadata');

      // Should have called create with stream: false
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.stream).toBe(false);
    });

    it('should handle streaming errors gracefully', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];

      async function* mockErrorStreamGenerator() {
        yield {
          type: 'message_start',
          message: { usage: { input_tokens: 10, output_tokens: 1 } }
        };
        throw new Error('Network error');
      }

      mockCreate.mockResolvedValue(mockErrorStreamGenerator());

      const streamResult = anthropicProvider.invoke(messages, {
        stream: true,
        config: mockConfig
      });

      const events = [];
      try {
        for await (const event of streamResult) {
          events.push(event);
        }
      } catch (error) {
        // Should get an error after start event
        expect(events).toHaveLength(2); // start event and error event
        expect(events[0].type).toBe('start');
        expect(events[1].type).toBe('error');
        expect(events[1].error.message).toContain('Network error');
        expect(error.message).toContain('Network error');
      }
    });

    it('should handle event processing errors', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];

      async function* mockStreamGenerator() {
        yield {
          type: 'message_start',
          message: { usage: { input_tokens: 10, output_tokens: 1 } }
        };
        // Yield an invalid event that will cause processing error
        yield {
          type: 'content_block_delta',
          delta: null // This should cause an error
        };
      }

      mockCreate.mockResolvedValue(mockStreamGenerator());

      const streamResult = anthropicProvider.invoke(messages, {
        stream: true,
        config: mockConfig
      });

      const events = [];
      for await (const event of streamResult) {
        events.push(event);
        if (event.type === 'error') break;
      }

      // Should get start event and error event
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('start');
      expect(events[1].type).toBe('error');
      expect(events[1].error.code).toBe('EVENT_PROCESSING_ERROR');
      expect(events[1].error.recoverable).toBe(true);
    });

    it('should handle ping events by ignoring them', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];

      const mockStreamEvents = [
        {
          type: 'message_start',
          message: { usage: { input_tokens: 10, output_tokens: 1 } }
        },
        {
          type: 'ping' // Should be ignored
        },
        {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Hello' }
        },
        {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { input_tokens: 10, output_tokens: 5 }
        },
        {
          type: 'ping' // Should be ignored
        },
        {
          type: 'message_stop'
        }
      ];

      async function* mockStreamGenerator() {
        for (const event of mockStreamEvents) {
          yield event;
        }
      }

      mockCreate.mockResolvedValue(mockStreamGenerator());

      const streamResult = anthropicProvider.invoke(messages, {
        stream: true,
        config: mockConfig
      });

      const events = [];
      for await (const event of streamResult) {
        events.push(event);
      }

      // Should get start, delta, usage, end (ping events ignored)
      expect(events).toHaveLength(4);
      expect(events.map(e => e.type)).toEqual(['start', 'delta', 'usage', 'end']);
    });
  });

  describe('SDK Loading', () => {
    it.skip('should handle SDK loading failure', async () => {
      // This test is skipped because we can't easily test dynamic import failures
      // with the current mock setup
    });
  });
});
