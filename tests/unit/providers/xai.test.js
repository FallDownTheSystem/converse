/**
 * Unit tests for XAI provider
 * Tests the unified interface implementation without making real API calls.
 * The provider drives the xAI Responses API (`responses.create`), so the
 * mocked SDK exposes a `responses.create` method.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { xaiProvider } from '../../../src/providers/xai.js';

// Mock the OpenAI SDK — xAI uses it pointed at api.x.ai/v1 (Responses API).
vi.mock('openai', () => {
  const MockOpenAI = vi.fn().mockImplementation(function () {
    return {
      responses: {
        create: vi.fn(),
      },
    };
  });

  return {
    default: MockOpenAI,
  };
});

const VALID_KEY = 'xai-1234567890abcdef1234567890abcdef1234567890abcdef';
const validConfig = { apiKeys: { xai: VALID_KEY } };

/**
 * Build a mocked non-streaming Responses API result.
 */
function buildResponse({
  text = 'answer',
  reasoning = null,
  annotations = null,
  model = 'grok-4.5',
} = {}) {
  const messageContent = [{ type: 'output_text', text }];
  if (annotations) {
    messageContent[0].annotations = annotations;
  }
  const output = [];
  if (reasoning) {
    output.push({
      type: 'reasoning',
      summary: [{ type: 'summary_text', text: reasoning }],
    });
  }
  output.push({ type: 'message', content: messageContent });
  return {
    output,
    status: 'completed',
    usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    model,
  };
}

/**
 * Install a mocked `responses.create` and return the mock fn.
 */
async function mockResponsesCreate(impl) {
  const OpenAI = (await import('openai')).default;
  const mockCreate = vi.fn(impl);
  OpenAI.mockImplementation(function () {
    return { responses: { create: mockCreate } };
  });
  return mockCreate;
}

