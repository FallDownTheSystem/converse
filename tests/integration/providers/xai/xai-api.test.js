import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../../src/config.js';
import { logger } from '../../../../src/utils/logger.js';
import { 
  testWithApiKeys, 
  hasXAI,
  getSkipMessage 
} from '../../../utils/conditionalTest.js';

describe('XAI API Integration Tests', () => {
  let config;

  beforeAll(async () => {
    try {
      config = await loadConfig();
      if (!hasXAI) {
        const skipMessage = getSkipMessage(['XAI']);
        logger.warn(`[xai-api-test] ${skipMessage}`);
      } else {
        logger.info(`[xai-api-test] Running XAI API tests`);
      }
    } catch (error) {
      logger.error('[xai-api-test] Setup failed:', error);
      config = { apiKeys: {} };
    }
  });

  describe('Basic Chat Functionality', () => {
    testWithApiKeys({ 
      requiredProviders: ['XAI'],
      requireAll: true
    })('should work with Grok via HTTP', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is 3+3? Answer with just the number.',
            model: 'grok',
            temperature: 0
          }
        });

        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toContain('6');

        logger.info('[xai-api-test] Grok test completed');
      });
    }, 60000);

    testWithApiKeys({ 
      requiredProviders: ['XAI'],
      requireAll: true
    })('should maintain conversation continuity', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // First message
        const firstResult = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Remember this word: banana. Just say "Remembered" to confirm.',
            model: 'grok',
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
            prompt: 'What word did I ask you to remember?',
            continuation_id: conversationId,
            model: 'grok',
            temperature: 0
          }
        });

        expect(secondResult.isError).toBeFalsy();
        expect(secondResult.content[0].text.toLowerCase()).toContain('banana');

        logger.info('[xai-api-test] Conversation continuity test completed');
      });
    }, 120000);
  });

  describe('Error Handling', () => {
    testWithApiKeys({ 
      requiredProviders: ['XAI'],
      requireAll: true
    })('should handle invalid model names gracefully', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Hello',
            model: 'grok-nonexistent'
          }
        });

        expect(result.isError).toBeTruthy();
        expect(result.content[0].text).toMatch(/(model.*not found|Provider error|404)/i);
      });
    });
  });

  describe('Performance', () => {
    testWithApiKeys({ 
      requiredProviders: ['XAI'],
      requireAll: true
    })('should complete simple requests within reasonable time', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const startTime = Date.now();

        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Say "OK"',
            model: 'grok'
          }
        });

        const duration = Date.now() - startTime;

        expect(result.isError).toBeFalsy();
        expect(duration).toBeLessThan(30000); // Should complete within 30 seconds

        logger.info(`[xai-api-test] Performance test completed in ${duration}ms`);
      });
    }, 40000);
  });
});