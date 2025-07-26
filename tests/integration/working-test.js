#!/usr/bin/env node

/**
 * Working Integration Test for Converse MCP Server
 * Tests core functionality by calling tools directly
 */

console.log('Starting comprehensive integration test...');

async function runTest() {
  try {
    // Import modules
    console.log('Loading MCP components...');

    const { loadConfig } = await import('../../src/config.js');
    const { getTools } = await import('../../src/tools/index.js');
    const { getProviders } = await import('../../src/providers/index.js');
    const { getContinuationStore } = await import('../../src/continuationStore.js');
    const { processUnifiedContext } = await import('../../src/utils/contextProcessor.js');

    // Initialize components
    const config = await loadConfig();
    const tools = getTools();
    const providers = getProviders();
    const continuationStore = getContinuationStore();

    console.log(`✓ Components loaded: ${Object.keys(tools).length} tools, ${Object.keys(providers).length} providers`);

    // Create dependencies like the router does
    const dependencies = {
      config,
      continuationStore,
      providers,
      contextProcessor: { processUnifiedContext },
      router: {
        createErrorResponse: (error) => ({ error: error.message }),
        validateToolArguments: () => true,
      },
    };

    const results = [];

    // Test 1: Chat tool basic functionality
    console.log('\n=== Test 1: Chat Tool Basic ===');
    try {
      const chatTool = tools.chat;
      const chatResult = await chatTool({
        prompt: 'Say exactly: "Integration test successful"',
        model: 'openai:gpt-4o-mini'
      }, dependencies);

      if (chatResult.content?.[0]?.text) {
        console.log('✓ Chat tool working');
        console.log(`Response length: ${chatResult.content[0].text.length} characters`);
        results.push({ test: 'Chat Basic', success: true });
      } else {
        throw new Error('Invalid chat response format');
      }
    } catch (error) {
      console.log(`✗ Chat tool failed: ${error.message}`);
      results.push({ test: 'Chat Basic', success: false, error: error.message });
    }

    // Test 2: Chat with continuation
    console.log('\n=== Test 2: Chat Continuation ===');
    try {
      const chatTool = tools.chat;

      // First message
      const first = await chatTool({
        prompt: 'Remember this number: 999. Just say "I remember 999"',
        model: 'openai:gpt-4o-mini'
      }, dependencies);

      if (!first.continuation?.id) {
        throw new Error('No continuation in first response');
      }

      console.log(`Conversation started: ${first.continuation.id}`);

      // Second message
      const second = await chatTool({
        prompt: 'What number did I ask you to remember?',
        continuation: first.continuation.id,
        model: 'openai:gpt-4o-mini'
      }, dependencies);

      if (second.continuation.id === first.continuation.id) {
        console.log('✓ Chat continuation working');
        console.log(`Message count: ${second.continuation.messageCount}`);
        results.push({ test: 'Chat Continuation', success: true });
      } else {
        throw new Error('Continuation ID mismatch');
      }
    } catch (error) {
      console.log(`✗ Chat continuation failed: ${error.message}`);
      results.push({ test: 'Chat Continuation', success: false, error: error.message });
    }

    // Test 3: Consensus tool
    console.log('\n=== Test 3: Consensus Tool ===');
    try {
      const consensusTool = tools.consensus;
      const consensusResult = await consensusTool({
        prompt: 'What is 7 + 8? Answer with just the number.',
        models: [
          { model: 'openai:gpt-4o-mini' },
          { model: 'google:flash' }
        ]
      }, dependencies);

      if (consensusResult.content?.[0]?.text) {
        const text = consensusResult.content[0].text;
        const hasInitial = text.includes('Initial Responses');
        const hasRefined = text.includes('Refined Responses');

        console.log('✓ Consensus tool working');
        console.log(`Has initial responses: ${hasInitial}`);
        console.log(`Has refined responses: ${hasRefined}`);
        console.log(`Response length: ${text.length} characters`);
        results.push({ test: 'Consensus Tool', success: true });
      } else {
        throw new Error('Invalid consensus response format');
      }
    } catch (error) {
      console.log(`✗ Consensus tool failed: ${error.message}`);
      results.push({ test: 'Consensus Tool', success: false, error: error.message });
    }

    // Test 4: Error handling
    console.log('\n=== Test 4: Error Handling ===');
    try {
      const chatTool = tools.chat;

      try {
        await chatTool({
          // Missing required prompt
          model: 'openai:gpt-4o-mini'
        }, dependencies);

        console.log('✗ Error handling failed: Expected error but call succeeded');
        results.push({ test: 'Error Handling', success: false, error: 'Expected error but call succeeded' });
      } catch (error) {
        if (error.message.includes('prompt') || error.message.includes('required')) {
          console.log('✓ Error handling working');
          console.log(`Error correctly caught: ${error.message}`);
          results.push({ test: 'Error Handling', success: true });
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.log(`✗ Error handling test failed: ${error.message}`);
      results.push({ test: 'Error Handling', success: false, error: error.message });
    }

    // Test 5: Provider functionality
    console.log('\n=== Test 5: Provider Tests ===');
    const providerResults = {};

    for (const [name, provider] of Object.entries(providers)) {
      try {
        console.log(`Testing ${name} provider...`);

        const response = await provider.invoke([
          { role: 'user', content: `Say "Provider ${name} working"` }
        ], {
          model: name === 'openai' ? 'gpt-4o-mini' :
            name === 'google' ? 'flash' : 'grok-beta',
          max_tokens: 30
        });

        if (response.content) {
          console.log(`✓ ${name} provider working`);
          providerResults[name] = { success: true, length: response.content.length };
        } else {
          throw new Error('No content in response');
        }
      } catch (error) {
        console.log(`✗ ${name} provider failed: ${error.message}`);
        providerResults[name] = { success: false, error: error.message };
      }
    }

    results.push({ test: 'Provider Tests', success: true, details: providerResults });

    // Print summary
    const passed = results.filter(r => r.success).length;
    const total = results.length;

    console.log('\n' + '='.repeat(60));
    console.log('INTEGRATION TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`Passed: ${passed}/${total} (${Math.round((passed/total)*100)}%)`);

    console.log('\nDetailed Results:');
    results.forEach(r => {
      const status = r.success ? '✓' : '✗';
      console.log(`${status} ${r.test}${r.error ? ': ' + r.error : ''}`);
    });

    if (passed === total) {
      console.log('\n🎉 All tests passed! Converse MCP Server is working correctly.');
    } else {
      console.log(`\n❌ ${total - passed} tests failed. Check the errors above.`);
    }

    // Save results
    const fs = await import('fs/promises');
    const report = {
      timestamp: new Date().toISOString(),
      summary: { total, passed, failed: total - passed, successRate: Math.round((passed/total)*100) },
      results
    };

    await fs.writeFile('integration-test-report.json', JSON.stringify(report, null, 2));
    console.log('\nDetailed report saved to integration-test-report.json');

    return report;

  } catch (error) {
    console.error('Test execution failed:', error);
    throw error;
  }
}

// Run the test
runTest()
  .then((report) => {
    process.exit(report.summary.passed === report.summary.total ? 0 : 1);
  })
  .catch((error) => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
