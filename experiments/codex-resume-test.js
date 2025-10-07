/**
 * Focused Thread Resumption Test
 * Tests if Codex threads can be resumed and maintain context
 */

import { Codex } from '@openai/codex-sdk';

function log(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  if (data !== null && data !== undefined) {
    console.log(JSON.stringify(data, null, 2));
  }
}

async function testThreadResumption() {
  log('=== Thread Resumption Test ===');

  try {
    // Step 1: Create new thread
    log('Step 1: Creating new thread...');
    const codex = new Codex();
    const thread1 = codex.startThread({
      workingDirectory: process.cwd(),
      skipGitRepoCheck: true,
    });

    // Check thread ID
    log('Thread created. Checking thread ID...');
    const threadId = thread1.threadId;
    log('Thread ID (direct access):', threadId);
    log('Thread ID type:', typeof threadId);

    if (!threadId || threadId === '{}') {
      log('ERROR: Thread ID is invalid!');
      return { success: false, error: 'Invalid thread ID' };
    }

    // Step 2: Send first message
    log('\nStep 2: Sending first message...');
    const startTime1 = Date.now();
    const turn1 = await thread1.run('My name is Alice. Remember this.');
    const duration1 = Date.now() - startTime1;

    log(`First message completed in ${duration1}ms`);
    log('Response:', turn1.finalResponse);

    // Step 3: Resume thread
    log('\nStep 3: Resuming thread with ID:', threadId);
    const thread2 = codex.resumeThread(threadId);

    // Step 4: Send follow-up message
    log('Step 4: Sending follow-up message...');
    const startTime2 = Date.now();
    const turn2 = await thread2.run('What is my name?');
    const duration2 = Date.now() - startTime2;

    log(`Follow-up message completed in ${duration2}ms`);
    log('Response:', turn2.finalResponse);

    // Step 5: Verify context preserved
    const responseLower = turn2.finalResponse.toLowerCase();
    const contextPreserved = responseLower.includes('alice');

    log('\nStep 5: Verification');
    log('Context preserved:', contextPreserved);
    log('Response contains "alice":', responseLower.includes('alice'));

    return {
      success: true,
      threadId,
      firstResponse: turn1.finalResponse,
      secondResponse: turn2.finalResponse,
      contextPreserved,
      duration1,
      duration2,
    };

  } catch (error) {
    log('ERROR:', {
      message: error.message,
      code: error.code,
      stack: error.stack,
    });
    return { success: false, error: error.message };
  }
}

// Run test with timeout
const testTimeout = setTimeout(() => {
  log('ERROR: Test timed out after 120 seconds');
  process.exit(1);
}, 120000); // 2 minute timeout

testThreadResumption()
  .then(result => {
    clearTimeout(testTimeout);
    log('\n=== FINAL RESULT ===');
    log('Result:', result);

    if (result.success && result.contextPreserved) {
      log('\n✅ SUCCESS: Thread resumption works and context is preserved!');
      process.exit(0);
    } else if (result.success && !result.contextPreserved) {
      log('\n⚠️  WARNING: Thread resumed but context was NOT preserved!');
      process.exit(1);
    } else {
      log('\n❌ FAILURE: Thread resumption failed!');
      process.exit(1);
    }
  })
  .catch(error => {
    clearTimeout(testTimeout);
    log('UNHANDLED ERROR:', error);
    process.exit(1);
  });
