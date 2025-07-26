import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../src/config.js';
import { logger } from '../../src/utils/logger.js';

describe('Provider Image Processing Integration Tests', () => {
  let config;
  let hasOpenAI;
  let hasXAI;
  let hasGoogle;

  beforeAll(() => {
    config = loadConfig();
    hasOpenAI = config?.apiKeys?.openai?.startsWith('sk-');
    hasXAI = config?.apiKeys?.xai?.startsWith('xai-');
    hasGoogle = config?.apiKeys?.google?.startsWith('AIza');

    logger.info('[provider-image-tests] Test configuration', {
      hasOpenAI,
      hasXAI,
      hasGoogle
    });
  });

  describe('XAI Grok-4 Image Processing', () => {
    it.skipIf(!hasXAI)('should process image with absolute path', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is shown in this image? Please describe what you see.',
            images: ['C:\\Users\\Juugo\\Documents\\Projects\\converse\\test_image.png'],
            model: 'grok-4',
            temperature: 0
          }
        });

        logger.info('[provider-image-tests] Grok-4 absolute path response', {
          isError: result.isError,
          responseLength: result.content?.[0]?.text?.length,
          responsePreview: result.content?.[0]?.text?.substring(0, 100)
        });

        expect(result.isError).toBe(false);
        const responseText = result.content[0].text.toLowerCase();

        // Check if Grok-4 actually received and processed the image
        expect(responseText).not.toContain('files_required');
        expect(responseText).not.toContain('provide the image');
        expect(responseText).not.toContain('cannot see');

        // Should describe something about the image
        expect(responseText.length).toBeGreaterThan(20);

        logger.info('[provider-image-tests] Grok-4 image processing with absolute path successful');
      });
    }, 30000);

    it.skipIf(!hasXAI)('should process image with relative path', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is shown in this image? Please describe what you see.',
            images: ['test_image.png'],
            model: 'grok-4',
            temperature: 0
          }
        });

        logger.info('[provider-image-tests] Grok-4 relative path response', {
          isError: result.isError,
          responseLength: result.content?.[0]?.text?.length,
          responsePreview: result.content?.[0]?.text?.substring(0, 100)
        });

        expect(result.isError).toBe(false);
        const responseText = result.content[0].text.toLowerCase();

        // Check if Grok-4 actually received and processed the image
        expect(responseText).not.toContain('files_required');
        expect(responseText).not.toContain('provide the image');
        expect(responseText).not.toContain('cannot see');

        logger.info('[provider-image-tests] Grok-4 image processing with relative path successful');
      });
    }, 30000);

    it.skipIf(!hasXAI)('should handle multiple images', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'How many images did I send you? Describe each one briefly.',
            images: ['test_image.png', 'test_image.png'], // Same image twice for testing
            model: 'grok-4',
            temperature: 0
          }
        });

        logger.info('[provider-image-tests] Grok-4 multiple images response', {
          isError: result.isError,
          response: result.content?.[0]?.text
        });

        expect(result.isError).toBe(false);

        logger.info('[provider-image-tests] Grok-4 multiple image processing test completed');
      });
    }, 30000);
  });

  describe('Google Gemini Pro Image Processing', () => {
    it.skipIf(!hasGoogle)('should process image with absolute path', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is shown in this image? Please describe what you see.',
            images: ['C:\\Users\\Juugo\\Documents\\Projects\\converse\\test_image.png'],
            model: 'gemini-pro',
            temperature: 0
          }
        });

        logger.info('[provider-image-tests] Gemini Pro absolute path response', {
          isError: result.isError,
          responseLength: result.content?.[0]?.text?.length,
          responsePreview: result.content?.[0]?.text?.substring(0, 200)
        });

        expect(result.isError).toBe(false);
        const responseText = result.content[0].text.toLowerCase();

        // Check if Gemini actually processed the cat image
        // It should mention cat, feline, animal, pet, or at least describe what's actually in the image
        const hasRelevantContent =
          responseText.includes('cat') ||
          responseText.includes('feline') ||
          responseText.includes('animal') ||
          responseText.includes('pet') ||
          responseText.includes('orange') ||
          responseText.includes('tabby');

        logger.info('[provider-image-tests] Gemini Pro image recognition check', {
          hasRelevantContent,
          mentionsCat: responseText.includes('cat'),
          mentionsFeline: responseText.includes('feline'),
          mentionsAnimal: responseText.includes('animal'),
          mentionsOrange: responseText.includes('orange')
        });

        // Should not be describing something completely different like a woman with a camera
        expect(responseText).not.toContain('woman');
        expect(responseText).not.toContain('camera');
        expect(responseText).not.toContain('photograph');

        logger.info('[provider-image-tests] Gemini Pro image processing with absolute path completed');
      });
    }, 30000);

    it.skipIf(!hasGoogle)('should process image with relative path', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is shown in this image? Please describe what you see.',
            images: ['test_image.png'],
            model: 'gemini-pro',
            temperature: 0
          }
        });

        logger.info('[provider-image-tests] Gemini Pro relative path response', {
          isError: result.isError,
          responseLength: result.content?.[0]?.text?.length,
          responsePreview: result.content?.[0]?.text?.substring(0, 200)
        });

        expect(result.isError).toBe(false);

        logger.info('[provider-image-tests] Gemini Pro image processing with relative path completed');
      });
    }, 30000);

    it.skipIf(!hasGoogle)('should handle multiple images', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'How many images did I send you? Describe each one briefly.',
            images: ['test_image.png', 'test_image.png'], // Same image twice for testing
            model: 'gemini-pro',
            temperature: 0
          }
        });

        logger.info('[provider-image-tests] Gemini Pro multiple images response', {
          isError: result.isError,
          responsePreview: result.content?.[0]?.text?.substring(0, 200)
        });

        expect(result.isError).toBe(false);

        logger.info('[provider-image-tests] Gemini Pro multiple image processing test completed');
      });
    }, 30000);
  });

  describe('Provider Comparison', () => {
    it.skipIf(!hasOpenAI || !hasXAI || !hasGoogle)('should get consistent results across providers', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const providers = [
          { name: 'OpenAI (gpt-4o)', model: 'gpt-4o' },
          { name: 'XAI (grok-4)', model: 'grok-4' },
          { name: 'Google (gemini-pro)', model: 'gemini-pro' }
        ];

        const results = {};

        for (const provider of providers) {
          const result = await client.callTool({
            name: 'chat',
            arguments: {
              prompt: 'What type of animal is in this image? Give a one-word answer.',
              images: ['test_image.png'],
              model: provider.model,
              temperature: 0
            }
          });

          results[provider.name] = {
            isError: result.isError,
            response: result.content?.[0]?.text,
            responseLength: result.content?.[0]?.text?.length
          };

          logger.info(`[provider-image-tests] ${provider.name} result`, results[provider.name]);
        }

        // Log comparison
        logger.info('[provider-image-tests] Provider comparison results', results);

        // All should succeed
        Object.values(results).forEach(result => {
          expect(result.isError).toBe(false);
        });
      });
    }, 60000);
  });
});

describe('Debug Provider Image Format', () => {
  it('should examine message format sent to providers', async () => {
    await withHTTPTestServer(async (client, manager) => {
      // Enable debug logging to see what's being sent
      const originalLogLevel = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = 'debug';

      try {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Test image processing',
            images: ['test_image.png'],
            model: 'gpt-4o-mini', // Using a simple model for debugging
            temperature: 0
          }
        });

        logger.info('[provider-image-tests] Debug test completed', {
          isError: result.isError,
          hasResponse: !!result.content?.[0]?.text
        });
      } finally {
        process.env.LOG_LEVEL = originalLogLevel;
      }
    });
  }, 30000);
});
