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
        logger.info('[google-api-test] Running Google API tests');
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

  describe('Streaming Functionality', () => {
    testWithApiKeys({
      requiredProviders: ['GOOGLE'],
      requireAll: true
    })('should support streaming with Gemini Flash', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Test direct provider streaming (bypasses HTTP MCP for now)
        const { googleProvider } = await import('../../../../src/providers/google.js');

        const messages = [{ role: 'user', content: 'Count to 5, one number per sentence.' }];
        const streamResult = await googleProvider.invoke(messages, {
          config,
          model: 'gemini-2.5-flash',
          stream: true,
          temperature: 0
        });

        expect(streamResult).toBeDefined();
        expect(typeof streamResult[Symbol.asyncIterator]).toBe('function');

        // Collect streaming events
        const events = [];
        for await (const event of streamResult) {
          events.push(event);
          logger.info(`[google-streaming-test] Event: ${event.type}`, event.content ? `"${event.content.substring(0, 50)}..."` : '');
        }

        // Verify streaming events
        expect(events.length).toBeGreaterThan(0);

        const startEvent = events.find(e => e.type === 'start');
        const deltaEvents = events.filter(e => e.type === 'delta');
        const completionEvent = events.find(e => e.type === 'completion');

        expect(startEvent).toBeDefined();
        expect(deltaEvents.length).toBeGreaterThan(0);
        expect(completionEvent).toBeDefined();

        // Verify metadata
        expect(startEvent.provider).toBe('google');
        expect(completionEvent.metadata.provider).toBe('google');
        expect(completionEvent.metadata.usage).toBeDefined();
        // Note: Google may not always return usage metadata in streaming mode
        expect(completionEvent.metadata.usage.total_tokens).toBeGreaterThanOrEqual(0);

        // Verify content was streamed
        const fullContent = deltaEvents.map(e => e.content).join('');
        expect(fullContent).toMatch(/One|1/); // Should contain either "One" or "1"
        expect(fullContent.length).toBeGreaterThan(10);

        logger.info('[google-streaming-test] Streaming test completed successfully');
      });
    }, 60000);

    testWithApiKeys({
      requiredProviders: ['GOOGLE'],
      requireAll: true
    })('should support streaming with thinking mode (Gemini Pro)', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Test thinking mode streaming
        const { googleProvider } = await import('../../../../src/providers/google.js');

        const messages = [{ role: 'user', content: 'Solve: What is 17 * 23? Show your reasoning step by step.' }];
        const streamResult = await googleProvider.invoke(messages, {
          config,
          model: 'gemini-2.5-pro',
          stream: true,
          reasoning_effort: 'medium',
          temperature: 0
        });

        expect(streamResult).toBeDefined();
        expect(typeof streamResult[Symbol.asyncIterator]).toBe('function');

        // Collect streaming events
        const events = [];
        for await (const event of streamResult) {
          events.push(event);
          if (event.type === 'delta' && event.content) {
            logger.info(`[google-thinking-test] Delta: "${event.content.substring(0, 100)}..."`);
          }
        }

        // Verify streaming worked
        expect(events.length).toBeGreaterThan(0);

        const completionEvent = events.find(e => e.type === 'completion');
        expect(completionEvent).toBeDefined();
        expect(completionEvent.metadata.thinking_mode_enabled).toBe(true);
        expect(completionEvent.metadata.reasoning_effort).toBe('medium');

        // Verify the math was solved
        const fullContent = events.filter(e => e.type === 'delta').map(e => e.content).join('');
        expect(fullContent).toContain('391'); // 17 * 23 = 391

        logger.info('[google-thinking-test] Thinking mode streaming test completed');
      });
    }, 90000);

    testWithApiKeys({
      requiredProviders: ['GOOGLE'],
      requireAll: true
    })('should support streaming with web search grounding', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Test web search grounding in streaming
        const { googleProvider } = await import('../../../../src/providers/google.js');

        const messages = [{ role: 'user', content: 'What is the current weather in Tokyo?' }];
        const streamResult = await googleProvider.invoke(messages, {
          config,
          model: 'gemini-2.5-flash',
          stream: true,
          use_websearch: true,
          temperature: 0
        });

        expect(streamResult).toBeDefined();
        expect(typeof streamResult[Symbol.asyncIterator]).toBe('function');

        // Collect streaming events
        const events = [];
        for await (const event of streamResult) {
          events.push(event);
        }

        // Verify streaming worked with grounding
        expect(events.length).toBeGreaterThan(0);

        const startEvent = events.find(e => e.type === 'start');
        const completionEvent = events.find(e => e.type === 'completion');

        expect(startEvent).toBeDefined();
        expect(startEvent.web_search).toBe(true);

        expect(completionEvent).toBeDefined();
        expect(completionEvent.metadata.web_search_used).toBe(true);

        // Should have grounding metadata if search was used
        if (completionEvent.metadata.grounding_metadata) {
          expect(completionEvent.metadata.grounding_metadata).toBeDefined();
        }

        logger.info('[google-grounding-test] Web search grounding streaming test completed');
      });
    }, 90000);
  });
});
