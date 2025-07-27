import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from '../../../src/config.js';
import { createRouter } from '../../../src/router.js';
import { logger } from '../../../src/utils/logger.js';

describe('Enhanced MCP Protocol Compliance Tests', () => {
  let config;
  let router;
  let server;

  beforeAll(async () => {
    try {
      // Load configuration
      config = await loadConfig();

      // Create MCP server with proper capabilities
      server = new Server(
        {
          name: config.mcp.name,
          version: config.mcp.version
        },
        {
          capabilities: {
            tools: {},
            prompts: {},
            resources: {}
          }
        }
      );

      // Create router with server and config (this sets up the MCP handlers)
      router = await createRouter(server, config);

      logger.info('[mcp-protocol-enhanced-test] Enhanced MCP protocol test setup completed');
    } catch (error) {
      logger.error('[mcp-protocol-enhanced-test] Setup failed:', error);
      throw error;
    }
  });

  afterAll(async () => {
    logger.info('[mcp-protocol-enhanced-test] Enhanced MCP protocol test cleanup completed');
  });

  describe('MCP SDK Integration', () => {
    it('should create server with proper MCP SDK structure', () => {
      expect(server).toBeDefined();
      expect(server.setRequestHandler).toBeTypeOf('function');
      expect(server.connect).toBeTypeOf('function');
      expect(server.close).toBeTypeOf('function');
    });

    it('should handle ListToolsRequestSchema correctly', async () => {
      // Use router to list tools (which uses proper MCP protocol internally)
      const response = await router.listTools();

      expect(response).toBeDefined();
      expect(response.tools).toBeDefined();
      expect(Array.isArray(response.tools)).toBe(true);

      // Validate MCP tools list response format
      expect(response.tools.length).toBeGreaterThan(0);

      response.tools.forEach(tool => {
        // Required MCP tool properties
        expect(tool.name).toBeTypeOf('string');
        expect(tool.description).toBeTypeOf('string');
        expect(tool.inputSchema).toBeDefined();

        // Input schema must be valid JSON Schema
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
        expect(typeof tool.inputSchema.properties).toBe('object');

        // Required fields validation
        if (tool.inputSchema.required) {
          expect(Array.isArray(tool.inputSchema.required)).toBe(true);
        }
      });
    });

    it('should handle CallToolRequestSchema correctly', async () => {
      // Test with valid chat request following MCP schema
      const validRequest = {
        name: 'chat',
        arguments: {
          prompt: 'Hello, this is an MCP protocol compliance test'
        }
      };

      const response = await router.callTool(validRequest);

      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
      expect(Array.isArray(response.content)).toBe(true);

      // Validate MCP content response format
      response.content.forEach(content => {
        expect(content.type).toBeDefined();
        expect(typeof content.type).toBe('string');

        // MCP content types
        expect(['text', 'image', 'resource'].includes(content.type)).toBe(true);

        if (content.type === 'text') {
          expect(content.text).toBeDefined();
          expect(typeof content.text).toBe('string');
        }
      });
    });

    it('should return proper MCP error responses', async () => {
      // Test with invalid tool name
      const invalidRequest = {
        name: 'nonexistent-tool',
        arguments: { prompt: 'test' }
      };

      const response = await router.callTool(invalidRequest);

      expect(response).toBeDefined();
      expect(response.isError).toBe(true);
      expect(response.error).toBeDefined();

      // MCP error response format
      expect(response.error.type).toBeTypeOf('string');
      expect(response.error.code).toBeTypeOf('string');
      expect(response.error.message).toBeTypeOf('string');

      // Content should still be provided for MCP compatibility
      expect(response.content).toBeDefined();
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content[0].type).toBe('text');
    });
  });

  describe('Tool Schema Compliance', () => {
    it('should have JSON Schema compliant input schemas', async () => {
      const toolsList = await router.listTools();

      toolsList.tools.forEach(tool => {
        const schema = tool.inputSchema;

        // JSON Schema Draft 7 compliance
        expect(schema.type).toBe('object');
        expect(schema.properties).toBeDefined();

        // Validate schema properties structure
        Object.entries(schema.properties).forEach(([propName, propSchema]) => {
          expect(propSchema.type).toBeDefined();

          if (propSchema.type === 'string') {
            if (propSchema.minLength) {
              expect(typeof propSchema.minLength).toBe('number');
            }
            if (propSchema.maxLength) {
              expect(typeof propSchema.maxLength).toBe('number');
            }
          }

          if (propSchema.type === 'array') {
            expect(propSchema.items).toBeDefined();
          }

          if (propSchema.type === 'number') {
            if (propSchema.minimum !== undefined) {
              expect(typeof propSchema.minimum).toBe('number');
            }
            if (propSchema.maximum !== undefined) {
              expect(typeof propSchema.maximum).toBe('number');
            }
          }
        });

        // Required fields must exist in properties
        if (schema.required) {
          schema.required.forEach(requiredField => {
            expect(schema.properties[requiredField]).toBeDefined();
          });
        }
      });
    });

    it('should provide comprehensive tool descriptions', async () => {
      const toolsList = await router.listTools();

      toolsList.tools.forEach(tool => {
        // Tool description should be informative
        expect(tool.description).toBeDefined();
        expect(tool.description.length).toBeGreaterThan(20);

        // Should describe the tool's purpose
        expect(tool.description).toMatch(/\w+.*\w+/); // At least two words

        // Property descriptions should be present for important fields
        const properties = tool.inputSchema.properties;

        if (properties.prompt) {
          expect(properties.prompt.description).toBeDefined();
          expect(properties.prompt.description.length).toBeGreaterThan(10);
        }

        if (properties.models) {
          expect(properties.models.description).toBeDefined();
          expect(properties.models.description.length).toBeGreaterThan(10);
        }
      });
    });
  });

  describe('Request/Response Cycle Compliance', () => {
    it('should handle complete request/response cycle for chat tool', async () => {
      // 1. List tools to get schema
      const toolsList = await router.listTools();
      const chatTool = toolsList.tools.find(t => t.name === 'chat');
      expect(chatTool).toBeDefined();

      // 2. Validate required parameters from schema
      expect(chatTool.inputSchema.required).toContain('prompt');

      // 3. Make valid call following schema
      const callRequest = {
        name: 'chat',
        arguments: {
          prompt: 'MCP compliance test message'
        }
      };

      const callResponse = await router.callTool(callRequest);

      // 4. Validate response format
      expect(callResponse.content).toBeDefined();
      expect(Array.isArray(callResponse.content)).toBe(true);
      expect(callResponse.content[0].type).toBe('text');
      expect(callResponse.content[0].text).toBeDefined();

      // 5. Validate continuation metadata
      expect(callResponse.continuation).toBeDefined();
      expect(callResponse.continuation.id).toBeDefined();
      expect(callResponse.continuation.id.startsWith('conv_')).toBe(true);
    });

    it('should handle complete request/response cycle for consensus tool', async () => {
      // 1. List tools to get schema
      const toolsList = await router.listTools();
      const consensusTool = toolsList.tools.find(t => t.name === 'consensus');
      expect(consensusTool).toBeDefined();

      // 2. Validate required parameters from schema
      expect(consensusTool.inputSchema.required).toContain('prompt');
      expect(consensusTool.inputSchema.required).toContain('models');

      // 3. Make valid call following schema
      const callRequest = {
        name: 'consensus',
        arguments: {
          prompt: 'MCP consensus compliance test',
          models: [{ model: 'auto' }]
        }
      };

      const callResponse = await router.callTool(callRequest);

      // 4. Validate response format
      expect(callResponse.content).toBeDefined();
      expect(Array.isArray(callResponse.content)).toBe(true);
      expect(callResponse.content[0].type).toBe('text');

      // 5. Validate structured JSON response
      const consensusResult = JSON.parse(callResponse.content[0].text);
      expect(consensusResult.status).toBeDefined();
      expect(consensusResult.models_consulted).toBeDefined();
      expect(consensusResult.phases).toBeDefined();
    });

    it('should validate argument types against schema', async () => {
      const validationTests = [
        {
          tool: 'chat',
          args: { prompt: 123 }, // Wrong type (should be string)
          shouldFail: true
        },
        {
          tool: 'chat',
          args: { prompt: 'valid string' },
          shouldFail: false
        },
        {
          tool: 'consensus',
          args: {
            prompt: 'test',
            models: 'not-an-array' // Wrong type (should be array)
          },
          shouldFail: true
        },
        {
          tool: 'consensus',
          args: {
            prompt: 'test',
            models: [{ model: 'auto' }]
          },
          shouldFail: false
        }
      ];

      for (const test of validationTests) {
        const response = await router.callTool({
          name: test.tool,
          arguments: test.args
        });

        if (test.shouldFail) {
          expect(response.isError).toBe(true);
          expect(response.error.code).toMatch(/(VALIDATION|INVALID|TYPE)/i);
        } else {
          // May still fail due to API keys, but validation should pass
          if (response.isError) {
            // If it fails, should be due to provider issues, not validation
            expect(response.error.code).not.toMatch(/(VALIDATION|INVALID|TYPE)/i);
          }
        }
      }
    });
  });

  describe('Error Handling Compliance', () => {
    it('should provide standardized error responses', async () => {
      const errorScenarios = [
        {
          name: 'invalid-tool',
          arguments: { prompt: 'test' },
          expectedErrorType: 'RouterError'
        },
        {
          name: 'chat',
          arguments: {}, // Missing required prompt
          expectedErrorType: 'ValidationError'
        },
        {
          name: 'consensus',
          arguments: { prompt: 'test' }, // Missing required models
          expectedErrorType: 'ValidationError'
        }
      ];

      for (const scenario of errorScenarios) {
        const response = await router.callTool(scenario);

        expect(response.isError).toBe(true);
        expect(response.error).toBeDefined();

        // Standard error structure
        expect(response.error.type).toBeDefined();
        expect(response.error.code).toBeDefined();
        expect(response.error.message).toBeDefined();
        expect(response.error.timestamp).toBeDefined();

        // Content must still be present for MCP compatibility
        expect(response.content).toBeDefined();
        expect(Array.isArray(response.content)).toBe(true);
        expect(response.content[0].type).toBe('text');
        expect(response.content[0].text).toContain('error');
      }
    });

    it('should include helpful error context', async () => {
      const response = await router.callTool({
        name: 'chat',
        arguments: {
          prompt: '', // Empty prompt (should fail validation)
          temperature: 'invalid' // Invalid type
        }
      });

      expect(response.isError).toBe(true);
      expect(response.error.details).toBeDefined();

      // Should provide details about what went wrong
      const errorMessage = response.error.message.toLowerCase();
      expect(errorMessage).toMatch(/(prompt|required|empty|validation|type|argument)/i);
    });
  });

  describe('Concurrency and Performance', () => {
    it('should handle concurrent MCP requests correctly', async () => {
      const concurrentRequests = 5;
      const requests = [];

      // Create multiple concurrent requests
      for (let i = 0; i < concurrentRequests; i++) {
        requests.push(
          router.callTool({
            name: 'chat',
            arguments: {
              prompt: `Concurrent MCP test ${i}`
            }
          })
        );
      }

      const results = await Promise.all(requests);

      // All requests should complete
      expect(results).toHaveLength(concurrentRequests);

      results.forEach((result, index) => {
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        expect(Array.isArray(result.content)).toBe(true);

        // Each should have unique continuation
        expect(result.continuation).toBeDefined();
        expect(result.continuation.id).toBeDefined();
      });

      // Continuation IDs should be unique
      const continuationIds = results.map(r => r.continuation?.id).filter(Boolean);
      const uniqueIds = new Set(continuationIds);
      expect(uniqueIds.size).toBe(continuationIds.length);
    });

    it('should maintain acceptable response times', async () => {
      const startTime = Date.now();

      // Test tools/list performance
      await router.listTools();
      const listTime = Date.now() - startTime;

      expect(listTime).toBeLessThan(50); // Should be very fast

      const callStart = Date.now();

      // Test basic tool call performance (without actual API call)
      await router.callTool({
        name: 'chat',
        arguments: { prompt: 'Performance test' }
      });

      const callTime = Date.now() - callStart;
      expect(callTime).toBeLessThan(20000); // Should complete within 20 seconds
    });
  });

  describe('Protocol Extension Support', () => {
    it('should support optional parameters correctly', async () => {
      const response = await router.callTool({
        name: 'chat',
        arguments: {
          prompt: 'Test with optional parameters',
          model: 'auto',
          temperature: 0.5,
          maxTokens: 100
        }
      });

      // Should accept optional parameters without error
      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
    });

    it('should handle future parameter extensions gracefully', async () => {
      const response = await router.callTool({
        name: 'chat',
        arguments: {
          prompt: 'Test with future parameters',
          futureParameter: 'unknown-value',
          anotherFutureParam: 123
        }
      });

      // Should not fail due to unknown parameters
      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
    });
  });

  describe('Full Protocol Workflow', () => {
    it('should complete full MCP workflow', async () => {
      // 1. Server capabilities check (implicit in server creation)
      expect(server).toBeDefined();

      // 2. List available tools
      const toolsList = await router.listTools();
      expect(toolsList.tools.length).toBeGreaterThan(0);

      // 3. Select a tool and examine its schema
      const chatTool = toolsList.tools.find(t => t.name === 'chat');
      expect(chatTool).toBeDefined();
      expect(chatTool.inputSchema.required).toContain('prompt');

      // 4. Execute tool with proper arguments
      const execution = await router.callTool({
        name: 'chat',
        arguments: {
          prompt: 'Complete MCP workflow test'
        }
      });

      expect(execution.content).toBeDefined();
      expect(execution.content[0].type).toBe('text');

      // 5. Continue conversation using continuation
      const continuation = await router.callTool({
        name: 'chat',
        arguments: {
          prompt: 'Follow-up message',
          continuation_id: execution.continuation.id
        }
      });

      expect(continuation.continuation.id).toBe(execution.continuation.id);
      expect(continuation.continuation.messageCount).toBeGreaterThan(1);

      logger.info('[mcp-protocol-enhanced-test] Full MCP workflow completed successfully');
    });
  });
});
