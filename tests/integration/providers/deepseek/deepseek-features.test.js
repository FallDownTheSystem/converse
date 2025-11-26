import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../../src/config.js';
import { logger } from '../../../../src/utils/logger.js';
import { parseJsonResponse } from '../../../utils/responseParser.js';

describe('DeepSeek Feature-Specific Tests', () => {
  let config;

  // Dynamic API key checking functions
  const hasDeepSeek = () =>
    !!(
      process.env.DEEPSEEK_API_KEY &&
      process.env.DEEPSEEK_API_KEY.startsWith('sk-')
    );

  beforeAll(async () => {
    try {
      config = await loadConfig();
      if (!hasDeepSeek()) {
        logger.warn(
          '[deepseek-features-test] DeepSeek API key not found - tests will be skipped',
        );
      } else {
        logger.info('[deepseek-features-test] Running DeepSeek feature tests');
      }
    } catch (error) {
      logger.error('[deepseek-features-test] Setup failed:', error);
      config = { apiKeys: {} };
    }
  });

  describe('Specialized Model Features', () => {
    it.skipIf(!hasDeepSeek())(
      'should excel at code generation tasks',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt:
                'Write a Python function to calculate factorial. Include type hints.',
              model: 'deepseek-coder',
              temperature: 0.2,
            },
          });

          expect(result.isError).toBeFalsy();
          expect(result.content[0].text).toContain('def');
          expect(result.content[0].text).toContain('factorial');
          expect(result.content[0].text).toMatch(/->|:/); // Type hints

          logger.info(
            '[deepseek-features-test] Code generation test completed',
          );
        });
      },
      60000,
    );
  });

  describe('Multi-Model Consensus with DeepSeek', () => {
    it.skipIf(!hasDeepSeek())(
      'should participate in consensus gathering',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const models = [
            { model: 'deepseek-chat' },
            { model: 'deepseek-coder' },
          ];

          const result = await client.callTool({
            name: 'consensus',
            arguments: {
              prompt:
                'Is Python a good language for beginners? Answer with "Yes" or "No" only.',
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

          logger.info('[deepseek-features-test] Consensus test completed');
        });
      },
      120000,
    );
  });

  describe('Cross-Provider Integration', () => {
    it.skipIf(!hasDeepSeek())(
      'should handle mixed code and chat requests',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          // First ask about code
          const codeResult = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Show me a simple for loop in Python',
              model: 'deepseek-coder',
              temperature: 0,
            },
          });

          expect(codeResult.isError).toBeFalsy();
          expect(codeResult.content[0].text).toContain('for');

          // Then ask a general question
          const chatResult = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'What is the capital of Japan?',
              model: 'deepseek-chat',
              temperature: 0,
            },
          });

          expect(chatResult.isError).toBeFalsy();
          expect(chatResult.content[0].text).toContain('Tokyo');

          logger.info('[deepseek-features-test] Mixed request test completed');
        });
      },
      90000,
    );
  });
});
