/**
 * MCP Test Client Wrapper
 * 
 * High-level wrapper around MCPServerManager that provides simplified interface
 * for testing MCP client-server interactions with retry logic and debugging features.
 */

import { MCPServerManager } from './MCPServerManager.js';

/**
 * MCP Test Client with simplified testing interface
 */
export class MCPTestClient {
  constructor(options = {}) {
    this.options = {
      maxRetries: 3,
      retryDelay: 1000,
      connectionTimeout: 15000,
      operationTimeout: 30000,
      debugMode: false,
      ...options
    };
    
    this.serverManager = new MCPServerManager({
      startupTimeout: this.options.connectionTimeout,
      ...options.serverOptions
    });
    
    this.isReady = false;
    this.lastError = null;
    this.operationCount = 0;
    this.startTime = null;
  }

  /**
   * Start the test client (server + connection)
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isReady) {
      throw new Error('Test client is already started');
    }

    this.startTime = Date.now();
    this.log('Starting MCP test client...');

    try {
      await this.serverManager.startServer();
      this.isReady = true;
      this.log('Test client started successfully');
    } catch (error) {
      this.lastError = error;
      this.log('Failed to start test client:', error.message);
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

    this.log('Stopping MCP test client...');
    
    try {
      await this.serverManager.stopServer();
      this.isReady = false;
      
      const duration = Date.now() - this.startTime;
      this.log(`Test client stopped after ${duration}ms, ${this.operationCount} operations`);
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
        performance: {
          listToolsMs: listTime,
          chatCallMs: chatTime,
          totalMs: totalTime
        },
        tools: {
          count: tools.tools?.length || 0,
          available: tools.tools?.map(t => t.name) || []
        },
        chatWorking: !chatResult.isError,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        server: this.serverManager.getHealthStatus(),
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
    
    // Simple Promise.all for now, could implement proper concurrency limiting
    const promises = operations.map(async (operation, index) => {
      try {
        const result = await Promise.race([
          operation(this),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Operation ${index} timeout`)), timeout)
          )
        ]);
        return { index, success: true, result };
      } catch (error) {
        return { index, success: false, error: error.message };
      }
    });

    return Promise.all(promises);
  }

  /**
   * Get debugging information
   * @returns {object}
   */
  getDebugInfo() {
    return {
      isReady: this.isReady,
      operationCount: this.operationCount,
      lastError: this.lastError?.message,
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      server: this.serverManager.getHealthStatus(),
      serverLogs: this.serverManager.getStderrOutput().slice(-10), // Last 10 log entries
      options: { ...this.options, serverOptions: undefined } // Don't expose server options
    };
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
      message.includes('not ready')
    );
  }

  /**
   * Ensure client is ready for operations
   * @private
   */
  ensureReady() {
    if (!this.isReady) {
      throw new Error('Test client is not ready. Call start() first.');
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
      console.log(`[MCPTestClient] ${message}`, ...args);
    }
  }
}

/**
 * Factory function to create and start a test client
 * @param {object} options - Client options
 * @returns {Promise<MCPTestClient>}
 */
export async function createTestClient(options = {}) {
  const client = new MCPTestClient(options);
  await client.start();
  return client;
}

/**
 * Utility function to run a test with automatic client lifecycle
 * @param {function} testFn - Test function that receives the client
 * @param {object} options - Client options
 * @returns {Promise<any>}
 */
export async function withTestClient(testFn, options = {}) {
  const client = new MCPTestClient(options);
  
  try {
    await client.start();
    return await testFn(client);
  } finally {
    await client.stop();
  }
}

/**
 * Create multiple test clients for concurrent testing
 * @param {number} count - Number of clients to create
 * @param {object} options - Client options
 * @returns {Promise<MCPTestClient[]>}
 */
export async function createMultipleTestClients(count, options = {}) {
  const clients = [];
  
  try {
    for (let i = 0; i < count; i++) {
      const client = new MCPTestClient({
        ...options,
        debugMode: false, // Disable debug for multiple clients
        serverOptions: {
          ...options.serverOptions,
          // Use different ports if needed in the future
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
 * Stop multiple test clients
 * @param {MCPTestClient[]} clients - Array of clients to stop
 * @returns {Promise<void>}
 */
export async function stopMultipleTestClients(clients) {
  await Promise.all(clients.map(client => client.stop().catch(() => {})));
}