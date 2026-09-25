/**
 * Model Routing Tests
 *
 * Exercises the router against the real provider catalogs: `provider`,
 * `provider:model`, and bare `model` specs; local-first bare-name priority
 * with same-model failover candidates; per-provider default overrides; and
 * "did you mean" rejection of unknown names.
 */

import { describe, expect, it } from 'vitest';
import { getProviders } from '../../src/providers/index.js';
import {
  BARE_NAME_PRIORITY,
  PROVIDER_NAMESPACES,
  getAutoModelSpecs,
  getDefaultModelForProvider,
  parseModelSpec,
  resolveModelSpec,
  suggestSimilar,
  validateDefaultModelOverrides,
} from '../../src/utils/modelRouting.js';
import { FAST_MODELS } from '../../src/services/summarizationService.js';

const registry = getProviders();

/**
 * Real providers with availability forced: every provider is available unless
 * named in `unavailable`.
 */
function providersWith({ unavailable = [] } = {}) {
  const providers = {};
  for (const [name, provider] of Object.entries(registry)) {
    providers[name] = { ...provider, isAvailable: () => !unavailable.includes(name) };
  }
  return providers;
}

const route = (spec, options, config = {}) =>
  resolveModelSpec(spec, providersWith(options), config);

const candidatesOf = (result) =>
  result.candidates.map((c) => `${c.providerName}:${c.resolvedModel}`);

