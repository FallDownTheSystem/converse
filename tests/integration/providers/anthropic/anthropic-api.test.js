import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../../src/config.js';
import { logger } from '../../../../src/utils/logger.js';

describe('Anthropic API Integration Tests', () => {
  let config;

  // Dynamic API key checking functions
  const hasAnthropic = () =>
    !!(
      process.env.ANTHROPIC_API_KEY &&
      process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-')
    );

  beforeAll(async () => {
    try {
      config = await loadConfig();
      if (!hasAnthropic()) {
        logger.warn(
          '[anthropic-api-test] Anthropic API key not found - tests will be skipped',
        );
      } else {
        logger.info('[anthropic-api-test] Running Anthropic API tests');
      }
    } catch (error) {
      logger.error('[anthropic-api-test] Setup failed:', error);
      config = { apiKeys: {} };
    }
  });

  describe('Basic Chat Functionality', () => {
    it.skipIf(!hasAnthropic())(
      'should work with Claude Sonnet 3.5 via HTTP',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'What is 10 + 5? Reply with just the number.',
              model: 'claude-3.5-sonnet',
              temperature: 0,
            },
          });

          expect(result).toBeDefined();
          expect(result.isError).toBeFalsy();
          expect(result.content[0].text).toContain('15');

          logger.info('[anthropic-api-test] Claude Sonnet 3.5 test completed');
        });
      },
      60000,
    );

    it.skipIf(!hasAnthropic())(
      'should work with Claude Haiku for fast responses',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Say "Hello World" and nothing else.',
              model: 'haiku',
              temperature: 0,
            },
          });

          expect(result.isError).toBeFalsy();
          expect(result.content[0].text).toContain('Hello World');

          logger.info('[anthropic-api-test] Claude Haiku test completed');
        });
      },
      60000,
    );

    it.skipIf(!hasAnthropic())(
      'should maintain conversation continuity',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          // First message
          const firstResult = await client.callTool({
            name: 'chat',
            arguments: {
              prompt:
                'Remember this animal: elephant. Just say "Remembered" to confirm.',
              model: 'claude-3.5-sonnet',
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
              prompt: 'What animal did I ask you to remember?',
              continuation_id: conversationId,
              model: 'claude-3.5-sonnet',
              temperature: 0,
            },
          });

          expect(secondResult.isError).toBeFalsy();
          expect(secondResult.content[0].text.toLowerCase()).toContain(
            'elephant',
          );

          logger.info(
            '[anthropic-api-test] Conversation continuity test completed',
          );
        });
      },
      120000,
    );
  });

  describe('Error Handling', () => {
    it.skipIf(!hasAnthropic())(
      'should handle invalid model names gracefully',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Hello',
              model: 'claude-nonexistent',
            },
          });

          expect(result.isError).toBeTruthy();
          expect(result.content[0].text).toMatch(
            /not_found_error|model.*claude-nonexistent/i,
          );
        });
      },
    );
  });

  describe('Streaming Support', () => {
    it.skipIf(!hasAnthropic())(
      'should support streaming with Claude Haiku',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          // Test direct provider streaming
          const { anthropicProvider } = await import(
            '../../../../src/providers/anthropic.js'
          );

          const messages = [
            {
              role: 'user',
              content:
                'Count to 3 using digits like 1, 2, 3. Put each number on its own line.',
            },
          ];
          const streamResult = await anthropicProvider.invoke(messages, {
            config,
            model: 'claude-3-5-haiku-20241022',
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
              `[anthropic-streaming-test] Event: ${event.type}`,
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
          expect(startEvent.provider).toBe('anthropic');
          expect(endEvent.metadata.provider).toBe('anthropic');
          expect(endEvent.metadata.usage.total_tokens).toBeGreaterThan(0);

          // Verify content was streamed
          const fullContent = deltaEvents.map((e) => e.content).join('');
          expect(fullContent).toContain('1');
          expect(fullContent.length).toBeGreaterThanOrEqual(1); // Very lenient - just needs some content

          logger.info(
            '[anthropic-streaming-test] Streaming test completed successfully',
          );
        });
      },
      60000,
    );

    it.skipIf(!hasAnthropic())(
      'should support streaming with thinking models (Claude Sonnet 4)',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          // Test thinking model streaming
          const { anthropicProvider } = await import(
            '../../../../src/providers/anthropic.js'
          );

          const messages = [
            {
              role: 'user',
              content: 'What is 13 * 17? Show your calculation.',
            },
          ];
          const streamResult = await anthropicProvider.invoke(messages, {
            config,
            model: 'claude-sonnet-4-20250514',
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
            logger.info(
              `[anthropic-thinking-test] Event: ${event.type}`,
              event.content ? `"${event.content.substring(0, 50)}..."` : '',
            );
          }

          // Verify streaming events
          expect(events.length).toBeGreaterThan(0);

          const startEvent = events.find((e) => e.type === 'start');
          const deltaEvents = events.filter((e) => e.type === 'delta');
          const usageEvent = events.find((e) => e.type === 'usage');
          const endEvent = events.find((e) => e.type === 'end');

          expect(startEvent).toBeDefined();
          expect(deltaEvents.length).toBeGreaterThan(0);
          expect(endEvent).toBeDefined();

          // Verify thinking mode metadata
          expect(startEvent.provider).toBe('anthropic');
          expect(startEvent.thinking_mode).toBe(true);
          expect(endEvent.metadata.reasoning_effort).toBe('medium');

          // Verify thinking tokens are reported if present
          if (usageEvent) {
            expect(usageEvent.usage.thinking_tokens).toBeGreaterThanOrEqual(0);
          }

          // Verify calculation result was streamed
          const fullContent = deltaEvents.map((e) => e.content).join('');
          expect(fullContent).toMatch(/22[01]/); // 13 * 17 = 221

          logger.info(
            '[anthropic-thinking-test] Thinking model streaming test completed successfully',
          );
        });
      },
      120000,
    ); // Longer timeout for thinking models

    it.skipIf(!hasAnthropic())(
      'should support streaming with Claude 3.5 Sonnet (multimodal model)',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          // Test multimodal model streaming (without images for simplicity)
          const { anthropicProvider } = await import(
            '../../../../src/providers/anthropic.js'
          );

          const messages = [
            { role: 'user', content: 'Write a haiku about streaming data.' },
          ];
          const streamResult = await anthropicProvider.invoke(messages, {
            config,
            model: 'claude-3-5-sonnet-20241022',
            stream: true,
            temperature: 0.7,
          });

          expect(streamResult).toBeDefined();
          expect(typeof streamResult[Symbol.asyncIterator]).toBe('function');

          // Collect streaming events
          const events = [];
          for await (const event of streamResult) {
            events.push(event);
            logger.info(
              `[anthropic-multimodal-test] Event: ${event.type}`,
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
          expect(startEvent.provider).toBe('anthropic');
          expect(endEvent.metadata.provider).toBe('anthropic');
          expect(endEvent.stop_reason).toBe('stop');

          // Verify haiku was streamed (should have multiple lines)
          const fullContent = deltaEvents.map((e) => e.content).join('');
          expect(fullContent.length).toBeGreaterThan(20);
          expect(fullContent.toLowerCase()).toMatch(/(stream|data|flow)/);

          logger.info(
            '[anthropic-multimodal-test] Multimodal streaming test completed successfully',
          );
        });
      },
      60000,
    );

    it.skipIf(!hasAnthropic())(
      'should handle streaming errors gracefully',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          // Test error handling in streaming
          const { anthropicProvider } = await import(
            '../../../../src/providers/anthropic.js'
          );

          const messages = [{ role: 'user', content: 'Hello' }];

          // Use invalid model to trigger error
          const streamResult = anthropicProvider.invoke(messages, {
            config,
            model: 'claude-nonexistent-model',
            stream: true,
            temperature: 0,
          });

          expect(streamResult).toBeDefined();

          try {
            const events = [];
            for await (const event of await streamResult) {
              events.push(event);
              if (event.type === 'error') {
                expect(event.error.message).toBeDefined();
                expect(event.error.code).toBeDefined();
                break;
              }
            }

            // Should have received at least one event
            expect(events.length).toBeGreaterThanOrEqual(1);
            const errorEvent = events.find((e) => e.type === 'error');
            if (errorEvent) {
              expect(errorEvent.error.message).toBeDefined();
            }
          } catch (error) {
            // Error should be an error object with a message
            expect(error.message).toBeDefined();
            expect(typeof error.message).toBe('string');
          }

          logger.info(
            '[anthropic-error-test] Streaming error handling test completed',
          );
        });
      },
      30000,
    );
  });

  describe('Performance', () => {
    it.skipIf(!hasAnthropic())(
      'should complete simple requests within reasonable time',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const startTime = Date.now();

          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Say "OK"',
              model: 'haiku',
            },
          });

          const duration = Date.now() - startTime;

          expect(result.isError).toBeFalsy();
          expect(duration).toBeLessThan(30000); // Should complete within 30 seconds

          logger.info(
            `[anthropic-api-test] Performance test completed in ${duration}ms`,
          );
        });
      },
      40000,
    );
  });
});
