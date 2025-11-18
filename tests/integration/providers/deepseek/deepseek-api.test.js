import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../../src/config.js';
import { logger } from '../../../../src/utils/logger.js';

describe('DeepSeek API Integration Tests', () => {
  let config;

  // Dynamic API key checking functions
  const hasDeepSeek = () =>
    !!(
      process.env.DEEPSEEK_API_KEY &&
      process.env.DEEPSEEK_API_KEY.startsWith('sk-')
    );

  beforeAll(async () => {
    try {
      config = await loadConfig();
      if (!hasDeepSeek()) {
        logger.warn(
          '[deepseek-api-test] DeepSeek API key not found - tests will be skipped',
        );
      } else {
        logger.info('[deepseek-api-test] Running DeepSeek API tests');
      }
    } catch (error) {
      logger.error('[deepseek-api-test] Setup failed:', error);
      config = { apiKeys: {} };
    }
  });

  describe('Basic Chat Functionality', () => {
    it.skipIf(!hasDeepSeek())(
      'should work with DeepSeek Chat via HTTP',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'What is 20 + 30? Reply with just the number.',
              model: 'deepseek-chat',
              temperature: 0,
            },
          });

          expect(result).toBeDefined();
          expect(result.isError).toBeFalsy();
          expect(result.content[0].text).toContain('50');

          logger.info('[deepseek-api-test] DeepSeek Chat test completed');
        });
      },
      60000,
    );

    it.skipIf(!hasDeepSeek())(
      'should work with DeepSeek Reasoner model',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt:
                'Write a simple Python function that returns "Hello". Just the function, no explanation.',
              model: 'deepseek-reasoner',
              temperature: 0,
            },
          });

          expect(result.isError).toBeFalsy();
          expect(result.content[0].text).toContain('def');
          expect(result.content[0].text).toContain('Hello');

          logger.info('[deepseek-api-test] DeepSeek Reasoner test completed');
        });
      },
      60000,
    );

    it.skipIf(!hasDeepSeek())(
      'should maintain conversation continuity',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          // First message
          const firstResult = await client.callTool({
            name: 'chat',
            arguments: {
              prompt:
                'Remember this city: Tokyo. Just say "Remembered" to confirm.',
              model: 'deepseek-chat',
              temperature: 0,
            },
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
              temperature: 0,
            },
          });

          expect(secondResult.isError).toBeFalsy();
          expect(secondResult.content[0].text).toContain('Tokyo');

          logger.info(
            '[deepseek-api-test] Conversation continuity test completed',
          );
        });
      },
      120000,
    );
  });

  describe('Error Handling', () => {
    it.skipIf(!hasDeepSeek())(
      'should handle invalid model names gracefully',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Hello',
              model: 'deepseek-nonexistent',
            },
          });

          expect(result.isError).toBeTruthy();
          expect(result.content[0].text).toMatch(/model.*not (found|exist)/i);
        });
      },
    );
  });

  describe('Streaming Functionality', () => {
    it.skipIf(!hasDeepSeek())(
      'should support basic streaming with deepseek-chat',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          // Test direct provider streaming (bypasses HTTP MCP for now)
          const { deepseekProvider } = await import(
            '../../../../src/providers/deepseek.js'
          );

          const messages = [
            {
              role: 'user',
              content:
                'Count to 3 using digits like 1, 2, 3. Put each number on its own line.',
            },
          ];
          const streamResult = await deepseekProvider.invoke(messages, {
            config,
            model: 'deepseek-chat',
            stream: true,
            temperature: 0,
          });

          expect(streamResult).toBeDefined();
          expect(typeof streamResult[Symbol.asyncIterator]).toBe('function');

          // Collect streaming events
          const events = [];
          for await (const event of streamResult) {
            events.push(event);
            logger.info(
              `[deepseek-streaming-test] Event: ${event.type}`,
              event.content ? `"${event.content.substring(0, 50)}..."` : '',
            );
          }

          // Verify streaming events
          expect(events.length).toBeGreaterThan(0);

          const startEvent = events.find((e) => e.type === 'start');
          const deltaEvents = events.filter((e) => e.type === 'delta');
          const endEvent = events.find((e) => e.type === 'end');

          expect(startEvent).toBeDefined();
          expect(deltaEvents.length).toBeGreaterThan(0);
          expect(endEvent).toBeDefined();

          // Verify metadata
          expect(startEvent.provider).toBe('deepseek');
          expect(endEvent.metadata.provider).toBe('deepseek');
          expect(endEvent.metadata.usage.total_tokens).toBeGreaterThan(0);

          // Verify content was streamed
          const fullContent = deltaEvents.map((e) => e.content).join('');
          expect(fullContent).toContain('1');
          expect(fullContent.length).toBeGreaterThan(0);

          logger.info(
            '[deepseek-streaming-test] Basic streaming test completed successfully',
          );
        });
      },
      60000,
    );

    it.skipIf(!hasDeepSeek())(
      'should support streaming with deepseek-reasoner',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          // Test direct provider streaming with reasoning model
          const { deepseekProvider } = await import(
            '../../../../src/providers/deepseek.js'
          );

          const messages = [
            {
              role: 'user',
              content: 'What is 13 multiplied by 17? Show your calculation.',
            },
          ];
          const streamResult = await deepseekProvider.invoke(messages, {
            config,
            model: 'deepseek-reasoner',
            stream: true,
            temperature: 0,
          });

          expect(streamResult).toBeDefined();
          expect(typeof streamResult[Symbol.asyncIterator]).toBe('function');

          // Collect streaming events
          const events = [];
          for await (const event of streamResult) {
            events.push(event);
            if (event.type === 'thinking') {
              logger.info(
                `[deepseek-reasoning-test] Thinking: ${event.content.substring(0, 100)}...`,
              );
            } else {
              logger.info(
                `[deepseek-reasoning-test] Event: ${event.type}`,
                event.content ? `"${event.content.substring(0, 50)}..."` : '',
              );
            }
          }

          // Verify streaming events
          expect(events.length).toBeGreaterThan(0);

          const startEvent = events.find((e) => e.type === 'start');
          const deltaEvents = events.filter((e) => e.type === 'delta');
          const thinkingEvents = events.filter((e) => e.type === 'thinking');
          const endEvent = events.find((e) => e.type === 'end');

          expect(startEvent).toBeDefined();
          expect(deltaEvents.length).toBeGreaterThan(0);
          expect(endEvent).toBeDefined();

          // Verify metadata
          expect(startEvent.provider).toBe('deepseek');
          expect(endEvent.metadata.provider).toBe('deepseek');
          expect(endEvent.metadata.usage.total_tokens).toBeGreaterThan(0);

          // Verify content contains the calculation result
          const fullContent = deltaEvents.map((e) => e.content).join('');
          expect(fullContent).toContain('221'); // 13 * 17 = 221

          // For reasoning models, we might have thinking events
          if (thinkingEvents.length > 0) {
            logger.info(
              `[deepseek-reasoning-test] Found ${thinkingEvents.length} thinking events`,
            );
          }

          logger.info(
            '[deepseek-reasoning-test] Reasoning model streaming test completed',
          );
        });
      },
      90000,
    );

    it.skipIf(!hasDeepSeek())(
      'should handle streaming errors gracefully',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const { deepseekProvider } = await import(
            '../../../../src/providers/deepseek.js'
          );

          const messages = [{ role: 'user', content: 'Test error handling' }];

          // Test with invalid model should still work through factory error handling
          try {
            const streamResult = await deepseekProvider.invoke(messages, {
              config,
              model: 'deepseek-nonexistent',
              stream: true,
              temperature: 0,
            });

            // If we get here, collect events to see error handling
            const events = [];
            for await (const event of streamResult) {
              events.push(event);
              if (event.type === 'error') {
                logger.info(
                  `[deepseek-error-test] Error event: ${event.error.message}`,
                );
              }
            }
          } catch (error) {
            // Expected behavior - should throw error for invalid model
            expect(error.message).toMatch(/model.*not (found|exist)/i);
            logger.info(
              '[deepseek-error-test] Error handling test completed as expected',
            );
          }
        });
      },
      30000,
    );
  });

  describe('Performance', () => {
    it.skipIf(!hasDeepSeek())(
      'should complete simple requests within reasonable time',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const startTime = Date.now();

          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Say "OK"',
              model: 'deepseek-chat',
            },
          });

          const duration = Date.now() - startTime;

          expect(result.isError).toBeFalsy();
          expect(duration).toBeLessThan(30000); // Should complete within 30 seconds

          logger.info(
            `[deepseek-api-test] Performance test completed in ${duration}ms`,
          );
        });
      },
      40000,
    );
  });
});
