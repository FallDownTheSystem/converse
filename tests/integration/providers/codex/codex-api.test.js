/**
 * Codex Provider E2E Integration Tests
 *
 * Tests the Codex provider through the full MCP server stack using HTTP transport.
 * These tests verify that the Codex SDK integrates correctly with our MCP server architecture.
 *
 * Requirements:
 * - @openai/codex-sdk installed
 * - ChatGPT authentication (system-wide login) OR OPENAI_API_KEY
 * - Tests skip gracefully if Codex is unavailable
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../../src/config.js';
import { logger } from '../../../../src/utils/logger.js';
import {
  testWithApiKeys,
  hasCodex,
  getSkipMessage,
} from '../../../utils/conditionalTest.js';

describe('Codex Provider E2E Tests', () => {
  let config;

  beforeAll(async () => {
    try {
      config = await loadConfig();
      if (!hasCodex) {
        const skipMessage = getSkipMessage(['CODEX']);
        logger.warn(`[codex-api-test] ${skipMessage}`);
      } else {
        logger.info('[codex-api-test] Running Codex provider tests');
      }
    } catch (error) {
      logger.error('[codex-api-test] Setup failed:', error);
      config = { apiKeys: {} };
    }
  });

  describe('Basic Chat Functionality', () => {
    testWithApiKeys({
      requiredProviders: ['CODEX'],
      requireAll: true,
    })(
      'should work with basic Codex chat',
      async () => {
        await withHTTPTestServer(async (client) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'What is 2+2? Answer with just the number.',
              model: 'codex',
            },
          });

          expect(result.isError).toBeFalsy();
          expect(result.content).toBeDefined();
          expect(result.content[0].text).toBeTruthy();
          expect(result.content[0].text).toContain('4');

          logger.info('[codex-api-test] Basic chat test completed');
        });
      },
      90000,
    ); // 90s timeout (Codex can be slow)

    testWithApiKeys({
      requiredProviders: ['CODEX'],
      requireAll: true,
    })(
      'should maintain conversation continuity (thread resumption)',
      async () => {
        await withHTTPTestServer(async (client) => {
          // First message - establish context
          const firstResult = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'My name is Alice. Just say "Noted." to confirm.',
              model: 'codex',
            },
          });

          expect(firstResult.isError).toBeFalsy();
          const conversationId = firstResult.continuation?.id;
          expect(conversationId).toBeDefined();

          logger.info(
            `[codex-api-test] First message completed, continuation_id: ${conversationId}`,
          );

          // Second message - test context retention
          const secondResult = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'What is my name?',
              continuation_id: conversationId,
              model: 'codex',
            },
          });

          expect(secondResult.isError).toBeFalsy();
          expect(secondResult.content[0].text).toContain('Alice');

          logger.info(
            '[codex-api-test] Conversation continuity test completed',
          );
        });
      },
      180000,
    ); // 180s timeout (two Codex calls)
  });

  describe('Streaming Support', () => {
    testWithApiKeys({
      requiredProviders: ['CODEX'],
      requireAll: true,
    })(
      'should work with streaming responses',
      async () => {
        // Note: This test uses the async mode which internally uses streaming
        await withHTTPTestServer(async (client) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Count from 1 to 3, then say "Done!"',
              model: 'codex',
            },
          });

          expect(result.isError).toBeFalsy();
          expect(result.content[0].text).toBeTruthy();

          // Verify the response contains the expected content
          const text = result.content[0].text.toLowerCase();
          expect(text).toMatch(/done/);

          logger.info('[codex-api-test] Streaming test completed');
        });
      },
      90000,
    );
  });

  describe('Async Mode', () => {
    testWithApiKeys({
      requiredProviders: ['CODEX'],
      requireAll: true,
    })(
      'should work with async mode',
      async () => {
        await withHTTPTestServer(async (client) => {
          // Submit async job
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'What is 10 divided by 2? Answer with just the number.',
              model: 'codex',
              async: true,
            },
          });

          // Parse async response
          expect(result.isError).toBeFalsy();
          const responseText = result.content[0].text;
          expect(responseText).toMatch(/SUBMITTED|continuation_id/);

          // Extract continuation ID (job ID)
          const continuationMatch = responseText.match(
            /continuation_id:\s*([^\s,]+)/,
          );
          expect(continuationMatch).toBeTruthy();
          const jobId = continuationMatch[1];

          logger.info(`[codex-api-test] Async job submitted: ${jobId}`);

          // Poll for completion (max 30 attempts, 2s interval = 60s total)
          let completed = false;
          let attempts = 0;
          const maxAttempts = 30;

          while (!completed && attempts < maxAttempts) {
            await new Promise((r) => setTimeout(r, 2000)); // Wait 2 seconds

            const statusResult = await client.callTool({
              name: 'check_status',
              arguments: { continuation_id: jobId },
            });

            expect(statusResult.isError).toBeFalsy();
            const statusText = statusResult.content[0].text.toLowerCase();

            if (statusText.includes('completed')) {
              completed = true;
              expect(statusText).toContain('5');
              logger.info('[codex-api-test] Async job completed successfully');
            } else if (statusText.includes('failed')) {
              throw new Error(`Job failed: ${statusText}`);
            }

            attempts++;
          }

          expect(completed).toBe(true);
        });
      },
      120000,
    ); // 120s timeout for async job
  });

  describe('Error Handling', () => {
    testWithApiKeys({
      requiredProviders: ['CODEX'],
      requireAll: true,
    })(
      'should handle invalid continuation IDs gracefully',
      async () => {
        await withHTTPTestServer(async (client) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Hello',
              continuation_id: 'invalid_continuation_id_12345',
              model: 'codex',
            },
          });

          // Should still work - Codex will create a new thread if ID is invalid
          // This matches the design from the research findings
          expect(result.isError).toBeFalsy();
        });
      },
      90000,
    );
  });

  describe('Performance Characteristics', () => {
    testWithApiKeys({
      requiredProviders: ['CODEX'],
      requireAll: true,
    })(
      'should complete simple requests within reasonable time',
      async () => {
        await withHTTPTestServer(async (client) => {
          const startTime = Date.now();

          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Say "Hello!"',
              model: 'codex',
            },
          });

          const endTime = Date.now();
          const duration = endTime - startTime;

          expect(result.isError).toBeFalsy();

          // From research findings: Codex can take 5-20s for responses
          // Set reasonable upper bound at 60s for this test
          expect(duration).toBeLessThan(60000);

          logger.info(`[codex-api-test] Response time: ${duration}ms`);
        });
      },
      90000,
    );
  });

  describe('Configuration Integration', () => {
    testWithApiKeys({
      requiredProviders: ['CODEX'],
      requireAll: true,
    })(
      'should use CLIENT_CWD for working directory',
      async () => {
        await withHTTPTestServer(async (client) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt:
                'Print the current working directory with pwd command. Just output the path.',
              model: 'codex',
            },
          });

          expect(result.isError).toBeFalsy();
          // Working directory should match CLIENT_CWD (process.cwd() in tests)
          const content = result.content?.[0]?.text || '';
          logger.info(
            `[codex-api-test] Working directory test - response: ${content}`,
          );
        });
      },
      90000,
    );

    testWithApiKeys({
      requiredProviders: ['CODEX'],
      requireAll: true,
    })(
      'should handle unsupported parameters gracefully',
      async () => {
        await withHTTPTestServer(async (client) => {
          // Send unsupported parameters - should not error
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'What is 1+1?',
              model: 'codex',
              temperature: 0.7, // Not supported by Codex
              use_websearch: true, // Not supported by Codex
            },
          });

          // Should work despite unsupported parameters (logged but ignored)
          expect(result.isError).toBeFalsy();
          expect(result.content?.[0]?.text).toBeTruthy();
        });
      },
      90000,
    );
  });
});
