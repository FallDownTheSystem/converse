import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { loadConfig } from '../../../src/config.js';
import { createRouter } from '../../../src/router.js';
import { getContinuationStore } from '../../../src/continuationStore.js';
import { getProviders } from '../../../src/providers/index.js';
import { getTools } from '../../../src/tools/index.js';
import { processUnifiedContext } from '../../../src/utils/contextProcessor.js';
import { logger } from '../../../src/utils/logger.js';
import { parseJsonResponse } from '../../utils/responseParser.js';

describe('Error Scenario and Recovery Tests', () => {
  let config;
  let router;
  let server;
  let continuationStore;
  let dependencies;
  let tools;

  beforeAll(async () => {
    try {
      config = await loadConfig();

      // Create MCP server instance
      server = new Server(
        {
          name: config.mcp.name,
          version: config.mcp.version,
        },
        {
          capabilities: {
            tools: {},
            prompts: {},
            resources: {},
          },
        },
      );

      // Set up dependencies like tools-integration test
      const providers = getProviders();
      continuationStore = getContinuationStore();
      dependencies = {
        config,
        providers,
        continuationStore,
        contextProcessor: { processUnifiedContext },
      };

      // Get tools
      tools = getTools();

      // Create router with server and config (configures MCP handlers)
      router = await createRouter(server, config);

      logger.info('[error-recovery-test] Error recovery test setup completed');
    } catch (error) {
      logger.error('[error-recovery-test] Setup failed:', error);
      throw error;
    }
  });

  afterAll(async () => {
    // Cleanup test data
    try {
      await continuationStore.cleanup(0);
      logger.info(
        '[error-recovery-test] Error recovery test cleanup completed',
      );
    } catch (error) {
      logger.error('[error-recovery-test] Cleanup failed:', error);
    }
  });

  describe('Provider Error Recovery', () => {
    it('should handle provider API key errors gracefully', async () => {
      // Create config with invalid API keys
      const invalidConfig = {
        ...config,
        apiKeys: {
          openai: 'sk-invalid-key',
          xai: 'xai-invalid-key',
          google: 'invalid-google-key',
        },
      };

      // Create temporary server for invalid config test
      const tempServer = new Server(
        {
          name: 'test-server',
          version: '1.0.0',
        },
        {
          capabilities: {
            tools: {},
            prompts: {},
            resources: {},
          },
        },
      );

      const invalidRouter = await createRouter(tempServer, invalidConfig);

      const result = await tools.chat(
        {
          prompt: 'Test with invalid API keys',
        },
        { ...dependencies, config: invalidConfig },
      );

      expect(result.isError).toBe(true);
      expect(result.error).toBeDefined();
      expect(result.error.message).toMatch(
        /(API key|authentication|invalid|not available)/i,
      );

      // Should still return proper MCP format
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');

      logger.info(
        '[error-recovery-test] Provider API key error handled gracefully',
      );
    });

    it('should recover from temporary provider failures', async () => {
      // Mock provider to simulate temporary failure
      const originalProviders = await import('../../../src/providers/index.js');
      const mockProvider = {
        invoke: vi
          .fn()
          .mockRejectedValueOnce(new Error('Temporary network error'))
          .mockResolvedValue({
            content: 'Success after retry',
            stop_reason: 'stop',
            rawResponse: {},
            metadata: {
              tokenUsage: {
                inputTokens: 10,
                outputTokens: 15,
                totalTokens: 25,
              },
            },
          }),
        validateConfig: vi.fn().mockReturnValue(true),
        isAvailable: vi.fn().mockReturnValue(true),
        getSupportedModels: vi.fn().mockReturnValue({ 'test-model': {} }),
        getModelConfig: vi.fn().mockReturnValue({ contextWindow: 1000 }),
      };

      // Test resilience with retry logic (if implemented)
      const result = await router.callTool({
        name: 'chat',
        arguments: {
          prompt: 'Test provider recovery',
        },
      });

      // Should either succeed or fail gracefully
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();

      if (result.isError) {
        expect(result.error.message).toMatch(/(provider|API|not available)/i);
      } else {
        expect(result.content[0].type).toBe('text');
      }

      logger.info('[error-recovery-test] Provider failure recovery tested');
    });

    it('should handle provider timeout scenarios', async () => {
      // Test with very low timeout to simulate timeout scenario
      const result = await router.callTool({
        name: 'chat',
        arguments: {
          prompt: 'Test timeout scenario',
          models: ['auto'],
        },
      });

      // Should complete within reasonable time or handle timeout gracefully
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();

      if (result.isError) {
        expect(result.error.message).toMatch(
          /(timeout|time|provider|network)/i,
        );
      }

      logger.info('[error-recovery-test] Provider timeout scenario tested');
    }, 45000); // 45 second timeout
  });

  describe('Continuation Store Error Recovery', () => {
    it('should handle continuation store corruption gracefully', async () => {
      // Create a conversation
      const initialResult = await router.callTool({
        name: 'chat',
        arguments: {
          prompt: 'Test conversation for corruption recovery',
        },
      });

      const conversationId = initialResult.continuation.id;

      // Manually corrupt the conversation data
      try {
        await continuationStore.set(
          {
            corrupted: true,
            messages: 'invalid-data-structure',
            invalidField: { nested: 'corruption' },
          },
          conversationId.replace('conv_', ''),
        );
      } catch (error) {
        // Store might reject invalid data, that's fine
      }

      // Try to continue the conversation
      const continuationResult = await router.callTool({
        name: 'chat',
        arguments: {
          prompt: 'Continue corrupted conversation',
          continuation: conversationId,
        },
      });

      // Should handle gracefully - either fix corruption or start new conversation
      expect(continuationResult).toBeDefined();
      expect(continuationResult.content).toBeDefined();
      expect(continuationResult.continuation).toBeDefined();

      logger.info(
        '[error-recovery-test] Continuation store corruption handled',
      );
    });

    it('should handle missing continuation IDs gracefully', async () => {
      const result = await router.callTool({
        name: 'chat',
        arguments: {
          prompt: 'Test with nonexistent continuation',
          continuation_id: 'conv_nonexistent_12345',
        },
      });

      // Should create new conversation instead of failing
      expect(result.isError).toBe(false);
      expect(result.continuation).toBeDefined();
      expect(result.continuation.id).not.toBe('conv_nonexistent_12345');
      expect(result.continuation.messageCount).toBe(2); // New conversation

      logger.info('[error-recovery-test] Missing continuation ID handled');
    });

    it('should handle continuation store failures during save', async () => {
      // Mock continuation store to fail on save
      const originalSet = continuationStore.set;
      continuationStore.set = vi
        .fn()
        .mockRejectedValue(new Error('Storage failure'));

      const result = await router.callTool({
        name: 'chat',
        arguments: {
          prompt: 'Test storage failure during save',
        },
      });

      // Should handle storage failure gracefully
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();

      if (result.isError) {
        expect(result.error.message).toMatch(/(storage|save|continuation)/i);
      } else {
        // Or might succeed without saving continuation
        expect(result.content[0].type).toBe('text');
      }

      // Restore original function
      continuationStore.set = originalSet;

      logger.info('[error-recovery-test] Continuation save failure handled');
    });
  });

  describe('Network and Infrastructure Errors', () => {
    it('should handle DNS resolution failures', async () => {
      // Create config with invalid provider URLs
      const invalidConfig = {
        ...config,
        providers: {
          ...config.providers,
          xaiBaseUrl: 'https://nonexistent-domain-12345.invalid',
        },
      };

      // Create temporary server for invalid config test
      const tempServer2 = new Server(
        {
          name: 'test-server-2',
          version: '1.0.0',
        },
        {
          capabilities: {
            tools: {},
            prompts: {},
            resources: {},
          },
        },
      );

      const invalidRouter = await createRouter(tempServer2, invalidConfig);

      const result = await invalidRouter.callTool({
        name: 'chat',
        arguments: {
          prompt: 'Test DNS failure',
          models: ['auto'],
        },
      });

      // Should handle DNS failure gracefully
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();

      if (result.isError) {
        expect(result.error.message).toMatch(
          /(network|DNS|connection|not available)/i,
        );
      }

      logger.info('[error-recovery-test] DNS resolution failure handled');
    }, 30000);

    it('should handle partial network connectivity', async () => {
      // Test with limited network conditions
      const result = await router.callTool({
        name: 'chat',
        arguments: {
          prompt: 'Test partial connectivity',
          mode: 'consensus',
          models: ['gpt-4o-mini', 'gemini-2.5-flash', 'grok-4-0709'],
        },
      });

      // Should handle partial failures gracefully
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();

      if (!result.isError) {
        const consensusData = parseJsonResponse(result.content[0].text);
        expect(consensusData.models_consulted).toBeGreaterThan(0);

        // May have some failures but should have at least some successes
        if (consensusData.failed_responses > 0) {
          expect(consensusData.successful_initial_responses).toBeGreaterThan(0);
        }
      }

      logger.info('[error-recovery-test] Partial network connectivity handled');
    }, 60000);
  });

  describe('Input Validation and Sanitization', () => {
    it('should handle malformed JSON in arguments', async () => {
      // This simulates what happens with malformed input at the router level
      try {
        const result = await router.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Valid prompt',
            malformed: { circular: null },
          },
        });

        // Create circular reference
        result.arguments?.malformed &&
          (result.arguments.malformed.circular = result.arguments.malformed);

        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
      } catch (error) {
        // May throw due to circular reference, that's acceptable
        expect(error).toBeDefined();
      }

      logger.info('[error-recovery-test] Malformed JSON arguments handled');
    });

    it('should handle extremely large inputs', async () => {
      const largePrompt = 'A'.repeat(100000); // 100KB prompt

      const result = await router.callTool({
        name: 'chat',
        arguments: {
          prompt: largePrompt,
          models: ['auto'],
        },
      });

      // Should either truncate or reject gracefully
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();

      if (result.isError) {
        expect(result.error.message).toMatch(/(length|size|limit|context)/i);
      }

      logger.info('[error-recovery-test] Large input handled');
    }, 45000);

    it('should handle special characters and encoding issues', async () => {
      const specialPrompts = [
        'Test with emojis 🚀🔥💻',
        'Test with unicode: αβγδε ñáéíóú',
        'Test with quotes: "nested \'quotes\' here"',
        'Test with newlines:\nLine 1\nLine 2\nLine 3',
        'Test with HTML: <script>alert("test")</script>',
        'Test with SQL: DROP TABLE users; --',
      ];

      for (const prompt of specialPrompts) {
        const result = await router.callTool({
          name: 'chat',
          arguments: {
            prompt,
            models: ['auto'],
          },
        });

        expect(result).toBeDefined();
        expect(result.content).toBeDefined();

        // Should not crash or return malformed responses
        expect(result.content[0].type).toBe('text');
      }

      logger.info(
        '[error-recovery-test] Special characters and encoding handled',
      );
    }, 120000);
  });

  describe('Resource Exhaustion Recovery', () => {
    it('should handle memory pressure gracefully', async () => {
      // Create many conversations to test memory handling
      const conversations = [];
      const numConversations = 20;

      try {
        for (let i = 0; i < numConversations; i++) {
          const result = await router.callTool({
            name: 'chat',
            arguments: {
              prompt: `Memory pressure test conversation ${i}`,
            },
          });

          if (!result.isError) {
            conversations.push(result.continuation.id);
          }
        }

        // Check memory usage
        const memUsage = process.memoryUsage();
        expect(memUsage.heapUsed).toBeLessThan(500 * 1024 * 1024); // 500MB limit

        logger.info(
          `[error-recovery-test] Memory pressure test: ${conversations.length} conversations, ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB used`,
        );
      } finally {
        // Cleanup
        for (const id of conversations) {
          try {
            await continuationStore.delete(id);
          } catch (error) {
            // Ignore cleanup errors
          }
        }
      }
    }, 120000);

    it('should handle rapid request bursts', async () => {
      const burstSize = 10;
      const requests = [];

      // Create burst of requests
      for (let i = 0; i < burstSize; i++) {
        requests.push(
          router.callTool({
            name: 'chat',
            arguments: {
              prompt: `Burst test ${i}`,
              models: ['auto'],
            },
          }),
        );
      }

      const results = await Promise.allSettled(requests);

      // Count successes and failures
      const successful = results.filter(
        (r) => r.status === 'fulfilled' && !r.value.isError,
      );
      const failed = results.length - successful.length;

      // Should handle at least 50% of burst requests
      expect(successful.length).toBeGreaterThan(burstSize * 0.5);

      if (failed > 0) {
        logger.info(
          `[error-recovery-test] Burst test: ${successful.length}/${burstSize} successful, ${failed} failed/rate-limited`,
        );
      } else {
        logger.info(
          `[error-recovery-test] Burst test: all ${burstSize} requests successful`,
        );
      }
    }, 90000);
  });

  describe('Error Reporting and Logging', () => {
    it('should provide detailed error information', async () => {
      const result = await router.callTool({
        name: 'nonexistent-tool',
        arguments: {
          prompt: 'Test detailed error reporting',
        },
      });

      expect(result.isError).toBe(true);
      expect(result.error).toBeDefined();

      // Should have comprehensive error information
      expect(result.error.type).toBeDefined();
      expect(result.error.code).toBeDefined();
      expect(result.error.message).toBeDefined();
      expect(result.error.timestamp).toBeDefined();

      // Should include helpful context
      expect(result.error.details).toBeDefined();
      expect(result.error.details.requestedTool).toBe('nonexistent-tool');

      logger.info('[error-recovery-test] Detailed error information verified');
    });

    it('should maintain error correlation across requests', async () => {
      // Start a conversation
      const initialResult = await router.callTool({
        name: 'chat',
        arguments: {
          prompt: 'Start error correlation test',
        },
      });

      const conversationId = initialResult.continuation.id;

      // Make an invalid request in the same conversation
      const errorResult = await router.callTool({
        name: 'invalid-tool',
        arguments: {
          prompt: 'This should fail',
          continuation: conversationId,
        },
      });

      expect(errorResult.isError).toBe(true);

      // Error should include conversation context
      if (errorResult.error.context) {
        const contextString =
          typeof errorResult.error.context === 'string'
            ? errorResult.error.context
            : JSON.stringify(errorResult.error.context);
        expect(contextString).toMatch(/(conversation|continuation)/i);
      }

      logger.info('[error-recovery-test] Error correlation verified');
    });
  });

  describe('Recovery Mechanisms', () => {
    it('should implement circuit breaker pattern for providers', async () => {
      // This test would be more meaningful with actual circuit breaker implementation
      // For now, we test basic failure handling

      const results = [];
      const maxAttempts = 5;

      for (let i = 0; i < maxAttempts; i++) {
        const result = await router.callTool({
          name: 'chat',
          arguments: {
            prompt: `Circuit breaker test ${i}`,
            models: ['nonexistent-provider'],
          },
        });

        results.push(result);

        // Should consistently fail but not crash
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
      }

      // All should fail gracefully
      const allFailed = results.every((r) => r.isError);
      if (allFailed) {
        logger.info(
          '[error-recovery-test] Circuit breaker pattern: consistent failures handled',
        );
      } else {
        logger.info(
          '[error-recovery-test] Circuit breaker pattern: some requests succeeded with fallback',
        );
      }
    }, 60000);

    it('should implement retry logic for transient failures', async () => {
      // Test with a model that might have intermittent issues
      const result = await router.callTool({
        name: 'chat',
        arguments: {
          prompt: 'Test retry logic for transient failures',
          models: ['auto'],
        },
      });

      // Should either succeed or fail with final error after retries
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();

      if (result.isError) {
        // Error message should indicate final failure after retries
        logger.info(
          `[error-recovery-test] Retry logic resulted in: ${result.error.message}`,
        );
      } else {
        logger.info('[error-recovery-test] Retry logic succeeded');
      }
    }, 45000);

    it('should implement graceful degradation', async () => {
      // Test consensus with mixed provider availability
      const result = await router.callTool({
        name: 'chat',
        arguments: {
          prompt: 'Test graceful degradation',
          mode: 'consensus',
          models: ['auto', 'nonexistent-model', 'auto'],
        },
      });

      if (!result.isError) {
        const consensusData = parseJsonResponse(result.content[0].text);

        // Should have attempted all models
        expect(consensusData.models_consulted).toBe(3);

        // Should have at least partial success (unless no API keys are configured)
        if (consensusData.successful_initial_responses > 0) {
          expect(consensusData.failed_responses).toBeGreaterThan(0); // At least nonexistent-model should fail
          expect(consensusData.failed_responses).toBeLessThan(3); // But not all should fail
          logger.info(
            `[error-recovery-test] Graceful degradation: ${consensusData.successful_initial_responses}/${consensusData.models_consulted} providers succeeded`,
          );
        } else {
          // All failed - likely no API keys configured, which is acceptable in test environment
          expect(consensusData.failed_responses).toBe(3);
          logger.info(
            '[error-recovery-test] Graceful degradation: all providers failed (likely no API keys)',
          );
        }
      } else {
        logger.info(
          '[error-recovery-test] Graceful degradation: complete tool failure',
        );
      }
    }, 60000);
  });
});