describe('Model Routing', () => {
  describe('spec parsing', () => {
    it('splits a namespace only when the prefix has no slash', () => {
      expect(parseModelSpec('codex:astra')).toEqual({
        namespace: 'codex',
        providerName: 'codex',
        name: 'astra',
      });
      expect(parseModelSpec('z-ai/glm-5.2:free')).toEqual({
        namespace: null,
        providerName: null,
        name: 'z-ai/glm-5.2:free',
      });
      expect(parseModelSpec('AGY:pro').providerName).toBe('gemini-cli');
    });
  });

  describe('defaults', () => {
    it('uses each provider\'s hardcoded default', () => {
      const providers = providersWith();
      expect(getDefaultModelForProvider('codex', providers, {})).toBe('gpt-6-astra');
      expect(getDefaultModelForProvider('claude', providers, {})).toBe('claude-opus-5-5');
      expect(getDefaultModelForProvider('gemini-cli', providers, {})).toBe('gemini-3.8-flash');
      expect(getDefaultModelForProvider('copilot', providers, {})).toBe('gpt-6-sol');
      expect(getDefaultModelForProvider('openai', providers, {})).toBe('gpt-6-sol');
      expect(getDefaultModelForProvider('google', providers, {})).toBe('gemini-3.1-pro-preview');
      expect(getDefaultModelForProvider('xai', providers, {})).toBe('grok-4.5');
      expect(getDefaultModelForProvider('anthropic', providers, {})).toBe('claude-opus-5-5');
      expect(getDefaultModelForProvider('mistral', providers, {})).toBe('mistral-medium-3-5');
      expect(getDefaultModelForProvider('deepseek', providers, {})).toBe('deepseek-v4-pro');
      expect(getDefaultModelForProvider('openrouter', providers, {})).toBe('z-ai/glm-5.2');
    });

    it('every hardcoded default is in its provider\'s catalog', () => {
      for (const [name, provider] of Object.entries(registry)) {
        expect(provider.getSupportedModels()[provider.defaultModel], name).toBeDefined();
      }
    });

    it('resolves a bare provider name to its default model', () => {
      const r = route('codex');
      expect(r.status).toBe('ok');
      expect(candidatesOf(r)).toEqual(['codex:gpt-6-astra']);
      expect(candidatesOf(route('gemini'))).toEqual(['gemini-cli:gemini-3.8-flash']);
      expect(candidatesOf(route('openai'))).toEqual(['openai:gpt-6-sol']);
    });

    it('applies an env override given as an alias', () => {
      const config = { providers: { codexdefaultmodel: 'luna' } };
      expect(candidatesOf(route('codex', {}, config))).toEqual(['codex:gpt-6-luna']);
      // An explicit model still wins over the override.
      expect(candidatesOf(route('codex:sol', {}, config))).toEqual(['codex:gpt-6-sol']);
    });

    it('honors the legacy CODEX_MODEL / COPILOT_MODEL vars, below the new ones', () => {
      expect(
        candidatesOf(route('codex', {}, { providers: { codexmodel: 'luna' } })),
      ).toEqual(['codex:gpt-6-luna']);
      expect(
        candidatesOf(
          route('codex', {}, { providers: { codexmodel: 'luna', codexdefaultmodel: 'astra' } }),
        ),
      ).toEqual(['codex:gpt-6-astra']);
      expect(
        candidatesOf(route('copilot', {}, { providers: { copilotmodel: 'sonnet' } })),
      ).toEqual(['copilot:claude-sonnet-5']);
    });

    it('rejects an override that is not in the provider catalog, with suggestions', () => {
      const errors = validateDefaultModelOverrides(registry, {
        providers: { codexdefaultmodel: 'gpt-6-astr', openaidefaultmodel: 'gpt6' },
      });
      expect(errors).toEqual([
        'CODEX_DEFAULT_MODEL="gpt-6-astr" is not a codex model. Did you mean: gpt-6-astra, gpt-6-sol?',
      ]);
    });

    it('accepts any OpenRouter slug as its default', () => {
      expect(
        validateDefaultModelOverrides(registry, {
          providers: { openrouterdefaultmodel: 'moonshotai/kimi-k3' },
        }),
      ).toEqual([]);
    });

    it('expands auto into namespaced default specs in priority order', () => {
      expect(getAutoModelSpecs(providersWith(), {}, { limit: 3 })).toEqual([
        'codex:gpt-6-astra',
        'gemini:gemini-3.8-flash',
        'claude:claude-opus-5-5',
      ]);
    });
  });

  describe('namespaced specs', () => {
    it('pins the model to the named provider', () => {
      expect(candidatesOf(route('codex:astra'))).toEqual(['codex:gpt-6-astra']);
      expect(candidatesOf(route('openai:gpt-6-astra'))).toEqual(['openai:gpt-6-astra']);
      expect(candidatesOf(route('gemini:pro'))).toEqual(['gemini-cli:gemini-3.1-pro-preview']);
      expect(candidatesOf(route('agy:flash'))).toEqual(['gemini-cli:gemini-3.8-flash']);
      expect(candidatesOf(route('claude:fable'))).toEqual(['claude:claude-fable-5-1']);
      expect(candidatesOf(route('copilot:sonnet'))).toEqual(['copilot:claude-sonnet-5']);
    });

    it('is case-insensitive in namespace and model', () => {
      expect(candidatesOf(route('CODEX:Astra'))).toEqual(['codex:gpt-6-astra']);
    });

    it('resolves every catalog ID and alias of every provider to that entry', () => {
      const providers = providersWith();
      for (const [name, provider] of Object.entries(registry)) {
        const ns = PROVIDER_NAMESPACES[name][0];
        for (const [id, entry] of Object.entries(provider.getSupportedModels())) {
          for (const alias of [id, ...(entry.aliases || [])]) {
            const r = resolveModelSpec(`${ns}:${alias}`, providers, {});
            expect(r.status, `${ns}:${alias}`).toBe('ok');
            expect(r.providerName, `${ns}:${alias}`).toBe(name);
            expect(r.resolvedModel, `${ns}:${alias}`).toBe(id);
          }
        }
      }
    });

    it('reports an unavailable provider instead of substituting another', () => {
      const r = route('codex:astra', { unavailable: ['codex'] });
      expect(r.status).toBe('unavailable');
      expect(r.error).toContain('codex login');
    });
  });

  describe('bare model names', () => {
    it('prefers local providers and lists same-model failover candidates', () => {
      const r = route('gpt-6-astra');
      expect(r.status).toBe('ok');
      expect(candidatesOf(r)).toEqual(['codex:gpt-6-astra', 'openai:gpt-6-astra']);
      expect(candidatesOf(route('opus'))).toEqual([
        'claude:claude-opus-5-5',
        'anthropic:claude-opus-5-5',
      ]);
      expect(candidatesOf(route('gemini-3.1-pro-preview'))).toEqual([
        'gemini-cli:gemini-3.1-pro-preview',
        'google:gemini-3.1-pro-preview',
      ]);
    });

    it('skips unavailable providers', () => {
      expect(candidatesOf(route('gpt-6-astra', { unavailable: ['codex'] }))).toEqual([
        'openai:gpt-6-astra',
      ]);
    });

    it('never fails over to a provider whose alias names a different model', () => {
      // claude's `fable` is Fable 5.1; anthropic's is Fable 5.
      expect(candidatesOf(route('fable'))).toEqual(['claude:claude-fable-5-1']);
      expect(candidatesOf(route('fable', { unavailable: ['claude'] }))).toEqual([
        'anthropic:claude-fable-5',
      ]);
    });

    it('explains which providers serve a model when none is available', () => {
      const r = route('gpt-6-astra', { unavailable: ['codex', 'openai'] });
      expect(r.status).toBe('unavailable');
      expect(r.error).toContain('served by codex, openai');
      expect(r.error).toContain('OPENAI_API_KEY');
    });

    it('never routes a bare name to Copilot', () => {
      expect(BARE_NAME_PRIORITY).not.toContain('copilot');
      const r = route('claude-sonnet-5');
      expect(r.status).toBe('unknown');
      expect(r.error).toContain('copilot:claude-sonnet-5');
    });
  });

  describe('unknown names', () => {
    it('suggests the closest bare model, one name per model', () => {
      const r = route('gtp-6-astra');
      expect(r.status).toBe('unknown');
      expect(r.error).toBe('Unknown model "gtp-6-astra". Did you mean: gpt-6-astra?');
    });

    it('suggests the closest namespace for an unknown provider', () => {
      expect(route('codx:sol').error).toBe(
        'Unknown provider "codx" in "codx:sol". Did you mean: codex:sol?',
      );
    });

    it('points a model under the wrong namespace at the provider that has it', () => {
      expect(route('openai:spark').error).toContain('Did you mean: codex:spark?');
    });

    it('suggests close models within a namespace', () => {
      expect(route('codex:gpt-6-astr').error).toContain('codex:gpt-6-astra');
    });

    it('offers nothing when nothing is close', () => {
      expect(route('zzzz').error).toBe('Unknown model "zzzz".');
    });
  });

  describe('OpenRouter', () => {
    it('routes catalogued slugs and aliases', () => {
      expect(candidatesOf(route('z-ai/glm-5.2'))).toEqual(['openrouter:z-ai/glm-5.2']);
      expect(candidatesOf(route('openrouter:glm'))).toEqual(['openrouter:z-ai/glm-5.2']);
    });

    it('passes uncatalogued vendor/model slugs to OpenRouter for live validation', () => {
      expect(candidatesOf(route('openai/gpt-5'))).toEqual(['openrouter:openai/gpt-5']);
      expect(candidatesOf(route('openrouter:moonshotai/kimi-k3'))).toEqual([
        'openrouter:moonshotai/kimi-k3',
      ]);
    });

    it('rejects an unknown name without a slash', () => {
      expect(route('openrouter:glmm').status).toBe('unknown');
    });

    it('consumes :online into web_search and keeps other decorations', () => {
      const online = route('z-ai/glm-5.2:online');
      expect(online.resolvedModel).toBe('z-ai/glm-5.2');
      expect(online.options).toEqual({ web_search: true });

      const free = route('openrouter:qwen/qwen3.7-plus:free:online');
      expect(free.resolvedModel).toBe('qwen/qwen3.7-plus:free');
      expect(free.options).toEqual({ web_search: true });
    });
  });

  describe('summarization fast models', () => {
    it('all resolve against the real catalogs', () => {
      const providers = providersWith();
      for (const spec of FAST_MODELS) {
        expect(resolveModelSpec(spec, providers, {}).status, spec).toBe('ok');
      }
    });
  });

  describe('suggestSimilar', () => {
    it('counts an adjacent transposition as one edit', () => {
      expect(suggestSimilar('gtp-6', ['gpt-5.6', 'gpt-6'])).toEqual(['gpt-6']);
    });

    it('keeps only the closest member of a group', () => {
      expect(
        suggestSimilar('astr', [
          { label: 'gpt-6-astra', group: 'a' },
          { label: 'astra', group: 'a' },
        ]),
      ).toEqual(['astra']);
    });

    it('caps the list', () => {
      expect(suggestSimilar('ab', ['aa', 'ac', 'ad', 'ae'], { limit: 2 })).toHaveLength(2);
    });
  });
});
