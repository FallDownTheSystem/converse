/**
 * Model Routing Helpers
 *
 * Pure helpers for mapping model specifications to providers and resolving
 * "auto" model names to a provider's default model. Extracted so multiple
 * tools (consensus, conversation) can share the same routing logic without
 * importing from another tool module (which would risk circular dependencies).
 */

/**
 * Provider auto-selection priority order. Subscription-based CLI/SDK providers
 * (codex, gemini-cli, claude, copilot) come before API-key providers so "auto"
 * routing prefers them. Shared by every mode's model-resolution path.
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
 * Get default model for a provider
 * @param {string} providerName - Provider name
 * @returns {string} Default model name for the provider
 */
export function getDefaultModelForProvider(providerName) {
  const defaults = {
    codex: 'codex',
    'gemini-cli': 'gemini',
    claude: 'claude',
    copilot: 'copilot',
    openai: 'gpt-5.6',
    xai: 'grok-4.5',
    google: 'gemini-pro',
    anthropic: 'claude-sonnet-4-20250514',
    mistral: 'mistral-medium-3-5',
    deepseek: 'deepseek-v4-pro',
    openrouter: 'z-ai/glm-5.2',
  };

  return defaults[providerName] || 'gpt-5.6';
}

/**
 * Curated friendly-alias → { provider, canonicalModel } table. Single source of
 * truth for routing the bare friendly aliases of the API-key providers (xAI,
 * Mistral, DeepSeek) to their canonical current-generation model IDs, so the
 * routing-parity checks are enumerable and capability-gating gets a deterministic
 * canonical ID regardless of provider-level alias quirks. Copilot's aliases stay
 * inside copilot.js because they are reached only via the `copilot:` namespace
 * (bare `gpt-*`/`claude-*`/`gemini-*` keyword-route to their native API providers).
 * OpenRouter models are reached by full slug or the `openrouter:` namespace, not
 * by friendly aliases. Keys are lowercase.
 * @type {Object<string, {provider: string, canonicalModel: string}>}
 */
export const CURATED_MODEL_ALIASES = {
  // xAI
  grok: { provider: 'xai', canonicalModel: 'grok-4.5' },
  'grok-4.5': { provider: 'xai', canonicalModel: 'grok-4.5' },
  'grok-4.5-latest': { provider: 'xai', canonicalModel: 'grok-4.5' },
  'grok-build-latest': { provider: 'xai', canonicalModel: 'grok-4.5' },
  // Mistral
  mistral: { provider: 'mistral', canonicalModel: 'mistral-medium-3-5' },
  'mistral-medium': { provider: 'mistral', canonicalModel: 'mistral-medium-3-5' },
  'mistral-medium-3-5': { provider: 'mistral', canonicalModel: 'mistral-medium-3-5' },
  'mistral-small': { provider: 'mistral', canonicalModel: 'mistral-small-2603' },
  'mistral-small-2603': { provider: 'mistral', canonicalModel: 'mistral-small-2603' },
  'mistral-large': { provider: 'mistral', canonicalModel: 'mistral-large-2512' },
  'mistral-large-2512': { provider: 'mistral', canonicalModel: 'mistral-large-2512' },
  // DeepSeek (native — OpenRouter DeepSeek models use their full slug instead)
  deepseek: { provider: 'deepseek', canonicalModel: 'deepseek-v4-pro' },
  'deepseek-pro': { provider: 'deepseek', canonicalModel: 'deepseek-v4-pro' },
  'deepseek-v4-pro': { provider: 'deepseek', canonicalModel: 'deepseek-v4-pro' },
  'deepseek-flash': { provider: 'deepseek', canonicalModel: 'deepseek-v4-flash' },
  'deepseek-v4-flash': { provider: 'deepseek', canonicalModel: 'deepseek-v4-flash' },
};

