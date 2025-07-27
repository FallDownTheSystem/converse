import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createRouter } from '../../../src/router.js';
import { loadConfig } from '../../../src/config.js';
import { logger } from '../../../src/utils/logger.js';

describe('MCP Protocol Workflow Tests', () => {
  let config;
  let router;
  let server;

  beforeAll(async () => {
    // Load configuration
    config = await loadConfig();

    // Create MCP server instance
    server = new Server(
      {
        name: config.mcp.serverName,
        version: config.mcp.serverVersion
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
          resources: {}
        }
      }
    );

    // Create router with server and config
    router = await createRouter(server, config);

    logger.info('[mcp-protocol-test] MCP Protocol test setup completed');
  });

  afterAll(async () => {
    logger.info('[mcp-protocol-test] MCP Protocol test cleanup completed');
  });

  describe('Router Setup', () => {
    it('should create router with proper configuration', () => {
      expect(router).toBeDefined();
      expect(router.listTools).toBeDefined();
      expect(router.callTool).toBeDefined();
      expect(typeof router.listTools).toBe('function');
      expect(typeof router.callTool).toBe('function');
    });
  });

  describe('MCP Request/Response Protocol', () => {
    it('should handle ListToolsRequest with proper schema', async () => {
      const request = {
        method: 'tools/list',
        params: {}
      };

      // Test that router can handle the request directly
      const response = await router.listTools();

      expect(response).toBeDefined();
      expect(response.tools).toBeDefined();
      expect(Array.isArray(response.tools)).toBe(true);

      // Validate MCP protocol structure
      response.tools.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');

        // Input schema should be valid JSON Schema
        expect(tool.inputSchema).toHaveProperty('type');
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema).toHaveProperty('properties');

        if (tool.inputSchema.required) {
          expect(Array.isArray(tool.inputSchema.required)).toBe(true);
        }
      });
    });

    it('should handle CallToolRequest with proper schema validation', async () => {
      const validChatRequest = {
        method: 'tools/call',
        params: {
          name: 'chat',
          arguments: {
            prompt: 'Hello, this is a test message'
          }
        }
      };

      const response = await router.callTool(validChatRequest.params);

      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
      expect(Array.isArray(response.content)).toBe(true);

      // Each content item should follow MCP content schema
      response.content.forEach(item => {
        expect(item).toHaveProperty('type');
        expect(['text', 'image', 'resource'].includes(item.type)).toBe(true);

        if (item.type === 'text') {
          expect(item).toHaveProperty('text');
          expect(typeof item.text).toBe('string');
        }
      });
    });

    it('should return proper error responses for invalid tool calls', async () => {
      const invalidRequests = [
        {
          name: 'nonexistent-tool',
          arguments: { prompt: 'test' }
        },
        {
          name: 'chat',
          arguments: {} // Missing required prompt
        },
        {
          name: 'consensus',
          arguments: { prompt: 'test' } // Missing required models
        }
      ];

      for (const request of invalidRequests) {
        const response = await router.callTool(request);

        expect(response).toBeDefined();
        expect(response.isError).toBe(true);
        expect(response.error).toBeDefined();
        expect(response.error).toHaveProperty('type');
        expect(response.error).toHaveProperty('code');
        expect(response.error).toHaveProperty('message');
        expect(response.content).toBeDefined();
        expect(Array.isArray(response.content)).toBe(true);
      }
    });
  });

  describe('Tool Schema Validation', () => {
    it('should have valid JSON schemas for all tools', async () => {
      const toolsList = await router.listTools();

      for (const tool of toolsList.tools) {
        const schema = tool.inputSchema;

        // Basic JSON Schema validation
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

        // Tool-specific schema validation
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
    });

    it('should provide helpful descriptions for tools and parameters', async () => {
      const toolsList = await router.listTools();

      toolsList.tools.forEach(tool => {
        expect(tool.description).toBeDefined();
        expect(tool.description.length).toBeGreaterThan(10);

        // Check that key properties have descriptions
        const properties = tool.inputSchema.properties;

        if (properties.prompt) {
          expect(properties.prompt.description).toBeDefined();
        }

        if (properties.models) {
          expect(properties.models.description).toBeDefined();
        }

        if (properties.temperature) {
          expect(properties.temperature.description).toBeDefined();
        }
      });
    });
  });

  describe('MCP Content Protocol', () => {
    it('should return content in proper MCP format', async () => {
      const response = await router.callTool({
        name: 'chat',
        arguments: {
          prompt: 'Return a simple greeting'
        }
      });

      // Content should be an array
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content.length).toBeGreaterThan(0);

      // Each content item should follow MCP specification
      response.content.forEach(content => {
        expect(content).toHaveProperty('type');

        if (content.type === 'text') {
          expect(content).toHaveProperty('text');
          expect(typeof content.text).toBe('string');
        }
      });
    });

    it('should handle structured responses for consensus tool', async () => {
      const response = await router.callTool({
        name: 'consensus',
        arguments: {
          prompt: 'What is 1+1?',
          models: [{ model: 'auto' }]
        }
      });

      expect(response.content).toBeDefined();
      expect(Array.isArray(response.content)).toBe(true);

      // Consensus tool should return JSON content
      const content = response.content[0];
      expect(content.type).toBe('text');

      // Should be valid JSON
      expect(() => JSON.parse(content.text)).not.toThrow();

      const consensusResult = JSON.parse(content.text);
      expect(consensusResult).toHaveProperty('status');
      expect(consensusResult).toHaveProperty('models_consulted');
      expect(consensusResult).toHaveProperty('phases');
    });
  });

  describe('Error Response Protocol', () => {
    it('should return proper MCP error format', async () => {
      const response = await router.callTool({
        name: 'invalid-tool',
        arguments: {}
      });

      expect(response.isError).toBe(true);
      expect(response.error).toBeDefined();

      // Error should have proper structure
      expect(response.error).toHaveProperty('type');
      expect(response.error).toHaveProperty('code');
      expect(response.error).toHaveProperty('message');
      expect(response.error).toHaveProperty('timestamp');

      // Content should still be provided for MCP compatibility
      expect(response.content).toBeDefined();
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content[0].type).toBe('text');
    });

    it('should include helpful error context', async () => {
      const response = await router.callTool({
        name: 'chat',
        arguments: {
          // Missing required prompt
        }
      });

      expect(response.isError).toBe(true);
      expect(response.error.code).toMatch(/(VALIDATION|INVALID|MISSING)/i);
      expect(response.error.message).toContain('prompt');

      // Should include validation details
      expect(response.error.details).toBeDefined();
    });
  });

  describe('Tool Execution Flow', () => {
    it('should complete full tool execution workflow', async () => {
      // 1. List available tools
      const toolsList = await router.listTools();
      expect(toolsList.tools.length).toBeGreaterThan(0);

      // 2. Find chat tool
      const chatTool = toolsList.tools.find(t => t.name === 'chat');
      expect(chatTool).toBeDefined();

      // 3. Execute chat tool
      const result = await router.callTool({
        name: 'chat',
        arguments: {
          prompt: 'Complete workflow test'
        }
      });

      // 4. Verify result
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');

      logger.info('[mcp-protocol-test] Full tool execution workflow completed');
    });

    it('should handle tool chaining with continuation', async () => {
      // First call
      const firstResult = await router.callTool({
        name: 'chat',
        arguments: {
          prompt: 'Start a conversation'
        }
      });

      expect(firstResult.continuation).toBeDefined();
      const continuationId = firstResult.continuation.id;

      // Second call with continuation
      const secondResult = await router.callTool({
        name: 'chat',
        arguments: {
          prompt: 'Continue the conversation',
          continuation_id: continuationId
        }
      });

      expect(secondResult.continuation.id).toBe(continuationId);
      expect(secondResult.continuation.messageCount).toBeGreaterThan(1);

      logger.info('[mcp-protocol-test] Tool chaining with continuation completed');
    });
  });

  describe('Protocol Compliance', () => {
    it('should conform to MCP specification', async () => {
      // Test all required MCP protocol elements

      // 1. Tool listing
      const tools = await router.listTools();
      expect(tools.tools).toBeDefined();

      // 2. Tool execution
      const execution = await router.callTool({
        name: 'chat',
        arguments: { prompt: 'MCP compliance test' }
      });
      expect(execution.content).toBeDefined();

      logger.info('[mcp-protocol-test] MCP protocol compliance verified');
    });

    it('should handle concurrent MCP requests', async () => {
      const requests = [];
      const concurrency = 3;

      // Create multiple concurrent requests
      for (let i = 0; i < concurrency; i++) {
        requests.push(
          router.callTool({
            name: 'chat',
            arguments: {
              prompt: `Concurrent test ${i}`
            }
          })
        );
      }

      const results = await Promise.all(requests);

      // All should succeed
      results.forEach((result, index) => {
        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');
        logger.debug(`[mcp-protocol-test] Concurrent request ${index} completed`);
      });

      logger.info(`[mcp-protocol-test] ${concurrency} concurrent MCP requests completed`);
    });
  });
});
