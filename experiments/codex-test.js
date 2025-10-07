/**
 * Codex SDK Research and Testing
 *
 * This experimental file tests the @openai/codex-sdk to understand its behavior,
 * performance characteristics, and integration requirements.
 *
 * Research Questions:
 * 1. Process and Performance: spawning, blocking, latency, cleanup
 * 2. Event Taxonomy: complete list of event types and their structure
 * 3. Authentication: API key vs login, headless support
 * 4. Thread Management: storage, resumption, persistence
 * 5. Configuration: sandbox modes, approval policy, Git checks
 * 6. Error Scenarios: missing auth, invalid threads, non-Git repos
 * 7. Concurrency: multiple simultaneous instances
 */

import { Codex } from '@openai/codex-sdk';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Configuration
const TEST_CONFIG = {
  workingDirectory: process.cwd(),
  skipGitRepoCheck: false,
  // sandbox: 'read-only', // Will test different modes
  // approvalPolicy: 'never', // Will test different policies
};

// Utility: Log with timestamp
function log(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

// Utility: Get process count matching pattern
function getProcessCount(pattern) {
  return new Promise((resolve) => {
    const ps = spawn('ps', ['aux']);
    let output = '';
    ps.stdout.on('data', (data) => output += data.toString());
    ps.on('close', () => {
      const lines = output.split('\n').filter(line =>
        line.toLowerCase().includes(pattern.toLowerCase())
      );
      resolve(lines.length);
    });
  });
}

// Test 1: Basic Execution (Non-Streaming)
async function testBasicExecution() {
  log('=== Test 1: Basic Execution (Non-Streaming) ===');

  try {
    const codex = new Codex();
    const startTime = Date.now();

    log('Starting thread...');
    const thread = codex.startThread({
      workingDirectory: TEST_CONFIG.workingDirectory,
      skipGitRepoCheck: true, // Start with skip to avoid Git requirement
    });

    const threadCreateTime = Date.now() - startTime;
    log(`Thread created in ${threadCreateTime}ms`, { threadId: thread.threadId });

    log('Executing simple prompt...');
    const execStartTime = Date.now();
    const turn = await thread.run('Say "Hello from Codex!" and nothing else.');
    const execTime = Date.now() - execStartTime;

    log(`Execution completed in ${execTime}ms`);
    log('Response:', {
      finalResponse: turn.finalResponse,
      usage: turn.usage,
      threadId: thread.threadId,
    });

    return {
      success: true,
      threadId: thread.threadId,
      threadCreateTime,
      execTime,
      totalTime: Date.now() - startTime,
      response: turn.finalResponse,
    };
  } catch (error) {
    log('ERROR in testBasicExecution:', {
      message: error.message,
      code: error.code,
      stack: error.stack,
    });
    return { success: false, error: error.message };
  }
}

// Test 2: Streaming Events (COMPLETE EVENT TAXONOMY)
async function testStreamingEvents() {
  log('=== Test 2: Streaming Events (Complete Event Taxonomy) ===');

  try {
    const codex = new Codex();
    const thread = codex.startThread({
      workingDirectory: TEST_CONFIG.workingDirectory,
      skipGitRepoCheck: true,
    });

    log('Executing streaming prompt...');
    const startTime = Date.now();
    const { events } = await thread.runStreamed('Count from 1 to 5, then say "Done!"');

    const eventLog = [];
    let firstEventTime = null;
    let accumulatedContent = '';

    for await (const event of events) {
      const eventTime = Date.now();
      if (!firstEventTime) {
        firstEventTime = eventTime - startTime;
        log(`First event received after ${firstEventTime}ms`);
      }

      // Log EVERY event with full details
      const eventRecord = {
        timestamp: eventTime,
        relativeTime: eventTime - startTime,
        type: event.type,
        keys: Object.keys(event),
        event: event,
      };

      eventLog.push(eventRecord);

      log(`Event [${event.type}]:`, eventRecord);

      // Track content accumulation
      if (event.type === 'item.completed' && event.item?.content) {
        accumulatedContent += event.item.content;
      }
    }

    const totalTime = Date.now() - startTime;

    log('Streaming complete', {
      totalEvents: eventLog.length,
      totalTime,
      firstEventTime,
      accumulatedContent,
      eventTypes: [...new Set(eventLog.map(e => e.type))],
    });

    return {
      success: true,
      eventLog,
      totalEvents: eventLog.length,
      totalTime,
      firstEventTime,
      eventTypes: [...new Set(eventLog.map(e => e.type))],
    };
  } catch (error) {
    log('ERROR in testStreamingEvents:', {
      message: error.message,
      code: error.code,
      stack: error.stack,
    });
    return { success: false, error: error.message };
  }
}

// Test 3: Process Lifecycle and Cleanup
async function testProcessLifecycle() {
  log('=== Test 3: Process Lifecycle and Cleanup ===');

  try {
    // Count processes before
    const beforeCount = await getProcessCount('codex');
    log(`Processes before: ${beforeCount}`);

    const codex = new Codex();
    const thread = codex.startThread({
      workingDirectory: TEST_CONFIG.workingDirectory,
      skipGitRepoCheck: true,
    });

    // Check if execution blocks event loop
    log('Testing event loop blocking...');
    let eventLoopBlocked = false;
    const loopTimer = setInterval(() => {
      log('Event loop tick (should see this during execution)');
    }, 100);

    const execPromise = thread.run('Sleep for 2 seconds, then say "Done!"');

    // Wait a bit and check
    await new Promise(resolve => setTimeout(resolve, 500));
    const duringCount = await getProcessCount('codex');
    log(`Processes during execution: ${duringCount}`);

    await execPromise;
    clearInterval(loopTimer);

    // Count processes after
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for cleanup
    const afterCount = await getProcessCount('codex');
    log(`Processes after completion: ${afterCount}`);

    const zombiesDetected = afterCount > beforeCount;

    return {
      success: true,
      beforeCount,
      duringCount,
      afterCount,
      zombiesDetected,
      eventLoopBlocked,
    };
  } catch (error) {
    log('ERROR in testProcessLifecycle:', {
      message: error.message,
      stack: error.stack,
    });
    return { success: false, error: error.message };
  }
}

// Test 4: Authentication Methods
async function testAuthentication() {
  log('=== Test 4: Authentication Methods ===');

  const results = [];

  // Test with API key only (headless)
  log('Testing with OPENAI_API_KEY only...');
  if (process.env.OPENAI_API_KEY) {
    try {
      const codex = new Codex();
      const thread = codex.startThread({
        workingDirectory: TEST_CONFIG.workingDirectory,
        skipGitRepoCheck: true,
      });
      await thread.run('Say "Auth works!"');
      results.push({ method: 'API_KEY', success: true });
      log('API key authentication: SUCCESS');
    } catch (error) {
      results.push({
        method: 'API_KEY',
        success: false,
        error: error.message,
        code: error.code,
      });
      log('API key authentication: FAILED', { error: error.message });
    }
  } else {
    log('OPENAI_API_KEY not set, skipping API key test');
    results.push({ method: 'API_KEY', skipped: true });
  }

  // Test without any authentication
  log('Testing without authentication...');
  const originalKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const codex = new Codex();
    const thread = codex.startThread({
      workingDirectory: TEST_CONFIG.workingDirectory,
      skipGitRepoCheck: true,
    });
    await thread.run('Say "No auth?"');
    results.push({ method: 'NO_AUTH', success: true });
    log('No authentication: SUCCESS (unexpected!)');
  } catch (error) {
    results.push({
      method: 'NO_AUTH',
      success: false,
      error: error.message,
      code: error.code,
    });
    log('No authentication: FAILED (expected)', { error: error.message });
  }

  // Restore API key
  if (originalKey) {
    process.env.OPENAI_API_KEY = originalKey;
  }

  return { success: true, results };
}

