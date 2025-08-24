/**
 * HTTP MCP Server Manager for Testing
 *
 * Manages MCP server process lifecycle for integration testing using HTTP transport.
 * Replaces stdio-based MCPServerManager to eliminate subprocess management and
 * JSON-RPC protocol interference issues.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createHTTPTransport, HTTPTransportServer } from '../../src/transport/httpTransport.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createRouter } from '../../src/router.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * HTTP MCP Server Manager for testing scenarios
 * Uses HTTP transport instead of stdio subprocess management
 */
export class HTTPMCPServerManager {
  constructor(options = {}) {
    this.options = {
      host: options.host || 'localhost',
      port: options.port || 0, // 0 = random port
      startupTimeout: options.startupTimeout || 15000,
      shutdownTimeout: options.shutdownTimeout || 5000,
      enableCors: options.enableCors !== false,
      env: {
        NODE_ENV: 'test',
        LOG_LEVEL: 'error',
        ...options.env
      },
      clientConfig: {
        name: 'http-test-client',
        version: '1.0.0',
        ...options.clientConfig
      },
      ...options
    };

    this.httpTransport = null;
    this.mcpServer = null;
    this.client = null;
    this.clientTransport = null;
    this.sessionId = null;
    this.isStarted = false;
    this.actualPort = null;
    this.config = null;
  }

