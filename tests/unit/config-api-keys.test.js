/**
 * Unit tests for API key format validation in config loader
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config.js';

describe('Configuration API Key Validation', () => {
  let originalEnv;

  const ALL_API_KEY_ENV_VARS = [
    'OPENAI_API_KEY',
    'XAI_API_KEY',
    'GOOGLE_API_KEY',
    'GEMINI_API_KEY',
    'ANTHROPIC_API_KEY',
    'MISTRAL_API_KEY',
    'DEEPSEEK_API_KEY',
    'OPENROUTER_API_KEY',
  ];

  beforeEach(() => {
    originalEnv = { ...process.env };

    for (const key of ALL_API_KEY_ENV_VARS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it.each([
    {
      envVar: 'OPENAI_API_KEY',
      value: 'this-is-not-a-valid-openai-key-but-is-long-enough',
      expectedError: /Invalid API key format for OPENAI_API_KEY/,
    },
    {
      envVar: 'XAI_API_KEY',
      value: 'sk-this-has-the-wrong-prefix-for-xai-but-is-long-enough',
      expectedError: /Invalid API key format for XAI_API_KEY/,
    },
    {
      envVar: 'ANTHROPIC_API_KEY',
      value: 'sk-ant-too-short',
      expectedError: /Invalid API key format for ANTHROPIC_API_KEY/,
    },
    {
      envVar: 'OPENROUTER_API_KEY',
      value: 'sk-or-too-short',
      expectedError: /Invalid API key format for OPENROUTER_API_KEY/,
    },
    {
      envVar: 'GOOGLE_API_KEY',
      value: 'short',
      expectedError: /Invalid API key format for GOOGLE_API_KEY/,
    },
    {
      envVar: 'GEMINI_API_KEY',
      value: 'short',
      expectedError: /Invalid API key format for GOOGLE_API_KEY/,
    },
  ])('rejects invalid key formats: $envVar', async ({
    envVar,
    value,
    expectedError,
  }) => {
    process.env[envVar] = value;

    await expect(loadConfig()).rejects.toThrow(expectedError);
  });
});

