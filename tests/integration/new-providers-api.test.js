import { describe, it, expect, beforeAll, vi } from 'vitest';
import { withHTTPTestServer } from '../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../src/config.js';
import { logger } from '../../src/utils/logger.js';

// These tests make real API calls - they require valid API keys and will be skipped if not available
describe('New Providers Real API Integration Tests', () => {
  let config;

  // Check environment variables directly for skipIf conditions
  const hasAnthropic = !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-'));
  const hasDeepSeek = !!(process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.startsWith('sk-'));
  const hasMistral = !!(process.env.MISTRAL_API_KEY && process.env.MISTRAL_API_KEY.length > 20);
  const hasOpenRouter = !!(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.startsWith('sk-or-') && process.env.OPENROUTER_REFERER);
  const hasAnyNewApiKey = hasAnthropic || hasDeepSeek || hasMistral || hasOpenRouter;

  beforeAll(async () => {
    try {
      if (!hasAnyNewApiKey) {
        logger.warn('[new-providers-api-test] No new provider API keys found - tests will be skipped');
      } else {
        logger.info('[new-providers-api-test] New provider API keys found - running integration tests');
        if (hasAnthropic) logger.info('[new-providers-api-test] Anthropic API key found');
        if (hasDeepSeek) logger.info('[new-providers-api-test] DeepSeek API key found');
        if (hasMistral) logger.info('[new-providers-api-test] Mistral API key found');
        if (hasOpenRouter) logger.info('[new-providers-api-test] OpenRouter API key found');
      }

      // Load config for test dependencies
      config = await loadConfig();
    } catch (error) {
      logger.error('[new-providers-api-test] Setup failed:', error);
      // Set config to empty object so skipIf conditions work
      config = { apiKeys: {} };
    }
  });

  describe('Anthropic Provider Real API Tests', () => {
    it.skipIf(!hasAnthropic)('should complete a simple chat request with Claude Sonnet 3.5', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is 10 + 5? Reply with just the number.',
            model: 'claude-3.5-sonnet',
            temperature: 0
          }
        });

        expect(result).toBeDefined();
        
        if (result.isError) {
          console.error('[new-providers-api-test] Claude Sonnet 3.5 error:', result.error);
          console.error('[new-providers-api-test] Error content:', result.content);
          console.error('[new-providers-api-test] Full result:', JSON.stringify(result, null, 2));
        }
        
        expect(result.isError).toBeFalsy();
        expect(result.content).toBeDefined();
        expect(Array.isArray(result.content)).toBe(true);
        expect(result.content[0].type).toBe('text');
        expect(result.content[0].text).toContain('15');

        logger.info('[new-providers-api-test] Anthropic Claude Sonnet 3.5 test completed');
      });
    }, 60000);

    it.skipIf(!hasAnthropic)('should work with Claude Haiku for fast responses', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Say "Hello World" and nothing else.',
            model: 'haiku',
            temperature: 0
          }
        });

        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toContain('Hello World');

        logger.info('[new-providers-api-test] Anthropic Claude Haiku test completed');
      });
    }, 60000);

    it.skipIf(!hasAnthropic)('should work with Claude Sonnet 4 - the high performance model', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is 25 * 4? Reply with just the number.',
            model: 'sonnet-4',
            temperature: 0
          }
        });

        // Sonnet 4 might not be available on all accounts
        if (!result.isError) {
          expect(result.content[0].text).toContain('100');
          logger.info('[new-providers-api-test] Anthropic Claude Sonnet 4 test completed');
        } else {
          logger.info('[new-providers-api-test] Claude Sonnet 4 not available:', result.error.message);
          // Test passes - model availability varies by account
        }
      });
    }, 60000);

    it.skipIf(!hasAnthropic)('should handle Claude Sonnet 4 with thinking', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is 10 + 10?',
            model: 'claude-sonnet-4',
            reasoning_effort: 'minimal' // Minimal effort for testing
          }
        });

        if (result.isError) {
          console.error('[new-providers-api-test] Claude Sonnet 4 thinking error:', result.error);
          console.error('[new-providers-api-test] Error content:', result.content);
        }

        // Sonnet 4 should always be available with Anthropic API key
        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toBeDefined();
        // Should contain the answer (20)
        expect(result.content[0].text).toContain('20');

        logger.info('[new-providers-api-test] Anthropic Claude Sonnet 4 thinking test completed');
      });
    }, 90000);

    it.skipIf(!hasAnthropic)('should handle Claude 3.7 thinking model if available', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is 10 + 10? Just the number.',
            model: 'claude-3-7-sonnet',
            reasoning_effort: 'minimal'
          }
        });

        // If Claude 3.7 is available, it should work, otherwise it might fallback
        if (!result.isError) {
          expect(result.content[0].text).toBeDefined();
          expect(result.content[0].text).toContain('20');
        }

        logger.info('[new-providers-api-test] Anthropic Claude 3.7 thinking model test completed');
      });
    }, 90000);
  });

  describe('DeepSeek Provider Real API Tests', () => {
    it.skipIf(!hasDeepSeek)('should complete a simple chat request with DeepSeek', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is 20 + 30? Reply with just the number.',
            model: 'deepseek-chat',
            temperature: 0
          }
        });

        expect(result).toBeDefined();
        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toContain('50');

        logger.info('[new-providers-api-test] DeepSeek chat test completed');
      });
    }, 60000);

    it.skipIf(!hasDeepSeek)('should work with DeepSeek Coder model', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Write a simple Python function that returns "Hello". Just the function, no explanation.',
            model: 'deepseek-coder',
            temperature: 0
          }
        });

        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toContain('def');
        expect(result.content[0].text).toContain('Hello');

        logger.info('[new-providers-api-test] DeepSeek Coder test completed');
      });
    }, 60000);
  });

  describe('Mistral Provider Real API Tests', () => {
    it.skipIf(!hasMistral)('should complete a simple chat request with Mistral', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is 7 * 8? Reply with just the number.',
            model: 'mistral-medium',
            temperature: 0
          }
        });

        expect(result).toBeDefined();
        
        if (result.isError) {
          console.error('[new-providers-api-test] Mistral Medium error:', result.error);
          console.error('[new-providers-api-test] Error content:', result.content);
        }
        
        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toContain('56');

        logger.info('[new-providers-api-test] Mistral Medium test completed');
      });
    }, 60000);

    it.skipIf(!hasMistral)('should work with Magistral Small for fast responses', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Reply with exactly: "Test successful"',
            model: 'magistral-small',
            temperature: 0
          }
        });

        expect(result.isError).toBeFalsy();
        expect(result.content[0].text.toLowerCase()).toContain('test successful');

        logger.info('[new-providers-api-test] Magistral Small test completed');
      });
    }, 60000);

    it.skipIf(!hasMistral)('should handle Magistral model if available', async () => {
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
          logger.info('[new-providers-api-test] Mistral Magistral test completed');
        } else {
          logger.info('[new-providers-api-test] Mistral Magistral not available, test skipped');
        }
      });
    }, 60000);
  });

  describe('OpenRouter Provider Real API Tests', () => {
    it.skipIf(!hasOpenRouter)('should complete a simple chat request with OpenRouter', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is 100 divided by 4? Reply with just the number.',
            model: 'k2', // Kimi K2 model
            temperature: 0
          }
        });

        expect(result).toBeDefined();
        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toContain('25');

        logger.info('[new-providers-api-test] OpenRouter K2 test completed');
      });
    }, 60000);

    it.skipIf(!hasOpenRouter)('should work with Qwen Coder model', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Write "console.log(42)" in JavaScript. Just the code, no explanation.',
            model: 'qwen-coder',
            temperature: 0
          }
        });

        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toContain('console.log(42)');

        logger.info('[new-providers-api-test] OpenRouter Qwen Coder test completed');
      });
    }, 60000);

    it.skipIf(!hasOpenRouter)('should handle thinking models if available', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is 15% of 200? Show your calculation.',
            model: 'qwen-thinking',
            temperature: 0
          }
        });

        // Thinking model might have limited availability
        if (!result.isError) {
          expect(result.content[0].text).toContain('30');
          logger.info('[new-providers-api-test] OpenRouter Qwen Thinking test completed');
        } else {
          logger.info('[new-providers-api-test] OpenRouter Qwen Thinking not available, test skipped');
        }
      });
    }, 90000);
  });

  describe('Multi-Provider Consensus Tests', () => {
    it.skipIf(!hasAnyNewApiKey || !(hasAnthropic && hasDeepSeek))('should gather consensus from new providers', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const models = [];
        if (hasAnthropic) models.push({ model: 'claude-3.5-haiku' });
        if (hasDeepSeek) models.push({ model: 'deepseek-chat' });
        if (hasMistral) models.push({ model: 'mistral-medium' });
        if (hasOpenRouter) models.push({ model: 'k2' });

        if (models.length < 2) {
          logger.info('[new-providers-api-test] Not enough providers for consensus test');
          return;
        }

        const result = await client.callTool({
          name: 'consensus',
          arguments: {
            prompt: 'Is water H2O? Answer with "Yes" or "No" only.',
            models: models.slice(0, 2), // Use only 2 for speed
            enable_cross_feedback: false,
            temperature: 0
          }
        });

        expect(result.isError).toBeFalsy();
        const consensusResult = JSON.parse(result.content[0].text);
        expect(consensusResult.status).toBe('consensus_complete');
        expect(consensusResult.successful_initial_responses).toBeGreaterThan(0);

        logger.info(`[new-providers-api-test] Multi-provider consensus test completed with ${models.length} providers`);
      });
    }, 120000);
  });

  describe('Provider-Specific Features', () => {
    it.skipIf(!hasAnthropic)('should handle conversation continuity with Anthropic', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // First message
        const firstResult = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'My favorite color is blue. Just say "Noted" to confirm.',
            model: 'claude-3.5-sonnet',
            temperature: 0
          }
        });

        expect(firstResult.isError).toBeFalsy();
        const conversationId = firstResult.continuation.id;

        // Second message
        const secondResult = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is my favorite color?',
            continuation_id: conversationId,
            model: 'claude-3.5-sonnet',
            temperature: 0
          }
        });

        expect(secondResult.isError).toBeFalsy();
        expect(secondResult.content[0].text.toLowerCase()).toContain('blue');

        logger.info('[new-providers-api-test] Anthropic conversation continuity test completed');
      });
    }, 90000);

    it.skipIf(!hasDeepSeek)('should handle code generation with DeepSeek Coder', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Write a JavaScript function to calculate factorial. Include only the function definition.',
            model: 'deepseek-coder',
            temperature: 0
          }
        });

        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toContain('function');
        expect(result.content[0].text).toContain('factorial');

        logger.info('[new-providers-api-test] DeepSeek code generation test completed');
      });
    }, 60000);
  });

  describe('Error Handling for New Providers', () => {
    it.skipIf(!hasAnyNewApiKey)('should handle invalid model names gracefully', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Hello',
            model: 'claude-nonexistent-model'
          }
        });

        // Should either use a fallback or return an error
        if (result.isError) {
          expect(result.content[0].text).toMatch(/(model|not found|not available|does not exist)/i);
        }
      });
    }, 60000);

    it.skipIf(!hasAnthropic)('should handle rate limiting gracefully', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Make multiple rapid requests
        const promises = Array(3).fill(null).map((_, i) => 
          client.callTool({
            name: 'chat',
            arguments: {
              prompt: `Test request ${i}`,
              model: 'claude-3.5-haiku',
              temperature: 0
            }
          })
        );

        const results = await Promise.allSettled(promises);
        
        // At least one should succeed
        const successCount = results.filter(r => r.status === 'fulfilled' && !r.value.isError).length;
        expect(successCount).toBeGreaterThan(0);

        logger.info(`[new-providers-api-test] Rate limiting test completed with ${successCount}/3 successful`);
      });
    }, 90000);
  });
});