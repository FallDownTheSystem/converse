import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../src/config.js';
import { logger } from '../../../src/utils/logger.js';
import path from 'path';
import { 
  testWithApiKeys, 
  hasOpenAI, 
  hasXAI, 
  hasGoogle,
  hasAnyMainProvider,
  getSkipMessage 
} from '../../utils/conditionalTest.js';

describe('Advanced Multi-Provider Integration Tests', () => {
  let config;

  beforeAll(async () => {
    try {
      config = await loadConfig();
      
      const availableProviders = [];
      if (hasOpenAI) availableProviders.push('OpenAI');
      if (hasXAI) availableProviders.push('XAI');
      if (hasGoogle) availableProviders.push('Google');

      if (availableProviders.length >= 2) {
        logger.info(`[multi-provider-advanced-test] Running tests with providers: ${availableProviders.join(', ')}`);
      } else {
        logger.warn('[multi-provider-advanced-test] Less than 2 providers available - most tests will be skipped');
      }
    } catch (error) {
      logger.error('[multi-provider-advanced-test] Setup failed:', error);
      config = { apiKeys: {} };
    }
  });

  describe('Consensus with File Context', () => {
    testWithApiKeys({ 
      requiredProviders: ['OPENAI', 'XAI', 'GOOGLE'],
      requireAll: false 
    })('should handle consensus with files', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Create models list based on available API keys
        const models = [];
        if (hasOpenAI) models.push({ model: 'gpt-4o-mini' });
        if (hasXAI) models.push({ model: 'grok' });
        if (hasGoogle) models.push({ model: 'flash' });

        if (models.length < 2) {
          logger.info('[multi-provider-advanced-test] Not enough providers for consensus with files');
          return;
        }

        // Use only first 2 models to keep test fast
        const testModels = models.slice(0, 2);

        // Create a simple test file path (relative to project root)
        const testFile = path.join('tests', 'fixtures', 'files', 'sample.js');

        const result = await client.callTool({
          name: 'consensus',
          arguments: {
            prompt: 'What programming language is this file written in? Answer with just the language name.',
            models: testModels,
            files: [testFile],
            enable_cross_feedback: false,
            temperature: 0
          }
        });

        expect(result).toBeDefined();
        expect(result.isError).toBeFalsy();

        const consensusResult = JSON.parse(result.content[0].text);
        expect(consensusResult.status).toBe('consensus_complete');
        expect(consensusResult.models_consulted).toBe(testModels.length);

        // All models should recognize it's JavaScript
        consensusResult.phases.initial.forEach(response => {
          if (response.status === 'success') {
            expect(response.response.toLowerCase()).toMatch(/javascript|js/);
          }
        });

        logger.info(`[multi-provider-advanced-test] Consensus with files successful with ${testModels.length} providers`);
      });
    }, 120000);
  });

  describe('Complex Conversation Flow', () => {
    testWithApiKeys({ 
      requiredProviders: ['OPENAI', 'XAI', 'GOOGLE'] 
    })('should handle complex multi-turn conversation', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Start conversation
        const start = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'I want to learn about machine learning. What should I start with?',
            model: 'auto',
            temperature: 0.3
          }
        });

        expect(start.isError).toBe(false);
        const conversationId = start.continuation.id;

        // Follow-up question
        const followUp = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Can you recommend a specific resource or course?',
            continuation_id: conversationId,
            model: 'auto',
            temperature: 0.3
          }
        });

        expect(followUp.isError).toBe(false);
        expect(followUp.content[0].text).toBeDefined();

        // Topic shift within same conversation
        const shift = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Actually, what about deep learning instead?',
            continuation_id: conversationId,
            model: 'auto',
            temperature: 0.3
          }
        });

        expect(shift.isError).toBe(false);
        expect(shift.content[0].text.toLowerCase()).toMatch(/deep learning|neural|network/);

        logger.info('[multi-provider-advanced-test] Complex conversation flow completed');
      });
    }, 90000);
  });

  describe('Provider Output Consistency', () => {
    testWithApiKeys({ 
      requiredProviders: ['OPENAI', 'XAI', 'GOOGLE'] 
    })('should produce consistent outputs across providers', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const testPrompt = 'What is the capital of France? Answer with just the city name.';
        const results = {};

        // Test each available provider
        if (hasOpenAI) {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: testPrompt,
              model: 'gpt-4o-mini',
              temperature: 0
            }
          });
          if (!result.isError) {
            results.OpenAI = result.content[0].text.trim().toLowerCase();
          }
        }

        if (hasXAI) {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: testPrompt,
              model: 'grok',
              temperature: 0
            }
          });
          if (!result.isError) {
            results.XAI = result.content[0].text.trim().toLowerCase();
          }
        }

        if (hasGoogle) {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: testPrompt,
              model: 'flash',
              temperature: 0
            }
          });
          if (!result.isError) {
            results.Google = result.content[0].text.trim().toLowerCase();
          }
        }

        // All should mention Paris
        Object.entries(results).forEach(([provider, answer]) => {
          expect(answer).toContain('paris');
          logger.info(`[multi-provider-advanced-test] ${provider} answered: ${answer}`);
        });

        // Check consistency
        const uniqueAnswers = new Set(Object.values(results));
        logger.info(`[multi-provider-advanced-test] Unique answers: ${uniqueAnswers.size}, Total providers: ${Object.keys(results).length}`);
      });
    }, 90000);
  });

  describe('Concurrent Provider Requests', () => {
    testWithApiKeys({ 
      requiredProviders: ['OPENAI', 'XAI', 'GOOGLE'] 
    })('should handle concurrent requests across providers', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const concurrentRequests = 3;
        const requests = [];

        for (let i = 0; i < concurrentRequests; i++) {
          requests.push(
            client.callTool({
              name: 'chat',
              arguments: {
                prompt: `Simple request ${i}: What is ${i} + ${i}?`,
                model: 'auto',
                temperature: 0
              }
            })
          );
        }

        const results = await Promise.allSettled(requests);

        // All should succeed
        const successful = results.filter(r => r.status === 'fulfilled' && !r.value.isError);
        expect(successful.length).toBe(concurrentRequests);

        // Verify answers
        successful.forEach((result, index) => {
          const expectedAnswer = (index * 2).toString();
          expect(result.value.content[0].text).toContain(expectedAnswer);
        });

        logger.info(`[multi-provider-advanced-test] ${concurrentRequests} concurrent requests successful`);
      });
    }, 60000);
  });
});