describe('XAI Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateConfig', () => {
    it('should return true for valid XAI API key', () => {
      expect(xaiProvider.validateConfig(validConfig)).toBe(true);
    });

    it('should return false for missing API key', () => {
      expect(xaiProvider.validateConfig({ apiKeys: {} })).toBe(false);
    });

    it('should return false for invalid API key format', () => {
      expect(
        xaiProvider.validateConfig({ apiKeys: { xai: 'invalid-key' } }),
      ).toBe(false);
    });

    it('should return false for OpenAI format key', () => {
      expect(
        xaiProvider.validateConfig({
          apiKeys: { xai: 'sk-1234567890abcdef1234567890abcdef' },
        }),
      ).toBe(false);
    });
  });

  describe('isAvailable', () => {
    it('should return true when config is valid', () => {
      expect(xaiProvider.isAvailable(validConfig)).toBe(true);
    });

    it('should return false when config is invalid', () => {
      expect(xaiProvider.isAvailable({ apiKeys: {} })).toBe(false);
    });
  });

  describe('getSupportedModels (catalog lock)', () => {
    it('should advertise EXACTLY the curated grok-4.5 catalog', () => {
      const models = xaiProvider.getSupportedModels();
      expect(Object.keys(models)).toEqual(['grok-4.5']);
    });

    it('should carry the verified grok-4.5 capabilities', () => {
      const model = xaiProvider.getSupportedModels()['grok-4.5'];
      expect(model.modelName).toBe('grok-4.5');
      expect(model.contextWindow).toBe(500000);
      expect(model.supportsImages).toBe(true);
      expect(model.supportsStreaming).toBe(true);
      expect(model.supportsReasoning).toBe(true);
      expect(model.supportsWebSearch).toBe(true);
    });

    it('should NOT advertise retired grok identifiers', () => {
      const models = xaiProvider.getSupportedModels();
      expect('grok-4-0709' in models).toBe(false);
      expect('grok-4-fast-reasoning' in models).toBe(false);
      expect('grok-code-fast-1' in models).toBe(false);
    });
  });

  describe('getModelConfig', () => {
    it('should return config for the canonical id', () => {
      const config = xaiProvider.getModelConfig('grok-4.5');
      expect(config).toBeTruthy();
      expect(config.modelName).toBe('grok-4.5');
    });

    it('should resolve curated aliases to grok-4.5', () => {
      for (const alias of [
        'grok',
        'grok-4.5-latest',
        'grok-build-latest',
        'GROK-4.5',
      ]) {
        const config = xaiProvider.getModelConfig(alias);
        expect(config).toBeTruthy();
        expect(config.modelName).toBe('grok-4.5');
      }
    });

    it('should return null for unknown/retired model ids', () => {
      expect(xaiProvider.getModelConfig('grok-4-0709')).toBe(null);
      expect(xaiProvider.getModelConfig('unknown-model')).toBe(null);
    });
  });

  describe('invoke - input validation', () => {
    it('should throw for missing API key', async () => {
      await expect(
        xaiProvider.invoke([{ role: 'user', content: 'Hi' }], {
          config: { apiKeys: {} },
        }),
      ).rejects.toThrow(
        expect.objectContaining({ code: 'MISSING_API_KEY' }),
      );
    });

    it('should throw for invalid API key format', async () => {
      await expect(
        xaiProvider.invoke([{ role: 'user', content: 'Hi' }], {
          config: { apiKeys: { xai: 'invalid' } },
        }),
      ).rejects.toThrow(
        expect.objectContaining({ code: 'INVALID_API_KEY' }),
      );
    });

    it('should throw for non-array messages', async () => {
      await expect(
        xaiProvider.invoke('nope', { config: validConfig }),
      ).rejects.toThrow(
        expect.objectContaining({ code: 'INVALID_MESSAGES' }),
      );
    });

    it('should throw for invalid message role', async () => {
      await expect(
        xaiProvider.invoke([{ role: 'invalid', content: 'Hi' }], {
          config: validConfig,
        }),
      ).rejects.toThrow(expect.objectContaining({ code: 'INVALID_ROLE' }));
    });

    it('should throw for missing message content', async () => {
      await expect(
        xaiProvider.invoke([{ role: 'user' }], { config: validConfig }),
      ).rejects.toThrow(
        expect.objectContaining({ code: 'MISSING_CONTENT' }),
      );
    });
  });

  describe('invoke - non-streaming Responses API', () => {
    it('should send messages as Responses API `input`, not `messages`', async () => {
      const mockCreate = await mockResponsesCreate(async () =>
        buildResponse(),
      );

      await xaiProvider.invoke([{ role: 'user', content: 'Hello' }], {
        config: validConfig,
      });

      const payload = mockCreate.mock.calls[0][0];
      expect(payload.input).toEqual([{ role: 'user', content: 'Hello' }]);
      expect(payload.messages).toBeUndefined();
      expect(payload.model).toBe('grok-4.5');
    });

    it('should convert image content to Responses input_image parts', async () => {
      const mockCreate = await mockResponsesCreate(async () =>
        buildResponse(),
      );

      await xaiProvider.invoke(
        [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'describe' },
              {
                type: 'image',
                source: { media_type: 'image/png', data: 'aGVsbG8=' },
              },
            ],
          },
        ],
        { config: validConfig },
      );

      const payload = mockCreate.mock.calls[0][0];
      expect(payload.input[0].content).toEqual([
        { type: 'input_text', text: 'describe' },
        {
          type: 'input_image',
          image_url: 'data:image/png;base64,aGVsbG8=',
        },
      ]);
    });

    it('should parse text, reasoning summary, citations, and usage', async () => {
      await mockResponsesCreate(async () =>
        buildResponse({
          text: 'The answer is 42.',
          reasoning: 'Thought about it carefully.',
          annotations: [
            {
              type: 'url_citation',
              url: 'https://example.com',
              title: 'Example',
            },
          ],
        }),
      );

      const result = await xaiProvider.invoke(
        [{ role: 'user', content: 'Q?' }],
        { config: validConfig },
      );

      expect(result.content).toBe('The answer is 42.');
      expect(result.metadata.reasoning).toBe('Thought about it carefully.');
      expect(result.metadata.citations).toEqual([
        { url: 'https://example.com', title: 'Example' },
      ]);
      expect(result.metadata.usage).toEqual({
        input_tokens: 10,
        output_tokens: 20,
        total_tokens: 30,
      });
      expect(result.metadata.provider).toBe('xai');
    });

    it('should throw NO_RESPONSE_CONTENT when output has no message', async () => {
      await mockResponsesCreate(async () => ({
        output: [
          {
            type: 'reasoning',
            summary: [{ type: 'summary_text', text: 'hmm' }],
          },
        ],
        status: 'completed',
        usage: {},
      }));

      await expect(
        xaiProvider.invoke([{ role: 'user', content: 'Q?' }], {
          config: validConfig,
        }),
      ).rejects.toThrow(
        expect.objectContaining({ code: 'NO_RESPONSE_CONTENT' }),
      );
    });
  });

  describe('reasoning_effort mapping (grok-4.5 low/medium/high, never off)', () => {
    const cases = [
      ['none', 'low'],
      ['minimal', 'low'],
      ['low', 'low'],
      ['medium', 'medium'],
      ['high', 'high'],
      ['max', 'high'],
    ];

    it.each(cases)(
      'maps Converse %s -> grok effort %s',
      async (level, expected) => {
        const mockCreate = await mockResponsesCreate(async () =>
          buildResponse(),
        );

        await xaiProvider.invoke([{ role: 'user', content: 'Hi' }], {
          config: validConfig,
          reasoning_effort: level,
        });

        const payload = mockCreate.mock.calls[0][0];
        expect(payload.reasoning).toEqual({ effort: expected, summary: 'auto' });
        // Never forward an off/none value — grok-4.5 400s on unsupported values.
        expect(['low', 'medium', 'high']).toContain(payload.reasoning.effort);
      },
    );

    it('applies the Converse default (medium) when no reasoning_effort is provided', async () => {
      const mockCreate = await mockResponsesCreate(async () =>
        buildResponse(),
      );

      await xaiProvider.invoke([{ role: 'user', content: 'Hi' }], {
        config: validConfig,
      });

      // invoke defaults reasoning_effort to Converse's 'medium' -> grok medium.
      expect(mockCreate.mock.calls[0][0].reasoning).toEqual({
        effort: 'medium',
        summary: 'auto',
      });
    });
  });

  describe('web search capability gate', () => {
    it('attaches the web_search Agent Tool for grok-4.5 (supportsWebSearch)', async () => {
      const mockCreate = await mockResponsesCreate(async () =>
        buildResponse(),
      );

      await xaiProvider.invoke([{ role: 'user', content: 'news?' }], {
        config: validConfig,
        model: 'grok-4.5',
      });

      const payload = mockCreate.mock.calls[0][0];
      expect(payload.tools).toEqual([{ type: 'web_search' }]);
      // Legacy Chat Completions search field must NOT be present.
      expect(payload.search_parameters).toBeUndefined();
    });

    it('does NOT attach web search or reasoning for an unknown pass-through id', async () => {
      const mockCreate = await mockResponsesCreate(async () =>
        buildResponse({ model: 'grok-4-0709' }),
      );

      // Retired id passes through unchanged; modelConfig is empty so no
      // capability-gated fields are attached (avoids grok-4.5-only HTTP 400s).
      await xaiProvider.invoke([{ role: 'user', content: 'Hi' }], {
        config: validConfig,
        model: 'grok-4-0709',
        reasoning_effort: 'high',
      });

      const payload = mockCreate.mock.calls[0][0];
      expect(payload.model).toBe('grok-4-0709');
      expect(payload.tools).toBeUndefined();
      expect(payload.reasoning).toBeUndefined();
    });
  });

  describe('invoke - error handling', () => {
    it('normalizes model_not_found into MODEL_NOT_FOUND', async () => {
      await mockResponsesCreate(async () => {
        const err = new Error('nope');
        err.code = 'model_not_found';
        throw err;
      });

      await expect(
        xaiProvider.invoke([{ role: 'user', content: 'Hi' }], {
          config: validConfig,
        }),
      ).rejects.toThrow(
        expect.objectContaining({ code: 'MODEL_NOT_FOUND' }),
      );
    });

    it('honors an already-aborted signal', async () => {
      await mockResponsesCreate(async () => buildResponse());
      const controller = new AbortController();
      controller.abort('user cancelled');

      await expect(
        xaiProvider.invoke([{ role: 'user', content: 'Hi' }], {
          config: validConfig,
          signal: controller.signal,
        }),
      ).rejects.toThrow(/aborted/i);
    });
  });

  describe('streaming (Responses API events)', () => {
    it('emits start/delta/thinking/usage/end with reasoning kept separate', async () => {
      await mockResponsesCreate(async () => ({
        async *[Symbol.asyncIterator]() {
          yield {
            type: 'response.reasoning_summary_text.delta',
            delta: 'Let me think. ',
          };
          yield { type: 'response.output_text.delta', delta: 'Hello' };
          yield { type: 'response.output_text.delta', delta: ' world' };
          yield {
            type: 'response.completed',
            response: {
              status: 'completed',
              model: 'grok-4.5',
              usage: {
                input_tokens: 5,
                output_tokens: 7,
                total_tokens: 12,
              },
            },
          };
        },
      }));

      const result = await xaiProvider.invoke(
        [{ role: 'user', content: 'Hi' }],
        { config: validConfig, stream: true },
      );

      const events = [];
      for await (const event of result) {
        events.push(event);
      }

      expect(events[0]).toMatchObject({ type: 'start', provider: 'xai' });

      const thinking = events.filter((e) => e.type === 'thinking');
      expect(thinking).toHaveLength(1);
      expect(thinking[0].content).toBe('Let me think. ');

      const deltas = events.filter((e) => e.type === 'delta');
      expect(deltas.map((d) => d.content).join('')).toBe('Hello world');

      const usage = events.find((e) => e.type === 'usage');
      expect(usage.usage.total_tokens).toBe(12);

      const end = events.find((e) => e.type === 'end');
      expect(end.content).toBe('Hello world');
      expect(end.metadata.reasoning).toBe('Let me think. ');
    });

    it('emits a single thinking event when reasoning arrives only on done', async () => {
      await mockResponsesCreate(async () => ({
        async *[Symbol.asyncIterator]() {
          yield {
            type: 'response.reasoning_summary_text.done',
            text: 'Full reasoning summary.',
          };
          yield { type: 'response.output_text.delta', delta: 'answer' };
          yield {
            type: 'response.completed',
            response: { status: 'completed', model: 'grok-4.5' },
          };
        },
      }));

      const result = await xaiProvider.invoke(
        [{ role: 'user', content: 'Hi' }],
        { config: validConfig, stream: true },
      );

      const thinking = [];
      for await (const event of result) {
        if (event.type === 'thinking') thinking.push(event);
      }
      expect(thinking).toHaveLength(1);
      expect(thinking[0].content).toBe('Full reasoning summary.');
    });

    it('yields an error event when the stream throws', async () => {
      await mockResponsesCreate(async () => ({
        async *[Symbol.asyncIterator]() {
          yield { type: 'response.output_text.delta', delta: 'Hi' };
          throw new Error('Stream connection lost');
        },
      }));

      const result = await xaiProvider.invoke(
        [{ role: 'user', content: 'Hi' }],
        { config: validConfig, stream: true },
      );

      const events = [];
      try {
        for await (const event of result) {
          events.push(event);
        }
      } catch (error) {
        expect(error.name).toBe('XAIProviderError');
      }

      expect(events[0].type).toBe('start');
      expect(events.some((e) => e.type === 'delta')).toBe(true);
      expect(events[events.length - 1].type).toBe('error');
    });
  });
});
