import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MCPServerManager, createTestServer, withTestServer } from './MCPServerManager.js';

describe('MCPServerManager', () => {
  let manager;

  beforeEach(() => {
    manager = new MCPServerManager({
      startupTimeout: 10000, // Shorter timeout for tests
      shutdownTimeout: 3000
    });
  });

  afterEach(async () => {
    if (manager?.isRunning()) {
      await manager.stopServer();
    }
  });

  describe('Constructor and Configuration', () => {
    it('should create manager with default options', () => {
      const defaultManager = new MCPServerManager();
      
      expect(defaultManager.options.startupTimeout).toBe(15000);
      expect(defaultManager.options.shutdownTimeout).toBe(5000);
      expect(defaultManager.options.env.NODE_ENV).toBe('test');
      expect(defaultManager.options.env.LOG_LEVEL).toBe('silent');
      expect(defaultManager.isRunning()).toBe(false);
    });

    it('should merge custom options with defaults', () => {
      const customManager = new MCPServerManager({
        startupTimeout: 20000,
        env: {
          CUSTOM_VAR: 'test-value',
          LOG_LEVEL: 'debug'
        }
      });

      expect(customManager.options.startupTimeout).toBe(20000);
      expect(customManager.options.env.CUSTOM_VAR).toBe('test-value');
      expect(customManager.options.env.LOG_LEVEL).toBe('debug');
      expect(customManager.options.env.NODE_ENV).toBe('test');
    });

    it('should have correct initial state', () => {
      expect(manager.isRunning()).toBe(false);
      expect(manager.getStderrOutput()).toEqual([]);
      expect(manager.getStdoutOutput()).toEqual([]);
      expect(manager.getServerPid()).toBeNull();
      
      const health = manager.getHealthStatus();
      expect(health.isStarted).toBe(false);
      expect(health.hasClient).toBe(false);
      expect(health.hasTransport).toBe(false);
    });
  });

  describe('Server Lifecycle', () => {
    it('should start and stop server successfully', async () => {
      expect(manager.isRunning()).toBe(false);
      
      await manager.startServer();
      expect(manager.isRunning()).toBe(true);
      expect(manager.getServerPid()).toBeTruthy();
      
      const client = manager.getClient();
      expect(client).toBeDefined();
      expect(typeof client.callTool).toBe('function');
      
      await manager.stopServer();
      expect(manager.isRunning()).toBe(false);
    }, 20000);

    it('should throw error when starting already started server', async () => {
      await manager.startServer();
      
      await expect(manager.startServer()).rejects.toThrow('Server is already started');
      
      await manager.stopServer();
    }, 20000);

    it('should handle multiple stop calls gracefully', async () => {
      await manager.startServer();
      await manager.stopServer();
      
      // Second stop should not throw
      await expect(manager.stopServer()).resolves.toBeUndefined();
    }, 20000);

    it('should throw error when getting client from stopped server', async () => {
      expect(() => manager.getClient()).toThrow('Server is not started or client is not available');
    });
  });

  describe('Tool Operations', () => {
    beforeEach(async () => {
      await manager.startServer();
    }, 20000);

    it('should list available tools', async () => {
      const tools = await manager.listTools();
      
      expect(tools).toBeDefined();
      expect(tools.tools).toBeDefined();
      expect(Array.isArray(tools.tools)).toBe(true);
      expect(tools.tools.length).toBeGreaterThan(0);
      
      const toolNames = tools.tools.map(tool => tool.name);
      expect(toolNames).toContain('chat');
      expect(toolNames).toContain('consensus');
    });

    it('should execute tool calls successfully', async () => {
      const result = await manager.executeToolCall({
        name: 'chat',
        arguments: {
          prompt: 'Hello, test message'
        }
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBeTruthy();
    });

    it('should handle tool call timeouts', async () => {
      await expect(
        manager.executeToolCall({
          name: 'chat',
          arguments: {
            prompt: 'Test timeout'
          }
        }, 1) // 1ms timeout - should fail
      ).rejects.toThrow('Tool call timeout after 1ms');
    });

    it('should handle invalid tool calls', async () => {
      const result = await manager.executeToolCall({
        name: 'nonexistent-tool',
        arguments: {}
      });
      
      // Check that error response is returned (not thrown)
      expect(result.isError).toBe(true);
      expect(result.error.code).toBe('UNKNOWN_TOOL');
      expect(result.error.toolName).toBe('nonexistent-tool');
      expect(result.content[0].text).toContain('Unknown tool: nonexistent-tool');
    });
  });

  describe('Error Handling', () => {
    it('should handle server startup failures gracefully', async () => {
      const badManager = new MCPServerManager({
        serverPath: '/nonexistent/server.js',
        startupTimeout: 2000
      });

      await expect(badManager.startServer()).rejects.toThrow();
      expect(badManager.isRunning()).toBe(false);
    });

    it('should throw error when executing tools on stopped server', async () => {
      await expect(
        manager.executeToolCall({
          name: 'chat',
          arguments: { prompt: 'test' }
        })
      ).rejects.toThrow('Server is not started');
    });

    it('should throw error when listing tools on stopped server', async () => {
      await expect(manager.listTools()).rejects.toThrow('Server is not started');
    });
  });

  describe('Debugging and Monitoring', () => {
    it('should capture stderr output', async () => {
      await manager.startServer();
      
      const stderrOutput = manager.getStderrOutput();
      expect(Array.isArray(stderrOutput)).toBe(true);
      
      await manager.stopServer();
    }, 20000);

    it('should provide health status', async () => {
      const initialHealth = manager.getHealthStatus();
      expect(initialHealth.isStarted).toBe(false);
      expect(initialHealth.pid).toBeNull();
      
      await manager.startServer();
      
      const runningHealth = manager.getHealthStatus();
      expect(runningHealth.isStarted).toBe(true);
      expect(runningHealth.pid).toBeTruthy();
      expect(runningHealth.hasClient).toBe(true);
      expect(runningHealth.hasTransport).toBe(true);
      
      await manager.stopServer();
    }, 20000);
  });

  describe('Utility Functions', () => {
    it('should create test server with factory function', () => {
      const testServer = createTestServer({ startupTimeout: 5000 });
      
      expect(testServer).toBeInstanceOf(MCPServerManager);
      expect(testServer.options.startupTimeout).toBe(5000);
    });

    it('should run test with server lifecycle management', async () => {
      let clientReceived = null;
      let managerReceived = null;
      
      const result = await withTestServer(async (client, manager) => {
        clientReceived = client;
        managerReceived = manager;
        
        expect(client).toBeDefined();
        expect(manager.isRunning()).toBe(true);
        
        const tools = await client.listTools();
        expect(tools.tools.length).toBeGreaterThan(0);
        
        return 'test-result';
      });

      expect(result).toBe('test-result');
      expect(clientReceived).toBeDefined();
      expect(managerReceived).toBeDefined();
      expect(managerReceived.isRunning()).toBe(false); // Should be stopped after test
    }, 30000);

    it('should cleanup server even if test function throws', async () => {
      let managerRef = null;
      
      try {
        await withTestServer(async (client, manager) => {
          managerRef = manager;
          expect(manager.isRunning()).toBe(true);
          throw new Error('Test error');
        });
      } catch (error) {
        expect(error.message).toBe('Test error');
      }

      expect(managerRef).toBeDefined();
      expect(managerRef.isRunning()).toBe(false); // Should still be stopped
    }, 30000);
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple tool calls concurrently', async () => {
      await manager.startServer();
      
      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(
          manager.executeToolCall({
            name: 'chat',
            arguments: {
              prompt: `Concurrent test ${i}`
            }
          })
        );
      }

      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');
      });
      
      await manager.stopServer();
    }, 30000);
  });
});