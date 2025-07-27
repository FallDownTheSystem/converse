import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../../src/config.js';
import { logger } from '../../../../src/utils/logger.js';
import {
  testWithApiKeys,
  hasOpenAI,
  getSkipMessage
} from '../../../utils/conditionalTest.js';

describe('OpenAI API Integration Tests', () => {
  let config;

  beforeAll(async () => {
    try {
      config = await loadConfig();
      if (!hasOpenAI) {
        const skipMessage = getSkipMessage(['OPENAI']);
        logger.warn(`[openai-api-test] ${skipMessage}`);
      } else {
        logger.info('[openai-api-test] Running OpenAI API tests');
      }
    } catch (error) {
      logger.error('[openai-api-test] Setup failed:', error);
      config = { apiKeys: {} };
    }
  });

  describe('Basic Chat Functionality', () => {
    testWithApiKeys({
      requiredProviders: ['OPENAI'],
      requireAll: true
    })('should work with GPT-4o-mini via HTTP', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is 2+2? Answer with just the number.',
            model: 'gpt-4o-mini',
            temperature: 0
          }
        });

        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toContain('4');

        logger.info('[openai-api-test] GPT-4o-mini test completed');
      });
    }, 60000);

    testWithApiKeys({
      requiredProviders: ['OPENAI'],
      requireAll: true
    })('should maintain conversation continuity', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // First message
        const firstResult = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Remember this number: 42. Just say "Remembered" to confirm.',
            model: 'gpt-4o-mini',
            temperature: 0
          }
        });

        expect(firstResult.isError).toBeFalsy();
        const conversationId = firstResult.continuation.id;
        expect(conversationId).toBeDefined();

        // Second message using continuation
        const secondResult = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What number did I ask you to remember?',
            continuation_id: conversationId,
            model: 'gpt-4o-mini',
            temperature: 0
          }
        });

        expect(secondResult.isError).toBeFalsy();
        expect(secondResult.content[0].text).toContain('42');

        logger.info('[openai-api-test] Conversation continuity test completed');
      });
    }, 120000);
  });

  describe('Error Handling', () => {
    testWithApiKeys({
      requiredProviders: ['OPENAI'],
      requireAll: true
    })('should handle invalid model names gracefully', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Hello',
            model: 'gpt-nonexistent-model'
          }
        });

        expect(result.isError).toBeTruthy();
        expect(result.content[0].text).toMatch(/model.*not found/i);
      });
    });
  });

  describe('Performance', () => {
    testWithApiKeys({
      requiredProviders: ['OPENAI'],
      requireAll: true
    })('should complete simple requests within reasonable time', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const startTime = Date.now();

        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Say "OK"',
            model: 'gpt-4o-mini'
          }
        });

        const duration = Date.now() - startTime;

        expect(result.isError).toBeFalsy();
        expect(duration).toBeLessThan(30000); // Should complete within 30 seconds

        logger.info(`[openai-api-test] Performance test completed in ${duration}ms`);
      });
    }, 40000);
  });
});
