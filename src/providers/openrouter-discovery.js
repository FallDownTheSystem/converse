/**
 * OpenRouter Model Metadata Discovery Adapter
 *
 * Discovers capability metadata for explicit OpenRouter slugs that are not in
 * the provider's static curated catalog. Uses the public bulk
 * `GET https://openrouter.ai/api/v1/models` endpoint (no auth, ~one 520KB
 * payload for the whole catalog) because that response carries the structured
 * per-model `reasoning` object (`mandatory`/`default_enabled`/`supported_efforts`/
 * `default_effort`) — a far better capability source than the flat
 * `supported_parameters` list.
 *
 * Transport is plain `fetch` (no `@openrouter/sdk`): the endpoint is public and
 * un-paginated, so the pre-1.0, daily-churning SDK buys no material typing or
 * pagination benefit and only adds version-churn risk.
 *
 * Since the source is the whole-catalog bulk list (there is no per-slug HTTP
 * 404), "not found" means "absent from a fresh successful bulk fetch", surfaced
 * as a local `catalog_miss` status the provider maps to `MODEL_NOT_FOUND`.
 *
 * Caching rules (deliberate):
 *   - successes are cached (bounded);
 *   - ONLY authoritative catalog-misses are negatively cached (short TTL);
 *   - transient failures (timeout, 429, malformed, abort, auth) are NEVER
 *     negatively cached, so they never mask a slug that is really there;
 *   - concurrent lookups share a single in-flight bulk fetch (single-flight);
 *   - credentials and raw response bodies are never cached or logged.
 */

import { debugLog, debugError } from '../utils/console.js';

const MODELS_URL = 'https://openrouter.ai/api/v1/models';
const DEFAULT_TIMEOUT_MS = 8000;
const SUCCESS_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const NEGATIVE_TTL_MS = 5 * 60 * 1000; // 5 minutes (catalog-miss only)
const MAX_SUCCESS_ENTRIES = 512;
const MAX_NEGATIVE_ENTRIES = 512;

/**
 * Discovery result statuses.
 * - ok: metadata found (modelConfig present)
 * - catalog_miss: authoritative absence from a fresh successful bulk fetch
 * - auth: 401 from the endpoint (unexpected for a public endpoint)
 * - rate_limit: 429
 * - timeout: request timed out or was aborted
 * - malformed: non-OK HTTP, unparseable JSON, or unexpected payload shape
 */
export const DiscoveryStatus = {
  OK: 'ok',
  CATALOG_MISS: 'catalog_miss',
  AUTH: 'auth',
  RATE_LIMIT: 'rate_limit',
  TIMEOUT: 'timeout',
  MALFORMED: 'malformed',
};

// Bounded success cache (slug -> { modelConfig, expiry }); short negative cache
// (slug -> expiry) for authoritative catalog-misses only.
const successCache = new Map();
const negativeCache = new Map();
// Single-flight: at most one in-flight bulk fetch shared by all callers.
let inflightBulkFetch = null;

/**
 * Build a request-local modelConfig from a raw bulk-endpoint model object.
 * The structured `reasoning` object is preserved verbatim for the provider's
 * effort-mapping logic. Never merged into getSupportedModels().
 * @param {object} raw - One model object from the bulk `data[]` array
 * @returns {object} modelConfig
 */
export function metadataToModelConfig(raw) {
  const inputModalities = raw?.architecture?.input_modalities || [];
  const reasoning = raw?.reasoning || null;
  const supportsReasoning = !!(
    reasoning &&
    (reasoning.mandatory === true ||
      reasoning.default_enabled === true ||
      (Array.isArray(reasoning.supported_efforts) &&
        reasoning.supported_efforts.length > 0))
  );

  return {
    modelName: raw.id,
    friendlyName: raw.name || `${raw.id} (via OpenRouter)`,
    contextWindow: raw.context_length || raw.top_provider?.context_length || 8192,
    maxOutputTokens:
      raw.top_provider?.max_completion_tokens || raw.context_length || 8192,
    supportsStreaming: true,
    supportsImages: inputModalities.includes('image'),
    supportsWebSearch: false,
    supportsReasoning,
    // Structured capability object consumed by the OpenRouter reasoning mapper.
    reasoning,
    timeout: 900000,
    isDynamic: true,
  };
}

/**
 * Classify a fetch/HTTP failure into a transient discovery status. Never
 * returns catalog_miss (that is only decided from a successful catalog).
 * @param {Error} error
 * @param {number|null} status - HTTP status if the response was received
 * @returns {string}
 */
function classifyFailure(error, status) {
  if (status === 401) return DiscoveryStatus.AUTH;
  if (status === 429) return DiscoveryStatus.RATE_LIMIT;
  if (error?.name === 'AbortError') return DiscoveryStatus.TIMEOUT;
  return DiscoveryStatus.MALFORMED;
}

/**
 * Perform one bulk catalog fetch and return a slug->rawModel Map. Throws a
 * tagged error ({ discoveryStatus }) on any transient failure so the caller can
 * classify without caching.
 * @param {object} [opts]
 * @param {AbortSignal} [opts.signal] - Caller abort signal
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<Map<string, object>>}
 */
