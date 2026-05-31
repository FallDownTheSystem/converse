import { describe, it, expect, beforeEach, vi } from 'vitest';
import { conversationTool } from '../../src/tools/conversation.js';
import { getTools } from '../../src/tools/index.js';
import * as fileValidator from '../../src/utils/fileValidator.js';
import * as contextProcessor from '../../src/utils/contextProcessor.js';
import { parseJsonResponse } from '../utils/responseParser.js';

// Mock the fileValidator module
vi.mock('../../src/utils/fileValidator.js');
// Mock the contextProcessor module
vi.mock('../../src/utils/contextProcessor.js');

/**
 * Helper: extract the text of the LAST user message passed to a provider mock.
 * The conversation tool packs all turn context into a single final user message,
 * so this is what a (last-user-only) provider actually sees.
 */
function lastUserText(invokeMock, callIndex = 0) {
  const messages = invokeMock.mock.calls[callIndex][0];
  const userMessages = messages.filter((m) => m.role === 'user');
  const last = userMessages[userMessages.length - 1];
  if (typeof last.content === 'string') {
    return last.content;
  }
  // Complex content array — concatenate text parts
  return last.content
    .filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
}

describe('Conversation Tool Unit Tests', () => {
  let mockDependencies;
  let mockConfig;
  let mockContinuationStore;
  let mockProviders;
  let mockContextProcessor;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(fileValidator.validateAllPaths).mockResolvedValue({
      valid: true,
      errors: [],
    });

    vi.mocked(contextProcessor.createFileContext).mockReturnValue({
      content: [
        {
          type: 'text',
          text: '=== FILE CONTEXT ===\n\n--- test.txt ---\ntest content',
        },
      ],
    });

    mockConfig = {
      apiKeys: {
        openai: 'sk-test-key',
        xai: 'xai-test-key',
        google: 'google-test-key',
      },
      providers: {
        googleLocation: 'us-central1',
        xaiBaseUrl: 'https://api.x.ai/v1',
      },
      environment: {
        nodeEnv: 'test',
      },
    };

    mockContinuationStore = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
      getStats: vi.fn(),
    };

    // Providers echo the last user message they received so visibility/ordering
    // through the single turn-packet design is assertable.
    const makeEchoProvider = (label) => ({
      invoke: vi.fn().mockImplementation(async (messages) => {
        const userMessages = messages.filter((m) => m.role === 'user');
        const last = userMessages[userMessages.length - 1];
        const text =
          typeof last.content === 'string'
            ? last.content
            : last.content
              .filter((p) => p.type === 'text')
              .map((p) => p.text)
              .join('\n');
        return {
          content: `[${label}] echo of: ${text}`,
          stop_reason: 'stop',
          metadata: { provider: label },
        };
      }),
      validateConfig: vi.fn().mockReturnValue(true),
      isAvailable: vi.fn().mockReturnValue(true),
      getSupportedModels: vi.fn().mockReturnValue({}),
      getModelConfig: vi.fn(() => ({ contextWindow: 128000 })),
    });

    mockProviders = {
      openai: makeEchoProvider('openai'),
      xai: makeEchoProvider('xai'),
      google: makeEchoProvider('google'),
    };

    mockContextProcessor = {
      processUnifiedContext: vi.fn().mockResolvedValue({
        success: true,
        contextMessages: [],
        files: [],
        images: [],
        processed: [],
        failed: [],
      }),
    };

    mockDependencies = {
      config: mockConfig,
      continuationStore: mockContinuationStore,
      providers: mockProviders,
      contextProcessor: mockContextProcessor,
    };

    mockContinuationStore.get.mockResolvedValue(null);
    mockContinuationStore.set.mockResolvedValue('conv_test_12345');
    mockContinuationStore.exists.mockResolvedValue(false);
  });

  function parseResult(result) {
    return parseJsonResponse(result.content[0].text);
  }

  describe('Validation', () => {
    it('rejects missing prompt', async () => {
      const result = await conversationTool(
        { models: ['gpt-5'] },
        mockDependencies,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/prompt.*required/i);
    });

    it('rejects empty/whitespace handling via missing prompt string', async () => {
      const result = await conversationTool(
        { prompt: '', models: ['gpt-5'] },
        mockDependencies,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/prompt.*required/i);
    });

    it('rejects missing models array', async () => {
      const result = await conversationTool(
        { prompt: 'hi' },
        mockDependencies,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/models.*required/i);
    });

    it('rejects empty models array', async () => {
      const result = await conversationTool(
        { prompt: 'hi', models: [] },
        mockDependencies,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/models.*required.*at least one/i);
    });
  });

  describe('Sequential ordering and visibility', () => {
    it('runs two models in order A then B; B sees A response in its turn packet', async () => {
      const args = {
        prompt: 'What is the best caching strategy?',
        models: ['gpt-5', 'grok-4'], // gpt-5 -> openai, grok-4 -> xai
      };

      const result = await conversationTool(args, mockDependencies);
      const parsed = parseResult(result);

      expect(parsed.status).toBe('conversation_complete');
      expect(parsed.turns).toHaveLength(2);
      expect(parsed.turns[0].model).toBe('gpt-5');
      expect(parsed.turns[1].model).toBe('grok-4');
      expect(parsed.turns[0].status).toBe('success');
      expect(parsed.turns[1].status).toBe('success');

      // The opener (A) must NOT see any same-lap turns
      const openerText = lastUserText(mockProviders.openai.invoke, 0);
      expect(openerText).toContain('Original topic for this round:');
      expect(openerText).not.toContain('### gpt-5 said:');

      // B's turn packet MUST contain A's response (proves visibility)
      const secondText = lastUserText(mockProviders.xai.invoke, 0);
      expect(secondText).toContain('### gpt-5 said:');
      expect(secondText).toContain('[openai] echo of:');
    });

    it('opener turn packet omits same-lap turns; includes framing position', async () => {
      const args = { prompt: 'topic', models: ['gpt-5', 'grok-4'] };
      await conversationTool(args, mockDependencies);

      const openerText = lastUserText(mockProviders.openai.invoke, 0);
      expect(openerText).toContain('position 1 of 2');
      const secondText = lastUserText(mockProviders.xai.invoke, 0);
      expect(secondText).toContain('position 2 of 2');
    });

    it('single model list produces one turn', async () => {
      const args = { prompt: 'solo', models: ['gpt-5'] };
      const result = await conversationTool(args, mockDependencies);
      const parsed = parseResult(result);
      expect(parsed.turns).toHaveLength(1);
      expect(parsed.successful_turns).toBe(1);
    });
  });

  describe('Failure handling (skip-with-note, continue lap)', () => {
    it('records a failed turn when a model throws but continues the lap', async () => {
      mockProviders.openai.invoke.mockRejectedValueOnce(
        new Error('boom from openai'),
      );

      const args = { prompt: 'topic', models: ['gpt-5', 'grok-4'] };
      const result = await conversationTool(args, mockDependencies);
      const parsed = parseResult(result);

      expect(parsed.turns).toHaveLength(2);
      expect(parsed.turns[0].status).toBe('failed');
      expect(parsed.turns[0].error).toContain('boom from openai');
      expect(parsed.turns[1].status).toBe('success');
      expect(parsed.successful_turns).toBe(1);
      expect(parsed.failed_turns).toBe(1);

      // Failure details surfaced in response
      expect(result.content[0].text).toContain('gpt-5');

      // The later model sees a note that the first did not respond
      const secondText = lastUserText(mockProviders.xai.invoke, 0);
      expect(secondText).toContain('gpt-5 did not respond');
    });

    it('unknown/unavailable model becomes a failed turn occupying its position', async () => {
      mockProviders.openai.isAvailable.mockReturnValue(false);

      const args = { prompt: 'topic', models: ['gpt-5', 'grok-4'] };
      const result = await conversationTool(args, mockDependencies);
      const parsed = parseResult(result);

      expect(parsed.turns).toHaveLength(2);
      expect(parsed.turns[0].model).toBe('gpt-5');
      expect(parsed.turns[0].status).toBe('failed');
      expect(parsed.turns[1].status).toBe('success');

      // The available model still ran and saw the gap note
      const secondText = lastUserText(mockProviders.xai.invoke, 0);
      expect(secondText).toContain('gpt-5 did not respond');
    });

    it('all models failing still completes and saves the lap', async () => {
      mockProviders.openai.isAvailable.mockReturnValue(false);
      mockProviders.xai.isAvailable.mockReturnValue(false);

      const args = { prompt: 'topic', models: ['gpt-5', 'grok-4'] };
      const result = await conversationTool(args, mockDependencies);
      const parsed = parseResult(result);

      expect(parsed.status).toBe('conversation_complete');
      expect(parsed.successful_turns).toBe(0);
      expect(parsed.failed_turns).toBe(2);
      // State still saved despite all failures (no early return)
      expect(mockContinuationStore.set).toHaveBeenCalled();
      expect(result.continuation.id).toBeDefined();
    });
  });

  describe('Continuation accumulation', () => {
    it('saves conversation state with type conversation and modelsOrdered', async () => {
      const args = { prompt: 'topic', models: ['gpt-5'] };
      await conversationTool(args, mockDependencies);

      expect(mockContinuationStore.set).toHaveBeenCalledWith(
        expect.stringMatching(/^conv_[A-Za-z0-9_-]{10}$/),
        expect.objectContaining({
          type: 'conversation',
          conversationData: expect.objectContaining({
            modelsOrdered: ['gpt-5'],
          }),
        }),
      );
    });

    it('second lap embeds the first lap transcript into the next turn packet', async () => {
      // Simulate prior stored state from a completed lap 1
      mockContinuationStore.get.mockResolvedValue({
        messages: [
          { role: 'system', content: 'SYS' },
          { role: 'user', content: 'lap 1 prompt' },
          {
            role: 'assistant',
            content:
              '### gpt-5 (turn 1):\nFirst lap answer\n\n---\n\n**Summary:** ...',
          },
        ],
        type: 'conversation',
      });

      const args = {
        prompt: 'lap 2 prompt',
        models: ['gpt-5'],
        continuation_id: 'conv_AAAAAAAAAA',
      };
      await conversationTool(args, mockDependencies);

      const packet = lastUserText(mockProviders.openai.invoke, 0);
      expect(packet).toContain('Earlier in this round-table');
      expect(packet).toContain('First lap answer');
      expect(packet).toContain('lap 2 prompt');
    });

    it('messageCount grows across laps', async () => {
      // Lap 1: fresh
      const r1 = await conversationTool(
        { prompt: 'lap1', models: ['gpt-5'] },
        mockDependencies,
      );
      const count1 = r1.continuation.messageCount;

      // Lap 2: simulate the stored state having grown (system + 2 pairs)
      mockContinuationStore.get.mockResolvedValue({
        messages: [
          { role: 'system', content: 'SYS' },
          { role: 'user', content: 'lap1' },
          { role: 'assistant', content: 'lap1 transcript' },
        ],
        type: 'conversation',
      });
      const r2 = await conversationTool(
        {
          prompt: 'lap2',
          models: ['gpt-5'],
          continuation_id: 'conv_AAAAAAAAAA',
        },
        mockDependencies,
      );
      expect(r2.continuation.messageCount).toBeGreaterThan(count1);
    });

    it('resuming lap may supply a different models list; transcript still shared', async () => {
      mockContinuationStore.get.mockResolvedValue({
        messages: [
          { role: 'system', content: 'SYS' },
          { role: 'user', content: 'lap 1' },
          { role: 'assistant', content: '### gpt-5 (turn 1):\nlap1 answer' },
        ],
        type: 'conversation',
      });

      const args = {
        prompt: 'lap 2',
        models: ['grok-4'], // different model than lap 1
        continuation_id: 'conv_AAAAAAAAAA',
      };
      await conversationTool(args, mockDependencies);

      // New model ran
      expect(mockProviders.xai.invoke).toHaveBeenCalled();
      // and saw the earlier lap's transcript
      const packet = lastUserText(mockProviders.xai.invoke, 0);
      expect(packet).toContain('lap1 answer');
      // per-lap modelsOrdered recorded for THIS lap
      expect(mockContinuationStore.set).toHaveBeenCalledWith(
        'conv_AAAAAAAAAA',
        expect.objectContaining({
          conversationData: expect.objectContaining({
            modelsOrdered: ['grok-4'],
          }),
        }),
      );
    });
  });

  describe('Custom continuation IDs', () => {
    it('preserves a custom unknown ID and sets custom_id true', async () => {
      mockContinuationStore.get.mockResolvedValue(null);
      const result = await conversationTool(
        {
          prompt: 'topic',
          models: ['gpt-5'],
          continuation_id: 'my-custom-id',
        },
        mockDependencies,
      );
      expect(result.continuation.id).toBe('my-custom-id');
      expect(result.continuation.custom_id).toBe(true);
    });

    it('does not set custom_id when resuming an existing conversation', async () => {
      mockContinuationStore.get.mockResolvedValue({
        messages: [
          { role: 'system', content: 'SYS' },
          { role: 'user', content: 'prev' },
          { role: 'assistant', content: 'prev transcript' },
        ],
        type: 'conversation',
      });
      const result = await conversationTool(
        {
          prompt: 'topic',
          models: ['gpt-5'],
          continuation_id: 'my-custom-id',
        },
        mockDependencies,
      );
      expect(result.continuation.id).toBe('my-custom-id');
      expect(result.continuation.custom_id).toBeUndefined();
    });
  });

  describe('Cancellation', () => {
    it('aborts before the first turn and does not persist state', async () => {
      const signal = { aborted: true };
      const result = await conversationTool(
        { prompt: 'topic', models: ['gpt-5'] },
        { ...mockDependencies, signal },
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/cancel/i);
      expect(mockContinuationStore.set).not.toHaveBeenCalled();
    });
  });

  describe('Schema and registration', () => {
    it('has the expected input schema and required fields', () => {
      expect(conversationTool.inputSchema).toBeDefined();
      expect(conversationTool.inputSchema.required).toEqual([
        'prompt',
        'models',
      ]);
      expect(conversationTool.inputSchema.properties).toHaveProperty(
        'turn_prompt',
      );
      expect(conversationTool.inputSchema.properties).toHaveProperty('models');
    });

    it('description distinguishes it from consensus (sequential vs parallel)', () => {
      expect(conversationTool.description).toMatch(/sequential/i);
      expect(conversationTool.description).toMatch(/round-table/i);
    });

    it('is registered in getTools()', () => {
      const tools = getTools();
      expect(tools).toHaveProperty('conversation');
      expect(tools.conversation).toBe(conversationTool);
    });

    it('strips async param when async tools are disabled', () => {
      const tools = getTools({ async: { disableAsyncTools: true } });
      expect(tools.conversation).toBeDefined();
      expect(
        tools.conversation.inputSchema.properties.async,
      ).toBeUndefined();
    });
  });

  describe('turn_prompt injection', () => {
    it('appends turn_prompt to each turn packet framing', async () => {
      const args = {
        prompt: 'topic',
        models: ['gpt-5'],
        turn_prompt: 'Focus on security.',
      };
      await conversationTool(args, mockDependencies);
      const packet = lastUserText(mockProviders.openai.invoke, 0);
      expect(packet).toContain('Focus on security.');
    });
  });

  describe('Async execution', () => {
    /**
     * Build a mock jobRunner that synchronously invokes the submitted runFn with
     * a minimal job context, capturing the result so we can assert on it.
     */
    function makeAsyncDeps(captured) {
      const mockJobRunner = {
        submit: vi.fn().mockImplementation(async (_spec, runFn) => {
          const context = {
            jobId: 'conv_job_1234',
            signal: { aborted: false },
            updateJob: vi.fn().mockResolvedValue(undefined),
            emitEvent: vi.fn(),
          };
          captured.result = await runFn(context);
          captured.context = context;
          return 'conv_job_1234';
        }),
      };
      // Stream normalizer is referenced but our echo providers don't expose
      // .stream() and return a non-iterable from invoke({stream:true}), so the
      // per-turn helper falls back to the plain invoke response.
      const mockStreamNormalizer = { normalize: vi.fn() };
      return {
        ...mockDependencies,
        jobRunner: mockJobRunner,
        providerStreamNormalizer: mockStreamNormalizer,
      };
    }

    it('async result carries a top-level content string (the rendered transcript)', async () => {
      const captured = {};
      const deps = makeAsyncDeps(captured);

      const submitResult = await conversationTool(
        { prompt: 'topic', models: ['gpt-5', 'grok-4'], async: true },
        deps,
      );

      // Immediate submission response: status line + processing continuation.
      // (async_execution is set on the result object but createToolResponse only
      // surfaces content/continuation/metadata — matching the consensus contract.)
      expect(submitResult.content[0].text).toMatch(/SUBMITTED \| CONVERSATION/);
      expect(submitResult.continuation.status).toBe('processing');

      // The background runFn ran and produced a result with top-level content
      expect(captured.result).toBeDefined();
      expect(captured.result.status).toBe('conversation_complete');
      expect(typeof captured.result.content).toBe('string');
      expect(captured.result.content.length).toBeGreaterThan(0);
      // Content is the rendered transcript with labeled turns
      expect(captured.result.content).toContain('### gpt-5 (turn 1):');
      expect(captured.result.content).toContain('### grok-4 (turn 2):');
      // Metadata present for status display
      expect(captured.result.metadata.async_execution).toBe(true);
      expect(captured.result.metadata.total_models).toBe(2);
    });

    it('async path reports per-turn progress via updateJob', async () => {
      const captured = {};
      const deps = makeAsyncDeps(captured);

      await conversationTool(
        { prompt: 'topic', models: ['gpt-5', 'grok-4'], async: true },
        deps,
      );

      const progressCalls = captured.context.updateJob.mock.calls
        .map((c) => c[0].conversation_progress)
        .filter(Boolean);
      expect(progressCalls).toContain('1/2');
      expect(progressCalls).toContain('2/2');
    });

    it('rejects an unsafe custom continuation_id in async mode', async () => {
      const captured = {};
      const deps = makeAsyncDeps(captured);

      const result = await conversationTool(
        {
          prompt: 'topic',
          models: ['gpt-5'],
          async: true,
          continuation_id: '../escape',
        },
        deps,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Invalid continuation_id/i);
    });
  });
});
