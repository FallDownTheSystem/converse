/**
 * Model Routing Helpers
 *
 * Pure helpers for mapping model specifications to providers and resolving
 * "auto" model names to a provider's default model. Extracted so multiple
 * tools (consensus, conversation) can share the same routing logic without
 * importing from another tool module (which would risk circular dependencies).
 */

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
    openai: 'gpt-5',
    xai: 'grok-4-0709',
    google: 'gemini-pro',
    anthropic: 'claude-sonnet-4-20250514',
    mistral: 'magistral-medium-2506',
    deepseek: 'deepseek-reasoner',
    openrouter: 'qwen/qwen3-coder',
  };

  return defaults[providerName] || 'gpt-5';
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
