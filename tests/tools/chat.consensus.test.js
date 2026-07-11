import { describe, it, expect, beforeEach, vi } from 'vitest';
import { chatTool } from '../../src/tools/chat.js';
import * as fileValidator from '../../src/utils/fileValidator.js';

vi.mock('../../src/utils/fileValidator.js');

describe('Chat Tool (unified) — consensus mode', () => {
  let mockDependencies;
  let mockConfig;
  let mockContinuationStore;
  let mockProviders;
  let mockContextProcessor;

  beforeEach(() => {
    vi.mocked(fileValidator.validateAllPaths).mockResolvedValue({ valid: true, errors: [] });

    mockConfig = {
      apiKeys: { openai: 'sk-test', xai: 'xai-test', google: 'g-test' },
      providers: {},
      environment: { nodeEnv: 'test' },
    };

    mockContinuationStore = { get: vi.fn().mockResolvedValue(null), set: vi.fn() };

    const makeProvider = (content, metadata) => ({
      invoke: vi.fn().mockResolvedValue({ content, stop_reason: 'stop', rawResponse: {}, metadata }),
      isAvailable: vi.fn().mockReturnValue(true),
      getSupportedModels: vi.fn(),
      getModelConfig: vi.fn().mockReturnValue({ supportsImages: true }),
    });

    mockProviders = {
      openai: makeProvider('openai answer', { provider: 'openai' }),
      xai: makeProvider('xai answer', { provider: 'xai' }),
      google: makeProvider('google answer', { provider: 'google' }),
    };

    mockContextProcessor = {
      processUnifiedContext: vi.fn().mockResolvedValue({ files: [], images: [], errors: [] }),
    };

    mockDependencies = {
      config: mockConfig,
      continuationStore: mockContinuationStore,
      providers: mockProviders,
      contextProcessor: mockContextProcessor,
    };
  });

  it('runs phase 1 + refinement — invoke called 2N times — with no gating flag', async () => {
    const result = await chatTool(
      { prompt: 'Decide', mode: 'consensus', models: ['gpt-4o-mini', 'grok'] },
      mockDependencies,
    );

    expect(result.isError).toBeFalsy();
    // N=2 models: phase 1 (2) + refinement (2) = 4 total invocations.
    expect(mockProviders.openai.invoke).toHaveBeenCalledTimes(2);
    expect(mockProviders.xai.invoke).toHaveBeenCalledTimes(2);
  });

  it('does not refine when fewer than 2 models succeed in phase 1', async () => {
    mockProviders.xai.invoke.mockRejectedValue(new Error('xai down'));
    await chatTool(
      { prompt: 'Decide', mode: 'consensus', models: ['gpt-4o-mini', 'grok'] },
      mockDependencies,
    );
    // Only openai succeeded → no refinement → openai invoked once.
    expect(mockProviders.openai.invoke).toHaveBeenCalledTimes(1);
  });

  it('expands ["auto"] to the first available providers (≥2)', async () => {
    const result = await chatTool(
      { prompt: 'Decide', mode: 'consensus', models: ['auto'] },
      mockDependencies,
    );
    expect(result.isError).toBeFalsy();
    // openai, xai, google all available → 3 phase-1 + 3 refinement.
    expect(mockProviders.openai.invoke).toHaveBeenCalledTimes(2);
    expect(mockProviders.xai.invoke).toHaveBeenCalledTimes(2);
    expect(mockProviders.google.invoke).toHaveBeenCalledTimes(2);
  });

  it('rejects a single explicit model, directing to mode chat', async () => {
    const result = await chatTool(
      { prompt: 'Decide', mode: 'consensus', models: ['gpt-4o-mini'] },
      mockDependencies,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/mode "chat"/);
  });

  it('rejects ["auto"] when fewer than 2 providers are available', async () => {
    mockProviders.xai.isAvailable.mockReturnValue(false);
    mockProviders.google.isAvailable.mockReturnValue(false);
    const result = await chatTool(
      { prompt: 'Decide', mode: 'consensus', models: ['auto'] },
      mockDependencies,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/at least 2/);
  });

  it('persists a single formatted assistant message with consensus mode + data', async () => {
    await chatTool(
      { prompt: 'Decide', mode: 'consensus', models: ['gpt-4o-mini', 'grok'] },
      mockDependencies,
    );
    const state = mockContinuationStore.set.mock.calls[0][1];
    expect(state.mode).toBe('consensus');
    expect(state.consensusData).toBeDefined();
    const assistantMessages = state.messages.filter((m) => m.role === 'assistant');
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0].content).toContain('## Initial Responses');
    expect(assistantMessages[0].content).toContain('## Refined Responses');
  });

  it('returns a consensus_complete structured result', async () => {
    const result = await chatTool(
      { prompt: 'Decide', mode: 'consensus', models: ['gpt-4o-mini', 'grok'] },
      mockDependencies,
    );
    expect(result.content[0].text).toContain('consensus_complete');
    expect(result.content[0].text).toContain('"successful_initial_responses": 2');
  });
});
