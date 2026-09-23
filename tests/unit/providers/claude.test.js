/**
 * Claude SDK Provider Tests
 *
 * Tests the Claude Agent SDK provider with a mocked SDK, focusing on
 * catalog lookup (canonical IDs and aliases), router resolution of the
 * `claude` namespace, and availability detection.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCodes, StopReasons } from '../../../src/providers/interface.js';

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
import { getProviders } from '../../../src/providers/index.js';
import { resolveModelSpec } from '../../../src/utils/modelRouting.js';

function createSdkResponse() {
  return (async function* () {
    yield {
      type: 'system',
      subtype: 'init',
      session_id: 'sess_test',
      model: 'claude-opus-5-5',
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

// The router only picks available providers; the real probe depends on the
// machine's Claude Code login, so tests pin it.
function providersWithClaudeAvailable() {
  return {
    ...getProviders(),
    claude: { ...getProviders().claude, isAvailable: () => true },
  };
}

describe('Claude SDK Provider', () => {
  const mockConfig = { server: {} };

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockImplementation(() => createSdkResponse());
  });

  describe('Model Management', () => {
    it('should return supported models keyed by canonical ID', () => {
      const models = claudeProvider.getSupportedModels();

      expect(Object.keys(models)).toEqual([
        'claude-opus-5-5',
        'claude-opus-5',
        'claude-fable-5-1',
        'claude-fable-5',
      ]);
      for (const [id, entry] of Object.entries(models)) {
        expect(entry.modelName).toBe(id);
        expect(Array.isArray(entry.aliases)).toBe(true);
      }
      expect(models['claude-opus-5-5'].aliases).toEqual(
        expect.arrayContaining(['opus', 'claude-opus', 'claude-opus-5.5', 'opus-5-5', 'opus-5.5']),
      );
      expect(models['claude-opus-5'].aliases).toEqual(
        expect.arrayContaining(['opus-5', 'opus5']),
      );
      expect(models['claude-fable-5-1'].aliases).toEqual(
        expect.arrayContaining(['fable', 'claude-fable', 'claude-fable-5.1', 'fable-5-1', 'fable-5.1']),
      );
      expect(models['claude-fable-5'].aliases).toEqual(
        expect.arrayContaining(['fable-5', 'fable5']),
      );
    });

    it('should expose Claude Opus 5.5 as the default model', () => {
      expect(claudeProvider.defaultModel).toBe('claude-opus-5-5');
    });

    it('should not treat router namespaces or empty names as models', () => {
      ['claude', 'claude-sdk', 'claude-code', 'claude:', 'claude: ', ''].forEach((name) => {
        expect(claudeProvider.getModelConfig(name)).toBeNull();
      });
    });

    it('should not strip a claude: prefix (the router does that)', () => {
      expect(claudeProvider.getModelConfig('claude:fable')).toBeNull();
      expect(claudeProvider.getModelConfig('claude:opus')).toBeNull();
    });

    it('should resolve canonical IDs and aliases case-insensitively', () => {
      expect(claudeProvider.getModelConfig('claude-fable-5-1').modelName).toBe(
        'claude-fable-5-1',
      );
      expect(claudeProvider.getModelConfig('opus-5').modelName).toBe(
        'claude-opus-5',
      );
      expect(claudeProvider.getModelConfig('OPUS').modelName).toBe(
        'claude-opus-5-5',
      );
      expect(claudeProvider.getModelConfig('Claude-Fable-5.1').modelName).toBe(
        'claude-fable-5-1',
      );
    });

    it('should resolve bare fable/opus names', () => {
      expect(claudeProvider.getModelConfig('fable').modelName).toBe(
        'claude-fable-5-1',
      );
      expect(claudeProvider.getModelConfig('opus').modelName).toBe(
        'claude-opus-5-5',
      );
    });

    it('should return null for unknown models', () => {
      expect(claudeProvider.getModelConfig('unknown-model')).toBeNull();
    });
  });

  describe('Router resolution of the claude namespace', () => {
    const cases = [
      ['claude', 'claude-opus-5-5'],
      ['claude-sdk', 'claude-opus-5-5'],
      ['claude-code', 'claude-opus-5-5'],
      ['claude:', 'claude-opus-5-5'],
      ['claude: ', 'claude-opus-5-5'],
      ['claude:opus', 'claude-opus-5-5'],
      ['claude:opus-5.5', 'claude-opus-5-5'],
      ['claude:claude-opus-5-5', 'claude-opus-5-5'],
      ['CLAUDE:OPUS-5.5', 'claude-opus-5-5'],
      ['claude:opus-5', 'claude-opus-5'],
      ['claude:claude-opus-5', 'claude-opus-5'],
      ['claude:fable', 'claude-fable-5-1'],
      ['claude:claude-fable', 'claude-fable-5-1'],
      ['claude:fable-5', 'claude-fable-5'],
      ['claude:claude-fable-5', 'claude-fable-5'],
      ['claude:fable-5.1', 'claude-fable-5-1'],
      ['claude:fable-5-1', 'claude-fable-5-1'],
      ['claude:claude-fable-5.1', 'claude-fable-5-1'],
      ['claude:claude-fable-5-1', 'claude-fable-5-1'],
      ['CLAUDE:FABLE-5.1', 'claude-fable-5-1'],
    ];

    cases.forEach(([spec, expected]) => {
      it(`should route "${spec}" to claude as "${expected}"`, () => {
        const result = resolveModelSpec(spec, providersWithClaudeAvailable(), {});
        expect(result.status).toBe('ok');
        expect(result.providerName).toBe('claude');
        expect(result.resolvedModel).toBe(expected);
      });
    });

    it('should honor the configured default-model override for bare "claude"', () => {
      const result = resolveModelSpec('claude', providersWithClaudeAvailable(), {
        providers: { claudedefaultmodel: 'fable' },
      });
      expect(result.status).toBe('ok');
      expect(result.resolvedModel).toBe('claude-fable-5-1');
    });

    it('should reject unknown claude: models with suggestions', () => {
      const result = resolveModelSpec(
        'claude:claude-sonnet-4-6',
        providersWithClaudeAvailable(),
        {},
      );
      expect(result.status).toBe('unknown');
      expect(result.providerName).toBe('claude');
      expect(result.resolvedModel).toBeNull();
      expect(result.error).toContain('claude-sonnet-4-6');

      const typo = resolveModelSpec('claude:fabel', providersWithClaudeAvailable(), {});
      expect(typo.status).toBe('unknown');
      expect(typo.error).toContain('Did you mean');
      expect(typo.error).toContain('claude:fable');
    });

    it('should report unavailable when the provider is not available', () => {
      const providers = {
        ...getProviders(),
        claude: { ...getProviders().claude, isAvailable: () => false },
      };
      const result = resolveModelSpec('claude:opus', providers, {});
      expect(result.status).toBe('unavailable');
      expect(result.providerName).toBe('claude');
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
      ['', 'claude-opus-5-5'],
      ['claude-opus-5-5', 'claude-opus-5-5'],
      ['opus', 'claude-opus-5-5'],
      ['opus-5.5', 'claude-opus-5-5'],
      ['OPUS-5.5', 'claude-opus-5-5'],
      ['claude-opus-5', 'claude-opus-5'],
      ['opus-5', 'claude-opus-5'],
      ['claude-fable-5-1', 'claude-fable-5-1'],
      ['fable', 'claude-fable-5-1'],
      ['claude-fable', 'claude-fable-5-1'],
      ['fable-5.1', 'claude-fable-5-1'],
      ['fable-5-1', 'claude-fable-5-1'],
      ['claude-fable-5.1', 'claude-fable-5-1'],
      ['FABLE-5.1', 'claude-fable-5-1'],
      ['claude-fable-5', 'claude-fable-5'],
      ['fable-5', 'claude-fable-5'],
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

    it('should default to Claude Opus 5.5 when no model is specified', async () => {
      await claudeProvider.invoke([{ role: 'user', content: 'Hi' }], {
        config: mockConfig,
      });

      const queryArgs = mockQuery.mock.calls[0][0];
      expect(queryArgs.options.model).toBe('claude-opus-5-5');
    });

    it.each(['claude-sonnet-4-6', 'claude:opus', 'claude'])(
      'should reject unknown model "%s" without calling the SDK',
      async (model) => {
        await expect(
          claudeProvider.invoke([{ role: 'user', content: 'Hi' }], {
            model,
            config: mockConfig,
          }),
        ).rejects.toMatchObject({
          name: 'ClaudeProviderError',
          code: ErrorCodes.MODEL_NOT_FOUND,
        });
        expect(mockQuery).not.toHaveBeenCalled();
      },
    );
  });

  describe('Availability', () => {
    const ENV_KEYS = [
      'CLAUDE_CONFIG_DIR',
      'CLAUDE_CODE_OAUTH_TOKEN',
      'ANTHROPIC_API_KEY',
    ];
    let savedEnv;
    let configDir;

    beforeEach(() => {
      savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
      configDir = mkdtempSync(join(tmpdir(), 'converse-claude-test-'));
      process.env.CLAUDE_CONFIG_DIR = configDir;
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
      delete process.env.ANTHROPIC_API_KEY;
    });

    afterEach(() => {
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      rmSync(configDir, { recursive: true, force: true });
    });

    // macOS logins live in the Keychain and are assumed present.
    it.skipIf(process.platform === 'darwin')(
      'should be unavailable without any credential',
      () => {
        expect(claudeProvider.isAvailable(mockConfig)).toBe(false);
      },
    );

    it('should be available with a credentials file in CLAUDE_CONFIG_DIR', () => {
      writeFileSync(join(configDir, '.credentials.json'), '{}');
      expect(claudeProvider.isAvailable(mockConfig)).toBe(true);
    });

    it('should be available with CLAUDE_CODE_OAUTH_TOKEN', () => {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = 'token';
      expect(claudeProvider.isAvailable(mockConfig)).toBe(true);
    });

    it('should be available with ANTHROPIC_API_KEY', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      expect(claudeProvider.isAvailable(mockConfig)).toBe(true);
    });
  });
});
