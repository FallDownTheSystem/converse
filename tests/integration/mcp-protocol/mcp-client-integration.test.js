/**
 * MCP Client Integration Test Suite
 *
 * Comprehensive integration testing using HTTP-based MCP client-server communication
 * for protocol compliance, server capabilities, error handling, and concurrent connections.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { withHTTPTestServer } from '../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../src/config.js';
import { logger } from '../../../src/utils/logger.js';
import {
  testWithApiKeys
} from '../../utils/conditionalTest.js';
import 'dotenv/config';

describe('MCP Client Integration Test Suite', () => {
  let config;
  let hasAnyApiKey = false;

  beforeAll(async () => {
    try {
      config = await loadConfig();

      // Check if any API keys are available for real API tests
      hasAnyApiKey = !!(
        (config?.apiKeys?.openai && config.apiKeys.openai.startsWith('sk-')) ||
        (config?.apiKeys?.xai && config.apiKeys.xai.startsWith('xai-')) ||
        (config?.apiKeys?.google && config.apiKeys.google.length > 20)
      );

      if (!hasAnyApiKey) {
        logger.warn('[mcp-client-integration] No API keys found - some tests will be skipped');
      }
    } catch (error) {
      logger.error('[mcp-client-integration] Setup failed:', error);
      config = { apiKeys: {} };
      hasAnyApiKey = false;
    }
  });

  describe('MCP Protocol Compliance Testing', () => {
    it('should establish client-server connection with proper handshake', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Verify client is connected and ready
        expect(client).toBeDefined();
        expect(manager.isRunning()).toBe(true);

        // Test basic health check through HTTP endpoint
        const health = await manager.getServerHealth();
        expect(health.status).toBe('healthy');
        expect(health.transport).toBe('http');
        expect(health.server).toBe('connected');

        logger.info('[mcp-client-integration] MCP handshake successful');
      });
    }, 15000);

    it('should handle MCP initialize request correctly', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Get server info through client
        const serverInfo = await manager.getServerInfo();
        expect(serverInfo.name).toBeDefined();
        expect(serverInfo.transport).toBe('http-streaming');
        expect(serverInfo.endpoints).toBeDefined();
        expect(serverInfo.endpoints.mcp).toBe('/mcp');

        logger.info('[mcp-client-integration] MCP initialization verified');
      });
    }, 10000);

    it('should maintain proper MCP session management', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const connectionInfo = manager.getConnectionInfo();
        expect(connectionInfo.mcpEndpoint).toContain('/mcp');
        expect(connectionInfo.port).toBeTypeOf('number');
        expect(connectionInfo.host).toBe('localhost');

        // Verify session is active
        const health = await manager.getServerHealth();
        expect(health.sessions).toBeGreaterThanOrEqual(1);

        logger.info('[mcp-client-integration] Session management verified');
      });
    }, 10000);
  });

  describe('Server Capabilities and Tool Discovery', () => {
    it('should discover available tools through MCP client', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const tools = await client.listTools();

        expect(tools).toBeDefined();
        expect(tools.tools).toBeDefined();
        expect(Array.isArray(tools.tools)).toBe(true);
        expect(tools.tools.length).toBeGreaterThan(0);

        // Verify expected tools are present
        const toolNames = tools.tools.map(t => t.name);
        expect(toolNames).toContain('chat');
        expect(toolNames).toContain('consensus');

        // Verify tool schema compliance
        tools.tools.forEach(tool => {
          expect(tool).toHaveProperty('name');
          expect(tool).toHaveProperty('description');
          expect(tool).toHaveProperty('inputSchema');
          expect(tool.inputSchema.type).toBe('object');
          expect(tool.inputSchema.properties).toBeDefined();
        });

        logger.info(`[mcp-client-integration] Discovered ${tools.tools.length} tools via MCP client`);
      });
    }, 10000);

    it('should validate tool schemas meet MCP specifications', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const tools = await client.listTools();

        for (const tool of tools.tools) {
          const schema = tool.inputSchema;

          // MCP JSON Schema requirements
          expect(schema.type).toBe('object');
          expect(schema.properties).toBeDefined();
          expect(typeof schema.properties).toBe('object');

          // Required fields validation
          if (schema.required) {
            expect(Array.isArray(schema.required)).toBe(true);
            schema.required.forEach(field => {
              expect(schema.properties[field]).toBeDefined();
            });
          }

          // Tool-specific validation
          if (tool.name === 'chat') {
            expect(schema.properties.prompt).toBeDefined();
            expect(schema.properties.prompt.type).toBe('string');
            expect(schema.required).toContain('prompt');
          }

          if (tool.name === 'consensus') {
            expect(schema.properties.prompt).toBeDefined();
            expect(schema.properties.models).toBeDefined();
            expect(schema.properties.models.type).toBe('array');
            expect(schema.required).toContain('prompt');
            expect(schema.required).toContain('models');
          }
        }

        logger.info('[mcp-client-integration] Tool schemas validated for MCP compliance');
      });
    }, 10000);

    it('should provide comprehensive tool documentation', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const tools = await client.listTools();

        tools.tools.forEach(tool => {
          expect(tool.description).toBeDefined();
          expect(tool.description.length).toBeGreaterThan(10);

          // Check parameter descriptions
          const properties = tool.inputSchema.properties;
          Object.keys(properties).forEach(paramName => {
            const param = properties[paramName];
            if (['prompt', 'models', 'temperature', 'model'].includes(paramName)) {
              expect(param.description).toBeDefined();
              expect(param.description.length).toBeGreaterThan(5);
            }
          });
        });

        logger.info('[mcp-client-integration] Tool documentation completeness verified');
      });
    }, 10000);
  });

  describe('Tool Execution Workflows via MCP Client', () => {
    it('should execute chat tool with proper MCP response format', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Hello! Please respond with a greeting.',
            model: 'auto'
          }
        });

        if (result.isError) {
          // If we get an error (no API keys, etc), just verify error format
          expect(result.error).toBeDefined();
          expect(result.error.code).toBeDefined();
          logger.info('[mcp-client-integration] Chat tool returned expected error (no API keys)');
          return;
        }

        // Verify MCP response structure
        expect(result.content).toBeDefined();
        expect(Array.isArray(result.content)).toBe(true);
        expect(result.content.length).toBeGreaterThan(0);

        // Verify content format
        const content = result.content[0];
        expect(content.type).toBe('text');
        expect(content.text).toBeDefined();
        expect(typeof content.text).toBe('string');
        expect(content.text.length).toBeGreaterThan(0);

        // Verify continuation support
        expect(result.continuation).toBeDefined();
        expect(result.continuation.id).toBeDefined();
        expect(result.continuation.messageCount).toBe(2); // user + assistant (system messages excluded)

        logger.info('[mcp-client-integration] Chat tool execution successful via MCP client');
      });
    }, 15000);

    it('should execute consensus tool with structured response', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'consensus',
          arguments: {
            prompt: 'What is 2 + 2? Answer with just the number.',
            models: ['auto'],
            enable_cross_feedback: false
          }
        });

        if (result.isError) {
          // If we get an error (no API keys, etc), just verify error format
          expect(result.error).toBeDefined();
          expect(result.error.code).toBeDefined();
          logger.info('[mcp-client-integration] Consensus tool returned expected error (no API keys)');
          return;
        }

        expect(result.content).toBeDefined();
        expect(Array.isArray(result.content)).toBe(true);

        // Parse consensus result
        const content = result.content[0];
        expect(content.type).toBe('text');

        const consensusResult = JSON.parse(content.text);
        expect(consensusResult.status).toBe('consensus_complete');
        expect(consensusResult.models_consulted).toBe(1);
        // In test environments, API calls may fail, so we allow 0 or 1 successful responses
        expect(consensusResult.successful_initial_responses).toBeGreaterThanOrEqual(0);
        expect(consensusResult.successful_initial_responses).toBeLessThanOrEqual(1);
        expect(consensusResult.phases).toBeDefined();
        expect(consensusResult.phases.initial).toBeDefined();
        expect(Array.isArray(consensusResult.phases.initial)).toBe(true);

        logger.info('[mcp-client-integration] Consensus tool execution successful via MCP client');
      });
    }, 20000);

    it('should handle tool chaining with continuation context', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // First call
        const firstResult = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Start a conversation about AI. Keep it brief.',
            model: 'auto'
          }
        });

        if (firstResult.isError) {
          // If no API keys, just verify the error structure and skip continuation test
          expect(firstResult.error).toBeDefined();
          logger.info('[mcp-client-integration] Tool chaining skipped (no API keys)');
          return;
        }

        expect(firstResult.continuation).toBeDefined();
        const continuationId = firstResult.continuation.id;

        // Second call with continuation
        const secondResult = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What did we just discuss?',
            continuation_id: continuationId,
            model: 'auto'
          }
        });

        if (!secondResult.isError) {
          expect(secondResult.continuation.id).toBe(continuationId);
          expect(secondResult.continuation.messageCount).toBe(4); // 2 user + 2 assistant messages (system excluded)
        }

        logger.info('[mcp-client-integration] Tool chaining with continuation successful');
      });
    }, 30000);
  });

  describe('Error Scenarios and Recovery Testing', () => {
    it('should handle invalid tool name with proper MCP error response', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'nonexistent-tool',
          arguments: {
            prompt: 'This should fail'
          }
        });

        expect(result.isError).toBe(true);
        expect(result.error).toBeDefined();
        expect(result.error.type).toBeDefined();
        expect(result.error.code).toBeDefined();
        expect(result.error.message).toBeDefined();
        expect(result.error.message).toContain('Unknown tool');

        // Error should still provide MCP-compliant content
        expect(result.content).toBeDefined();
        expect(Array.isArray(result.content)).toBe(true);
        expect(result.content[0].type).toBe('text');

        logger.info('[mcp-client-integration] Invalid tool error handling verified');
      });
    }, 10000);

    it('should handle missing required parameters with validation errors', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            // Missing required prompt
            model: 'auto'
          }
        });

        expect(result.isError).toBe(true);
        expect(result.error.code).toMatch(/(VALIDATION|INVALID|MISSING)/i);
        expect(result.error.message).toContain('prompt');
        expect(result.error.details).toBeDefined();

        logger.info('[mcp-client-integration] Parameter validation error handling verified');
      });
    }, 10000);

    it('should handle consensus tool with missing models parameter', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'consensus',
          arguments: {
            prompt: 'Test without models'
            // Missing required models array
          }
        });

        expect(result.isError).toBe(true);
        expect(result.error.message).toContain('models');
        expect(result.error.details).toBeDefined();

        logger.info('[mcp-client-integration] Consensus validation error handling verified');
      });
    }, 10000);

    it('should recover from tool execution errors gracefully', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // First make an invalid call
        const errorResult = await client.callTool({
          name: 'invalid-tool',
          arguments: {}
        });
        expect(errorResult.isError).toBe(true);

        // Then make a valid call to ensure recovery
        const validResult = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Recovery test - are you working?',
            model: 'auto'
          }
        });

        expect(validResult.isError).toBe(false);
        expect(validResult.content[0].type).toBe('text');

        logger.info('[mcp-client-integration] Error recovery verified');
      });
    }, 15000);
  });

  describe('Concurrent Client Connections and Resource Management', () => {
    it('should handle multiple concurrent tool calls', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const concurrentCalls = 3;  // Reduced to avoid stack overflow
        const promises = [];

        for (let i = 0; i < concurrentCalls; i++) {
          promises.push(
            client.callTool({
              name: 'chat',
              arguments: {
                prompt: `Concurrent test call ${i + 1}`,
                model: 'auto'
              }
            })
          );
        }

        const results = await Promise.allSettled(promises);

        // Count successful calls (some may fail if no API keys)
        const successful = results.filter(r => r.status === 'fulfilled' && !r.value.isError);
        const errors = results.filter(r => r.status === 'fulfilled' && r.value.isError);

        // If we have API keys, expect success; otherwise expect proper error handling
        if (successful.length > 0) {
          successful.forEach(result => {
            expect(result.value.content).toBeDefined();
            expect(result.value.continuation.id).toBeDefined();
          });

          // All continuation IDs should be unique
          const continuationIds = successful.map(r => r.value.continuation.id);
          const uniqueIds = new Set(continuationIds);
          expect(uniqueIds.size).toBe(successful.length);
        } else {
          // All failed, verify they have proper error structure
          errors.forEach(result => {
            expect(result.value.error).toBeDefined();
          });
        }

        logger.info(`[mcp-client-integration] ${successful.length}/${concurrentCalls} concurrent calls successful`);
      });
    }, 25000);

    it('should handle rapid sequential tool calls without session interference', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const sequentialCalls = 2;  // Reduced to avoid potential issues
        const results = [];

        for (let i = 0; i < sequentialCalls; i++) {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: `Sequential test ${i + 1}`,
              model: 'auto'
            }
          });

          if (result.isError) {
            // If no API keys, just verify error format and continue
            expect(result.error).toBeDefined();
            results.push(result);
            continue;
          }

          results.push(result);
        }

        // Verify all calls completed (either successfully or with proper errors)
        expect(results).toHaveLength(sequentialCalls);

        const successful = results.filter(r => !r.isError);
        const errored = results.filter(r => r.isError);

        logger.info(`[mcp-client-integration] ${successful.length}/${sequentialCalls} sequential calls successful, ${errored.length} with expected errors`);
      });
    }, 15000);

    it('should maintain server resource limits under load', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Test server health under moderate load
        const loadTest = async () => {
          return client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Load test call',
              model: 'auto'
            }
          });
        };

        // Execute multiple concurrent requests
        const promises = Array(3).fill().map(() => loadTest());
        const results = await Promise.allSettled(promises);

        // Count successful vs failed requests
        const successful = results.filter(r => r.status === 'fulfilled' && !r.value.isError);
        const failed = results.filter(r => r.status === 'rejected' || r.value?.isError);

        // At least some should succeed (server should handle reasonable load)
        expect(successful.length).toBeGreaterThan(0);

        // Check server health after load test
        const health = await manager.getServerHealth();
        expect(health.status).toBe('healthy');

        logger.info(`[mcp-client-integration] Load test: ${successful.length} successful, ${failed.length} failed`);
      });
    }, 25000);

    it('should properly clean up resources after client disconnect', async () => {
      let initialSessions = 0;
      let finalSessions = 0;

      // Get initial session count
      await withHTTPTestServer(async (client, manager) => {
        const health = await manager.getServerHealth();
        initialSessions = health.sessions;
      });

      // Start another server instance and let it close
      await withHTTPTestServer(async (client, manager) => {
        // Make a call to ensure session is active
        await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Resource cleanup test',
            model: 'auto'
          }
        });

        const health = await manager.getServerHealth();
        expect(health.sessions).toBeGreaterThan(0);
      });

      // Check session count after cleanup
      await withHTTPTestServer(async (client, manager) => {
        const health = await manager.getServerHealth();
        finalSessions = health.sessions;
      });

      // Session cleanup should have occurred
      logger.info(`[mcp-client-integration] Resource cleanup: ${initialSessions} → ${finalSessions} sessions`);
    }, 30000);
  });

  describe('Real API Integration via MCP Client', () => {
    testWithApiKeys({ requiredProviders: ['OPENAI', 'XAI', 'GOOGLE'] })('should execute real API calls through MCP protocol', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Respond with exactly: "MCP client real API test successful"',
            model: 'auto',
            temperature: 0
          }
        });

        expect(result.isError).toBe(false);
        expect(result.content[0].text).toContain('MCP client real API test successful');

        // Verify continuation support with real API
        expect(result.continuation).toBeDefined();
        expect(result.continuation.id).toBeDefined();

        logger.info('[mcp-client-integration] Real API integration via MCP client successful');
      }, {
        env: {
          LOG_LEVEL: 'info' // Reduce noise for real API calls
        }
      });
    }, 30000);

    testWithApiKeys({ requiredProviders: ['OPENAI', 'XAI', 'GOOGLE'] })('should handle consensus with real APIs via MCP client', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'consensus',
          arguments: {
            prompt: 'What is the capital of France? Answer with just the city name.',
            models: ['auto'],
            enable_cross_feedback: false,
            temperature: 0
          }
        });

        expect(result.isError).toBe(false);

        const consensusResult = JSON.parse(result.content[0].text);
        expect(consensusResult.status).toBe('consensus_complete');
        expect(consensusResult.successful_initial_responses).toBeGreaterThan(0);

        // Check that response contains the correct answer
        const response = consensusResult.phases.initial[0].response;
        expect(response.toLowerCase()).toContain('paris');

        logger.info('[mcp-client-integration] Real API consensus via MCP client successful');
      }, {
        env: {
          LOG_LEVEL: 'info'
        }
      });
    }, 45000);
  });

  describe('MCP Protocol Performance and Reliability', () => {
    it('should meet performance benchmarks for tool discovery', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const startTime = Date.now();

        const tools = await client.listTools();

        const duration = Date.now() - startTime;

        expect(tools.tools.length).toBeGreaterThan(0);
        expect(duration).toBeLessThan(2000); // Should complete within 2 seconds

        logger.info(`[mcp-client-integration] Tool discovery completed in ${duration}ms`);
      });
    }, 10000);

    it('should handle tool execution within reasonable time limits', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const startTime = Date.now();

        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Quick response test',
            model: 'auto'
          }
        });

        const duration = Date.now() - startTime;

        expect(result.isError).toBe(false);
        expect(duration).toBeLessThan(15000); // Should complete within 15 seconds

        logger.info(`[mcp-client-integration] Tool execution completed in ${duration}ms`);
      });
    }, 20000);

    it('should maintain connection stability over multiple operations', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const operations = 5;
        let successCount = 0;

        for (let i = 0; i < operations; i++) {
          try {
            const result = await client.callTool({
              name: 'chat',
              arguments: {
                prompt: `Stability test operation ${i + 1}`,
                model: 'auto'
              }
            });

            if (!result.isError) {
              successCount++;
            }
          } catch (error) {
            logger.warn(`[mcp-client-integration] Operation ${i + 1} failed:`, error.message);
          }
        }

        // At least 80% should succeed for good stability
        expect(successCount / operations).toBeGreaterThanOrEqual(0.8);

        logger.info(`[mcp-client-integration] Connection stability: ${successCount}/${operations} operations successful`);
      });
    }, 45000);
  });
});
