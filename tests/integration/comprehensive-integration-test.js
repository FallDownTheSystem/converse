#!/usr/bin/env node

/**
 * Comprehensive Integration Test Suite for Converse MCP Server
 *
 * This test suite validates full MCP server functionality including:
 * - Real API calls to OpenAI, Google, and XAI
 * - Chat tool with continuations and context
 * - Consensus tool with multiple providers
 * - Error handling and edge cases
 * - Performance characteristics
 */

import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class TestResult {
  constructor(name) {
    this.name = name;
    this.success = false;
    this.error = null;
    this.details = {};
    this.duration = 0;
  }

  setSuccess(details = {}) {
    this.success = true;
    this.details = details;
  }

  setFailure(error, details = {}) {
    this.success = false;
    this.error = error;
    this.details = details;
  }
}

class ComprehensiveTestSuite {
  constructor() {
    this.client = null;
    this.transport = null;
    this.serverProcess = null;
    this.results = [];
    this.startTime = Date.now();
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${message}`);
  }

  async startServer() {
    this.log('Starting MCP server with stdio transport...');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server startup timeout'));
      }, 15000);

      try {
        // Use stdio transport for testing as that's what the current infrastructure supports
        this.transport = new StdioClientTransport({
          command: 'node',
          args: [join(__dirname, 'src/index.js'), '--transport=stdio'],
          env: {
            ...process.env,
            NODE_ENV: 'test',
            LOG_LEVEL: 'error', // Minimal logging to avoid stdout contamination
          },
        });

        this.client = new Client({
          name: 'comprehensive-test-client',
          version: '1.0.0',
        });

        this.client
          .connect(this.transport)
          .then(() => {
            clearTimeout(timeout);
            this.log('MCP server connected successfully');
            resolve();
          })
          .catch((error) => {
            clearTimeout(timeout);
            reject(new Error(`Client connection failed: ${error.message}`));
          });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  async stopServer() {
    this.log('Stopping MCP server...');

    try {
      if (this.client) {
        await this.client.close();
      }
      if (this.transport) {
        await this.transport.close();
      }
      this.log('MCP server stopped successfully');
    } catch (error) {
      this.log(`Error stopping server: ${error.message}`, 'WARN');
    }
  }

  async runTest(testName, testFunction) {
    const result = new TestResult(testName);
    const startTime = Date.now();

    this.log(`Running test: ${testName}`);

    try {
      const testResult = await testFunction();
      result.setSuccess(testResult);
      result.duration = Date.now() - startTime;
      this.log(`✓ ${testName} (${result.duration}ms)`, 'PASS');
    } catch (error) {
      result.setFailure(error);
      result.duration = Date.now() - startTime;
      this.log(
        `✗ ${testName} (${result.duration}ms): ${error.message}`,
        'FAIL',
      );
    }

    this.results.push(result);
    return result;
  }

  // Test: Basic server connectivity
  async testServerConnectivity() {
    const response = await this.client.listTools();

    if (!response.tools || !Array.isArray(response.tools)) {
      throw new Error('Invalid tools response format');
    }

    const toolNames = response.tools.map((tool) => tool.name);
    const expectedTools = ['chat', 'consensus'];

    for (const tool of expectedTools) {
      if (!toolNames.includes(tool)) {
        throw new Error(
          `Expected tool '${tool}' not found in: ${toolNames.join(', ')}`,
        );
      }
    }

    return {
      toolCount: response.tools.length,
      tools: toolNames,
    };
  }

  // Test: Chat tool basic functionality
  async testChatBasic() {
    const response = await this.client.callTool({
      name: 'chat',
      arguments: {
        prompt: 'Hello! Please respond with exactly: "Test response received"',
        model: 'openai:gpt-4o-mini',
      },
    });

    if (!response.content || !Array.isArray(response.content)) {
      throw new Error('Invalid response format - missing content array');
    }

    if (response.content[0].type !== 'text') {
      throw new Error('Expected text response type');
    }

    return {
      responseLength: response.content[0].text.length,
      hasContent: !!response.content[0].text,
    };
  }

  // Test: Chat tool with continuation
  async testChatContinuation() {
    // First message
    const firstResponse = await this.client.callTool({
      name: 'chat',
      arguments: {
        prompt:
          'Remember this number: 12345. Just say "I will remember 12345" and nothing else.',
        model: 'openai:gpt-4o-mini',
      },
    });

    if (!firstResponse.continuation) {
      throw new Error('First response missing continuation');
    }

    const conversationId = firstResponse.continuation.id;

    // Second message using continuation
    const secondResponse = await this.client.callTool({
      name: 'chat',
      arguments: {
        prompt: 'What number did I ask you to remember?',
        continuation: conversationId,
        model: 'openai:gpt-4o-mini',
      },
    });

    if (secondResponse.continuation.id !== conversationId) {
      throw new Error('Continuation ID mismatch');
    }

    return {
      conversationId,
      firstMessageCount: firstResponse.continuation.messageCount,
      secondMessageCount: secondResponse.continuation.messageCount,
      conversationMaintained: secondResponse.continuation.id === conversationId,
    };
  }

  // Test: Consensus tool with multiple providers
  async testConsensusBasic() {
    const response = await this.client.callTool({
      name: 'consensus',
      arguments: {
        prompt: 'What is 2 + 2? Please respond with just the number.',
        models: [{ model: 'openai:gpt-4o-mini' }, { model: 'google:flash' }],
      },
    });

    if (!response.content || !Array.isArray(response.content)) {
      throw new Error('Invalid consensus response format');
    }

    const consensusText = response.content[0].text;
    if (
      !consensusText.includes('Initial Responses') ||
      !consensusText.includes('Refined Responses')
    ) {
      throw new Error('Consensus response missing expected sections');
    }

    return {
      responseLength: consensusText.length,
      hasInitialResponses: consensusText.includes('Initial Responses'),
      hasRefinedResponses: consensusText.includes('Refined Responses'),
    };
  }

  // Test: Error handling - invalid tool
  async testErrorHandlingInvalidTool() {
    try {
      await this.client.callTool({
        name: 'nonexistent-tool',
        arguments: {},
      });
      throw new Error('Expected error for invalid tool, but call succeeded');
    } catch (error) {
      if (error.message.includes('Unknown tool')) {
        return { errorHandled: true, errorMessage: error.message };
      }
      throw error;
    }
  }

  // Test: Error handling - invalid arguments
  async testErrorHandlingInvalidArgs() {
    try {
      await this.client.callTool({
        name: 'chat',
        arguments: {}, // Missing required prompt
      });
      throw new Error('Expected error for missing prompt, but call succeeded');
    } catch (error) {
      if (
        error.message.includes('prompt') ||
        error.message.includes('required')
      ) {
        return { errorHandled: true, errorMessage: error.message };
      }
      throw error;
    }
  }

  // Test: File context processing
  async testFileContext() {
    // Create a temporary test file
    const testFile = join(__dirname, 'test-context.txt');
    await fs.writeFile(
      testFile,
      'This is test content for file context processing.\nLine 2 of test file.',
    );

    try {
      const response = await this.client.callTool({
        name: 'chat',
        arguments: {
          prompt: 'What is in the provided file?',
          model: 'openai:gpt-4o-mini',
          files: [testFile],
        },
      });

      if (!response.content || !response.content[0].text) {
        throw new Error('No response content for file context test');
      }

      // Cleanup
      await fs.unlink(testFile);

      return {
        fileProcessed: true,
        responseLength: response.content[0].text.length,
      };
    } catch (error) {
      // Cleanup on error
      try {
        await fs.unlink(testFile);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  // Test: Performance - response time
  async testPerformanceBasic() {
    const startTime = Date.now();

    await this.client.callTool({
      name: 'chat',
      arguments: {
        prompt: 'Hi',
        model: 'openai:gpt-4o-mini',
      },
    });

    const responseTime = Date.now() - startTime;

    if (responseTime > 30000) {
      // 30 second timeout
      throw new Error(`Response time too slow: ${responseTime}ms`);
    }

    return {
      responseTime,
      withinLimit: responseTime < 30000,
    };
  }

  // Generate comprehensive test report
  async generateReport() {
    const totalDuration = Date.now() - this.startTime;
    const passed = this.results.filter((r) => r.success).length;
    const failed = this.results.filter((r) => !r.success).length;

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: this.results.length,
        passed,
        failed,
        successRate: Math.round((passed / this.results.length) * 100),
        totalDuration,
      },
      results: this.results.map((r) => ({
        name: r.name,
        success: r.success,
        duration: r.duration,
        error: r.error ? r.error.message : null,
        details: r.details,
      })),
    };

    // Save report to file
    const reportPath = join(__dirname, 'integration-test-results.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    this.log(`Test report saved to: ${reportPath}`);
    return report;
  }

  // Print summary to console
  printSummary(report) {
    console.log('\n' + '='.repeat(60));
    console.log('COMPREHENSIVE INTEGRATION TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${report.summary.total}`);
    console.log(`Passed: ${report.summary.passed}`);
    console.log(`Failed: ${report.summary.failed}`);
    console.log(`Success Rate: ${report.summary.successRate}%`);
    console.log(`Total Duration: ${report.summary.totalDuration}ms`);
    console.log('='.repeat(60));

