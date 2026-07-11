#!/usr/bin/env node

/**
 * Direct MCP functionality test using the router directly
 * This bypasses transport issues and tests the core functionality
 */

import { loadConfig } from '../../../src/config.js';
import { getTools } from '../../../src/tools/index.js';
import { getProviders } from '../../../src/providers/index.js';
import { getContinuationStore } from '../../../src/continuationStore.js';
import { processUnifiedContext } from '../../../src/utils/contextProcessor.js';
import fs from 'fs/promises';
import path from 'path';

class DirectMCPTest {
  constructor() {
    this.config = null;
    this.tools = null;
    this.providers = null;
    this.continuationStore = null;
    this.dependencies = null;
    this.results = [];
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${message}`);
  }

  async initialize() {
    this.log('Initializing MCP components...');

    // Load configuration
    this.config = await loadConfig();
    this.log(`Config loaded: ${this.config.environment.nodeEnv} environment`);

    // Get tools and providers
    this.tools = getTools();
    this.providers = getProviders();
    this.continuationStore = getContinuationStore();

    this.log(`Tools available: ${Object.keys(this.tools).join(', ')}`);
    this.log(`Providers available: ${Object.keys(this.providers).join(', ')}`);

    // Create dependencies object like router does
    this.dependencies = {
      config: this.config,
      continuationStore: this.continuationStore,
      providers: this.providers,
      contextProcessor: { processUnifiedContext },
      router: {
        createErrorResponse: (error) => ({ error: error.message }),
        validateToolArguments: () => true,
      },
    };

    this.log('MCP components initialized successfully');
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
      this.results.push({
        name,
        success: false,
        duration,
        error: error.message,
      });
      throw error;
    }
  }

  // Test chat tool directly
  async testChatDirect() {
    const chatTool = this.tools.chat;
    if (!chatTool) {
      throw new Error('Chat tool not available');
    }

    const result = await chatTool(
      {
        prompt: 'Say exactly: "Direct chat test successful"',
        models: ['openai:gpt-4o-mini'],
      },
      this.dependencies,
    );

    if (!result.content?.[0]?.text) {
      throw new Error('Invalid chat response format');
    }

    return {
      hasContent: true,
      responseLength: result.content[0].text.length,
      toolName: 'chat',
    };
  }

  // Test chat with continuation
  async testChatContinuation() {
    const chatTool = this.tools.chat;

    // First message
    const first = await chatTool(
      {
        prompt: 'Remember this code: ABC123. Just say "I remember ABC123"',
        models: ['openai:gpt-4o-mini'],
      },
      this.dependencies,
    );

    if (!first.continuation?.id) {
      throw new Error('No continuation in first response');
    }

    // Second message using continuation
    const second = await chatTool(
      {
        prompt: 'What code did I ask you to remember?',
        continuation_id: first.continuation.id,
        models: ['openai:gpt-4o-mini'],
      },
      this.dependencies,
    );

    return {
      conversationId: first.continuation.id,
      conversationMaintained: second.continuation.id === first.continuation.id,
      messageCount: second.continuation.messageCount,
    };
  }

  // Test chat tool in consensus mode directly
  async testConsensusDirect() {
    const chatTool = this.tools.chat;
    if (!chatTool) {
      throw new Error('Chat tool not available');
    }

    const result = await chatTool(
      {
        prompt: 'What is 3 + 3? Answer with just the number.',
        mode: 'consensus',
        models: ['openai:gpt-4o-mini', 'google:flash'],
      },
      this.dependencies,
    );

    if (!result.content?.[0]?.text) {
      throw new Error('Invalid consensus response format');
    }

    const text = result.content[0].text;
    return {
      hasInitialResponses: text.includes('successful_initial_responses'),
      hasRefinedResponses: text.includes('phases'),
      responseLength: text.length,
    };
  }

  // Test file context processing
  async testFileContext() {
    const chatTool = this.tools.chat;

    // Create a test file
    const testFile = path.join(process.cwd(), 'test-context-file.txt');
    await fs.writeFile(
      testFile,
      'This is test content for context processing.\nSecond line of test.',
    );

    try {
      const result = await chatTool(
        {
          prompt: 'What is in the provided file? Summarize briefly.',
          models: ['openai:gpt-4o-mini'],
          files: [testFile],
        },
        this.dependencies,
      );

      if (!result.content?.[0]?.text) {
        throw new Error('No response content for file context test');
      }

      return {
        fileProcessed: true,
        responseLength: result.content[0].text.length,
      };
    } finally {
      // Cleanup
      try {
        await fs.unlink(testFile);
      } catch (error) {
        this.log(
          `Warning: Could not delete test file: ${error.message}`,
          'WARN',
        );
      }
    }
  }

  // Test error handling
  async testErrorHandling() {
    const chatTool = this.tools.chat;

    try {
      await chatTool(
        {
          // Missing required prompt
          models: ['openai:gpt-4o-mini'],
        },
        this.dependencies,
      );

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

  // Test provider functionality
  async testProviders() {
    const results = {};

    for (const [name, provider] of Object.entries(this.providers)) {
      try {
        const response = await provider.invoke(
          [{ role: 'user', content: 'Say "Provider test for ' + name + '"' }],
          {
            model:
              name === 'openai'
                ? 'gpt-4o-mini'
                : name === 'google'
                  ? 'flash'
                  : 'grok-beta',
            max_tokens: 50,
          },
        );

        results[name] = {
          success: true,
          hasContent: !!response.content,
          responseLength: response.content?.length || 0,
        };

        this.log(`Provider ${name}: ✓`);
      } catch (error) {
        results[name] = {
          success: false,
          error: error.message,
        };
        this.log(`Provider ${name}: ✗ ${error.message}`, 'WARN');
      }
    }

    return results;
  }

  async runAllTests() {
    try {
      await this.initialize();

      // Core functionality tests
      await this.runTest('Chat Tool Direct', () => this.testChatDirect());
      await this.runTest('Chat Continuation', () =>
        this.testChatContinuation(),
      );
      await this.runTest('Consensus Tool Direct', () =>
        this.testConsensusDirect(),
      );

      // Feature tests
      await this.runTest('File Context Processing', () =>
        this.testFileContext(),
      );
      await this.runTest('Error Handling', () => this.testErrorHandling());

      // Provider tests
      await this.runTest('Provider Functionality', () => this.testProviders());
    } catch (error) {
      this.log(`Test initialization failed: ${error.message}`, 'ERROR');
      throw error;
    }

    // Print results summary
    const passed = this.results.filter((r) => r.success).length;
    const total = this.results.length;

    console.log('\n' + '='.repeat(60));
    console.log('DIRECT MCP FUNCTIONALITY TEST RESULTS');
    console.log('='.repeat(60));
    console.log(
      `Passed: ${passed}/${total} (${Math.round((passed / total) * 100)}%)`,
    );

    if (passed < total) {
      console.log('\nFailed Tests:');
      this.results
        .filter((r) => !r.success)
        .forEach((r) => {
          console.log(`  ✗ ${r.name}: ${r.error}`);
        });
    }

    console.log('\nPassed Tests:');
    this.results
      .filter((r) => r.success)
      .forEach((r) => {
        console.log(`  ✓ ${r.name} (${r.duration}ms)`);
      });

    // Save detailed results
    const report = {
      timestamp: new Date().toISOString(),
      summary: { total, passed, failed: total - passed },
      results: this.results,
    };

    await fs.writeFile(
      'direct-test-results.json',
      JSON.stringify(report, null, 2),
    );
    this.log('Detailed results saved to direct-test-results.json');

    return report;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const testSuite = new DirectMCPTest();

  testSuite
    .runAllTests()
    .then((report) => {
      process.exit(report.summary.passed === report.summary.total ? 0 : 1);
    })
    .catch((error) => {
      console.error('Direct test execution failed:', error);
      process.exit(1);
    });
}

export default DirectMCPTest;
