/**
 * Thread Resumption Test v2
 * Check if thread ID becomes available after first run
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
  log('=== Thread Resumption Test v2 ===');

  try {
    // Step 1: Create new thread
    log('Step 1: Creating new thread...');
    const codex = new Codex();
    const thread1 = codex.startThread({
      workingDirectory: process.cwd(),
      skipGitRepoCheck: true,
    });

    // Check thread object properties
    log('Thread object keys:', Object.keys(thread1));
    log('Thread object:', thread1);

    // Check thread ID before first run
    log('\nThread ID before first run:');
    log('  thread.threadId:', thread1.threadId);
    log('  thread.id:', thread1.id);
    log('  thread.thread_id:', thread1.thread_id);

    // Step 2: Send first message
    log('\nStep 2: Sending first message...');
    const turn1 = await thread1.run('My name is Alice.');
    log('First response:', turn1.finalResponse);

    // Check thread ID after first run
    log('\nThread ID after first run:');
    log('  thread.threadId:', thread1.threadId);
    log('  thread.id:', thread1.id);
    log('  thread.thread_id:', thread1.thread_id);

    // Check turn object for thread ID
    log('\nTurn object keys:', Object.keys(turn1));
    log('Turn object:', turn1);

    // Try to find thread ID anywhere
    const threadId = thread1.threadId || thread1.id || thread1.thread_id || turn1.thread_id || turn1.threadId;

    if (!threadId) {
      log('\n❌ ERROR: Cannot find thread ID anywhere!');
      return { success: false, error: 'Thread ID not accessible' };
    }

    log('\n✅ Found thread ID:', threadId);

    // Step 3: Resume thread
    log('\nStep 3: Resuming thread...');
    const thread2 = codex.resumeThread(threadId);
    log('Resumed thread object keys:', Object.keys(thread2));

    // Step 4: Send follow-up
    log('\nStep 4: Sending follow-up...');
    const turn2 = await thread2.run('What is my name?');
    log('Follow-up response:', turn2.finalResponse);

    // Verify
    const contextPreserved = turn2.finalResponse.toLowerCase().includes('alice');
    log('\nContext preserved:', contextPreserved);

    return {
      success: true,
      threadId,
      contextPreserved,
      firstResponse: turn1.finalResponse,
      secondResponse: turn2.finalResponse,
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

// Run with timeout
const testTimeout = setTimeout(() => {
  log('ERROR: Test timed out after 120 seconds');
  process.exit(1);
}, 120000);

testThreadResumption()
  .then(result => {
    clearTimeout(testTimeout);
    log('\n=== FINAL RESULT ===', result);

    if (result.success && result.contextPreserved) {
      log('\n✅ SUCCESS: Thread resumption works!');
      process.exit(0);
    } else {
      log('\n❌ FAILURE');
      process.exit(1);
    }
  })
  .catch(error => {
    clearTimeout(testTimeout);
    log('UNHANDLED ERROR:', error);
    process.exit(1);
  });