  /**
   * Start the HTTP MCP server and establish client connection
   * @returns {Promise<void>}
   */
  async startServer() {
    if (this.isStarted) {
      throw new Error('Server is already started');
    }

    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.cleanup();
        reject(new Error(`Server startup timeout after ${this.options.startupTimeout}ms`));
      }, this.options.startupTimeout);

      try {
        // Apply environment overrides
        for (const [key, value] of Object.entries(this.options.env)) {
          process.env[key] = value;
        }

        // Dynamic import config module AFTER setting env vars
        const { loadConfig, validateRuntimeConfig, getMcpClientConfig, getHttpTransportConfig } = await import('../../src/config.js');

        // Load configuration
        this.config = await loadConfig();
        await validateRuntimeConfig(this.config);
        const mcpConfig = getMcpClientConfig(this.config);

        // Create MCP server instance
        this.mcpServer = new Server(
          {
            name: mcpConfig.name,
            version: mcpConfig.version,
          },
          mcpConfig
        );

        // Set up router with server and config
        await createRouter(this.mcpServer, this.config);

        // Get HTTP transport config
        const httpConfig = getHttpTransportConfig(this.config);

        // Override some settings for testing
        httpConfig.port = this.options.port;
        httpConfig.host = this.options.host;
        httpConfig.enableCors = this.options.enableCors;
        httpConfig.enableDnsRebindingProtection = false; // Disable for testing
        httpConfig.allowedHosts = ['127.0.0.1', 'localhost'];

        // Create HTTP transport
        this.httpTransport = await createHTTPTransport(this.mcpServer, httpConfig);

        // Start the HTTP server
        const address = await this.httpTransport.start();
        this.actualPort = address.port;

        // Create client transport and connect
        const mcpUrl = `http://${this.options.host}:${this.actualPort}/mcp`;
        this.clientTransport = new StreamableHTTPClientTransport(
          new URL(mcpUrl)
        );

        // Create MCP client
        this.client = new Client(this.options.clientConfig);

        // Connect client to server and wait for connection to be fully established
        await this.client.connect(this.clientTransport);

        // Small delay to ensure connection is fully established
        await new Promise(resolve => setTimeout(resolve, 10));

        clearTimeout(timeoutId);
        this.isStarted = true;
        resolve();

      } catch (error) {
        clearTimeout(timeoutId);
        this.cleanup();
        reject(new Error(`Server startup failed: ${error.message}`));
      }
    });
  }

  /**
   * Stop the HTTP MCP server and cleanup resources
   * @returns {Promise<void>}
   */
  async stopServer() {
    if (!this.isStarted) {
      return;
    }

    return new Promise(async (resolve) => {
      const timeoutId = setTimeout(() => {
        this.forceCleanup();
        resolve();
      }, this.options.shutdownTimeout);

      try {
        // Close client first
        if (this.client) {
          await this.client.close?.();
        }

        // Small delay to allow client cleanup
        await new Promise(resolve => setTimeout(resolve, 10));

        // Close client transport
        if (this.clientTransport) {
          await this.clientTransport.close?.();
        }

        // Small delay before server shutdown
        await new Promise(resolve => setTimeout(resolve, 10));

        // Stop HTTP transport server last
        if (this.httpTransport) {
          await this.httpTransport.stop();
        }

        clearTimeout(timeoutId);
        this.cleanup();
        resolve();
      } catch (error) {
        clearTimeout(timeoutId);
        this.forceCleanup();
        resolve();
      }
    });
  }

  /**
   * Get the MCP client instance
   * @returns {Client}
   */
  getClient() {
    if (!this.isStarted || !this.client) {
      throw new Error('Server is not started or client is not available');
    }
    return this.client;
  }

  /**
   * Get the actual port the server is listening on
   * @returns {number}
   */
  getPort() {
    if (!this.isStarted || !this.actualPort) {
      throw new Error('Server not started. Call startServer() first');
    }
    return this.actualPort;
  }

  /**
   * Get server connection details
   * @returns {object}
   */
  getConnectionInfo() {
    return {
      host: this.options.host,
      port: this.actualPort,
      baseUrl: `http://${this.options.host}:${this.actualPort}`,
      mcpEndpoint: `http://${this.options.host}:${this.actualPort}/mcp`,
      sessionId: this.sessionId
    };
  }

  /**
   * Check if server is running
   * @returns {boolean}
   */
  isRunning() {
    return this.isStarted;
  }

  /**
   * Execute a tool call with timeout and error handling
   * @param {object} toolCall - Tool call parameters
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<object>}
   */
  async executeToolCall(toolCall, timeout = 30000) {
    if (!this.isStarted) {
      throw new Error('Server is not started');
    }

    return Promise.race([
      this.client.callTool(toolCall),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Tool call timeout after ${timeout}ms`)), timeout)
      )
    ]);
  }

  /**
   * List available tools
   * @returns {Promise<object>}
   */
  async listTools() {
    if (!this.isStarted) {
      throw new Error('Server is not started');
    }

    return this.client.listTools();
  }

  /**
   * Get server health status via HTTP endpoint
   * @returns {Promise<object>}
   */
  async getServerHealth() {
    if (!this.isStarted) {
      throw new Error('Server is not started');
    }

    try {
      const response = await fetch(`http://${this.options.host}:${this.actualPort}/health`);
      return await response.json();
    } catch (error) {
      throw new Error(`Health check failed: ${error.message}`);
    }
  }

  /**
   * Get server info via HTTP endpoint
   * @returns {Promise<object>}
   */
  async getServerInfo() {
    if (!this.isStarted) {
      throw new Error('Server is not started');
    }

    try {
      const response = await fetch(`http://${this.options.host}:${this.actualPort}/info`);
      return await response.json();
    } catch (error) {
      throw new Error(`Info request failed: ${error.message}`);
    }
  }

  /**
   * Create a new session for test isolation
   * @returns {Promise<string>} Session ID
   */
  async createSession() {
    // HTTP transport handles session creation automatically during connection
    // This method exists for API compatibility
    return this.sessionId || randomUUID();
  }

  /**
   * Clean up resources
   * @private
   */
  cleanup() {
    this.isStarted = false;
    this.actualPort = null;
    this.sessionId = null;

    // Clear references in reverse order of creation
    this.httpTransport = null;
    this.clientTransport = null;
    this.client = null;
    this.mcpServer = null;

    // Reset environment variables that were overridden
    if (this.options.env.ASYNC_MEMORY_TTL_MS) {
      delete process.env.ASYNC_MEMORY_TTL_MS;
    }
    if (this.options.env.ASYNC_DISK_TTL_MS) {
      delete process.env.ASYNC_DISK_TTL_MS;
    }
    if (this.options.env.ASYNC_CACHE_DIR) {
      delete process.env.ASYNC_CACHE_DIR;
    }
  }

  /**
   * Force cleanup with error handling
   * @private
   */
  forceCleanup() {
    try {
      this.cleanup();
    } catch (error) {
      // Ignore force cleanup errors
    }
  }

  /**
   * Wait for server to be ready with custom conditions
   * @param {function} readyCheck - Function that returns true when ready
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<void>}
   */
  async waitForReady(readyCheck, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const interval = 100;

      const check = () => {
        if (readyCheck()) {
          resolve();
          return;
        }

        if (Date.now() - startTime > timeout) {
          reject(new Error(`Ready check timeout after ${timeout}ms`));
          return;
        }

        setTimeout(check, interval);
      };

      check();
    });
  }

  /**
   * Get comprehensive health status
   * @returns {object}
   */
  getHealthStatus() {
    return {
      isStarted: this.isStarted,
      hasClient: !!this.client,
      hasTransport: !!this.httpTransport,
      hasClientTransport: !!this.clientTransport,
      connection: this.getConnectionInfo(),
      transport: 'http'
    };
  }

  /**
   * Execute multiple concurrent operations for stress testing
   * @param {array} operations - Array of operation functions
   * @param {object} options - Concurrency options
   * @returns {Promise<array>}
   */
  async executeConcurrent(operations, options = {}) {
    if (!this.isStarted) {
      throw new Error('Server is not started');
    }

    const maxConcurrency = options.maxConcurrency || operations.length;
    const timeout = options.timeout || 30000;

    const promises = operations.map(async (operation, index) => {
      try {
        const result = await Promise.race([
          operation(this.client),
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
   * Test basic server functionality
   * @returns {Promise<object>}
   */
  async performBasicTest() {
    if (!this.isStarted) {
      throw new Error('Server is not started');
    }

    const startTime = Date.now();

    try {
      // Test tools listing
      const tools = await this.listTools();

      // Test health endpoint
      const health = await this.getServerHealth();

      // Test server info
      const info = await this.getServerInfo();

      return {
        success: true,
        duration: Date.now() - startTime,
        tools: tools.tools?.length || 0,
        health: health.status,
        serverInfo: info.name
      };
    } catch (error) {
      return {
        success: false,
        duration: Date.now() - startTime,
        error: error.message
      };
    }
  }
}

/**
 * Factory function to create a managed HTTP server instance for tests
 * @param {object} options - Server options
 * @returns {HTTPMCPServerManager}
 */
export function createHTTPTestServer(options = {}) {
  return new HTTPMCPServerManager(options);
}

/**
 * Utility function to run a test with HTTP server lifecycle management
 * @param {function} testFn - Test function that receives (client, manager)
 * @param {object} options - Server options
 * @returns {Promise<any>}
 */
export async function withHTTPTestServer(testFn, options = {}) {
  const manager = createHTTPTestServer(options);

  try {
    await manager.startServer();
    const client = manager.getClient();
    return await testFn(client, manager);
  } finally {
    await manager.stopServer();
  }
}
