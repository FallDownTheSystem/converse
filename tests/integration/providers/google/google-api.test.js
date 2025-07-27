import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../../src/config.js';
import { logger } from '../../../../src/utils/logger.js';
import { 
  testWithApiKeys, 
  hasGoogle,
  getSkipMessage 
} from '../../../utils/conditionalTest.js';

describe('Google API Integration Tests', () => {
  let config;

  beforeAll(async () => {
    try {
      config = await loadConfig();
      if (!hasGoogle) {
        const skipMessage = getSkipMessage(['GOOGLE']);
        logger.warn(`[google-api-test] ${skipMessage}`);
      } else {
        logger.info(`[google-api-test] Running Google API tests`);
      }
    } catch (error) {
      logger.error('[google-api-test] Setup failed:', error);
      config = { apiKeys: {} };
    }
  });

  describe('Basic Chat Functionality', () => {
    testWithApiKeys({ 
      requiredProviders: ['GOOGLE'],
      requireAll: true
    })('should work with Gemini Flash via HTTP', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is 5+5? Answer with just the number.',
            model: 'flash',
            temperature: 0
          }
        });

        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toContain('10');

        logger.info('[google-api-test] Gemini Flash test completed');
      });
    }, 60000);

    testWithApiKeys({ 
      requiredProviders: ['GOOGLE'],
      requireAll: true
    })('should maintain conversation continuity', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // First message
        const firstResult = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Remember this color: purple. Just say "Remembered" to confirm.',
            model: 'flash',
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
            prompt: 'What color did I ask you to remember?',
            continuation_id: conversationId,
            model: 'flash',
            temperature: 0
          }
        });

        expect(secondResult.isError).toBeFalsy();
        expect(secondResult.content[0].text.toLowerCase()).toContain('purple');

        logger.info('[google-api-test] Conversation continuity test completed');
      });
    }, 120000);
  });

  describe('Error Handling', () => {
    testWithApiKeys({ 
      requiredProviders: ['GOOGLE'],
      requireAll: true
    })('should handle invalid model names gracefully', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Hello',
            model: 'gemini-nonexistent'
          }
        });

        expect(result.isError).toBeTruthy();
        expect(result.content[0].text).toMatch(/model.*not found/i);
      });
    });
  });

  describe('Performance', () => {
    testWithApiKeys({ 
      requiredProviders: ['GOOGLE'],
      requireAll: true
    })('should complete simple requests within reasonable time', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const startTime = Date.now();

        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Say "OK"',
            model: 'flash'
          }
        });

        const duration = Date.now() - startTime;

        expect(result.isError).toBeFalsy();
        expect(duration).toBeLessThan(30000); // Should complete within 30 seconds

        logger.info(`[google-api-test] Performance test completed in ${duration}ms`);
      });
    }, 40000);
  });
});