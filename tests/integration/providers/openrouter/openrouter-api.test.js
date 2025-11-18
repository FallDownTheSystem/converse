import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../../src/config.js';
import { logger } from '../../../../src/utils/logger.js';

describe('OpenRouter API Integration Tests', () => {
  let config;

  // Dynamic API key checking functions
  const hasOpenRouter = () =>
    !!(
      process.env.OPENROUTER_API_KEY &&
      process.env.OPENROUTER_API_KEY.startsWith('sk-or-') &&
      process.env.OPENROUTER_REFERER
    );

  beforeAll(async () => {
    try {
      config = await loadConfig();
      if (!hasOpenRouter()) {
        logger.warn(
          '[openrouter-api-test] OpenRouter API key or referer not found - tests will be skipped',
        );
      } else {
        logger.info('[openrouter-api-test] Running OpenRouter API tests');
      }
    } catch (error) {
      logger.error('[openrouter-api-test] Setup failed:', error);
      config = { apiKeys: {} };
    }
  });

  describe('Basic Chat Functionality', () => {
    it.skipIf(!hasOpenRouter())(
      'should work with Kimi K2 model via HTTP',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'What is 100 divided by 4? Reply with just the number.',
              model: 'k2',
              temperature: 0,
            },
          });

          expect(result).toBeDefined();
          expect(result.isError).toBeFalsy();
          expect(result.content[0].text).toContain('25');

          logger.info('[openrouter-api-test] Kimi K2 test completed');
        });
      },
      60000,
    );

    it.skipIf(!hasOpenRouter())(
      'should work with Qwen Coder model',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt:
                'Write "console.log(42)" in JavaScript. Just the code, no explanation.',
              model: 'qwen-coder',
              temperature: 0,
            },
          });

          expect(result.isError).toBeFalsy();
          expect(result.content[0].text).toContain('console.log(42)');

          logger.info('[openrouter-api-test] Qwen Coder test completed');
        });
      },
      60000,
    );

    it.skipIf(!hasOpenRouter())(
      'should maintain conversation continuity',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          // First message
          const firstResult = await client.callTool({
            name: 'chat',
            arguments: {
              prompt:
                'Remember this planet: Mars. Just say "Remembered" to confirm.',
              model: 'k2',
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
              prompt: 'What planet did I ask you to remember?',
              continuation_id: conversationId,
              model: 'k2',
              temperature: 0,
            },
          });

          expect(secondResult.isError).toBeFalsy();
          expect(secondResult.content[0].text).toContain('Mars');

          logger.info(
            '[openrouter-api-test] Conversation continuity test completed',
          );
        });
      },
      120000,
    );
  });

  describe('Error Handling', () => {
    it.skipIf(!hasOpenRouter())(
      'should handle invalid model names gracefully',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Hello',
              model: 'nonexistent-model-xyz',
            },
          });

          expect(result.isError).toBeTruthy();
          expect(result.content[0].text).toMatch(/model.*not found/i);
        });
      },
    );
  });

  describe('Streaming Functionality', () => {
    it.skipIf(!hasOpenRouter())(
      'should support basic streaming with kimi-k2',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          // Test direct provider streaming (bypasses HTTP MCP for now)
          const { openrouterProvider } = await import(
            '../../../../src/providers/openrouter.js'
          );

          const messages = [
            {
              role: 'user',
              content:
                'Count to 3 using digits like 1, 2, 3. Put each number on its own line.',
            },
          ];
          const streamResult = await openrouterProvider.invoke(messages, {
            config,
            model: 'kimi-k2',
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
              `[openrouter-streaming-test] Event: ${event.type}`,
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
          expect(startEvent.provider).toBe('openrouter');
          expect(endEvent.metadata.provider).toBe('openrouter');
          expect(endEvent.metadata.usage.total_tokens).toBeGreaterThan(0);

          // Verify content was streamed
          const fullContent = deltaEvents.map((e) => e.content).join('');
          expect(fullContent).toContain('1');
          expect(fullContent.length).toBeGreaterThan(0);

          logger.info(
            '[openrouter-streaming-test] Kimi K2 streaming test completed successfully',
          );
        });
      },
      60000,
    );

    it.skipIf(!hasOpenRouter())(
      'should support streaming with qwen3-coder',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          // Test direct provider streaming with code model
          const { openrouterProvider } = await import(
            '../../../../src/providers/openrouter.js'
          );

          const messages = [
            {
              role: 'user',
              content:
                'Write a simple function that adds 5 + 7. Just the code.',
            },
          ];
          const streamResult = await openrouterProvider.invoke(messages, {
            config,
            model: 'qwen3-coder',
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
              `[openrouter-coder-test] Event: ${event.type}`,
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

          // Verify content contains code
          const fullContent = deltaEvents.map((e) => e.content).join('');
          expect(fullContent).toMatch(/function|def|\+|\(/); // Should contain code patterns

          logger.info(
            '[openrouter-coder-test] Qwen3 Coder streaming test completed successfully',
          );
        });
      },
      60000,
    );

    it.skipIf(!hasOpenRouter())(
      'should support streaming with qwen3-thinking model (reasoning events)',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          // Test direct provider streaming with reasoning model
          const { openrouterProvider } = await import(
            '../../../../src/providers/openrouter.js'
          );

          const messages = [
            {
              role: 'user',
              content: 'What is 13 multiplied by 17? Show your calculation.',
            },
          ];
          const streamResult = await openrouterProvider.invoke(messages, {
            config,
            model: 'qwen3-thinking',
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
                `[openrouter-thinking-test] Thinking: ${event.content.substring(0, 100)}...`,
              );
            } else {
              logger.info(
                `[openrouter-thinking-test] Event: ${event.type}`,
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

          // For reasoning models, we might get thinking events
          if (thinkingEvents.length > 0) {
            logger.info(
              `[openrouter-thinking-test] Found ${thinkingEvents.length} thinking events`,
            );
          }

          // Verify content contains the calculation
          const fullContent = deltaEvents.map((e) => e.content).join('');
          expect(fullContent).toMatch(/221|13.*17|17.*13/); // 13 * 17 = 221

          logger.info(
            '[openrouter-thinking-test] Qwen3 Thinking streaming test completed successfully',
          );
        });
      },
      90000,
    );

    it.skipIf(!hasOpenRouter())(
      'should support streaming with openrouter/auto model',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          // Test direct provider streaming with auto-routing model
          const { openrouterProvider } = await import(
            '../../../../src/providers/openrouter.js'
          );

          const messages = [
            {
              role: 'user',
              content: 'What is 2 + 2? Reply with just the number.',
            },
          ];
          const streamResult = await openrouterProvider.invoke(messages, {
            config,
            model: 'openrouter/auto',
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
              `[openrouter-auto-test] Event: ${event.type}`,
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

          // Verify metadata includes actual provider used (OpenRouter routing feature)
          if (endEvent.metadata.actual_provider) {
            logger.info(
              `[openrouter-auto-test] Auto-routing used provider: ${endEvent.metadata.actual_provider}`,
            );
          }

          // Verify content contains the answer
          const fullContent = deltaEvents.map((e) => e.content).join('');
          expect(fullContent).toContain('4');

          logger.info(
            '[openrouter-auto-test] OpenRouter Auto streaming test completed successfully',
          );
        });
      },
      60000,
    );

    it.skipIf(!hasOpenRouter())(
      'should handle streaming errors gracefully',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const { openrouterProvider } = await import(
            '../../../../src/providers/openrouter.js'
          );

          try {
            // Try to use an invalid model that should fail
            const messages = [{ role: 'user', content: 'Hello' }];
            const streamResult = await openrouterProvider.invoke(messages, {
              config,
              model: 'invalid/nonexistent-model',
              stream: true,
            });

            // If streaming starts, collect events and look for error events
            const events = [];
            let errorEventFound = false;

            try {
              for await (const event of streamResult) {
                events.push(event);
                if (event.type === 'error') {
                  errorEventFound = true;
                  logger.info(
                    `[openrouter-error-test] Error event: ${event.error.message}`,
                  );
                  break;
                }
              }
            } catch (streamError) {
              // Error during streaming is also acceptable
              logger.info(
                `[openrouter-error-test] Streaming error caught: ${streamError.message}`,
              );
            }

            // Either an error event should be found or an exception thrown
            expect(errorEventFound || events.length === 0).toBeTruthy();
          } catch (error) {
            // Direct error from invoke call is expected for invalid models
            expect(error.message).toMatch(
              /model.*not found|invalid|nonexistent/i,
            );
          }

          logger.info(
            '[openrouter-error-test] Error handling streaming test completed',
          );
        });
      },
      30000,
    );

    it.skipIf(!hasOpenRouter())(
      'should include OpenRouter-specific metadata in streaming',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const { openrouterProvider } = await import(
            '../../../../src/providers/openrouter.js'
          );

          const messages = [{ role: 'user', content: 'Hello world' }];
          const streamResult = await openrouterProvider.invoke(messages, {
            config,
            model: 'kimi-k2',
            stream: true,
            temperature: 0,
          });

          expect(streamResult).toBeDefined();

          // Collect streaming events
          const events = [];
          for await (const event of streamResult) {
            events.push(event);
          }

          const endEvent = events.find((e) => e.type === 'end');
          expect(endEvent).toBeDefined();

          // Verify OpenRouter-specific metadata
          expect(endEvent.metadata.provider).toBe('openrouter');

          // Check for cost information (may be present)
          if (endEvent.metadata.prompt_cost !== undefined) {
            expect(typeof endEvent.metadata.prompt_cost).toBe('number');
            logger.info(
              `[openrouter-metadata-test] Prompt cost: $${endEvent.metadata.prompt_cost}`,
            );
          }

          if (endEvent.metadata.completion_cost !== undefined) {
            expect(typeof endEvent.metadata.completion_cost).toBe('number');
            logger.info(
              `[openrouter-metadata-test] Completion cost: $${endEvent.metadata.completion_cost}`,
            );
          }

          if (endEvent.metadata.total_cost !== undefined) {
            expect(typeof endEvent.metadata.total_cost).toBe('number');
            logger.info(
              `[openrouter-metadata-test] Total cost: $${endEvent.metadata.total_cost}`,
            );
          }

          // Check for request ID
          if (endEvent.metadata.request_id) {
            expect(typeof endEvent.metadata.request_id).toBe('string');
            logger.info(
              `[openrouter-metadata-test] Request ID: ${endEvent.metadata.request_id}`,
            );
          }

          logger.info(
            '[openrouter-metadata-test] OpenRouter metadata streaming test completed',
          );
        });
      },
      60000,
    );

    it.skipIf(!hasOpenRouter())(
      'should properly handle usage reporting in streaming mode',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const { openrouterProvider } = await import(
            '../../../../src/providers/openrouter.js'
          );

          const messages = [{ role: 'user', content: 'Count from 1 to 5' }];
          const streamResult = await openrouterProvider.invoke(messages, {
            config,
            model: 'qwen3-coder',
            stream: true,
            temperature: 0,
          });

          expect(streamResult).toBeDefined();

          // Collect streaming events
          const events = [];
          for await (const event of streamResult) {
            events.push(event);
          }

          const usageEvent = events.find((e) => e.type === 'usage');
          const endEvent = events.find((e) => e.type === 'end');

          // Either usage event or usage in end event should be present
          const usageData = usageEvent?.usage || endEvent?.metadata?.usage;
          expect(usageData).toBeDefined();

          expect(usageData.input_tokens).toBeGreaterThan(0);
          expect(usageData.output_tokens).toBeGreaterThan(0);
          expect(usageData.total_tokens).toBeGreaterThan(0);
          expect(usageData.total_tokens).toBe(
            usageData.input_tokens + usageData.output_tokens,
          );

          logger.info(
            `[openrouter-usage-test] Usage - Input: ${usageData.input_tokens}, Output: ${usageData.output_tokens}, Total: ${usageData.total_tokens}`,
          );
          logger.info(
            '[openrouter-usage-test] Usage reporting streaming test completed',
          );
        });
      },
      60000,
    );

    it.skipIf(!hasOpenRouter())(
      'should handle multiple model streaming scenarios',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const { openrouterProvider } = await import(
            '../../../../src/providers/openrouter.js'
          );

          const testModels = ['kimi-k2', 'qwen3-coder'];

          for (const model of testModels) {
            logger.info(
              `[openrouter-multi-test] Testing streaming with ${model}`,
            );

            const messages = [
              {
                role: 'user',
                content: `What is 3 + 4? Use model ${model} to answer.`,
              },
            ];
            const streamResult = await openrouterProvider.invoke(messages, {
              config,
              model,
              stream: true,
              temperature: 0,
            });

            expect(streamResult).toBeDefined();
            expect(typeof streamResult[Symbol.asyncIterator]).toBe('function');

            // Collect events for this model
            const events = [];
            for await (const event of streamResult) {
              events.push(event);
              if (event.type === 'end') break; // Ensure we don't hang
            }

            const startEvent = events.find((e) => e.type === 'start');
            const deltaEvents = events.filter((e) => e.type === 'delta');
            const endEvent = events.find((e) => e.type === 'end');

            expect(startEvent).toBeDefined();
            expect(deltaEvents.length).toBeGreaterThan(0);
            expect(endEvent).toBeDefined();

            // Verify content contains expected answer
            const fullContent = deltaEvents.map((e) => e.content).join('');
            expect(fullContent).toMatch(/7|seven/i);

            logger.info(
              `[openrouter-multi-test] ${model} streaming test completed successfully`,
            );
          }

          logger.info(
            '[openrouter-multi-test] Multiple model streaming test completed',
          );
        });
      },
      120000,
    ); // Longer timeout for multiple models
  });

  describe('Performance', () => {
    it.skipIf(!hasOpenRouter())(
      'should complete simple requests within reasonable time',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const startTime = Date.now();

          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Say "OK"',
              model: 'k2',
            },
          });

          const duration = Date.now() - startTime;

          expect(result.isError).toBeFalsy();
          expect(duration).toBeLessThan(30000); // Should complete within 30 seconds

          logger.info(
            `[openrouter-api-test] Performance test completed in ${duration}ms`,
          );
        });
      },
      40000,
    );
  });
});
