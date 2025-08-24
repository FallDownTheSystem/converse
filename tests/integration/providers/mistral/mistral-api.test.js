import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../../src/config.js';
import { logger } from '../../../../src/utils/logger.js';
import {
  testWithApiKeys,
  getSkipMessage
} from '../../../utils/conditionalTest.js';

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

  describe('Streaming Functionality', () => {
    testWithApiKeys({
      requiredProviders: ['MISTRAL'],
      requireAll: true
    })('should support streaming with Magistral Medium', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Test direct provider streaming (bypasses HTTP MCP for now)
        const { mistralProvider } = await import('../../../../src/providers/mistral.js');

        const messages = [{ role: 'user', content: 'Count to 3 using digits like 1, 2, 3. Put each number on its own line.' }];
        const streamResult = await mistralProvider.invoke(messages, {
          config,
          model: 'magistral-small',  // Use small model to avoid verbose thinking
          stream: true,
          temperature: 0,
          maxTokens: 50  // Very short limit
        });

        expect(streamResult).toBeDefined();
        expect(typeof streamResult[Symbol.asyncIterator]).toBe('function');

        // Collect streaming events with safety timeout
        const events = [];
        let eventCount = 0;
        for await (const event of streamResult) {
          events.push(event);
          eventCount++;
          logger.info(`[mistral-streaming-test] Event: ${event.type}`, event.content ? `"${event.content.substring(0, 50)}..."` : '');

          // Safety mechanism to prevent infinite loops
          if (eventCount > 200 || event.type === 'end') {
            break;
          }
        }

        // Verify streaming events
        expect(events.length).toBeGreaterThan(0);

        const startEvent = events.find(e => e.type === 'start');
        const deltaEvents = events.filter(e => e.type === 'delta');
        const endEvent = events.find(e => e.type === 'end');

        expect(startEvent).toBeDefined();
        expect(startEvent.model).toBe('magistral-small-2506');
        expect(startEvent.provider).toBe('mistral');

        expect(deltaEvents.length).toBeGreaterThan(0);

        expect(endEvent).toBeDefined();
        expect(endEvent.metadata.provider).toBe('mistral');
        expect(endEvent.metadata.model).toBe('magistral-small-2506');

        // Verify full content contains expected numbers
        const fullContent = endEvent.content;
        expect(fullContent).toContain('1');
        expect(fullContent).toContain('2');
        expect(fullContent).toContain('3');
        expect(fullContent.length).toBeGreaterThan(5);

        logger.info('[mistral-streaming-test] Streaming test completed successfully');
      });
    }, 60000);

    testWithApiKeys({
      requiredProviders: ['MISTRAL'],
      requireAll: true
    })('should support streaming with Magistral Small for fast responses', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Test fast model streaming
        const { mistralProvider } = await import('../../../../src/providers/mistral.js');

        const messages = [{ role: 'user', content: 'What is 5 + 7? Answer briefly with just the number.' }];
        const streamResult = await mistralProvider.invoke(messages, {
          config,
          model: 'magistral-small',
          stream: true,
          temperature: 0,
          maxTokens: 150  // More tokens to include the full answer
        });

        expect(streamResult).toBeDefined();
        expect(typeof streamResult[Symbol.asyncIterator]).toBe('function');

        // Collect streaming events with safety timeout
        const events = [];
        let eventCount = 0;
        for await (const event of streamResult) {
          events.push(event);
          eventCount++;
          if (event.type === 'delta' && event.content) {
            logger.info(`[mistral-small-streaming-test] Delta: "${event.content.substring(0, 100)}..."`);
          }

          // Safety mechanism to prevent infinite loops
          if (eventCount > 200 || event.type === 'end') {
            break;
          }
        }

        // Verify streaming worked
        expect(events.length).toBeGreaterThan(0);

        const endEvent = events.find(e => e.type === 'end');
        expect(endEvent).toBeDefined();

        const fullContent = endEvent.content;
        expect(fullContent).toContain('12'); // 5 + 7 = 12

        logger.info('[mistral-small-streaming-test] Small model streaming test completed');
      });
    }, 60000);

    testWithApiKeys({
      requiredProviders: ['MISTRAL'],
      requireAll: true
    })('should support streaming with Mistral Medium multimodal model', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Test multimodal model streaming
        const { mistralProvider } = await import('../../../../src/providers/mistral.js');

        const messages = [{ role: 'user', content: 'Write a short 2-line poem about programming.' }];
        const streamResult = await mistralProvider.invoke(messages, {
          config,
          model: 'mistral-medium',
          stream: true,
          temperature: 0.3, // Slightly higher temperature for creative output
          maxTokens: 75  // Short poem limit
        });

        expect(streamResult).toBeDefined();
        expect(typeof streamResult[Symbol.asyncIterator]).toBe('function');

        // Collect streaming events with safety timeout
        const events = [];
        let eventCount = 0;
        for await (const event of streamResult) {
          events.push(event);
          eventCount++;

          // Safety mechanism to prevent infinite loops
          if (eventCount > 300 || event.type === 'end') {
            break;
          }
        }

        // Verify streaming worked
        expect(events.length).toBeGreaterThan(0);

        const startEvent = events.find(e => e.type === 'start');
        const endEvent = events.find(e => e.type === 'end');

        expect(startEvent).toBeDefined();
        expect(startEvent.provider).toBe('mistral');

        expect(endEvent).toBeDefined();
        expect(endEvent.metadata.model).toBe('mistral-medium-2505');

        const fullContent = endEvent.content;
        expect(fullContent.length).toBeGreaterThan(10); // Should be a meaningful poem

        logger.info('[mistral-medium-streaming-test] Multimodal model streaming test completed');
      });
    }, 90000);
  });
});
