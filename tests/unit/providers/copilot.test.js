/**
 * Copilot Provider Unit Tests
 *
 * Tests for copilot: prefix routing, model alias resolution,
 * getModelConfig, resolveSessionModel, and edge cases.
 */

import { describe, expect, it } from 'vitest';
import { copilotProvider, resolveModelAlias, resolveSessionModel } from '../../../src/providers/copilot.js';
import { mapModelToProvider } from '../../../src/tools/chat.js';

describe('Copilot Provider - Model Selection', () => {
  describe('resolveModelAlias', () => {
    it('resolves version shortcut aliases', () => {
      expect(resolveModelAlias('gpt-5')).toBe('gpt-5.2');
      expect(resolveModelAlias('codex')).toBe('gpt-5.3-codex');
      expect(resolveModelAlias('sonnet')).toBe('claude-sonnet-4.6');
      expect(resolveModelAlias('opus')).toBe('claude-opus-4.6');
      expect(resolveModelAlias('haiku')).toBe('claude-haiku-4.5');
      expect(resolveModelAlias('gemini')).toBe('gemini-3.1-pro-preview');
    });

    it('resolves convenience aliases without -preview suffix', () => {
      expect(resolveModelAlias('gemini-3-pro')).toBe('gemini-3-pro-preview');
      expect(resolveModelAlias('gemini-3.1-pro')).toBe('gemini-3.1-pro-preview');
    });

    it('resolves direct SDK model names', () => {
      expect(resolveModelAlias('gpt-5.2')).toBe('gpt-5.2');
      expect(resolveModelAlias('claude-sonnet-4.6')).toBe('claude-sonnet-4.6');
      expect(resolveModelAlias('gemini-3-pro-preview')).toBe('gemini-3-pro-preview');
      expect(resolveModelAlias('gemini-3.1-pro-preview')).toBe('gemini-3.1-pro-preview');
    });

    it('is case-insensitive', () => {
      expect(resolveModelAlias('GPT-5')).toBe('gpt-5.2');
      expect(resolveModelAlias('CODEX')).toBe('gpt-5.3-codex');
      expect(resolveModelAlias('Sonnet')).toBe('claude-sonnet-4.6');
      expect(resolveModelAlias('CLAUDE-SONNET-4.6')).toBe('claude-sonnet-4.6');
    });

    it('returns null for unknown models', () => {
      expect(resolveModelAlias('future-model')).toBeNull();
      expect(resolveModelAlias('nonexistent')).toBeNull();
    });

    it('returns null for the base copilot entry', () => {
      expect(resolveModelAlias('copilot')).toBeNull();
    });

    it('returns null for non-string inputs', () => {
      expect(resolveModelAlias(null)).toBeNull();
      expect(resolveModelAlias(undefined)).toBeNull();
      expect(resolveModelAlias(123)).toBeNull();
      expect(resolveModelAlias({})).toBeNull();
    });

    it('returns null for empty/whitespace strings', () => {
      expect(resolveModelAlias('')).toBeNull();
      expect(resolveModelAlias('   ')).toBeNull();
    });
  });

  describe('resolveSessionModel', () => {
    it('strips copilot: prefix and resolves alias', () => {
      expect(resolveSessionModel('copilot:gpt-5', {})).toBe('gpt-5.2');
      expect(resolveSessionModel('copilot:codex', {})).toBe('gpt-5.3-codex');
      expect(resolveSessionModel('copilot:sonnet', {})).toBe('claude-sonnet-4.6');
    });

    it('strips copilot: prefix and passes through SDK model names', () => {
      expect(resolveSessionModel('copilot:gpt-5.2', {})).toBe('gpt-5.2');
      expect(resolveSessionModel('copilot:claude-sonnet-4.6', {})).toBe('claude-sonnet-4.6');
    });

    it('passes through unknown models after prefix stripping', () => {
      expect(resolveSessionModel('copilot:future-model', {})).toBe('future-model');
    });

    it('is case-insensitive for prefix detection', () => {
      expect(resolveSessionModel('CoPiLoT:GPT-5', {})).toBe('gpt-5.2');
      expect(resolveSessionModel('COPILOT:codex', {})).toBe('gpt-5.3-codex');
    });

    it('falls back to default for bare copilot aliases', () => {
      expect(resolveSessionModel('copilot', {})).toBeUndefined();
      expect(resolveSessionModel('copilot-sdk', {})).toBeUndefined();
      expect(resolveSessionModel('github-copilot', {})).toBeUndefined();
    });

    it('falls back to default for empty/whitespace suffix', () => {
      expect(resolveSessionModel('copilot:', {})).toBeUndefined();
      expect(resolveSessionModel('copilot:   ', {})).toBeUndefined();
    });

    it('uses COPILOT_MODEL env var as fallback with alias resolution', () => {
      const config = { providers: { copilotmodel: 'codex' } };
      expect(resolveSessionModel('copilot', config)).toBe('gpt-5.3-codex');
    });

    it('strips copilot: prefix from COPILOT_MODEL env var', () => {
      const config = { providers: { copilotmodel: 'copilot:codex' } };
      expect(resolveSessionModel('copilot', config)).toBe('gpt-5.3-codex');
    });

    it('passes through unknown env var values', () => {
      const config = { providers: { copilotmodel: 'some-future-model' } };
      expect(resolveSessionModel('copilot', config)).toBe('some-future-model');
    });

    it('treats converse aliases in env var as SDK default', () => {
      expect(resolveSessionModel('copilot', { providers: { copilotmodel: 'copilot' } })).toBeUndefined();
      expect(resolveSessionModel('copilot', { providers: { copilotmodel: 'copilot-sdk' } })).toBeUndefined();
      expect(resolveSessionModel('copilot', { providers: { copilotmodel: 'github-copilot' } })).toBeUndefined();
      expect(resolveSessionModel('copilot', { providers: { copilotmodel: 'copilot:copilot' } })).toBeUndefined();
    });

    it('handles non-string model inputs', () => {
      expect(resolveSessionModel(null, {})).toBeUndefined();
      expect(resolveSessionModel(undefined, {})).toBeUndefined();
      expect(resolveSessionModel(123, {})).toBeUndefined();
    });
  });

  describe('getModelConfig', () => {
    it('returns config for SDK model names', () => {
      const config = copilotProvider.getModelConfig('gpt-5.2');
      expect(config).toBeTruthy();
      expect(config.modelName).toBe('gpt-5.2');
    });

    it('returns config via alias lookup', () => {
      const config = copilotProvider.getModelConfig('gpt-5');
      expect(config).toBeTruthy();
      expect(config.modelName).toBe('gpt-5.2');
    });

    it('handles copilot: prefix', () => {
      const config = copilotProvider.getModelConfig('copilot:gpt-5.2');
      expect(config).toBeTruthy();
      expect(config.modelName).toBe('gpt-5.2');
    });

    it('handles copilot: prefix with alias', () => {
      const config = copilotProvider.getModelConfig('copilot:codex');
      expect(config).toBeTruthy();
      expect(config.modelName).toBe('gpt-5.3-codex');
    });

    it('returns base copilot config for empty suffix', () => {
      const config = copilotProvider.getModelConfig('copilot:');
      expect(config).toBeTruthy();
      expect(config.modelName).toBe('copilot');
    });

    it('returns null for unknown models', () => {
      expect(copilotProvider.getModelConfig('nonexistent')).toBeNull();
      expect(copilotProvider.getModelConfig('copilot:nonexistent')).toBeNull();
    });

    it('returns null for non-string inputs', () => {
      expect(copilotProvider.getModelConfig(null)).toBeNull();
      expect(copilotProvider.getModelConfig(123)).toBeNull();
    });

    it('is case-insensitive', () => {
      const config = copilotProvider.getModelConfig('GPT-5.2');
      expect(config).toBeTruthy();
      expect(config.modelName).toBe('gpt-5.2');
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

    it('contains all expected model families', () => {
      const models = copilotProvider.getSupportedModels();
      const keys = Object.keys(models);

      // OpenAI
      expect(keys).toContain('gpt-4.1');
      expect(keys).toContain('gpt-5.2');
      expect(keys).toContain('gpt-5.3-codex');

      // Anthropic
      expect(keys).toContain('claude-haiku-4.5');
      expect(keys).toContain('claude-sonnet-4.6');
      expect(keys).toContain('claude-opus-4.6');

      // Google
      expect(keys).toContain('gemini-3-pro-preview');
      expect(keys).toContain('gemini-3.1-pro-preview');
    });
  });
});

describe('Copilot Prefix Routing - mapModelToProvider', () => {
  it('routes copilot:modelname to copilot provider', () => {
    expect(mapModelToProvider('copilot:gpt-5.2', {})).toBe('copilot');
    expect(mapModelToProvider('copilot:claude-sonnet-4.6', {})).toBe('copilot');
    expect(mapModelToProvider('copilot:gemini-3.1-pro-preview', {})).toBe('copilot');
  });

  it('routes copilot:alias to copilot provider', () => {
    expect(mapModelToProvider('copilot:codex', {})).toBe('copilot');
    expect(mapModelToProvider('copilot:sonnet', {})).toBe('copilot');
    expect(mapModelToProvider('copilot:gpt-5', {})).toBe('copilot');
  });

  it('routes bare copilot aliases to copilot provider', () => {
    expect(mapModelToProvider('copilot', {})).toBe('copilot');
    expect(mapModelToProvider('copilot-sdk', {})).toBe('copilot');
    expect(mapModelToProvider('github-copilot', {})).toBe('copilot');
  });

  it('does NOT route models without copilot: prefix to copilot', () => {
    expect(mapModelToProvider('claude-sonnet-4.6', {})).toBe('anthropic');
    expect(mapModelToProvider('gpt-5.2', {})).toBe('openai');
    expect(mapModelToProvider('grok-4', {})).toBe('xai');
  });

  it('prevents copilot:claude-sonnet from routing to anthropic', () => {
    expect(mapModelToProvider('copilot:claude-sonnet-4.6', {})).toBe('copilot');
    expect(mapModelToProvider('copilot:opus', {})).toBe('copilot');
    expect(mapModelToProvider('copilot:haiku', {})).toBe('copilot');
  });

  it('prevents copilot:openai/gpt-5 from routing via slash format', () => {
    expect(mapModelToProvider('copilot:openai/gpt-5', {})).toBe('copilot');
  });

  it('is case-insensitive for prefix', () => {
    expect(mapModelToProvider('COPILOT:gpt-5', {})).toBe('copilot');
    expect(mapModelToProvider('CoPiLoT:codex', {})).toBe('copilot');
  });

  it('routes empty suffix to copilot', () => {
    expect(mapModelToProvider('copilot:', {})).toBe('copilot');
  });
});
