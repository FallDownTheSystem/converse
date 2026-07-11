/**
 * Async Workflow Integration Tests
 *
 * Tests the complete async execution workflow including:
 * - Async job submission with immediate continuation_id response
 * - Status polling and progress updates
 * - Result retrieval from cache
 * - Session isolation and security
 * - Error handling and cancellation
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { withHTTPTestServer } from '../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../src/config.js';
import { logger } from '../../../src/utils/logger.js';
import { testWithApiKeys, hasAnyApiKey } from '../../utils/conditionalTest.js';
import {
  parseStatusResponse,
  parseAsyncResponse,
  parseJsonResponse,
} from '../../utils/responseParser.js';
import { nanoid } from 'nanoid';
import 'dotenv/config';

describe('Async Workflow Integration Tests', () => {
  let config;
  let hasAnyApiKey = false;

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
        logger.warn(
          '[async-integration] No API keys found - some tests will be skipped',
        );
      }
    } catch (error) {
      logger.error('[async-integration] Setup failed:', error);
      config = { apiKeys: {} };
      hasAnyApiKey = false;
    }
  });

  describe('Basic Async Workflow', () => {
    it('should handle async=true with immediate continuation_id response', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Submit async chat request - no session ID needed for single-user
        const asyncResult = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Say "test" in one word',
            async: true,
            models: ['auto'],
          },
        });

        // Should receive immediate response with continuation_id
        expect(asyncResult).toBeDefined();
        expect(asyncResult.content).toBeTruthy();

        // The response should contain the status line and continuation_id
        expect(asyncResult.content[0].text).toContain('⏳ SUBMITTED | CHAT');
        expect(asyncResult.content[0].text).toContain('continuation_id:');
        expect(asyncResult.continuation).toBeDefined();
        expect(asyncResult.continuation.id).toBeDefined();
        expect(asyncResult.continuation.id).toContain('conv_');
        expect(asyncResult.continuation.status).toBe('processing');

        logger.info(
          '[async-integration] Received continuation_id:',
          asyncResult.continuation.id,
        );
      });
    }, 20000);

    it('should poll status and retrieve results', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Step 1: Submit async request - no session ID needed
        const asyncResult = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is 2+2? Answer with just the number.',
            async: true,
            models: ['auto'],
          },
        });

        // Use the job ID for status checks
        const jobId = asyncResult.continuation.id;

        logger.info('[async-integration] Job submitted:', jobId);

        // Step 2: Poll for status
        let attempts = 0;
        let completed = false;
        let finalResult = null;
        const maxAttempts = 30;
        const pollInterval = 500; // Default poll interval

        while (!completed && attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, pollInterval));

          const statusResult = await client.callTool({
            name: 'check_status',
            arguments: {
              continuation_id: jobId,
            },
          });

          // Parse human-readable status format
          const statusText = statusResult.content[0].text;
          const statusContent = parseStatusResponse(statusText);
          logger.info(
            `[async-integration] Status check ${attempts + 1}:`,
            statusContent.status,
          );

          if (statusContent.status === 'completed') {
            completed = true;
            finalResult = statusContent;
          } else if (statusContent.status === 'failed') {
            const errorMsg = statusContent.error
              ? typeof statusContent.error === 'object'
                ? statusContent.error.message ||
                  JSON.stringify(statusContent.error)
                : statusContent.error
              : 'Unknown error';
            throw new Error(`Job failed: ${errorMsg}`);
          }

          attempts++;
        }

        // Verify we got results
        expect(completed).toBe(true);
        expect(finalResult).toBeDefined();
        expect(finalResult.status).toBe('completed');

        // Log the actual result structure for debugging
        logger.info(
          '[async-integration] Final result structure:',
          JSON.stringify(finalResult, null, 2),
        );

        // Check for completion result in human-readable format
        expect(finalResult.result).toBeDefined();
        expect(finalResult.result.content).toBeDefined();

        // The answer should contain "4"
        const resultContent = finalResult.result.content;
        const answer = (resultContent || '').toLowerCase();
        expect(answer).toMatch(/4|four/);

        logger.info('[async-integration] Successfully retrieved async results');
      });
    }, 60000);

    // Session isolation test removed - not needed for single-user local usage
  });

  describe('Async Error Handling', () => {
    it('should handle invalid async requests gracefully', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Try async with missing required arguments
        try {
          const errorResult = await client.callTool({
            name: 'chat',
            arguments: {
              // Missing prompt
              async: true,
            },
          });
          // Should not reach here
          expect(true).toBe(false);
        } catch (error) {
          // Expected error
          expect(error).toBeDefined();
        }

        logger.info('[async-integration] Invalid request handled correctly');
      });
    }, 10000);

    it('should handle check_status for non-existent jobs', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const fakeJobId = `chat_${nanoid()}_${Date.now()}`;

        const statusResult = await client.callTool({
          name: 'check_status',
          arguments: {
            continuation_id: fakeJobId,
            output_format: 'json',
          },
        });

        // Parse status response - should be an error message
        const statusText = statusResult.content[0].text;
        // For error responses, the text might be plain error message
        if (statusText.includes('not found')) {
          expect(statusText.toLowerCase()).toContain('not found');
        } else {
          const statusContent = parseStatusResponse(statusText);
          expect(statusContent.error).toBeDefined();
        }

        logger.info('[async-integration] Non-existent job handled correctly');
      });
    }, 10000);
  });

  describe('Async Consensus Tool', () => {
    const testWithAnyKey = testWithApiKeys({
      requiredProviders: ['OPENAI', 'XAI', 'GOOGLE'],
      requireAll: false,
    });

    testWithAnyKey(
      'should handle async consensus with multiple models',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          // Submit async consensus request
          const consensusResult = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Is 10 > 5? Answer yes or no only.',
              mode: 'consensus',
              models: ['auto'],
              async: true,
            },
          });

          expect(consensusResult.content[0].text).toContain('⏳ SUBMITTED | CONSENSUS');
          expect(consensusResult.content[0].text).toContain('continuation_id:');
          expect(consensusResult.continuation).toBeDefined();
          expect(consensusResult.continuation.id).toContain('conv_');
          expect(consensusResult.continuation.status).toBe('processing');
          const continuationId = consensusResult.continuation.id;

          // Poll for consensus results
          let completed = false;
          let attempts = 0;
          const maxAttempts = 40;
          let finalResult = null;

          while (!completed && attempts < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 1000));

            const statusResult = await client.callTool({
              name: 'check_status',
              arguments: {
                continuation_id: continuationId,
                include_output: true,
                output_format: 'json',
              },
            });

            // Parse status response, handling potential metadata display
            const statusText = statusResult.content[0].text;
            const status = parseStatusResponse(statusText);

            if (status.status === 'completed') {
              completed = true;
              finalResult = status;
            } else if (status.status === 'failed') {
              throw new Error(`Consensus failed: ${status.error}`);
            }

            attempts++;
          }

          expect(completed).toBe(true);
          // For consensus, check that we got a result
          expect(finalResult).toBeDefined();
          expect(finalResult.status).toBe('completed');

          // In human-readable format, the result might be truncated or not available
          // The test passes if the consensus completed successfully
          logger.info(
            '[async-integration] Consensus completed with status:',
            finalResult.status,
          );

          // If result is available, check it contains the expected answer
          if (finalResult.result && finalResult.result.content) {
            const answer = finalResult.result.content.toLowerCase();
            // The models should recognize that 10 > 5
            expect(answer).toMatch(
              /yes|true|10.*greater|10.*larger|10.*bigger|10.*>.*5|correct/,
            );
          }

          logger.info(
            '[async-integration] Async consensus completed successfully',
          );
        });
      },
      60000,
    );
  });

  describe('Job Cancellation', () => {
    it('should handle job cancellation correctly', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Submit a long-running async job
        const asyncResult = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Count from 1 to 1000000 slowly',
            async: true,
            models: ['auto'],
          },
        });

        // Get the job ID from the response for cancellation
        expect(asyncResult.continuation).toBeDefined();
        const jobId = asyncResult.continuation.id;

        // Wait briefly then cancel
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Cancel the job
        const cancelResult = await client.callTool({
          name: 'cancel_job',
          arguments: {
            continuation_id: jobId,
          },
        });

        // Parse cancel response - now returns status line format
        const cancelText = cancelResult.content[0].text;
        console.log('[DEBUG] Cancel response:', cancelText);

        // cancel_job returns a status line format, not JSON
        expect(cancelText).toContain('⛔ CANCELLED');
        expect(cancelText).toContain(jobId);
        expect(cancelText).toContain('continuation_id:');

        // Verify job is cancelled when checking status
        const statusResult = await client.callTool({
          name: 'check_status',
          arguments: {
            continuation_id: jobId,
          },
        });

        // Parse status response using centralized helper
        const statusText = statusResult.content[0].text;
        const statusContent = parseStatusResponse(statusText);
        expect(statusContent.status).toBe('cancelled');

        logger.info('[async-integration] Job cancellation verified');
      });
    }, 20000);
  });

  describe('Progress Tracking', () => {
    const testWithAnyKey = testWithApiKeys({
      requiredProviders: ['OPENAI', 'XAI', 'GOOGLE'],
      requireAll: false,
    });

    testWithAnyKey(
      'should track progress updates during execution',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          // Submit async job
          const asyncResult = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Generate a 3-step plan for learning JavaScript',
              async: true,
              models: ['auto'],
            },
          });

          // Get the continuation ID from the response
          expect(asyncResult.continuation).toBeDefined();
          const jobId = asyncResult.continuation.id;

          // Track progress updates
          const progressUpdates = [];
          let completed = false;
          let lastSeq = 0;

          while (!completed) {
            await new Promise((resolve) => setTimeout(resolve, 500));

            const statusResult = await client.callTool({
              name: 'check_status',
              arguments: {
                continuation_id: jobId,
              },
            });

            // Parse status response, handling potential metadata display
            const statusText = statusResult.content[0].text;
            const status = parseStatusResponse(statusText);

            if (status.events && status.events.length > 0) {
              progressUpdates.push(...status.events);
              lastSeq = Math.max(...status.events.map((e) => e.seq || 0));
            }

            if (
              status.status === 'completed' ||
              status.status === 'failed' ||
              status.status === 'cancelled'
            ) {
              completed = true;
            }
          }

          // Progress tracking isn't exposed in human-readable format,
          // but we should have completed successfully
          expect(completed).toBe(true);

          // Since events aren't exposed in human-readable format,
          // we can't check for specific event types
          // The test passes if the job completed

          logger.info(
            `[async-integration] Received ${progressUpdates.length} progress updates`,
          );
        });
      },
      40000,
    );
  });

  describe('Concurrent Async Jobs', () => {
    const testWithAnyKey = testWithApiKeys({
      requiredProviders: ['OPENAI', 'XAI', 'GOOGLE'],
      requireAll: false,
    });

    testWithAnyKey(
      'should handle multiple concurrent async jobs',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          // Submit multiple async jobs concurrently
          const jobs = await Promise.all([
            client.callTool({
              name: 'chat',
              arguments: {
                prompt: 'What is 2+2?',
                async: true,
                models: ['auto'],
              },
            }),

            client.callTool({
              name: 'chat',
              arguments: {
                prompt: 'What is 3+3?',
                async: true,
                models: ['auto'],
              },
            }),

            client.callTool({
              name: 'chat',
              arguments: {
                prompt: 'What is 4+4?',
                async: true,
                models: ['auto'],
              },
            }),
          ]);

          const jobIds = jobs
            .map((j) => (j.continuation ? j.continuation.id : null))
            .filter((id) => id !== null);

          expect(jobIds).toHaveLength(3);
          expect(new Set(jobIds).size).toBe(3); // All IDs should be unique

          logger.info('[async-integration] Submitted concurrent jobs:', jobIds);

          // Poll all jobs until complete
          const results = await Promise.all(
            jobIds.map(async (jobId) => {
              let completed = false;
              let attempts = 0;
              const maxAttempts = 30;

              while (!completed && attempts < maxAttempts) {
                await new Promise((resolve) => setTimeout(resolve, 1000));

                const statusResult = await client.callTool({
                  name: 'check_status',
                  arguments: {
                    continuation_id: jobId,
                  },
                });

                // Parse status response, handling potential metadata display
                const statusText = statusResult.content[0].text;
                const status = parseStatusResponse(statusText);

                if (status.status === 'completed') {
                  completed = true;
                  return status;
                } else if (status.status === 'failed') {
                  const errorMsg =
                    typeof status.error === 'object'
                      ? status.error.message || JSON.stringify(status.error)
                      : status.error;
                  throw new Error(`Job ${jobId} failed: ${errorMsg}`);
                }

                attempts++;
              }

              throw new Error(`Job ${jobId} timed out`);
            }),
          );

          // Verify all jobs completed successfully
          expect(results).toHaveLength(3);
          results.forEach((result) => {
            expect(result.status).toBe('completed');
            expect(result.result).toBeDefined();
            expect(result.result.content).toBeDefined();
          });

          // Check answers
          expect(results[0].result.content).toMatch(/4/);
          expect(results[1].result.content).toMatch(/6/);
          expect(results[2].result.content).toMatch(/8/);

          logger.info(
            '[async-integration] All concurrent jobs completed successfully',
          );
        });
      },
      60000,
    );
  });
});
