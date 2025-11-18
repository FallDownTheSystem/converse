import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../../src/config.js';
import { logger } from '../../../../src/utils/logger.js';
import {
  testWithApiKeys,
  hasOpenAI,
  getSkipMessage,
} from '../../../utils/conditionalTest.js';

describe('OpenAI API Integration Tests', () => {
  let config;

  beforeAll(async () => {
    try {
      config = await loadConfig();
      if (!hasOpenAI) {
        const skipMessage = getSkipMessage(['OPENAI']);
        logger.warn(`[openai-api-test] ${skipMessage}`);
      } else {
        logger.info('[openai-api-test] Running OpenAI API tests');
      }
    } catch (error) {
      logger.error('[openai-api-test] Setup failed:', error);
      config = { apiKeys: {} };
    }
  });

  describe('Basic Chat Functionality', () => {
    testWithApiKeys({
      requiredProviders: ['OPENAI'],
      requireAll: true,
    })(
      'should work with GPT-4o-mini via HTTP',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'What is 2+2? Answer with just the number.',
              model: 'gpt-4o-mini',
              temperature: 0,
            },
          });

          expect(result.isError).toBeFalsy();
          expect(result.content[0].text).toContain('4');

          logger.info('[openai-api-test] GPT-4o-mini test completed');
        });
      },
      60000,
    );

    testWithApiKeys({
      requiredProviders: ['OPENAI'],
      requireAll: true,
    })(
      'should work with GPT-5 model',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'What is 10 divided by 2? Answer with just the number.',
              model: 'gpt-5',
              // Note: GPT-5 doesn't support temperature parameter
            },
          });

          // If GPT-5 is not available yet (just released), skip the test
          if (
            result.isError &&
            result.error?.message?.includes('Model gpt-5 not found')
          ) {
            console.log(
              '[GPT-5 Test] Model not available yet - OpenAI may still be rolling it out',
            );
            return; // Skip test gracefully
          }

          // Log other error details if the call failed
          if (result.isError) {
            console.log(
              '[GPT-5 Test] Error details:',
              JSON.stringify(result, null, 2),
            );
          }

          expect(result.isError).toBeFalsy();
          expect(result.content[0].text).toContain('5');

          logger.info('[openai-api-test] GPT-5 test completed');
        });
      },
      60000,
    );

    testWithApiKeys({
      requiredProviders: ['OPENAI'],
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
                'Remember this number: 42. Just say "Remembered" to confirm.',
              model: 'gpt-4o-mini',
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
              prompt: 'What number did I ask you to remember?',
              continuation_id: conversationId,
              model: 'gpt-4o-mini',
              temperature: 0,
            },
          });

          expect(secondResult.isError).toBeFalsy();
          expect(secondResult.content[0].text).toContain('42');

          logger.info(
            '[openai-api-test] Conversation continuity test completed',
          );
        });
      },
      120000,
    );
  });

  describe('Error Handling', () => {
    testWithApiKeys({
      requiredProviders: ['OPENAI'],
      requireAll: true,
    })('should handle invalid model names gracefully', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Hello',
            model: 'gpt-nonexistent-model',
          },
        });

        expect(result.isError).toBeTruthy();
        expect(result.content[0].text).toMatch(/model.*not found/i);
      });
    });
  });

  describe('Performance', () => {
    testWithApiKeys({
      requiredProviders: ['OPENAI'],
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
              model: 'gpt-4o-mini',
            },
          });

          const duration = Date.now() - startTime;

          expect(result.isError).toBeFalsy();
          expect(duration).toBeLessThan(30000); // Should complete within 30 seconds

          logger.info(
            `[openai-api-test] Performance test completed in ${duration}ms`,
          );
        });
      },
      40000,
    );
  });

  describe('Streaming Functionality', () => {
    testWithApiKeys({
      requiredProviders: ['OPENAI'],
      requireAll: true,
    })(
      'should support streaming with GPT-4o-mini',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          // Test direct provider streaming (bypasses HTTP MCP for now)
          const { openaiProvider } = await import(
            '../../../../src/providers/openai.js'
          );

          const messages = [
            {
              role: 'user',
              content:
                'Count to 3 using digits like 1, 2, 3. Put each number on its own line.',
            },
          ];
          const streamResult = await openaiProvider.invoke(messages, {
            config,
            model: 'gpt-4o-mini',
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
              `[openai-streaming-test] Event: ${event.type}`,
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
          expect(startEvent.provider).toBe('openai');
          expect(endEvent.metadata.provider).toBe('openai');
          expect(endEvent.metadata.usage.total_tokens).toBeGreaterThan(0);

          // Verify content was streamed
          const fullContent = deltaEvents.map((e) => e.content).join('');
          expect(fullContent).toContain('1');
          expect(fullContent.length).toBeGreaterThan(5);

          logger.info(
            '[openai-streaming-test] Streaming test completed successfully',
          );
        });
      },
      60000,
    );

    testWithApiKeys({
      requiredProviders: ['OPENAI'],
      requireAll: true,
    })(
      'should support streaming with reasoning models (o4-mini)',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          // Test reasoning model streaming
          const { openaiProvider } = await import(
            '../../../../src/providers/openai.js'
          );

          const messages = [
            {
              role: 'user',
              content: 'What is 13 * 17? Show your calculation.',
            },
          ];
          const streamResult = await openaiProvider.invoke(messages, {
            config,
            model: 'o4-mini',
            stream: true,
            reasoning_effort: 'medium',
            temperature: 0,
          });

          expect(streamResult).toBeDefined();
          expect(typeof streamResult[Symbol.asyncIterator]).toBe('function');

          // Collect streaming events
          const events = [];
          for await (const event of streamResult) {
            events.push(event);
            if (event.type === 'delta' && event.content) {
              logger.info(
                `[openai-reasoning-test] Delta: "${event.content.substring(0, 100)}..."`,
              );
            }
          }

          // Verify streaming worked
          expect(events.length).toBeGreaterThan(0);

          const endEvent = events.find((e) => e.type === 'end');
          expect(endEvent).toBeDefined();

          // Verify the math was solved
          const fullContent = events
            .filter((e) => e.type === 'delta')
            .map((e) => e.content)
            .join('');
          expect(fullContent).toContain('221'); // 13 * 17 = 221

          logger.info(
            '[openai-reasoning-test] Reasoning model streaming test completed',
          );
        });
      },
      90000,
    );

    testWithApiKeys({
      requiredProviders: ['OPENAI'],
      requireAll: true,
    })(
      'should support streaming with web search (GPT-5)',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          // Test web search in streaming (only works with newer models)
          const { openaiProvider } = await import(
            '../../../../src/providers/openai.js'
          );

          const messages = [
            {
              role: 'user',
              content: 'What is the current stock price of AAPL?',
            },
          ];
          const streamResult = await openaiProvider.invoke(messages, {
            config,
            model: 'gpt-5',
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
          }

          // Verify streaming worked with web search
          expect(events.length).toBeGreaterThan(0);

          const startEvent = events.find((e) => e.type === 'start');
          const endEvent = events.find((e) => e.type === 'end');

          expect(startEvent).toBeDefined();
          expect(endEvent).toBeDefined();
          expect(endEvent.metadata.web_search_used).toBe(true);

          logger.info(
            '[openai-websearch-test] Web search streaming test completed',
          );
        });
      },
      120000,
    ); // Longer timeout for web search
  });
});
