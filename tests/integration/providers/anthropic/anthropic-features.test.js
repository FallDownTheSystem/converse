import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../../src/config.js';
import { logger } from '../../../../src/utils/logger.js';

describe('Anthropic Feature-Specific Tests', () => {
  let config;

  // Dynamic API key checking functions
  const hasAnthropic = () => !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-'));

  beforeAll(async () => {
    try {
      config = await loadConfig();
      if (!hasAnthropic()) {
        logger.warn('[anthropic-features-test] Anthropic API key not found - tests will be skipped');
      } else {
        logger.info('[anthropic-features-test] Running Anthropic feature tests');
      }
    } catch (error) {
      logger.error('[anthropic-features-test] Setup failed:', error);
      config = { apiKeys: {} };
    }
  });

  describe('Thinking Model Features', () => {
    it.skipIf(!hasAnthropic())('should handle Claude Sonnet 4 with thinking', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is 10 + 10?',
            model: 'claude-sonnet-4',
            reasoning_effort: 'minimal'
          }
        });

        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toContain('20');

        logger.info('[anthropic-features-test] Claude Sonnet 4 thinking test completed');
      });
    }, 90000);

    it.skipIf(!hasAnthropic())('should handle Claude Opus 4 with thinking', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is 15 + 15?',
            model: 'claude-opus-4',
            reasoning_effort: 'minimal'
          }
        });

        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toContain('30');

        logger.info('[anthropic-features-test] Claude Opus 4 thinking test completed');
      });
    }, 90000);

    it.skipIf(!hasAnthropic())('should handle Claude 3.7 thinking model if available', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is 10 + 10? Just the number.',
            model: 'claude-3-7-sonnet',
            reasoning_effort: 'minimal'
          }
        });

        // If Claude 3.7 is available, it should work
        if (!result.isError) {
          expect(result.content[0].text).toContain('20');
        }

        logger.info('[anthropic-features-test] Claude 3.7 thinking model test completed');
      });
    }, 90000);
  });

  describe('Multi-Model Consensus with Anthropic', () => {
    it.skipIf(!hasAnthropic())('should participate in consensus gathering', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const models = [
          { model: 'claude-3.5-sonnet' },
          { model: 'haiku' }
        ];

        const result = await client.callTool({
          name: 'consensus',
          arguments: {
            prompt: 'Is fire hot? Answer with "Yes" or "No" only.',
            models,
            enable_cross_feedback: false,
            temperature: 0
          }
        });

        expect(result).toBeDefined();
        expect(result.isError).toBeFalsy();

        const consensusResult = JSON.parse(result.content[0].text);
        expect(consensusResult.status).toBe('consensus_complete');
        expect(consensusResult.models_consulted).toBe(2);
        expect(consensusResult.successful_initial_responses).toBe(2);

        logger.info('[anthropic-features-test] Consensus test completed');
      });
    }, 120000);
  });

  describe('Cross-Provider Features', () => {
    it.skipIf(!hasAnthropic())('should work with cross-feedback consensus', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const models = [
          { model: 'claude-3.5-sonnet' },
          { model: 'haiku' }
        ];

        const result = await client.callTool({
          name: 'consensus',
          arguments: {
            prompt: 'What is the best programming language for beginners? Give a one-sentence answer.',
            models,
            enable_cross_feedback: true,
            temperature: 0.3
          }
        });

        expect(result.isError).toBeFalsy();

        const consensusResult = JSON.parse(result.content[0].text);
        expect(consensusResult.phases.initial).toBeDefined();
        expect(consensusResult.phases.refined).toBeDefined();
        expect(consensusResult.refined_responses).toBeGreaterThan(0);

        // Verify that models actually refined their responses
        if (consensusResult.phases.refined) {
          expect(consensusResult.phases.refined.length).toBeGreaterThan(0);
          // Check that at least one model successfully refined
          const successfulRefinements = consensusResult.phases.refined.filter(r => r.status === 'success');
          expect(successfulRefinements.length).toBeGreaterThan(0);
        }

        logger.info('[anthropic-features-test] Cross-feedback consensus test completed');
      });
    }, 180000);
  });
});
