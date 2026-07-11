/**
 * Mistral Provider Tests
 *
 * Tests the Mistral provider implementation with mocked SDK.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCodes, StopReasons } from '../../../src/providers/interface.js';

// Create mocks before any imports
const mockChatComplete = vi.fn();
const mockChatStream = vi.fn();

// Mock the Mistral SDK
vi.mock('@mistralai/mistralai', () => {
  const MockMistral = function (config) {
    this.apiKey = config.apiKey;

    this.chat = {
      complete: mockChatComplete,
      stream: mockChatStream,
    };
  };

  return {
    default: MockMistral,
    Mistral: MockMistral,
  };
});

// Import provider AFTER setting up the mock
import { mistralProvider } from '../../../src/providers/mistral.js';

/**
 * Build an async-iterable stream from an array of Mistral SDK chunk objects.
 * Each element is yielded as `{ data: <chunk> }` to mirror the SDK wrapper.
 */
function makeStream(chunks) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield { data: chunk };
      }
    },
  };
}

async function collectEvents(generator) {
  const events = [];
  for await (const event of generator) {
    events.push(event);
  }
  return events;
}

describe('Mistral Provider', () => {
  let mockConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    mockChatComplete.mockClear();
    mockChatStream.mockClear();

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

  describe('Model catalog', () => {
    it('should advertise exactly the curated models', () => {
      const models = mistralProvider.getSupportedModels();

      expect(Object.keys(models).sort()).toEqual([
        'mistral-large-2512',
        'mistral-medium-3-5',
        'mistral-small-2603',
      ]);
    });

    it('should mark reasoning support only on medium-3-5 and small-2603', () => {
      const models = mistralProvider.getSupportedModels();

      expect(models['mistral-medium-3-5'].supportsReasoning).toBe(true);
      expect(models['mistral-small-2603'].supportsReasoning).toBe(true);
      expect(models['mistral-large-2512'].supportsReasoning).toBe(false);
    });

    it('should default to mistral-medium-3-5 when no model is given', async () => {
      mockChatComplete.mockResolvedValue({
        choices: [
          { message: { content: 'ok', role: 'assistant' }, finish_reason: 'stop' },
        ],
        usage: {},
      });

      await mistralProvider.invoke([{ role: 'user', content: 'Hi' }], {
        config: mockConfig,
      });

      expect(mockChatComplete.mock.calls[0][0].model).toBe('mistral-medium-3-5');
    });

    it('should resolve friendly aliases to canonical ids', () => {
      expect(mistralProvider.getModelConfig('mistral').modelName).toBe(
        'mistral-medium-3-5',
      );
      expect(mistralProvider.getModelConfig('mistral-small').modelName).toBe(
        'mistral-small-2603',
      );
      expect(mistralProvider.getModelConfig('mistral-large-latest').modelName).toBe(
        'mistral-large-2512',
      );
    });

    it('should return null for an unknown model', () => {
      expect(mistralProvider.getModelConfig('magistral-medium-2509')).toBeNull();
    });
  });

  describe('Reasoning effort mapping', () => {
    beforeEach(() => {
      mockChatComplete.mockResolvedValue({
        choices: [
          { message: { content: 'ok', role: 'assistant' }, finish_reason: 'stop' },
        ],
        usage: {},
      });
    });

    const enabledLevels = ['minimal', 'low', 'medium', 'high', 'max'];

    enabledLevels.forEach((level) => {
      it(`should map "${level}" to reasoning_effort "high" on a reasoning model`, async () => {
        await mistralProvider.invoke([{ role: 'user', content: 'Hi' }], {
          model: 'mistral-medium-3-5',
          reasoning_effort: level,
          config: mockConfig,
        });

        expect(mockChatComplete.mock.calls[0][0].reasoning_effort).toBe('high');
      });
    });

    it('should map "none" to reasoning_effort "none"', async () => {
      await mistralProvider.invoke([{ role: 'user', content: 'Hi' }], {
        model: 'mistral-small-2603',
        reasoning_effort: 'none',
        config: mockConfig,
      });

      expect(mockChatComplete.mock.calls[0][0].reasoning_effort).toBe('none');
    });

    it('should never send reasoning_effort for mistral-large-2512', async () => {
      await mistralProvider.invoke([{ role: 'user', content: 'Hi' }], {
        model: 'mistral-large-2512',
        reasoning_effort: 'high',
        config: mockConfig,
      });

      expect(
        mockChatComplete.mock.calls[0][0].reasoning_effort,
      ).toBeUndefined();
    });

    it('should never send reasoning_effort for an unknown pass-through id', async () => {
      await mistralProvider.invoke([{ role: 'user', content: 'Hi' }], {
        model: 'magistral-medium-2509',
        reasoning_effort: 'high',
        config: mockConfig,
      });

      expect(
        mockChatComplete.mock.calls[0][0].reasoning_effort,
      ).toBeUndefined();
    });
  });

  describe('Non-streaming content normalization', () => {
    it('should keep a plain-string answer with no reasoning', async () => {
      mockChatComplete.mockResolvedValue({
        choices: [
          {
            message: { content: 'Plain answer', role: 'assistant' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      });

      const result = await mistralProvider.invoke(
        [{ role: 'user', content: 'Hi' }],
        { config: mockConfig },
      );

      expect(result.content).toBe('Plain answer');
      expect(result.metadata.reasoning_content).toBeUndefined();
    });

    it('should split ThinkChunk/TextChunk and ignore ReferenceChunk', async () => {
      mockChatComplete.mockResolvedValue({
        choices: [
          {
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'thinking',
                  thinking: [{ type: 'text', text: 'let me think ' }],
                },
                { type: 'reference', reference_ids: [1, 2] },
                { type: 'text', text: 'Final answer' },
              ],
            },
            finish_reason: 'stop',
          },
        ],
        usage: {},
      });

      const result = await mistralProvider.invoke(
        [{ role: 'user', content: 'Hi' }],
        { config: mockConfig },
      );

      expect(result.content).toBe('Final answer');
      expect(result.metadata.reasoning_content).toBe('let me think ');
    });

    it('should accept a reasoning-only turn with empty answer text', async () => {
      mockChatComplete.mockResolvedValue({
        choices: [
          {
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'thinking',
                  thinking: [{ type: 'text', text: 'thoughts only' }],
                },
              ],
            },
            finish_reason: 'stop',
          },
        ],
        usage: {},
      });

      const result = await mistralProvider.invoke(
        [{ role: 'user', content: 'Hi' }],
        { config: mockConfig },
      );

      expect(result.content).toBe('');
      expect(result.metadata.reasoning_content).toBe('thoughts only');
    });

    it('should raise on an unexpected content-bearing chunk type', async () => {
      mockChatComplete.mockResolvedValue({
        choices: [
          {
            message: {
              role: 'assistant',
              content: [{ type: 'audio', audio: 'xxx' }],
            },
            finish_reason: 'stop',
          },
        ],
        usage: {},
      });

      await expect(
        mistralProvider.invoke([{ role: 'user', content: 'Hi' }], {
          config: mockConfig,
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('Unexpected Mistral content chunk'),
      });
    });

    it('should throw NO_RESPONSE_CONTENT when nothing is present', async () => {
      mockChatComplete.mockResolvedValue({
        choices: [{ message: { role: 'assistant' }, finish_reason: 'stop' }],
        usage: {},
      });

      await expect(
        mistralProvider.invoke([{ role: 'user', content: 'Hi' }], {
          config: mockConfig,
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.NO_RESPONSE_CONTENT,
      });
    });
  });

  describe('Streaming content normalization', () => {
    it('should emit delta events for plain-string deltas', async () => {
      mockChatStream.mockResolvedValue(
        makeStream([
          { choices: [{ delta: { content: 'Hello ' } }] },
          { choices: [{ delta: { content: 'world' }, finish_reason: 'stop' }] },
        ]),
      );

      const events = await collectEvents(
        await mistralProvider.invoke([{ role: 'user', content: 'Hi' }], {
          stream: true,
          config: mockConfig,
        }),
      );

      const deltas = events.filter((e) => e.type === 'delta');
      expect(deltas.map((e) => e.content)).toEqual(['Hello ', 'world']);
      const end = events.find((e) => e.type === 'end');
      expect(end.content).toBe('Hello world');
    });

    it('should emit thinking events for a ThinkChunk-only delta', async () => {
      mockChatStream.mockResolvedValue(
        makeStream([
          {
            choices: [
              {
                delta: {
                  content: [
                    {
                      type: 'thinking',
                      thinking: [{ type: 'text', text: 'reasoning...' }],
                    },
                  ],
                },
              },
            ],
          },
          { choices: [{ delta: { content: '' }, finish_reason: 'stop' }] },
        ]),
      );

      const events = await collectEvents(
        await mistralProvider.invoke([{ role: 'user', content: 'Hi' }], {
          stream: true,
          config: mockConfig,
        }),
      );

      const thinking = events.filter((e) => e.type === 'thinking');
      expect(thinking.map((e) => e.content)).toEqual(['reasoning...']);
      expect(events.some((e) => e.type === 'delta')).toBe(false);
    });

    it('should handle the mixed transition delta (closing think + first text)', async () => {
      mockChatStream.mockResolvedValue(
        makeStream([
          {
            choices: [
              {
                delta: {
                  content: [
                    {
                      type: 'thinking',
                      thinking: [{ type: 'text', text: 'done thinking' }],
                    },
                    { type: 'reference', reference_ids: [7] },
                    { type: 'text', text: 'Answer' },
                  ],
                },
              },
            ],
          },
          { choices: [{ delta: { content: ' continues' }, finish_reason: 'stop' }] },
        ]),
      );

      const events = await collectEvents(
        await mistralProvider.invoke([{ role: 'user', content: 'Hi' }], {
          stream: true,
          config: mockConfig,
        }),
      );

      expect(
        events.filter((e) => e.type === 'thinking').map((e) => e.content),
      ).toEqual(['done thinking']);
      expect(
        events.filter((e) => e.type === 'delta').map((e) => e.content),
      ).toEqual(['Answer', ' continues']);
      const end = events.find((e) => e.type === 'end');
      expect(end.content).toBe('Answer continues');
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
        model: 'mistral-medium-3-5',
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
      expect(callArgs.model).toBe('mistral-medium-3-5');

      expect(result).toMatchObject({
        content: 'Test response',
        stop_reason: StopReasons.STOP,
        metadata: {
          model: 'mistral-medium-3-5',
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
        model: 'mistral-medium-3-5',
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

    it('should accept image content for mistral-large-2512', async () => {
      const messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is this?' },
            {
              type: 'image',
              source: { media_type: 'image/jpeg', data: 'base64data' },
            },
          ],
        },
      ];

      await mistralProvider.invoke(messages, {
        model: 'mistral-large-2512',
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

    it('should cap max tokens to model limit', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];

      await mistralProvider.invoke(messages, {
        model: 'mistral-small-2603',
        maxTokens: 100000,
        config: mockConfig,
      });

      const callArgs = mockChatComplete.mock.calls[0][0];
      expect(callArgs.max_tokens).toBe(32768); // Model's max
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