/**
 * Parse OpenRouter model decorations off a slug. `:online` is consumed into a
 * `webSearch` flag (the provider attaches the web plugin from the flag) and is
 * never carried on the request/lookup ID; other suffixes such as `:free` are
 * preserved on the request model but stripped from the bare lookup base.
 * @param {string} slug - Slug with the `openrouter:` namespace already removed
 * @returns {{ base: string, modelForRequest: string, webSearch: boolean }}
 */
function parseOpenRouterDecorations(slug) {
  const segments = String(slug).split(':');
  const base = segments[0];
  const decorations = segments.slice(1);
  const webSearch = decorations.includes('online');
  const kept = decorations.filter((d) => d !== 'online');
  const modelForRequest = kept.length ? `${base}:${kept.join(':')}` : base;
  return { base, modelForRequest, webSearch };
}

/**
 * Classify a model spec into { providerName, canonicalModel, options } by the
 * design resolution order: explicit namespace prefix, curated friendly alias,
 * full OpenRouter slug / `openrouter:` prefix (no env gate), then keyword/
 * passthrough. `options` carries flags derived from decorations (e.g.
 * `web_search` from an OpenRouter `:online`). Unknown explicit IDs pass through
 * unchanged (never silently substituted).
 * @param {string} spec - Model specification
 * @param {object} providers - Provider instances
 * @returns {{ providerName: string, canonicalModel: string, options: object }}
 */
function classifyModelSpec(spec, providers) {
  const raw = String(spec);
  const lower = raw.toLowerCase();
  const options = {};

  if (lower === 'auto') {
    const providerName = mapModelToProvider('auto', providers);
    return {
      providerName,
      canonicalModel: getDefaultModelForProvider(providerName),
      options,
    };
  }

  // Explicit OpenRouter namespace: route without OPENROUTER_DYNAMIC_MODELS and
  // parse `:online`/`:free` decorations before any lookup.
  if (lower.startsWith('openrouter:')) {
    const { modelForRequest, webSearch } = parseOpenRouterDecorations(
      raw.slice('openrouter:'.length),
    );
    if (webSearch) options.web_search = true;
    return { providerName: 'openrouter', canonicalModel: modelForRequest, options };
  }

  // Other explicit namespaces pass the spec through unchanged; the target
  // provider strips its own prefix (preserves current copilot/claude/gemini-cli
  // behavior).
  if (
    lower.startsWith('copilot:') ||
    lower.startsWith('claude:') ||
    lower.startsWith('gemini:')
  ) {
    return {
      providerName: mapModelToProvider(raw, providers),
      canonicalModel: raw,
      options,
    };
  }

  // Curated friendly alias → provider + canonical ID.
  const curated = CURATED_MODEL_ALIASES[lower];
  if (curated) {
    return {
      providerName: curated.provider,
      canonicalModel: curated.canonicalModel,
      options,
    };
  }

  // Full provider/model slug: a native provider that statically owns the bare
  // model wins; otherwise it is an OpenRouter slug (decorations parsed).
  if (raw.includes('/')) {
    const { base, modelForRequest, webSearch } = parseOpenRouterDecorations(raw);
    const providerName = mapModelToProvider(base, providers);
    if (providerName === 'openrouter' && webSearch) {
      options.web_search = true;
    }
    return { providerName, canonicalModel: modelForRequest, options };
  }

  // Keyword routing / unknown-ID passthrough (unchanged model string).
  const providerName = mapModelToProvider(raw, providers);
  return {
    providerName,
    canonicalModel: resolveAutoModel(raw, providerName),
    options,
  };
}

/**
 * Resolve "auto" model to default model for the provider
 * @param {string} model - Model name (may be "auto")
 * @param {string} providerName - Resolved provider name
 * @returns {string} Concrete model name
 */
export function resolveAutoModel(model, providerName) {
  if (model.toLowerCase() !== 'auto') {
    return model;
  }

  return getDefaultModelForProvider(providerName);
}

