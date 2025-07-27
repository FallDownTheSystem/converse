import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../../src/config.js';
import { logger } from '../../../../src/utils/logger.js';

describe('OpenRouter API Integration Tests', () => {
  let config;

  // Dynamic API key checking functions
  const hasOpenRouter = () => !!(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.startsWith('sk-or-') && process.env.OPENROUTER_REFERER);

  beforeAll(async () => {
    try {
      config = await loadConfig();
      if (!hasOpenRouter()) {
        logger.warn('[openrouter-api-test] OpenRouter API key or referer not found - tests will be skipped');
      } else {
        logger.info('[openrouter-api-test] Running OpenRouter API tests');
      }
    } catch (error) {
      logger.error('[openrouter-api-test] Setup failed:', error);
      config = { apiKeys: {} };
    }
  });

  describe('Basic Chat Functionality', () => {
    it.skipIf(!hasOpenRouter())('should work with Kimi K2 model via HTTP', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is 100 divided by 4? Reply with just the number.',
            model: 'k2',
            temperature: 0
          }
        });

        expect(result).toBeDefined();
        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toContain('25');

        logger.info('[openrouter-api-test] Kimi K2 test completed');
      });
    }, 60000);

    it.skipIf(!hasOpenRouter())('should work with Qwen Coder model', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Write "console.log(42)" in JavaScript. Just the code, no explanation.',
            model: 'qwen-coder',
            temperature: 0
          }
        });

        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toContain('console.log(42)');

        logger.info('[openrouter-api-test] Qwen Coder test completed');
      });
    }, 60000);

    it.skipIf(!hasOpenRouter())('should maintain conversation continuity', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // First message
        const firstResult = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Remember this planet: Mars. Just say "Remembered" to confirm.',
            model: 'k2',
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
            prompt: 'What planet did I ask you to remember?',
            continuation_id: conversationId,
            model: 'k2',
            temperature: 0
          }
        });

        expect(secondResult.isError).toBeFalsy();
        expect(secondResult.content[0].text).toContain('Mars');

        logger.info('[openrouter-api-test] Conversation continuity test completed');
      });
    }, 120000);
  });

  describe('Error Handling', () => {
    it.skipIf(!hasOpenRouter())('should handle invalid model names gracefully', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Hello',
            model: 'nonexistent-model-xyz'
          }
        });

        expect(result.isError).toBeTruthy();
        expect(result.content[0].text).toMatch(/model.*not found/i);
      });
    });
  });

  describe('Performance', () => {
    it.skipIf(!hasOpenRouter())('should complete simple requests within reasonable time', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const startTime = Date.now();

        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Say "OK"',
            model: 'k2'
          }
        });

        const duration = Date.now() - startTime;

        expect(result.isError).toBeFalsy();
        expect(duration).toBeLessThan(30000); // Should complete within 30 seconds

        logger.info(`[openrouter-api-test] Performance test completed in ${duration}ms`);
      });
    }, 40000);
  });
});