// Test 5: Thread Management and Persistence
async function testThreadPersistence() {
  log('=== Test 5: Thread Management and Persistence ===');

  try {
    // Create new thread
    const codex = new Codex();
    const thread1 = codex.startThread({
      workingDirectory: TEST_CONFIG.workingDirectory,
      skipGitRepoCheck: true,
    });

    const threadId = thread1.threadId;
    log('Created thread:', { threadId });

    // Send initial message
    await thread1.run('Remember this: my favorite color is blue.');

    // Check thread storage location
    const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex');
    const sessionsDir = join(codexHome, 'sessions');
    const sessionExists = existsSync(sessionsDir);

    log('Thread storage:', {
      codexHome,
      sessionsDir,
      sessionExists,
    });

    // Resume thread
    log('Resuming thread...');
    const thread2 = codex.resumeThread(threadId);
    const response = await thread2.run('What is my favorite color?');

    log('Resume response:', { response: response.finalResponse });

    const contextPreserved = response.finalResponse.toLowerCase().includes('blue');

    // Test invalid thread ID
    log('Testing invalid thread ID...');
    let invalidThreadError = null;
    try {
      const invalidThread = codex.resumeThread('invalid_thread_id_12345');
      await invalidThread.run('This should fail');
    } catch (error) {
      invalidThreadError = {
        message: error.message,
        code: error.code,
      };
      log('Invalid thread error (expected):', invalidThreadError);
    }

    return {
      success: true,
      threadId,
      codexHome,
      sessionExists,
      contextPreserved,
      invalidThreadError,
    };
  } catch (error) {
    log('ERROR in testThreadPersistence:', {
      message: error.message,
      stack: error.stack,
    });
    return { success: false, error: error.message };
  }
}

