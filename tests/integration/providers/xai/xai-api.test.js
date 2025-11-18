import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../../src/config.js';
import { logger } from '../../../../src/utils/logger.js';
import {
  testWithApiKeys,
  hasXAI,
  getSkipMessage,
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
        logger.info('[xai-api-test] Running XAI API tests');
      }
    } catch (error) {
      logger.error('[xai-api-test] Setup failed:', error);
      config = { apiKeys: {} };
    }
  });

  describe('Basic Chat Functionality', () => {
    testWithApiKeys({
      requiredProviders: ['XAI'],
      requireAll: true,
    })(
      'should work with Grok via HTTP',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'What is 3+3? Answer with just the number.',
              model: 'grok',
              temperature: 0,
            },
          });

          expect(result.isError).toBeFalsy();
          expect(result.content[0].text).toContain('6');

          logger.info('[xai-api-test] Grok test completed');
        });
      },
      60000,
    );

    testWithApiKeys({
      requiredProviders: ['XAI'],
      requireAll: true,
    })(
      'should maintain conversation continuity',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          // First message
          const firstResult = await client.callTool({
            name: 'chat',
            arguments: {
              prompt:
                'Remember this word: banana. Just say "Remembered" to confirm.',
              model: 'grok',
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
              prompt: 'What word did I ask you to remember?',
              continuation_id: conversationId,
              model: 'grok',
              temperature: 0,
            },
          });

          expect(secondResult.isError).toBeFalsy();
          expect(secondResult.content[0].text.toLowerCase()).toContain(
            'banana',
          );

          logger.info('[xai-api-test] Conversation continuity test completed');
        });
      },
      120000,
    );
  });

  describe('Error Handling', () => {
    testWithApiKeys({
      requiredProviders: ['XAI'],
      requireAll: true,
    })('should handle invalid model names gracefully', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Hello',
            model: 'grok-nonexistent',
          },
        });

        expect(result.isError).toBeTruthy();
        expect(result.content[0].text).toMatch(
          /(model.*not found|Provider error|404)/i,
        );
      });
    });
  });

  describe('Performance', () => {
    testWithApiKeys({
      requiredProviders: ['XAI'],
      requireAll: true,
    })(
      'should complete simple requests within reasonable time',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const startTime = Date.now();

          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Say "OK"',
              model: 'grok',
            },
          });

          const duration = Date.now() - startTime;

          expect(result.isError).toBeFalsy();
          expect(duration).toBeLessThan(30000); // Should complete within 30 seconds

          logger.info(
            `[xai-api-test] Performance test completed in ${duration}ms`,
          );
        });
      },
      40000,
    );
  });

  describe('Streaming Functionality', () => {
    testWithApiKeys({
      requiredProviders: ['XAI'],
      requireAll: true,
    })(
      'should support streaming with Grok-4',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          // Test direct provider streaming (bypasses HTTP MCP for now)
          const { xaiProvider } = await import(
            '../../../../src/providers/xai.js'
          );

          const messages = [
            {
              role: 'user',
              content:
                'Count to 3 using digits like 1, 2, 3. Put each number on its own line.',
            },
          ];
          const streamResult = await xaiProvider.invoke(messages, {
            config,
            model: 'grok-4-0709',
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
              `[xai-streaming-test] Event: ${event.type}`,
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
          expect(startEvent.provider).toBe('xai');
          expect(endEvent.metadata.provider).toBe('xai');
          expect(endEvent.metadata.usage.total_tokens).toBeGreaterThan(0);

          // Verify content was streamed
          const fullContent = deltaEvents.map((e) => e.content).join('');
          expect(fullContent).toContain('1');
          expect(fullContent.length).toBeGreaterThan(3);

          logger.info(
            '[xai-streaming-test] Streaming test completed successfully',
          );
        });
      },
      60000,
    );

    testWithApiKeys({
      requiredProviders: ['XAI'],
      requireAll: true,
    })(
      'should support streaming with live search (Grok-4)',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          // Test live search streaming
          const { xaiProvider } = await import(
            '../../../../src/providers/xai.js'
          );

          const messages = [
            {
              role: 'user',
              content: 'What is the current stock price of Tesla (TSLA)?',
            },
          ];
          const streamResult = await xaiProvider.invoke(messages, {
            config,
            model: 'grok-4-0709',
            stream: true,
            use_websearch: true,
            temperature: 0,
          });

          expect(streamResult).toBeDefined();
          expect(typeof streamResult[Symbol.asyncIterator]).toBe('function');

          // Collect streaming events
          const events = [];
          for await (const event of streamResult) {
            events.push(event);
            if (event.type === 'usage' && event.usage.search_sources_used) {
              logger.info(
                `[xai-search-test] Search sources used: ${event.usage.search_sources_used}, cost: $${event.usage.search_cost_estimate}`,
              );
            }
          }

          // Verify streaming worked with search
          expect(events.length).toBeGreaterThan(0);

          const startEvent = events.find((e) => e.type === 'start');
          const endEvent = events.find((e) => e.type === 'end');

          expect(startEvent).toBeDefined();
          expect(endEvent).toBeDefined();
          expect(endEvent.metadata.web_search_used).toBe(true);

          // Should have search-related metadata if search was actually used
          const usageEvent = events.find((e) => e.type === 'usage');
          if (usageEvent && usageEvent.usage.search_sources_used > 0) {
            expect(usageEvent.usage.search_cost_estimate).toBeGreaterThan(0);
            expect(endEvent.metadata.search_sources_used).toBeGreaterThan(0);
            expect(endEvent.metadata.search_cost_estimate).toBeGreaterThan(0);
          }

          logger.info('[xai-search-test] Live search streaming test completed');
        });
      },
      120000,
    ); // Longer timeout for web search

    testWithApiKeys({
      requiredProviders: ['XAI'],
      requireAll: true,
    })(
      'should support streaming with all Grok models',
      async () => {
        const models = ['grok-4-0709', 'grok-3', 'grok-3-fast'];

        for (const model of models) {
          await withHTTPTestServer(async (client, manager) => {
            // Test streaming with each Grok model
            const { xaiProvider } = await import(
              '../../../../src/providers/xai.js'
            );

            const messages = [{ role: 'user', content: 'What is 5 + 3?' }];
            const streamResult = await xaiProvider.invoke(messages, {
              config,
              model,
              stream: true,
              temperature: 0,
            });

            expect(streamResult).toBeDefined();
            expect(typeof streamResult[Symbol.asyncIterator]).toBe('function');

            // Collect streaming events
            const events = [];
            for await (const event of streamResult) {
              events.push(event);
            }

            // Verify streaming worked
            expect(events.length).toBeGreaterThan(0);

            const startEvent = events.find((e) => e.type === 'start');
            const deltaEvents = events.filter((e) => e.type === 'delta');
            const endEvent = events.find((e) => e.type === 'end');

            expect(startEvent).toBeDefined();
            expect(startEvent.model).toBe(model);
            expect(deltaEvents.length).toBeGreaterThan(0);
            expect(endEvent).toBeDefined();

            // Verify the math was solved
            const fullContent = deltaEvents.map((e) => e.content).join('');
            expect(fullContent).toMatch(/8|eight/i);

            logger.info(`[xai-model-test] ${model} streaming test completed`);
          });
        }
      },
      180000,
    ); // 3 minutes for all models

    testWithApiKeys({
      requiredProviders: ['XAI'],
      requireAll: true,
    })(
      'should handle streaming errors gracefully',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          // Test streaming with invalid model to trigger error handling
          const { xaiProvider } = await import(
            '../../../../src/providers/xai.js'
          );

          const messages = [{ role: 'user', content: 'Hello' }];

          try {
            const streamResult = await xaiProvider.invoke(messages, {
              config,
              model: 'invalid-grok-model',
              stream: true,
              temperature: 0,
            });

            // Should still return a generator even if it will error
            expect(streamResult).toBeDefined();
            expect(typeof streamResult[Symbol.asyncIterator]).toBe('function');

            // Collect events until error
            const events = [];
            let errorThrown = false;

            try {
              for await (const event of streamResult) {
                events.push(event);
                if (event.type === 'error') {
                  errorThrown = true;
                  expect(event.error.code).toBeDefined();
                  break;
                }
              }
            } catch (error) {
              // Error might be thrown from the generator
              errorThrown = true;
              expect(error.name).toBe('XAIProviderError');
            }

            expect(errorThrown).toBe(true);
            logger.info(
              '[xai-error-test] Error handling streaming test completed',
            );
          } catch (error) {
            // Direct error from invoke call is also acceptable
            expect(error.name).toBe('XAIProviderError');
            logger.info(
              '[xai-error-test] Direct error handling test completed',
            );
          }
        });
      },
      60000,
    );
  });
});
