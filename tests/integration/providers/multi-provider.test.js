import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../src/config.js';
import { logger } from '../../../src/utils/logger.js';
import { parseJsonResponse } from '../../utils/responseParser.js';
import {
  testWithApiKeys,
  hasOpenAI,
  hasXAI,
  hasGoogle,
  hasAnyMainProvider,
  getSkipMessage,
} from '../../utils/conditionalTest.js';

describe('Multi-Provider Consensus Integration Tests', () => {
  let config;

  // Dynamic API key checking functions for new providers
  const hasAnthropic = () =>
    !!(
      process.env.ANTHROPIC_API_KEY &&
      process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-')
    );
  const hasDeepSeek = () =>
    !!(
      process.env.DEEPSEEK_API_KEY &&
      process.env.DEEPSEEK_API_KEY.startsWith('sk-')
    );
  const hasMistral = () =>
    !!(process.env.MISTRAL_API_KEY && process.env.MISTRAL_API_KEY.length > 20);
  const hasOpenRouter = () =>
    !!(
      process.env.OPENROUTER_API_KEY &&
      process.env.OPENROUTER_API_KEY.startsWith('sk-or-') &&
      process.env.OPENROUTER_REFERER
    );

  beforeAll(async () => {
    try {
      config = await loadConfig();

      const availableProviders = [];
      if (hasOpenAI) availableProviders.push('OpenAI');
      if (hasXAI) availableProviders.push('XAI');
      if (hasGoogle) availableProviders.push('Google');
      if (hasAnthropic()) availableProviders.push('Anthropic');
      if (hasDeepSeek()) availableProviders.push('DeepSeek');
      if (hasMistral()) availableProviders.push('Mistral');
      if (hasOpenRouter()) availableProviders.push('OpenRouter');

      if (availableProviders.length >= 2) {
        logger.info(
          `[multi-provider-test] Running tests with providers: ${availableProviders.join(', ')}`,
        );
      } else {
        logger.warn(
          '[multi-provider-test] Less than 2 providers available - most tests will be skipped',
        );
      }
    } catch (error) {
      logger.error('[multi-provider-test] Setup failed:', error);
      config = { apiKeys: {} };
    }
  });

  describe('Main Provider Consensus', () => {
    testWithApiKeys({
      requiredProviders: ['OPENAI', 'XAI', 'GOOGLE'],
    })(
      'should gather consensus from all main providers',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const models = [];
          if (hasOpenAI) models.push({ model: 'gpt-4o-mini' });
          if (hasXAI) models.push({ model: 'grok' });
          if (hasGoogle) models.push({ model: 'flash' });

          if (models.length < 2) return;

          const result = await client.callTool({
            name: 'consensus',
            arguments: {
              prompt: 'Is the sky blue? Answer with "Yes" or "No" only.',
              models,
              enable_cross_feedback: false,
              temperature: 0,
            },
          });

          expect(result).toBeDefined();
          expect(result.isError).toBeFalsy();

          const consensusResult = parseJsonResponse(result.content[0].text);
          expect(consensusResult.status).toBe('consensus_complete');
          expect(consensusResult.models_consulted).toBe(models.length);
          expect(consensusResult.successful_initial_responses).toBeGreaterThan(
            0,
          );

          logger.info(
            `[multi-provider-test] Main provider consensus completed with ${models.length} providers`,
          );
        });
      },
      120000,
    );

    testWithApiKeys({
      requiredProviders: ['OPENAI', 'GOOGLE'],
      requireAll: true,
    })(
      'should test cross-feedback between OpenAI and Google',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const models = [{ model: 'gpt-4o-mini' }, { model: 'flash' }];

          const result = await client.callTool({
            name: 'consensus',
            arguments: {
              prompt: 'What color is grass? Please be concise.',
              models,
              enable_cross_feedback: true,
              temperature: 0.1,
            },
          });

          expect(result.isError).toBeFalsy();

          const consensusResult = parseJsonResponse(result.content[0].text);
          expect(consensusResult.phases.initial).toBeDefined();
          expect(consensusResult.phases.refined).toBeDefined();
          expect(consensusResult.refined_responses).toBeGreaterThan(0);

          logger.info('[multi-provider-test] Cross-feedback test completed');
        });
      },
      180000,
    );
  });

  describe('Mixed Provider Consensus', () => {
    it.skipIf(!hasAnyMainProvider || (!hasAnthropic() && !hasDeepSeek()))(
      'should combine main and new providers',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const models = [];

          // Add main providers
          if (hasOpenAI) models.push({ model: 'gpt-4o-mini' });
          if (hasGoogle) models.push({ model: 'flash' });

          // Add new providers
          if (hasAnthropic()) models.push({ model: 'haiku' });
          if (hasDeepSeek()) models.push({ model: 'deepseek-chat' });

          if (models.length < 2) {
            logger.info(
              '[multi-provider-test] Not enough providers for mixed consensus',
            );
            return;
          }

          const result = await client.callTool({
            name: 'consensus',
            arguments: {
              prompt: 'What is 2 + 2? Answer with just the number.',
              models,
              enable_cross_feedback: false,
              temperature: 0,
            },
          });

          expect(result.isError).toBeFalsy();

          const consensusResult = parseJsonResponse(result.content[0].text);
          expect(consensusResult.models_consulted).toBe(models.length);

          // All models should agree on this simple math
          consensusResult.phases.initial.forEach((response) => {
            if (response.status === 'success') {
              expect(response.response).toContain('4');
            }
          });

          logger.info(
            `[multi-provider-test] Mixed provider consensus completed with ${models.length} providers`,
          );
        });
      },
      150000,
    );
  });

  describe('All Provider Stress Test', () => {
    it('should handle consensus with all available providers', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const models = [];

        // Add all available providers
        if (hasOpenAI) models.push({ model: 'gpt-4o-mini' });
        if (hasXAI) models.push({ model: 'grok' });
        if (hasGoogle) models.push({ model: 'flash' });
        if (hasAnthropic()) models.push({ model: 'haiku' });
        if (hasDeepSeek()) models.push({ model: 'deepseek-chat' });
        if (hasMistral()) models.push({ model: 'mistral-medium' });
        if (hasOpenRouter()) models.push({ model: 'k2' });

        if (models.length < 2) {
          logger.info(
            '[multi-provider-test] Not enough providers for stress test',
          );
          return;
        }

        const result = await client.callTool({
          name: 'consensus',
          arguments: {
            prompt: 'Is water essential for life? Answer "Yes" or "No".',
            models,
            enable_cross_feedback: false, // Disable for speed
            temperature: 0,
          },
        });

        expect(result.isError).toBeFalsy();

        const consensusResult = parseJsonResponse(result.content[0].text);
        expect(consensusResult.models_consulted).toBe(models.length);

        // Count successful responses
        const successCount = consensusResult.phases.initial.filter(
          (r) => r.status === 'success',
        ).length;
        expect(successCount).toBeGreaterThan(0);

        logger.info(
          `[multi-provider-test] All-provider stress test completed with ${models.length} providers, ${successCount} successful`,
        );
      });
    }, 300000); // 5 minute timeout for many providers
  });

  describe('Error Recovery in Consensus', () => {
    testWithApiKeys({
      requiredProviders: ['OPENAI', 'XAI', 'GOOGLE'],
    })(
      'should handle partial provider failures gracefully',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const models = [
            { model: 'gpt-4o-mini' },
            { model: 'nonexistent-model' }, // This should fail
            { model: 'flash' },
          ];

          const result = await client.callTool({
            name: 'consensus',
            arguments: {
              prompt: 'What is 1 + 1?',
              models,
              enable_cross_feedback: false,
              temperature: 0,
            },
          });

          expect(result.isError).toBeFalsy();

          const consensusResult = parseJsonResponse(result.content[0].text);

          // Should still complete with partial success
          expect(consensusResult.status).toBe('consensus_complete');
          expect(consensusResult.successful_initial_responses).toBeGreaterThan(
            0,
          );
          expect(consensusResult.successful_initial_responses).toBeLessThan(
            models.length,
          );

          logger.info(
            '[multi-provider-test] Partial failure recovery test completed',
          );
        });
      },
      120000,
    );
  });
});
