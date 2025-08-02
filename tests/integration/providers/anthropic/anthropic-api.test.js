import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../../src/config.js';
import { logger } from '../../../../src/utils/logger.js';

describe('Anthropic API Integration Tests', () => {
  let config;

  // Dynamic API key checking functions
  const hasAnthropic = () => !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-'));

  beforeAll(async () => {
    try {
      config = await loadConfig();
      if (!hasAnthropic()) {
        logger.warn('[anthropic-api-test] Anthropic API key not found - tests will be skipped');
      } else {
        logger.info('[anthropic-api-test] Running Anthropic API tests');
      }
    } catch (error) {
      logger.error('[anthropic-api-test] Setup failed:', error);
      config = { apiKeys: {} };
    }
  });

  describe('Basic Chat Functionality', () => {
    it.skipIf(!hasAnthropic())('should work with Claude Sonnet 3.5 via HTTP', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is 10 + 5? Reply with just the number.',
            model: 'claude-3.5-sonnet',
            temperature: 0
          }
        });

        expect(result).toBeDefined();
        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toContain('15');

        logger.info('[anthropic-api-test] Claude Sonnet 3.5 test completed');
      });
    }, 60000);

    it.skipIf(!hasAnthropic())('should work with Claude Haiku for fast responses', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Say "Hello World" and nothing else.',
            model: 'haiku',
            temperature: 0
          }
        });

        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toContain('Hello World');

        logger.info('[anthropic-api-test] Claude Haiku test completed');
      });
    }, 60000);

    it.skipIf(!hasAnthropic())('should maintain conversation continuity', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // First message
        const firstResult = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Remember this animal: elephant. Just say "Remembered" to confirm.',
            model: 'claude-3.5-sonnet',
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
            prompt: 'What animal did I ask you to remember?',
            continuation_id: conversationId,
            model: 'claude-3.5-sonnet',
            temperature: 0
          }
        });

        expect(secondResult.isError).toBeFalsy();
        expect(secondResult.content[0].text.toLowerCase()).toContain('elephant');

        logger.info('[anthropic-api-test] Conversation continuity test completed');
      });
    }, 120000);
  });

  describe('Error Handling', () => {
    it.skipIf(!hasAnthropic())('should handle invalid model names gracefully', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Hello',
            model: 'claude-nonexistent'
          }
        });

        expect(result.isError).toBeTruthy();
        expect(result.content[0].text).toMatch(/not_found_error|model.*claude-nonexistent/i);
      });
    });
  });

  describe('Performance', () => {
    it.skipIf(!hasAnthropic())('should complete simple requests within reasonable time', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const startTime = Date.now();

        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Say "OK"',
            model: 'haiku'
          }
        });

        const duration = Date.now() - startTime;

        expect(result.isError).toBeFalsy();
        expect(duration).toBeLessThan(30000); // Should complete within 30 seconds

        logger.info(`[anthropic-api-test] Performance test completed in ${duration}ms`);
      });
    }, 40000);
  });
});
