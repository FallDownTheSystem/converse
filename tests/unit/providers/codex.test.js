import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import {
  resolveBackendModel,
  codexProvider,
} from '../../../src/providers/codex.js';
import { ErrorCodes } from '../../../src/providers/interface.js';
import { getProviders } from '../../../src/providers/index.js';
import { resolveModelSpec } from '../../../src/utils/modelRouting.js';

// Tiers each backend accepts, verified against the API's own responses:
// gpt-6-astra rejects 'none' with "Supported values are: 'low', 'medium',
// 'high', 'xhigh', and 'max'"; the Sol/Luna tiers of GPT-6 and GPT-5.6 accept
// both 'none' and 'max'.
const GPT_6_ASTRA = ['low', 'medium', 'high', 'xhigh', 'max'];
const SOL_LUNA = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
const GPT_55 = ['low', 'medium', 'high', 'xhigh'];

// The router only picks available providers; the real probe depends on the
// machine's Codex login, so routing tests pin it.
function providersWithCodexAvailable() {
  return {
    ...getProviders(),
    codex: { ...getProviders().codex, isAvailable: () => true },
  };
}

describe('codex backend catalog', () => {
  it('is keyed by backend slug', () => {
    expect(Object.keys(codexProvider.getSupportedModels())).toEqual([
      'gpt-6-sol',
      'gpt-6-luna',
      'gpt-6-astra',
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
      'gpt-5.5',
      'gpt-5.3-codex-spark',
    ]);
    for (const [slug, entry] of Object.entries(codexProvider.getSupportedModels())) {
      expect(entry.modelName).toBe(slug);
      expect(Array.isArray(entry.aliases)).toBe(true);
      expect(entry.contextWindow).toBeGreaterThan(0);
      expect(entry.friendlyName).toContain('OpenAI Codex');
    }
  });

  it('declares the backend-supported tiers per model', () => {
    expect(codexProvider.getModelConfig('gpt-6-sol').supportedEfforts).toEqual(SOL_LUNA);
    expect(codexProvider.getModelConfig('gpt-6-luna').supportedEfforts).toEqual(SOL_LUNA);
    expect(codexProvider.getModelConfig('gpt-6-astra').supportedEfforts).toEqual(GPT_6_ASTRA);
    expect(codexProvider.getModelConfig('gpt-5.6-sol').supportedEfforts).toEqual(SOL_LUNA);
    expect(codexProvider.getModelConfig('gpt-5.5').supportedEfforts).toEqual(GPT_55);
  });

  it('resolves aliases case-insensitively', () => {
    expect(codexProvider.getModelConfig('Astra').modelName).toBe('gpt-6-astra');
    expect(codexProvider.getModelConfig('Sol').modelName).toBe('gpt-6-sol');
    expect(codexProvider.getModelConfig('luna').modelName).toBe('gpt-6-luna');
    expect(codexProvider.getModelConfig('gpt-6').modelName).toBe('gpt-6-sol');
    expect(codexProvider.getModelConfig('gpt-5.6').modelName).toBe('gpt-5.6-sol');
    expect(codexProvider.getModelConfig('gpt5.6-luna').modelName).toBe('gpt-5.6-luna');
    expect(codexProvider.getModelConfig('terra').modelName).toBe('gpt-5.6-terra');
    expect(codexProvider.getModelConfig('nope')).toBeNull();
  });

  it('exposes gpt-6-sol as the default model with no codex pseudo-model', () => {
    expect(codexProvider.defaultModel).toBe('gpt-6-sol');
    expect(codexProvider.getModelConfig('codex')).toBeNull();
    expect(codexProvider.getModelConfig('codex:sol')).toBeNull();
    expect(codexProvider.getModelConfig('gpt-5.6-codex').modelName).toBe('gpt-5.6-sol');
  });
});

describe('codex resolveBackendModel', () => {
  it('defaults an omitted model to gpt-6-sol', () => {
    expect(resolveBackendModel()).toBe('gpt-6-sol');
    expect(resolveBackendModel('')).toBe('gpt-6-sol');
    expect(resolveBackendModel(null)).toBe('gpt-6-sol');
  });

  it('maps canonical IDs and aliases to backend slugs', () => {
    expect(resolveBackendModel('gpt-5.6-terra')).toBe('gpt-5.6-terra');
    expect(resolveBackendModel('sol')).toBe('gpt-6-sol');
    expect(resolveBackendModel('astra')).toBe('gpt-6-astra');
    expect(resolveBackendModel('Luna')).toBe('gpt-6-luna');
    expect(resolveBackendModel('GPT-5.5')).toBe('gpt-5.5');
    expect(resolveBackendModel('spark')).toBe('gpt-5.3-codex-spark');
  });

  it('rejects unknown backend names and namespaced specs', () => {
    for (const name of ['gpt-7-preview', 'codex', 'codex:astra']) {
      expect(() => resolveBackendModel(name)).toThrow(
        expect.objectContaining({ code: ErrorCodes.MODEL_NOT_FOUND }),
      );
    }
  });
});

