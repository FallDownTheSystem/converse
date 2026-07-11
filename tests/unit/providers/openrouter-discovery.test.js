/**
 * OpenRouter Discovery Adapter Tests (task-015 Foundation)
 *
 * Verifies the bulk-catalog metadata adapter: success/timeout/rate-limit/
 * malformed/catalog-miss classification, negative caching of ONLY authoritative
 * catalog-misses (never transient failures), single-flight coalescing, and that
 * credentials/response bodies are never logged.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  lookupOpenRouterModel,
  metadataToModelConfig,
  DiscoveryStatus,
  _resetDiscoveryCaches,
} from '../../../src/providers/openrouter-discovery.js';

const GLM = {
  id: 'z-ai/glm-5.2',
  name: 'Z.ai: GLM 5.2',
  context_length: 1048576,
  architecture: { input_modalities: ['text'] },
  top_provider: { max_completion_tokens: 131072 },
  reasoning: {
    mandatory: false,
    default_enabled: true,
    supported_efforts: ['xhigh', 'high'],
    default_effort: 'high',
  },
};

function okResponse(models) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: models }),
  };
}

describe('OpenRouter Discovery Adapter', () => {
  beforeEach(() => {
    _resetDiscoveryCaches();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    _resetDiscoveryCaches();
  });

  describe('metadataToModelConfig', () => {
    it('maps modalities and preserves the structured reasoning object', () => {
      const cfg = metadataToModelConfig(GLM);
      expect(cfg.modelName).toBe('z-ai/glm-5.2');
      expect(cfg.contextWindow).toBe(1048576);
      expect(cfg.maxOutputTokens).toBe(131072);
      expect(cfg.supportsImages).toBe(false);
      expect(cfg.supportsReasoning).toBe(true);
      expect(cfg.reasoning.supported_efforts).toEqual(['xhigh', 'high']);
      expect(cfg.isDynamic).toBe(true);
    });

    it('marks image-capable models from input_modalities', () => {
      const cfg = metadataToModelConfig({
        id: 'x/y',
        architecture: { input_modalities: ['text', 'image'] },
        reasoning: { mandatory: false, default_enabled: false },
      });
      expect(cfg.supportsImages).toBe(true);
      expect(cfg.supportsReasoning).toBe(false);
    });
  });

  describe('lookup outcomes', () => {
    it('returns ok with a built config on a fresh catalog hit', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse([GLM]));
      const r = await lookupOpenRouterModel('z-ai/glm-5.2');
      expect(r.status).toBe(DiscoveryStatus.OK);
      expect(r.modelConfig.modelName).toBe('z-ai/glm-5.2');
    });

    it('caches successes (no second fetch)', async () => {
      const spy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(okResponse([GLM]));
      await lookupOpenRouterModel('z-ai/glm-5.2');
      await lookupOpenRouterModel('z-ai/glm-5.2');
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('classifies an authoritative catalog-miss and negatively caches it', async () => {
      const spy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(okResponse([GLM]));
      const first = await lookupOpenRouterModel('missing/model');
      expect(first.status).toBe(DiscoveryStatus.CATALOG_MISS);
      // Second lookup served from negative cache — no refetch.
      const second = await lookupOpenRouterModel('missing/model');
      expect(second.status).toBe(DiscoveryStatus.CATALOG_MISS);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('classifies a 429 as rate_limit and does NOT negatively cache it', async () => {
      const spy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce(okResponse([GLM]));
      const first = await lookupOpenRouterModel('z-ai/glm-5.2');
      expect(first.status).toBe(DiscoveryStatus.RATE_LIMIT);
      // Transient failure must not be cached — a retry re-fetches and succeeds.
      const second = await lookupOpenRouterModel('z-ai/glm-5.2');
      expect(second.status).toBe(DiscoveryStatus.OK);
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('classifies an abort/timeout and does NOT negatively cache it', async () => {
      const abortErr = new Error('aborted');
      abortErr.name = 'AbortError';
      const spy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValueOnce(abortErr)
        .mockResolvedValueOnce(okResponse([GLM]));
      const first = await lookupOpenRouterModel('z-ai/glm-5.2');
      expect(first.status).toBe(DiscoveryStatus.TIMEOUT);
      const second = await lookupOpenRouterModel('z-ai/glm-5.2');
      expect(second.status).toBe(DiscoveryStatus.OK);
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('classifies a malformed payload as malformed (not a catalog-miss)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ notData: true }),
      });
      const r = await lookupOpenRouterModel('z-ai/glm-5.2');
      expect(r.status).toBe(DiscoveryStatus.MALFORMED);
    });

    it('treats an empty/degenerate catalog as malformed and does NOT negatively cache it', async () => {
      // A healthy bulk catalog has hundreds of models; zero usable entries is a
      // truncated snapshot, not an authoritative miss (AC8).
      const spy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(okResponse([]))
        .mockResolvedValueOnce(okResponse([GLM]));
      const first = await lookupOpenRouterModel('z-ai/glm-5.2');
      expect(first.status).toBe(DiscoveryStatus.MALFORMED);
      // Not cached as a miss — a retry re-fetches and succeeds.
      const second = await lookupOpenRouterModel('z-ai/glm-5.2');
      expect(second.status).toBe(DiscoveryStatus.OK);
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  describe('single-flight coalescing', () => {
    it('shares one in-flight bulk fetch across concurrent lookups', async () => {
      let resolveFetch;
      const spy = vi.spyOn(globalThis, 'fetch').mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = () => resolve(okResponse([GLM]));
        }),
      );
      const p1 = lookupOpenRouterModel('z-ai/glm-5.2');
      const p2 = lookupOpenRouterModel('missing/model');
      resolveFetch();
      const [r1, r2] = await Promise.all([p1, p2]);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(r1.status).toBe(DiscoveryStatus.OK);
      expect(r2.status).toBe(DiscoveryStatus.CATALOG_MISS);
    });
  });

  describe('no credential/body logging', () => {
    it('does not send an Authorization header (public endpoint)', async () => {
      const spy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(okResponse([GLM]));
      await lookupOpenRouterModel('z-ai/glm-5.2');
      const [, init] = spy.mock.calls[0];
      expect(init.headers.Authorization).toBeUndefined();
      expect(init.headers.authorization).toBeUndefined();
    });
  });
});
