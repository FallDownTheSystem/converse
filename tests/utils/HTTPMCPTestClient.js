/**
 * HTTP MCP Test Client Wrapper
 * 
 * High-level wrapper around HTTPMCPServerManager that provides simplified interface
 * for testing MCP client-server interactions using HTTP transport instead of stdio.
 * Replaces MCPTestClient with HTTP-based architecture for better reliability.
 */

import { HTTPMCPServerManager } from './HTTPMCPServerManager.js';

/**
 * HTTP MCP Test Client with simplified testing interface
 */
export class HTTPMCPTestClient {
  constructor(options = {}) {
    this.options = {
      maxRetries: 3,
      retryDelay: 1000,
      connectionTimeout: 15000,
      operationTimeout: 30000,
      debugMode: false,
      host: 'localhost',
      port: 0, // Random port
      ...options
    };
    
    this.serverManager = new HTTPMCPServerManager({
      host: this.options.host,
      port: this.options.port,
      startupTimeout: this.options.connectionTimeout,
      env: {
        NODE_ENV: 'test',
        LOG_LEVEL: this.options.debugMode ? 'debug' : 'error',
        ...options.env
      },
      clientConfig: {
        name: 'http-test-client',
        version: '1.0.0',
        ...options.clientConfig
      },
      ...options.serverOptions
    });
    
    this.isReady = false;
    this.lastError = null;
    this.operationCount = 0;
    this.startTime = null;
    this.connectionInfo = null;
  }

  /**
   * Start the test client (HTTP server + connection)
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isReady) {
      throw new Error('Test client is already started');
    }

    this.startTime = Date.now();
    this.log('Starting HTTP MCP test client...');

    try {
      await this.serverManager.startServer();
      this.connectionInfo = this.serverManager.getConnectionInfo();
      this.isReady = true;
      this.log('HTTP test client started successfully on port', this.connectionInfo.port);
    } catch (error) {
      this.lastError = error;
      this.log('Failed to start HTTP test client:', error.message);
      throw error;
    }
  }

  /**
   * Stop the test client and cleanup
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isReady) {
      return;
    }

    this.log('Stopping HTTP MCP test client...');
    
    try {
      await this.serverManager.stopServer();
      this.isReady = false;
      
      const duration = Date.now() - this.startTime;
      this.log(`HTTP test client stopped after ${duration}ms, ${this.operationCount} operations`);
    } catch (error) {
      this.log('Error during stop:', error.message);
      // Still mark as stopped
      this.isReady = false;
    }
  }

  /**
   * List available tools with retry logic
   * @returns {Promise<object>}
   */
  async listTools() {
    this.ensureReady();
    return this.withRetry('listTools', async () => {
      const client = this.serverManager.getClient();
      return await client.listTools();
    });
  }

  /**
   * Call a tool with simplified interface and retry logic
   * @param {string} toolName - Name of the tool to call
   * @param {object} args - Tool arguments
   * @param {object} options - Call options (timeout, etc.)
   * @returns {Promise<object>}
   */
  async callTool(toolName, args = {}, options = {}) {
    this.ensureReady();
    
    const timeout = options.timeout || this.options.operationTimeout;
    
    return this.withRetry('callTool', async () => {
      return await this.serverManager.executeToolCall({
        name: toolName,
        arguments: args
      }, timeout);
    });
  }

  /**
   * Call chat tool with simplified interface
   * @param {string} prompt - Chat prompt
   * @param {object} options - Chat options (model, temperature, etc.)
   * @returns {Promise<object>}
   */
  async chat(prompt, options = {}) {
    return this.callTool('chat', {
      prompt,
      ...options
    });
  }

  /**
   * Call consensus tool with simplified interface
   * @param {string} prompt - Consensus prompt
   * @param {array} models - Array of model configurations
   * @param {object} options - Consensus options
   * @returns {Promise<object>}
   */
  async consensus(prompt, models, options = {}) {
    return this.callTool('consensus', {
      prompt,
      models,
      ...options
    });
  }

