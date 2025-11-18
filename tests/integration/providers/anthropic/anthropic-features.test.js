import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../../src/config.js';
import { logger } from '../../../../src/utils/logger.js';

describe('Anthropic Feature-Specific Tests', () => {
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
          '[anthropic-features-test] Anthropic API key not found - tests will be skipped',
        );
      } else {
        logger.info(
          '[anthropic-features-test] Running Anthropic feature tests',
        );
      }
    } catch (error) {
      logger.error('[anthropic-features-test] Setup failed:', error);
      config = { apiKeys: {} };
    }
  });

  describe('Thinking Model Features', () => {
    it.skipIf(!hasAnthropic())(
      'should handle Claude Sonnet 4 with thinking',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'What is 10 + 10?',
              model: 'claude-sonnet-4',
              reasoning_effort: 'minimal',
            },
          });

          expect(result.isError).toBeFalsy();
          expect(result.content[0].text).toContain('20');

          logger.info(
            '[anthropic-features-test] Claude Sonnet 4 thinking test completed',
          );
        });
      },
      90000,
    );

    it.skipIf(!hasAnthropic())(
      'should handle Claude Opus 4 with thinking',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'What is 15 + 15?',
              model: 'claude-opus-4',
              reasoning_effort: 'minimal',
            },
          });

          expect(result.isError).toBeFalsy();
          expect(result.content[0].text).toContain('30');

          logger.info(
            '[anthropic-features-test] Claude Opus 4 thinking test completed',
          );
        });
      },
      90000,
    );

    it.skipIf(!hasAnthropic())(
      'should handle Claude 3.7 thinking model if available',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'What is 10 + 10? Just the number.',
              model: 'claude-3-7-sonnet',
              reasoning_effort: 'minimal',
            },
          });

          // If Claude 3.7 is available, it should work
          if (!result.isError) {
            expect(result.content[0].text).toContain('20');
          }

          logger.info(
            '[anthropic-features-test] Claude 3.7 thinking model test completed',
          );
        });
      },
      90000,
    );
  });

  describe('Multi-Model Consensus with Anthropic', () => {
    it.skipIf(!hasAnthropic())(
      'should participate in consensus gathering',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const models = [{ model: 'claude-3.5-sonnet' }, { model: 'haiku' }];

          const result = await client.callTool({
            name: 'consensus',
            arguments: {
              prompt: 'Is fire hot? Answer with "Yes" or "No" only.',
              models,
              enable_cross_feedback: false,
              temperature: 0,
            },
          });

          expect(result).toBeDefined();
          expect(result.isError).toBeFalsy();

          const consensusResult = JSON.parse(result.content[0].text);
          expect(consensusResult.status).toBe('consensus_complete');
          expect(consensusResult.models_consulted).toBe(2);
          expect(consensusResult.successful_initial_responses).toBe(2);

          logger.info('[anthropic-features-test] Consensus test completed');
        });
      },
      120000,
    );
  });

  describe('Cross-Provider Features', () => {
    it.skipIf(!hasAnthropic())(
      'should work with cross-feedback consensus',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const models = [{ model: 'claude-3.5-sonnet' }, { model: 'haiku' }];

          const result = await client.callTool({
            name: 'consensus',
            arguments: {
              prompt:
                'What is the best programming language for beginners? Give a one-sentence answer.',
              models,
              enable_cross_feedback: true,
              temperature: 0.3,
            },
          });

          expect(result.isError).toBeFalsy();

          const consensusResult = JSON.parse(result.content[0].text);
          expect(consensusResult.phases.initial).toBeDefined();
          expect(consensusResult.phases.refined).toBeDefined();
          expect(consensusResult.refined_responses).toBeGreaterThan(0);

          // Verify that models actually refined their responses
          if (consensusResult.phases.refined) {
            expect(consensusResult.phases.refined.length).toBeGreaterThan(0);
            // Check that at least one model successfully refined
            const successfulRefinements = consensusResult.phases.refined.filter(
              (r) => r.status === 'success',
            );
            expect(successfulRefinements.length).toBeGreaterThan(0);
          }

          logger.info(
            '[anthropic-features-test] Cross-feedback consensus test completed',
          );
        });
      },
      180000,
    );
  });

  describe('Streaming with Advanced Features', () => {
    it.skipIf(!hasAnthropic())(
      'should stream with thinking and cache usage tokens',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          // Test streaming with comprehensive token tracking
          const { anthropicProvider } = await import(
            '../../../../src/providers/anthropic.js'
          );

          // Use a system message to trigger caching
          const messages = [
            {
              role: 'system',
              content:
                'You are a helpful mathematics tutor. Always show your work step by step.',
            },
            {
              role: 'user',
              content: 'Calculate 23 * 47 and explain each step.',
            },
          ];

          const streamResult = await anthropicProvider.invoke(messages, {
            config,
            model: 'claude-sonnet-4-20250514',
            stream: true,
            reasoning_effort: 'high',
            temperature: 0,
          });

          expect(streamResult).toBeDefined();
          expect(typeof streamResult[Symbol.asyncIterator]).toBe('function');

          // Collect streaming events
          const events = [];
          for await (const event of streamResult) {
            events.push(event);
            logger.info(
              `[anthropic-advanced-streaming] Event: ${event.type}`,
              event.content
                ? `"${event.content.substring(0, 50)}..."`
                : event.usage
                  ? `Tokens: ${JSON.stringify(event.usage)}`
                  : '',
            );
          }

          // Verify comprehensive event structure
          expect(events.length).toBeGreaterThan(0);

          const startEvent = events.find((e) => e.type === 'start');
          const deltaEvents = events.filter((e) => e.type === 'delta');
          const usageEvent = events.find((e) => e.type === 'usage');
          const endEvent = events.find((e) => e.type === 'end');

          expect(startEvent).toBeDefined();
          expect(deltaEvents.length).toBeGreaterThan(0);
          expect(endEvent).toBeDefined();

          // Verify thinking mode is enabled
          expect(startEvent.thinking_mode).toBe(true);
          expect(endEvent.metadata.reasoning_effort).toBe('high');

          // Verify comprehensive token usage
          if (usageEvent) {
            expect(usageEvent.usage.input_tokens).toBeGreaterThan(0);
            expect(usageEvent.usage.output_tokens).toBeGreaterThan(0);
            expect(usageEvent.usage.total_tokens).toBeGreaterThan(0);
            expect(usageEvent.usage.thinking_tokens).toBeGreaterThanOrEqual(0);
            // Cache tokens may or may not be present depending on system
            expect(typeof usageEvent.usage.cache_creation_input_tokens).toBe(
              'number',
            );
            expect(typeof usageEvent.usage.cache_read_input_tokens).toBe(
              'number',
            );
          }

          // Verify calculation result
          const fullContent = deltaEvents.map((e) => e.content).join('');
          expect(fullContent).toMatch(/108[01]/); // 23 * 47 = 1081

          logger.info(
            '[anthropic-advanced-streaming] Advanced streaming test completed successfully',
          );
        });
      },
      180000,
    ); // Extra long timeout for thinking models with high effort

    it.skipIf(!hasAnthropic())(
      'should handle streaming with different model capabilities',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          // Test streaming with different model types
          const { anthropicProvider } = await import(
            '../../../../src/providers/anthropic.js'
          );

          const testModels = [
            {
              model: 'claude-3-5-haiku-20241022',
              hasThinking: false,
              timeout: 60000,
            },
            {
              model: 'claude-3-5-sonnet-20241022',
              hasThinking: false,
              timeout: 60000,
            },
          ];

          for (const { model, hasThinking, timeout } of testModels) {
            logger.info(
              `[anthropic-model-streaming] Testing streaming with ${model}`,
            );

            const messages = [
              { role: 'user', content: 'Say "Hello from streaming!"' },
            ];
            const options = {
              config,
              model,
              stream: true,
              temperature: 0,
            };

            // Add thinking configuration only for models that support it
            if (hasThinking) {
              options.reasoning_effort = 'minimal';
            }

            const streamResult = await anthropicProvider.invoke(
              messages,
              options,
            );
            expect(streamResult).toBeDefined();
            expect(typeof streamResult[Symbol.asyncIterator]).toBe('function');

            // Collect events
            const events = [];
            const startTime = Date.now();

            for await (const event of streamResult) {
              events.push(event);

              // Break early to avoid long waits in tests
              if (event.type === 'end' || Date.now() - startTime > timeout) {
                break;
              }
            }

            // Verify basic streaming worked
            expect(events.length).toBeGreaterThan(0);

            const startEvent = events.find((e) => e.type === 'start');
            const deltaEvents = events.filter((e) => e.type === 'delta');

            expect(startEvent).toBeDefined();
            expect(startEvent.provider).toBe('anthropic');
            expect(startEvent.model).toBe(model);
            expect(startEvent.thinking_mode).toBe(hasThinking);

            // Should have some content
            if (deltaEvents.length > 0) {
              const content = deltaEvents.map((e) => e.content).join('');
              expect(content.length).toBeGreaterThan(0);
            }

            logger.info(
              `[anthropic-model-streaming] ✅ ${model} streaming test passed`,
            );
          }
        });
      },
      240000,
    ); // Long timeout to test multiple models
  });
});