/**
 * Provider-specific setup hints appended to "Provider X is not available."
 * errors so users know how to enable a provider. Keyed by registry name.
 */
const PROVIDER_SETUP_HINTS = {
  'gemini-cli':
    'Install the Antigravity CLI and run `agy` once to log in (https://antigravity.google)',
};

/**
 * Build the "provider not available" error message with an optional setup hint.
 * @param {string} providerName - Provider registry name
 * @returns {string}
 */
export function getProviderUnavailableMessage(providerName) {
  const base = `Provider ${providerName} is not available. Check API key configuration.`;
  const hint = PROVIDER_SETUP_HINTS[providerName];
  return hint ? `${base} ${hint}` : base;
}

/**
 * Whether a provider's default model supports image inputs. Used by the "auto"
 * selection paths to skip text-only providers (gemini-cli, copilot) when the
 * request includes images. Providers without a resolvable config are treated as
 * image-capable (fail open — they surface their own errors downstream).
 * @param {object} providerInstance - Provider implementation
 * @param {string} providerName - Provider registry name
 * @returns {boolean}
 */
export function providerSupportsImages(providerInstance, providerName) {
  if (!providerInstance || typeof providerInstance.getModelConfig !== 'function') {
    return true;
  }
  try {
    const defaultModel = getDefaultModelForProvider(providerName);
    const modelConfig = providerInstance.getModelConfig(defaultModel);
    if (!modelConfig) return true;
    return modelConfig.supportsImages !== false;
  } catch {
    return true;
  }
}

/**
 * Return the available provider names in PROVIDER_PRIORITY order, optionally
 * skipping text-only providers when the request has images and capping the
 * count. Shared by every mode's "auto" expansion path.
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
    if (!provider || !provider.isAvailable(config)) continue;
    if (hasImages && !providerSupportsImages(provider, name)) continue;
    names.push(name);
  }
  return names;
}

/**
 * Resolve a single model spec into routing facts: its provider name, the
 * provider instance, the concrete model, and an availability status. Callers
 * own their error wording and structural handling by switching on `status`
 * ('ok' | 'not_found' | 'unavailable').
 * @param {string} spec - Model specification
 * @param {object} providers - Provider instances
 * @param {object} config - Configuration
 * @returns {{ providerName: string, provider: object, resolvedModel: string, status: string, options: object }}
 */
export function resolveModelSpec(spec, providers, config) {
  const { providerName, canonicalModel, options } = classifyModelSpec(
    spec,
    providers,
  );
  const provider = providers[providerName];
  const status = !provider ? 'not_found' : !provider.isAvailable(config) ? 'unavailable' : 'ok';
  return { providerName, provider, resolvedModel: canonicalModel, status, options };
}

/**
 * Map model name to provider name
 * @param {string} model - Model name
 * @param {object} providers - Map of available provider instances keyed by name
 * @returns {string} Provider name
 */
