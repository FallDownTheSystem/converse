/**
 * OpenRouter Provider Tests
 *
 * Tests the OpenRouter provider implementation (OpenAI-compatible): curated
 * catalog lock, metadata-driven reasoning mapping, usage.cost/provider/citation
 * metadata, `:online` web-search opt-in, in-band SSE error termination, optional
 * attribution headers, and request-local discovery.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCodes, StopReasons } from '../../../src/providers/interface.js';

// Mock the OpenAI module — capture constructor options (for header assertions)
// and the create() calls.
const mockCreate = vi.fn();
const mockOpenAICtor = vi.fn();

vi.mock('openai', () => {
  const mockOpenAI = vi.fn(function (clientOptions) {
    mockOpenAICtor(clientOptions);
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

// Mock the discovery adapter so no real network happens.
const mockLookup = vi.fn();
vi.mock('../../../src/providers/openrouter-discovery.js', () => ({
  lookupOpenRouterModel: (...args) => mockLookup(...args),
  DiscoveryStatus: {
    OK: 'ok',
    CATALOG_MISS: 'catalog_miss',
    AUTH: 'auth',
    RATE_LIMIT: 'rate_limit',
    TIMEOUT: 'timeout',
    MALFORMED: 'malformed',
  },
}));

// Import provider AFTER setting up the mocks
import { openrouterProvider } from '../../../src/providers/openrouter.js';

const CURATED_SLUGS = [
  'z-ai/glm-5.2',
  'deepseek/deepseek-v4-pro',
  'deepseek/deepseek-v4-flash',
  'qwen/qwen3.7-max',
  'qwen/qwen3.7-plus',
  'moonshotai/kimi-k2.7-code',
  'moonshotai/kimi-k2.6',
  'openrouter/auto',
];

function makeResponse(overrides = {}) {
  return {
    id: 'chatcmpl-openrouter-123',
    object: 'chat.completion',
    created: 1234567890,
    model: 'z-ai/glm-5.2',
    provider: 'z-ai',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: 'Test response' },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
    },
    ...overrides,
  };
}

// Build an async iterable stream from an array of chunks.
function makeStream(chunks) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

async function collect(generator) {
  const events = [];
  for await (const event of generator) {
    events.push(event);
  }
  return events;
}

describe('OpenRouter Provider', () => {
  let mockConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockReset();
    mockOpenAICtor.mockReset();
    mockLookup.mockReset();

    mockConfig = {
      apiKeys: {
        openrouter: 'sk-or-test-1234567890abcdefghijklmnopqrstuvwxyz1234',
      },
      providers: {
        openrouterReferer: 'https://test.example.com',
      },
    };

    mockCreate.mockResolvedValue(makeResponse());
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
        {
          apiKeys: {
            openrouter: 'wrong-prefix-1234567890abcdefghijklmnopqrstuvwxyz',
          },
        },
      ];

      invalidConfigs.forEach((config) => {
        expect(openrouterProvider.validateConfig(config)).toBe(false);
      });
    });
  });

  describe('Curated catalog (locked)', () => {
    it('returns exactly the 8 curated slugs', () => {
      const models = openrouterProvider.getSupportedModels();
      expect(Object.keys(models).sort()).toEqual([...CURATED_SLUGS].sort());
    });

    it('defaults its capability flags per research (glm-5.2 default, text-only)', () => {
      const glm = openrouterProvider.getModelConfig('z-ai/glm-5.2');
      expect(glm.modelName).toBe('z-ai/glm-5.2');
      expect(glm.contextWindow).toBe(1048576);
      expect(glm.supportsImages).toBe(false);
      expect(glm.supportsWebSearch).toBe(false);
      expect(glm.supportsReasoning).toBe(true);
    });

    it('marks every curated model supportsWebSearch:false (web search is opt-in)', () => {
      const models = openrouterProvider.getSupportedModels();
      for (const slug of CURATED_SLUGS) {
        expect(models[slug].supportsWebSearch).toBe(false);
      }
    });

    it('keeps the catalog at 8 slugs even after a discovery call has run', async () => {
      mockLookup.mockResolvedValueOnce({
        status: 'ok',
        modelConfig: {
          modelName: 'anthropic/claude-x',
          supportsStreaming: true,
          supportsImages: false,
          supportsReasoning: false,
          timeout: 300000,
        },
      });
      await openrouterProvider.invoke([{ role: 'user', content: 'Hi' }], {
        model: 'anthropic/claude-x',
        config: mockConfig,
      });
      const models = openrouterProvider.getSupportedModels();
      expect(Object.keys(models).sort()).toEqual([...CURATED_SLUGS].sort());
    });

    it('curated image-capable models expose supportsImages:true', () => {
      const models = openrouterProvider.getSupportedModels();
      expect(models['qwen/qwen3.7-plus'].supportsImages).toBe(true);
      expect(models['moonshotai/kimi-k2.7-code'].supportsImages).toBe(true);
      expect(models['moonshotai/kimi-k2.6'].supportsImages).toBe(true);
      expect(models['deepseek/deepseek-v4-pro'].supportsImages).toBe(false);
    });
  });

  describe('Reasoning request mapping (metadata-driven, capability-gated)', () => {
    async function reasoningFor(model, reasoning_effort) {
      mockCreate.mockResolvedValueOnce(makeResponse({ model }));
      await openrouterProvider.invoke([{ role: 'user', content: 'Hi' }], {
        model,
        reasoning_effort,
        config: mockConfig,
      });
      return mockCreate.mock.calls.at(-1)[0].reasoning;
    }

    it('effort-tiered model (glm-5.2) clamps into supported_efforts', async () => {
      expect(await reasoningFor('z-ai/glm-5.2', 'max')).toEqual({
        effort: 'xhigh',
      });
      expect(await reasoningFor('z-ai/glm-5.2', 'xhigh')).toEqual({
        effort: 'xhigh',
      });
      expect(await reasoningFor('z-ai/glm-5.2', 'high')).toEqual({
        effort: 'high',
      });
      expect(await reasoningFor('z-ai/glm-5.2', 'medium')).toEqual({
        effort: 'high',
      });
      expect(await reasoningFor('z-ai/glm-5.2', 'low')).toEqual({
        effort: 'high',
      });
      expect(await reasoningFor('z-ai/glm-5.2', 'minimal')).toEqual({
        effort: 'high',
      });
      expect(await reasoningFor('z-ai/glm-5.2', 'none')).toEqual({
        enabled: false,
      });
    });

    it('mandatory-reasoning model (kimi-k2.7-code) is always enabled, even for none', async () => {
      expect(
        await reasoningFor('moonshotai/kimi-k2.7-code', 'none'),
      ).toEqual({ enabled: true });
      expect(
        await reasoningFor('moonshotai/kimi-k2.7-code', 'max'),
      ).toEqual({ enabled: true });
    });

    it('binary (enable/disable-only) model (qwen3.7-max) toggles enabled', async () => {
      expect(await reasoningFor('qwen/qwen3.7-max', 'none')).toEqual({
        enabled: false,
      });
      expect(await reasoningFor('qwen/qwen3.7-max', 'medium')).toEqual({
        enabled: true,
      });
      expect(await reasoningFor('qwen/qwen3.7-max', 'max')).toEqual({
        enabled: true,
      });
    });

    it('openrouter/auto passes through with no fabricated reasoning field', async () => {
      expect(await reasoningFor('openrouter/auto', 'high')).toBeUndefined();
    });

    it('never sends exclude:true for none (uses enabled:false)', async () => {
      const reasoning = await reasoningFor('deepseek/deepseek-v4-pro', 'none');
      expect(reasoning).toEqual({ enabled: false });
      expect(reasoning.exclude).toBeUndefined();
    });

    it('unknown pass-through slug (conservative discovery) receives no reasoning field', async () => {
      // Transient discovery failure → conservative config with no reasoning.
      mockLookup.mockResolvedValueOnce({ status: 'timeout', modelConfig: null });
      mockCreate.mockResolvedValueOnce(makeResponse({ model: 'foo/bar-legacy' }));
      await openrouterProvider.invoke([{ role: 'user', content: 'Hi' }], {
        model: 'foo/bar-legacy',
        reasoning_effort: 'high',
        config: mockConfig,
      });
      expect(mockCreate.mock.calls.at(-1)[0].reasoning).toBeUndefined();
    });
  });

  describe('Web search opt-in (:online)', () => {
    it('attaches the web plugin exactly once when web_search is set', async () => {
      await openrouterProvider.invoke([{ role: 'user', content: 'Hi' }], {
        model: 'z-ai/glm-5.2',
        web_search: true,
        config: mockConfig,
      });
      const payload = mockCreate.mock.calls.at(-1)[0];
      expect(payload.plugins).toEqual([{ id: 'web' }]);
      expect(payload.model).toBe('z-ai/glm-5.2'); // no :online suffix
    });

    it('ordinary requests attach no plugin / no :online / no web-search option', async () => {
      await openrouterProvider.invoke([{ role: 'user', content: 'Hi' }], {
        model: 'z-ai/glm-5.2',
        config: mockConfig,
      });
      const payload = mockCreate.mock.calls.at(-1)[0];
      expect(payload.plugins).toBeUndefined();
      expect(payload.web_search).toBeUndefined();
      expect(payload.model).not.toContain(':online');
    });

    it('captures url_citation annotations into metadata (non-streaming)', async () => {
      mockCreate.mockResolvedValueOnce(
        makeResponse({
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Answer',
                annotations: [
                  {
                    type: 'url_citation',
                    url_citation: {
                      url: 'https://example.com/a',
                      title: 'A',
                    },
                  },
                ],
              },
              finish_reason: 'stop',
            },
          ],
        }),
      );
      const result = await openrouterProvider.invoke(
        [{ role: 'user', content: 'Hi' }],
        { model: 'z-ai/glm-5.2', web_search: true, config: mockConfig },
      );
      expect(result.metadata.citations).toHaveLength(1);
      expect(result.metadata.citations[0].url_citation.url).toBe(
        'https://example.com/a',
      );
    });
  });

  describe('Usage / provider metadata', () => {
    it('captures usage.cost, cost_details and actual_provider', async () => {
      mockCreate.mockResolvedValueOnce(
        makeResponse({
          provider: 'z-ai',
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
            cost: 0.95,
            cost_details: { upstream_inference_cost: 19 },
          },
        }),
      );
      const result = await openrouterProvider.invoke(
        [{ role: 'user', content: 'Hi' }],
        { model: 'z-ai/glm-5.2', config: mockConfig },
      );
      expect(result.metadata).toMatchObject({
        request_id: 'chatcmpl-openrouter-123',
        actual_provider: 'z-ai',
        cost: 0.95,
        cost_details: { upstream_inference_cost: 19 },
        provider: 'openrouter',
      });
    });

    it('surfaces reasoning_details text but never the encrypted ciphertext', async () => {
      mockCreate.mockResolvedValueOnce(
        makeResponse({
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Final answer',
                reasoning_details: [
                  { type: 'reasoning.text', text: 'step one ' },
                  { type: 'reasoning.encrypted', data: 'eyJlbmMi...' },
                  { type: 'reasoning.summary', summary: 'summary tail' },
                ],
              },
              finish_reason: 'stop',
            },
          ],
        }),
      );
      const result = await openrouterProvider.invoke(
        [{ role: 'user', content: 'Hi' }],
        { model: 'z-ai/glm-5.2', config: mockConfig },
      );
      expect(result.metadata.reasoning).toBe('step one summary tail');
      expect(result.metadata.reasoning).not.toContain('eyJlbmMi');
      expect(result.metadata.reasoning_details).toHaveLength(3);
    });
  });

  describe('Streaming', () => {
    it('captures cost/provider/citations via metadataPatch on the end event', async () => {
      mockCreate.mockResolvedValueOnce(
        makeStream([
          {
            id: 'gen-1',
            provider: 'z-ai',
            choices: [{ index: 0, delta: { content: 'Hello' } }],
          },
          {
            choices: [
              {
                index: 0,
                delta: {
                  annotations: [
                    {
                      type: 'url_citation',
                      url_citation: { url: 'https://example.com/x' },
                    },
                  ],
                },
              },
            ],
          },
          {
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            usage: {
              prompt_tokens: 5,
              completion_tokens: 3,
              total_tokens: 8,
              cost: 0.42,
              cost_details: { upstream_inference_cost: 7 },
            },
          },
        ]),
      );
      const events = await collect(
        await openrouterProvider.invoke([{ role: 'user', content: 'Hi' }], {
          model: 'z-ai/glm-5.2',
          stream: true,
          web_search: true,
          config: mockConfig,
        }),
      );
      const end = events.find((e) => e.type === 'end');
      expect(end).toBeDefined();
      expect(end.content).toBe('Hello');
      expect(end.metadata.cost).toBe(0.42);
      expect(end.metadata.actual_provider).toBe('z-ai');
      expect(end.metadata.request_id).toBe('gen-1');
      expect(end.metadata.citations).toHaveLength(1);
    });

    it('emits streamed reasoning_details as thinking events', async () => {
      mockCreate.mockResolvedValueOnce(
        makeStream([
          {
            choices: [
              {
                index: 0,
                delta: {
                  reasoning_details: [
                    { type: 'reasoning.text', text: 'thinking...' },
                  ],
                },
              },
            ],
          },
          {
            choices: [{ index: 0, delta: { content: 'Done' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          },
        ]),
      );
      const events = await collect(
        await openrouterProvider.invoke([{ role: 'user', content: 'Hi' }], {
          model: 'z-ai/glm-5.2',
          stream: true,
          config: mockConfig,
        }),
      );
      const thinking = events.filter((e) => e.type === 'thinking');
      expect(thinking).toHaveLength(1);
      expect(thinking[0].content).toBe('thinking...');
    });

    it('in-band error chunk terminates the stream as failed, preserving prior text', async () => {
      mockCreate.mockResolvedValueOnce(
        makeStream([
          { choices: [{ index: 0, delta: { content: 'Partial ' } }] },
          {
            id: 'gen-err',
            provider: 'openai',
            error: { code: 'server_error', message: 'Provider disconnected' },
            choices: [{ index: 0, delta: { content: '' }, finish_reason: 'error' }],
          },
          // Anything after the error must not be reached.
          { choices: [{ index: 0, delta: { content: 'should not appear' } }] },
        ]),
      );
      const events = await collect(
        await openrouterProvider.invoke([{ role: 'user', content: 'Hi' }], {
          model: 'z-ai/glm-5.2',
          stream: true,
          config: mockConfig,
        }),
      );
      const deltas = events.filter((e) => e.type === 'delta');
      expect(deltas.map((d) => d.content).join('')).toBe('Partial ');
      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent.error.recoverable).toBe(false);
      expect(errorEvent.error.message).toContain('Provider disconnected');
      // Terminal error → no later end event.
      expect(events.find((e) => e.type === 'end')).toBeUndefined();
      // The chunk after the error must not have produced a delta.
      expect(deltas.map((d) => d.content).join('')).not.toContain(
        'should not appear',
      );
    });
  });

  describe('Attribution headers (optional)', () => {
    it('omitting referer is valid and sends no HTTP-Referer', async () => {
      await openrouterProvider.invoke([{ role: 'user', content: 'Hi' }], {
        model: 'z-ai/glm-5.2',
        config: {
          apiKeys: {
            openrouter: 'sk-or-test-1234567890abcdefghijklmnopqrstuvwxyz1234',
          },
        },
      });
      const clientOptions = mockOpenAICtor.mock.calls.at(-1)[0];
      expect(clientOptions.defaultHeaders['HTTP-Referer']).toBeUndefined();
    });

    it('sends a single canonical X-OpenRouter-Title (not X-Title) when configured', async () => {
      await openrouterProvider.invoke([{ role: 'user', content: 'Hi' }], {
        model: 'z-ai/glm-5.2',
        config: {
          ...mockConfig,
          providers: {
            ...mockConfig.providers,
            openrouterTitle: 'My App',
          },
        },
      });
      const headers = mockOpenAICtor.mock.calls.at(-1)[0].defaultHeaders;
      expect(headers['X-OpenRouter-Title']).toBe('My App');
      expect(headers['X-Title']).toBeUndefined();
      expect(headers['HTTP-Referer']).toBe('https://test.example.com');
    });
  });

  describe('Discovery (explicit non-curated slug)', () => {
    it('proceeds with conservative caps when discovery is transiently unavailable', async () => {
      mockLookup.mockResolvedValueOnce({ status: 'timeout', modelConfig: null });
      mockCreate.mockResolvedValueOnce(makeResponse({ model: 'foo/bar' }));
      const result = await openrouterProvider.invoke(
        [{ role: 'user', content: 'Hi' }],
        { model: 'foo/bar', config: mockConfig },
      );
      expect(mockLookup).toHaveBeenCalledWith('foo/bar', expect.any(Object));
      expect(result.content).toBe('Test response');
    });

    it('fails before inference with MODEL_NOT_FOUND on an authoritative catalog-miss', async () => {
      mockLookup.mockResolvedValueOnce({
        status: 'catalog_miss',
        modelConfig: null,
      });
      await expect(
        openrouterProvider.invoke([{ role: 'user', content: 'Hi' }], {
          model: 'ghost/model',
          config: mockConfig,
        }),
      ).rejects.toMatchObject({ code: ErrorCodes.MODEL_NOT_FOUND });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('does not call discovery for static curated slugs', async () => {
      await openrouterProvider.invoke([{ role: 'user', content: 'Hi' }], {
        model: 'z-ai/glm-5.2',
        config: mockConfig,
      });
      expect(mockLookup).not.toHaveBeenCalled();
    });

    it('passes a rolling alias (~author/model-latest) through without discovery or a catalog-miss', async () => {
      // Rolling aliases resolve server-side and never appear under that name in
      // the bulk catalog, so discovery must be skipped and MODEL_NOT_FOUND must
      // not fire — the request proceeds to inference (AC3).
      mockCreate.mockResolvedValueOnce(
        makeResponse({ model: '~author/model-latest' }),
      );
      const result = await openrouterProvider.invoke(
        [{ role: 'user', content: 'Hi' }],
        { model: '~author/model-latest', config: mockConfig },
      );
      expect(mockLookup).not.toHaveBeenCalled();
      expect(result.content).toBe('Test response');
    });

    it('uses discovered metadata when discovery succeeds', async () => {
      mockLookup.mockResolvedValueOnce({
        status: 'ok',
        modelConfig: {
          modelName: 'foo/bar',
          contextWindow: 100000,
          maxOutputTokens: 4096,
          supportsStreaming: true,
          supportsImages: false,
          supportsReasoning: true,
          reasoning: { mandatory: false, default_enabled: true },
          timeout: 300000,
        },
      });
      mockCreate.mockResolvedValueOnce(makeResponse({ model: 'foo/bar' }));
      await openrouterProvider.invoke([{ role: 'user', content: 'Hi' }], {
        model: 'foo/bar',
        reasoning_effort: 'high',
        config: mockConfig,
      });
      // Binary reasoning metadata → enabled:true.
      expect(mockCreate.mock.calls.at(-1)[0].reasoning).toEqual({
        enabled: true,
      });
    });
  });

  describe('Stop reason mapping', () => {
    const cases = [
      ['stop', StopReasons.STOP],
      ['length', StopReasons.LENGTH],
      ['content_filter', StopReasons.CONTENT_FILTER],
      ['tool_calls', StopReasons.TOOL_USE],
    ];

    cases.forEach(([finish, expected]) => {
      it(`maps finish_reason "${finish}" to "${expected}"`, async () => {
        mockCreate.mockResolvedValueOnce(
          makeResponse({
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'x' },
                finish_reason: finish,
              },
            ],
          }),
        );
        const result = await openrouterProvider.invoke(
          [{ role: 'user', content: 'Hi' }],
          { model: 'z-ai/glm-5.2', config: mockConfig },
        );
        expect(result.stop_reason).toBe(expected);
      });
    });
  });

  describe('Error handling', () => {
    it('handles missing API key', async () => {
      await expect(
        openrouterProvider.invoke([{ role: 'user', content: 'Hi' }], {
          config: { providers: {} },
        }),
      ).rejects.toThrow('OpenRouter API key not configured');
    });

    it('does not require a referer to invoke', async () => {
      await expect(
        openrouterProvider.invoke([{ role: 'user', content: 'Hi' }], {
          model: 'z-ai/glm-5.2',
          config: {
            apiKeys: {
              openrouter: 'sk-or-test-1234567890abcdefghijklmnopqrstuvwxyz1234',
            },
          },
        }),
      ).resolves.toBeDefined();
    });
  });
});
