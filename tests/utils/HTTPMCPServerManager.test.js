/**
 * Tests for HTTPMCPServerManager
 * 
 * Comprehensive test suite for HTTP-based MCP server management
 * that replaces stdio-based subprocess management.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { HTTPMCPServerManager, createHTTPTestServer, withHTTPTestServer } from './HTTPMCPServerManager.js';

describe('HTTPMCPServerManager', () => {
  let manager;

  beforeEach(() => {
    manager = new HTTPMCPServerManager({
      port: 0, // Use random port for each test
      debugMode: false
    });
  });

  afterEach(async () => {
    if (manager && manager.isRunning()) {
      await manager.stopServer();
    }
  });

  describe('Server Lifecycle', () => {
    test('should start and stop server successfully', async () => {
      expect(manager.isRunning()).toBe(false);
      
      await manager.startServer();
      expect(manager.isRunning()).toBe(true);
      
      const connectionInfo = manager.getConnectionInfo();
      expect(connectionInfo.port).toBeGreaterThan(0);
      expect(connectionInfo.host).toBe('localhost');
      expect(connectionInfo.baseUrl).toContain('http://localhost:');
      
      await manager.stopServer();
      expect(manager.isRunning()).toBe(false);
    }, 30000);

    test('should not allow starting already started server', async () => {
      await manager.startServer();
      
      await expect(manager.startServer()).rejects.toThrow('already started');
    }, 30000);

    test('should handle stopping non-started server gracefully', async () => {
      await expect(manager.stopServer()).resolves.not.toThrow();
    });

    test('should timeout if startup takes too long', async () => {
      const slowManager = new HTTPMCPServerManager({
        port: 0,
        startupTimeout: 1 // Very short timeout (1ms)
      });
      
      // This should timeout because the startup process takes longer than 1ms
      await expect(slowManager.startServer()).rejects.toThrow('timeout');
    }, 10000);
  });

  describe('Client Connection', () => {
    beforeEach(async () => {
      await manager.startServer();
    });

    test('should provide working MCP client', async () => {
      const client = manager.getClient();
      expect(client).toBeDefined();
      
      const tools = await client.listTools();
      expect(tools).toBeDefined();
      expect(tools.tools).toBeInstanceOf(Array);
    });

    test('should throw error when getting client before start', () => {
      const newManager = new HTTPMCPServerManager();
      expect(() => newManager.getClient()).toThrow('not started');
    });
  });

  describe('Tool Operations', () => {
    beforeEach(async () => {
      await manager.startServer();
    });

    test('should list tools successfully', async () => {
      const tools = await manager.listTools();
      expect(tools).toBeDefined();
      expect(tools.tools).toBeInstanceOf(Array);
      expect(tools.tools.length).toBeGreaterThan(0);
      
      // Check for expected tools
      const toolNames = tools.tools.map(t => t.name);
      expect(toolNames).toContain('chat');
      expect(toolNames).toContain('consensus');
    });

    test('should execute tool calls successfully', async () => {
      const result = await manager.executeToolCall({
        name: 'chat',
        arguments: {
          prompt: 'Test message',
          model: 'auto'
        }
      });
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
    }, 60000);

    test('should handle tool call timeout', async () => {
      await expect(
        manager.executeToolCall({
          name: 'chat',
          arguments: {
            prompt: 'Test message',
            model: 'auto'
          }
        }, 1) // 1ms timeout
      ).rejects.toThrow('timeout');
    });

    test('should handle invalid tool calls', async () => {
      const result = await manager.executeToolCall({
        name: 'nonexistent-tool',
        arguments: {}
      });
      
      // Should return an error response rather than throwing
      expect(result).toBeDefined();
      expect(result.isError).toBe(true);
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('UNKNOWN_TOOL');
    });
  });

  describe('HTTP Endpoints', () => {
    beforeEach(async () => {
      await manager.startServer();
    });

    test('should provide health endpoint', async () => {
      const health = await manager.getServerHealth();
      expect(health).toBeDefined();
      expect(health.status).toBe('healthy');
      expect(health.transport).toBe('http');
      expect(typeof health.sessions).toBe('number');
    });

    test('should provide info endpoint', async () => {
      const info = await manager.getServerInfo();
      expect(info).toBeDefined();
      expect(info.name).toBeDefined();
      expect(info.transport).toBe('http-streaming');
      expect(info.endpoints).toBeDefined();
    });

    test('should handle HTTP endpoint errors gracefully', async () => {
      // Stop the server to cause endpoint failures
      await manager.stopServer();
      
      await expect(manager.getServerHealth()).rejects.toThrow();
      await expect(manager.getServerInfo()).rejects.toThrow();
    });
  });

  describe('Session Management', () => {
    beforeEach(async () => {
      await manager.startServer();
    });

    test('should create session for isolation', async () => {
      const sessionId = await manager.createSession();
      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBeGreaterThan(0);
    });

    test('should handle concurrent operations', async () => {
      const operations = [
        async (client) => client.callTool({
          name: 'chat',
          arguments: { prompt: 'Test 1', model: 'auto' }
        }),
        async (client) => client.callTool({
          name: 'chat',
          arguments: { prompt: 'Test 2', model: 'auto' }
        }),
        async (client) => client.callTool({
          name: 'chat',
          arguments: { prompt: 'Test 3', model: 'auto' }
        })
      ];

      const results = await manager.executeConcurrent(operations);
      
      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
    }, 60000);
  });

  describe('Health and Status', () => {
    test('should provide health status when stopped', () => {
      const status = manager.getHealthStatus();
      expect(status.isStarted).toBe(false);
      expect(status.transport).toBe('http');
    });

    test('should provide health status when running', async () => {
      await manager.startServer();
      
      const status = manager.getHealthStatus();
      expect(status.isStarted).toBe(true);
      expect(status.hasClient).toBe(true);
      expect(status.hasTransport).toBe(true);
      expect(status.connection.port).toBeGreaterThan(0);
    });

    test('should perform basic functionality test', async () => {
      await manager.startServer();
      
      const testResult = await manager.performBasicTest();
      expect(testResult.success).toBe(true);
      expect(testResult.tools).toBeGreaterThan(0);
      expect(testResult.health).toBe('healthy');
    }, 30000);
  });

  describe('Error Handling', () => {
    test('should handle port conflicts gracefully', async () => {
      // Start first manager on a specific port
      const manager1 = new HTTPMCPServerManager({ port: 31234 });
      await manager1.startServer();
      
      try {
        // Try to start second manager on same port
        const manager2 = new HTTPMCPServerManager({ port: 31234 });
        await expect(manager2.startServer()).rejects.toThrow();
      } finally {
        await manager1.stopServer();
      }
    }, 30000);

    test('should cleanup resources on error', async () => {
      // Use invalid configuration to trigger error
      const badManager = new HTTPMCPServerManager({
        port: -1 // Invalid port
      });
      
      await expect(badManager.startServer()).rejects.toThrow();
      expect(badManager.isRunning()).toBe(false);
    });
  });

  describe('Utility Functions', () => {
    test('createHTTPTestServer should work', () => {
      const testManager = createHTTPTestServer({ port: 0 });
      expect(testManager).toBeInstanceOf(HTTPMCPServerManager);
    });

    test('withHTTPTestServer should manage lifecycle', async () => {
      let clientReceived = null;
      let managerReceived = null;
      
      const result = await withHTTPTestServer(async (client, manager) => {
        clientReceived = client;
        managerReceived = manager;
        
        const tools = await client.listTools();
        return tools.tools.length;
      });
      
      expect(clientReceived).toBeDefined();
      expect(managerReceived).toBeDefined();
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
      
      // Manager should be stopped after the function
      expect(managerReceived.isRunning()).toBe(false);
    }, 30000);
  });

  describe('Configuration Options', () => {
    test('should respect custom host and port', async () => {
      const customManager = new HTTPMCPServerManager({
        host: '127.0.0.1',
        port: 0
      });
      
      await customManager.startServer();
      
      try {
        const connectionInfo = customManager.getConnectionInfo();
        expect(connectionInfo.host).toBe('127.0.0.1');
        expect(connectionInfo.baseUrl).toContain('127.0.0.1');
      } finally {
        await customManager.stopServer();
      }
    }, 30000);

    test('should respect environment variables', async () => {
      const envManager = new HTTPMCPServerManager({
        env: {
          LOG_LEVEL: 'debug',
          TEST_VALUE: 'test123'
        }
      });
      
      await envManager.startServer();
      
      try {
        expect(process.env.TEST_VALUE).toBe('test123');
      } finally {
        await envManager.stopServer();
      }
    }, 30000);
  });
});