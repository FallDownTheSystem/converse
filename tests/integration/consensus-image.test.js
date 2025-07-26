import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../src/config.js';
import { logger } from '../../src/utils/logger.js';

describe('Consensus Tool Image Processing', () => {
  // Check environment variables directly for skipIf conditions
  const hasOpenAI = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-'));
  const hasXAI = !!(process.env.XAI_API_KEY && process.env.XAI_API_KEY.startsWith('xai-'));
  const hasGoogle = !!(process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY.length > 20);
  const hasAnyApiKey = hasOpenAI || hasXAI || hasGoogle;

  beforeAll(() => {
    logger.info('[consensus-image-test] Test configuration', {
      hasOpenAI,
      hasXAI,
      hasGoogle,
      hasAnyApiKey
    });
  });

  it.skipIf(!hasOpenAI || !hasXAI || !hasGoogle)('should process image with all three providers', async () => {
    await withHTTPTestServer(async (client, manager) => {
      const result = await client.callTool({
        name: 'consensus',
        arguments: {
          prompt: 'What is shown in this image? Please describe what you see in one sentence.',
          models: [
            { model: 'gpt-4o-mini' },  // OpenAI
            { model: 'grok-4' },        // XAI
            { model: 'gemini-2.5-flash' } // Google
          ],
          images: ['test_image.png'],
          enable_cross_feedback: false, // Disable for faster test
          temperature: 0
        }
      });

      logger.info('[consensus-image-test] Consensus result', {
        isError: result.isError,
        status: result.content?.[0]?.text ? JSON.parse(result.content[0].text).status : 'unknown',
        models_consulted: result.content?.[0]?.text ? JSON.parse(result.content[0].text).models_consulted : 0
      });

      expect(result.isError).toBe(false);

      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe('consensus_complete');
      expect(response.models_consulted).toBe(3);
      expect(response.successful_initial_responses).toBe(3);

      // Check each provider's response
      const initialPhase = response.phases.initial;

      // OpenAI should describe the cat
      const openaiResponse = initialPhase.find(r => r.provider === 'openai');
      expect(openaiResponse).toBeTruthy();
      expect(openaiResponse.status).toBe('success');
      const openaiText = openaiResponse.response.toLowerCase();
      expect(openaiText).toMatch(/cat|feline|tabby|orange/);

      // XAI should also describe the cat (not request files)
      const xaiResponse = initialPhase.find(r => r.provider === 'xai');
      expect(xaiResponse).toBeTruthy();
      expect(xaiResponse.status).toBe('success');
      const xaiText = xaiResponse.response.toLowerCase();
      expect(xaiText).not.toContain('files_required');
      expect(xaiText).toMatch(/cat|feline|animal|pet/);

      // Google should describe the cat (not a woman with camera)
      const googleResponse = initialPhase.find(r => r.provider === 'google');
      expect(googleResponse).toBeTruthy();
      expect(googleResponse.status).toBe('success');
      const googleText = googleResponse.response.toLowerCase();
      expect(googleText).not.toContain('woman');
      // Allow "camera" if it's describing the cat looking at camera, not holding one
      if (googleText.includes('camera')) {
        expect(googleText).toMatch(/cat|feline|animal|pet/);
      } else {
        expect(googleText).toMatch(/cat|feline|animal|pet/);
      }

      logger.info('[consensus-image-test] All providers successfully processed the image');
    });
  }, 60000); // 60 second timeout for consensus with 3 providers

  it.skipIf(!hasAnyApiKey)('should handle image with any available provider', async () => {
    await withHTTPTestServer(async (client, manager) => {
      // Determine which provider to use based on available API keys
      let model;
      if (hasOpenAI) model = 'gpt-4o-mini';
      else if (hasXAI) model = 'grok-4';
      else if (hasGoogle) model = 'gemini-2.5-flash';

      const result = await client.callTool({
        name: 'chat',
        arguments: {
          prompt: 'What is shown in this image? Please describe what you see in one sentence.',
          images: ['test_image.png'],
          model,
          temperature: 0
        }
      });

      expect(result.isError).toBe(false);

      const responseText = result.content[0].text.toLowerCase();
      expect(responseText).toMatch(/cat|feline|tabby|orange|animal|pet/);

      logger.info('[consensus-image-test] Single provider handled image correctly', { model });
    });
  }, 30000);

  it.skipIf(!hasOpenAI)('should handle image with complex content array', async () => {
    await withHTTPTestServer(async (client, manager) => {
      // Test with just OpenAI to verify the message structure
      const result = await client.callTool({
        name: 'chat',
        arguments: {
          prompt: 'Describe this cat image briefly.',
          images: ['test_image.png'],
          model: 'gpt-4o-mini',
          temperature: 0
        }
      });

      expect(result.isError).toBe(false);

      const responseText = result.content[0].text.toLowerCase();
      expect(responseText).toMatch(/cat|feline|tabby|orange/);

      logger.info('[consensus-image-test] Chat tool handled image correctly');
    });
  }, 30000);
});
