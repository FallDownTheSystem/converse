/**
 * OpenAI-Compatible Base — Foundation reasoning/hook contracts (task-015)
 *
 * Covers the shared contracts the DeepSeek and OpenRouter phases depend on:
 *  - transformRequest receives { reasoningEffort, signal }
 *  - async resolveModelConfig hook supplies a request-local model config
 *  - non-streaming: reasoning_content captured; empty content with reasoning
 *    (or tool_calls) does not throw NO_RESPONSE_CONTENT
 *  - streaming: delta.reasoning_content yields a `thinking` event
 *  - streaming transformStreamChunk hook: events, metadataPatch, suppressDefault,
 *    and terminalError (one failure event, no later `end`, prior deltas intact)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreate = vi.fn();

vi.mock('openai', () => ({
  default: vi.fn(function () {
    return { chat: { completions: { create: mockCreate } } };
  }),
}));

import { createOpenAICompatibleProvider } from '../../../src/providers/openai-compatible.js';

const apiKeyConfig = { apiKeys: { testprovider: 'test-key' } };

function baseModels(extra = {}) {
  return {
    'test-model': {
      modelName: 'test-model',
      contextWindow: 8192,
      maxOutputTokens: 4096,
      supportsStreaming: true,
      supportsImages: true,
      supportsReasoning: true,
      ...extra,
    },
  };
}

async function* streamOf(chunks) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

async function collect(gen) {
  const events = [];
  for await (const ev of gen) events.push(ev);
  return events;
}

describe('OpenAI-Compatible Foundation contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('transformRequest context (F4)', () => {
    it('receives reasoningEffort and signal', async () => {
      const transformRequest = vi.fn((payload) => payload);
      const provider = createOpenAICompatibleProvider({
        providerName: 'TestProvider',
        baseURL: 'https://x',
        supportedModels: baseModels(),
        transformRequest,
      });
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
        usage: {},
      });

      const controller = new AbortController();
      await provider.invoke([{ role: 'user', content: 'hi' }], {
        model: 'test-model',
        reasoning_effort: 'high',
        signal: controller.signal,
        config: apiKeyConfig,
      });

      expect(transformRequest).toHaveBeenCalledTimes(1);
      const ctx = transformRequest.mock.calls[0][1];
      expect(ctx.reasoningEffort).toBe('high');
      expect(ctx.signal).toBe(controller.signal);
      expect(ctx.modelConfig.supportsReasoning).toBe(true);
    });

    it('never forwards reasoning_effort or web_search to the API payload', async () => {
      const provider = createOpenAICompatibleProvider({
        providerName: 'TestProvider',
        baseURL: 'https://x',
        supportedModels: baseModels(),
      });
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
        usage: {},
      });

      await provider.invoke([{ role: 'user', content: 'hi' }], {
        model: 'test-model',
        reasoning_effort: 'high',
        web_search: true,
        config: apiKeyConfig,
      });

      const payload = mockCreate.mock.calls[0][0];
      expect(payload.reasoning_effort).toBeUndefined();
      expect(payload.web_search).toBeUndefined();
    });
  });

  describe('resolveModelConfig hook (F4)', () => {
    it('uses the request-local dynamic config for capability gating', async () => {
      const resolveModelConfig = vi.fn(async () => ({
        modelName: 'dyn',
        supportsImages: false,
        supportsReasoning: false,
        timeout: 12345,
      }));
      const transformRequest = vi.fn((payload) => payload);
      const provider = createOpenAICompatibleProvider({
        providerName: 'TestProvider',
        baseURL: 'https://x',
        supportedModels: baseModels(),
        resolveModelConfig,
        transformRequest,
      });
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
        usage: {},
      });

      await provider.invoke([{ role: 'user', content: 'hi' }], {
        model: 'test-model',
        config: apiKeyConfig,
      });

      expect(resolveModelConfig).toHaveBeenCalledWith(
        'test-model',
        expect.objectContaining({ config: apiKeyConfig }),
      );
      // The dynamic config reached transformRequest.
      expect(transformRequest.mock.calls[0][1].modelConfig.timeout).toBe(12345);
    });

    it('propagates an authoritative catalog-miss thrown by the hook', async () => {
      const resolveModelConfig = vi.fn(async () => {
        const err = new Error('Model not found');
        err.code = 'MODEL_NOT_FOUND';
        throw err;
      });
      const provider = createOpenAICompatibleProvider({
        providerName: 'TestProvider',
        baseURL: 'https://x',
        supportedModels: baseModels(),
        resolveModelConfig,
      });

      await expect(
        provider.invoke([{ role: 'user', content: 'hi' }], {
          model: 'unknown/slug',
          config: apiKeyConfig,
        }),
      ).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' });
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('non-streaming reasoning + validity (F5)', () => {
    function provider() {
      return createOpenAICompatibleProvider({
        providerName: 'TestProvider',
        baseURL: 'https://x',
        supportedModels: baseModels(),
      });
    }

    it('captures reasoning_content and does not throw on empty content', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { content: '', reasoning_content: 'thinking hard' },
            finish_reason: 'stop',
          },
        ],
        usage: {},
      });
      const result = await provider().invoke(
        [{ role: 'user', content: 'hi' }],
        { model: 'test-model', config: apiKeyConfig },
      );
      expect(result.content).toBe('');
      expect(result.metadata.reasoning_content).toBe('thinking hard');
    });

    it('accepts a turn with empty content but non-empty tool_calls', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { content: null, tool_calls: [{ id: 't1' }] },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {},
      });
      const result = await provider().invoke(
        [{ role: 'user', content: 'hi' }],
        { model: 'test-model', config: apiKeyConfig },
      );
      expect(result.content).toBe('');
    });

    it('still throws when content and all reasoning/tool fields are empty', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { content: '', reasoning_content: '', tool_calls: [] },
            finish_reason: 'stop',
          },
        ],
        usage: {},
      });
      await expect(
        provider().invoke([{ role: 'user', content: 'hi' }], {
          model: 'test-model',
          config: apiKeyConfig,
        }),
      ).rejects.toMatchObject({ code: 'NO_RESPONSE_CONTENT' });
    });
  });

  describe('streaming reasoning + hooks (F6)', () => {
    it('emits a thinking event for delta.reasoning_content', async () => {
      mockCreate.mockResolvedValue(
        streamOf([
          { choices: [{ delta: { reasoning_content: 'pondering' } }] },
          { choices: [{ delta: { content: 'answer' }, finish_reason: 'stop' }] },
        ]),
      );
      const provider = createOpenAICompatibleProvider({
        providerName: 'TestProvider',
        baseURL: 'https://x',
        supportedModels: baseModels(),
      });
      const events = await collect(
        await provider.invoke([{ role: 'user', content: 'hi' }], {
          model: 'test-model',
          stream: true,
          config: apiKeyConfig,
        }),
      );
      const thinking = events.find((e) => e.type === 'thinking');
      expect(thinking?.content).toBe('pondering');
      const end = events.find((e) => e.type === 'end');
      expect(end.content).toBe('answer');
    });

    it('applies transformStreamChunk events, metadataPatch, and suppressDefault', async () => {
      const transformStreamChunk = vi.fn((chunk) => {
        if (chunk.marker === 'patch') {
          return { metadataPatch: { actual_provider: 'upstream' } };
        }
        if (chunk.marker === 'suppress') {
          return {
            suppressDefault: true,
            events: [{ type: 'thinking', content: 'via-hook' }],
          };
        }
        return {};
      });
      mockCreate.mockResolvedValue(
        streamOf([
          { marker: 'suppress', choices: [{ delta: { content: 'DROP' } }] },
          { choices: [{ delta: { content: 'kept' } }] },
          { marker: 'patch', choices: [{ delta: {}, finish_reason: 'stop' }] },
        ]),
      );
      const provider = createOpenAICompatibleProvider({
        providerName: 'TestProvider',
        baseURL: 'https://x',
        supportedModels: baseModels(),
        transformStreamChunk,
      });
      const events = await collect(
        await provider.invoke([{ role: 'user', content: 'hi' }], {
          model: 'test-model',
          stream: true,
          config: apiKeyConfig,
        }),
      );
      // Suppressed chunk's content is not emitted as a delta.
      const deltas = events.filter((e) => e.type === 'delta').map((e) => e.content);
      expect(deltas).toEqual(['kept']);
      expect(events.some((e) => e.type === 'thinking' && e.content === 'via-hook')).toBe(true);
      const end = events.find((e) => e.type === 'end');
      expect(end.content).toBe('kept');
      expect(end.metadata.actual_provider).toBe('upstream');
    });

    it('terminalError emits one failure event, no end, keeping prior deltas', async () => {
      const transformStreamChunk = vi.fn((chunk) => {
        if (chunk.fail) {
          return { terminalError: { message: 'provider disconnected', code: 'server_error' } };
        }
        return {};
      });
      mockCreate.mockResolvedValue(
        streamOf([
          { choices: [{ delta: { content: 'partial' } }] },
          { fail: true, choices: [{ delta: {}, finish_reason: 'error' }] },
          { choices: [{ delta: { content: 'should-not-appear' } }] },
        ]),
      );
      const provider = createOpenAICompatibleProvider({
        providerName: 'TestProvider',
        baseURL: 'https://x',
        supportedModels: baseModels(),
        transformStreamChunk,
      });
      const events = await collect(
        await provider.invoke([{ role: 'user', content: 'hi' }], {
          model: 'test-model',
          stream: true,
          config: apiKeyConfig,
        }),
      );
      const deltas = events.filter((e) => e.type === 'delta').map((e) => e.content);
      expect(deltas).toEqual(['partial']);
      const errors = events.filter((e) => e.type === 'error');
      expect(errors).toHaveLength(1);
      expect(errors[0].error.recoverable).toBe(false);
      expect(errors[0].error.message).toBe('provider disconnected');
      expect(events.some((e) => e.type === 'end')).toBe(false);
    });
  });
});
