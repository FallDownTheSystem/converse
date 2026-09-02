/**
 * Gemini CLI (Antigravity / agy) Provider E2E Integration Tests
 *
 * Tests the gemini-cli provider through the full MCP server stack via HTTP
 * transport. The provider shells out to the Antigravity CLI (`agy -p`) under a
 * PTY, so these tests require a real, authenticated agy install and are gated on
 * binary presence (GEMINI_CLI detection). They skip gracefully otherwise.
 *
 * Requirements:
 * - Antigravity CLI (`agy`) installed and authenticated (run `agy` once to log
 *   in via Google OAuth).
 *
 * Note: each agy call takes ~7s minimum (CLI boot + silent auth), and the
 * large-prompt file path takes ~30-60s, so timeouts here are generous.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../../utils/HTTPMCPServerManager.js';
import { execSync } from 'node:child_process';
import { loadConfig } from '../../../../src/config.js';
import { logger } from '../../../../src/utils/logger.js';
import {
  testWithApiKeys,
  hasGeminiCli,
  getSkipMessage,
} from '../../../utils/conditionalTest.js';

describe('Gemini CLI (Antigravity) Provider E2E Tests', () => {
  let config;

  beforeAll(async () => {
    try {
      config = await loadConfig();
      if (!hasGeminiCli) {
        const skipMessage = getSkipMessage(['GEMINI_CLI']);
        logger.warn(`[gemini-cli-api-test] ${skipMessage}`);
      } else {
        logger.info(
          '[gemini-cli-api-test] Running Antigravity CLI provider tests',
        );
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
      'should work with basic gemini chat (AC1)',
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
        });
      },
      90000,
    );

    testWithApiKeys({
      requiredProviders: ['GEMINI_CLI'],
      requireAll: true,
    })(
      'should select Gemini 3.8 Flash via gemini:flash (AC10)',
      async () => {
        await withHTTPTestServer(async (client) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Reply with exactly: flash-ok',
              model: 'gemini:flash',
              reasoning_effort: 'low',
            },
          });

          expect(result.isError).toBeFalsy();
          expect(result.content[0].text).toBeTruthy();
          expect(result.content[0].text.toLowerCase()).toContain('flash-ok');
        });
      },
      90000,
    );
  });

  describe('Continuation context (AC2)', () => {
    testWithApiKeys({
      requiredProviders: ['GEMINI_CLI'],
      requireAll: true,
    })(
      'should carry turn-1 context into turn 2 via continuation_id',
      async () => {
        await withHTTPTestServer(async (client) => {
          const first = await client.callTool({
            name: 'chat',
            arguments: {
              prompt:
                'Remember this secret word: marmalade. Just acknowledge it.',
              model: 'gemini:flash',
              reasoning_effort: 'low',
            },
          });
          expect(first.isError).toBeFalsy();
          const continuationId = first.continuation_id;
          expect(continuationId).toBeDefined();

          const second = await client.callTool({
            name: 'chat',
            arguments: {
              prompt:
                'What was the secret word I told you? Answer with just the word.',
              model: 'gemini:flash',
              reasoning_effort: 'low',
              continuation_id: continuationId,
            },
          });
          expect(second.isError).toBeFalsy();
          expect(second.content[0].text.toLowerCase()).toContain('marmalade');
        });
      },
      180000,
    );
  });

  describe('Large prompt (AC3)', () => {
    testWithApiKeys({
      requiredProviders: ['GEMINI_CLI'],
      requireAll: true,
    })(
      'should complete a >32KB prompt without spawn errors',
      async () => {
        await withHTTPTestServer(async (client) => {
          // ~40KB of filler then a question — exceeds the 24000-char argv
          // threshold, exercising the prompt.md file-delivery path.
          const filler = 'The secret token is BLUEBERRY-7. '.repeat(1300);
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: `${filler}\n\nWhat is the secret token? Answer with just the token.`,
              model: 'gemini:flash',
              reasoning_effort: 'low',
            },
          });

          expect(result.isError).toBeFalsy();
          expect(result.content[0].text.toUpperCase()).toContain('BLUEBERRY-7');
        });
      },
      120000,
    );
  });

  describe('Consensus + Conversation integration (AC4)', () => {
    testWithApiKeys({
      requiredProviders: ['GEMINI_CLI'],
      requireAll: true,
    })(
      'should stream-normalize gemini single-chunk output in consensus',
      async () => {
        await withHTTPTestServer(async (client) => {
          const result = await client.callTool({
            name: 'consensus',
            arguments: {
              prompt:
                'What is the capital of France? Answer with just the city name.',
              models: ['gemini:flash'],
              enable_cross_feedback: false,
            },
          });

          expect(result.isError).toBeFalsy();
          expect(result.content[0].text).toContain('Paris');
        });
      },
      120000,
    );

    testWithApiKeys({
      requiredProviders: ['GEMINI_CLI'],
      requireAll: true,
    })(
      'should accept gemini in the conversation tool',
      async () => {
        await withHTTPTestServer(async (client) => {
          const result = await client.callTool({
            name: 'conversation',
            arguments: {
              prompt: 'Say hello in one word.',
              models: ['gemini:flash'],
            },
          });

          expect(result.isError).toBeFalsy();
          expect(result.content[0].text).toBeTruthy();
        });
      },
      120000,
    );
  });

  describe('Async mode (AC5)', () => {
    testWithApiKeys({
      requiredProviders: ['GEMINI_CLI'],
      requireAll: true,
    })(
      'should complete an async gemini job (running -> completed)',
      async () => {
        await withHTTPTestServer(async (client) => {
          const startResult = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Count from 1 to 3.',
              model: 'gemini:flash',
              reasoning_effort: 'low',
              async: true,
            },
          });

          expect(startResult.isError).toBeFalsy();
          const jobId = startResult.job_id;
          expect(jobId).toBeDefined();

          let completed = false;
          let attempts = 0;
          const maxAttempts = 45; // 45 * 2s = 90s max wait

          while (!completed && attempts < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            attempts++;

            const statusResult = await client.callTool({
              name: 'check_status',
              arguments: { job_id: jobId },
            });

            if (!statusResult.isError && statusResult.content[0].text) {
              const statusText = statusResult.content[0].text;
              if (statusText.includes('Status: completed')) {
                completed = true;
              }
            }
          }

          expect(completed).toBe(true);
        });
      },
      120000,
    );
  });

  describe('Cancellation (AC6)', () => {
    testWithApiKeys({
      requiredProviders: ['GEMINI_CLI'],
      requireAll: true,
    })(
      'should leave no orphaned agy.exe after cancelling a job',
      async () => {
        await withHTTPTestServer(async (client) => {
          const startResult = await client.callTool({
            name: 'chat',
            arguments: {
              prompt:
                'Write a long, detailed essay about distributed systems.',
              model: 'gemini',
              async: true,
            },
          });
          expect(startResult.isError).toBeFalsy();
          const jobId = startResult.job_id;

          // Let it spawn, then cancel.
          await new Promise((resolve) => setTimeout(resolve, 3000));
          const cancelResult = await client.callTool({
            name: 'cancel_job',
            arguments: { job_id: jobId },
          });
          expect(cancelResult.isError).toBeFalsy();

          // Give the OS a moment to reap the process tree.
          await new Promise((resolve) => setTimeout(resolve, 5000));

          if (process.platform === 'win32') {
            let tasklist = '';
            try {
              tasklist = execSync('tasklist /FI "IMAGENAME eq agy.exe"', {
                encoding: 'utf8',
              });
            } catch {
              tasklist = '';
            }
            expect(tasklist).not.toContain('agy.exe');
          }
        });
      },
      60000,
    );
  });

  describe('Parallel invocation (shared agy state)', () => {
    testWithApiKeys({
      requiredProviders: ['GEMINI_CLI'],
      requireAll: true,
    })(
      'should handle 3 simultaneous gemini chats without state collisions',
      async () => {
        await withHTTPTestServer(async (client) => {
          const prompts = ['Reply with: one', 'Reply with: two', 'Reply with: three'];
          const results = await Promise.all(
            prompts.map((prompt) =>
              client.callTool({
                name: 'chat',
                arguments: {
                  prompt,
                  model: 'gemini:flash',
                  reasoning_effort: 'low',
                },
              }),
            ),
          );

          for (const result of results) {
            expect(result.isError).toBeFalsy();
            expect(result.content[0].text).toBeTruthy();
          }
        });
      },
      180000,
    );
  });
});
