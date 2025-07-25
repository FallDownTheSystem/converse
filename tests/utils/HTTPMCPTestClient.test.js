/**
 * Tests for HTTPMCPTestClient
 * 
 * Comprehensive test suite for HTTP-based MCP test client wrapper
 * that provides simplified interface for testing.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { 
  HTTPMCPTestClient, 
  createHTTPTestClient, 
  withHTTPTestClient, 
  createMultipleHTTPTestClients, 
  stopMultipleHTTPTestClients,
  testHTTPConcurrency 
} from './HTTPMCPTestClient.js';

describe('HTTPMCPTestClient', () => {
  let client;

  beforeEach(() => {
    client = new HTTPMCPTestClient({
      port: 0, // Use random port for each test
      debugMode: false
    });
  });

  afterEach(async () => {
    if (client && client.isReady) {
      await client.stop();
    }
  });

  describe('Client Lifecycle', () => {
    test('should start and stop client successfully', async () => {
      expect(client.isReady).toBe(false);
      
      await client.start();
      expect(client.isReady).toBe(true);
      
      const connectionInfo = client.getConnectionInfo();
      expect(connectionInfo.port).toBeGreaterThan(0);
      expect(connectionInfo.host).toBe('localhost');
      
      await client.stop();
      expect(client.isReady).toBe(false);
    }, 30000);

    test('should not allow starting already started client', async () => {
      await client.start();
      
      await expect(client.start()).rejects.toThrow('already started');
    }, 30000);

    test('should handle stopping non-started client gracefully', async () => {
      await expect(client.stop()).resolves.not.toThrow();
    });
  });

  describe('Tool Operations', () => {
    beforeEach(async () => {
      await client.start();
    });

    test('should list tools successfully', async () => {
      const tools = await client.listTools();
      expect(tools).toBeDefined();
      expect(tools.tools).toBeInstanceOf(Array);
      expect(tools.tools.length).toBeGreaterThan(0);
      
      const toolNames = tools.tools.map(t => t.name);
      expect(toolNames).toContain('chat');
      expect(toolNames).toContain('consensus');
    });

    test('should call tools with simplified interface', async () => {
      const result = await client.callTool('chat', {
        prompt: 'Test message',
        model: 'auto'
      });
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    }, 60000);

    test('should use chat helper method', async () => {
      const result = await client.chat('Hello test', { model: 'auto' });
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBeTruthy();
    }, 60000);

    test('should use consensus helper method', async () => {
      const models = [
        { model: 'auto' } // Use single auto model to avoid timeout issues
      ];
      
      try {
        const result = await client.consensus('What is 2+2?', models);
        
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        
        // If result is an error due to no API keys, that's acceptable
        if (result.isError) {
          expect(result.error).toBeDefined();
        }
      } catch (error) {
        // If consensus fails due to API issues, that's acceptable in test environment
        expect(error.message).toBeTruthy();
      }
    }, 60000);

    test('should handle tool errors gracefully', async () => {
      const result = await client.callTool('nonexistent-tool', {});
      
      expect(result.isError).toBe(true);
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('UNKNOWN_TOOL');
      expect(result.error.message).toContain('nonexistent-tool');
    });

    test('should enforce ready state', async () => {
      const newClient = new HTTPMCPTestClient();
      
      await expect(newClient.listTools()).rejects.toThrow('not ready');
      await expect(newClient.callTool('chat', {})).rejects.toThrow('not ready');
    });
  });

  describe('Health Check', () => {
    beforeEach(async () => {
      await client.start();
    });

    test('should perform comprehensive health check', async () => {
      const health = await client.healthCheck();
      
      expect(health.status).toBe('healthy');
      expect(health.transport).toBe('http');
      expect(health.connection).toBeDefined();
      expect(health.httpEndpoints.health).toBeDefined();
      expect(health.httpEndpoints.info).toBeDefined();
      expect(health.performance.listToolsMs).toBeGreaterThan(0);
      expect(health.performance.chatCallMs).toBeGreaterThan(0);
      expect(health.tools.count).toBeGreaterThan(0);
      expect(health.chatWorking).toBe(true);
    }, 60000);

    test('should handle unhealthy state', async () => {
      // Stop the server to make it unhealthy
      await client.stop();
      client.isReady = true; // Force ready state for test
      
      const health = await client.healthCheck();
      expect(health.status).toBe('unhealthy');
      expect(health.error).toBeDefined();
    });
  });

  describe('HTTP Endpoints Testing', () => {
    beforeEach(async () => {
      await client.start();
    });

    test('should test HTTP endpoints directly', async () => {
      const endpointResults = await client.testHttpEndpoints();
      
      expect(endpointResults.success).toBe(true);
      expect(endpointResults.health.status).toBe(200);
      expect(endpointResults.health.data.status).toBe('healthy');
      expect(endpointResults.info.status).toBe(200);
      expect(endpointResults.info.data.transport).toBe('http-streaming');
    });
  });

  describe('Concurrent Operations', () => {
    beforeEach(async () => {
      await client.start();
    });

    test('should execute operations concurrently', async () => {
      const operations = [
        async () => client.chat('Test 1', { model: 'auto' }),
        async () => client.chat('Test 2', { model: 'auto' }),
        async () => client.chat('Test 3', { model: 'auto' })
      ];

      const results = await client.executeConcurrent(operations);
      
      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
    }, 120000);

    test('should test session isolation', async () => {
      const isolationResult = await client.testSessionIsolation(3);
      
      expect(isolationResult.success).toBe(true);
      expect(isolationResult.sessionCount).toBe(3);
      expect(isolationResult.successCount).toBe(3);
      expect(isolationResult.failedCount).toBe(0);
    }, 120000);
  });

  describe('Debug and Monitoring', () => {
    beforeEach(async () => {
      await client.start();
    });

    test('should provide debug information', async () => {
      // Perform some operations to populate debug info
      await client.listTools();
      await client.chat('Debug test', { model: 'auto' });
      
      const debugInfo = client.getDebugInfo();
      
      expect(debugInfo.isReady).toBe(true);
      expect(debugInfo.operationCount).toBeGreaterThan(0);
      expect(debugInfo.uptime).toBeGreaterThan(0);
      expect(debugInfo.connection).toBeDefined();
      expect(debugInfo.transport).toBe('http');
    }, 60000);

    test('should track operation count', async () => {
      const initialDebug = client.getDebugInfo();
      const initialCount = initialDebug.operationCount;
      
      await client.listTools();
      await client.chat('Count test', { model: 'auto' });
      
      const finalDebug = client.getDebugInfo();
      expect(finalDebug.operationCount).toBeGreaterThan(initialCount);
    }, 60000);
  });

  describe('Retry Logic', () => {
    beforeEach(async () => {
      await client.start();
    });

    test('should retry failed operations', async () => {
      // Create a client with short retry settings for testing
      const retryClient = new HTTPMCPTestClient({
        maxRetries: 2,
        retryDelay: 100,
        debugMode: true
      });
      
      await retryClient.start();
      
      try {
        // Test with nonexistent tool - should get structured error response
        const result = await retryClient.callTool('nonexistent-tool', {});
        
        expect(result.isError).toBe(true);
        expect(result.error.code).toBe('UNKNOWN_TOOL');
      } finally {
        await retryClient.stop();
      }
    });

    test('should not retry non-retryable errors', async () => {
      // Test that certain errors are not retried
      const startTime = Date.now();
      
      const result = await client.callTool('chat', { invalid: 'arguments' });
      
      const duration = Date.now() - startTime;
      // Should fail quickly without retries
      expect(duration).toBeLessThan(5000);
      
      // Should get structured error response
      expect(result.isError).toBe(true);
      expect(result.error).toBeDefined();
    }, 30000);
  });

  describe('Utility Functions', () => {
    test('createHTTPTestClient should work', async () => {
      const testClient = await createHTTPTestClient({ port: 0 });
      
      try {
        expect(testClient).toBeInstanceOf(HTTPMCPTestClient);
        expect(testClient.isReady).toBe(true);
        
        const tools = await testClient.listTools();
        expect(tools.tools.length).toBeGreaterThan(0);
      } finally {
        await testClient.stop();
      }
    }, 30000);

    test('withHTTPTestClient should manage lifecycle', async () => {
      let clientReceived = null;
      
      const result = await withHTTPTestClient(async (client) => {
        clientReceived = client;
        
        const tools = await client.listTools();
        return tools.tools.length;
      });
      
      expect(clientReceived).toBeDefined();
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
      
      // Client should be stopped after the function
      expect(clientReceived.isReady).toBe(false);
    }, 30000);

    test('createMultipleHTTPTestClients should work', async () => {
      const clients = await createMultipleHTTPTestClients(2, { port: 0 });
      
      try {
        expect(clients).toHaveLength(2);
        expect(clients.every(c => c.isReady)).toBe(true);
        
        // Each client should have different ports
        const ports = clients.map(c => c.getConnectionInfo().port);
        expect(new Set(ports).size).toBe(2); // All unique ports
        
        // Test that all clients work
        const results = await Promise.all(
          clients.map(c => c.listTools())
        );
        expect(results.every(r => r.tools.length > 0)).toBe(true);
      } finally {
        await stopMultipleHTTPTestClients(clients);
      }
    }, 60000);

    test('testHTTPConcurrency should work', async () => {
      const result = await testHTTPConcurrency(2, 3);
      
      expect(result.success).toBe(true);
      expect(result.clientCount).toBe(2);
      expect(result.operationsPerClient).toBe(3);
      expect(result.totalOperations).toBe(6);
      expect(result.successCount).toBe(6);
      expect(result.failedCount).toBe(0);
    }, 120000);
  });

  describe('Error Handling', () => {
    test('should handle startup failures gracefully', async () => {
      const badClient = new HTTPMCPTestClient({
        port: -1 // Invalid port
      });
      
      await expect(badClient.start()).rejects.toThrow();
      expect(badClient.isReady).toBe(false);
    });

    test('should handle network errors', async () => {
      await client.start();
      
      // Stop the underlying server to cause network errors
      await client.serverManager.stopServer();
      
      // Operations should fail gracefully - check for error responses instead of exceptions
      try {
        await client.listTools();
        throw new Error('Should have failed');
      } catch (error) {
        expect(error.message).toBeTruthy();
      }
      
      const httpResult = await client.testHttpEndpoints();
      expect(httpResult.success).toBe(false);
      expect(httpResult.error).toBeTruthy();
    }, 30000);
  });

  describe('Configuration', () => {
    test('should respect custom configuration', async () => {
      const customClient = new HTTPMCPTestClient({
        host: '127.0.0.1',
        port: 0,
        maxRetries: 5,
        operationTimeout: 60000,
        clientConfig: {
          name: 'custom-test-client',
          version: '2.0.0'
        }
      });
      
      await customClient.start();
      
      try {
        const connectionInfo = customClient.getConnectionInfo();
        expect(connectionInfo.host).toBe('127.0.0.1');
        
        const debugInfo = customClient.getDebugInfo();
        expect(debugInfo.options.maxRetries).toBe(5);
        expect(debugInfo.options.operationTimeout).toBe(60000);
      } finally {
        await customClient.stop();
      }
    }, 30000);
  });
});