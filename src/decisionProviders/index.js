/**
 * Decision Providers
 *
 * Hosts of decision models: OpenAI's Decisions API, TypeSafe's Jev,
 * Cloudflare's Clef, and OpenRouter, which re-serves all three. These are kept
 * apart from the chat provider registry on purpose: a decision model takes a
 * state plus typed questions and returns probabilities, never text, so it must
 * never be reachable from `chat` routing ("auto", bare names, failover), and
 * the `decide` tool must never reach a chat model.
 *
 * Spec grammar mirrors chat routing:
 * - `auto` (or empty) — each AUTO_MODELS entry on every configured host, in order
 * - `provider` / `provider:` — that provider's default model
 * - `provider:model` — that provider only
 * - `model` — every provider that serves the model, natives first; the first
 *   is used and the rest are failover candidates
 */

import { getCustomHeaders as getOpenRouterAttributionHeaders } from '../providers/openrouter.js';
import { callDecisionApi, DecisionError } from './http.js';
import { BASE_QUESTION_TYPES, cloudflareFormat, openaiFormat, systemOneFormat, typesafeFormat } from './formats.js';

// TypeSafe gates experimental features behind per-request opt-in headers.
const TYPESAFE_IMAGES_HEADER = 'TypeSafe-Danger-Zone-Images';
const TYPESAFE_LONG_CONTEXT_HEADER = 'TypeSafe-Danger-Zone-Long-Context';
const TYPESAFE_LONG_CONTEXT_TOKENS = 262_144;

function typesafeHeaders(config, { images = [], questions = {}, longContext = false } = {}) {
  const usesImages = images.length > 0 || Object.values(questions).some((q) => q?.type === 'box');
  return {
    Authorization: `Bearer ${config.apiKeys.typesafe}`,
    ...(usesImages ? { [TYPESAFE_IMAGES_HEADER]: 'true' } : {}),
    ...(longContext ? { [TYPESAFE_LONG_CONTEXT_HEADER]: 'true' } : {}),
  };
}

