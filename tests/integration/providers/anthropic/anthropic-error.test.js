import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../../src/config.js';
import { logger } from '../../../../src/utils/logger.js';

describe('Anthropic Error Handling and Edge Cases', () => {
  let config;

  // Dynamic API key checking functions
  const hasAnthropic = () => !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-'));

  beforeAll(async () => {
    try {
      config = await loadConfig();
      if (!hasAnthropic()) {
        logger.warn('[anthropic-error-test] Anthropic API key not found - tests will be skipped');
      } else {
        logger.info('[anthropic-error-test] Running Anthropic error handling tests');
      }
    } catch (error) {
      logger.error('[anthropic-error-test] Setup failed:', error);
      config = { apiKeys: {} };
    }
  });

  describe('Rate Limiting', () => {
    it.skipIf(!hasAnthropic())('should handle rate limiting gracefully', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Make multiple rapid requests
        const promises = Array(3).fill(null).map((_, i) =>
          client.callTool({
            name: 'chat',
            arguments: {
              prompt: `Test request ${i}`,
              model: 'claude-3.5-haiku',
              temperature: 0
            }
          })
        );

        const results = await Promise.allSettled(promises);

        // At least one should succeed
        const successCount = results.filter(r => r.status === 'fulfilled' && !r.value.isError).length;
        expect(successCount).toBeGreaterThan(0);

        logger.info(`[anthropic-error-test] Rate limiting test completed with ${successCount}/3 successful`);
      });
    }, 90000);
  });

  describe('Conversation Continuity Edge Cases', () => {
    it.skipIf(!hasAnthropic())('should handle conversation continuity with multiple models', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // First message with Sonnet
        const firstResult = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Remember this sequence: Alpha, Beta, Gamma. Just acknowledge.',
            model: 'claude-3.5-sonnet',
            temperature: 0
          }
        });

        expect(firstResult.isError).toBeFalsy();
        const conversationId = firstResult.continuation.id;

        // Continue with Haiku
        const secondResult = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What was the second item in the sequence?',
            continuation_id: conversationId,
            model: 'haiku',
            temperature: 0
          }
        });

        expect(secondResult.isError).toBeFalsy();
        expect(secondResult.content[0].text.toLowerCase()).toContain('beta');

        logger.info('[anthropic-error-test] Cross-model conversation continuity test completed');
      });
    }, 90000);
  });
});