describe('codex router resolution', () => {
  it('defaults bare codex to gpt-6-sol', () => {
    const providers = providersWithCodexAvailable();
    for (const config of [{}, { providers: {} }]) {
      const result = resolveModelSpec('codex', providers, config);
      expect(result.status).toBe('ok');
      expect(result.providerName).toBe('codex');
      expect(result.resolvedModel).toBe('gpt-6-sol');
    }
  });

  it('honours the default-model override for bare codex, resolving aliases', () => {
    const providers = providersWithCodexAvailable();
    const resolve = (providerConfig) =>
      resolveModelSpec('codex', providers, { providers: providerConfig }).resolvedModel;

    expect(resolve({ codexdefaultmodel: 'astra' })).toBe('gpt-6-astra');
    expect(resolve({ codexdefaultmodel: 'gpt-5.6-terra' })).toBe('gpt-5.6-terra');
    // Legacy CODEX_MODEL still applies when CODEX_DEFAULT_MODEL is unset
    expect(resolve({ codexmodel: 'sol' })).toBe('gpt-6-sol');
    expect(resolve({ codexmodel: 'astra' })).toBe('gpt-6-astra');
    expect(resolve({ codexdefaultmodel: 'luna', codexmodel: 'astra' })).toBe('gpt-6-luna');
  });

  it('lets a codex: spec override the default-model setting', () => {
    const providers = providersWithCodexAvailable();
    const config = { providers: { codexdefaultmodel: 'gpt-5.6-sol' } };
    const resolve = (spec) => resolveModelSpec(spec, providers, config).resolvedModel;

    expect(resolve('codex:sol')).toBe('gpt-6-sol');
    expect(resolve('codex:astra')).toBe('gpt-6-astra');
    expect(resolve('codex:luna')).toBe('gpt-6-luna');
    expect(resolve('CODEX:GPT-5.5')).toBe('gpt-5.5');
    expect(resolve('codex:')).toBe('gpt-5.6-sol');
  });

  it('routes bare codex catalog names to codex when it is available', () => {
    const result = resolveModelSpec('gpt-6-astra', providersWithCodexAvailable(), {});
    expect(result.status).toBe('ok');
    expect(result.providerName).toBe('codex');
    expect(result.resolvedModel).toBe('gpt-6-astra');
  });

  it('rejects unknown codex: models with suggestions', () => {
    const result = resolveModelSpec('codex:gpt-7-preview', providersWithCodexAvailable(), {});
    expect(result.status).toBe('unknown');
    expect(result.providerName).toBe('codex');
    expect(result.resolvedModel).toBeNull();

    const typo = resolveModelSpec('codex:astar', providersWithCodexAvailable(), {});
    expect(typo.status).toBe('unknown');
    expect(typo.error).toContain('Did you mean');
    expect(typo.error).toContain('codex:astra');
  });
});

describe('codex availability', () => {
  let savedCodexHome;
  let codexHome;

  beforeEach(() => {
    savedCodexHome = process.env.CODEX_HOME;
    codexHome = mkdtempSync(join(tmpdir(), 'converse-codex-test-'));
    process.env.CODEX_HOME = codexHome;
  });

  afterEach(() => {
    if (savedCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = savedCodexHome;
    rmSync(codexHome, { recursive: true, force: true });
  });

  it('is unavailable without a login file or API key', () => {
    expect(codexProvider.isAvailable({ providers: {} })).toBe(false);
  });

  it('is available with an auth.json in CODEX_HOME', () => {
    writeFileSync(join(codexHome, 'auth.json'), '{}');
    expect(codexProvider.isAvailable({ providers: {} })).toBe(true);
  });

  it('is available with a CODEX_API_KEY', () => {
    expect(codexProvider.isAvailable({ providers: { codexapikey: 'sk-test' } })).toBe(true);
  });
});
