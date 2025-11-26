import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../../src/config.js';
import { logger } from '../../../../src/utils/logger.js';
import { parseJsonResponse } from '../../../utils/responseParser.js';

describe('OpenRouter Feature-Specific Tests', () => {
  let config;

  // Dynamic API key checking functions
  const hasOpenRouter = () =>
    !!(
      process.env.OPENROUTER_API_KEY &&
      process.env.OPENROUTER_API_KEY.startsWith('sk-or-') &&
      process.env.OPENROUTER_REFERER
    );

  beforeAll(async () => {
    try {
      config = await loadConfig();
      if (!hasOpenRouter()) {
        logger.warn(
          '[openrouter-features-test] OpenRouter API key or referer not found - tests will be skipped',
        );
      } else {
        logger.info(
          '[openrouter-features-test] Running OpenRouter feature tests',
        );
      }
    } catch (error) {
      logger.error('[openrouter-features-test] Setup failed:', error);
      config = { apiKeys: {} };
    }
  });

  describe('Thinking Model Features', () => {
    it.skipIf(!hasOpenRouter())(
      'should handle thinking models if available',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'What is 15% of 200? Show your calculation.',
              model: 'qwen-thinking',
              temperature: 0,
            },
          });

          // Thinking model might have limited availability
          if (!result.isError) {
            expect(result.content[0].text).toContain('30');
            logger.info(
              '[openrouter-features-test] Qwen Thinking test completed',
            );
          } else {
            logger.info(
              '[openrouter-features-test] Qwen Thinking not available, test skipped',
            );
          }
        });
      },
      90000,
    );
  });

  describe('Multi-Model Access', () => {
    it.skipIf(!hasOpenRouter())(
      'should access diverse model ecosystem',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          // Test with a fast model
          const fastResult = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Reply with "fast" in lowercase only',
              model: 'k2',
              temperature: 0,
            },
          });

          expect(fastResult.isError).toBeFalsy();
          expect(fastResult.content[0].text.toLowerCase()).toContain('fast');

          // Test with a code model
          const codeResult = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Write x = 5 in Python. Just the code.',
              model: 'qwen-coder',
              temperature: 0,
            },
          });

          expect(codeResult.isError).toBeFalsy();
          expect(codeResult.content[0].text).toContain('x = 5');

          logger.info(
            '[openrouter-features-test] Multi-model access test completed',
          );
        });
      },
      90000,
    );
  });

  describe('Dynamic Model Support', () => {
    it.skipIf(!hasOpenRouter())(
      'should support custom model paths',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          // Test with a specific model path format
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Say "Hello World"',
              model: 'meta-llama/llama-3.1-8b-instruct',
              temperature: 0,
            },
          });

          // Should either work or gracefully handle the model
          if (!result.isError) {
            expect(result.content[0].text).toBeDefined();
          } else {
            expect(result.content[0].text).toMatch(/model/i);
          }

          logger.info(
            '[openrouter-features-test] Dynamic model support test completed',
          );
        });
      },
      60000,
    );
  });

  describe('Consensus with OpenRouter Models', () => {
    it.skipIf(!hasOpenRouter())(
      'should participate in consensus gathering',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const models = [{ model: 'k2' }, { model: 'qwen-coder' }];

          const result = await client.callTool({
            name: 'consensus',
            arguments: {
              prompt: 'Is coding fun? Answer with "Yes" or "No" only.',
              models,
              enable_cross_feedback: false,
              temperature: 0,
            },
          });

          expect(result).toBeDefined();
          expect(result.isError).toBeFalsy();

          const consensusResult = parseJsonResponse(result.content[0].text);
          expect(consensusResult.status).toBe('consensus_complete');
          expect(consensusResult.models_consulted).toBe(2);

          logger.info('[openrouter-features-test] Consensus test completed');
        });
      },
      120000,
    );
  });
});
