/**
 * Model Routing
 *
 * Maps a model spec to the provider(s) that serve it. Every provider owns a
 * catalog (getSupportedModels(): canonical ID → config with `aliases`), and
 * routing is derived from those catalogs alone — there is no keyword guessing
 * and no silent passthrough of unknown names.
 *
 * Spec grammar:
 * - `provider:model` — route to that provider; `model` must be one of its
 *   canonical IDs or aliases (case-insensitive).
 * - `provider` — that provider's default model (per-provider env override or
 *   the provider's hardcoded default).
 * - `model` — every provider whose catalog defines the name, in
 *   BARE_NAME_PRIORITY order (local CLI/SDK providers first). The first
 *   available one serves it and the rest are failover candidates.
 * - `auto` — handled by the callers via getAutoCandidates().
 *
 * Anything that matches nothing is rejected with "did you mean" suggestions.
 * The one open-ended namespace is OpenRouter, whose `vendor/model` slugs are
 * validated against the live OpenRouter catalog at invoke time.
 */

import { findCatalogId } from './modelCatalog.js';

/**
 * Provider order for "auto" selection. Subscription-based CLI/SDK providers
 * come before API-key providers.
 * @type {string[]}
 */
export const PROVIDER_PRIORITY = [
  'codex',
  'gemini-cli',
  'claude',
  'copilot',
  'openai',
  'google',
  'xai',
  'anthropic',
  'mistral',
  'deepseek',
  'openrouter',
];

/**
 * Provider order for bare model names. Copilot is absent: it mirrors models
 * other providers already serve and spends premium-request quota, so it is
 * reached only through its `copilot:` namespace.
 * @type {string[]}
 */
export const BARE_NAME_PRIORITY = PROVIDER_PRIORITY.filter(
  (name) => name !== 'copilot',
);

/**
 * Namespace tokens per provider. The first token is the canonical namespace
 * used when suggesting `namespace:model` forms. A bare token names the
 * provider's default model.
 * @type {Object<string, string[]>}
 */
export const PROVIDER_NAMESPACES = {
  codex: ['codex'],
  'gemini-cli': ['gemini', 'agy', 'antigravity', 'gemini-cli'],
  claude: ['claude', 'claude-code', 'claude-sdk'],
  copilot: ['copilot', 'github-copilot', 'copilot-sdk'],
  openai: ['openai'],
  google: ['google'],
  xai: ['xai'],
  anthropic: ['anthropic'],
  mistral: ['mistral'],
  deepseek: ['deepseek'],
  openrouter: ['openrouter'],
};

/**
 * Env var that overrides each provider's default model. The value must name a
 * model in that provider's catalog; it is validated at startup.
 * @type {Object<string, string>}
 */
export const DEFAULT_MODEL_ENV_VARS = {
  codex: 'CODEX_DEFAULT_MODEL',
  'gemini-cli': 'AGY_DEFAULT_MODEL',
  claude: 'CLAUDE_DEFAULT_MODEL',
  copilot: 'COPILOT_DEFAULT_MODEL',
  openai: 'OPENAI_DEFAULT_MODEL',
  google: 'GOOGLE_DEFAULT_MODEL',
  xai: 'XAI_DEFAULT_MODEL',
  anthropic: 'ANTHROPIC_DEFAULT_MODEL',
  mistral: 'MISTRAL_DEFAULT_MODEL',
  deepseek: 'DEEPSEEK_DEFAULT_MODEL',
  openrouter: 'OPENROUTER_DEFAULT_MODEL',
};

/**
 * Env vars that predate DEFAULT_MODEL_ENV_VARS and are still honored when the
 * new variable is unset.
 * @type {Object<string, string>}
 */
export const LEGACY_DEFAULT_MODEL_ENV_VARS = {
  codex: 'CODEX_MODEL',
  copilot: 'COPILOT_MODEL',
};

