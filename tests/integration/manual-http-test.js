#!/usr/bin/env node

/**
 * Manual HTTP Transport Test for Converse MCP Server
 * 
 * Tests the HTTP transport implementation by starting the server
 * and making HTTP-based MCP calls.
 */

import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import fs from 'fs/promises';
import path from 'path';

class HTTPTestSuite {
  constructor() {
    this.client = null;
    this.transport = null;
    this.serverProcess = null;
    this.serverPort = 3001; // Use different port to avoid conflicts
    this.results = [];
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${message}`);
  }

  async startHTTPServer() {
    this.log('Starting MCP server with HTTP transport...');
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.cleanup();
        reject(new Error('Server startup timeout'));
      }, 10000);

      try {
        // Start server process with HTTP transport
        this.serverProcess = spawn('node', ['src/index.js'], {
          env: {
            ...process.env,
            NODE_ENV: 'test',
            LOG_LEVEL: 'info',
            PORT: this.serverPort.toString(),
            MCP_TRANSPORT: 'http'
          },
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let serverReady = false;

        // Monitor server output
        this.serverProcess.stderr.on('data', (data) => {
          const output = data.toString();
          this.log(`Server stderr: ${output.trim()}`, 'DEBUG');
          
          if (output.includes('started successfully') && !serverReady) {
            serverReady = true;
            clearTimeout(timeout);
            
            // Give server a moment to be fully ready
            setTimeout(() => {
              this.log('Server is ready, connecting client...');
              this.connectClient()
                .then(resolve)
                .catch(reject);
            }, 1000);
          }
        });

        this.serverProcess.stdout.on('data', (data) => {
          this.log(`Server stdout: ${data.toString().trim()}`, 'DEBUG');
        });

        this.serverProcess.on('error', (error) => {
          clearTimeout(timeout);
          reject(new Error(`Server process error: ${error.message}`));
        });

        this.serverProcess.on('exit', (code, signal) => {
          if (!serverReady) {
            clearTimeout(timeout);
            reject(new Error(`Server exited early with code ${code} signal ${signal}`));
          }
        });

      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  async connectClient() {
    try {
      // Create HTTP transport
      this.transport = new StreamableHTTPClientTransport(
        `http://localhost:${this.serverPort}/mcp`
      );

      // Create MCP client
      this.client = new Client({
        name: 'http-test-client',
        version: '1.0.0'
      }, {
        capabilities: {}
      });

