import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../../src/config.js';
import { logger } from '../../../../src/utils/logger.js';
import {
  testWithApiKeys,
  hasGoogle,
  getSkipMessage,
} from '../../../utils/conditionalTest.js';

describe('Google Feature-Specific Tests', () => {
  let config;

  beforeAll(async () => {
    try {
      config = await loadConfig();
      if (!hasGoogle) {
        const skipMessage = getSkipMessage(['GOOGLE']);
        logger.warn(`[google-features-test] ${skipMessage}`);
      } else {
        logger.info('[google-features-test] Running Google feature tests');
      }
    } catch (error) {
      logger.error('[google-features-test] Setup failed:', error);
      config = { apiKeys: {} };
    }
  });

  describe('Thinking Mode Features', () => {
    testWithApiKeys({
      requiredProviders: ['GOOGLE'],
      requireAll: true,
    })(
      'should support Google thinking mode',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Think step by step: What is 17 * 23?',
              model: 'gemini-2.5-pro',
              thinking: 'medium',
            },
          });

          expect(result.isError).toBeFalsy();
          expect(result.content[0].text).toBeDefined();

          logger.info('[google-features-test] Thinking mode test completed');
        });
      },
      90000,
    );
  });

  describe('Multi-Model Consensus with Google', () => {
    testWithApiKeys({
      requiredProviders: ['GOOGLE'],
      requireAll: true,
    })(
      'should participate in consensus gathering',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const models = [{ model: 'flash' }, { model: 'gemini-2.5-pro' }];

          const result = await client.callTool({
            name: 'consensus',
            arguments: {
              prompt: 'What color is grass? Answer with one word only.',
              models,
              enable_cross_feedback: false,
              temperature: 0,
            },
          });

          expect(result).toBeDefined();
          expect(result.isError).toBeFalsy();

          const consensusResult = JSON.parse(result.content[0].text);
          expect(consensusResult.status).toBe('consensus_complete');
          expect(consensusResult.models_consulted).toBe(2);
          expect(consensusResult.successful_initial_responses).toBe(2);

          logger.info('[google-features-test] Consensus test completed');
        });
      },
      120000,
    );
  });

  describe('Cross-Provider Consensus', () => {
    testWithApiKeys({
      requiredProviders: ['GOOGLE', 'OPENAI'],
      requireAll: true,
    })(
      'should work in cross-provider consensus with OpenAI',
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

          const consensusResult = JSON.parse(result.content[0].text);
          expect(consensusResult.phases.initial).toBeDefined();
          expect(consensusResult.phases.refined).toBeDefined();
          expect(consensusResult.refined_responses).toBeGreaterThan(0);

          logger.info(
            '[google-features-test] Cross-provider consensus test completed',
          );
        });
      },
      180000,
    );
  });
});
