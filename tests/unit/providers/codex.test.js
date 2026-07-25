import { describe, it, expect } from 'vitest';
import { mapReasoningEffort, codexProvider } from '../../../src/providers/codex.js';

// Tiers the GPT-5.6 Codex backend accepts. Verified against the API's own
// rejection message: "Supported values are: 'none', 'low', 'medium', 'high',
// and 'xhigh'." Note the absence of 'minimal', which pre-5.6 models accepted.
const GPT_56 = ['none', 'low', 'medium', 'high', 'xhigh'];

describe('codex mapReasoningEffort', () => {
  it('passes through every tier the model supports', () => {
    expect(mapReasoningEffort('none', GPT_56)).toBe('none');
    expect(mapReasoningEffort('low', GPT_56)).toBe('low');
    expect(mapReasoningEffort('medium', GPT_56)).toBe('medium');
    expect(mapReasoningEffort('high', GPT_56)).toBe('high');
  });

  it('maps max to the strongest tier', () => {
    expect(mapReasoningEffort('max', GPT_56)).toBe('xhigh');
  });

  it('clamps minimal up to low rather than down to none', () => {
    // Falling back to 'none' would silently disable reasoning for a request
    // that explicitly asked for some.
    expect(mapReasoningEffort('minimal', GPT_56)).toBe('low');
  });

  it('never emits a tier the model rejects', () => {
    for (const effort of ['none', 'minimal', 'low', 'medium', 'high', 'max']) {
      expect(GPT_56).toContain(mapReasoningEffort(effort, GPT_56));
    }
  });

  it('falls back to a weaker tier when nothing stronger is supported', () => {
    expect(mapReasoningEffort('max', ['low', 'medium'])).toBe('medium');
  });

  it('defaults unknown values to medium', () => {
    expect(mapReasoningEffort(undefined, GPT_56)).toBe('medium');
    expect(mapReasoningEffort('bogus', GPT_56)).toBe('medium');
  });

  it('declares the backend-supported tiers on the codex model config', () => {
    expect(codexProvider.getModelConfig('codex').supportedEfforts).toEqual(GPT_56);
  });

  it('resolves aliases to the same config', () => {
    expect(codexProvider.getModelConfig('gpt-5.6-codex')).toBe(
      codexProvider.getModelConfig('codex'),
    );
    expect(codexProvider.getModelConfig('nope')).toBeNull();
  });
});
