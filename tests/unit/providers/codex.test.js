import { describe, it, expect } from 'vitest';
import {
  resolveBackendModel,
  getBackendModelConfig,
  codexProvider,
} from '../../../src/providers/codex.js';

// Tiers each backend accepts, verified against the API's own responses:
// gpt-6-astra rejects 'none' with "Supported values are: 'low', 'medium',
// 'high', 'xhigh', and 'max'"; the Sol/Luna tiers of GPT-6 and GPT-5.6 accept
// both 'none' and 'max'.
const GPT_6_ASTRA = ['low', 'medium', 'high', 'xhigh', 'max'];
const SOL_LUNA = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
const GPT_55 = ['low', 'medium', 'high', 'xhigh'];

describe('codex backend catalog', () => {
  it('declares the backend-supported tiers per model', () => {
    expect(getBackendModelConfig('gpt-6-sol').supportedEfforts).toEqual(SOL_LUNA);
    expect(getBackendModelConfig('gpt-6-luna').supportedEfforts).toEqual(SOL_LUNA);
    expect(getBackendModelConfig('gpt-6-astra').supportedEfforts).toEqual(GPT_6_ASTRA);
    expect(getBackendModelConfig('gpt-5.6-sol').supportedEfforts).toEqual(SOL_LUNA);
    expect(getBackendModelConfig('gpt-5.5').supportedEfforts).toEqual(GPT_55);
  });

  it('resolves aliases case-insensitively', () => {
    expect(getBackendModelConfig('Astra').slug).toBe('gpt-6-astra');
    expect(getBackendModelConfig('Sol').slug).toBe('gpt-6-sol');
    expect(getBackendModelConfig('luna').slug).toBe('gpt-6-luna');
    expect(getBackendModelConfig('gpt-6').slug).toBe('gpt-6-sol');
    expect(getBackendModelConfig('gpt-5.6').slug).toBe('gpt-5.6-sol');
    expect(getBackendModelConfig('gpt5.6-luna').slug).toBe('gpt-5.6-luna');
    expect(getBackendModelConfig('terra').slug).toBe('gpt-5.6-terra');
    expect(getBackendModelConfig('nope')).toBeNull();
  });

  it('exposes gpt-6-sol as the facade model', () => {
    const facade = codexProvider.getModelConfig('codex');
    expect(facade.friendlyName).toContain('GPT-6 Sol');
    expect(facade.contextWindow).toBe(getBackendModelConfig('gpt-6-sol').contextWindow);
    expect(codexProvider.getModelConfig('gpt-5.6-codex')).toBeNull();
  });
});

describe('codex resolveBackendModel', () => {
  it('defaults bare codex to gpt-6-sol', () => {
    expect(resolveBackendModel('codex')).toBe('gpt-6-sol');
    expect(resolveBackendModel('codex', { providers: {} })).toBe('gpt-6-sol');
  });

  it('honours CODEX_MODEL for bare codex, resolving aliases', () => {
    expect(resolveBackendModel('codex', { providers: { codexmodel: 'gpt-5.6-terra' } })).toBe(
      'gpt-5.6-terra',
    );
    expect(resolveBackendModel('codex', { providers: { codexmodel: 'sol' } })).toBe(
      'gpt-6-sol',
    );
    expect(resolveBackendModel('codex', { providers: { codexmodel: 'astra' } })).toBe(
      'gpt-6-astra',
    );
  });

  it('lets a codex: spec override CODEX_MODEL', () => {
    const config = { providers: { codexmodel: 'gpt-5.6-sol' } };
    expect(resolveBackendModel('codex:astra', config)).toBe('gpt-6-astra');
    expect(resolveBackendModel('codex:luna', config)).toBe('gpt-6-luna');
    expect(resolveBackendModel('CODEX:GPT-5.5', config)).toBe('gpt-5.5');
    expect(resolveBackendModel('codex:', config)).toBe('gpt-5.6-sol');
  });

  it('passes unknown backend names through verbatim', () => {
    expect(resolveBackendModel('codex:gpt-7-preview')).toBe('gpt-7-preview');
    expect(resolveBackendModel('codex', { providers: { codexmodel: 'gpt-7-preview' } })).toBe(
      'gpt-7-preview',
    );
  });
});