  /**
   * Test server health and basic functionality
   * @returns {Promise<object>}
   */
  async healthCheck() {
    this.ensureReady();
    
    const startTime = Date.now();
    
    try {
      // Test basic connectivity
      const tools = await this.listTools();
      const listTime = Date.now() - startTime;
      
      // Test HTTP health endpoint
      const httpHealthStart = Date.now();
      const httpHealth = await this.serverManager.getServerHealth();
      const httpHealthTime = Date.now() - httpHealthStart;
      
      // Test server info endpoint
      const infoStart = Date.now();
      const serverInfo = await this.serverManager.getServerInfo();
      const infoTime = Date.now() - infoStart;
      
      // Test a simple tool call
      const chatStartTime = Date.now();
      const chatResult = await this.chat('Health check test', { 
        model: 'auto',
        temperature: 0 
      });
      const chatTime = Date.now() - chatStartTime;
      
      const totalTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        server: this.serverManager.getHealthStatus(),
        connection: this.connectionInfo,
        httpEndpoints: {
          health: httpHealth,
          info: serverInfo
        },
        performance: {
          listToolsMs: listTime,
          httpHealthMs: httpHealthTime,
          serverInfoMs: infoTime,
          chatCallMs: chatTime,
          totalMs: totalTime
        },
        tools: {
          count: tools.tools?.length || 0,
          available: tools.tools?.map(t => t.name) || []
        },
        chatWorking: !chatResult.isError,
        transport: 'http',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        server: this.serverManager.getHealthStatus(),
        connection: this.connectionInfo,
        transport: 'http',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Execute multiple operations concurrently
   * @param {array} operations - Array of operation functions
   * @param {object} options - Concurrency options
   * @returns {Promise<array>}
   */
  async executeConcurrent(operations, options = {}) {
    this.ensureReady();
    
    const maxConcurrency = options.maxConcurrency || operations.length;
    const timeout = options.timeout || this.options.operationTimeout;
    
    this.log(`Executing ${operations.length} operations with max concurrency ${maxConcurrency}`);
    
    return await this.serverManager.executeConcurrent(operations, { maxConcurrency, timeout });
  }

  /**
   * Test session isolation by creating multiple concurrent sessions
   * @param {number} sessionCount - Number of sessions to test
   * @returns {Promise<object>}
   */
  async testSessionIsolation(sessionCount = 3) {
    this.ensureReady();
    
    const startTime = Date.now();
    this.log(`Testing session isolation with ${sessionCount} sessions`);
    
    try {
      const operations = Array.from({ length: sessionCount }, (_, index) => 
        async (client) => {
          const sessionResult = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: `Session test ${index + 1}`,
              model: 'auto'
            }
          });
          return { sessionIndex: index, result: sessionResult };
        }
      );

      const results = await this.executeConcurrent(operations);
      const successCount = results.filter(r => r.success).length;
      
      return {
        success: successCount === sessionCount,
        sessionCount,
        successCount,
        failedCount: sessionCount - successCount,
        duration: Date.now() - startTime,
        results: results
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Get comprehensive debugging information
   * @returns {object}
   */
  getDebugInfo() {
    return {
      isReady: this.isReady,
      operationCount: this.operationCount,
      lastError: this.lastError?.message,
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      connection: this.connectionInfo,
      server: this.serverManager.getHealthStatus(),
      transport: 'http',
      options: { 
        ...this.options, 
        serverOptions: undefined, // Don't expose server options
        env: undefined // Don't expose environment
      }
    };
  }

  /**
   * Get connection information
   * @returns {object}
   */
  getConnectionInfo() {
    return this.connectionInfo;
  }

  /**
   * Test HTTP endpoints directly (bypassing MCP client)
   * @returns {Promise<object>}
   */
  async testHttpEndpoints() {
    this.ensureReady();
    
    const baseUrl = this.connectionInfo.baseUrl;
    const results = {};
    
    try {
      // Test health endpoint
      const healthResponse = await fetch(`${baseUrl}/health`);
      results.health = {
        status: healthResponse.status,
        data: await healthResponse.json()
      };
      
      // Test info endpoint
      const infoResponse = await fetch(`${baseUrl}/info`);
      results.info = {
        status: infoResponse.status,
        data: await infoResponse.json()
      };
      
      results.success = true;
    } catch (error) {
      results.success = false;
      results.error = error.message;
    }
    
    return results;
  }

  /**
   * Execute an operation with retry logic
   * @param {string} operationName - Name of the operation for logging
   * @param {function} operation - Async operation to execute
   * @returns {Promise<any>}
   * @private
   */
  async withRetry(operationName, operation) {
    this.operationCount++;
    
    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        this.log(`${operationName}: attempt ${attempt}`);
        const result = await operation();
        this.log(`${operationName}: success on attempt ${attempt}`);
        return result;
      } catch (error) {
        this.lastError = error;
        this.log(`${operationName}: attempt ${attempt} failed:`, error.message);
        
        // Don't retry certain types of errors
        if (this.isNonRetryableError(error)) {
          throw error;
        }
        
        if (attempt < this.options.maxRetries) {
          await this.delay(this.options.retryDelay * attempt);
        }
      }
    }

    throw new Error(`${operationName} failed after ${this.options.maxRetries} attempts: ${this.lastError?.message}`);
  }

