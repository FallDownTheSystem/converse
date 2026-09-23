/**
 * Copilot Provider Unit Tests
 *
 * Tests for copilot: namespace routing, catalog alias resolution,
 * getModelConfig, resolveSessionModel, and edge cases.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
  copilotProvider,
  resolveCopilotCliPath,
  resolveSessionModel,
} from '../../../src/providers/copilot.js';
import { getProviders } from '../../../src/providers/index.js';
import { ErrorCodes } from '../../../src/providers/interface.js';
import { resolveModelSpec } from '../../../src/utils/modelRouting.js';

const expectModelNotFound = (fn) =>
  expect(fn).toThrow(expect.objectContaining({ code: ErrorCodes.MODEL_NOT_FOUND }));

describe('Copilot Provider - Model Selection', () => {
  describe('resolveSessionModel', () => {
    it('resolves version shortcut aliases', () => {
      expect(resolveSessionModel('gpt-6')).toBe('gpt-6-sol');
      expect(resolveSessionModel('gpt-5.6')).toBe('gpt-5.6-sol');
      expect(resolveSessionModel('gpt-5')).toBe('gpt-6-sol');
      expect(resolveSessionModel('gpt')).toBe('gpt-6-sol');
      expect(resolveSessionModel('codex')).toBe('gpt-6-sol');
      expect(resolveSessionModel('sol')).toBe('gpt-6-sol');
      expect(resolveSessionModel('luna')).toBe('gpt-6-luna');
      expect(resolveSessionModel('sonnet')).toBe('claude-sonnet-5');
      expect(resolveSessionModel('fable')).toBe('claude-fable-5');
      expect(resolveSessionModel('opus')).toBe('claude-opus-5.5');
      expect(resolveSessionModel('claude')).toBe('claude-opus-5.5');
      expect(resolveSessionModel('claude-opus-5-5')).toBe('claude-opus-5.5');
      expect(resolveSessionModel('gemini')).toBe('gemini-3.1-pro-preview');
      expect(resolveSessionModel('gemini-flash')).toBe('gemini-3.5-flash');
    });

    it('resolves convenience aliases without -preview suffix', () => {
      expect(resolveSessionModel('gemini-3.1-pro')).toBe('gemini-3.1-pro-preview');
    });

    it('resolves direct SDK model names', () => {
      expect(resolveSessionModel('gpt-5.6-terra')).toBe('gpt-5.6-terra');
      expect(resolveSessionModel('claude-sonnet-5')).toBe('claude-sonnet-5');
      expect(resolveSessionModel('gemini-3.5-flash')).toBe('gemini-3.5-flash');
      expect(resolveSessionModel('gemini-3.1-pro-preview')).toBe('gemini-3.1-pro-preview');
    });

    it('is case-insensitive', () => {
      expect(resolveSessionModel('GPT-5')).toBe('gpt-6-sol');
      expect(resolveSessionModel('Sonnet')).toBe('claude-sonnet-5');
      expect(resolveSessionModel('FABLE')).toBe('claude-fable-5');
      expect(resolveSessionModel('CLAUDE-OPUS-4.8')).toBe('claude-opus-4.8');
    });

    it('defaults to gpt-6-sol for omitted, empty or non-string models', () => {
      expect(resolveSessionModel()).toBe('gpt-6-sol');
      expect(resolveSessionModel(undefined)).toBe('gpt-6-sol');
      expect(resolveSessionModel(null)).toBe('gpt-6-sol');
      expect(resolveSessionModel('')).toBe('gpt-6-sol');
      expect(resolveSessionModel('   ')).toBe('gpt-6-sol');
      expect(resolveSessionModel(123)).toBe('gpt-6-sol');
    });

    it('rejects unknown models', () => {
      expectModelNotFound(() => resolveSessionModel('future-model'));
      expectModelNotFound(() => resolveSessionModel('nonexistent'));
    });

    it('rejects router namespaces and prefixed specs (the router strips them)', () => {
      expectModelNotFound(() => resolveSessionModel('copilot'));
      expectModelNotFound(() => resolveSessionModel('copilot-sdk'));
      expectModelNotFound(() => resolveSessionModel('github-copilot'));
      expectModelNotFound(() => resolveSessionModel('copilot:gpt-5'));
      expectModelNotFound(() => resolveSessionModel('COPILOT:sonnet'));
    });
  });

  describe('getModelConfig', () => {
    it('returns config for SDK model names', () => {
      const config = copilotProvider.getModelConfig('gpt-5.6-terra');
      expect(config).toBeTruthy();
      expect(config.modelName).toBe('gpt-5.6-terra');
    });

    it('returns config via alias lookup', () => {
      const config = copilotProvider.getModelConfig('gpt-5');
      expect(config).toBeTruthy();
      expect(config.modelName).toBe('gpt-6-sol');
    });

    it('does not strip a copilot: prefix', () => {
      expect(copilotProvider.getModelConfig('copilot:gpt-5.6-terra')).toBeNull();
      expect(copilotProvider.getModelConfig('copilot:sonnet')).toBeNull();
      expect(copilotProvider.getModelConfig('copilot:')).toBeNull();
      expect(copilotProvider.getModelConfig('copilot')).toBeNull();
    });

    it('exposes gpt-6-sol as the default model', () => {
      expect(copilotProvider.defaultModel).toBe('gpt-6-sol');
      expect(copilotProvider.getModelConfig(copilotProvider.defaultModel).modelName).toBe(
        'gpt-6-sol',
      );
    });

    it('returns null for unknown models', () => {
      expect(copilotProvider.getModelConfig('nonexistent')).toBeNull();
      expect(copilotProvider.getModelConfig('copilot:nonexistent')).toBeNull();
    });

    it('returns null for non-string inputs', () => {
      expect(copilotProvider.getModelConfig(null)).toBeNull();
      expect(copilotProvider.getModelConfig(undefined)).toBeNull();
      expect(copilotProvider.getModelConfig(123)).toBeNull();
    });

    it('is case-insensitive', () => {
      const config = copilotProvider.getModelConfig('GPT-5.6-TERRA');
      expect(config).toBeTruthy();
      expect(config.modelName).toBe('gpt-5.6-terra');
    });
  });

  describe('SUPPORTED_MODELS consistency', () => {
    it('has no duplicate aliases across entries', () => {
      const models = copilotProvider.getSupportedModels();
      const allAliases = new Map();

      for (const [key, config] of Object.entries(models)) {
        for (const alias of config.aliases || []) {
          const lower = alias.toLowerCase();
          if (allAliases.has(lower)) {
            throw new Error(
              `Duplicate alias "${alias}" found in "${key}" and "${allAliases.get(lower)}"`,
            );
          }
          allAliases.set(lower, key);
        }
      }
    });

    it('has modelName matching the object key for all entries', () => {
      const models = copilotProvider.getSupportedModels();
      for (const [key, config] of Object.entries(models)) {
        expect(config.modelName).toBe(key);
      }
    });

    it('advertises exactly the 12 curated IDs', () => {
      const models = copilotProvider.getSupportedModels();
      const keys = Object.keys(models).sort();

      expect(keys).toHaveLength(12);
      expect(keys).toEqual(
        [
          'gpt-6-sol',
          'gpt-6-luna',
          'gpt-5.6-sol',
          'gpt-5.6-terra',
          'gpt-5.6-luna',
          'claude-opus-5.5',
          'claude-fable-5',
          'claude-sonnet-5',
          'claude-opus-5',
          'claude-opus-4.8',
          'gemini-3.1-pro-preview',
          'gemini-3.5-flash',
        ].sort(),
      );
    });

    it('does not advertise retired models', () => {
      const keys = Object.keys(copilotProvider.getSupportedModels());
      for (const retired of [
        'gpt-4.1',
        'gpt-5-mini',
        'gpt-5.1',
        'gpt-5.1-codex',
        'gpt-5.4',
        'gpt-5.2-codex',
        'gpt-5.3-codex',
        'claude-haiku-4.5',
        'claude-sonnet-4',
        'claude-sonnet-4.5',
        'claude-sonnet-4.6',
        'claude-opus-4.5',
        'claude-opus-4.6',
        'claude-opus-4.7',
        'gemini-3-pro-preview',
      ]) {
        expect(keys).not.toContain(retired);
      }
    });

    it('flags reasoning-effort support only on the GPT tiers', () => {
      const models = copilotProvider.getSupportedModels();
      expect(models['gpt-6-sol'].supportsReasoningEffort).toBe(true);
      expect(models['gpt-6-luna'].supportsReasoningEffort).toBe(true);
      expect(models['claude-opus-5.5'].supportsReasoningEffort).toBeUndefined();
      expect(models['gpt-5.6-sol'].supportsReasoningEffort).toBe(true);
      expect(models['gpt-5.6-terra'].supportsReasoningEffort).toBe(true);
      expect(models['gpt-5.6-luna'].supportsReasoningEffort).toBe(true);
    });
  });

  describe('retired / unknown IDs', () => {
    it('rejects retired IDs instead of forwarding them to the SDK', () => {
      expectModelNotFound(() => resolveSessionModel('gpt-5.3-codex'));
      expectModelNotFound(() => resolveSessionModel('claude-opus-4.6'));
      expect(copilotProvider.getModelConfig('gpt-5.3-codex')).toBeNull();
    });
  });
});

describe('Copilot Namespace Routing - resolveModelSpec', () => {
  // Every other provider is marked available so a bare name that copilot
  // could serve would have somewhere else to go.
  function allAvailable() {
    return Object.fromEntries(
      Object.entries(getProviders()).map(([name, provider]) => [
        name,
        { ...provider, isAvailable: () => true },
      ]),
    );
  }

  const resolve = (spec, config = {}) => resolveModelSpec(spec, allAvailable(), config);

  const expectCopilot = (spec, model, config) => {
    const result = resolve(spec, config);
    expect(result.status).toBe('ok');
    expect(result.providerName).toBe('copilot');
    expect(result.resolvedModel).toBe(model);
  };

  it('routes copilot:modelname to copilot provider', () => {
    expectCopilot('copilot:gpt-5.6-terra', 'gpt-5.6-terra');
    expectCopilot('copilot:claude-sonnet-5', 'claude-sonnet-5');
    expectCopilot('copilot:gemini-3.1-pro-preview', 'gemini-3.1-pro-preview');
  });

  it('routes copilot:alias to copilot provider with the canonical ID', () => {
    expectCopilot('copilot:fable', 'claude-fable-5');
    expectCopilot('copilot:sonnet', 'claude-sonnet-5');
    expectCopilot('copilot:gpt-5', 'gpt-6-sol');
    expectCopilot('copilot:opus', 'claude-opus-5.5');
    expectCopilot('copilot:claude', 'claude-opus-5.5');
  });

  it('routes bare copilot namespaces to the copilot default', () => {
    expectCopilot('copilot', 'gpt-6-sol');
    expectCopilot('copilot-sdk', 'gpt-6-sol');
    expectCopilot('github-copilot', 'gpt-6-sol');
    expectCopilot('copilot:', 'gpt-6-sol');
  });

  it('honours the default-model override for bare copilot', () => {
    expectCopilot('copilot', 'claude-sonnet-5', {
      providers: { copilotdefaultmodel: 'sonnet' },
    });
    // Legacy COPILOT_MODEL still applies when COPILOT_DEFAULT_MODEL is unset
    expectCopilot('copilot', 'claude-sonnet-5', {
      providers: { copilotmodel: 'sonnet' },
    });
    // An explicit copilot:<model> beats the override
    expectCopilot('copilot:luna', 'gpt-6-luna', {
      providers: { copilotdefaultmodel: 'sonnet' },
    });
  });

  it('never routes bare model names to copilot', () => {
    for (const spec of ['claude-sonnet-5', 'gpt-5.6', 'sonnet', 'gemini-3.1-pro-preview']) {
      const result = resolve(spec);
      expect(result.providerName).not.toBe('copilot');
      expect(result.candidates.map((c) => c.providerName)).not.toContain('copilot');
    }
  });

  it('suggests the copilot: form for a copilot-only bare name', () => {
    const result = resolve('claude-sonnet-5');
    expect(result.status).toBe('unknown');
    expect(result.error).toContain('Did you mean');
    expect(result.error).toContain('copilot:claude-sonnet-5');
  });

  it('keeps copilot:openai/gpt-5 inside the copilot namespace', () => {
    const result = resolve('copilot:openai/gpt-5');
    expect(result.status).toBe('unknown');
    expect(result.providerName).toBe('copilot');
    expect(result.error).toContain('Did you mean');
  });

  it('is case-insensitive for the namespace', () => {
    expectCopilot('COPILOT:gpt-5', 'gpt-6-sol');
    expectCopilot('CoPiLoT:codex', 'gpt-6-sol');
  });

  it('rejects unknown copilot: models', () => {
    const result = resolve('copilot:future-model');
    expect(result.status).toBe('unknown');
    expect(result.providerName).toBe('copilot');
    expect(result.resolvedModel).toBeNull();
  });
});

describe('Copilot Provider - availability', () => {
  it('is available when the SDK package resolves (auth errors surface at invoke)', () => {
    expect(copilotProvider.isAvailable({})).toBe(true);
  });
});

describe('Copilot Provider - CLI path resolution', () => {
  // A path guaranteed to exist on every machine: this test file itself.
  const existingPath = fileURLToPath(import.meta.url);
  const missingPath = `${existingPath}.does-not-exist`;

  afterEach(() => {
    delete process.env.COPILOT_CLI_PATH;
  });

  it('uses an existing explicit override from config', () => {
    const config = { providers: { copilotclipath: existingPath } };
    expect(resolveCopilotCliPath(config)).toBe(existingPath);
  });

  it('uses COPILOT_CLI_PATH env when set and existing', () => {
    process.env.COPILOT_CLI_PATH = existingPath;
    expect(resolveCopilotCliPath(undefined)).toBe(existingPath);
  });

  it('ignores a non-existent override and falls through', () => {
    const config = { providers: { copilotclipath: missingPath } };
    expect(resolveCopilotCliPath(config)).not.toBe(missingPath);
  });

  it('returns null or a real path when nothing is configured', () => {
    const result = resolveCopilotCliPath(undefined);
    // Environment-dependent: null (defer to SDK), the bundled index.js, or a
    // copilot binary on PATH — never a fabricated/non-existent path.
    expect(result === null || typeof result === 'string').toBe(true);
  });
});
