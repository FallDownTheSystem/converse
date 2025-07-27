import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../src/config.js';
import { logger } from '../../../src/utils/logger.js';

describe('Multi-Provider Error Handling Tests', () => {
  let config;

  // Dynamic API key checking functions
  const hasAnthropic = () => !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-'));
  const hasDeepSeek = () => !!(process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.startsWith('sk-'));
  const hasMistral = () => !!(process.env.MISTRAL_API_KEY && process.env.MISTRAL_API_KEY.length > 20);
  const hasOpenRouter = () => !!(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.startsWith('sk-or-') && process.env.OPENROUTER_REFERER);
  const hasAnyNewApiKey = () => hasAnthropic() || hasDeepSeek() || hasMistral() || hasOpenRouter();

  beforeAll(async () => {
    try {
      config = await loadConfig();

      const availableProviders = [];
      if (hasAnthropic()) availableProviders.push('Anthropic');
      if (hasDeepSeek()) availableProviders.push('DeepSeek');
      if (hasMistral()) availableProviders.push('Mistral');
      if (hasOpenRouter()) availableProviders.push('OpenRouter');

      if (availableProviders.length > 0) {
        logger.info(`[multi-provider-error-test] Running tests with providers: ${availableProviders.join(', ')}`);
      } else {
        logger.warn('[multi-provider-error-test] No new provider API keys found - tests will be skipped');
      }
    } catch (error) {
      logger.error('[multi-provider-error-test] Setup failed:', error);
      config = { apiKeys: {} };
    }
  });

  describe('Invalid Model Names Across Providers', () => {
    it.skipIf(!hasAnyNewApiKey())('should handle invalid model names gracefully across all available providers', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const testCases = [];

        if (hasAnthropic()) {
          testCases.push({
            provider: 'Anthropic',
            model: 'claude-nonexistent-model'
          });
        }

        if (hasDeepSeek()) {
          testCases.push({
            provider: 'DeepSeek',
            model: 'deepseek-nonexistent'
          });
        }

        if (hasMistral()) {
          testCases.push({
            provider: 'Mistral',
            model: 'mistral-nonexistent'
          });
        }

        if (hasOpenRouter()) {
          testCases.push({
            provider: 'OpenRouter',
            model: 'nonexistent-model-xyz'
          });
        }

        for (const testCase of testCases) {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Hello',
              model: testCase.model
            }
          });

          // Should either use a fallback or return an error
          if (result.isError) {
            expect(result.content[0].text).toMatch(/(model|not found|not available|does not exist|404|provider error)/i);
            logger.info(`[multi-provider-error-test] ${testCase.provider} handled invalid model correctly`);
          } else {
            // If no error, it means a fallback was used
            expect(result.content).toBeDefined();
            logger.info(`[multi-provider-error-test] ${testCase.provider} used fallback for invalid model`);
          }
        }
      });
    }, 60000);
  });

  describe('Rate Limiting Across Providers', () => {
    it.skipIf(!hasAnyNewApiKey() || (!hasAnthropic() && !hasDeepSeek()))('should handle rate limiting across multiple providers', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const providers = [];

        if (hasAnthropic()) {
          providers.push({ name: 'Anthropic', model: 'haiku' });
        }

        if (hasDeepSeek()) {
          providers.push({ name: 'DeepSeek', model: 'deepseek-chat' });
        }

        if (providers.length < 2) {
          logger.info('[multi-provider-error-test] Not enough providers for rate limiting test');
          return;
        }

        // Make rapid requests across providers
        const allPromises = [];

        for (const provider of providers) {
          const promises = Array(3).fill(null).map((_, i) =>
            client.callTool({
              name: 'chat',
              arguments: {
                prompt: `${provider.name} test ${i}`,
                model: provider.model,
                temperature: 0
              }
            })
          );
          allPromises.push(...promises);
        }

        const results = await Promise.allSettled(allPromises);

        // Count successes per provider
        const successByProvider = {};
        providers.forEach(p => successByProvider[p.name] = 0);

        results.forEach((result, index) => {
          const providerIndex = Math.floor(index / 3);
          const provider = providers[providerIndex];
          if (result.status === 'fulfilled' && !result.value.isError) {
            successByProvider[provider.name]++;
          }
        });

        // At least one provider should have successful requests
        const totalSuccess = Object.values(successByProvider).reduce((a, b) => a + b, 0);
        expect(totalSuccess).toBeGreaterThan(0);

        logger.info('[multi-provider-error-test] Rate limiting test results:', successByProvider);
      });
    }, 120000);
  });
});