export const DECISION_PROVIDERS = {
  openai: {
    name: 'openai',
    label: 'OpenAI',
    setup: 'set OPENAI_API_KEY',
    defaultModel: 'gpt-6-luna',
    format: openaiFormat,
    endpoint: () => 'https://api.openai.com/v1/decisions',
    headers: (config) => ({ Authorization: `Bearer ${config.apiKeys.openai}` }),
    isAvailable: (config) => Boolean(config?.apiKeys?.openai),
    passthrough: () => false,
  },
  typesafe: {
    name: 'typesafe',
    label: 'TypeSafe',
    setup: 'set TYPESAFE_API_KEY',
    defaultModel: 'jev-latest',
    format: typesafeFormat,
    endpoint: () => 'https://api.typesafe.ai/v1/systemone',
    headers: typesafeHeaders,
    // Long context is slower and less accurate, so it is only turned on for a
    // request the default context rejects.
    longContext: true,
    isAvailable: (config) => Boolean(config?.apiKeys?.typesafe),
    // TypeSafe accepts every published versioned ID, listed or not.
    passthrough: (name) => /^jev-\d+\.\d+(\.\d+)?$/i.test(name),
  },
  cloudflare: {
    name: 'cloudflare',
    label: 'Cloudflare',
    setup: 'set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN',
    defaultModel: 'clef',
    format: cloudflareFormat,
    // Workers AI addresses the model in the path and checks that the body's
    // bare `model` matches it.
    endpoint: (config, model) =>
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.providers.cloudflareaccountid)}/ai/run/@cf/cloudflare/${model}`,
    headers: (config) => ({ Authorization: `Bearer ${config.providers.cloudflareapitoken}` }),
    isAvailable: (config) =>
      Boolean(config?.providers?.cloudflareaccountid && config?.providers?.cloudflareapitoken),
    passthrough: () => false,
  },
  openrouter: {
    name: 'openrouter',
    label: 'OpenRouter',
    setup: 'set OPENROUTER_API_KEY',
    defaultModel: 'gpt-6-luna',
    format: systemOneFormat,
    endpoint: () => 'https://openrouter.ai/api/v1/systemone',
    headers: (config) => ({
      Authorization: `Bearer ${config.apiKeys.openrouter}`,
      ...getOpenRouterAttributionHeaders(config),
    }),
    isAvailable: (config) => Boolean(config?.apiKeys?.openrouter),
    // Decision models OpenRouter adds later are reachable by full slug.
    passthrough: (name) => name.includes('/'),
  },
};

/** Failover order: each model's native host first, then OpenRouter. */
export const DECISION_PROVIDER_PRIORITY = ['openai', 'typesafe', 'cloudflare', 'openrouter'];

const WITH_BOX = [...BASE_QUESTION_TYPES, 'box'];

/**
 * Decision models by canonical name. `hosts` maps each provider that serves
 * the model to that provider's own ID: OpenRouter only knows
 * `~typesafe/jev-latest` and `typesafe/jev-1.13` / `typesafe/jev-1.14` (it
 * rejects `jev-1.13.0` and `jev-preview`), so IDs are translated per host
 * rather than by a blanket prefix rewrite. Every host ID also routes to its
 * model. `maxImages` is how many images the model takes per call and
 * `questionTypes` which question types it answers; a host also needs a format
 * that can send them.
 */
export const DECISION_MODELS = {
  'gpt-6-luna': {
    aliases: ['luna', 'gpt-6-luna-decisions'],
    hosts: { openai: 'gpt-6-luna', openrouter: 'openai/gpt-6-luna-decisions' },
    // OpenAI documents no image count limit; the API enforces its own.
    maxImages: Infinity,
    questionTypes: BASE_QUESTION_TYPES,
  },
  // Jev's image limits are by size, not count; the format checks them.
  'jev-latest': {
    aliases: ['jev'],
    hosts: { typesafe: 'jev-latest', openrouter: '~typesafe/jev-latest' },
    maxImages: Infinity,
    questionTypes: BASE_QUESTION_TYPES,
  },
  'jev-1.13': {
    aliases: [],
    hosts: { typesafe: 'jev-1.13.0', openrouter: 'typesafe/jev-1.13' },
    maxImages: Infinity,
    questionTypes: BASE_QUESTION_TYPES,
  },
  'jev-1.14': {
    aliases: [],
    hosts: { typesafe: 'jev-1.14.0', openrouter: 'typesafe/jev-1.14' },
    maxImages: Infinity,
    questionTypes: WITH_BOX,
  },
  'jev-preview': {
    aliases: [],
    hosts: { typesafe: 'jev-preview' },
    maxImages: Infinity,
    questionTypes: WITH_BOX,
  },
  clef: {
    aliases: ['@cf/cloudflare/clef'],
    hosts: { cloudflare: 'clef', openrouter: 'cloudflare/clef' },
    maxImages: 4,
    questionTypes: BASE_QUESTION_TYPES,
  },
  'clef-flash': {
    aliases: ['@cf/cloudflare/clef-flash'],
    hosts: { cloudflare: 'clef-flash', openrouter: 'cloudflare/clef-flash' },
    maxImages: 4,
    questionTypes: BASE_QUESTION_TYPES,
  },
};

/** What `auto` tries, in order: OpenAI's model first, then Jev, then Clef. */
export const AUTO_MODELS = ['gpt-6-luna', 'jev-latest', 'clef'];

function findCanonicalModel(name) {
  const wanted = name.toLowerCase();
  for (const [canonical, entry] of Object.entries(DECISION_MODELS)) {
    const names = [canonical, ...entry.aliases, ...Object.values(entry.hosts)];
    if (names.some((n) => n.toLowerCase() === wanted)) return canonical;
  }
  return null;
}

/**
 * Resolve a name on one provider: a catalog model it hosts, then its
 * passthrough rule.
 * @returns {{ model: string, family: string, maxImages: number, questionTypes: string[] }|null}
 *   The ID to send to that provider, the model it names (hosts of one family
 *   share failures), and how many images and which question types this host
 *   can send that model
 */
export function findDecisionModel(provider, name) {
  const trimmed = String(name).trim();
  if (!trimmed) return null;
  const canonical = findCanonicalModel(trimmed);
  const hosted = canonical ? DECISION_MODELS[canonical].hosts[provider.name] : undefined;
  if (hosted) {
    const entry = DECISION_MODELS[canonical];
    return {
      model: hosted,
      family: canonical,
      maxImages: provider.format.images ? entry.maxImages : 0,
      questionTypes: entry.questionTypes.filter((type) => provider.format.questionTypes.includes(type)),
    };
  }
  return provider.passthrough(trimmed)
    ? { model: trimmed, family: trimmed, maxImages: 0, questionTypes: BASE_QUESTION_TYPES }
    : null;
}

function servedBy(providerName) {
  return Object.entries(DECISION_MODELS)
    .filter(([, entry]) => entry.hosts[providerName])
    .map(([canonical]) => canonical);
}

function knownModels() {
  return Object.entries(DECISION_MODELS).flatMap(([canonical, entry]) => [canonical, ...entry.aliases]);
}

function candidate(provider, found) {
  return { providerName: provider.name, provider, ...found };
}

/** Every provider that serves a name, in priority order. */
function hostsOf(name) {
  return DECISION_PROVIDER_PRIORITY
    .map((providerName) => {
      const provider = DECISION_PROVIDERS[providerName];
      const found = findDecisionModel(provider, name);
      return found ? candidate(provider, found) : null;
    })
    .filter(Boolean);
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
 * @returns {{ status: 'ok'|'unknown'|'unavailable', candidates: Array<{ providerName: string, provider: object, model: string, family: string }>, error: string|null }}
 */
export function resolveDecisionModel(spec, config) {
  const raw = String(spec ?? '').trim();
  const namespaces = DECISION_PROVIDER_PRIORITY.join(', ');

  if (!raw || raw.toLowerCase() === 'auto') {
    const candidates = AUTO_MODELS.flatMap(hostsOf).filter((c) => c.provider.isAvailable(config));
    if (candidates.length === 0) {
      return fail(
        'unavailable',
        `No decision provider is configured: ${DECISION_PROVIDER_PRIORITY.map((n) => `${n} (${DECISION_PROVIDERS[n].setup})`).join('; ')}.`,
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
    const found = findDecisionModel(provider, name || provider.defaultModel);
    if (!found) {
      return fail('unknown', `${provider.label} does not serve "${name}". Models: ${servedBy(provider.name).join(', ')}.`);
    }
    if (!provider.isAvailable(config)) {
      return fail('unavailable', `${provider.label} is not configured (${provider.setup}).`);
    }
    return ok([candidate(provider, found)]);
  }

  const matches = hostsOf(raw);
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
      `"${raw}" is served by ${matches.map((m) => `${m.providerName} (${m.provider.setup})`).join('; ')}, but none is configured.`,
    );
  }
  return ok(available);
}

/**
 * Ask one candidate: translate the System One request into the host's wire
 * format, send it, and map the answers back. A host with a long-context mode
 * gets the request again in that mode when its default context rejects it.
 * @param {object} candidate - From resolveDecisionModel
 * @param {object} params
 * @param {string|object|Array} params.state
 * @param {object} params.questions - System One question map
 * @param {Array<{ mimeType: string, base64: string }>} [params.images]
 * @param {object} params.config - Server configuration
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<{ model?: string, answers: object, usage?: object, id?: string, longContext?: boolean }>}
 */
export async function askDecisionModel(candidate, { state, questions, images = [], config, signal }) {
  const { provider, model } = candidate;
  const body = provider.format.request(model, state, questions, images);
  const send = (longContext) =>
    callDecisionApi({
      url: provider.endpoint(config, model),
      headers: provider.headers(config, { images, questions, longContext }),
      body,
      parse: provider.format.parse,
      signal,
    });

  try {
    return await send(false);
  } catch (error) {
    if (!provider.longContext || error.code !== 'max_tokens_exceeded') throw error;
  }
  try {
    return { ...(await send(true)), longContext: true };
  } catch (error) {
    if (error.code !== 'max_tokens_exceeded') throw error;
    throw new DecisionError(
      `${error.message} (over the ${Math.round(TYPESAFE_LONG_CONTEXT_TOKENS / 1000)}k-token long context too)`,
      { status: error.status, terminal: true, code: error.code, requestId: error.requestId },
    );
  }
}
