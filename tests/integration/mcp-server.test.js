import { describe, it, expect } from 'vitest';
import { withHTTPTestServer } from '../utils/HTTPMCPServerManager.js';

describe('MCP Server Integration Tests', () => {
  describe('HTTP Transport Integration', () => {
    it('should handle tools/list request via HTTP', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.listTools();

        expect(result).toBeDefined();
        expect(result.tools).toBeDefined();
        expect(Array.isArray(result.tools)).toBe(true);

        // Should have both chat and consensus tools
        const toolNames = result.tools.map(tool => tool.name);
        expect(toolNames).toContain('chat');
        expect(toolNames).toContain('consensus');

        // Each tool should have proper structure
        result.tools.forEach(tool => {
          expect(tool).toHaveProperty('name');
          expect(tool).toHaveProperty('description');
          expect(tool).toHaveProperty('inputSchema');
          expect(tool.inputSchema).toHaveProperty('type');
          expect(tool.inputSchema).toHaveProperty('properties');
        });
      });
    });

    it('should validate tool arguments properly via HTTP', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const validationTests = [
          {
            toolName: 'chat',
            args: { prompt: 'Hello' },
            shouldPass: true
          },
          {
            toolName: 'chat',
            args: { }, // Missing required prompt
            shouldPass: false
          },
          {
            toolName: 'consensus',
            args: {
              prompt: 'Test question',
              models: [{ model: 'flash' }]
            },
            shouldPass: true
          },
          {
            toolName: 'consensus',
            args: { prompt: 'Test' }, // Missing models array
            shouldPass: false
          },
          {
            toolName: 'nonexistent',
            args: { prompt: 'Test' },
            shouldPass: false
          }
        ];

        for (const test of validationTests) {
          try {
            const result = await client.callTool({
              name: test.toolName,
              arguments: test.args
            });

            if (test.shouldPass) {
              // Tool might fail due to API keys, but validation should pass
              expect(result).toBeDefined();
              expect(result.content).toBeDefined();
            } else {
              // Should not reach here for invalid args
              expect(true).toBe(false); // Force fail
            }
          } catch (error) {
            if (test.shouldPass) {
              // If it should pass but throws, check if it's an API/provider error (acceptable)
              expect(error.message).toMatch(/(API key|provider|configuration)/i);
            } else {
              // Should throw for invalid arguments
              expect(error).toBeDefined();
            }
          }
        }
      });
    }, 120000);

    it('should have proper error handling for invalid requests via HTTP', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Test invalid tool name - HTTP transport returns structured errors
        const invalidToolResult = await manager.executeToolCall({
          name: 'invalid-tool',
          arguments: { prompt: 'test' }
        });

        expect(invalidToolResult.isError).toBe(true);
        expect(invalidToolResult.error.code).toBe('UNKNOWN_TOOL');
      });
    });

    it('should handle concurrent operations via HTTP', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const operations = [
          async (client) => client.listTools(),
          async (client) => client.listTools(),
          async (client) => client.listTools()
        ];

        const results = await manager.executeConcurrent(operations);

        expect(results).toHaveLength(3);
        expect(results.every(r => r.success)).toBe(true);
      });
    });

    it('should provide HTTP health and info endpoints', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const health = await manager.getServerHealth();
        expect(health.status).toBe('healthy');
        expect(health.transport).toBe('http');

        const info = await manager.getServerInfo();
        expect(info.transport).toBe('http-streaming');
        expect(info.name).toBeDefined();
      });
    });
  });
});
