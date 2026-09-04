import { describe, it, expect } from 'vitest';
import {
  mapReasoningEffort,
  resolveBackendModel,
  getBackendModelConfig,
  codexProvider,
} from '../../../src/providers/codex.js';

// Tiers each backend accepts, verified against the API's own responses:
// gpt-6-astra rejects 'none' with "Supported values are: 'low', 'medium',
// 'high', 'xhigh', and 'max'"; gpt-5.6-sol accepts both 'none' and 'max'.
const GPT_6_ASTRA = ['low', 'medium', 'high', 'xhigh', 'max'];
const GPT_56 = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
const GPT_55 = ['low', 'medium', 'high', 'xhigh'];

describe('codex mapReasoningEffort', () => {
  it('passes through every tier the model supports', () => {
    expect(mapReasoningEffort('none', GPT_56)).toBe('none');
    expect(mapReasoningEffort('low', GPT_56)).toBe('low');
    expect(mapReasoningEffort('medium', GPT_56)).toBe('medium');
    expect(mapReasoningEffort('high', GPT_56)).toBe('high');
    expect(mapReasoningEffort('max', GPT_56)).toBe('max');
  });

  it('clamps max down to xhigh on models without a max tier', () => {
    expect(mapReasoningEffort('max', GPT_55)).toBe('xhigh');
  });

  it('clamps none up to low on gpt-6-astra rather than sending a rejected tier', () => {
    expect(mapReasoningEffort('none', GPT_6_ASTRA)).toBe('low');
  });

  it('clamps minimal up to low rather than down to none', () => {
    // Falling back to 'none' would silently disable reasoning for a request
    // that explicitly asked for some.
    expect(mapReasoningEffort('minimal', GPT_56)).toBe('low');
  });

  it('never emits a tier the model rejects', () => {
    for (const supported of [GPT_6_ASTRA, GPT_56, GPT_55]) {
      for (const effort of ['none', 'minimal', 'low', 'medium', 'high', 'max']) {
        expect(supported).toContain(mapReasoningEffort(effort, supported));
      }
    }
  });

  it('never selects ultra, which switches on sub-agent delegation', () => {
    for (const effort of ['none', 'minimal', 'low', 'medium', 'high', 'max']) {
      expect(mapReasoningEffort(effort, [...GPT_6_ASTRA, 'ultra'])).not.toBe('ultra');
    }
  });

  it('falls back to a weaker tier when nothing stronger is supported', () => {
    expect(mapReasoningEffort('max', ['low', 'medium'])).toBe('medium');
  });

  it('defaults unknown values to medium', () => {
    expect(mapReasoningEffort(undefined, GPT_56)).toBe('medium');
    expect(mapReasoningEffort('bogus', GPT_56)).toBe('medium');
  });
});

describe('codex backend catalog', () => {
  it('declares the backend-supported tiers per model', () => {
    expect(getBackendModelConfig('gpt-6-astra').supportedEfforts).toEqual(GPT_6_ASTRA);
    expect(getBackendModelConfig('gpt-5.6-sol').supportedEfforts).toEqual(GPT_56);
    expect(getBackendModelConfig('gpt-5.5').supportedEfforts).toEqual(GPT_55);
  });

  it('resolves aliases case-insensitively', () => {
    expect(getBackendModelConfig('Astra').slug).toBe('gpt-6-astra');
    expect(getBackendModelConfig('gpt-5.6').slug).toBe('gpt-5.6-sol');
    expect(getBackendModelConfig('terra').slug).toBe('gpt-5.6-terra');
    expect(getBackendModelConfig('nope')).toBeNull();
  });

  it('exposes gpt-6-astra as the facade model', () => {
    const facade = codexProvider.getModelConfig('codex');
    expect(facade.friendlyName).toContain('GPT-6 Astra');
    expect(facade.contextWindow).toBe(getBackendModelConfig('gpt-6-astra').contextWindow);
    expect(codexProvider.getModelConfig('gpt-5.6-codex')).toBeNull();
  });
});

describe('codex resolveBackendModel', () => {
  it('defaults bare codex to gpt-6-astra', () => {
    expect(resolveBackendModel('codex')).toBe('gpt-6-astra');
    expect(resolveBackendModel('codex', { providers: {} })).toBe('gpt-6-astra');
  });

  it('honours CODEX_MODEL for bare codex, resolving aliases', () => {
    expect(resolveBackendModel('codex', { providers: { codexmodel: 'gpt-5.6-terra' } })).toBe(
      'gpt-5.6-terra',
    );
    expect(resolveBackendModel('codex', { providers: { codexmodel: 'sol' } })).toBe(
      'gpt-5.6-sol',
    );
  });

  it('lets a codex: spec override CODEX_MODEL', () => {
    const config = { providers: { codexmodel: 'gpt-5.6-sol' } };
    expect(resolveBackendModel('codex:astra', config)).toBe('gpt-6-astra');
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
