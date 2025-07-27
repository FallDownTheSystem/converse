import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../../src/config.js';
import { logger } from '../../../../src/utils/logger.js';

describe('Mistral API Integration Tests', () => {
  let config;

  // Dynamic API key checking functions
  const hasMistral = () => !!(process.env.MISTRAL_API_KEY && process.env.MISTRAL_API_KEY.length > 20);

  beforeAll(async () => {
    try {
      config = await loadConfig();
      if (!hasMistral()) {
        logger.warn('[mistral-api-test] Mistral API key not found - tests will be skipped');
      } else {
        logger.info('[mistral-api-test] Running Mistral API tests');
      }
    } catch (error) {
      logger.error('[mistral-api-test] Setup failed:', error);
      config = { apiKeys: {} };
    }
  });

  describe('Basic Chat Functionality', () => {
    it.skipIf(!hasMistral())('should work with Mistral Medium via HTTP', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is 7 * 8? Reply with just the number.',
            model: 'mistral-medium',
            temperature: 0
          }
        });

        expect(result).toBeDefined();
        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toContain('56');

        logger.info('[mistral-api-test] Mistral Medium test completed');
      });
    }, 60000);

    it.skipIf(!hasMistral())('should work with Magistral Small for fast responses', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Reply with exactly: "Test successful"',
            model: 'magistral-small',
            temperature: 0
          }
        });

        expect(result.isError).toBeFalsy();
        expect(result.content[0].text.toLowerCase()).toContain('test successful');

        logger.info('[mistral-api-test] Magistral Small test completed');
      });
    }, 60000);

    it.skipIf(!hasMistral())('should maintain conversation continuity', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // First message
        const firstResult = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Remember this fruit: apple. Just say "Remembered" to confirm.',
            model: 'mistral-medium',
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
            prompt: 'What fruit did I ask you to remember?',
            continuation_id: conversationId,
            model: 'mistral-medium',
            temperature: 0
          }
        });

        expect(secondResult.isError).toBeFalsy();
        expect(secondResult.content[0].text.toLowerCase()).toContain('apple');

        logger.info('[mistral-api-test] Conversation continuity test completed');
      });
    }, 120000);
  });

  describe('Error Handling', () => {
    it.skipIf(!hasMistral())('should handle invalid model names gracefully', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Hello',
            model: 'mistral-nonexistent'
          }
        });

        expect(result.isError).toBeTruthy();
        expect(result.content[0].text).toMatch(/model.*not found/i);
      });
    });
  });

  describe('Performance', () => {
    it.skipIf(!hasMistral())('should complete simple requests within reasonable time', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const startTime = Date.now();

        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Say "OK"',
            model: 'mistral-medium'
          }
        });

        const duration = Date.now() - startTime;

        expect(result.isError).toBeFalsy();
        expect(duration).toBeLessThan(30000); // Should complete within 30 seconds

        logger.info(`[mistral-api-test] Performance test completed in ${duration}ms`);
      });
    }, 40000);
  });
});
