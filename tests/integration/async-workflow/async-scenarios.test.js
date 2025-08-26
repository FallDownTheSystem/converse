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
      await withHTTPTestServer(async (client, manager) => {

        // Step 1: Initial async message
        const step1Result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Remember this number: 42. Just acknowledge you got it.',
            async: true,
            model: 'auto',
            temperature: 0
          }
        });

        // Parse async response
        const step1Text = step1Result.content[0].text;
        console.log('[DEBUG] Step 1 response:', step1Text.substring(0, 500));
        
        const step1Content = parseAsyncResponse(step1Text);
        const jobId1 = step1Content.continuation_id;
        console.log('[DEBUG] Job ID 1:', jobId1);

        // Wait for first job to complete
        let job1Complete = false;
        let continuationId = null;
        let attempts = 0;

        while (!job1Complete && attempts < 30) {
          await new Promise(resolve => setTimeout(resolve, 1000));

          const statusResult = await client.callTool({
            name: 'check_status',
            arguments: {
              continuation_id: jobId1,
              include_output: true,
              output_format: 'json'
            }
          });

          // Parse response, handling potential metadata display
          const statusText = statusResult.content[0].text;
          console.log(`[DEBUG] Status check ${attempts + 1}:`, statusText.substring(0, 200));
          
          const status = parseStatusResponse(statusText);
          console.log('[DEBUG] Parsed status:', status);

          if (status.status === 'completed') {
            job1Complete = true;
            continuationId = status.continuation_id; // Use the continuation_id from status directly
            console.log('[DEBUG] Job completed, continuation ID:', continuationId);
            if (status.result) {
              expect(status.result.content).toBeDefined();
            }
          }
          attempts++;
        }

        expect(job1Complete).toBe(true);
        expect(continuationId).toBeDefined();

        // Step 2: Follow-up async message using continuation
        const step2Result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What number did I ask you to remember?',
            continuation_id: continuationId,
            async: true,
            model: 'auto',
            temperature: 0
          }
        });

        // Parse response, handling potential metadata display
        const step2Text = step2Result.content[0].text;
        const step2JsonStart = step2Text.indexOf('{');
        const step2Content = step2JsonStart >= 0 ? JSON.parse(step2Text.substring(step2JsonStart)) : JSON.parse(step2Text);
        const jobId2 = step2Content.continuation_id;

        // Wait for second job to complete
        let job2Complete = false;
        let finalResult = null;
        attempts = 0;

        while (!job2Complete && attempts < 30) {
          await new Promise(resolve => setTimeout(resolve, 1000));

          const statusResult = await client.callTool({
            name: 'check_status',
            arguments: {
              continuation_id: jobId2,
              include_output: true,
              output_format: 'json'
            }
          });

          // Parse response, handling potential metadata display
          const statusText = statusResult.content[0].text;
          const status = parseStatusResponse(statusText);

          if (status.status === 'completed') {
            job2Complete = true;
            finalResult = status.result;
          }
          attempts++;
        }

        expect(job2Complete).toBe(true);
        expect(finalResult).toBeDefined();
        expect(finalResult.message).toContain('42');

        logger.info('[async-scenarios] Multi-step conversation completed');
      });
    }, 60000);
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
        const asyncJsonStart = asyncText.indexOf('{');
        const asyncContent = asyncJsonStart >= 0 ? JSON.parse(asyncText.substring(asyncJsonStart)) : JSON.parse(asyncText);
        const jobId = asyncContent.continuation_id;

        // Wait for completion
        let completed = false;
        let result = null;
        let attempts = 0;

        while (!completed && attempts < 30) {
          await new Promise(resolve => setTimeout(resolve, 1000));

          const statusResult = await client.callTool({
            name: 'check_status',
            arguments: {
              continuation_id: jobId,
              include_output: true,
              output_format: 'json'
            }
          });

          // Parse response, handling potential metadata display
          const statusText = statusResult.content[0].text;
          const status = parseStatusResponse(statusText);

          if (status.status === 'completed') {
            completed = true;
            result = status.result;
          }
          attempts++;
        }

        expect(completed).toBe(true);
        expect(result).toBeDefined();
        expect(result.message.toLowerCase()).toContain('fibonacci');
        expect(result.message.toLowerCase()).toMatch(/recursive|recursion/);

        logger.info('[async-scenarios] File processing in async mode verified');
      });
    }, 40000);
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
        const syncJsonStart = syncText.indexOf('{');
        const syncContent = syncJsonStart >= 0 ? JSON.parse(syncText.substring(syncJsonStart)) : JSON.parse(syncText);
        expect(syncContent.message).toBeDefined();
        expect(syncContent.message).toContain('10');
        const continuationId = syncContent.continuation_id;

        // 2. Async operation using same session
        const asyncResult = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Now what is 10*10?',
            continuation_id: continuationId,
            async: true,
            model: 'auto',
            temperature: 0
          }
        });

        // Parse response, handling potential metadata display
        const asyncText = asyncResult.content[0].text;
        const asyncJsonStart = asyncText.indexOf('{');
        const asyncContent = asyncJsonStart >= 0 ? JSON.parse(asyncText.substring(asyncJsonStart)) : JSON.parse(asyncText);
        const jobId = asyncContent.continuation_id;

        // Poll for async result
        let completed = false;
        let asyncFinalResult = null;
        let attempts = 0;

        while (!completed && attempts < 30) {
          await new Promise(resolve => setTimeout(resolve, 1000));

          const statusResult = await client.callTool({
            name: 'check_status',
            arguments: {
              continuation_id: jobId,
              include_output: true,
              output_format: 'json'
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
        expect(asyncFinalResult.message).toContain('100');

        // 3. Another sync operation using continuation from async
        const sync2Result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is 100/10?',
            continuation_id: asyncFinalResult.continuation_id,
            model: 'auto',
            temperature: 0
            // No async: true
          }
        });

        // Parse response, handling potential metadata display
        const sync2Text = sync2Result.content[0].text;
        const sync2JsonStart = sync2Text.indexOf('{');
        const sync2Content = sync2JsonStart >= 0 ? JSON.parse(sync2Text.substring(sync2JsonStart)) : JSON.parse(sync2Text);
        expect(sync2Content.message).toContain('10');

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
        const asyncJsonStart = asyncText.indexOf('{');
        const asyncContent = asyncJsonStart >= 0 ? JSON.parse(asyncText.substring(asyncJsonStart)) : JSON.parse(asyncText);
        const jobId = asyncContent.continuation_id;

        // Poll for status - should eventually fail
        let failed = false;
        let errorMessage = null;
        let attempts = 0;

        while (!failed && attempts < 20) {
          await new Promise(resolve => setTimeout(resolve, 500));

          const statusResult = await client.callTool({
            name: 'check_status',
            arguments: {
              continuation_id: jobId,
              include_output: true,
              output_format: 'json'
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
        const asyncJsonStart = asyncText.indexOf('{');
        const asyncContent = asyncJsonStart >= 0 ? JSON.parse(asyncText.substring(asyncJsonStart)) : JSON.parse(asyncText);
        const jobId = asyncContent.continuation_id;

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
              continuation_id: jobId,
              include_output: true,
              output_format: 'json'
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

        // Should complete within timeout
        expect(timedOut).toBe(false);
        expect(completed).toBe(true);
        expect(finalStatus.status).toBe('completed');

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

        const jobIds = jobs.map(j => {
          const jText = j.content[0].text;
          const jJsonStart = jText.indexOf('{');
          const jParsed = jJsonStart >= 0 ? JSON.parse(jText.substring(jJsonStart)) : JSON.parse(jText);
          return jParsed.continuation_id;
        });

        logger.info(`[async-scenarios] Submitted ${jobCount} jobs in ${submitTime}ms`);
        expect(submitTime).toBeLessThan(10000); // Should submit all within 10 seconds

        // Track completion times
        const completionTimes = [];
        const pollStartTime = Date.now();

        // Poll all jobs until complete
        const pollPromises = jobIds.map(async (jobId, index) => {
          let completed = false;
          let attempts = 0;
          const maxAttempts = 60;

          while (!completed && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 500));

            try {
              const statusResult = await client.callTool({
                name: 'check_status',
                arguments: {
                  continuation_id: jobId,
                  include_output: true,
                  output_format: 'json'
                }
              });

              // Parse response, handling potential metadata display
              const statusText = statusResult.content[0].text;
              const statusJsonStart = statusText.indexOf('{');
              const status = statusJsonStart >= 0 ? JSON.parse(statusText.substring(statusJsonStart)) : JSON.parse(statusText);

              if (status.status === 'completed') {
                completed = true;
                completionTimes.push(Date.now() - pollStartTime);

                // Verify correct answer
                const expectedAnswer = index * 2;
                expect(status.result.message).toContain(expectedAnswer.toString());
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
        const consensusText = consensusResult.content[0].text;
        const consensusJsonStart = consensusText.indexOf('{');
        const consensusContent = consensusJsonStart >= 0 ? JSON.parse(consensusText.substring(consensusJsonStart)) : JSON.parse(consensusText);
        const jobId = consensusContent.continuation_id;

        // Track progress events
        let lastSeq = 0;
        const progressEvents = [];
        let completed = false;
        let finalResult = null;
        let attempts = 0;

        while (!completed && attempts < 60) {
          await new Promise(resolve => setTimeout(resolve, 1000));

          const statusResult = await client.callTool({
            name: 'check_status',
            arguments: {
              continuation_id: jobId,
              since_seq: lastSeq,
              include_events: true,
              include_output: true,
              output_format: 'json'
            }
          });

          // Parse response, handling potential metadata display
          const statusText = statusResult.content[0].text;
          const status = parseStatusResponse(statusText);

          // Collect progress events
          if (status.events && status.events.length > 0) {
            progressEvents.push(...status.events);
            lastSeq = Math.max(...status.events.map(e => e.seq || 0));
          }

          if (status.status === 'completed') {
            completed = true;
            finalResult = status.result;
          } else if (status.status === 'failed') {
            throw new Error(`Consensus failed: ${status.error}`);
          }

          attempts++;
        }

        expect(completed).toBe(true);
        expect(finalResult).toBeDefined();
        expect(finalResult.responses).toBeDefined();
        expect(Array.isArray(finalResult.responses)).toBe(true);

        // Should have initial and refined responses
        const hasInitialResponses = finalResult.responses.some(r => r.response);
        const hasRefinedResponses = finalResult.responses.some(r => r.refined_response);

        expect(hasInitialResponses).toBe(true);
        if (finalResult.responses.length > 0) {
          // Cross-feedback should produce refined responses
          expect(hasRefinedResponses).toBe(true);
        }

        // Should have received progress events
        expect(progressEvents.length).toBeGreaterThan(0);

        logger.info(`[async-scenarios] Complex consensus completed with ${progressEvents.length} progress events`);
      });
    }, 90000);
  });
});
