/**
 * Abliteration Provider Tests
 *
 * Tests the abliteration.ai provider implementation (OpenAI-compatible).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCodes } from '../../../src/providers/interface.js';

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

import OpenAI from 'openai';
import { abliterationProvider } from '../../../src/providers/abliteration.js';
import providerStreamNormalizer from '../../../src/async/providerStreamNormalizer.js';

async function* streamOf(chunks) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

async function collect(generator) {
  const events = [];
  for await (const event of generator) {
    events.push(event);
  }
  return events;
}

const OK_RESPONSE = {
  choices: [
    {
      message: { role: 'assistant', content: 'ok' },
      finish_reason: 'stop',
    },
  ],
  usage: {},
  model: 'abliterated-model-large-v2',
};

const IMAGE_MESSAGE = {
  role: 'user',
  content: [
    { type: 'text', text: 'What is this?' },
    {
      type: 'image',
      source: { media_type: 'image/png', data: 'base64data' },
    },
  ],
};

describe('Abliteration Provider', () => {
  let mockConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue(OK_RESPONSE);

    mockConfig = {
      apiKeys: {
        abliteration: 'ak_test1234567890abcdefghij',
      },
    };
  });

  describe('Configuration', () => {
    it('should accept an ak_ key', () => {
      expect(abliterationProvider.validateConfig(mockConfig)).toBe(true);
      expect(abliterationProvider.isAvailable(mockConfig)).toBe(true);
    });

    it.each([
      {},
      { apiKeys: {} },
      { apiKeys: { abliteration: '' } },
      { apiKeys: { abliteration: 'sk-1234567890abcdefghij' } },
      { apiKeys: { abliteration: 'ak_short' } },
    ])('should reject %j', (config) => {
      expect(abliterationProvider.validateConfig(config)).toBe(false);
    });
  });

  describe('Model Catalog', () => {
    it('should advertise the three abliteration.ai models', () => {
      expect(Object.keys(abliterationProvider.getSupportedModels())).toEqual([
        'abliterated-model-large-v2',
        'abliterated-model-large',
        'abliterated-model',
      ]);
    });

    it('should default to abliterated-model-large-v2', () => {
      expect(abliterationProvider.defaultModel).toBe(
        'abliterated-model-large-v2',
      );
    });

    it('should resolve aliases to canonical IDs', () => {
      expect(
        abliterationProvider.getModelConfig('abliterated-large').modelName,
      ).toBe('abliterated-model-large-v2');
      expect(abliterationProvider.getModelConfig('abliterated').modelName).toBe(
        'abliterated-model',
      );
    });

    it('should mark only the base model as image-capable', () => {
      const models = abliterationProvider.getSupportedModels();
      expect(models['abliterated-model'].supportsImages).toBe(true);
      expect(models['abliterated-model-large-v2'].supportsImages).toBe(false);
      expect(models['abliterated-model-large'].supportsImages).toBe(false);
    });
  });

  describe('Request building', () => {
    it('should target the /v1 base URL', async () => {
      await abliterationProvider.invoke([{ role: 'user', content: 'Hello' }], {
        config: mockConfig,
      });

      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'https://api.abliteration.ai/v1' }),
      );
      expect(mockCreate.mock.calls[0][0].model).toBe(
        'abliterated-model-large-v2',
      );
    });

    it('should cap max tokens to the model limit', async () => {
      await abliterationProvider.invoke([{ role: 'user', content: 'Hello' }], {
        model: 'abliterated-model',
        maxTokens: 500000,
        config: mockConfig,
      });

      expect(mockCreate.mock.calls[0][0].max_tokens).toBe(262134);
    });

    it('should send images to the base model', async () => {
      await abliterationProvider.invoke([IMAGE_MESSAGE], {
        model: 'abliterated-model',
        config: mockConfig,
      });

      const content = mockCreate.mock.calls[0][0].messages[0].content;
      expect(content[1]).toMatchObject({ type: 'image_url' });
    });

    it('should reject images for the text-only large model', async () => {
      await expect(
        abliterationProvider.invoke([IMAGE_MESSAGE], { config: mockConfig }),
      ).rejects.toMatchObject({
        code: ErrorCodes.INVALID_REQUEST,
        message: expect.stringContaining('does not support images'),
      });
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('Reasoning effort mapping', () => {
    async function effortSent(model, reasoning_effort) {
      await abliterationProvider.invoke([{ role: 'user', content: 'Hello' }], {
        model,
        reasoning_effort,
        config: mockConfig,
      });
      return mockCreate.mock.calls[0][0].reasoning_effort;
    }

    it.each([
      ['none', 'low'],
      ['minimal', 'low'],
      ['low', 'low'],
      ['medium', 'high'],
      ['high', 'high'],
      ['xhigh', 'max'],
      ['max', 'max'],
    ])('large-v2: %s → %s', async (requested, expected) => {
      expect(await effortSent('abliterated-model-large-v2', requested)).toBe(
        expected,
      );
    });

    it.each([
      ['none', 'none'],
      ['low', 'high'],
      ['high', 'high'],
      ['xhigh', 'max'],
    ])('large: %s → %s', async (requested, expected) => {
      expect(await effortSent('abliterated-model-large', requested)).toBe(
        expected,
      );
    });

    it.each(['none', 'minimal', 'medium', 'xhigh', 'max'])(
      'base model passes %s through unchanged',
      async (level) => {
        expect(await effortSent('abliterated-model', level)).toBe(level);
      },
    );

    it('should omit reasoning_effort for an unknown pass-through ID', async () => {
      expect(await effortSent('abliterated-model-xl', 'high')).toBeUndefined();
      expect(mockCreate.mock.calls[0][0].model).toBe('abliterated-model-xl');
    });
  });

  describe('Reasoning trace', () => {
    it('should surface non-streaming reasoning_content in metadata', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Final answer.',
              reasoning_content: 'Chain of thought.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {},
        model: 'abliterated-model-large-v2',
      });

      const result = await abliterationProvider.invoke(
        [{ role: 'user', content: 'Hello' }],
        { config: mockConfig },
      );

      expect(result.content).toBe('Final answer.');
      expect(result.metadata.provider).toBe('abliteration');
      expect(result.metadata.reasoning_content).toBe('Chain of thought.');
    });

    it('should stream reasoning as thinking and normalize it as abliteration', async () => {
      mockCreate.mockResolvedValue(
        streamOf([
          {
            choices: [
              { delta: { reasoning_content: 'thinking' }, finish_reason: null },
            ],
          },
          {
            choices: [{ delta: { content: 'answer' }, finish_reason: 'stop' }],
          },
          {
            choices: [],
            usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
          },
        ]),
      );

      const generator = await abliterationProvider.invoke(
        [{ role: 'user', content: 'Hello' }],
        { stream: true, config: mockConfig },
      );
      const events = await collect(
        providerStreamNormalizer.normalize('abliteration', generator, {
          model: 'abliterated-model-large-v2',
        }),
      );

      const end = events.find((e) => e.type === 'end');
      expect(events.map((e) => e.provider)).toEqual(
        events.map(() => 'abliteration'),
      );
      expect(events.some((e) => e.type === 'reasoning' || e.type === 'thinking')).toBe(true);
      expect(end.data.content).toBe('answer');
      expect(end.data.metadata.reasoning).toBe('thinking');
    });
  });

  describe('Error Handling', () => {
    it('should report a missing API key', async () => {
      await expect(
        abliterationProvider.invoke([{ role: 'user', content: 'Hello' }], {
          config: {},
        }),
      ).rejects.toThrow('Abliteration API key not configured');
    });

    it('should map 401 to INVALID_API_KEY', async () => {
      mockCreate.mockRejectedValueOnce({
        response: { status: 401, data: { error: { message: 'Invalid API key' } } },
      });

      await expect(
        abliterationProvider.invoke([{ role: 'user', content: 'Hello' }], {
          config: mockConfig,
        }),
      ).rejects.toMatchObject({ code: ErrorCodes.INVALID_API_KEY });
    });
  });
});
