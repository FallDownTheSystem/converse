import { describe, it, expect } from 'vitest';
import {
  EFFORT_LADDER,
  DEFAULT_EFFORT,
  clampReasoningEffort,
} from '../../../src/utils/reasoningEffort.js';

// Tiers each backend accepts, verified against the API's own responses:
// gpt-6-astra rejects 'none' with "Supported values are: 'low', 'medium',
// 'high', 'xhigh', and 'max'"; gpt-5.6-sol accepts both 'none' and 'max'.
const GPT_6_ASTRA = ['low', 'medium', 'high', 'xhigh', 'max'];
const GPT_56 = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
const GPT_55 = ['low', 'medium', 'high', 'xhigh'];
const ANTHROPIC = ['low', 'medium', 'high', 'xhigh', 'max'];
const GROK = ['low', 'medium', 'high'];

describe('EFFORT_LADDER', () => {
  it('runs weakest to strongest and includes xhigh between high and max', () => {
    expect(EFFORT_LADDER).toEqual([
      'none',
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ]);
    expect(DEFAULT_EFFORT).toBe('medium');
  });
});

describe('clampReasoningEffort', () => {
  it('passes through every tier the model supports', () => {
    for (const tier of GPT_56) {
      expect(clampReasoningEffort(tier, GPT_56)).toBe(tier);
    }
    for (const tier of ANTHROPIC) {
      expect(clampReasoningEffort(tier, ANTHROPIC)).toBe(tier);
    }
  });

  it('passes xhigh through by name wherever the model accepts it', () => {
    expect(clampReasoningEffort('xhigh', GPT_6_ASTRA)).toBe('xhigh');
    expect(clampReasoningEffort('xhigh', GPT_55)).toBe('xhigh');
    expect(clampReasoningEffort('xhigh', ANTHROPIC)).toBe('xhigh');
  });

  it('clamps max down to xhigh on models without a max tier', () => {
    expect(clampReasoningEffort('max', GPT_55)).toBe('xhigh');
  });

  it('clamps xhigh and max down to high on a low/medium/high model', () => {
    expect(clampReasoningEffort('xhigh', GROK)).toBe('high');
    expect(clampReasoningEffort('max', GROK)).toBe('high');
  });

  it('clamps none up to low on models that cannot disable reasoning', () => {
    expect(clampReasoningEffort('none', GPT_6_ASTRA)).toBe('low');
    expect(clampReasoningEffort('none', ANTHROPIC)).toBe('low');
  });

  it('clamps minimal up to low rather than down to none', () => {
    // Falling back to 'none' would silently disable reasoning for a request
    // that explicitly asked for some.
    expect(clampReasoningEffort('minimal', GPT_56)).toBe('low');
  });

  it('prefers the nearest stronger tier when the exact one is missing', () => {
    expect(clampReasoningEffort('xhigh', ['high', 'max'])).toBe('max');
    expect(clampReasoningEffort('medium', ['xhigh', 'high'])).toBe('high');
  });

  it('never emits a tier the model rejects', () => {
    for (const supported of [GPT_6_ASTRA, GPT_56, GPT_55, ANTHROPIC, GROK]) {
      for (const effort of EFFORT_LADDER) {
        expect(supported).toContain(clampReasoningEffort(effort, supported));
      }
    }
  });

  it('never selects a tier that is off the ladder, such as ultra', () => {
    for (const effort of EFFORT_LADDER) {
      expect(clampReasoningEffort(effort, [...GPT_6_ASTRA, 'ultra'])).not.toBe(
        'ultra',
      );
    }
  });

  it('falls back to a weaker tier when nothing stronger is supported', () => {
    expect(clampReasoningEffort('max', ['low', 'medium'])).toBe('medium');
  });

  it('falls back to the first supported entry when nothing on the ladder matches', () => {
    expect(clampReasoningEffort('high', ['custom'])).toBe('custom');
  });

  it('throws on an empty or missing tier list rather than inventing a tier', () => {
    expect(() => clampReasoningEffort('high', [])).toThrow(TypeError);
    expect(() => clampReasoningEffort('high', undefined)).toThrow(TypeError);
  });

  it('defaults unknown values to medium', () => {
    expect(clampReasoningEffort(undefined, GPT_56)).toBe('medium');
    expect(clampReasoningEffort('bogus', GPT_56)).toBe('medium');
  });
});
