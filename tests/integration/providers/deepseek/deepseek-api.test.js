import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../../src/config.js';
import { logger } from '../../../../src/utils/logger.js';

describe('DeepSeek API Integration Tests', () => {
  let config;

  // Dynamic API key checking functions
  const hasDeepSeek = () => !!(process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.startsWith('sk-'));

  beforeAll(async () => {
    try {
      config = await loadConfig();
      if (!hasDeepSeek()) {
        logger.warn('[deepseek-api-test] DeepSeek API key not found - tests will be skipped');
      } else {
        logger.info('[deepseek-api-test] Running DeepSeek API tests');
      }
    } catch (error) {
      logger.error('[deepseek-api-test] Setup failed:', error);
      config = { apiKeys: {} };
    }
  });

  describe('Basic Chat Functionality', () => {
    it.skipIf(!hasDeepSeek())('should work with DeepSeek Chat via HTTP', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is 20 + 30? Reply with just the number.',
            model: 'deepseek-chat',
            temperature: 0
          }
        });

        expect(result).toBeDefined();
        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toContain('50');

        logger.info('[deepseek-api-test] DeepSeek Chat test completed');
      });
    }, 60000);

    it.skipIf(!hasDeepSeek())('should work with DeepSeek Coder model', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Write a simple Python function that returns "Hello". Just the function, no explanation.',
            model: 'deepseek-coder',
            temperature: 0
          }
        });

        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toContain('def');
        expect(result.content[0].text).toContain('Hello');

        logger.info('[deepseek-api-test] DeepSeek Coder test completed');
      });
    }, 60000);

    it.skipIf(!hasDeepSeek())('should maintain conversation continuity', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // First message
        const firstResult = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Remember this city: Tokyo. Just say "Remembered" to confirm.',
            model: 'deepseek-chat',
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
            prompt: 'What city did I ask you to remember?',
            continuation_id: conversationId,
            model: 'deepseek-chat',
            temperature: 0
          }
        });

        expect(secondResult.isError).toBeFalsy();
        expect(secondResult.content[0].text).toContain('Tokyo');

        logger.info('[deepseek-api-test] Conversation continuity test completed');
      });
    }, 120000);
  });

  describe('Error Handling', () => {
    it.skipIf(!hasDeepSeek())('should handle invalid model names gracefully', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Hello',
            model: 'deepseek-nonexistent'
          }
        });

        expect(result.isError).toBeTruthy();
        expect(result.content[0].text).toMatch(/model.*not found/i);
      });
    });
  });

  describe('Performance', () => {
    it.skipIf(!hasDeepSeek())('should complete simple requests within reasonable time', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const startTime = Date.now();

        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Say "OK"',
            model: 'deepseek-chat'
          }
        });

        const duration = Date.now() - startTime;

        expect(result.isError).toBeFalsy();
        expect(duration).toBeLessThan(30000); // Should complete within 30 seconds

        logger.info(`[deepseek-api-test] Performance test completed in ${duration}ms`);
      });
    }, 40000);
  });
});