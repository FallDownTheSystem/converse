import { describe, it, expect, beforeEach, vi } from 'vitest';
import { chatTool } from '../../src/tools/chat.js';
import * as fileValidator from '../../src/utils/fileValidator.js';

vi.mock('../../src/utils/fileValidator.js');

describe('Async Support (unified chat tool)', () => {
  let mockDependencies;
  let mockConfig;
  let mockContinuationStore;
  let mockProviders;
  let mockContextProcessor;
  let mockJobRunner;
  let mockProviderStreamNormalizer;

  beforeEach(() => {
    vi.mocked(fileValidator.validateAllPaths).mockResolvedValue({ valid: true, errors: [] });

    mockConfig = {
      apiKeys: { openai: 'sk-test-key', xai: 'xai-test-key', google: 'google-test-key' },
      providers: { xaiBaseUrl: 'https://api.x.ai/v1' },
      environment: { nodeEnv: 'test' },
    };

    mockContinuationStore = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
      exists: vi.fn().mockResolvedValue(false),
    };

    const makeProvider = (content) => ({
      invoke: vi.fn().mockResolvedValue({ content, metadata: { usage: {} } }),
      isAvailable: vi.fn().mockReturnValue(true),
      getSupportedModels: vi.fn(),
      getModelConfig: vi.fn().mockReturnValue({ supportsImages: true }),
    });

    mockProviders = {
      openai: makeProvider('Test response from OpenAI'),
      xai: makeProvider('Test response from XAI'),
      google: makeProvider('Test response from Google'),
    };

    mockContextProcessor = {
      processUnifiedContext: vi.fn().mockResolvedValue({ files: [], images: [], errors: [] }),
    };

    mockJobRunner = { submit: vi.fn().mockResolvedValue('test-job-id-123') };
    mockProviderStreamNormalizer = { normalize: vi.fn() };

    mockDependencies = {
      config: mockConfig,
      continuationStore: mockContinuationStore,
      providers: mockProviders,
      contextProcessor: mockContextProcessor,
      jobRunner: mockJobRunner,
      providerStreamNormalizer: mockProviderStreamNormalizer,
    };
  });

  describe('chat mode', () => {
    it('executes synchronously when async is false/omitted', async () => {
      const result = await chatTool({ prompt: 'Test sync chat' }, mockDependencies);
      expect(result.content[0].text).toContain('Test response from OpenAI');
      expect(mockJobRunner.submit).not.toHaveBeenCalled();
    });

    it('submits a job tagged tool:chat mode:chat when async=true', async () => {
      const result = await chatTool({ prompt: 'Test async chat', async: true }, mockDependencies);
      expect(result.content[0].text).toContain('⏳ SUBMITTED | CHAT');
      expect(result.continuation.status).toBe('processing');
      expect(mockJobRunner.submit).toHaveBeenCalledWith(
        expect.objectContaining({ tool: 'chat', mode: 'chat' }),
        expect.any(Function),
      );
    });

    it('preserves an existing continuation_id in async mode', async () => {
      const id = 'existing-chat-123';
      const result = await chatTool(
        { prompt: 'Async chat', async: true, continuation_id: id },
        mockDependencies,
      );
      expect(result.continuation.id).toBe(id);
      expect(mockJobRunner.submit).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: 'chat',
          mode: 'chat',
          sessionId: id,
          options: expect.objectContaining({ jobId: id, mode: 'chat' }),
        }),
        expect.any(Function),
      );
    });

    it('errors when async dependencies are missing', async () => {
      const result = await chatTool(
        { prompt: 'x', async: true },
        { ...mockDependencies, jobRunner: null, providerStreamNormalizer: null },
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Async execution not available');
    });

    it('handles job submission errors gracefully', async () => {
      mockJobRunner.submit.mockRejectedValue(new Error('Job submission failed'));
      const result = await chatTool({ prompt: 'x', async: true }, mockDependencies);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Async execution failed');
    });

    it('rejects an async custom ID with unsafe characters', async () => {
      const result = await chatTool(
        { prompt: 'x', async: true, continuation_id: 'my project/analysis' },
        mockDependencies,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid continuation_id for async mode');
    });

    it('accepts an async custom ID with safe characters', async () => {
      const result = await chatTool(
        { prompt: 'x', async: true, continuation_id: 'my-safe-custom-id_123' },
        mockDependencies,
      );
      expect(result.continuation.id).toBe('my-safe-custom-id_123');
      expect(result.continuation.custom_id).toBe(true);
    });
  });

  describe('consensus mode', () => {
    it('submits a job tagged mode:consensus when async=true', async () => {
      const result = await chatTool(
        { prompt: 'Async consensus', mode: 'consensus', models: ['gpt-5', 'gemini-2.5-pro'], async: true },
        mockDependencies,
      );
      expect(result.content[0].text).toContain('⏳ SUBMITTED | CONSENSUS');
      expect(mockJobRunner.submit).toHaveBeenCalledWith(
        expect.objectContaining({ tool: 'chat', mode: 'consensus' }),
        expect.any(Function),
      );
    });

    it('validates ≥2 resolved models before submitting an async consensus job', async () => {
      const result = await chatTool(
        { prompt: 'x', mode: 'consensus', models: ['gpt-5'], async: true },
        mockDependencies,
      );
      expect(result.isError).toBe(true);
      expect(mockJobRunner.submit).not.toHaveBeenCalled();
    });
  });

  describe('roundtable mode', () => {
    it('submits a job tagged mode:roundtable when async=true', async () => {
      const result = await chatTool(
        { prompt: 'Async roundtable', mode: 'roundtable', models: ['gpt-5', 'grok-4-0709'], async: true },
        mockDependencies,
      );
      expect(result.content[0].text).toContain('⏳ SUBMITTED | ROUNDTABLE');
      expect(mockJobRunner.submit).toHaveBeenCalledWith(
        expect.objectContaining({ tool: 'chat', mode: 'roundtable' }),
        expect.any(Function),
      );
    });
  });
});
