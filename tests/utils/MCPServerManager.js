/**
 * MCP Server Manager for Testing
 *
 * Manages MCP server process lifecycle for integration testing.
 * Handles server startup, shutdown, and communication via StdioClientTransport.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * MCP Server Manager for testing scenarios
 */
export class MCPServerManager {
  constructor(options = {}) {
    // Extract env from options to handle separately
    const { env: optionsEnv, ...otherOptions } = options;

    this.options = {
      serverPath: join(__dirname, '../../src/index.js'),
      startupTimeout: 15000,
      shutdownTimeout: 5000,
      env: {
        NODE_ENV: 'test',
        LOG_LEVEL: 'silent',
        ...optionsEnv
      },
      ...otherOptions
    };

    this.transport = null;
    this.client = null;
    this.serverProcess = null;
    this.isStarted = false;
    this.stderrData = [];
    this.stdoutData = [];
  }

  /**
   * Start the MCP server process and establish client connection
   * @returns {Promise<void>}
   */
  async startServer() {
    if (this.isStarted) {
      throw new Error('Server is already started');
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.cleanup();
        reject(new Error(`Server startup timeout after ${this.options.startupTimeout}ms`));
      }, this.options.startupTimeout);

      try {
        // Create StdioClientTransport with forced stdio mode
        this.transport = new StdioClientTransport({
          command: 'node',
          args: [this.options.serverPath, '--transport', 'stdio'],
          env: {
            ...process.env,
            ...this.options.env,
            MCP_TRANSPORT: 'stdio', // Force stdio transport
            LOG_LEVEL: 'silent', // No logging for test environment to avoid JSON corruption
            NODE_ENV: 'test'
          },
          stderr: 'pipe'
        });

        // Create MCP client
        this.client = new Client({
          name: 'test-client',
          version: '1.0.0'
        });

        // Connect client to server first
        this.client.connect(this.transport)
          .then(() => {
            clearTimeout(timeoutId);
            this.isStarted = true;
            resolve();
          })
          .catch((error) => {
            clearTimeout(timeoutId);
            this.cleanup();
            reject(new Error(`Client connection failed: ${error.message}`));
          });

        // Capture stderr for debugging
        if (this.transport.stderr) {
          this.transport.stderr.on('data', (data) => {
            const output = data.toString();
            this.stderrData.push(output);
          });

          this.transport.stderr.on('error', (error) => {
            clearTimeout(timeoutId);
            this.cleanup();
            reject(new Error(`Server stderr error: ${error.message}`));
          });
        }

        // Handle transport errors
        this.transport.onerror = (error) => {
          clearTimeout(timeoutId);
          this.cleanup();
          reject(new Error(`Transport error: ${error.message}`));
        };

        // Handle transport close
        this.transport.onclose = () => {
          this.isStarted = false;
        };

      } catch (error) {
        clearTimeout(timeoutId);
        this.cleanup();
        reject(new Error(`Server startup failed: ${error.message}`));
      }
    });
  }

  /**
   * Stop the MCP server process and cleanup resources
   * @returns {Promise<void>}
   */
  async stopServer() {
    if (!this.isStarted) {
      return;
    }

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        this.forceCleanup();
        resolve();
      }, this.options.shutdownTimeout);

      try {
        if (this.transport) {
          this.transport.close?.()
            .then(() => {
              clearTimeout(timeoutId);
              this.cleanup();
              resolve();
            })
            .catch(() => {
              clearTimeout(timeoutId);
              this.forceCleanup();
              resolve();
            });
        } else {
          clearTimeout(timeoutId);
          this.cleanup();
          resolve();
        }
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
   * Get server process ID if available
   * @returns {number|null}
   */
  getServerPid() {
    return this.transport?.pid || null;
  }

  /**
   * Get captured stderr output for debugging
   * @returns {string[]}
   */
  getStderrOutput() {
    return [...this.stderrData];
  }

  /**
   * Get captured stdout output for debugging
   * @returns {string[]}
   */
  getStdoutOutput() {
    return [...this.stdoutData];
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
   * Clean up resources
   * @private
   */
  cleanup() {
    this.isStarted = false;

    if (this.client) {
      try {
        this.client = null;
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    if (this.transport) {
      try {
        this.transport = null;
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Force cleanup with process termination
   * @private
   */
  forceCleanup() {
    this.cleanup();

    // If we have a process ID, try to kill it
    const pid = this.getServerPid();
    if (pid) {
      try {
        process.kill(pid, 'SIGTERM');
        // Give it a moment, then SIGKILL if needed
        setTimeout(() => {
          try {
            process.kill(pid, 'SIGKILL');
          } catch (error) {
            // Process might already be dead
          }
        }, 1000);
      } catch (error) {
        // Process might already be dead
      }
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
   * Get server health status
   * @returns {object}
   */
  getHealthStatus() {
    return {
      isStarted: this.isStarted,
      pid: this.getServerPid(),
      hasClient: !!this.client,
      hasTransport: !!this.transport,
      stderrLines: this.stderrData.length,
      stdoutLines: this.stdoutData.length
    };
  }
}

/**
 * Factory function to create a managed server instance for tests
 * @param {object} options - Server options
 * @returns {MCPServerManager}
 */
export function createTestServer(options = {}) {
  return new MCPServerManager(options);
}

/**
 * Utility function to run a test with server lifecycle management
 * @param {function} testFn - Test function that receives (client, manager)
 * @param {object} options - Server options
 * @returns {Promise<any>}
 */
export async function withTestServer(testFn, options = {}) {
  const manager = createTestServer(options);

  try {
    await manager.startServer();
    const client = manager.getClient();
    return await testFn(client, manager);
  } finally {
    await manager.stopServer();
  }
}