const NAMESPACE_TO_PROVIDER = Object.fromEntries(
  Object.entries(PROVIDER_NAMESPACES).flatMap(([provider, tokens]) =>
    tokens.map((token) => [token, provider]),
  ),
);

/**
 * Provider registry name for a namespace token, or null.
 * @param {string} token
 * @returns {string|null}
 */
export function providerForNamespace(token) {
  return NAMESPACE_TO_PROVIDER[String(token || '').trim().toLowerCase()] || null;
}

function envConfigKey(envVar) {
  return envVar.toLowerCase().replace(/_/g, '');
}

function getCatalog(provider) {
  if (!provider || typeof provider.getSupportedModels !== 'function') {
    return {};
  }
  try {
    return provider.getSupportedModels() || {};
  } catch {
    return {};
  }
}

/**
 * Resolve a name against one provider's catalog.
 * @param {object} provider - Provider implementation
 * @param {string} name - Canonical ID or alias (case-insensitive)
 * @returns {string|null} Canonical catalog ID
 */
export function findCatalogModel(provider, name) {
  return findCatalogId(getCatalog(provider), name);
}

/**
 * Every name (canonical IDs and aliases) a provider's catalog accepts, as
 * suggestion entries grouped by model.
 * @param {object} provider
 * @param {string} [prefix=''] - Prepended to each label (e.g. 'copilot:')
 * @returns {Array<{label: string, key: string, group: string}>}
 */
function catalogEntries(provider, prefix = '') {
  const entries = [];
  for (const [id, entry] of Object.entries(getCatalog(provider))) {
    const group = modelIdentity(id);
    for (const name of [id, ...(entry?.aliases || []).map(String)]) {
      entries.push({ label: `${prefix}${name}`, key: name, group });
    }
  }
  return entries;
}

/**
 * Configured default-model override for a provider, if any.
 * @param {string} providerName
 * @param {object} config
 * @returns {{ envVar: string, value: string }|null}
 */
function getDefaultModelOverride(providerName, config) {
  for (const table of [DEFAULT_MODEL_ENV_VARS, LEGACY_DEFAULT_MODEL_ENV_VARS]) {
    const envVar = table[providerName];
    const value = envVar ? config?.providers?.[envConfigKey(envVar)] : undefined;
    if (typeof value === 'string' && value.trim()) {
      return { envVar, value: value.trim() };
    }
  }
  return null;
}

/**
 * Default model for a provider: the env override when set, otherwise the
 * provider's hardcoded `defaultModel`.
 * @param {string} providerName - Provider registry name
 * @param {object} providers - Provider instances
 * @param {object} [config] - Configuration
 * @returns {string} Canonical model ID
 */
export function getDefaultModelForProvider(providerName, providers, config) {
  const provider = providers?.[providerName];
  const override = getDefaultModelOverride(providerName, config);
  if (override) {
    return findCatalogModel(provider, override.value) || override.value;
  }
  if (provider?.defaultModel) return provider.defaultModel;
  return Object.keys(getCatalog(provider))[0] || null;
}

/**
 * Check every configured default-model override against its provider's
 * catalog. OpenRouter also accepts any `vendor/model` slug.
 * @param {object} providers - Provider instances
 * @param {object} config - Configuration
 * @returns {string[]} Error messages (empty when valid)
 */
export function validateDefaultModelOverrides(providers, config) {
  const errors = [];
  for (const providerName of Object.keys(DEFAULT_MODEL_ENV_VARS)) {
    const override = getDefaultModelOverride(providerName, config);
    const provider = providers?.[providerName];
    if (!override || !provider) continue;
    if (findCatalogModel(provider, override.value)) continue;
    if (providerName === 'openrouter' && override.value.includes('/')) continue;
    const suggestions = suggestSimilar(override.value, catalogEntries(provider));
    errors.push(
      `${override.envVar}="${override.value}" is not a ${providerName} model.${formatSuggestions(suggestions)}`,
    );
  }
  return errors;
}