// Test 6: Sandbox Modes
async function testSandboxModes() {
  log('=== Test 6: Sandbox Modes ===');

  const results = {};
  const modes = ['read-only', 'workspace-write', 'danger-full-access'];

  for (const mode of modes) {
    log(`Testing sandbox mode: ${mode}`);

    try {
      const codex = new Codex();
      const thread = codex.startThread({
        workingDirectory: TEST_CONFIG.workingDirectory,
        skipGitRepoCheck: true,
        sandbox: mode,
      });

      // Try to create a file
      const testFileName = `test-sandbox-${mode}.txt`;
      const response = await thread.run(
        `Create a file named "${testFileName}" with content "test". ` +
        `Then tell me if you succeeded or if it was blocked.`
      );

      log(`Sandbox ${mode} response:`, { response: response.finalResponse });

      results[mode] = {
        success: true,
        response: response.finalResponse,
      };
    } catch (error) {
      log(`Sandbox ${mode} error:`, { error: error.message });
      results[mode] = {
        success: false,
        error: error.message,
        code: error.code,
      };
    }
  }

  return { success: true, results };
}

// Test 7: Configuration Options
async function testConfiguration() {
  log('=== Test 7: Configuration Options ===');

  const results = {};

  // Test skipGitRepoCheck: false in non-Git directory
  log('Testing Git repo check (should fail in non-Git dir)...');
  const tempDir = join(process.cwd(), 'temp-non-git-dir');

  try {
    const codex = new Codex();
    const thread = codex.startThread({
      workingDirectory: process.cwd(), // We know this IS a git repo
      skipGitRepoCheck: false,
    });
    await thread.run('Say "Git check passed"');
    results.gitCheckInRepo = { success: true };
    log('Git check in repo: SUCCESS');
  } catch (error) {
    results.gitCheckInRepo = {
      success: false,
      error: error.message,
      code: error.code,
    };
    log('Git check in repo: FAILED', { error: error.message });
  }

  // Test skipGitRepoCheck: true (should work anywhere)
  log('Testing skipGitRepoCheck: true...');
  try {
    const codex = new Codex();
    const thread = codex.startThread({
      workingDirectory: TEST_CONFIG.workingDirectory,
      skipGitRepoCheck: true,
    });
    await thread.run('Say "Skip check works"');
    results.skipGitCheck = { success: true };
    log('Skip Git check: SUCCESS');
  } catch (error) {
    results.skipGitCheck = {
      success: false,
      error: error.message,
      code: error.code,
    };
    log('Skip Git check: FAILED', { error: error.message });
  }

  // Test custom working directory
  log('Testing custom working directory...');
  try {
    const codex = new Codex();
    const thread = codex.startThread({
      workingDirectory: TEST_CONFIG.workingDirectory,
      skipGitRepoCheck: true,
    });
    const response = await thread.run('What is the current working directory?');
    results.workingDirectory = {
      success: true,
      response: response.finalResponse,
    };
    log('Working directory:', { response: response.finalResponse });
  } catch (error) {
    results.workingDirectory = {
      success: false,
      error: error.message,
    };
  }

  return { success: true, results };
}

// Test 8: Error Scenarios
async function testErrorScenarios() {
  log('=== Test 8: Error Scenarios ===');

  const scenarios = {};

  // Test invalid thread resumption (already tested in Test 5)
  scenarios.invalidThreadId = 'Tested in Thread Persistence test';

  // Test non-Git directory without skip
  log('Testing non-Git directory error...');
  try {
    const codex = new Codex();
    const thread = codex.startThread({
      workingDirectory: TEST_CONFIG.workingDirectory,
      skipGitRepoCheck: false,
    });
    await thread.run('Test');
    scenarios.nonGitDir = { triggered: false };
  } catch (error) {
    scenarios.nonGitDir = {
      triggered: true,
      error: error.message,
      code: error.code,
    };
    log('Non-Git dir error:', scenarios.nonGitDir);
  }

  return { success: true, scenarios };
}