      // Connect to server
      await this.client.connect(this.transport);
      this.log('MCP client connected successfully via HTTP');
      
    } catch (error) {
      throw new Error(`HTTP client connection failed: ${error.message}`);
    }
  }

  async cleanup() {
    this.log('Cleaning up test resources...');
    
    try {
      if (this.client) {
        await this.client.close();
      }
    } catch (error) {
      this.log(`Error closing client: ${error.message}`, 'WARN');
    }

    try {
      if (this.transport) {
        await this.transport.close();
      }
    } catch (error) {
      this.log(`Error closing transport: ${error.message}`, 'WARN');
    }

    if (this.serverProcess && !this.serverProcess.killed) {
      this.log('Terminating server process...');
      this.serverProcess.kill('SIGTERM');
      
      // Force kill if not dead in 5 seconds
      setTimeout(() => {
        if (!this.serverProcess.killed) {
          this.serverProcess.kill('SIGKILL');
        }
      }, 5000);
    }
  }

  async runTest(name, testFn) {
    this.log(`Running test: ${name}`);
    const startTime = Date.now();
    
    try {
      const result = await testFn();
      const duration = Date.now() - startTime;
      this.log(`✓ ${name} (${duration}ms)`);
      this.results.push({ name, success: true, duration, result });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log(`✗ ${name} (${duration}ms): ${error.message}`, 'FAIL');
      this.results.push({ name, success: false, duration, error: error.message });
      throw error;
    }
  }

  // Test basic server connectivity
  async testConnectivity() {
    const response = await this.client.listTools();
    
    if (!response.tools || !Array.isArray(response.tools)) {
      throw new Error('Invalid tools response');
    }

    const toolNames = response.tools.map(t => t.name);
    const expectedTools = ['chat', 'consensus'];
    
    for (const tool of expectedTools) {
      if (!toolNames.includes(tool)) {
        throw new Error(`Missing expected tool: ${tool}`);
      }
    }

    return { toolCount: response.tools.length, tools: toolNames };
  }

  // Test chat functionality
  async testChatBasic() {
    const response = await this.client.callTool({
      name: 'chat',
      arguments: {
        prompt: 'Say exactly: "HTTP transport test successful"',
        model: 'openai:gpt-4o-mini'
      }
    });

    if (!response.content?.[0]?.text) {
      throw new Error('Invalid chat response format');
    }

    return { 
      responseLength: response.content[0].text.length,
      hasContent: true 
    };
  }

  // Test chat with continuation
  async testChatContinuation() {
    // First message
    const first = await this.client.callTool({
      name: 'chat',
      arguments: {
        prompt: 'Remember this word: BANANA. Say "I remember BANANA"',
        model: 'openai:gpt-4o-mini'
      }
    });

    if (!first.continuation?.id) {
      throw new Error('No continuation in first response');
    }

    // Second message
    const second = await this.client.callTool({
      name: 'chat',
      arguments: {
        prompt: 'What word did I ask you to remember?',
        continuation: first.continuation.id,
        model: 'openai:gpt-4o-mini'
      }
    });

    return {
      conversationId: first.continuation.id,
      conversationMaintained: second.continuation.id === first.continuation.id
    };
  }

  // Test consensus functionality
  async testConsensusBasic() {
    const response = await this.client.callTool({
      name: 'consensus',
      arguments: {
        prompt: 'What is 5 + 5? Answer with just the number.',
        models: [
          { model: 'openai:gpt-4o-mini' },
          { model: 'google:flash' }
        ]
      }
    });

    if (!response.content?.[0]?.text) {
      throw new Error('Invalid consensus response format');
    }

    const text = response.content[0].text;
    const hasInitial = text.includes('Initial Responses');
    const hasRefined = text.includes('Refined Responses');

    return { hasInitial, hasRefined, responseLength: text.length };
  }

  async runAllTests() {
    try {
      await this.startHTTPServer();

      // Core tests
      await this.runTest('Server Connectivity', () => this.testConnectivity());
      await this.runTest('Chat Basic', () => this.testChatBasic());
      await this.runTest('Chat Continuation', () => this.testChatContinuation());
      await this.runTest('Consensus Basic', () => this.testConsensusBasic());

    } catch (error) {
      this.log(`Test suite failed: ${error.message}`, 'ERROR');
      throw error;
    } finally {
      await this.cleanup();
    }

    // Print results
    const passed = this.results.filter(r => r.success).length;
    const total = this.results.length;
    
    console.log('\n' + '='.repeat(50));
    console.log('HTTP TRANSPORT TEST RESULTS');
    console.log('='.repeat(50));
    console.log(`Passed: ${passed}/${total}`);
    console.log(`Success Rate: ${Math.round((passed/total)*100)}%`);
    
    if (passed < total) {
      console.log('\nFailed Tests:');
      this.results.filter(r => !r.success).forEach(r => {
        console.log(`  ✗ ${r.name}: ${r.error}`);
      });
    }

    console.log('\nPassed Tests:');
    this.results.filter(r => r.success).forEach(r => {
      console.log(`  ✓ ${r.name} (${r.duration}ms)`);
    });

    return { passed, total, results: this.results };
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const testSuite = new HTTPTestSuite();
  
  testSuite.runAllTests()
    .then((report) => {
      process.exit(report.passed === report.total ? 0 : 1);
    })
    .catch((error) => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

export default HTTPTestSuite;