import { describe, it, expect } from 'vitest';
import { withHTTPTestServer } from '../../utils/HTTPMCPServerManager.js';
import { logger } from '../../../src/utils/logger.js';
import {
  testWithApiKeys,
  hasOpenAI,
  hasXAI,
  hasGoogle,
  hasAnyMainProvider,
} from '../../utils/conditionalTest.js';

describe('Debug Provider Message Format', () => {
  testWithApiKeys({
    requiredProviders: ['OPENAI', 'XAI', 'GOOGLE'],
  })(
    'should examine message format sent to providers',
    async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Enable debug logging to see what's being sent
        const originalLogLevel = process.env.LOG_LEVEL;
        process.env.LOG_LEVEL = 'debug';

        try {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'Test message format',
              images: ['test_image.png'],
              model: 'auto', // Use first available provider
              temperature: 0,
            },
          });

          logger.info('[debug-tests] Debug test completed', {
            isError: result.isError,
            hasResponse: !!result.content?.[0]?.text,
            provider: result.provider || 'unknown',
          });

          // The test passes if we get any response or error
          // The main purpose is to examine the debug logs
          expect(result).toBeDefined();
        } finally {
          // Restore original log level
          process.env.LOG_LEVEL = originalLogLevel;
        }
      });
    },
    30000,
  );

  testWithApiKeys({
    requiredProviders: ['OPENAI', 'XAI', 'GOOGLE'],
  })(
    'should verify provider message structure for images',
    async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Test with base64 image to ensure proper formatting
        const base64Image =
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

        const providers = [];
        if (hasOpenAI) providers.push({ name: 'OpenAI', model: 'gpt-4o-mini' });
        if (hasXAI) providers.push({ name: 'XAI', model: 'grok-4' });
        if (hasGoogle)
          providers.push({ name: 'Google', model: 'gemini-2.5-flash' });

        for (const provider of providers) {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'What color is this pixel?',
              images: [base64Image],
              model: provider.model,
              temperature: 0,
            },
          });

          logger.info(`[debug-tests] ${provider.name} image format test`, {
            isError: result.isError,
            responseLength: result.content?.[0]?.text?.length,
            errorMessage: result.isError ? result.content?.[0]?.text : null,
          });

          // Each provider should either process the image or error appropriately
          expect(result).toBeDefined();

          if (!result.isError) {
            // If successful, response should mention color
            const response = result.content[0].text.toLowerCase();
            expect(response).toMatch(/(color|red|pixel|image)/);
          }
        }
      });
    },
    60000,
  );

  testWithApiKeys({
    requiredProviders: ['OPENAI', 'XAI', 'GOOGLE'],
  })(
    'should examine consensus message format',
    async () => {
      await withHTTPTestServer(async (client, manager) => {
        const models = [];
        if (hasOpenAI) models.push({ model: 'gpt-4o-mini' });
        if (hasXAI) models.push({ model: 'grok' });
        if (hasGoogle) models.push({ model: 'flash' });

        if (models.length < 2) {
          logger.info(
            '[debug-tests] Not enough providers for consensus debug test',
          );
          return;
        }

        // Enable debug for consensus
        const originalLogLevel = process.env.LOG_LEVEL;
        process.env.LOG_LEVEL = 'debug';

        try {
          const result = await client.callTool({
            name: 'consensus',
            arguments: {
              prompt: 'Debug consensus format test',
              models,
              enable_cross_feedback: false,
              temperature: 0,
            },
          });

          logger.info('[debug-tests] Consensus debug test completed', {
            isError: result.isError,
            modelsConsulted: result.content?.[0]?.text
              ? JSON.parse(result.content[0].text).models_consulted
              : 0,
          });

          expect(result).toBeDefined();
          if (!result.isError) {
            const consensusResult = JSON.parse(result.content[0].text);
            expect(consensusResult.status).toBe('consensus_complete');
          }
        } finally {
          process.env.LOG_LEVEL = originalLogLevel;
        }
      });
    },
    90000,
  );
});
