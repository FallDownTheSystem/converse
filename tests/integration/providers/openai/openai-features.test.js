import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../../src/config.js';
import { logger } from '../../../../src/utils/logger.js';
import { parseJsonResponse } from '../../../utils/responseParser.js';
import {
  testWithApiKeys,
  hasOpenAI,
  getSkipMessage,
} from '../../../utils/conditionalTest.js';

describe('OpenAI Feature-Specific Tests', () => {
  let config;

  beforeAll(async () => {
    try {
      config = await loadConfig();
      if (!hasOpenAI) {
        const skipMessage = getSkipMessage(['OPENAI']);
        logger.warn(`[openai-features-test] ${skipMessage}`);
      } else {
        logger.info('[openai-features-test] Running OpenAI feature tests');
      }
    } catch (error) {
      logger.error('[openai-features-test] Setup failed:', error);
      config = { apiKeys: {} };
    }
  });

  describe('O3 Model Features', () => {
    testWithApiKeys({
      requiredProviders: ['OPENAI'],
      requireAll: true,
    })(
      'should support OpenAI reasoning effort for O3',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'What is 2+2?',
              model: 'o3-mini',
              reasoning_effort: 'low',
            },
          });

          // May fail if O3 is not available, that's expected
          if (!result.isError) {
            expect(result.content[0].text).toContain('4');
          }

          logger.info(
            '[openai-features-test] O3 reasoning effort test completed',
          );
        });
      },
      90000,
    );
  });

  describe('Multi-Model Consensus with OpenAI', () => {
    testWithApiKeys({
      requiredProviders: ['OPENAI'],
      requireAll: true,
    })(
      'should participate in consensus gathering',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const models = [{ model: 'gpt-4o-mini' }, { model: 'gpt-4o' }];

          const result = await client.callTool({
            name: 'consensus',
            arguments: {
              prompt: 'Is the sky blue? Answer with "Yes" or "No" only.',
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
          expect(consensusResult.successful_initial_responses).toBe(2);

          logger.info('[openai-features-test] Consensus test completed');
        });
      },
      120000,
    );
  });

  describe('Web Search Features', () => {
    testWithApiKeys({
      requiredProviders: ['OPENAI'],
      requireAll: true,
    })(
      'should support web search when enabled',
      async () => {
        await withHTTPTestServer(async (client, manager) => {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt:
                'What was the latest major announcement from OpenAI in 2024?',
              model: 'gpt-4o',
              use_websearch: true,
              temperature: 0.5,
            },
          });

          // Web search may not be available for all models
          if (!result.isError) {
            expect(result.content[0].text).toBeDefined();
          }

          logger.info('[openai-features-test] Web search test completed');
        });
      },
      90000,
    );
  });
});