// Test 9: Performance Benchmarks
async function testPerformance() {
  log('=== Test 9: Performance Benchmarks ===');

  const metrics = {
    spawn: [],
    firstByte: [],
    total: [],
  };

  const numRuns = 3;

  for (let i = 0; i < numRuns; i++) {
    log(`Performance run ${i + 1}/${numRuns}`);

    const codex = new Codex();
    const spawnStart = Date.now();

    const thread = codex.startThread({
      workingDirectory: TEST_CONFIG.workingDirectory,
      skipGitRepoCheck: true,
    });

    const spawnTime = Date.now() - spawnStart;

    const execStart = Date.now();
    const { events } = await thread.runStreamed('Say "Hello!"');

    let firstByteTime = null;
    let totalTime = null;

    for await (const event of events) {
      if (!firstByteTime && event.type === 'item.completed') {
        firstByteTime = Date.now() - execStart;
      }
    }

    totalTime = Date.now() - execStart;

    metrics.spawn.push(spawnTime);
    metrics.firstByte.push(firstByteTime);
    metrics.total.push(totalTime);

    log(`Run ${i + 1} metrics:`, {
      spawn: spawnTime,
      firstByte: firstByteTime,
      total: totalTime,
    });
  }

  // Calculate averages
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const results = {
    spawn: {
      avg: avg(metrics.spawn),
      min: Math.min(...metrics.spawn),
      max: Math.max(...metrics.spawn),
      all: metrics.spawn,
    },
    firstByte: {
      avg: avg(metrics.firstByte),
      min: Math.min(...metrics.firstByte),
      max: Math.max(...metrics.firstByte),
      all: metrics.firstByte,
    },
    total: {
      avg: avg(metrics.total),
      min: Math.min(...metrics.total),
      max: Math.max(...metrics.total),
      all: metrics.total,
    },
  };

  log('Performance summary:', results);

  return { success: true, metrics: results };
}

// Test 10: Concurrency
async function testConcurrency() {
  log('=== Test 10: Concurrency ===');

  const numConcurrent = 3;
  log(`Testing ${numConcurrent} concurrent Codex instances...`);

  const startTime = Date.now();

  const promises = [];
  for (let i = 0; i < numConcurrent; i++) {
    const promise = (async () => {
      const codex = new Codex();
      const thread = codex.startThread({
        workingDirectory: TEST_CONFIG.workingDirectory,
        skipGitRepoCheck: true,
      });

      const instanceStart = Date.now();
      const response = await thread.run(`Say "Instance ${i + 1} complete!"`);
      const duration = Date.now() - instanceStart;

      return {
        instance: i + 1,
        duration,
        response: response.finalResponse,
      };
    })();

    promises.push(promise);
  }

  const results = await Promise.all(promises);
  const totalTime = Date.now() - startTime;

  log('Concurrency results:', {
    totalTime,
    results,
  });

  return {
    success: true,
    numConcurrent,
    totalTime,
    results,
  };
}

// Main test runner
async function runAllTests() {
  log('========================================');
  log('Starting Codex SDK Research Tests');
  log('========================================');
  log('Environment:', {
    hasApiKey: !!process.env.OPENAI_API_KEY,
    workingDirectory: TEST_CONFIG.workingDirectory,
  });
  log('');

  const testResults = {};

  try {
    testResults.basicExecution = await testBasicExecution();
    log('\n');

    testResults.streamingEvents = await testStreamingEvents();
    log('\n');

    testResults.processLifecycle = await testProcessLifecycle();
    log('\n');

    testResults.authentication = await testAuthentication();
    log('\n');

    testResults.threadPersistence = await testThreadPersistence();
    log('\n');

    testResults.sandboxModes = await testSandboxModes();
    log('\n');

    testResults.configuration = await testConfiguration();
    log('\n');

    testResults.errorScenarios = await testErrorScenarios();
    log('\n');

    testResults.performance = await testPerformance();
    log('\n');

    testResults.concurrency = await testConcurrency();
    log('\n');

  } catch (error) {
    log('FATAL ERROR in test suite:', {
      message: error.message,
      stack: error.stack,
    });
    testResults.fatalError = error.message;
  }

  log('========================================');
  log('Test Suite Complete');
  log('========================================');
  log('Summary:', testResults);

  return testResults;
}

// Run tests
runAllTests()
  .then(results => {
    log('\n\nFinal Results:', results);
    process.exit(0);
  })
  .catch(error => {
    log('UNHANDLED ERROR:', error);
    process.exit(1);
  });
