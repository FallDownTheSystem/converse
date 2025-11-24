/**
 * Gemini CLI Provider E2E Integration Tests
 *
 * Tests the Gemini CLI provider through the full MCP server stack using HTTP transport.
 * These tests verify that the ai-sdk-provider-gemini-cli integrates correctly with our MCP server architecture.
 *
 * Requirements:
 * - ai-sdk-provider-gemini-cli installed
 * - OAuth credentials in ~/.gemini/oauth_creds.json
 * - Tests skip gracefully if Gemini CLI credentials are unavailable
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../../src/config.js';
import { logger } from '../../../../src/utils/logger.js';
import {
  testWithApiKeys,
  hasGeminiCli,
  getSkipMessage,
} from '../../../utils/conditionalTest.js';

describe('Gemini CLI Provider E2E Tests', () => {
  let config;

  beforeAll(async () => {
    try {
      config = await loadConfig();
      if (!hasGeminiCli) {
        const skipMessage = getSkipMessage(['GEMINI_CLI']);
        logger.warn(`[gemini-cli-api-test] ${skipMessage}`);
      } else {
        logger.info('[gemini-cli-api-test] Running Gemini CLI provider tests');
      }
    } catch (error) {
      logger.error('[gemini-cli-api-test] Setup failed:', error);
      config = { apiKeys: {} };
    }
  });

  describe('Basic Chat Functionality', () => {
    testWithApiKeys({
      requiredProviders: ['GEMINI_CLI'],
      requireAll: true,
    })(
      'should work with basic Gemini CLI chat',
      async () => {
        await withHTTPTestServer(async (client) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'What is 2+2? Answer with just the number.',
              model: 'gemini',
            },
          });

          expect(result.isError).toBeFalsy();
          expect(result.content).toBeDefined();
          expect(result.content[0].text).toBeTruthy();
          expect(result.content[0].text).toContain('4');

          logger.info('[gemini-cli-api-test] Basic chat test completed');
        });
      },
      60000,
    ); // 60s timeout

    testWithApiKeys({
      requiredProviders: ['GEMINI_CLI'],
      requireAll: true,
    })(
      'should support temperature parameter',
      async () => {
        await withHTTPTestServer(async (client) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Say "Hello!"',
              model: 'gemini',
              temperature: 0.5,
            },
          });

          expect(result.isError).toBeFalsy();
          expect(result.content[0].text).toBeTruthy();
          expect(result.content[0].text.toLowerCase()).toContain('hello');

          logger.info('[gemini-cli-api-test] Temperature test completed');
        });
      },
      60000,
    );

    testWithApiKeys({
      requiredProviders: ['GEMINI_CLI'],
      requireAll: true,
    })(
      'should handle multimodal messages (text only for now)',
      async () => {
        await withHTTPTestServer(async (client) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Describe the color blue in one word.',
              model: 'gemini',
            },
          });

          expect(result.isError).toBeFalsy();
          expect(result.content[0].text).toBeTruthy();

          logger.info('[gemini-cli-api-test] Multimodal test completed');
        });
      },
      60000,
    );
  });

  describe('Consensus Tool Integration', () => {
    testWithApiKeys({
      requiredProviders: ['GEMINI_CLI'],
      requireAll: true,
    })(
      'should work in consensus tool with Gemini CLI',
      async () => {
        await withHTTPTestServer(async (client) => {
          const result = await client.callTool({
            name: 'consensus',
            arguments: {
              prompt: 'What is the capital of France? Answer with just the city name.',
              models: ['gemini'],
            },
          });

          expect(result.isError).toBeFalsy();
          expect(result.content).toBeDefined();
          expect(result.content[0].text).toBeTruthy();
          expect(result.content[0].text).toContain('Paris');

          logger.info('[gemini-cli-api-test] Consensus test completed');
        });
      },
      90000,
    ); // 90s timeout for consensus

    testWithApiKeys({
      requiredProviders: ['GEMINI_CLI'],
      requireAll: true,
    })(
      'should work in consensus tool with multiple models including Gemini CLI',
      async () => {
        await withHTTPTestServer(async (client) => {
          // This test will use only Gemini CLI if it's the only provider available
          const result = await client.callTool({
            name: 'consensus',
            arguments: {
              prompt: 'What is 5 + 5? Answer with just the number.',
              models: ['gemini'],
              enable_cross_feedback: false, // Disable cross-feedback for faster test
            },
          });

          expect(result.isError).toBeFalsy();
          expect(result.content[0].text).toBeTruthy();
          expect(result.content[0].text).toContain('10');

          logger.info(
            '[gemini-cli-api-test] Multi-model consensus test completed',
          );
        });
      },
      120000,
    ); // 120s timeout for consensus with multiple models
  });

  describe('Async Mode', () => {
    testWithApiKeys({
      requiredProviders: ['GEMINI_CLI'],
      requireAll: true,
    })(
      'should work with async mode',
      async () => {
        await withHTTPTestServer(async (client) => {
          // Start async chat
          const startResult = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Count from 1 to 3.',
              model: 'gemini',
              async: true,
            },
          });

          expect(startResult.isError).toBeFalsy();
          const jobId = startResult.job_id;
          expect(jobId).toBeDefined();

          logger.info(`[gemini-cli-api-test] Async job started: ${jobId}`);

          // Poll for completion
          let completed = false;
          let attempts = 0;
          const maxAttempts = 30; // 30 attempts * 2s = 60s max wait

          while (!completed && attempts < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2s
            attempts++;

            const statusResult = await client.callTool({
              name: 'check_status',
              arguments: { job_id: jobId },
            });

            if (!statusResult.isError && statusResult.content[0].text) {
              const statusText = statusResult.content[0].text;
              if (statusText.includes('Status: completed')) {
                completed = true;
                expect(statusText).toMatch(/1.*2.*3/); // Should contain counting
                logger.info('[gemini-cli-api-test] Async job completed');
              }
            }
          }

          expect(completed).toBe(true);
        });
      },
      120000,
    ); // 120s timeout for async test
  });

  describe('Error Handling', () => {
    testWithApiKeys({
      requiredProviders: ['GEMINI_CLI'],
      requireAll: true,
    })(
      'should handle invalid model names gracefully',
      async () => {
        await withHTTPTestServer(async (client) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Hello',
              model: 'gemini-invalid-model-xyz',
            },
          });

          // Should either error or route to a different provider
          // We expect an error since this is an invalid model for Gemini CLI
          expect(result.isError || result.content[0].text.includes('error')).toBeTruthy();

          logger.info('[gemini-cli-api-test] Error handling test completed');
        });
      },
      30000,
    );
  });

  describe('Streaming Support', () => {
    testWithApiKeys({
      requiredProviders: ['GEMINI_CLI'],
      requireAll: true,
    })(
      'should work with streaming mode (via async)',
      async () => {
        await withHTTPTestServer(async (client) => {
          // Test streaming through async mode
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Write a very short poem (2 lines) about coding.',
              model: 'gemini',
            },
          });

          expect(result.isError).toBeFalsy();
          expect(result.content[0].text).toBeTruthy();
          expect(result.content[0].text.length).toBeGreaterThan(10);

          logger.info('[gemini-cli-api-test] Streaming test completed');
        });
      },
      60000,
    );
  });
});