    if (report.summary.failed > 0) {
      console.log('\nFAILED TESTS:');
      report.results
        .filter((r) => !r.success)
        .forEach((r) => {
          console.log(`  ✗ ${r.name}: ${r.error}`);
        });
    }

    console.log('\nPASSED TESTS:');
    report.results
      .filter((r) => r.success)
      .forEach((r) => {
        console.log(`  ✓ ${r.name} (${r.duration}ms)`);
      });
  }

  // Run all tests
  async runAllTests() {
    try {
      await this.startServer();

      // Core functionality tests
      await this.runTest('Server Connectivity', () =>
        this.testServerConnectivity(),
      );
      await this.runTest('Chat Basic Functionality', () =>
        this.testChatBasic(),
      );
      await this.runTest('Chat Continuation', () =>
        this.testChatContinuation(),
      );
      await this.runTest('Consensus Basic Functionality', () =>
        this.testConsensusBasic(),
      );

      // Error handling tests
      await this.runTest('Error Handling - Invalid Tool', () =>
        this.testErrorHandlingInvalidTool(),
      );
      await this.runTest('Error Handling - Invalid Arguments', () =>
        this.testErrorHandlingInvalidArgs(),
      );

      // Feature tests
      await this.runTest('File Context Processing', () =>
        this.testFileContext(),
      );

      // Performance tests
      await this.runTest('Performance - Basic Response Time', () =>
        this.testPerformanceBasic(),
      );
    } finally {
      await this.stopServer();
    }

    const report = await this.generateReport();
    this.printSummary(report);

    return report;
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const testSuite = new ComprehensiveTestSuite();

  testSuite
    .runAllTests()
    .then((report) => {
      process.exit(report.summary.failed > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('Test suite failed:', error);
      process.exit(1);
    });
}

export default ComprehensiveTestSuite;
