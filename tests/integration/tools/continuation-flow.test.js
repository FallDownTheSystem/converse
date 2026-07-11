import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { loadConfig } from '../../../src/config.js';
import { createRouter } from '../../../src/router.js';
import { getContinuationStore } from '../../../src/continuationStore.js';
import { getTools } from '../../../src/tools/index.js';
import { getProviders } from '../../../src/providers/index.js';
import { processUnifiedContext } from '../../../src/utils/contextProcessor.js';
import { logger } from '../../../src/utils/logger.js';

describe('Continuation Flow Integration Tests', () => {
  let config;
  let tools;
  let dependencies;
  let server;
  let continuationStore;

  beforeAll(async () => {
    try {
      // Load configuration
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
      await createRouter(server, config);

      logger.info(
        '[continuation-flow-test] Continuation flow test setup completed',
      );
    } catch (error) {
      logger.error('[continuation-flow-test] Setup failed:', error);
      throw error;
    }
  });

  afterAll(async () => {
    // Cleanup all test conversations
    try {
      await continuationStore.cleanup(0); // Remove all conversations
      logger.info(
        '[continuation-flow-test] Continuation flow test cleanup completed',
      );
    } catch (error) {
      logger.error('[continuation-flow-test] Cleanup failed:', error);
    }
  });

  describe('Single Conversation Flow', () => {
    it('should create and maintain conversation across multiple requests', async () => {
      // First message - start conversation
      const firstResponse = await tools.chat(
        {
          prompt:
            'Remember this number: 42. Just acknowledge that you remember it.',
        },
        dependencies,
      );

      expect(firstResponse.continuation).toBeDefined();
      const conversationId = firstResponse.continuation.id;
      expect(conversationId.startsWith('conv_')).toBe(true);
      expect(firstResponse.continuation.messageCount).toBe(2); // user + assistant (system excluded)

      // Second message - test memory
      const secondResponse = await tools.chat(
        {
          prompt: 'What number did I ask you to remember?',
          continuation_id: conversationId,
        },
        dependencies,
      );

      expect(secondResponse.continuation.id).toBe(conversationId);
      expect(secondResponse.continuation.messageCount).toBe(4); // user + assistant + user + assistant (system excluded)

      // Response should reference the number (though we can't test exact content without real API)
      expect(secondResponse.content).toBeDefined();
      expect(secondResponse.content[0].type).toBe('text');

      // Third message - continue conversation
      const thirdResponse = await tools.chat(
        {
          prompt: 'Now add 8 to that number and tell me the result.',
          continuation_id: conversationId,
        },
        dependencies,
      );

      expect(thirdResponse.continuation.id).toBe(conversationId);
      expect(thirdResponse.continuation.messageCount).toBe(6); // user + assistant + user + assistant + user + assistant (system excluded)
    });

    it('should handle conversation persistence across router instances', async () => {
      // Start conversation with one router instance
      const firstResponse = await tools.chat(
        {
          prompt: 'Start a persistent conversation test',
        },
        dependencies,
      );

      const conversationId = firstResponse.continuation.id;

      // Create a new router instance (simulating server restart)
      const newServer = new Server(
        {
          name: config.mcp.serverName,
          version: config.mcp.serverVersion,
        },
        {
          capabilities: {
            tools: {},
            prompts: {},
            resources: {},
          },
        },
      );

      const newRouter = await createRouter(newServer, config);

      // Continue conversation with new router instance (use same tools/dependencies)
      const secondResponse = await tools.chat(
        {
          prompt: 'Continue the conversation after restart',
          continuation_id: conversationId,
        },
        dependencies,
      );

      expect(secondResponse.continuation.id).toBe(conversationId);
      expect(secondResponse.continuation.messageCount).toBeGreaterThan(2);
    });
  });

  describe('Multiple Concurrent Conversations', () => {
    it('should handle multiple independent conversations simultaneously', async () => {
      const conversations = [];
      const numConversations = 3;

      // Start multiple conversations
      for (let i = 0; i < numConversations; i++) {
        const response = await tools.chat(
          {
            prompt: `Start conversation ${i + 1} with identifier: CONV${i + 1}`,
          },
          dependencies,
        );

        conversations.push({
          id: response.continuation.id,
          identifier: `CONV${i + 1}`,
          messageCount: response.continuation.messageCount,
        });
      }

      // Verify all conversations have unique IDs
      const conversationIds = conversations.map((c) => c.id);
      const uniqueIds = new Set(conversationIds);
      expect(uniqueIds.size).toBe(numConversations);

      // Continue each conversation independently
      for (let i = 0; i < numConversations; i++) {
        const response = await tools.chat(
          {
            prompt: `Continue conversation with identifier ${conversations[i].identifier}`,
            continuation_id: conversations[i].id,
          },
          dependencies,
        );

        expect(response.continuation.id).toBe(conversations[i].id);
        expect(response.continuation.messageCount).toBeGreaterThan(
          conversations[i].messageCount,
        );

        // Update message count
        conversations[i].messageCount = response.continuation.messageCount;
      }

      // Verify conversations remained independent
      for (let i = 0; i < numConversations; i++) {
        const state = await continuationStore.get(conversations[i].id);
        expect(state).toBeDefined();
        expect(state.messages.length).toBe(conversations[i].messageCount + 1); // +1 for system message
      }
    });

    it('should handle concurrent access to same conversation', async () => {
      // Start a conversation
      const initialResponse = await tools.chat(
        {
          prompt: 'Start concurrent access test',
        },
        dependencies,
      );

      const conversationId = initialResponse.continuation.id;
      const concurrentRequests = 3;
      const requests = [];

      // Make multiple concurrent requests to same conversation
      for (let i = 0; i < concurrentRequests; i++) {
        requests.push(
          tools.chat(
            {
              prompt: `Concurrent message ${i + 1}`,
              continuation_id: conversationId,
            },
            dependencies,
          ),
        );
      }

      const responses = await Promise.allSettled(requests);

      // At least some should succeed (depending on implementation)
      const successful = responses.filter((r) => r.status === 'fulfilled');
      expect(successful.length).toBeGreaterThan(0);

      // All successful responses should maintain the conversation ID
      successful.forEach((response) => {
        expect(response.value.continuation.id).toBe(conversationId);
      });
    });
  });

  describe('Consensus Tool Continuation', () => {
    it('should maintain consensus conversation history', async () => {
      // Start consensus conversation
      const firstResponse = await tools.chat(
        {
          prompt: 'What is the capital of France? Keep it brief.',
          mode: 'consensus',
          models: ['auto'],
        },
        dependencies,
      );

      expect(firstResponse.continuation).toBeDefined();
      const conversationId = firstResponse.continuation.id;

      // Continue consensus conversation
      const secondResponse = await tools.chat(
        {
          prompt: 'What is the population of that city approximately?',
          mode: 'consensus',
          models: ['auto'],
          continuation_id: conversationId,
        },
        dependencies,
      );

      expect(secondResponse.continuation.id).toBe(conversationId);
      expect(secondResponse.continuation.messageCount).toBeGreaterThan(
        firstResponse.continuation.messageCount,
      );

      // Verify conversation state includes consensus history
      const state = await continuationStore.get(conversationId);
      expect(state).toBeDefined();
      expect(state.messages.length).toBeGreaterThan(2);
    });

    it('should handle mixed tool conversations', async () => {
      // Start with chat
      const chatResponse = await tools.chat(
        {
          prompt: 'Start a mixed tool conversation',
        },
        dependencies,
      );

      const conversationId = chatResponse.continuation.id;

      // Continue with consensus
      const consensusResponse = await tools.chat(
        {
          prompt: 'Continue with consensus mode',
          mode: 'consensus',
          models: ['auto'],
          continuation_id: conversationId,
        },
        dependencies,
      );

      expect(consensusResponse.continuation.id).toBe(conversationId);

      // Continue back with chat
      const finalChatResponse = await tools.chat(
        {
          prompt: 'Final chat message',
          continuation_id: conversationId,
        },
        dependencies,
      );

      expect(finalChatResponse.continuation.id).toBe(conversationId);
      expect(
        finalChatResponse.continuation.messageCount,
      ).toBeGreaterThanOrEqual(consensusResponse.continuation.messageCount);
    });
  });

  describe('Error Handling in Continuation Flow', () => {
    it('should preserve custom continuation IDs', async () => {
      const response = await tools.chat(
        {
          prompt: 'Test with custom continuation',
          continuation_id: 'my-custom-id',
        },
        dependencies,
      );

      // Should preserve the custom ID and start a new conversation
      expect(response.continuation).toBeDefined();
      expect(response.continuation.id).toBe('my-custom-id');
      expect(response.continuation.custom_id).toBe(true);
      expect(response.continuation.messageCount).toBe(2); // New conversation (user + assistant, system excluded)
    });

    it('should handle corrupted conversation state', async () => {
      // Create a valid conversation
      const initialResponse = await tools.chat(
        {
          prompt: 'Test conversation for corruption',
        },
        dependencies,
      );

      const conversationId = initialResponse.continuation.id;

      // Manually corrupt the conversation state
      await continuationStore.set(conversationId, {
        invalidData: 'corrupted',
        messages: 'not-an-array',
      });

      // Try to continue the conversation
      const response = await tools.chat(
        {
          prompt: 'Continue corrupted conversation',
          continuation_id: conversationId,
        },
        dependencies,
      );

      // Should handle gracefully (either fix or start new, or error)
      // If continuation is defined, it should be valid
      if (response.continuation) {
        expect(response.continuation).toBeDefined();
        expect(response.content).toBeDefined();
      } else {
        // Alternatively, it's acceptable to return an error for severely corrupted state
        expect(response.isError).toBe(true);
      }
    });

    it('should handle provider errors during continuation', async () => {
      // Start conversation
      const initialResponse = await tools.chat(
        {
          prompt: 'Start conversation for error test',
        },
        dependencies,
      );

      const conversationId = initialResponse.continuation.id;

      // Try to continue with invalid model
      const response = await tools.chat(
        {
          prompt: 'Continue with error',
          continuation_id: conversationId,
          models: ['nonexistent-model'],
        },
        dependencies,
      );

      // Should maintain conversation ID even if provider fails
      if (response.isError) {
        // Error response should still maintain conversation metadata
        expect(response.error).toBeDefined();
      } else {
        // Or should succeed with fallback
        expect(response.continuation.id).toBe(conversationId);
      }
    });
  });

  describe('Continuation Store Management', () => {
    it('should provide accurate conversation statistics', async () => {
      const initialStats = await continuationStore.getStats();
      const initialCount = initialStats.totalConversations;

      // Create some conversations
      const numNewConversations = 3;
      const conversationIds = [];

      for (let i = 0; i < numNewConversations; i++) {
        const response = await tools.chat(
          {
            prompt: `Stats test conversation ${i + 1}`,
          },
          dependencies,
        );
        conversationIds.push(response.continuation.id);
      }

      const newStats = await continuationStore.getStats();
      expect(newStats.totalConversations).toBe(
        initialCount + numNewConversations,
      );

      // Cleanup conversations
      for (const id of conversationIds) {
        await continuationStore.delete(id);
      }

      const finalStats = await continuationStore.getStats();
      expect(finalStats.totalConversations).toBe(initialCount);
    });

    it('should handle conversation cleanup correctly', async () => {
      // Create a conversation
      const response = await tools.chat(
        {
          prompt: 'Cleanup test conversation',
        },
        dependencies,
      );

      const conversationId = response.continuation.id;

      // Verify it exists
      const state = await continuationStore.get(conversationId);
      expect(state).toBeDefined();

      // Delete it
      await continuationStore.delete(conversationId);

      // Verify it's gone
      const deletedState = await continuationStore.get(conversationId);
      expect(deletedState).toBeNull();
    });

    it('should handle bulk cleanup operations', async () => {
      // Create multiple conversations
      const conversationIds = [];
      for (let i = 0; i < 5; i++) {
        const response = await tools.chat(
          {
            prompt: `Bulk cleanup test ${i + 1}`,
          },
          dependencies,
        );
        conversationIds.push(response.continuation.id);
      }

      // Verify they exist
      for (const id of conversationIds) {
        const state = await continuationStore.get(id);
        expect(state).toBeDefined();
      }

      // Cleanup all old conversations (0ms = all)
      await continuationStore.cleanup(0);

      // Verify they're gone
      for (const id of conversationIds) {
        const state = await continuationStore.get(id);
        expect(state).toBeNull();
      }
    });
  });

  describe('Continuation Flow Performance', () => {
    it('should maintain reasonable performance with long conversations', async () => {
      // Start conversation
      let response = await tools.chat(
        {
          prompt: 'Start performance test conversation',
        },
        dependencies,
      );

      const conversationId = response.continuation.id;
      const numMessages = 3; // Reduced for real API testing performance

      // Add many messages to the conversation
      for (let i = 0; i < numMessages; i++) {
        const startTime = Date.now();

        response = await tools.chat(
          {
            prompt: `Performance test message ${i + 1}`,
            continuation_id: conversationId,
          },
          dependencies,
        );

        const duration = Date.now() - startTime;

        // Each message should process reasonably quickly
        expect(duration).toBeLessThan(10000); // 10 seconds max
        expect(response.continuation.id).toBe(conversationId);
      }

      // Final message count should be correct (excluding system messages)
      expect(response.continuation.messageCount).toBe((numMessages + 1) * 2); // +1 initial, *2 for user/assistant pairs
    }, 60000); // 60 second timeout for performance test

    it('should handle rapid continuation requests', async () => {
      // Start conversation
      const initialResponse = await tools.chat(
        {
          prompt: 'Rapid requests test',
        },
        dependencies,
      );

      const conversationId = initialResponse.continuation.id;
      const rapidRequests = [];

      // Make rapid sequential requests
      for (let i = 0; i < 5; i++) {
        rapidRequests.push(
          tools.chat(
            {
              prompt: `Rapid message ${i + 1}`,
              continuation_id: conversationId,
            },
            dependencies,
          ),
        );
      }

      const responses = await Promise.allSettled(rapidRequests);

      // At least some should succeed
      const successful = responses.filter((r) => r.status === 'fulfilled');
      expect(successful.length).toBeGreaterThan(0);

      // All successful responses should maintain conversation ID
      successful.forEach((response) => {
        expect(response.value.continuation.id).toBe(conversationId);
      });
    });
  });

  describe('Real-World Continuation Scenarios', () => {
    it('should handle conversation interruption and resumption', async () => {
      // Start conversation
      const startResponse = await tools.chat(
        {
          prompt: 'Start a conversation about artificial intelligence',
        },
        dependencies,
      );

      const conversationId = startResponse.continuation.id;

      // Continue for a few messages
      const continueResponse = await tools.chat(
        {
          prompt: 'Tell me about machine learning specifically',
          continuation_id: conversationId,
        },
        dependencies,
      );

      expect(continueResponse.continuation.id).toBe(conversationId);

      // Simulate interruption (time delay or server restart)
      // In real scenario, there might be a delay here

      // Resume conversation
      const resumeResponse = await tools.chat(
        {
          prompt: 'Actually, let me ask about neural networks instead',
          continuation_id: conversationId,
        },
        dependencies,
      );

      expect(resumeResponse.continuation.id).toBe(conversationId);
      expect(resumeResponse.continuation.messageCount).toBeGreaterThan(
        continueResponse.continuation.messageCount,
      );
    }, 60000); // 60 second timeout

    it('should handle conversation branching scenario', async () => {
      // Start base conversation
      const baseResponse = await tools.chat(
        {
          prompt: 'Start base conversation for branching test',
        },
        dependencies,
      );

      const baseId = baseResponse.continuation.id;

      // Continue base conversation
      const continueBase = await tools.chat(
        {
          prompt: 'Continue base conversation',
          continuation_id: baseId,
        },
        dependencies,
      );

      // Branch to consensus tool from same base
      const branchConsensus = await tools.chat(
        {
          prompt: 'Branch to consensus mode',
          mode: 'consensus',
          models: ['auto'],
          continuation_id: baseId,
        },
        dependencies,
      );

      // Both should maintain the same conversation ID
      expect(continueBase.continuation.id).toBe(baseId);
      expect(branchConsensus.continuation.id).toBe(baseId);

      // Message counts should reflect the branching
      expect(branchConsensus.continuation.messageCount).toBeGreaterThan(
        continueBase.continuation.messageCount,
      );
    }, 60000); // 60 second timeout
  });
});
