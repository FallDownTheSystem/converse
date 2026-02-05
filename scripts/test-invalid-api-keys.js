#!/usr/bin/env node

/**
 * Lightweight smoke test for invalid API keys.
 *
 * This avoids Vitest/Vite because those require esbuild spawning, which may be
 * blocked in some locked-down environments.
 */

import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/utils/logger.js';

const logger = createLogger('test-invalid-api-keys');

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

function setIsolatedEnv(originalEnv, envVar, value) {
  process.env = { ...originalEnv };

  for (const key of ALL_API_KEY_ENV_VARS) {
    delete process.env[key];
  }

  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env[envVar] = value;
}

async function assertInvalidKey({ envVar, value, expectedError }) {
  try {
    await loadConfig();
    throw new Error(`Expected loadConfig() to fail for ${envVar}`);
  } catch (error) {
    const message = String(error?.message || error);
    if (!expectedError.test(message)) {
      throw new Error(
        `Unexpected error for ${envVar}. Expected ${expectedError}, got: ${message}`,
      );
    }
  }
}

async function main() {
  const originalEnv = { ...process.env };

  const cases = [
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
  ];

  for (const testCase of cases) {
    setIsolatedEnv(originalEnv, testCase.envVar, testCase.value);
    await assertInvalidKey(testCase);
    logger.info(`[ok] ${testCase.envVar} rejected`);
  }

  process.env = originalEnv;
}

main().catch((error) => {
  logger.error(error);
  process.exitCode = 1;
});
