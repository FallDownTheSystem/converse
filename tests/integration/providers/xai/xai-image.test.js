import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../../src/config.js';
import { logger } from '../../../../src/utils/logger.js';
import { 
  testWithApiKeys, 
  hasXAI,
  getSkipMessage 
} from '../../../utils/conditionalTest.js';

describe('XAI Image Processing Tests', () => {
  let config;

  beforeAll(async () => {
    try {
      config = await loadConfig();
      if (!hasXAI) {
        const skipMessage = getSkipMessage(['XAI']);
        logger.warn(`[xai-image-test] ${skipMessage}`);
      } else {
        logger.info(`[xai-image-test] Running XAI image tests`);
      }
    } catch (error) {
      logger.error('[xai-image-test] Setup failed:', error);
      config = { apiKeys: {} };
    }
  });

  describe('Grok-4 Image Processing', () => {
    testWithApiKeys({ 
      requiredProviders: ['XAI'],
      requireAll: true
    })('should process image with absolute path', async () => {
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

        logger.info('[xai-image-test] Grok-4 absolute path response', {
          isError: result.isError,
          responseLength: result.content?.[0]?.text?.length,
          responsePreview: result.content?.[0]?.text?.substring(0, 100)
        });

        expect(result.isError).toBe(false);
        const responseText = result.content[0].text.toLowerCase();

        // Check if Grok-4 actually received and processed the image
        expect(responseText).not.toContain('files_required');
        expect(responseText).not.toContain('provide the image');
        expect(responseText).not.toContain('upload the image');
        expect(responseText).not.toContain('send the image');
        expect(responseText).not.toContain('attach the image');
        expect(responseText).not.toContain('no image');
      });
    }, 60000);

    testWithApiKeys({ 
      requiredProviders: ['XAI'],
      requireAll: true
    })('should process base64 encoded image', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Small 1x1 red pixel PNG as base64
        const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What color is this image?',
            images: [base64Image],
            model: 'grok-4',
            temperature: 0
          }
        });

        logger.info('[xai-image-test] Grok-4 base64 response', {
          isError: result.isError,
          responsePreview: result.content?.[0]?.text?.substring(0, 100)
        });

        expect(result.isError).toBe(false);
        const responseText = result.content[0].text.toLowerCase();
        
        // Should recognize it's red or mention color
        expect(responseText).toMatch(/(red|color|pixel)/);
      });
    }, 60000);

    testWithApiKeys({ 
      requiredProviders: ['XAI'],
      requireAll: true
    })('should handle multiple images', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Two small 1x1 pixels - red and blue
        const redPixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
        const bluePixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'How many images do you see and what are their colors?',
            images: [redPixel, bluePixel],
            model: 'grok-4',
            temperature: 0.3
          }
        });

        expect(result.isError).toBe(false);
        const responseText = result.content[0].text.toLowerCase();
        
        // Should mention two images or multiple images
        expect(responseText).toMatch(/(two|2|multiple)/);
      });
    }, 60000);
  });

  describe('Image Processing with Text Conversations', () => {
    testWithApiKeys({ 
      requiredProviders: ['XAI'],
      requireAll: true
    })('should maintain conversation context with images', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // First message with image
        const redPixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
        
        const firstResult = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Remember this image color. Just say "Remembered" to confirm.',
            images: [redPixel],
            model: 'grok-4',
            temperature: 0
          }
        });

        expect(firstResult.isError).toBe(false);
        const conversationId = firstResult.continuation.id;

        // Second message without image
        const secondResult = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What color was the image I showed you?',
            continuation_id: conversationId,
            model: 'grok-4',
            temperature: 0
          }
        });

        expect(secondResult.isError).toBe(false);
        expect(secondResult.content[0].text.toLowerCase()).toContain('red');

        logger.info('[xai-image-test] Conversation with image context completed');
      });
    }, 120000);
  });
});