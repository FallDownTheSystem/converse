import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  MCPTestClient, 
  createTestClient, 
  withTestClient, 
  createMultipleTestClients,
  stopMultipleTestClients 
} from './MCPTestClient.js';

describe('MCPTestClient', () => {
  let client;

  beforeEach(() => {
    client = new MCPTestClient({
      connectionTimeout: 10000,
      operationTimeout: 5000,
      debugMode: false
    });
  });

  afterEach(async () => {
    if (client?.isReady) {
      await client.stop();
    }
  });

  describe('Constructor and Configuration', () => {
    it('should create client with default options', () => {
      const defaultClient = new MCPTestClient();
      
      expect(defaultClient.options.maxRetries).toBe(3);
      expect(defaultClient.options.retryDelay).toBe(1000);
      expect(defaultClient.options.connectionTimeout).toBe(15000);
      expect(defaultClient.options.operationTimeout).toBe(30000);
      expect(defaultClient.isReady).toBe(false);
      expect(defaultClient.operationCount).toBe(0);
    });

    it('should merge custom options with defaults', () => {
      const customClient = new MCPTestClient({
        maxRetries: 5,
        retryDelay: 2000,
        debugMode: true,
        serverOptions: {
          startupTimeout: 20000
        }
      });

      expect(customClient.options.maxRetries).toBe(5);
      expect(customClient.options.retryDelay).toBe(2000);
      expect(customClient.options.debugMode).toBe(true);
      expect(customClient.serverManager.options.startupTimeout).toBe(20000);
    });

    it('should have correct initial state', () => {
      expect(client.isReady).toBe(false);
      expect(client.operationCount).toBe(0);
      expect(client.lastError).toBeNull();
      expect(client.startTime).toBeNull();
      
      const debugInfo = client.getDebugInfo();
      expect(debugInfo.isReady).toBe(false);
      expect(debugInfo.uptime).toBe(0);
    });
  });

  describe('Client Lifecycle', () => {
    it('should start and stop client successfully', async () => {
      expect(client.isReady).toBe(false);
      
      await client.start();
      expect(client.isReady).toBe(true);
      expect(client.startTime).toBeTruthy();
      
      await client.stop();
      expect(client.isReady).toBe(false);
    }, 20000);

    it('should throw error when starting already started client', async () => {
      await client.start();
      
      await expect(client.start()).rejects.toThrow('Test client is already started');
      
      await client.stop();
    }, 20000);

    it('should handle multiple stop calls gracefully', async () => {
      await client.start();
      await client.stop();
      
      // Second stop should not throw
      await expect(client.stop()).resolves.toBeUndefined();
    }, 20000);

    it('should throw error when calling operations on stopped client', async () => {
      await expect(client.listTools()).rejects.toThrow('Test client is not ready');
      await expect(client.callTool('chat', { prompt: 'test' })).rejects.toThrow('Test client is not ready');
      await expect(client.chat('test')).rejects.toThrow('Test client is not ready');
    });
  });

  describe('Tool Operations', () => {
    beforeEach(async () => {
      await client.start();
    }, 20000);

    it('should list available tools', async () => {
      const tools = await client.listTools();
      
      expect(tools).toBeDefined();
      expect(tools.tools).toBeDefined();
      expect(Array.isArray(tools.tools)).toBe(true);
      expect(tools.tools.length).toBeGreaterThan(0);
      
      const toolNames = tools.tools.map(tool => tool.name);
      expect(toolNames).toContain('chat');
      expect(toolNames).toContain('consensus');
    });

    it('should call tools using generic callTool method', async () => {
      const result = await client.callTool('chat', {
        prompt: 'Hello, test message',
        model: 'auto'
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBeTruthy();
    });

    it('should call chat tool using simplified interface', async () => {
      const result = await client.chat('Hello, simplified test', {
        model: 'auto',
        temperature: 0
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBeTruthy();
      expect(result.continuation).toBeDefined();
    });

    it('should call consensus tool using simplified interface', async () => {
      const result = await client.consensus('What is 2+2?', [
        { model: 'auto' }
      ], {
        enable_cross_feedback: false
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      
      const consensusResult = JSON.parse(result.content[0].text);
      expect(consensusResult.status).toBeDefined();
      expect(consensusResult.models_consulted).toBe(1);
    });

    it('should handle tool call timeouts', async () => {
      await expect(
        client.callTool('chat', { prompt: 'Test timeout' }, { timeout: 1 })
      ).rejects.toThrow('timeout');
    });

    it('should handle invalid tool calls', async () => {
      await expect(
        client.callTool('nonexistent-tool', {})
      ).rejects.toThrow();
    });
  });

  describe('Health Check', () => {
    beforeEach(async () => {
      await client.start();
    }, 20000);

    it('should perform health check successfully', async () => {
      const health = await client.healthCheck();
      
      expect(health.status).toBe('healthy');
      expect(health.server).toBeDefined();
      expect(health.performance).toBeDefined();
      expect(health.performance.listToolsMs).toBeGreaterThan(0);
      expect(health.performance.chatCallMs).toBeGreaterThan(0);
      expect(health.tools.count).toBeGreaterThan(0);
      expect(health.tools.available).toContain('chat');
      expect(health.chatWorking).toBe(true);
      expect(health.timestamp).toBeDefined();
    });
  });

  describe('Concurrent Operations', () => {
    beforeEach(async () => {
      await client.start();
    }, 20000);

    it('should execute concurrent operations successfully', async () => {
      const operations = [
        async (client) => await client.chat('Concurrent test 1'),
        async (client) => await client.chat('Concurrent test 2'),
        async (client) => await client.listTools()
      ];

      const results = await client.executeConcurrent(operations);
      
      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result.index).toBe(index);
        expect(result.success).toBe(true);
        expect(result.result).toBeDefined();
      });
    });

    it('should handle failed operations in concurrent execution', async () => {
      const operations = [
        async (client) => await client.chat('Success test'),
        async (client) => await client.callTool('invalid-tool', {}),
        async (client) => await client.listTools()
      ];

      const results = await client.executeConcurrent(operations);
      
      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBeTruthy();
      expect(results[2].success).toBe(true);
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed operations', async () => {
      const retryClient = new MCPTestClient({
        maxRetries: 2,
        retryDelay: 100,
        connectionTimeout: 5000
      });

      // This should fail and retry
      await expect(
        retryClient.start()
      ).rejects.toThrow('Failed to start test client after 2 attempts');
      
      expect(retryClient.isReady).toBe(false);
    });

    it('should not retry non-retryable errors', async () => {
      await client.start();
      
      // Mock the isNonRetryableError to return true
      const originalIsNonRetryable = client.isNonRetryableError;
      client.isNonRetryableError = () => true;
      
      try {
        await expect(
          client.callTool('invalid-tool', {})
        ).rejects.toThrow();
        
        // Should have attempted only once (no retries for non-retryable errors)
        expect(client.operationCount).toBe(1);
      } finally {
        client.isNonRetryableError = originalIsNonRetryable;
        await client.stop();
      }
    }, 20000);
  });

  describe('Debugging and Monitoring', () => {
    it('should provide debug information', async () => {
      const debugInfo = client.getDebugInfo();
      
      expect(debugInfo.isReady).toBe(false);
      expect(debugInfo.operationCount).toBe(0);
      expect(debugInfo.uptime).toBe(0);
      expect(debugInfo.server).toBeDefined();
      expect(debugInfo.options).toBeDefined();
      expect(debugInfo.options.serverOptions).toBeUndefined(); // Should be excluded
    });

    it('should track operation count', async () => {
      await client.start();
      
      expect(client.operationCount).toBe(0);
      
      await client.listTools();
      expect(client.operationCount).toBe(1);
      
      await client.chat('Test');
      expect(client.operationCount).toBe(2);
      
      await client.stop();
    }, 20000);

    it('should track uptime', async () => {
      expect(client.getDebugInfo().uptime).toBe(0);
      
      await client.start();
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const uptime = client.getDebugInfo().uptime;
      expect(uptime).toBeGreaterThan(0);
      
      await client.stop();
    }, 20000);
  });

  describe('Utility Functions', () => {
    it('should create test client with factory function', async () => {
      const testClient = await createTestClient({ 
        connectionTimeout: 10000 
      });
      
      expect(testClient).toBeInstanceOf(MCPTestClient);
      expect(testClient.isReady).toBe(true);
      
      await testClient.stop();
    }, 20000);

    it('should run test with automatic client lifecycle', async () => {
      let clientReceived = null;
      
      const result = await withTestClient(async (client) => {
        clientReceived = client;
        
        expect(client.isReady).toBe(true);
        
        const tools = await client.listTools();
        expect(tools.tools.length).toBeGreaterThan(0);
        
        return 'test-result';
      }, { connectionTimeout: 10000 });

      expect(result).toBe('test-result');
      expect(clientReceived).toBeDefined();
      expect(clientReceived.isReady).toBe(false); // Should be stopped after test
    }, 30000);

    it('should cleanup client even if test function throws', async () => {
      let clientRef = null;
      
      try {
        await withTestClient(async (client) => {
          clientRef = client;
          expect(client.isReady).toBe(true);
          throw new Error('Test error');
        }, { connectionTimeout: 10000 });
      } catch (error) {
        expect(error.message).toBe('Test error');
      }

      expect(clientRef).toBeDefined();
      expect(clientRef.isReady).toBe(false); // Should still be stopped
    }, 30000);
  });

  describe('Multiple Clients', () => {
    it('should create multiple test clients', async () => {
      // Note: This test might be challenging since each client tries to start
      // its own server instance. In a real scenario, we'd need to coordinate
      // port usage or use a different approach.
      
      // For now, test the interface without actually creating multiple servers
      const mockClients = [];
      
      // Test the utility functions exist and have correct signatures
      expect(createMultipleTestClients).toBeTypeOf('function');
      expect(stopMultipleTestClients).toBeTypeOf('function');
      
      // Test stopping empty array
      await expect(stopMultipleTestClients([])).resolves.toBeUndefined();
    });
  });
});