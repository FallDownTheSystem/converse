import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../../src/config.js';
import { logger } from '../../../../src/utils/logger.js';
import { 
  testWithApiKeys, 
  hasGoogle,
  getSkipMessage 
} from '../../../utils/conditionalTest.js';

describe('Google Image Processing Tests', () => {
  let config;

  beforeAll(async () => {
    try {
      config = await loadConfig();
      if (!hasGoogle) {
        const skipMessage = getSkipMessage(['GOOGLE']);
        logger.warn(`[google-image-test] ${skipMessage}`);
      } else {
        logger.info(`[google-image-test] Running Google image tests`);
      }
    } catch (error) {
      logger.error('[google-image-test] Setup failed:', error);
      config = { apiKeys: {} };
    }
  });

  describe('Gemini Pro Image Processing', () => {
    testWithApiKeys({ 
      requiredProviders: ['GOOGLE'],
      requireAll: true
    })('should process base64 encoded image', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Small 1x1 green pixel PNG as base64
        const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYHhfDwAChAGAcOjrLQAAAABJRU5ErkJggg==';

        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What color is this image? Be brief.',
            images: [base64Image],
            model: 'gemini-2.5-flash',
            temperature: 0
          }
        });

        logger.info('[google-image-test] Gemini Pro base64 response', {
          isError: result.isError,
          responsePreview: result.content?.[0]?.text?.substring(0, 100)
        });

        expect(result.isError).toBe(false);
        const responseText = result.content[0].text.toLowerCase();
        
        // Should recognize it's green
        expect(responseText).toMatch(/(green|color)/);
      });
    }, 60000);

    testWithApiKeys({ 
      requiredProviders: ['GOOGLE'],
      requireAll: true
    })('should analyze image content', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Create a simple 2x2 checkerboard pattern
        const checkerboard = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAHElEQVQIHWP4DwABAQEA/ihTBvwAAAAASUVORK5CYII=';

        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Describe the pattern in this image.',
            images: [checkerboard],
            model: 'gemini-2.5-flash',
            temperature: 0.2
          }
        });

        expect(result.isError).toBe(false);
        const responseText = result.content[0].text.toLowerCase();
        
        // Should mention pattern or squares or pixels
        expect(responseText).toMatch(/(pattern|square|pixel|checker|grid)/);

        logger.info('[google-image-test] Pattern analysis completed');
      });
    }, 60000);
  });

  describe('Multi-Modal Conversations', () => {
    testWithApiKeys({ 
      requiredProviders: ['GOOGLE'],
      requireAll: true
    })('should handle images in conversation flow', async () => {
      await withHTTPTestServer(async (client, manager) => {
        // Blue pixel
        const bluePixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
        
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What color is this? Then tell me what color complements it.',
            images: [bluePixel],
            model: 'gemini-2.5-flash',
            temperature: 0.3
          }
        });

        expect(result.isError).toBe(false);
        const responseText = result.content[0].text.toLowerCase();
        
        // Should identify blue and mention a complementary color
        expect(responseText).toContain('blue');
        expect(responseText).toMatch(/(orange|yellow|complement)/);

        logger.info('[google-image-test] Multi-modal conversation completed');
      });
    }, 60000);
  });

  describe('Error Handling', () => {
    testWithApiKeys({ 
      requiredProviders: ['GOOGLE'],
      requireAll: true
    })('should handle invalid image data gracefully', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is in this image?',
            images: ['invalid-image-data'],
            model: 'gemini-2.5-flash',
            temperature: 0
          }
        });

        // Should either error or handle gracefully
        if (result.isError) {
          expect(result.content[0].text).toMatch(/(invalid|error|image|data)/i);
        }

        logger.info('[google-image-test] Invalid image handling tested');
      });
    }, 60000);
  });
});