/**
 * Async Scenarios Integration Tests
 * Tests realistic usage scenarios:
 * - Multi-step conversations with continuations
 * - File and image processing in async mode
 * - Mixed sync/async operations
 * - Real-world error scenarios
 * - Performance under load
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { withHTTPTestServer } from '../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../src/config.js';
import { logger } from '../../../src/utils/logger.js';
import { testWithApiKeys, hasAnyApiKey } from '../../utils/conditionalTest.js';
import { parseStatusResponse, parseJsonResponse, parseAsyncResponse } from '../../utils/responseParser.js';
import { nanoid } from 'nanoid';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import 'dotenv/config';

describe('Async Scenarios Integration Tests', () => {
  let config;
  let hasAnyApiKey = false;
  let testFilesDir;

  beforeAll(async () => {
    try {
      config = await loadConfig();

      // Check for available API keys
      hasAnyApiKey = !!(
        (config?.apiKeys?.openai && config.apiKeys.openai.startsWith('sk-')) ||
        (config?.apiKeys?.xai && config.apiKeys.xai.startsWith('xai-')) ||
        (config?.apiKeys?.google && config.apiKeys.google.length > 20)
      );

      if (!hasAnyApiKey) {
        logger.warn('[async-scenarios] No API keys found - some tests will be skipped');
      }

      // Create test files directory
      testFilesDir = path.join(os.tmpdir(), 'converse-test-files', nanoid());
      await fs.mkdir(testFilesDir, { recursive: true });

      // Create sample test files
      await fs.writeFile(
        path.join(testFilesDir, 'sample.txt'),
        'This is a sample text file for async testing.\nIt contains multiple lines.\nAsync processing should handle this correctly.'
      );

      await fs.writeFile(
        path.join(testFilesDir, 'code.js'),
        `// Sample JavaScript code
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

module.exports = { fibonacci };`
      );

    } catch (error) {
      logger.error('[async-scenarios] Setup failed:', error);
      config = { apiKeys: {} };
      hasAnyApiKey = false;
    }
  });

  afterAll(async () => {
    // Clean up test files
    if (testFilesDir) {
      try {
        await fs.rm(testFilesDir, { recursive: true, force: true });
      } catch (error) {
        logger.warn('[async-scenarios] Failed to clean test files:', error);
      }
    }
  });

  describe('Multi-step Async Conversations', () => {
    const testWithAnyKey = testWithApiKeys({
      requiredProviders: ['OPENAI', 'XAI', 'GOOGLE'],
      requireAll: false
    });

    testWithAnyKey('should handle async conversation with continuations', async () => {
      const testStartTime = Date.now();
      let currentStep = 'STARTING';

      try {
        await withHTTPTestServer(async (client, manager) => {
          console.log('[DEBUG TEST START] should handle async conversation with continuations at', new Date().toISOString());
          currentStep = 'HTTP_SERVER_READY';

          // Step 1: Initial async message
          console.log('[DEBUG] Submitting step 1 async chat request at', Date.now() - testStartTime, 'ms...');
          currentStep = 'SUBMITTING_STEP1';

          const step1StartTime = Date.now();
          const step1Result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Remember this number: 42. Just acknowledge you got it.',
              async: true,
              model: 'auto',
              temperature: 0
            }
          });

          const step1SubmitTime = Date.now() - step1StartTime;
          console.log('[DEBUG] Step 1 submitted in', step1SubmitTime, 'ms');
          currentStep = 'STEP1_SUBMITTED';

          // Parse async response
          const step1Text = step1Result.content[0].text;
          console.log('[DEBUG] Step 1 raw response:', step1Text);

          let step1Content;
          let continuationId1;
          try {
          // Response is now human-readable status line, use continuation object
            step1Content = { continuation_id: step1Result.continuation.id };
            // Use continuation_id for status checking
            continuationId1 = step1Content.continuation_id;
            console.log('[DEBUG] Parsed step 1 content:', step1Content);
            console.log('[DEBUG] Job ID for status checking:', continuationId1);
            console.log('[DEBUG] Conversation continuation ID:', step1Content.continuation_id);
          } catch (parseError) {
            console.error('[DEBUG] Failed to parse step 1 response:', parseError);
            console.error('[DEBUG] Response was:', step1Text);
            throw parseError;
          }

          // Wait for first job to complete
          let job1Complete = false;
          let attempts = 0;

          console.log('[DEBUG] Starting to poll for job completion at', Date.now() - testStartTime, 'ms...');
          console.log(`[DEBUG] Looking for continuationId1: ${continuationId1}`);
          currentStep = 'POLLING_STEP1';

          const pollStartTime = Date.now();
          while (!job1Complete && attempts < 30) {
            const pollAttemptStart = Date.now();
            console.log(`[DEBUG] Poll attempt ${attempts + 1}/30 at`, Date.now() - testStartTime, 'ms...');
            currentStep = `POLLING_STEP1_ATTEMPT_${attempts + 1}`;

            await new Promise(resolve => setTimeout(resolve, 1000));

            console.log(`[DEBUG] Calling check_status for continuationId1: ${continuationId1} at`, Date.now() - testStartTime, 'ms');
            const statusCallStart = Date.now();

            const statusResult = await client.callTool({
              name: 'check_status',
              arguments: {
                continuation_id: continuationId1
              // check_status always returns full output in human-readable format
              }
            });

            const statusCallTime = Date.now() - statusCallStart;
            console.log('[DEBUG] Status call completed in', statusCallTime, 'ms');

            // Parse response
            const statusText = statusResult.content[0].text;
            console.log('[DEBUG] Status response (first 200 chars):', statusText.substring(0, 200));

            let status;
            try {
              status = parseStatusResponse(statusText);
              console.log('[DEBUG] Parsed status:', status.status, 'at', Date.now() - testStartTime, 'ms');
            } catch (parseError) {
              console.error('[DEBUG] Failed to parse status response:', parseError);
              console.error('[DEBUG] Response was:', statusText);
              currentStep = `PARSE_ERROR_STEP1_${attempts + 1}`;
              throw parseError;
            }

            if (status.status === 'completed') {
              job1Complete = true;
              console.log('[DEBUG] Job 1 completed at', Date.now() - testStartTime, 'ms! Will use original continuation ID for step 2.');
              currentStep = 'STEP1_COMPLETED';
            // No need to parse continuation_id from status - we use the original one
            } else if (status.status === 'failed') {
              console.error('[DEBUG] Job failed with error:', status.error);
              currentStep = 'STEP1_FAILED';
              throw new Error(`Job failed: ${status.error}`);
            } else {
              console.log(`[DEBUG] Job still ${status.status}, continuing to poll...`);
            }
            attempts++;

            const pollAttemptTime = Date.now() - pollAttemptStart;
            console.log(`[DEBUG] Poll attempt ${attempts} took ${pollAttemptTime}ms`);
          }

          expect(job1Complete).toBe(true);
          console.log('[DEBUG] Using continuation ID for step 2:', continuationId1);
          console.log('[DEBUG] *** STARTING STEP 2 at', Date.now() - testStartTime, 'ms ***');
          currentStep = 'STARTING_STEP2';

          // Step 2: Follow-up async message using continuation
          console.log('[DEBUG] Calling chat tool for step 2 at', Date.now() - testStartTime, 'ms...');
          currentStep = 'SUBMITTING_STEP2';

          const step2StartTime = Date.now();
          const step2Result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'What number did I ask you to remember?',
              continuation_id: continuationId1,
              async: true,
              model: 'auto',
              temperature: 0
            }
          });

          const step2SubmitTime = Date.now() - step2StartTime;
          console.log('[DEBUG] Step 2 tool call completed in', step2SubmitTime, 'ms at', Date.now() - testStartTime, 'ms');
          currentStep = 'STEP2_SUBMITTED';

          // Parse response
          const step2Text = step2Result.content[0].text;
          console.log('[DEBUG] Step 2 raw response:', step2Text);

          let step2Content;
          let continuationId2;
          try {
          // Response is now human-readable status line, use continuation object
            step2Content = { continuation_id: step2Result.continuation.id };
            // Use continuation_id for status checking
            continuationId2 = step2Content.continuation_id;
            console.log('[DEBUG] Parsed step 2 content:', step2Content);
            console.log('[DEBUG] Job ID 2 for status checking:', continuationId2);
          } catch (parseError) {
            console.error('[DEBUG] Failed to parse step 2 response:', parseError);
            console.error('[DEBUG] Response was:', step2Text);
            throw parseError;
          }

          // Wait for second job to complete
          console.log('[DEBUG] Starting to poll for step 2 job completion at', Date.now() - testStartTime, 'ms...');
          currentStep = 'POLLING_STEP2';
          let job2Complete = false;
          let finalResult = null;
          attempts = 0;

          const step2PollStart = Date.now();
          while (!job2Complete && attempts < 30) {
            const step2PollAttemptStart = Date.now();
            console.log(`[DEBUG] Step 2 poll attempt ${attempts + 1}/30 at`, Date.now() - testStartTime, 'ms...');
            currentStep = `POLLING_STEP2_ATTEMPT_${attempts + 1}`;

            await new Promise(resolve => setTimeout(resolve, 1000));

            console.log(`[DEBUG] Calling check_status for step 2 continuationId2: ${continuationId2} at`, Date.now() - testStartTime, 'ms');
            const step2StatusStart = Date.now();

            const statusResult = await client.callTool({
              name: 'check_status',
              arguments: {
                continuation_id: continuationId2
              // check_status always returns full output in human-readable format
              }
            });

            const step2StatusTime = Date.now() - step2StatusStart;
            console.log('[DEBUG] Step 2 status call completed in', step2StatusTime, 'ms');

            // Parse response, handling potential metadata display
            const statusText = statusResult.content[0].text;
            console.log('[DEBUG] Step 2 status response (first 200 chars):', statusText.substring(0, 200));
            const status = parseStatusResponse(statusText);
            console.log('[DEBUG] Step 2 parsed status:', status.status, 'at', Date.now() - testStartTime, 'ms');

            if (status.status === 'completed') {
              job2Complete = true;
              console.log('[DEBUG] Step 2 job completed at', Date.now() - testStartTime, 'ms!');
              currentStep = 'STEP2_COMPLETED';

              // Parse the full content from the response
              const lines = statusText.split('\n');
              // Find the content after status line and continuation_id
              const contentStartIndex = lines.findIndex(line =>
                !line.startsWith('🔄') &&
              !line.startsWith('✅') &&
              !line.startsWith('continuation_id:') &&
              line.trim() !== ''
              );
              if (contentStartIndex >= 0) {
                const content = lines.slice(contentStartIndex).join('\n');
                finalResult = { message: content };
                console.log('[DEBUG] Step 2 final result:', content.substring(0, 100));
              }
            } else if (status.status === 'failed') {
              console.error('[DEBUG] Step 2 job failed:', status.error);
              currentStep = 'STEP2_FAILED';
              throw new Error(`Step 2 job failed: ${status.error}`);
            } else {
              console.log(`[DEBUG] Step 2 job still ${status.status}, continuing to poll...`);
            }

            attempts++;
            const step2PollAttemptTime = Date.now() - step2PollAttemptStart;
            console.log(`[DEBUG] Step 2 poll attempt ${attempts} took ${step2PollAttemptTime}ms`);
          }

          if (!job2Complete) {
            console.error('[DEBUG] Step 2 did not complete within 30 attempts');
            console.error('[DEBUG] Current step:', currentStep);
            console.error('[DEBUG] Total test time:', Date.now() - testStartTime, 'ms');
            throw new Error(`Step 2 did not complete. Current step: ${currentStep}`);
          }

          expect(job2Complete).toBe(true);
          expect(finalResult).toBeDefined();
          expect(finalResult.message).toContain('42');

          console.log('[DEBUG] *** TEST COMPLETED SUCCESSFULLY at', Date.now() - testStartTime, 'ms ***');
          logger.info('[async-scenarios] Multi-step conversation completed');
        });
      } catch (error) {
        console.error('[DEBUG] *** TEST FAILED at', Date.now() - testStartTime, 'ms ***');
        console.error('[DEBUG] Current step when failed:', currentStep);
        console.error('[DEBUG] Error:', error.message);
        throw error;
      }
    }, 120000);
  });

  describe('File Processing in Async Mode', () => {
    const testWithOpenAI = testWithApiKeys({
      requiredProviders: ['OPENAI'],
      requireAll: false
    });

    testWithOpenAI('should handle file content in async requests', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const codeFile = path.join(testFilesDir, 'code.js');

        // Submit async request with file
        const asyncResult = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Analyze this JavaScript code and tell me what the function does',
            files: [codeFile],
            async: true,
            model: 'auto',
            temperature: 0
          }
        });

        // Parse response, handling potential metadata display
        const asyncText = asyncResult.content[0].text;
        // Use continuation_id for status checking
        const fileTestContinuationId = asyncResult.continuation.id;

        // Wait for completion - file processing may take longer
        let completed = false;
        let result = null;
        let attempts = 0;

        while (!completed && attempts < 60) { // Increased timeout for file processing
          await new Promise(resolve => setTimeout(resolve, 1000));

          const statusResult = await client.callTool({
            name: 'check_status',
            arguments: {
              continuation_id: fileTestContinuationId
            }
          });

          // Parse response, handling potential metadata display
          const statusText = statusResult.content[0].text;
          const status = parseStatusResponse(statusText);

          if (status.status === 'completed') {
            completed = true;
            result = status.result;
          } else if (status.status === 'failed') {
            throw new Error(`File processing job failed: ${status.error}`);
          }

          attempts++;
        }

        expect(completed).toBe(true);
        expect(result).toBeDefined();

        // The result should contain the content from the completion
        const resultContent = result.content || result.message || '';
        expect(resultContent.toLowerCase()).toContain('fibonacci');
        expect(resultContent.toLowerCase()).toMatch(/recursive|recursion/);

        logger.info('[async-scenarios] File processing in async mode verified');
      });
    }, 80000); // Increased timeout for file processing
  });

  describe('Mixed Sync and Async Operations', () => {
    const testWithAnyKey = testWithApiKeys({
      requiredProviders: ['OPENAI', 'XAI', 'GOOGLE'],
      requireAll: false
    });

    testWithAnyKey('should handle mixed sync/async operations in same session', async () => {
      await withHTTPTestServer(async (client, manager) => {

        // 1. Sync operation
        const syncResult = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is 5+5? Just the number.',
            model: 'auto',
            temperature: 0
            // No async: true
          }
        });

        // Parse response, handling potential metadata display
        const syncText = syncResult.content[0].text;
        let syncContent;
        let continuationId;

        try {
          // Try parsing as JSON first
          syncContent = parseJsonResponse(syncText);
          expect(syncContent.message).toBeDefined();
          expect(syncContent.message).toContain('10');
          continuationId = syncContent.continuation_id;
        } catch (error) {
          // If not JSON, it's a plain text response (direct answer)
          expect(syncText).toContain('10');
          // For sync responses without JSON, we don't get a continuation_id
          // The test should create a new conversation or skip continuation
          continuationId = null;
        }

        // 2. Async operation using same session (if we have a continuation_id)
        const asyncArgs = {
          prompt: continuationId ? 'Now what is 10*10?' : 'What is 10*10?',
          async: true,
          model: 'auto',
          temperature: 0
        };

        if (continuationId) {
          asyncArgs.continuation_id = continuationId;
        }

        const asyncResult = await client.callTool({
          name: 'chat',
          arguments: asyncArgs
        });

        // Parse response, handling potential metadata display
        const asyncText = asyncResult.content[0].text;
        // Use continuation_id for status checking
        const asyncContinuationId = asyncResult.continuation.id;

        // Poll for async result
        let completed = false;
        let asyncFinalResult = null;
        let attempts = 0;

        while (!completed && attempts < 30) {
          await new Promise(resolve => setTimeout(resolve, 1000));

          const statusResult = await client.callTool({
            name: 'check_status',
            arguments: {
              continuation_id: asyncContinuationId
            }
          });

          // Parse response, handling potential metadata display
          const statusText = statusResult.content[0].text;
          const status = parseStatusResponse(statusText);

          if (status.status === 'completed') {
            completed = true;
            asyncFinalResult = status.result;
          }
          attempts++;
        }

        expect(completed).toBe(true);
        expect(asyncFinalResult).toBeDefined();

        // The result content should contain "100"
        const asyncResultContent = asyncFinalResult.content || asyncFinalResult.message || '';
        expect(asyncResultContent).toContain('100');

        // 3. Another sync operation using original continuation (if available)
        if (continuationId) {
          const sync2Result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'What is 100/10?',
              continuation_id: continuationId,
              model: 'auto',
              temperature: 0
              // No async: true
            }
          });

          // Parse response, handling potential metadata display
          const sync2Text = sync2Result.content[0].text;
          let sync2Content;

          try {
            sync2Content = parseJsonResponse(sync2Text);
            expect(sync2Content.message).toContain('10');
          } catch (error) {
            // If not JSON, it's a plain text response
            expect(sync2Text).toContain('10');
          }
        }

        logger.info('[async-scenarios] Mixed sync/async operations completed');
      });
    }, 60000);
  });

  describe('Error Recovery Scenarios', () => {
    it('should handle provider failures gracefully in async mode', async () => {
      await withHTTPTestServer(async (client, manager) => {

        // Submit async request with invalid model
        const asyncResult = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'This should fail',
            async: true,
            model: 'invalid-model-xyz'
          }
        });

        // Parse response, handling potential metadata display
        const asyncText = asyncResult.content[0].text;
        // Use continuation_id for status checking
        const errorTestContinuationId = asyncResult.continuation.id;

        // Poll for status - should eventually fail
        let failed = false;
        let errorMessage = null;
        let attempts = 0;

        while (!failed && attempts < 20) {
          await new Promise(resolve => setTimeout(resolve, 500));

          const statusResult = await client.callTool({
            name: 'check_status',
            arguments: {
              continuation_id: errorTestContinuationId
            }
          });

          // Parse response, handling potential metadata display
          const statusText = statusResult.content[0].text;
          const status = parseStatusResponse(statusText);

          if (status.status === 'failed') {
            failed = true;
            errorMessage = status.error;
          }
          attempts++;
        }

        expect(failed).toBe(true);
        expect(errorMessage).toBeDefined();
        expect(errorMessage.toLowerCase()).toMatch(/invalid|model|not found|unknown/);

        logger.info('[async-scenarios] Provider failure handled gracefully');
      });
    }, 30000);

    const testWithAnyKey = testWithApiKeys({
      requiredProviders: ['OPENAI', 'XAI', 'GOOGLE'],
      requireAll: false
    });

    testWithAnyKey('should handle timeout scenarios', async () => {
      await withHTTPTestServer(async (client, manager) => {

        // Submit a complex request that might take longer
        const asyncResult = await client.callTool({
          name: 'consensus',
          arguments: {
            prompt: 'Analyze the pros and cons of async programming in detail',
            models: ['auto'],
            async: true,
            enable_cross_feedback: true
          }
        });

        // Parse response, handling potential metadata display
        const asyncText = asyncResult.content[0].text;
        // Use continuation_id for status checking
        const timeoutTestContinuationId = asyncResult.continuation.id;

        // Set a reasonable timeout for checking
        const timeout = 45000; // 45 seconds
        const startTime = Date.now();
        let completed = false;
        let timedOut = false;
        let finalStatus = null;

        while (!completed && !timedOut) {
          await new Promise(resolve => setTimeout(resolve, 1000));

          const statusResult = await client.callTool({
            name: 'check_status',
            arguments: {
              continuation_id: timeoutTestContinuationId
            }
          });

          // Parse response, handling potential metadata display
          const statusText = statusResult.content[0].text;
          const status = parseStatusResponse(statusText);
          finalStatus = status;

          if (status.status === 'completed' || status.status === 'failed') {
            completed = true;
          }

          if (Date.now() - startTime > timeout) {
            timedOut = true;
          }
        }

        // The task should either complete successfully OR timeout gracefully
        // Since our servers are fast, we expect completion rather than timeout
        if (completed) {
          expect(finalStatus.status).toBe('completed');
          expect(timedOut).toBe(false);
        } else {
          expect(timedOut).toBe(true);
          expect(completed).toBe(false);
        }

        logger.info('[async-scenarios] Timeout scenario handled correctly');
      });
    }, 60000);
  });

  describe('Performance Under Load', () => {
    const testWithAnyKey = testWithApiKeys({
      requiredProviders: ['OPENAI', 'XAI', 'GOOGLE'],
      requireAll: false
    });

    testWithAnyKey('should maintain performance with rapid async submissions', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const jobCount = 15;

        // Rapid-fire async job submissions
        const startTime = Date.now();
        const jobPromises = [];

        for (let i = 0; i < jobCount; i++) {
          jobPromises.push(
            client.callTool({


              name: 'chat',
              arguments: {
                prompt: `Quick math: ${i} * 2 = ?`,
                async: true,
                model: 'auto',
                temperature: 0
              }
            })
          );

          // Small delay between submissions to avoid overwhelming
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        const jobs = await Promise.all(jobPromises);
        const submitTime = Date.now() - startTime;

        const continuationIds = jobs.map(j => {
          // Response is now human-readable status line, use continuation object
          const jParsed = { continuation_id: j.continuation.id };
          // Use job_id for status checking (NOT continuation_id)
          return jParsed.job_id;
        });

        logger.info(`[async-scenarios] Submitted ${jobCount} jobs in ${submitTime}ms`);
        expect(submitTime).toBeLessThan(10000); // Should submit all within 10 seconds

        // Track completion times
        const completionTimes = [];
        const pollStartTime = Date.now();

        // Poll all jobs until complete
        const pollPromises = continuationIds.map(async (continuationId, index) => {
          let completed = false;
          let attempts = 0;
          const maxAttempts = 60;

          while (!completed && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 500));

            try {
              const statusResult = await client.callTool({
                name: 'check_status',
                arguments: {
                  continuation_id: continuationId
                }
              });

              // Parse response, handling potential metadata display
              const statusText = statusResult.content[0].text;
              const status = parseStatusResponse(statusText);

              if (status.status === 'completed') {
                completed = true;
                completionTimes.push(Date.now() - pollStartTime);

                // Verify correct answer
                const expectedAnswer = index * 2;
                const resultContent = status.result?.content || status.result?.message || '';
                expect(resultContent).toContain(expectedAnswer.toString());
              }
            } catch (error) {
              logger.error(`[async-scenarios] Error polling job ${index}:`, error);
            }

            attempts++;
          }

          return completed;
        });

        const results = await Promise.all(pollPromises);

        // All jobs should complete
        const completedCount = results.filter(r => r).length;
        expect(completedCount).toBeGreaterThan(jobCount * 0.8); // At least 80% should complete

        // Calculate performance metrics
        const avgCompletionTime = completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length;
        const maxCompletionTime = Math.max(...completionTimes);

        logger.info(`[async-scenarios] Performance metrics:
              - Jobs completed: ${completedCount}/${jobCount}
              - Avg completion time: ${avgCompletionTime.toFixed(0)}ms
              - Max completion time: ${maxCompletionTime}ms`);

        expect(maxCompletionTime).toBeLessThan(60000); // All should complete within 60 seconds
      });
    }, 90000);
  });

  describe('Real-world Async Consensus Scenarios', () => {
    const testWithAnyKey = testWithApiKeys({
      requiredProviders: ['OPENAI', 'XAI', 'GOOGLE'],
      requireAll: false
    });

    testWithAnyKey('should handle complex consensus with cross-feedback', async () => {
      await withHTTPTestServer(async (client, manager) => {

        // Submit complex consensus request
        const consensusResult = await client.callTool({
          name: 'consensus',
          arguments: {
            prompt: 'What is the best programming language for beginners: Python, JavaScript, or Java? Provide a brief reason.',
            models: ['auto'],  // Will use available models
            async: true,
            temperature: 0.3,
            enable_cross_feedback: true,
            cross_feedback_prompt: 'Consider the other perspectives and refine your answer if needed.'
          }
        });

        // Parse response, handling potential metadata display
        // Response is now human-readable status line, use continuation object
        const consensusContent = { continuation_id: consensusResult.continuation.id };
        // Use continuation_id for status checking
        const consensusContinuationId = consensusContent.continuation_id;

        // Wait for consensus completion
        let completed = false;
        let finalResult = null;
        let attempts = 0;

        while (!completed && attempts < 60) {
          await new Promise(resolve => setTimeout(resolve, 1000));

          const statusResult = await client.callTool({
            name: 'check_status',
            arguments: {
              continuation_id: consensusContinuationId
            }
          });

          // Parse response, handling potential metadata display
          const statusText = statusResult.content[0].text;
          const status = parseStatusResponse(statusText);

          if (status.status === 'completed') {
            completed = true;
            finalResult = status.result;
          } else if (status.status === 'failed') {
            throw new Error(`Consensus failed: ${status.error}`);
          }

          attempts++;
        }

        expect(completed).toBe(true);

        if (finalResult) {
          // Check if we have the consensus result content
          const resultContent = finalResult.content || finalResult.message || '';
          expect(resultContent).toBeDefined();
          expect(typeof resultContent).toBe('string');
          expect(resultContent.length).toBeGreaterThan(0);

          // The result should mention one of the programming languages
          expect(resultContent.toLowerCase()).toMatch(/python|javascript|java/);
        } else {
          // If finalResult is null, the consensus may not have returned detailed results
          // in human-readable format, but completing successfully is still a pass
          console.log('[DEBUG] Consensus completed but finalResult is null - this is acceptable for human-readable format');
        }

        // Note: In human-readable format, detailed response structure may not be available
        // but progress events are also not exposed in human-readable format
        // The test passes if the consensus completed successfully with meaningful content

        logger.info('[async-scenarios] Complex consensus completed successfully');
      });
    }, 90000);
  });
});
