/**
 * Claude SDK Provider Tests
 *
 * Tests the Claude Agent SDK provider with a mocked SDK, focusing on
 * model resolution (claude / claude:fable / claude:opus).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StopReasons } from '../../../src/providers/interface.js';

// Create mock before any imports
const mockQuery = vi.fn();

// Mock the Claude Agent SDK (loaded via dynamic import in the provider)
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query(...args) {
    return mockQuery(...args);
  },
}));

// Import provider AFTER setting up the mock
import { claudeProvider } from '../../../src/providers/claude.js';

function createSdkResponse() {
  return (async function* () {
    yield {
      type: 'system',
      subtype: 'init',
      session_id: 'sess_test',
      model: 'claude-fable-5-1',
    };
    yield {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Hello back' }] },
    };
    yield {
      type: 'result',
      subtype: 'success',
      usage: { input_tokens: 10, output_tokens: 5 },
    };
  })();
}

describe('Claude SDK Provider', () => {
  const mockConfig = { server: {} };

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockImplementation(() => createSdkResponse());
  });

  describe('Model Management', () => {
    it('should return supported models', () => {
      const models = claudeProvider.getSupportedModels();

      expect(models.fable).toBeDefined();
      expect(models.fable.modelName).toBe('claude-fable-5-1');
      expect(models['fable-5'].modelName).toBe('claude-fable-5');
      expect(models.opus).toBeDefined();
      expect(models.opus.modelName).toBe('claude-opus-5');
    });

    it('should default bare "claude" (and legacy aliases) to Claude Fable 5.1', () => {
      ['claude', 'claude-sdk', 'claude-code', 'claude:', 'claude: ', ''].forEach((name) => {
        const config = claudeProvider.getModelConfig(name);
        expect(config).toBeDefined();
        expect(config.modelName).toBe('claude-fable-5-1');
      });
    });

    it('should resolve claude: prefixed model names', () => {
      expect(claudeProvider.getModelConfig('claude:fable').modelName).toBe(
        'claude-fable-5-1',
      );
      expect(claudeProvider.getModelConfig('claude:opus').modelName).toBe(
        'claude-opus-5',
      );
      // Case-insensitive
      expect(claudeProvider.getModelConfig('CLAUDE:OPUS').modelName).toBe(
        'claude-opus-5',
      );
    });

    it('should resolve bare fable/opus names', () => {
      expect(claudeProvider.getModelConfig('fable').modelName).toBe(
        'claude-fable-5-1',
      );
      expect(claudeProvider.getModelConfig('opus').modelName).toBe(
        'claude-opus-5',
      );
    });

    it('should return null for unknown models', () => {
      expect(claudeProvider.getModelConfig('unknown-model')).toBeNull();
    });
  });

  describe('SDK options', () => {
    it.each([false, true])('should forward effort with stream=%s', async (stream) => {
      const response = await claudeProvider.invoke(
        [{ role: 'user', content: 'Hi' }],
        { config: mockConfig, reasoning_effort: 'xhigh', stream },
      );
      if (stream) {
        await Array.fromAsync(response);
      }
      expect(mockQuery.mock.calls[0][0].options.effort).toBe('xhigh');
      expect(mockQuery.mock.calls[0][0].options.maxTurns).toBe(100);
    });

    it.each([
      ['none', 'low'],
      ['minimal', 'low'],
      ['low', 'low'],
      ['medium', 'medium'],
      ['high', 'high'],
      ['max', 'max'],
      ['invalid', 'medium'],
    ])('should map effort %s to %s', async (requested, expected) => {
      await claudeProvider.invoke([{ role: 'user', content: 'Hi' }], {
        config: mockConfig,
        reasoning_effort: requested,
      });
      expect(mockQuery.mock.calls[0][0].options.effort).toBe(expected);
    });

    it('should allow 100 SDK turns and retain the default effort when omitted', async () => {
      await claudeProvider.invoke([{ role: 'user', content: 'Hi' }], {
        config: mockConfig,
      });
      expect(mockQuery.mock.calls[0][0].options.maxTurns).toBe(100);
      expect(mockQuery.mock.calls[0][0].options).not.toHaveProperty('effort');
    });
  });

  describe('Model resolution in invoke', () => {
    const cases = [
      ['claude', 'claude-fable-5-1'],
      ['claude-sdk', 'claude-fable-5-1'],
      ['claude-code', 'claude-fable-5-1'],
      ['claude:', 'claude-fable-5-1'],
      ['claude: ', 'claude-fable-5-1'],
      ['', 'claude-fable-5-1'],
      ['claude:fable', 'claude-fable-5-1'],
      ['claude:claude-fable', 'claude-fable-5-1'],
      ['claude:fable-5', 'claude-fable-5'],
      ['claude:claude-fable-5', 'claude-fable-5'],
      ['claude:fable-5.1', 'claude-fable-5-1'],
      ['claude:fable-5-1', 'claude-fable-5-1'],
      ['claude:claude-fable-5.1', 'claude-fable-5-1'],
      ['claude:claude-fable-5-1', 'claude-fable-5-1'],
      ['CLAUDE:FABLE-5.1', 'claude-fable-5-1'],
      ['claude:opus', 'claude-opus-5'],
    ];

    cases.forEach(([requested, expected]) => {
      it(`should pass "${requested}" to the SDK as "${expected}"`, async () => {
        const result = await claudeProvider.invoke(
          [{ role: 'user', content: 'Hi' }],
          {
            model: requested,
            config: mockConfig,
          },
        );

        expect(mockQuery).toHaveBeenCalledTimes(1);
        const queryArgs = mockQuery.mock.calls[0][0];
        expect(queryArgs.options.model).toBe(expected);

        expect(result.content).toBe('Hello back');
        expect(result.stop_reason).toBe(StopReasons.STOP);
        expect(result.metadata.model).toBe(expected);
      });
    });

    it('should default to Claude Fable 5.1 when no model is specified', async () => {
      await claudeProvider.invoke([{ role: 'user', content: 'Hi' }], {
        config: mockConfig,
      });

      const queryArgs = mockQuery.mock.calls[0][0];
      expect(queryArgs.options.model).toBe('claude-fable-5-1');
    });

    it('should pass unknown claude: prefixed models through to the SDK', async () => {
      await claudeProvider.invoke([{ role: 'user', content: 'Hi' }], {
        model: 'claude:claude-sonnet-4-6',
        config: mockConfig,
      });

      const queryArgs = mockQuery.mock.calls[0][0];
      expect(queryArgs.options.model).toBe('claude-sonnet-4-6');
    });
  });
});