export function mapModelToProvider(model, providers) {
  const modelLower = model.toLowerCase();

  // Handle "auto" - prioritize: codex > gemini-cli > claude > copilot > openai
  if (modelLower === 'auto') {
    if (providers['codex']) {
      return 'codex';
    }
    if (providers['gemini-cli']) {
      return 'gemini-cli';
    }
    if (providers['claude']) {
      return 'claude';
    }
    if (providers['copilot']) {
      return 'copilot';
    }
    return 'openai';
  }

  // Check Codex (exact match only - don't route "gpt-5-codex" etc to Codex provider)
  if (modelLower === 'codex') {
    return 'codex';
  }

  // Check Gemini CLI (exact match only - routes to CLI provider instead of Google API)
  if (modelLower === 'gemini' || modelLower === 'gemini-cli') {
    return 'gemini-cli';
  }

  // Check gemini: prefix (e.g., gemini:flash, gemini:pro) - routes to Antigravity
  // CLI provider. Must be before the google flash/pro keyword rule below so it
  // wins over Google API routing. Bare gemini-pro/gemini-flash still hit google.
  if (modelLower.startsWith('gemini:')) {
    return 'gemini-cli';
  }

  // Check Claude SDK (exact match only - routes to SDK provider instead of Anthropic API)
  if (
    modelLower === 'claude' ||
    modelLower === 'claude-sdk' ||
    modelLower === 'claude-code'
  ) {
    return 'claude';
  }

  // Check claude: prefix (e.g., claude:fable, claude:opus) - routes to SDK provider
  // Must be before keyword matching to prevent misrouting to Anthropic API
  if (modelLower.startsWith('claude:')) {
    return 'claude';
  }

  // Check Copilot SDK (exact match only - routes to SDK provider)
  if (
    modelLower === 'copilot' ||
    modelLower === 'copilot-sdk' ||
    modelLower === 'github-copilot'
  ) {
    return 'copilot';
  }

  // Check copilot: prefix (e.g., copilot:gpt-5.2, copilot:claude-sonnet-4.6)
  // Must be before slash-format and keyword matching to prevent misrouting
  if (modelLower.startsWith('copilot:')) {
    return 'copilot';
  }

  // Check openrouter: prefix (e.g., openrouter:z-ai/glm-5.2). Routes to
  // OpenRouter without the OPENROUTER_DYNAMIC_MODELS gate. Must be before the
  // slash-format check so the namespaced slug is not probed against native
  // providers.
  if (modelLower.startsWith('openrouter:')) {
    return 'openrouter';
  }

  // Check OpenRouter-specific patterns first
  if (
    modelLower === 'openrouter auto' ||
    modelLower === 'auto router' ||
    modelLower === 'auto-router' ||
    modelLower === 'openrouter-auto'
  ) {
    return 'openrouter';
  }

  // If model contains "/", check if native provider supports it
  if (modelLower.includes('/')) {
    // Check each provider to see if they have this exact model
    for (const [providerName, provider] of Object.entries(providers)) {
      if (provider && provider.getModelConfig) {
        const modelConfig = provider.getModelConfig(model);
        if (
          modelConfig &&
          !modelConfig.isDynamic &&
          !modelConfig.needsApiUpdate
        ) {
          // Model exists in this provider's static list
          return providerName;
        }
      }
    }
    // No native provider has this model, route to OpenRouter
    return 'openrouter';
  }

  // For non-slash models, use keyword matching as before

  // OpenAI models
  if (
    modelLower.includes('gpt') ||
    modelLower.includes('o1') ||
    modelLower.includes('o3') ||
    modelLower.includes('o4')
  ) {
    return 'openai';
  }

  // XAI models
  if (modelLower.includes('grok')) {
    return 'xai';
  }

  // Google models
  if (
    modelLower.includes('flash') ||
    modelLower.includes('pro') ||
    modelLower === 'google'
  ) {
    return 'google';
  }

  // Anthropic models
  if (
    modelLower.includes('claude') ||
    modelLower.includes('fable') ||
    modelLower.includes('opus') ||
    modelLower.includes('sonnet') ||
    modelLower.includes('haiku')
  ) {
    return 'anthropic';
  }

  // Mistral models
  if (modelLower.includes('mistral') || modelLower.includes('magistral')) {
    return 'mistral';
  }

  // DeepSeek models
  if (
    modelLower.includes('deepseek') ||
    modelLower === 'reasoner' ||
    modelLower === 'r1' ||
    modelLower === 'chat'
  ) {
    return 'deepseek';
  }

  // OpenRouter models (specific model patterns)
  if (
    modelLower.includes('qwen') ||
    modelLower.includes('kimi') ||
    modelLower.includes('moonshot') ||
    modelLower === 'k2'
  ) {
    return 'openrouter';
  }

  // Default fallback
  return 'openai';
}