// --- Similarity suggestions ----------------------------------------------------

/**
 * Optimal string alignment distance (Levenshtein plus adjacent transposition),
 * so "gtp-6" is one edit from "gpt-6".
 */
function editDistance(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i++) d[i][0] = i;
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[rows - 1][cols - 1];
}

/**
 * Up to `limit` vocabulary entries close to `input`. An entry qualifies when
 * its edit distance is within a third of the longer string (at least 1), or
 * when one string contains the other (4+ chars). Entries sharing a `group`
 * (aliases of one model) yield only their closest member, so the suggestions
 * name distinct models. Ties keep vocabulary order, so callers list preferred
 * names first.
 * @param {string} input
 * @param {Array<string|{label: string, key?: string, group?: string}>} vocabulary
 *   Plain strings, or entries whose `key` is compared and `label` is shown
 * @param {object} [options]
 * @param {number} [options.limit=3]
 * @returns {string[]} Labels
 */
export function suggestSimilar(input, vocabulary, { limit = 3 } = {}) {
  const target = String(input || '').trim().toLowerCase();
  if (!target) return [];
  const bestByGroup = new Map();
  vocabulary.forEach((raw, order) => {
    const entry = typeof raw === 'string' ? { label: raw } : raw;
    const key = String(entry.key ?? entry.label).toLowerCase();
    const distance = editDistance(target, key);
    const threshold = Math.max(1, Math.floor(Math.max(target.length, key.length) / 3));
    const contains =
      Math.min(target.length, key.length) >= 4 &&
      (key.includes(target) || target.includes(key));
    let rank;
    if (distance <= threshold) rank = distance;
    else if (contains) rank = threshold + 1;
    else return;
    const group = entry.group ?? entry.label;
    const best = bestByGroup.get(group);
    if (!best || rank < best.rank) {
      bestByGroup.set(group, { label: entry.label, rank, order: best?.order ?? order });
    }
  });
  const labels = [];
  for (const s of [...bestByGroup.values()].sort((x, y) => x.rank - y.rank || x.order - y.order)) {
    if (!labels.includes(s.label)) labels.push(s.label);
    if (labels.length >= limit) break;
  }
  return labels;
}

function formatSuggestions(suggestions) {
  return suggestions.length
    ? ` Did you mean: ${suggestions.join(', ')}?`
    : '';
}

// --- Spec parsing ----------------------------------------------------------------

/**
 * Parse OpenRouter model decorations off a slug. `:online` is consumed into a
 * `webSearch` flag (the provider attaches the web plugin from the flag) and is
 * never carried on the request/lookup ID; other suffixes such as `:free` are
 * preserved on the request model but stripped from the bare lookup base.
 * @param {string} slug - Slug with any `openrouter:` namespace already removed
 * @returns {{ base: string, decorations: string[], webSearch: boolean }}
 */
function parseOpenRouterDecorations(slug) {
  const segments = String(slug).split(':');
  const decorations = segments.slice(1);
  return {
    base: segments[0],
    decorations: decorations.filter((d) => d !== 'online'),
    webSearch: decorations.includes('online'),
  };
}

/**
 * Split a spec into its namespace and model parts. A leading `token:` is a
 * namespace only when the token has no `/` — `vendor/model:free` is a bare
 * OpenRouter slug with a decoration.
 * @param {string} spec
 * @returns {{ namespace: string|null, providerName: string|null, name: string }}
 */
export function parseModelSpec(spec) {
  const raw = String(spec ?? '').trim();
  const colon = raw.indexOf(':');
  if (colon > 0 && !raw.slice(0, colon).includes('/')) {
    const namespace = raw.slice(0, colon).trim().toLowerCase();
    return {
      namespace,
      providerName: providerForNamespace(namespace),
      name: raw.slice(colon + 1).trim(),
    };
  }
  return { namespace: null, providerName: null, name: raw };
}

// --- Resolution ------------------------------------------------------------------

