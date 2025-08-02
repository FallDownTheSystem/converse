import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../../src/config.js';
import { logger } from '../../../../src/utils/logger.js';
import {
  testWithApiKeys,
  hasXAI,
  getSkipMessage
} from '../../../utils/conditionalTest.js';
import { promises as fs } from 'fs';
import { join } from 'path';

// Helper function from XAI docs
async function getBase64(filePath) {
    try {
        const buffer = await fs.readFile(filePath);
        let base64 = buffer.toString("base64");
        while (base64.length % 4 > 0) {
            base64 += "=";
        }
        return base64;
    } catch (error) {
        throw error;
    }
}

describe('XAI Image Processing Tests', () => {
  let config;

  beforeAll(async () => {
    try {
      config = await loadConfig();
      if (!hasXAI) {
        const skipMessage = getSkipMessage(['XAI']);
        logger.warn(`[xai-image-test] ${skipMessage}`);
      } else {
        logger.info('[xai-image-test] Running XAI image tests');
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
    }, 120000);

    testWithApiKeys({
      requiredProviders: ['XAI'],
      requireAll: true
    })('should process base64 encoded image', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Read the fruits.png image and convert to base64
        const imagePath = join(process.cwd(), 'fruits.png');
        const base64_image = await getBase64(imagePath);
        const base64Image = `data:image/png;base64,${base64_image}`;

        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What do you see in this image? Just give a brief description.',
            images: [base64Image],
            model: 'grok-4',
            temperature: 0
          }
        });

        logger.info('[xai-image-test] Grok-4 base64 response', {
          isError: result.isError,
          responsePreview: result.content?.[0]?.text?.substring(0, 100)
        });

        if (result.isError) {
          console.error('[xai-image-test] Base64 test error:', result.content[0].text);
          console.error('[xai-image-test] Full result:', JSON.stringify(result, null, 2));
        }
        expect(result.isError).toBe(false);
        const responseText = result.content[0].text.toLowerCase();

        // Should recognize fruits in the image (grapes, apples)
        expect(responseText).toMatch(/(fruit|apple|grape|food|produce|vegetable)/);
      });
    }, 120000);

    testWithApiKeys({
      requiredProviders: ['XAI'],
      requireAll: true
    })('should handle multiple images', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Read both fruits.png and tulips.png
        const fruitsPath = join(process.cwd(), 'fruits.png');
        const tulipsPath = join(process.cwd(), 'tulips.png');
        
        const fruitsBase64Data = await getBase64(fruitsPath);
        const tulipsBase64Data = await getBase64(tulipsPath);
        
        const fruitsBase64 = `data:image/png;base64,${fruitsBase64Data}`;
        const tulipsBase64 = `data:image/png;base64,${tulipsBase64Data}`;

        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'How many images do you see? Briefly describe each one.',
            images: [fruitsBase64, tulipsBase64],
            model: 'grok-4',
            temperature: 0.3
          }
        });

        expect(result.isError).toBe(false);
        const responseText = result.content[0].text.toLowerCase();

        // Should mention two images and describe fruits and flowers
        expect(responseText).toMatch(/(two|2|both)/);
        expect(responseText).toMatch(/(fruit|tulip|flower)/);
      });
    }, 120000);
  });

  describe('Image Processing with Text Conversations', () => {
    testWithApiKeys({
      requiredProviders: ['XAI'],
      requireAll: true
    })('should maintain conversation context with images', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // First message with baboon image
        const baboonPath = join(process.cwd(), 'baboon.png');
        const baboonBase64Data = await getBase64(baboonPath);
        const baboonBase64 = `data:image/png;base64,${baboonBase64Data}`;

        const firstResult = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What animal is in this image? Remember it for our next interaction.',
            images: [baboonBase64],
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
            prompt: 'What animal did I just show you?',
            continuation_id: conversationId,
            model: 'grok-4',
            temperature: 0
          }
        });

        expect(secondResult.isError).toBe(false);
        expect(secondResult.content[0].text.toLowerCase()).toMatch(/(baboon|monkey|primate|mandrill)/);

        logger.info('[xai-image-test] Conversation with image context completed');
      });
    }, 120000);
  });
});
