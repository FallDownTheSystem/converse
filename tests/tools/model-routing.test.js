/**
 * Model Routing Tests (task-015 Foundation)
 *
 * Covers the shared resolver's resolution order: curated defaults, curated
 * friendly aliases, explicit namespace prefixes, full OpenRouter slugs and the
 * `openrouter:` namespace (no env gate), `:online`/`:free` decoration parsing,
 * and unknown-ID passthrough.
 */

import { describe, expect, it } from 'vitest';
import {
  getDefaultModelForProvider,
  resolveModelSpec,
  CURATED_MODEL_ALIASES,
} from '../../src/utils/modelRouting.js';

// Minimal provider doubles: available, and (for the slash-slug path) never
// claim to statically own an OpenRouter slug.
function makeProviders(names) {
  const providers = {};
  for (const name of names) {
    providers[name] = {
      isAvailable: () => true,
      getModelConfig: () => null,
    };
  }
  return providers;
}

const ALL = ['openai', 'anthropic', 'google', 'xai', 'mistral', 'deepseek', 'openrouter', 'codex', 'copilot', 'gemini-cli'];
const config = {};

describe('Model Routing (Foundation)', () => {
  describe('curated defaults', () => {
    it('returns the modernized per-provider defaults', () => {
      expect(getDefaultModelForProvider('xai')).toBe('grok-4.5');
      expect(getDefaultModelForProvider('mistral')).toBe('mistral-medium-3-5');
      expect(getDefaultModelForProvider('deepseek')).toBe('deepseek-v4-pro');
      expect(getDefaultModelForProvider('openrouter')).toBe('z-ai/glm-5.2');
    });

    it('leaves openai/copilot defaults unchanged', () => {
      expect(getDefaultModelForProvider('openai')).toBe('gpt-5.6');
      expect(getDefaultModelForProvider('copilot')).toBe('copilot');
    });
  });

  describe('curated friendly aliases', () => {
    const providers = makeProviders(ALL);

    it('every curated alias resolves to its intended provider + canonical ID', () => {
      for (const [alias, { provider, canonicalModel }] of Object.entries(
        CURATED_MODEL_ALIASES,
      )) {
        const r = resolveModelSpec(alias, providers, config);
        expect(r.providerName).toBe(provider);
        expect(r.resolvedModel).toBe(canonicalModel);
        expect(r.status).toBe('ok');
      }
    });

    it('resolves representative aliases', () => {
      expect(resolveModelSpec('grok', providers, config)).toMatchObject({
        providerName: 'xai',
        resolvedModel: 'grok-4.5',
      });
      expect(resolveModelSpec('mistral-small', providers, config)).toMatchObject({
        providerName: 'mistral',
        resolvedModel: 'mistral-small-2603',
      });
      expect(resolveModelSpec('deepseek-flash', providers, config)).toMatchObject({
        providerName: 'deepseek',
        resolvedModel: 'deepseek-v4-flash',
      });
    });
  });

  describe('OpenRouter slugs and namespace', () => {
    const providers = makeProviders(ALL);

    it('routes a full slug to openrouter without any env gate', () => {
      const r = resolveModelSpec('z-ai/glm-5.2', providers, config);
      expect(r.providerName).toBe('openrouter');
      expect(r.resolvedModel).toBe('z-ai/glm-5.2');
      expect(r.options.web_search).toBeUndefined();
    });

    it('routes the openrouter: namespace to openrouter', () => {
      const r = resolveModelSpec('openrouter:z-ai/glm-5.2', providers, config);
      expect(r.providerName).toBe('openrouter');
      expect(r.resolvedModel).toBe('z-ai/glm-5.2');
    });

    it('routes an OpenRouter DeepSeek slug to openrouter (not native deepseek)', () => {
      const r = resolveModelSpec('deepseek/deepseek-v4-pro', providers, config);
      expect(r.providerName).toBe('openrouter');
      expect(r.resolvedModel).toBe('deepseek/deepseek-v4-pro');
    });

    it('parses :online into options.web_search and strips it from the slug', () => {
      const bare = resolveModelSpec('z-ai/glm-5.2:online', providers, config);
      expect(bare.providerName).toBe('openrouter');
      expect(bare.resolvedModel).toBe('z-ai/glm-5.2');
      expect(bare.options.web_search).toBe(true);

      const namespaced = resolveModelSpec(
        'openrouter:z-ai/glm-5.2:online',
        providers,
        config,
      );
      expect(namespaced.resolvedModel).toBe('z-ai/glm-5.2');
      expect(namespaced.options.web_search).toBe(true);
    });

    it('preserves :free on the request slug without setting web_search', () => {
      const r = resolveModelSpec('z-ai/glm-5.2:free', providers, config);
      expect(r.providerName).toBe('openrouter');
      expect(r.resolvedModel).toBe('z-ai/glm-5.2:free');
      expect(r.options.web_search).toBeUndefined();
    });

    it('parses :free:online together (keeps :free, lifts online)', () => {
      const r = resolveModelSpec('z-ai/glm-5.2:free:online', providers, config);
      expect(r.resolvedModel).toBe('z-ai/glm-5.2:free');
      expect(r.options.web_search).toBe(true);
    });
  });

  describe('namespace passthrough + unknown IDs', () => {
    const providers = makeProviders(ALL);

    it('passes an unknown explicit ID through unchanged (no substitution)', () => {
      const r = resolveModelSpec('grok-legacy-9', providers, config);
      expect(r.providerName).toBe('xai');
      expect(r.resolvedModel).toBe('grok-legacy-9');
    });

    it('keeps copilot: namespace passthrough intact', () => {
      const r = resolveModelSpec('copilot:gpt-5.6-sol', providers, config);
      expect(r.providerName).toBe('copilot');
      expect(r.resolvedModel).toBe('copilot:gpt-5.6-sol');
    });

    it('routes codex: namespace to the Codex provider unchanged', () => {
      const r = resolveModelSpec('codex:astra', providers, config);
      expect(r.providerName).toBe('codex');
      expect(r.resolvedModel).toBe('codex:astra');
    });

    it('still routes bare gpt-* names to OpenAI, not Codex', () => {
      const r = resolveModelSpec('gpt-6-astra', providers, config);
      expect(r.providerName).not.toBe('codex');
    });

    it('reports unavailable/not_found via status, not substitution', () => {
      const unavailable = {
        xai: { isAvailable: () => false, getModelConfig: () => null },
      };
      expect(resolveModelSpec('grok', unavailable, config).status).toBe(
        'unavailable',
      );
      expect(resolveModelSpec('grok', {}, config).status).toBe('not_found');
    });
  });
});