/**
 * Loose model identity, so the same model spelled differently by two
 * providers ("claude-opus-5-5" vs "claude-opus-5.5") counts as one.
 */
function modelIdentity(id) {
  return String(id).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isAvailable(provider, config) {
  try {
    return Boolean(provider?.isAvailable?.(config));
  } catch {
    return false;
  }
}

/**
 * Resolve one provider's name for a model, applying OpenRouter decorations.
 * Returns null when the provider does not serve the name.
 */
function resolveForProvider(providerName, provider, name) {
  if (providerName !== 'openrouter') {
    const id = findCatalogModel(provider, name);
    return id ? { resolvedModel: id, options: {} } : null;
  }
  const { base, decorations, webSearch } = parseOpenRouterDecorations(name);
  const id =
    findCatalogModel(provider, base) ||
    (base.includes('/') ? base : null);
  if (!id) return null;
  return {
    resolvedModel: decorations.length ? `${id}:${decorations.join(':')}` : id,
    options: webSearch ? { web_search: true } : {},
  };
}

function candidate(providerName, provider, resolved) {
  return {
    providerName,
    provider,
    resolvedModel: resolved.resolvedModel,
    options: resolved.options,
  };
}

function okResult(candidates) {
  const [first] = candidates;
  return {
    status: 'ok',
    providerName: first.providerName,
    provider: first.provider,
    resolvedModel: first.resolvedModel,
    options: first.options,
    candidates,
    error: null,
  };
}

function failResult(status, error, providerName = null, provider = null) {
  return {
    status,
    providerName,
    provider,
    resolvedModel: null,
    options: {},
    candidates: [],
    error,
  };
}

/**
 * Vocabulary for suggesting a replacement for an unknown bare name:
 * namespaces, then every bare-routable name in priority order, then
 * `copilot:`-qualified names (Copilot is namespace-only).
 */
function bareVocabulary(providers) {
  const vocab = ['auto', ...namespaceEntries()];
  for (const name of BARE_NAME_PRIORITY) {
    if (providers[name]) vocab.push(...catalogEntries(providers[name]));
  }
  for (const name of PROVIDER_PRIORITY) {
    if (!BARE_NAME_PRIORITY.includes(name) && providers[name]) {
      const ns = PROVIDER_NAMESPACES[name][0];
      vocab.push(
        ...catalogEntries(providers[name], `${ns}:`).map((e) => ({
          ...e,
          group: `${ns}:${e.group}`,
        })),
      );
    }
  }
  return vocab;
}

/** Namespace tokens as suggestion entries, grouped by provider. */
function namespaceEntries() {
  return Object.entries(NAMESPACE_TO_PROVIDER).map(([token, provider]) => ({
    label: token,
    group: `provider:${provider}`,
  }));
}

/**
 * `namespace:name` forms for providers other than `exclude` whose catalog
 * contains `name` exactly — the likeliest fix for a right model under the
 * wrong prefix.
 */
function exactMatchesElsewhere(name, providers, exclude) {
  const matches = [];
  for (const providerName of PROVIDER_PRIORITY) {
    if (providerName === exclude || !providers[providerName]) continue;
    if (findCatalogModel(providers[providerName], name)) {
      matches.push(`${PROVIDER_NAMESPACES[providerName][0]}:${name}`);
    }
  }
  return matches;
}

function unavailableMessageFor(providerNames) {
  return providerNames
    .map((name) => `${name} (${getProviderSetupHint(name)})`)
    .join('; ');
}

/**
 * Resolve a model spec into routing facts. `candidates` lists every provider
 * that can serve the spec, in failover order; the top-level provider fields
 * mirror the first candidate. Callers switch on `status`:
 * - 'ok' — at least one available candidate
 * - 'unknown' — nothing matches; `error` carries "did you mean" suggestions
 * - 'unavailable' — the model exists but no provider serving it is available
 * @param {string} spec - Model specification
 * @param {object} providers - Provider instances keyed by registry name
 * @param {object} config - Configuration
 * @returns {{ status: string, providerName: string|null, provider: object|null,
 *   resolvedModel: string|null, options: object, candidates: Array, error: string|null }}
 */
export function resolveModelSpec(spec, providers, config) {
  const raw = String(spec ?? '').trim();
  if (!raw) {
    return failResult('unknown', 'Empty model name.');
  }
  const { namespace, providerName: nsProvider, name } = parseModelSpec(raw);

  if (namespace !== null) {
    if (!nsProvider) {
      const suggestions = suggestSimilar(namespace, namespaceEntries()).map(
        (ns) => `${ns}:${name}`,
      );
      return failResult(
        'unknown',
        `Unknown provider "${namespace}" in "${raw}".${formatSuggestions(suggestions)}`,
      );
    }
    return resolveNamespaced(raw, nsProvider, name, providers, config);
  }

  const bareProvider = providerForNamespace(raw);
  if (bareProvider) {
    return resolveNamespaced(raw, bareProvider, '', providers, config);
  }

  return resolveBare(raw, providers, config);
}

function resolveNamespaced(raw, providerName, name, providers, config) {
  const provider = providers[providerName];
  if (!provider) {
    return failResult('unknown', `Provider ${providerName} is not registered.`, providerName);
  }

  const resolved = name
    ? resolveForProvider(providerName, provider, name)
    : resolveForProvider(
      providerName,
      provider,
      getDefaultModelForProvider(providerName, providers, config),
    );

  if (!resolved) {
    const ns = PROVIDER_NAMESPACES[providerName][0];
    const suggestions = [
      ...exactMatchesElsewhere(name, providers, providerName),
      ...suggestSimilar(name, catalogEntries(provider, `${ns}:`)),
    ].slice(0, 3);
    return failResult(
      'unknown',
      `Unknown ${providerName} model "${name}" in "${raw}".${formatSuggestions(suggestions)}`,
      providerName,
      provider,
    );
  }

  if (!isAvailable(provider, config)) {
    return failResult(
      'unavailable',
      getProviderUnavailableMessage(providerName),
      providerName,
      provider,
    );
  }

  return okResult([candidate(providerName, provider, resolved)]);
}

function resolveBare(raw, providers, config) {
  const defining = [];
  for (const providerName of BARE_NAME_PRIORITY) {
    const provider = providers[providerName];
    if (!provider) continue;
    const resolved = resolveForProvider(providerName, provider, raw);
    if (resolved) defining.push({ providerName, provider, resolved });
  }

  if (defining.length === 0) {
    const suggestions = suggestSimilar(raw, bareVocabulary(providers));
    return failResult('unknown', `Unknown model "${raw}".${formatSuggestions(suggestions)}`);
  }

  const available = defining.filter((d) => isAvailable(d.provider, config));
  if (available.length === 0) {
    const names = defining.map((d) => d.providerName);
    return failResult(
      'unavailable',
      `Model "${raw}" is served by ${names.join(', ')}, but none is available: ${unavailableMessageFor(names)}.`,
      names[0],
      defining[0].provider,
    );
  }

  // Failover stays on the same model: a provider whose alias points at a
  // different model than the first available one is not a substitute.
  const identity = modelIdentity(available[0].resolved.resolvedModel);
  const candidates = available
    .filter((d) => modelIdentity(d.resolved.resolvedModel) === identity)
    .map((d) => candidate(d.providerName, d.provider, d.resolved));
  return okResult(candidates);
}

// --- Availability ------------------------------------------------------------------

const API_KEY_ENV_VARS = {
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY (or GEMINI_API_KEY, or Vertex AI settings)',
  xai: 'XAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

const LOCAL_PROVIDER_SETUP_HINTS = {
  codex: 'run `codex login` or set CODEX_API_KEY',
  claude: 'run `claude login` or set CLAUDE_CODE_OAUTH_TOKEN',
  'gemini-cli':
    'install the Antigravity CLI and run `agy` once to log in (https://antigravity.google)',
  copilot: 'install @github/copilot-sdk and sign in to GitHub Copilot',
};

/**
 * One-line setup hint for a provider.
 * @param {string} providerName
 * @returns {string}
 */
export function getProviderSetupHint(providerName) {
  if (LOCAL_PROVIDER_SETUP_HINTS[providerName]) {
    return LOCAL_PROVIDER_SETUP_HINTS[providerName];
  }
  return API_KEY_ENV_VARS[providerName]
    ? `set ${API_KEY_ENV_VARS[providerName]}`
    : 'check its configuration';
}

/**
 * Build the "provider not available" error message with a setup hint.
 * @param {string} providerName - Provider registry name
 * @returns {string}
 */
export function getProviderUnavailableMessage(providerName) {
  const hint = getProviderSetupHint(providerName);
  return `Provider ${providerName} is not available: ${hint}.`;
}

/**
 * Whether a provider's default model supports image inputs. Used by "auto"
 * selection to skip text-only providers when the request includes images.
 * Providers without a resolvable config fail open.
 * @param {object} providerInstance - Provider implementation
 * @param {string} providerName - Provider registry name
 * @param {object} [providers] - Provider instances
 * @param {object} [config] - Configuration
 * @returns {boolean}
 */
export function providerSupportsImages(providerInstance, providerName, providers, config) {
  if (!providerInstance || typeof providerInstance.getModelConfig !== 'function') {
    return true;
  }
  try {
    const defaultModel = getDefaultModelForProvider(
      providerName,
      providers || { [providerName]: providerInstance },
      config,
    );
    const modelConfig = providerInstance.getModelConfig(defaultModel);
    if (!modelConfig) return true;
    return modelConfig.supportsImages !== false;
  } catch {
    return true;
  }
}

/**
 * Available provider names in PROVIDER_PRIORITY order, optionally skipping
 * text-only providers when the request has images and capping the count.
 * @param {object} providers - Provider instances
 * @param {object} config - Configuration
 * @param {object} [options]
 * @param {boolean} [options.hasImages=false] - Skip text-only providers when true
 * @param {number} [options.limit=Infinity] - Max number of providers to return
 * @returns {string[]} Ordered available provider names
 */
export function getAvailableProviders(providers, config, { hasImages = false, limit = Infinity } = {}) {
  const names = [];
  for (const name of PROVIDER_PRIORITY) {
    if (names.length >= limit) break;
    const provider = providers[name];
    if (!provider || !isAvailable(provider, config)) continue;
    if (hasImages && !providerSupportsImages(provider, name, providers, config)) continue;
    names.push(name);
  }
  return names;
}

/**
 * "auto" candidates: each available provider's default model, in priority
 * order.
 * @param {object} providers - Provider instances
 * @param {object} config - Configuration
 * @param {object} [options] - Same as getAvailableProviders
 * @returns {Array<{ providerName: string, provider: object, resolvedModel: string, options: object }>}
 */
export function getAutoCandidates(providers, config, options = {}) {
  return getAvailableProviders(providers, config, options).map((providerName) => ({
    providerName,
    provider: providers[providerName],
    resolvedModel: getDefaultModelForProvider(providerName, providers, config),
    options: {},
  }));
}

/**
 * "auto" expanded into explicit `namespace:model` specs, for modes that turn
 * each auto pick into its own labeled participant.
 * @param {object} providers - Provider instances
 * @param {object} config - Configuration
 * @param {object} [options] - Same as getAvailableProviders
 * @returns {string[]}
 */
export function getAutoModelSpecs(providers, config, options = {}) {
  return getAutoCandidates(providers, config, options).map(
    (c) => `${PROVIDER_NAMESPACES[c.providerName]?.[0] || c.providerName}:${c.resolvedModel}`,
  );
}
