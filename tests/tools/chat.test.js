import { describe, it, expect, beforeEach, vi } from 'vitest';
import { chatTool } from '../../src/tools/chat.js';
import * as fileValidator from '../../src/utils/fileValidator.js';

vi.mock('../../src/utils/fileValidator.js');

describe('Chat Tool (unified) — chat mode', () => {
  let mockDependencies;
  let mockConfig;
  let mockContinuationStore;
  let mockProviders;
  let mockContextProcessor;

  beforeEach(() => {
    vi.mocked(fileValidator.validateAllPaths).mockResolvedValue({
      valid: true,
      errors: [],
    });

    mockConfig = {
      apiKeys: { openai: 'sk-test-key', xai: 'xai-test-key', google: 'google-test-key' },
      providers: { xaiBaseUrl: 'https://api.x.ai/v1' },
      environment: { nodeEnv: 'test' },
    };

    mockContinuationStore = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
    };

    const makeProvider = (content, metadata) => ({
      invoke: vi.fn().mockResolvedValue({
        content,
        stop_reason: 'stop',
        rawResponse: { usage: { total_tokens: 50 } },
        metadata,
      }),
      isAvailable: vi.fn().mockReturnValue(true),
      getSupportedModels: vi.fn(),
      getModelConfig: vi.fn().mockReturnValue({ contextWindow: 128000, supportsImages: true }),
    });

    mockProviders = {
      openai: makeProvider('Test response from provider', { provider: 'openai', model: 'gpt-5.6' }),
      xai: makeProvider('Test response from xai provider', { provider: 'xai', model: 'grok' }),
      google: makeProvider('Test response from google provider', { provider: 'google', model: 'gemini-pro' }),
    };

    mockContextProcessor = {
      processUnifiedContext: vi.fn().mockResolvedValue({
        files: [],
        images: [],
        errors: [],
      }),
    };

    mockContinuationStore.get.mockResolvedValue(null);
    mockContinuationStore.set.mockImplementation((id) => id);

    mockDependencies = {
      config: mockConfig,
      continuationStore: mockContinuationStore,
      providers: mockProviders,
      contextProcessor: mockContextProcessor,
    };
  });

  describe('Basic functionality', () => {
    it('should handle a basic chat request', async () => {
      const result = await chatTool({ prompt: 'Hello, world!' }, mockDependencies);

      expect(result.isError).toBeFalsy();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Test response from provider');
      expect(result.continuation.id).toMatch(/^conv_[A-Za-z0-9_-]{10}$/);
    });

    it('should route an explicit model to its provider', async () => {
      await chatTool({ prompt: 'Test prompt', models: ['gpt-4o-mini'] }, mockDependencies);

      expect(mockProviders.openai.invoke).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'Test prompt' }),
        ]),
        expect.objectContaining({ model: 'gpt-4o-mini' }),
      );
    });

    it('should auto-select the first available provider', async () => {
      await chatTool({ prompt: 'Test prompt', models: ['auto'] }, mockDependencies);
      expect(mockProviders.openai.invoke).toHaveBeenCalled();
    });

    it('should not forward temperature/verbosity/use_websearch to providers', async () => {
      await chatTool({ prompt: 'Test prompt', models: ['gpt-4o-mini'] }, mockDependencies);
      const opts = mockProviders.openai.invoke.mock.calls[0][1];
      expect(opts).not.toHaveProperty('temperature');
      expect(opts).not.toHaveProperty('verbosity');
      expect(opts).not.toHaveProperty('use_websearch');
    });

    it('does not leak Codex thread options (threadKey) to non-Codex providers', async () => {
      await chatTool({ prompt: 'Test prompt', models: ['gpt-4o-mini'] }, mockDependencies);
      const opts = mockProviders.openai.invoke.mock.calls[0][1];
      expect(opts).not.toHaveProperty('threadKey');
      expect(opts).not.toHaveProperty('continuation_id');
      expect(opts).not.toHaveProperty('continuationStore');
    });

    it('passes Codex thread options only to the Codex candidate', async () => {
      mockProviders.codex = {
        invoke: vi.fn().mockResolvedValue({ content: 'codex answer', metadata: { provider: 'codex', threadId: 'th_1' } }),
        isAvailable: vi.fn().mockReturnValue(true),
        getSupportedModels: vi.fn(),
        getModelConfig: vi.fn().mockReturnValue({ supportsImages: true }),
      };
      await chatTool({ prompt: 'Test', models: ['codex'] }, mockDependencies);
      const opts = mockProviders.codex.invoke.mock.calls[0][1];
      expect(opts.threadKey).toBe('codex');
      expect(opts.continuationStore).toBeDefined();
    });
  });

  describe('Multi-model chat (N > 1)', () => {
    it('invokes each provider exactly once with labeled sections and no refinement', async () => {
      const result = await chatTool(
        { prompt: 'Compare approaches', models: ['gpt-4o-mini', 'grok'] },
        mockDependencies,
      );

      expect(result.isError).toBeFalsy();
      // One invoke per model, N total (no refinement phase).
      expect(mockProviders.openai.invoke).toHaveBeenCalledTimes(1);
      expect(mockProviders.xai.invoke).toHaveBeenCalledTimes(1);

      const text = result.content[0].text;
      expect(text).toContain('### gpt-4o-mini:');
      expect(text).toContain('### grok:');
      expect(text).toContain('Test response from provider');
      expect(text).toContain('Test response from xai provider');
    });

    it('persists a multi-model chat as a single combined assistant message', async () => {
      await chatTool(
        { prompt: 'Compare', models: ['gpt-4o-mini', 'grok'] },
        mockDependencies,
      );
      const state = mockContinuationStore.set.mock.calls[0][1];
      const assistantMessages = state.messages.filter((m) => m.role === 'assistant');
      expect(assistantMessages).toHaveLength(1);
      expect(state.mode).toBe('chat');
      expect(state.models).toEqual(['gpt-4o-mini', 'grok']);
    });

    it('surfaces per-model failures while returning successful sections', async () => {
      mockProviders.xai.invoke.mockRejectedValue(new Error('xai down'));
      const result = await chatTool(
        { prompt: 'Compare', models: ['gpt-4o-mini', 'grok'] },
        mockDependencies,
      );
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Test response from provider');
      expect(result.content[0].text).toContain('grok');
    });

    it('surfaces every failure when all models in a multi-model chat fail', async () => {
      mockProviders.openai.invoke.mockRejectedValue(new Error('openai boom'));
      mockProviders.xai.invoke.mockRejectedValue(new Error('xai boom'));
      const result = await chatTool(
        { prompt: 'Compare', models: ['gpt-4o-mini', 'grok'] },
        mockDependencies,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('gpt-4o-mini');
      expect(result.content[0].text).toContain('grok');
      expect(result.content[0].text).toMatch(/openai boom|xai boom/);
    });
  });

  describe('Validation (acceptance criterion 4)', () => {
    it('rejects an unknown mode and lists the valid modes', async () => {
      const result = await chatTool({ prompt: 'hi', mode: 'debate' }, mockDependencies);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('chat, consensus, roundtable');
    });

    it('rejects consensus with a single concrete model, pointing to mode chat', async () => {
      const result = await chatTool(
        { prompt: 'hi', mode: 'consensus', models: ['gpt-4o-mini'] },
        mockDependencies,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/mode "chat"/);
    });

    it('rejects duplicate models in chat mode (case-insensitive)', async () => {
      const result = await chatTool(
        { prompt: 'hi', models: ['GPT-4o-mini', 'gpt-4o-mini'] },
        mockDependencies,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/[Dd]uplicate/);
    });

    it('rejects an empty models array', async () => {
      const result = await chatTool({ prompt: 'hi', models: [] }, mockDependencies);
      expect(result.isError).toBe(true);
    });
  });

  describe('Continuation support', () => {
    it('persists chat-mode state for a new conversation', async () => {
      const result = await chatTool({ prompt: 'First message' }, mockDependencies);

      expect(mockContinuationStore.set).toHaveBeenCalledWith(
        expect.stringMatching(/^conv_[A-Za-z0-9_-]{10}$/),
        expect.objectContaining({
          mode: 'chat',
          models: ['auto'],
          providerThreads: expect.any(Object),
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'user', content: 'First message' }),
            expect.objectContaining({
              role: 'assistant',
              content: 'Test response from provider',
            }),
          ]),
        }),
      );
      expect(result.continuation.messageCount).toBe(2);
    });

    it('loads an existing conversation and includes prior turns', async () => {
      mockContinuationStore.get.mockResolvedValue({
        messages: [
          { role: 'system', content: 'PRIOR SYSTEM' },
          { role: 'user', content: 'Previous message' },
          { role: 'assistant', content: 'Previous response' },
        ],
        mode: 'chat',
      });

      await chatTool(
        { prompt: 'Follow-up', continuation_id: 'conv_existing' },
        mockDependencies,
      );

      // openai is an API provider — it sees the full role-separated history.
      expect(mockProviders.openai.invoke).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'Previous message' }),
          expect.objectContaining({ role: 'assistant', content: 'Previous response' }),
          expect.objectContaining({ role: 'user', content: 'Follow-up' }),
        ]),
        expect.any(Object),
      );
    });

    it('normalizes the stored leading system message to the current mode prompt', async () => {
      mockContinuationStore.get.mockResolvedValue({
        messages: [{ role: 'system', content: 'STALE ROUNDTABLE PROMPT' }],
        mode: 'roundtable',
      });

      await chatTool(
        { prompt: 'Now chat', continuation_id: 'conv_x' },
        mockDependencies,
      );

      const sent = mockProviders.openai.invoke.mock.calls[0][0];
      const systemMsg = sent.find((m) => m.role === 'system');
      expect(systemMsg.content).not.toContain('STALE ROUNDTABLE PROMPT');
    });

    it('preserves a custom continuation ID and sets custom_id', async () => {
      const result = await chatTool(
        { prompt: 'Test', continuation_id: 'my-custom-id' },
        mockDependencies,
      );
      expect(result.continuation.id).toBe('my-custom-id');
      expect(result.continuation.custom_id).toBe(true);
    });

    it('packs prior transcript into the final user message for last-user-only SDK providers on resume', async () => {
      // claude is a last-user-only SDK provider with no reusable thread.
      mockProviders.claude = {
        invoke: vi.fn().mockResolvedValue({
          content: 'claude answer',
          metadata: { provider: 'claude' },
        }),
        isAvailable: vi.fn().mockReturnValue(true),
        getSupportedModels: vi.fn(),
        getModelConfig: vi.fn().mockReturnValue({ supportsImages: false }),
      };

      // A prior thread (created in roundtable mode) with a rendered transcript.
      mockContinuationStore.get.mockResolvedValue({
        messages: [
          { role: 'system', content: 'ROUNDTABLE PROMPT' },
          { role: 'user', content: 'Original topic' },
          { role: 'assistant', content: 'PRIOR TRANSCRIPT CONTENT' },
        ],
        mode: 'roundtable',
      });

      await chatTool(
        { prompt: 'Now continue', models: ['claude'], continuation_id: 'conv_x' },
        mockDependencies,
      );

      const sent = mockProviders.claude.invoke.mock.calls[0][0];
      const lastUser = sent.filter((m) => m.role === 'user').pop();
      const text =
        typeof lastUser.content === 'string'
          ? lastUser.content
          : lastUser.content.map((p) => p.text).join('\n');
      // The prior transcript is packed into claude's single final user message.
      expect(text).toContain('PRIOR TRANSCRIPT CONTENT');
      expect(text).toContain('Now continue');
    });
  });

  describe('Context processing', () => {
    it('processes files without any web-search field', async () => {
      mockContextProcessor.processUnifiedContext.mockResolvedValue({
        files: [
          {
            originalPath: 'package.json',
            path: 'package.json',
            type: 'text',
            content: '{"name":"test"}',
            size: 15,
            lineCount: 1,
          },
        ],
        images: [],
        errors: [],
      });

      await chatTool(
        { prompt: 'Analyze', files: ['package.json'] },
        mockDependencies,
      );

      expect(mockContextProcessor.processUnifiedContext).toHaveBeenCalledWith(
        { files: ['package.json'], images: [] },
        expect.objectContaining({ enforceSecurityCheck: false }),
      );
    });
  });

  describe('Error handling', () => {
    it('errors on a missing prompt', async () => {
      const result = await chatTool({}, mockDependencies);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/prompt.*required/i);
    });

    it('errors on an empty prompt', async () => {
      const result = await chatTool({ prompt: '' }, mockDependencies);
      expect(result.isError).toBe(true);
    });

    it('surfaces a single-model provider error', async () => {
      mockProviders.openai.invoke.mockRejectedValue(new Error('Provider API error'));
      const result = await chatTool(
        { prompt: 'Test', models: ['gpt-4o-mini'] },
        mockDependencies,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Provider error');
    });

    it('retries a transient provider error', async () => {
      mockProviders.openai.invoke
        .mockRejectedValueOnce(new Error('Temporary network error'))
        .mockResolvedValue({
          content: 'Recovered response',
          stop_reason: 'stop',
          rawResponse: {},
          metadata: { provider: 'openai', model: 'gpt-5.6' },
        });
      const result = await chatTool({ prompt: 'Recover' }, mockDependencies);
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Recovered response');
      expect(mockProviders.openai.invoke).toHaveBeenCalledTimes(2);
    });

    it('fails over to the next provider in auto mode', async () => {
      const codex = {
        invoke: vi.fn().mockRejectedValue(new Error('API key invalid')),
        isAvailable: vi.fn().mockReturnValue(true),
        getSupportedModels: vi.fn(),
        getModelConfig: vi.fn().mockReturnValue({ supportsImages: true }),
      };
      mockProviders.codex = codex;

      const result = await chatTool({ prompt: 'Recover', models: ['auto'] }, mockDependencies);
      expect(result.isError).toBeFalsy();
      expect(codex.invoke).toHaveBeenCalledTimes(1);
      expect(mockProviders.openai.invoke).toHaveBeenCalledTimes(1);
    });

    it('errors when no providers are available', async () => {
      mockProviders.openai.isAvailable.mockReturnValue(false);
      mockProviders.xai.isAvailable.mockReturnValue(false);
      mockProviders.google.isAvailable.mockReturnValue(false);

      const result = await chatTool({ prompt: 'Test', models: ['auto'] }, mockDependencies);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No providers available');
    });

    it('errors when an explicit model provider is unavailable', async () => {
      mockProviders.openai.isAvailable.mockReturnValue(false);
      const result = await chatTool(
        { prompt: 'Test', models: ['gpt-4o-mini'] },
        mockDependencies,
      );
      expect(result.isError).toBe(true);
    });

    it('tolerates continuation store errors', async () => {
      mockContinuationStore.set.mockRejectedValue(new Error('Store error'));
      const result = await chatTool({ prompt: 'Test' }, mockDependencies);
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Test response from provider');
    });
  });

  describe('Response format', () => {
    it('returns an MCP-compliant response with a numeric messageCount', async () => {
      const result = await chatTool({ prompt: 'Test' }, mockDependencies);
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.continuation).toHaveProperty('id');
      expect(typeof result.continuation.messageCount).toBe('number');
    });

    it('includes provider info in the continuation for single-model chat', async () => {
      const result = await chatTool({ prompt: 'Test' }, mockDependencies);
      expect(result.continuation.provider).toBe('openai');
      expect(result.continuation.model).toBeDefined();
    });
  });
});
