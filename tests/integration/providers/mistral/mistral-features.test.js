import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../../src/config.js';
import { logger } from '../../../../src/utils/logger.js';

describe('Mistral Feature-Specific Tests', () => {
  let config;

  // Dynamic API key checking functions
  const hasMistral = () => !!(process.env.MISTRAL_API_KEY && process.env.MISTRAL_API_KEY.length > 20);

  beforeAll(async () => {
    try {
      config = await loadConfig();
      if (!hasMistral()) {
        logger.warn('[mistral-features-test] Mistral API key not found - tests will be skipped');
      } else {
        logger.info('[mistral-features-test] Running Mistral feature tests');
      }
    } catch (error) {
      logger.error('[mistral-features-test] Setup failed:', error);
      config = { apiKeys: {} };
    }
  });

  describe('Advanced Model Features', () => {
    it.skipIf(!hasMistral())('should handle Magistral model if available', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is the capital of France? One word answer.',
            model: 'magistral',
            temperature: 0
          }
        });

        // Magistral might not be available for all accounts
        if (!result.isError) {
          expect(result.content[0].text.toLowerCase()).toContain('paris');
          logger.info('[mistral-features-test] Magistral test completed');
        } else {
          logger.info('[mistral-features-test] Magistral not available, test skipped');
        }
      });
    }, 60000);
  });

  describe('Multi-Model Consensus with Mistral', () => {
    it.skipIf(!hasMistral())('should participate in consensus gathering', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const models = [
          { model: 'mistral-medium' },
          { model: 'magistral-small' }
        ];

        const result = await client.callTool({
          name: 'consensus',
          arguments: {
            prompt: 'Is mathematics important for programming? Answer with "Yes" or "No" only.',
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

        logger.info('[mistral-features-test] Consensus test completed');
      });
    }, 120000);
  });

  describe('Language Capabilities', () => {
    it.skipIf(!hasMistral())('should handle multilingual requests', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Say "Hello" in French, Spanish, and German. Format: Language: greeting',
            model: 'mistral-medium',
            temperature: 0.3
          }
        });

        expect(result.isError).toBeFalsy();
        const response = result.content[0].text.toLowerCase();
        expect(response).toContain('bonjour');
        expect(response).toContain('hola');
        expect(response).toContain('hallo');

        logger.info('[mistral-features-test] Multilingual test completed');
      });
    }, 60000);
  });
});