  /**
   * Check if error should not be retried
   * @param {Error} error - Error to check
   * @returns {boolean}
   * @private
   */
  isNonRetryableError(error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('validation') ||
      message.includes('invalid arguments') ||
      message.includes('unknown tool') ||
      message.includes('not found') ||
      message.includes('already started') ||
      message.includes('not ready') ||
      message.includes('port') ||
      message.includes('eaddrinuse')
    );
  }

  /**
   * Ensure client is ready for operations
   * @private
   */
  ensureReady() {
    if (!this.isReady) {
      throw new Error('HTTP test client is not ready. Call start() first.');
    }
  }

  /**
   * Delay for specified milliseconds
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   * @private
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Log message if debug mode is enabled
   * @param {string} message - Message to log
   * @param {...any} args - Additional arguments
   * @private
   */
  log(message, ...args) {
    if (this.options.debugMode) {
      console.log(`[HTTPMCPTestClient] ${message}`, ...args);
    }
  }
}

/**
 * Factory function to create and start an HTTP test client
 * @param {object} options - Client options
 * @returns {Promise<HTTPMCPTestClient>}
 */
export async function createHTTPTestClient(options = {}) {
  const client = new HTTPMCPTestClient(options);
  await client.start();
  return client;
}

/**
 * Utility function to run a test with automatic HTTP client lifecycle
 * @param {function} testFn - Test function that receives the client
 * @param {object} options - Client options
 * @returns {Promise<any>}
 */
export async function withHTTPTestClient(testFn, options = {}) {
  const client = new HTTPMCPTestClient(options);
  
  try {
    await client.start();
    return await testFn(client);
  } finally {
    await client.stop();
  }
}

/**
 * Create multiple HTTP test clients for concurrent testing
 * @param {number} count - Number of clients to create
 * @param {object} options - Client options
 * @returns {Promise<HTTPMCPTestClient[]>}
 */
export async function createMultipleHTTPTestClients(count, options = {}) {
  const clients = [];
  
  try {
    for (let i = 0; i < count; i++) {
      const client = new HTTPMCPTestClient({
        ...options,
        debugMode: false, // Disable debug for multiple clients
        port: 0, // Always use random ports for multiple clients
        serverOptions: {
          ...options.serverOptions,
          port: 0 // Ensure unique ports
        }
      });
      await client.start();
      clients.push(client);
    }
    
    return clients;
  } catch (error) {
    // Cleanup any clients that were created
    await Promise.all(clients.map(client => client.stop().catch(() => {})));
    throw error;
  }
}

/**
 * Stop multiple HTTP test clients
 * @param {HTTPMCPTestClient[]} clients - Array of clients to stop
 * @returns {Promise<void>}
 */
export async function stopMultipleHTTPTestClients(clients) {
  await Promise.all(clients.map(client => client.stop().catch(() => {})));
}

/**
 * Test HTTP transport concurrency with multiple clients
 * @param {number} clientCount - Number of clients to test with
 * @param {number} operationsPerClient - Operations per client
 * @param {object} options - Test options
 * @returns {Promise<object>}
 */
export async function testHTTPConcurrency(clientCount = 3, operationsPerClient = 5, options = {}) {
  const startTime = Date.now();
  
  try {
    // Create multiple clients
    const clients = await createMultipleHTTPTestClients(clientCount, options);
    
    // Run concurrent operations on all clients
    const allOperations = [];
    for (let clientIndex = 0; clientIndex < clients.length; clientIndex++) {
      const client = clients[clientIndex];
      for (let opIndex = 0; opIndex < operationsPerClient; opIndex++) {
        allOperations.push(async () => {
          return client.chat(`Client ${clientIndex} operation ${opIndex}`, { model: 'auto' });
        });
      }
    }
    
    // Execute all operations concurrently
    const results = await Promise.allSettled(allOperations.map(op => op()));
    
    // Stop all clients
    await stopMultipleHTTPTestClients(clients);
    
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    
    return {
      success: successCount === allOperations.length,
      clientCount,
      operationsPerClient,
      totalOperations: allOperations.length,
      successCount,
      failedCount: allOperations.length - successCount,
      duration: Date.now() - startTime,
      results: results.map((r, i) => ({
        index: i,
        success: r.status === 'fulfilled',
        error: r.status === 'rejected' ? r.reason?.message : null
      }))
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      duration: Date.now() - startTime
    };
  }
}