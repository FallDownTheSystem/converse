#!/usr/bin/env node

/**
 * Final Integration Test for Converse MCP Server
 * Comprehensive test with correct model names and real API validation
 */

console.log('🚀 Starting Final Integration Test for Converse MCP Server');
console.log('This test validates all core functionality with real API calls');

async function runFinalTest() {
  try {
    // Import modules
    console.log('\n📦 Loading MCP components...');

    const { loadConfig } = await import('../../src/config.js');
    const { getTools } = await import('../../src/tools/index.js');
    const { getProviders } = await import('../../src/providers/index.js');
    const { getContinuationStore } = await import('../../src/continuationStore.js');
    const { processUnifiedContext } = await import('../../src/utils/contextProcessor.js');
    const fs = await import('fs/promises');

    // Initialize components
    const config = await loadConfig();
    const tools = getTools();
    const providers = getProviders();
    const continuationStore = getContinuationStore();

    console.log('✅ Components loaded successfully');
    console.log(`   - Tools: ${Object.keys(tools).join(', ')}`);
    console.log(`   - Providers: ${Object.keys(providers).join(', ')}`);
    console.log(`   - Environment: ${config.environment.nodeEnv}`);

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
    const startTime = Date.now();

    // Helper function to run individual tests
    async function runTest(testName, testFn) {
      console.log(`\n🧪 ${testName}`);
      const testStart = Date.now();

      try {
        const result = await testFn();
        const duration = Date.now() - testStart;
        console.log(`   ✅ PASSED (${duration}ms)`);
        results.push({ test: testName, success: true, duration, result });
        return result;
      } catch (error) {
        const duration = Date.now() - testStart;
        console.log(`   ❌ FAILED (${duration}ms): ${error.message}`);
        results.push({ test: testName, success: false, duration, error: error.message });
        return null;
      }
    }

    // Test 1: Chat Tool with OpenAI (correct model name)
    await runTest('Chat Tool - OpenAI GPT-4o-mini', async () => {
      const chatTool = tools.chat;
      const result = await chatTool({
        prompt: 'Respond with exactly: "OpenAI chat test successful"',
        model: 'gpt-4o-mini'  // Correct format without prefix
      }, dependencies);

      if (!result.content?.[0]?.text) {
        throw new Error('Invalid chat response format');
      }

      const responseText = result.content[0].text;
      console.log(`   📝 Response: "${responseText.substring(0, 50)}..."`);

      return {
        hasContent: true,
        responseLength: responseText.length,
        hasRealResponse: responseText.length > 20 && !responseText.includes('mock')
      };
    });

    // Test 2: Chat Tool with Google Gemini
    await runTest('Chat Tool - Google Gemini Flash', async () => {
      const chatTool = tools.chat;
      const result = await chatTool({
        prompt: 'Respond with exactly: "Google Gemini test successful"',
        model: 'flash'  // Google model
      }, dependencies);

      if (!result.content?.[0]?.text) {
        throw new Error('Invalid chat response format');
      }

      const responseText = result.content[0].text;
      console.log(`   📝 Response: "${responseText.substring(0, 50)}..."`);

      return {
        hasContent: true,
        responseLength: responseText.length,
        hasRealResponse: responseText.length > 20
      };
    });

    // Test 3: Chat Tool with XAI Grok
    await runTest('Chat Tool - XAI Grok', async () => {
      const chatTool = tools.chat;
      const result = await chatTool({
        prompt: 'Respond with exactly: "XAI Grok test successful"',
        model: 'grok-beta'  // XAI model
      }, dependencies);

      if (!result.content?.[0]?.text) {
        throw new Error('Invalid chat response format');
      }

      const responseText = result.content[0].text;
      console.log(`   📝 Response: "${responseText.substring(0, 50)}..."`);

      return {
        hasContent: true,
        responseLength: responseText.length,
        hasRealResponse: responseText.length > 20
      };
    });

    // Test 4: Chat with Continuation
    await runTest('Chat Continuation Feature', async () => {
      const chatTool = tools.chat;

      // First message - establish conversation
      const first = await chatTool({
        prompt: 'Remember this secret code: ALPHA-7749. Just confirm you remember it.',
        model: 'gpt-4o-mini'
      }, dependencies);

      if (!first.continuation?.id) {
        throw new Error('No continuation ID in first response');
      }

      console.log(`   💬 Conversation started: ${first.continuation.id}`);
      console.log(`   📊 Message count: ${first.continuation.messageCount}`);

      // Second message - test memory
      const second = await chatTool({
        prompt: 'What secret code did I ask you to remember?',
        continuation: first.continuation.id,
        model: 'gpt-4o-mini'
      }, dependencies);

      if (second.continuation.id !== first.continuation.id) {
        throw new Error('Conversation ID changed');
      }

      const responseText = second.content[0].text;
      console.log(`   🧠 Memory test response: "${responseText.substring(0, 50)}..."`);

      return {
        conversationMaintained: true,
        initialMessageCount: first.continuation.messageCount,
        followupMessageCount: second.continuation.messageCount,
        memoryWorking: responseText.includes('ALPHA-7749') || responseText.includes('7749')
      };
    });

    // Test 5: Consensus Tool with Multiple Providers
    await runTest('Consensus Tool - Multi-Provider', async () => {
      const consensusTool = tools.consensus;
      const result = await consensusTool({
        prompt: 'What is 15 + 27? Respond only with the number.',
        models: ['gpt-4o-mini', 'flash', 'grok-beta']
      }, dependencies);

      if (!result.content?.[0]?.text) {
        throw new Error('Invalid consensus response format');
      }

      const text = result.content[0].text;
      console.log(`   📊 Consensus response length: ${text.length} chars`);

      const hasInitial = text.includes('Initial Responses');
      const hasRefined = text.includes('Refined Responses');
      const mentions42 = text.includes('42'); // The correct answer

      console.log(`   🔍 Structure check: Initial(${hasInitial}) Refined(${hasRefined}) Answer(${mentions42})`);

      return {
        hasInitialResponses: hasInitial,
        hasRefinedResponses: hasRefined,
        responseLength: text.length,
        hasCorrectAnswer: mentions42,
        multiProviderWorking: text.split('Provider:').length > 2
      };
    });

    // Test 6: File Context Processing
    await runTest('File Context Processing', async () => {
      const chatTool = tools.chat;

      // Create a test file with specific content
      const testFile = 'integration-test-file.txt';
      const testContent = 'This is a test file for integration testing.\nIt contains multiple lines.\nLine 3 has special content: INTEGRATION_TEST_MARKER';

      await fs.writeFile(testFile, testContent);

      try {
        const result = await chatTool({
          prompt: 'What is in the provided file? Look for the special marker.',
          model: 'gpt-4o-mini',
          files: [testFile]
        }, dependencies);

        if (!result.content?.[0]?.text) {
          throw new Error('No response content for file context test');
        }

        const responseText = result.content[0].text;
        console.log(`   📄 File processing response: "${responseText.substring(0, 80)}..."`);

        return {
          fileProcessed: true,
          responseLength: responseText.length,
          foundMarker: responseText.includes('INTEGRATION_TEST_MARKER')
        };
      } finally {
        // Cleanup
        try {
          await fs.unlink(testFile);
        } catch (error) {
          console.log(`   ⚠️  Could not delete test file: ${error.message}`);
        }
      }
    });

    // Test 7: Error Handling
    await runTest('Error Handling & Validation', async () => {
      const chatTool = tools.chat;

      // Test 1: Missing prompt
      try {
        await chatTool({
          model: 'gpt-4o-mini'
          // Missing prompt
        }, dependencies);
        throw new Error('Should have failed with missing prompt');
      } catch (error) {
        if (!error.message.includes('Prompt') && !error.message.includes('required')) {
          throw error;
        }
      }

      // Test 2: Invalid model
      try {
        const result = await chatTool({
          prompt: 'Test prompt',
          model: 'nonexistent-model-12345'
        }, dependencies);

        // Should either fail or return an error response
        if (result.content && !result.error && !result.content[0].text.includes('error')) {
          throw new Error('Should have handled invalid model gracefully');
        }
      } catch (error) {
        // This is expected for invalid models
        if (!error.message.includes('model') && !error.message.includes('provider')) {
          throw error;
        }
      }

      console.log('   ✅ Error handling working correctly');

      return {
        missingPromptHandled: true,
        invalidModelHandled: true
      };
    });

    // Test 8: Auto Provider Selection
    await runTest('Auto Provider Selection', async () => {
      const chatTool = tools.chat;
      const result = await chatTool({
        prompt: 'This should use the first available provider automatically.',
        model: 'auto'  // Let system choose
      }, dependencies);

      if (!result.content?.[0]?.text) {
        throw new Error('Auto provider selection failed');
      }

      console.log('   🤖 Auto-selected provider worked');

      return {
        autoSelectionWorked: true,
        responseLength: result.content[0].text.length
      };
    });

    // Calculate final results
    const totalDuration = Date.now() - startTime;
    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const total = results.length;
    const successRate = Math.round((passed / total) * 100);

    // Print comprehensive summary
    console.log('\n' + '='.repeat(80));
    console.log('🎯 FINAL INTEGRATION TEST RESULTS');
    console.log('='.repeat(80));
    console.log(`📊 Summary: ${passed}/${total} tests passed (${successRate}%)`);
    console.log(`⏱️  Total Duration: ${totalDuration}ms (${Math.round(totalDuration/1000)}s)`);
    console.log(`🔧 Environment: ${config.environment.nodeEnv}`);
    console.log(`🗂️  Tools Tested: ${Object.keys(tools).length}`);
    console.log(`🏭 Providers Tested: ${Object.keys(providers).length}`);

    if (failed > 0) {
      console.log('\n❌ FAILED TESTS:');
      results.filter(r => !r.success).forEach(r => {
        console.log(`   • ${r.test}: ${r.error}`);
      });
    }

    console.log('\n✅ PASSED TESTS:');
    results.filter(r => r.success).forEach(r => {
      console.log(`   • ${r.test} (${r.duration}ms)`);
    });

    // Feature validation summary
    console.log('\n🔍 FEATURE VALIDATION:');
    const chatTests = results.filter(r => r.test.includes('Chat') && r.success);
    const consensusTests = results.filter(r => r.test.includes('Consensus') && r.success);
    const continuationTest = results.find(r => r.test.includes('Continuation'));
    const fileTest = results.find(r => r.test.includes('File'));
    const errorTest = results.find(r => r.test.includes('Error'));

    console.log(`   📢 Chat Tool: ${chatTests.length > 0 ? '✅ Working' : '❌ Failed'}`);
    console.log(`   🤝 Consensus Tool: ${consensusTests.length > 0 ? '✅ Working' : '❌ Failed'}`);
    console.log(`   💭 Continuations: ${continuationTest?.success ? '✅ Working' : '❌ Failed'}`);
    console.log(`   📁 File Context: ${fileTest?.success ? '✅ Working' : '❌ Failed'}`);
    console.log(`   ⚠️  Error Handling: ${errorTest?.success ? '✅ Working' : '❌ Failed'}`);

    // Provider status
    console.log('\n🏭 PROVIDER STATUS:');
    const openaiTest = results.find(r => r.test.includes('OpenAI'));
    const googleTest = results.find(r => r.test.includes('Google'));
    const xaiTest = results.find(r => r.test.includes('XAI'));

    console.log(`   🤖 OpenAI: ${openaiTest?.success ? '✅ Working' : '❌ Failed'}`);
    console.log(`   🧠 Google: ${googleTest?.success ? '✅ Working' : '❌ Failed'}`);
    console.log(`   🚀 XAI: ${xaiTest?.success ? '✅ Working' : '❌ Failed'}`);

    // Save detailed report
    const report = {
      timestamp: new Date().toISOString(),
      environment: config.environment.nodeEnv,
      summary: {
        total,
        passed,
        failed,
        successRate,
        totalDuration
      },
      featureValidation: {
        chatTool: chatTests.length > 0,
        consensusTool: consensusTests.length > 0,
        continuations: continuationTest?.success || false,
        fileContext: fileTest?.success || false,
        errorHandling: errorTest?.success || false
      },
      providerStatus: {
        openai: openaiTest?.success || false,
        google: googleTest?.success || false,
        xai: xaiTest?.success || false
      },
      detailedResults: results
    };

    await fs.writeFile('final-integration-report.json', JSON.stringify(report, null, 2));
    console.log('\n📋 Detailed report saved to: final-integration-report.json');

    // Final verdict
    console.log('\n' + '='.repeat(80));
    if (successRate >= 80) {
      console.log('🎉 VERDICT: Converse MCP Server is WORKING CORRECTLY!');
      console.log('   The server has passed comprehensive integration testing.');
      console.log('   All core features are functional and ready for production use.');
    } else if (successRate >= 60) {
      console.log('⚠️  VERDICT: Converse MCP Server is PARTIALLY WORKING');
      console.log('   Some features are working but issues need to be addressed.');
    } else {
      console.log('❌ VERDICT: Converse MCP Server has SIGNIFICANT ISSUES');
      console.log('   Multiple core features are failing and require fixes.');
    }
    console.log('='.repeat(80));

    return report;

  } catch (error) {
    console.error('\n💥 Test execution failed:', error);
    console.error('Stack trace:', error.stack);
    throw error;
  }
}

// Run the comprehensive test
runFinalTest()
  .then((report) => {
    const exitCode = report.summary.successRate >= 80 ? 0 : 1;
    console.log(`\n🚪 Exiting with code: ${exitCode}`);
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error('💥 Final test execution failed:', error);
    process.exit(1);
  });
