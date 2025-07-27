import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../../src/config.js';
import { logger } from '../../../../src/utils/logger.js';
import {
  testWithApiKeys,
  hasXAI,
  hasOpenAI,
  hasGoogle,
  getSkipMessage
} from '../../../utils/conditionalTest.js';

describe('XAI Feature-Specific Tests', () => {
  let config;

  beforeAll(async () => {
    try {
      config = await loadConfig();
      if (!hasXAI) {
        const skipMessage = getSkipMessage(['XAI']);
        logger.warn(`[xai-features-test] ${skipMessage}`);
      } else {
        logger.info('[xai-features-test] Running XAI feature tests');
      }
    } catch (error) {
      logger.error('[xai-features-test] Setup failed:', error);
      config = { apiKeys: {} };
    }
  });

  describe('Web Search Features', () => {
    testWithApiKeys({
      requiredProviders: ['XAI'],
      requireAll: true
    })('should support web search when enabled', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What are the latest developments in AI as of 2024?',
            model: 'grok',
            use_websearch: true,
            temperature: 0.5
          }
        });

        // Web search should work with XAI
        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toBeDefined();

        logger.info('[xai-features-test] Web search test completed');
      });
    }, 90000);
  });

  describe('Multi-Model Consensus with XAI', () => {
    testWithApiKeys({
      requiredProviders: ['XAI'],
      requireAll: true
    })('should participate in consensus gathering', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const models = [
          { model: 'grok' },
          { model: 'grok-4' }
        ];

        const result = await client.callTool({
          name: 'consensus',
          arguments: {
            prompt: 'Is water wet? Answer with "Yes" or "No" only.',
            models,
            enable_cross_feedback: false,
            temperature: 0
          }
        });

        expect(result).toBeDefined();
        expect(result.isError).toBeFalsy();

        const consensusResult = JSON.parse(result.content[0].text);
        expect(consensusResult.status).toBe('consensus_complete');
        expect(consensusResult.models_consulted).toBe(2);

        logger.info('[xai-features-test] Consensus test completed');
      });
    }, 120000);
  });

  describe('Multi-Provider Consensus', () => {
    testWithApiKeys({
      requiredProviders: ['XAI', 'OPENAI', 'GOOGLE']
    })('should work in multi-provider consensus', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const models = [];
        if (hasXAI) models.push({ model: 'grok' });
        if (hasOpenAI) models.push({ model: 'gpt-4o-mini' });
        if (hasGoogle) models.push({ model: 'flash' });

        if (models.length < 2) {
          logger.info('[xai-features-test] Skipping multi-provider test - not enough providers');
          return;
        }

        const result = await client.callTool({
          name: 'consensus',
          arguments: {
            prompt: 'Is the sky blue? Answer with "Yes" or "No" only.',
            models,
            enable_cross_feedback: false,
            temperature: 0
          }
        });

        expect(result).toBeDefined();
        expect(result.isError).toBeFalsy();

        const consensusResult = JSON.parse(result.content[0].text);
        expect(consensusResult.status).toBe('consensus_complete');
        expect(consensusResult.models_consulted).toBe(models.length);
        expect(consensusResult.successful_initial_responses).toBeGreaterThan(0);

        logger.info(`[xai-features-test] Multi-provider consensus test completed with ${models.length} providers`);
      });
    }, 120000);
  });
});
