import { describe, it, expect, beforeAll } from 'vitest';
import { loadConfig } from '../../../src/config.js';
import { getContinuationStore } from '../../../src/continuationStore.js';
import { processUnifiedContext } from '../../../src/utils/contextProcessor.js';
import { getProviders } from '../../../src/providers/index.js';
import { getTools } from '../../../src/tools/index.js';
import { logger } from '../../../src/utils/logger.js';

describe('Tools Integration Tests', () => {
  let config;
  let dependencies;
  let tools;

  beforeAll(async () => {
    // Load configuration
    config = await loadConfig();

    // Create dependencies object similar to router
    dependencies = {
      config,
      continuationStore: getContinuationStore(),
      providers: getProviders(), // Get actual provider instances
      contextProcessor: { processUnifiedContext },
    };

    // Get tools
    tools = getTools();

    logger.info(
      '[tools-integration-test] Tools integration test setup completed',
    );
  });

  describe('Chat Tool Integration', () => {
    it('should handle basic chat requests', async () => {
      const chatTool = tools.chat;
      expect(chatTool).toBeDefined();
      expect(typeof chatTool).toBe('function');

      const result = await chatTool(
        {
          prompt: 'Hello, this is a test message',
        },
        dependencies,
      );

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBeDefined();
    });

    it('should handle chat with continuation', async () => {
      const chatTool = tools.chat;

      // First message
      const firstResult = await chatTool(
        {
          prompt: 'Start a conversation',
        },
        dependencies,
      );

      expect(firstResult.continuation).toBeDefined();
      const continuationId = firstResult.continuation.id;

      // Second message with continuation
      const secondResult = await chatTool(
        {
          prompt: 'Continue the conversation',
          continuation_id: continuationId,
        },
        dependencies,
      );

      expect(secondResult.continuation.id).toBe(continuationId);
      expect(secondResult.continuation.messageCount).toBeGreaterThan(1);
    });

    it('should handle invalid provider gracefully', async () => {
      const chatTool = tools.chat;

      const result = await chatTool(
        {
          prompt: 'Test message',
          model: 'invalid-model-123',
        },
        dependencies,
      );

      // Should either succeed with fallback or return error content
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
    });

    it('should process file context', async () => {
      const chatTool = tools.chat;

      const result = await chatTool(
        {
          prompt: 'Analyze this package.json',
          files: ['package.json'],
        },
        dependencies,
      );

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
    }, 60000); // Increase timeout to 60 seconds
  });

  describe('Consensus Tool Integration', () => {
    it('should handle basic consensus requests', async () => {
      const consensusTool = tools.consensus;
      expect(consensusTool).toBeDefined();
      expect(typeof consensusTool).toBe('function');

      const result = await consensusTool(
        {
          prompt: 'What is 2+2?',
          models: ['auto'],
        },
        dependencies,
      );

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');

      // Should be valid JSON
      const consensusResult = JSON.parse(result.content[0].text);
      expect(consensusResult.status).toBeDefined();
      expect(consensusResult.models_consulted).toBe(1);
    });

    it('should handle multiple models', async () => {
      const consensusTool = tools.consensus;

      const result = await consensusTool(
        {
          prompt: 'Simple test question',
          models: ['auto', 'auto'],
          enable_cross_feedback: false,
        },
        dependencies,
      );

      const consensusResult = JSON.parse(result.content[0].text);
      expect(consensusResult.models_consulted).toBe(2);
      expect(consensusResult.phases).toBeDefined();
      expect(consensusResult.phases.initial).toBeDefined();
    });

    it('should handle cross-feedback when enabled', async () => {
      const consensusTool = tools.consensus;

      const result = await consensusTool(
        {
          prompt: 'Test question for cross-feedback',
          models: ['auto', 'auto'], // Need at least 2 models for cross-feedback
          enable_cross_feedback: true,
        },
        dependencies,
      );

      const consensusResult = JSON.parse(result.content[0].text);
      // Cross-feedback only happens with multiple successful responses
      if (consensusResult.successful_initial_responses > 1) {
        expect(consensusResult.phases.refined).toBeDefined();
      } else {
        // With single model or failed models, refined phase won't exist
        expect(consensusResult.phases.refined).toBeUndefined();
      }
    });
  });

  describe('Provider Integration', () => {
    it('should validate provider interfaces', () => {
      const providers = dependencies.providers;

      for (const [name, provider] of Object.entries(providers)) {
        expect(typeof provider.invoke).toBe('function');
        expect(typeof provider.validateConfig).toBe('function');
        expect(typeof provider.isAvailable).toBe('function');
        expect(typeof provider.getSupportedModels).toBe('function');
        expect(typeof provider.getModelConfig).toBe('function');
      }
    });

    it('should check provider availability', () => {
      const providers = dependencies.providers;

      for (const [name, provider] of Object.entries(providers)) {
        const isAvailable = provider.isAvailable(config);
        expect(typeof isAvailable).toBe('boolean');

        if (isAvailable) {
          logger.debug(
            `[tools-integration-test] Provider ${name} is available`,
          );
        }
      }
    });

    it('should provide model configurations', () => {
      const providers = dependencies.providers;

      for (const [name, provider] of Object.entries(providers)) {
        const supportedModels = provider.getSupportedModels();
        expect(typeof supportedModels).toBe('object');
        expect(Object.keys(supportedModels).length).toBeGreaterThan(0);

        // Test getting config for first model
        const firstModelName = Object.keys(supportedModels)[0];
        const modelConfig = provider.getModelConfig(firstModelName);
        expect(modelConfig).toBeDefined();
        expect(modelConfig.contextWindow).toBeDefined();
      }
    });
  });

  describe('Context Processing Integration', () => {
    it('should process unified context', async () => {
      const { processUnifiedContext } = dependencies.contextProcessor;

      const result = await processUnifiedContext({
        files: [], // Empty for testing
        images: [],
        webSearch: null,
      });

      expect(result).toBeDefined();
      expect(result.files).toBeDefined();
      expect(Array.isArray(result.files)).toBe(true);
      expect(result.images).toBeDefined();
      expect(Array.isArray(result.images)).toBe(true);
      expect(result.errors).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.timestamp).toBeDefined();
    });

    it('should handle file processing errors gracefully', async () => {
      const { processUnifiedContext } = dependencies.contextProcessor;

      const result = await processUnifiedContext({
        files: ['/nonexistent/file.txt'],
        images: [],
        webSearch: null,
      });

      // Should handle errors gracefully
      expect(result).toBeDefined();
      // Errors should be included in failed list
      if (result.failed && result.failed.length > 0) {
        expect(result.failed[0].error).toBeDefined();
      }
    });
  });

  describe('Continuation Store Integration', () => {
    it('should store and retrieve conversation state', async () => {
      const store = dependencies.continuationStore;
      const { generateContinuationId } = await import(
        '../../../src/continuationStore.js'
      );

      const testConversation = {
        messages: [
          { role: 'user', content: 'Test message' },
          { role: 'assistant', content: 'Test response' },
        ],
        provider: 'openai',
        model: 'gpt-4o-mini',
      };

      const conversationId = generateContinuationId();
      await store.set(conversationId, testConversation);
      expect(conversationId).toBeDefined();
      expect(conversationId.startsWith('conv_')).toBe(true);

      const retrieved = await store.get(conversationId);
      expect(retrieved).toBeDefined();
      expect(retrieved.messages).toEqual(testConversation.messages);

      // Clean up
      await store.delete(conversationId);
    });

    it('should provide statistics', async () => {
      const store = dependencies.continuationStore;
      const stats = await store.getStats();

      expect(stats).toBeDefined();
      expect(typeof stats.totalConversations).toBe('number');
      expect(stats.memoryUsage).toBeDefined();
      expect(typeof stats.memoryUsage.heapUsed).toBe('number');
      expect(typeof stats.memoryUsage.rss).toBe('number');
      expect(stats.backend).toBe('memory');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle missing required parameters', async () => {
      const chatTool = tools.chat;

      try {
        await chatTool(
          {
            // Missing required prompt
          },
          dependencies,
        );
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toContain('prompt');
      }
    });

    it('should handle consensus tool validation', async () => {
      const consensusTool = tools.consensus;

      try {
        await consensusTool(
          {
            prompt: 'Test',
            // Missing required models array
          },
          dependencies,
        );
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toMatch(/(models|required)/i);
      }
    });

    it('should handle invalid continuation IDs', async () => {
      const chatTool = tools.chat;

      const result = await chatTool(
        {
          prompt: 'Test message',
          continuation_id: 'invalid-continuation-id',
        },
        dependencies,
      );

      // Should handle gracefully and create new conversation
      expect(result.content).toBeDefined();
      expect(result.continuation).toBeDefined();
    });
  });

  describe('Performance Integration', () => {
    it('should complete tool execution within reasonable time', async () => {
      const chatTool = tools.chat;
      const startTime = Date.now();

      await chatTool(
        {
          prompt: 'Quick test',
        },
        dependencies,
      );

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    });

    it('should handle concurrent tool executions', async () => {
      const chatTool = tools.chat;
      const requests = [];
      const concurrency = 3;

      for (let i = 0; i < concurrency; i++) {
        requests.push(
          chatTool(
            {
              prompt: `Concurrent test ${i}`,
            },
            dependencies,
          ),
        );
      }

      const results = await Promise.all(requests);

      results.forEach((result, index) => {
        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');
      });
    });
  });
});
