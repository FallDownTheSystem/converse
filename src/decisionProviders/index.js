/**
 * Decision Providers
 *
 * Hosts of System One decision models (TypeSafe's Jev family). These are kept
 * apart from the chat provider registry on purpose: a decision model takes a
 * state plus typed questions and returns probabilities, never text, so it must
 * never be reachable from `chat` routing ("auto", bare names, failover), and
 * the `decide` tool must never reach a chat model.
 *
 * Spec grammar mirrors chat routing:
 * - `auto` (or empty) — every configured provider's default, in priority order
 * - `provider` / `provider:` — that provider's default model
 * - `provider:model` — that provider only
 * - `model` — every provider that serves the name, in priority order; the
 *   first is used and the rest are failover candidates
 */

import { getCustomHeaders as getOpenRouterAttributionHeaders } from '../providers/openrouter.js';

/**
 * Model catalogs map each provider's own model ID to the names that route to
 * it. OpenRouter only knows `~typesafe/jev-latest` and `typesafe/jev-1.13`
 * (it rejects `jev-1.13.0` and `jev-preview`), so native IDs are translated
 * per provider rather than by a blanket prefix rewrite.
 */
export const DECISION_PROVIDERS = {
  typesafe: {
    name: 'typesafe',
    label: 'TypeSafe',
    baseURL: 'https://api.typesafe.ai',
    apiKeyEnv: 'TYPESAFE_API_KEY',
    defaultModel: 'jev-latest',
    models: {
      'jev-latest': ['jev', '~typesafe/jev-latest'],
      'jev-1.13.0': ['jev-1.13', 'typesafe/jev-1.13'],
      'jev-preview': [],
    },
    // TypeSafe accepts every published versioned ID, listed or not.
    passthrough: (name) => /^jev-\d+\.\d+(\.\d+)?$/i.test(name),
    headers: (config) => ({ Authorization: `Bearer ${config.apiKeys.typesafe}` }),
    isAvailable: (config) => Boolean(config?.apiKeys?.typesafe),
  },
  openrouter: {
    name: 'openrouter',
    label: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    defaultModel: '~typesafe/jev-latest',
    models: {
      '~typesafe/jev-latest': ['jev-latest', 'jev'],
      'typesafe/jev-1.13': ['jev-1.13', 'jev-1.13.0'],
    },
    // Decision models OpenRouter adds later are reachable by full slug.
    passthrough: (name) => name.includes('/'),
    headers: (config) => ({
      Authorization: `Bearer ${config.apiKeys.openrouter}`,
      ...getOpenRouterAttributionHeaders(config),
    }),
    isAvailable: (config) => Boolean(config?.apiKeys?.openrouter),
  },
};

/** Failover order: the native host first, then OpenRouter. */
export const DECISION_PROVIDER_PRIORITY = ['typesafe', 'openrouter'];

/**
 * Resolve a name against one provider's catalog, then its passthrough rule.
 * @returns {string|null} The model ID to send to that provider
 */
export function findDecisionModel(provider, name) {
  const wanted = String(name).trim().toLowerCase();
  if (!wanted) return null;
  for (const [id, aliases] of Object.entries(provider.models)) {
    if (id.toLowerCase() === wanted || aliases.some((a) => a.toLowerCase() === wanted)) {
      return id;
    }
  }
  return provider.passthrough(String(name).trim()) ? String(name).trim() : null;
}

function setupHint(provider) {
  return `set ${provider.apiKeyEnv}`;
}

function knownModels() {
  const names = new Set();
  for (const providerName of DECISION_PROVIDER_PRIORITY) {
    const provider = DECISION_PROVIDERS[providerName];
    for (const [id, aliases] of Object.entries(provider.models)) {
      names.add(id);
      aliases.forEach((a) => names.add(a));
    }
  }
  return [...names];
}

function ok(candidates) {
  return { status: 'ok', candidates, error: null };
}

function fail(status, error) {
  return { status, candidates: [], error };
}

/**
 * Resolve a decision model spec into an ordered candidate list.
 * @param {string} spec - Model spec (see module grammar)
 * @param {object} config - Server configuration (for API keys)
 * @returns {{ status: 'ok'|'unknown'|'unavailable', candidates: Array<{ providerName: string, provider: object, model: string }>, error: string|null }}
 */
export function resolveDecisionModel(spec, config) {
  const raw = String(spec ?? '').trim();
  const namespaces = DECISION_PROVIDER_PRIORITY.join(', ');

  if (!raw || raw.toLowerCase() === 'auto') {
    const candidates = DECISION_PROVIDER_PRIORITY
      .map((name) => DECISION_PROVIDERS[name])
      .filter((provider) => provider.isAvailable(config))
      .map((provider) => ({ providerName: provider.name, provider, model: provider.defaultModel }));
    if (candidates.length === 0) {
      return fail(
        'unavailable',
        `No decision provider is configured: ${DECISION_PROVIDER_PRIORITY.map((n) => `${n} (${setupHint(DECISION_PROVIDERS[n])})`).join('; ')}.`,
      );
    }
    return ok(candidates);
  }

  const colon = raw.indexOf(':');
  const hasNamespace = colon > 0 && !raw.slice(0, colon).includes('/');
  const namespace = hasNamespace ? raw.slice(0, colon).toLowerCase() : raw.toLowerCase();

  if (hasNamespace || DECISION_PROVIDERS[namespace]) {
    const provider = DECISION_PROVIDERS[namespace];
    if (!provider) {
      return fail('unknown', `Unknown decision provider "${raw.slice(0, colon)}". Providers: ${namespaces}.`);
    }
    const name = hasNamespace ? raw.slice(colon + 1).trim() : '';
    const model = name ? findDecisionModel(provider, name) : provider.defaultModel;
    if (!model) {
      return fail(
        'unknown',
        `${provider.label} does not serve "${name}". Models: ${Object.keys(provider.models).join(', ')}.`,
      );
    }
    if (!provider.isAvailable(config)) {
      return fail('unavailable', `${provider.label} is not configured (${setupHint(provider)}).`);
    }
    return ok([{ providerName: provider.name, provider, model }]);
  }

  const matches = DECISION_PROVIDER_PRIORITY
    .map((providerName) => {
      const provider = DECISION_PROVIDERS[providerName];
      const model = findDecisionModel(provider, raw);
      return model ? { providerName, provider, model } : null;
    })
    .filter(Boolean);

  if (matches.length === 0) {
    return fail(
      'unknown',
      `Unknown decision model "${raw}". Use "auto", a provider (${namespaces}), "provider:model", or one of: ${knownModels().join(', ')}.`,
    );
  }
  const available = matches.filter((m) => m.provider.isAvailable(config));
  if (available.length === 0) {
    return fail(
      'unavailable',
      `"${raw}" is served by ${matches.map((m) => `${m.providerName} (${setupHint(m.provider)})`).join('; ')}, but none is configured.`,
    );
  }
  return ok(available);
}
