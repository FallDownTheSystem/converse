import { describe, it, expect, beforeEach, vi } from 'vitest';
import { chatTool } from '../../src/tools/chat.js';
import * as fileValidator from '../../src/utils/fileValidator.js';

vi.mock('../../src/utils/fileValidator.js');

/**
 * Extract the LAST user message text passed to a provider mock. Roundtable packs
 * all turn context into a single final user message, so this is what a provider
 * actually sees.
 */
function lastUserText(invokeMock, callIndex = 0) {
  const messages = invokeMock.mock.calls[callIndex][0];
  const userMessages = messages.filter((m) => m.role === 'user');
  const last = userMessages[userMessages.length - 1];
  if (typeof last.content === 'string') return last.content;
  return last.content.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
}

describe('Chat Tool (unified) — roundtable mode', () => {
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

  it('runs one turn per model, in order, each seeing prior turns', async () => {
    const result = await chatTool(
      { prompt: 'Discuss', mode: 'roundtable', models: ['gpt-4o-mini', 'grok', 'gemini-pro'] },
      mockDependencies,
    );

    expect(result.isError).toBeFalsy();
    expect(mockProviders.openai.invoke).toHaveBeenCalledTimes(1);
    expect(mockProviders.xai.invoke).toHaveBeenCalledTimes(1);
    expect(mockProviders.google.invoke).toHaveBeenCalledTimes(1);

    // The second speaker's packet contains the first speaker's answer.
    expect(lastUserText(mockProviders.xai.invoke)).toContain('openai answer');
    // The third speaker's packet contains both prior answers.
    const googlePacket = lastUserText(mockProviders.google.invoke);
    expect(googlePacket).toContain('openai answer');
    expect(googlePacket).toContain('xai answer');
  });

  it('packs each turn into a single self-contained user message', async () => {
    await chatTool(
      { prompt: 'Discuss', mode: 'roundtable', models: ['gpt-4o-mini'] },
      mockDependencies,
    );
    const messages = mockProviders.openai.invoke.mock.calls[0][0];
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  it('keeps unavailable models as ordered pre-failed turns', async () => {
    mockProviders.openai.isAvailable.mockReturnValue(false);
    const result = await chatTool(
      { prompt: 'Discuss', mode: 'roundtable', models: ['grok', 'gpt-4o-mini'] },
      mockDependencies,
    );
    expect(result.isError).toBeFalsy();
    expect(mockProviders.xai.invoke).toHaveBeenCalledTimes(1);
    expect(mockProviders.openai.invoke).not.toHaveBeenCalled();
    // The failed turn is still recorded in order.
    expect(result.content[0].text).toContain('gpt-4o-mini');
  });

  it('allows a single-model roundtable', async () => {
    const result = await chatTool(
      { prompt: 'Think aloud', mode: 'roundtable', models: ['gpt-4o-mini'] },
      mockDependencies,
    );
    expect(result.isError).toBeFalsy();
    expect(mockProviders.openai.invoke).toHaveBeenCalledTimes(1);
  });

  it('allows duplicate models in roundtable mode', async () => {
    const result = await chatTool(
      { prompt: 'Debate', mode: 'roundtable', models: ['gpt-4o-mini', 'gpt-4o-mini'] },
      mockDependencies,
    );
    expect(result.isError).toBeFalsy();
    expect(mockProviders.openai.invoke).toHaveBeenCalledTimes(2);
  });

  it('persists roundtable-mode state and continues across laps', async () => {
    await chatTool(
      { prompt: 'Lap 1', mode: 'roundtable', models: ['gpt-4o-mini', 'grok'] },
      mockDependencies,
    );
    const state = mockContinuationStore.set.mock.calls[0][1];
    expect(state.mode).toBe('roundtable');
    expect(state.roundtableData).toBeDefined();
    expect(state.roundtableData.modelsOrdered).toEqual(['gpt-4o-mini', 'grok']);

    // Resume: the prior lap transcript is re-rendered into the next lap's packets.
    mockContinuationStore.get.mockResolvedValue(state);
    mockProviders.openai.invoke.mockClear();
    await chatTool(
      { prompt: 'Lap 2', mode: 'roundtable', models: ['gpt-4o-mini'], continuation_id: 'conv_x' },
      mockDependencies,
    );
    expect(lastUserText(mockProviders.openai.invoke)).toContain('Earlier in this round-table');
  });

  it('produces a roundtable_complete structured result', async () => {
    const result = await chatTool(
      { prompt: 'Discuss', mode: 'roundtable', models: ['gpt-4o-mini', 'grok'] },
      mockDependencies,
    );
    expect(result.content[0].text).toContain('roundtable_complete');
  });
});