async function fetchBulkCatalog({ signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // The timeout / caller-abort must stay armed through the body read: fetch
  // resolves on headers, and reading the ~520KB JSON body can itself stall.
  // Keeping the timer live until json() completes stops a stalled body from
  // leaving the shared single-flight promise pending forever.
  try {
    let response;
    try {
      response = await globalThis.fetch(MODELS_URL, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (error) {
      const tagged = new Error('OpenRouter discovery fetch failed');
      tagged.discoveryStatus = classifyFailure(error, null);
      throw tagged;
    }

    if (!response.ok) {
      const tagged = new Error(`OpenRouter discovery HTTP ${response.status}`);
      tagged.discoveryStatus = classifyFailure(null, response.status);
      throw tagged;
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      const tagged = new Error('OpenRouter discovery malformed JSON');
      // An abort during the body read is a timeout/cancellation, not an
      // authoritative malformed payload.
      tagged.discoveryStatus =
        error?.name === 'AbortError'
          ? DiscoveryStatus.TIMEOUT
          : DiscoveryStatus.MALFORMED;
      throw tagged;
    }

    if (!payload || !Array.isArray(payload.data)) {
      const tagged = new Error('OpenRouter discovery unexpected payload');
      tagged.discoveryStatus = DiscoveryStatus.MALFORMED;
      throw tagged;
    }

    const map = new Map();
    for (const model of payload.data) {
      if (model && typeof model.id === 'string') {
        map.set(model.id, model);
      }
    }

    // A healthy bulk catalog always carries hundreds of models; a map with zero
    // usable entries means a truncated/degenerate snapshot, not an authoritative
    // catalog. Treat it as transient (malformed) so a real slug is never
    // negatively cached against a bad snapshot.
    if (map.size === 0) {
      const tagged = new Error('OpenRouter discovery empty catalog');
      tagged.discoveryStatus = DiscoveryStatus.MALFORMED;
      throw tagged;
    }

    return map;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

/**
 * Single-flight wrapper around fetchBulkCatalog: concurrent callers share one
 * in-flight request.
 */
function getBulkCatalog(opts) {
  if (inflightBulkFetch) {
    return inflightBulkFetch;
  }
  inflightBulkFetch = fetchBulkCatalog(opts).finally(() => {
    inflightBulkFetch = null;
  });
  return inflightBulkFetch;
}

function readSuccessCache(slug) {
  const entry = successCache.get(slug);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    successCache.delete(slug);
    return null;
  }
  return entry.modelConfig;
}

function writeSuccessCache(slug, modelConfig) {
  // Bounded: evict the oldest entry when at capacity (Map preserves insertion
  // order).
  if (successCache.size >= MAX_SUCCESS_ENTRIES) {
    const oldest = successCache.keys().next().value;
    if (oldest !== undefined) successCache.delete(oldest);
  }
  successCache.set(slug, { modelConfig, expiry: Date.now() + SUCCESS_TTL_MS });
}

function isNegativelyCached(slug) {
  const expiry = negativeCache.get(slug);
  if (expiry === undefined) return false;
  if (Date.now() > expiry) {
    negativeCache.delete(slug);
    return false;
  }
  return true;
}

// Bounded write for the negative cache so a flood of unique bogus slugs can't
// grow it without limit (expired entries are otherwise reclaimed only on a
// repeat lookup of the same slug).
function writeNegativeCache(slug) {
  if (negativeCache.size >= MAX_NEGATIVE_ENTRIES) {
    const oldest = negativeCache.keys().next().value;
    if (oldest !== undefined) negativeCache.delete(oldest);
  }
  negativeCache.set(slug, Date.now() + NEGATIVE_TTL_MS);
}

/**
 * Look up capability metadata for an explicit OpenRouter slug.
 * @param {string} slug - Bare `provider/model` slug (no `openrouter:`/decorations)
 * @param {object} [opts]
 * @param {AbortSignal} [opts.signal]
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<{ status: string, modelConfig: (object|null) }>}
 */
export async function lookupOpenRouterModel(slug, opts = {}) {
  const cachedConfig = readSuccessCache(slug);
  if (cachedConfig) {
    return { status: DiscoveryStatus.OK, modelConfig: cachedConfig };
  }
  if (isNegativelyCached(slug)) {
    return { status: DiscoveryStatus.CATALOG_MISS, modelConfig: null };
  }

  let catalog;
  try {
    catalog = await getBulkCatalog(opts);
  } catch (error) {
    // Transient failure — never negatively cached. Log the classification only,
    // never the response body or any credential.
    const status = error?.discoveryStatus || DiscoveryStatus.MALFORMED;
    debugLog(`[OpenRouter Discovery] Lookup for ${slug} failed: ${status}`);
    return { status, modelConfig: null };
  }

  const raw = catalog.get(slug);
  if (!raw) {
    // Authoritative catalog-miss from a fresh successful fetch — negative-cache
    // briefly so a hot loop doesn't refetch, but keep the TTL short so a
    // newly-added slug is picked up soon.
    writeNegativeCache(slug);
    return { status: DiscoveryStatus.CATALOG_MISS, modelConfig: null };
  }

  let modelConfig;
  try {
    modelConfig = metadataToModelConfig(raw);
  } catch (error) {
    debugError('[OpenRouter Discovery] Failed to build model config', error);
    return { status: DiscoveryStatus.MALFORMED, modelConfig: null };
  }
  writeSuccessCache(slug, modelConfig);
  return { status: DiscoveryStatus.OK, modelConfig };
}

/**
 * Clear all discovery caches and any in-flight fetch. Test-only.
 */
export function _resetDiscoveryCaches() {
  successCache.clear();
  negativeCache.clear();
  inflightBulkFetch = null;
}
