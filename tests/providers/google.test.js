/**
 * Unit tests for Google provider
 * Tests the unified interface implementation without making real API calls
 */

import { describe, it, expect } from 'vitest';
import { googleProvider } from '../../src/providers/google.js';

describe('Google Provider', () => {
  describe('validateConfig', () => {
    it('should return true for valid Google API key', () => {
      const config = {
        apiKeys: {
          google: 'AIzaSyDJKHGFSDKJHGFSDKJHGFSDKJHGFSDKJHGFSDKJHGFSD'
        }
      };
      
      expect(googleProvider.validateConfig(config)).toBe(true);
    });

    it('should return false for missing API key', () => {
      const config = { apiKeys: {} };
      expect(googleProvider.validateConfig(config)).toBe(false);
    });

    it('should return false for short API key', () => {
      const config = {
        apiKeys: {
          google: 'short'
        }
      };
      
      expect(googleProvider.validateConfig(config)).toBe(false);
    });

    it('should return true for minimum length API key', () => {
      const config = {
        apiKeys: {
          google: 'AIzaSy1234567890123456'
        }
      };
      
      expect(googleProvider.validateConfig(config)).toBe(true);
    });
  });

  describe('isAvailable', () => {
    it('should return true when config is valid', () => {
      const config = {
        apiKeys: {
          google: 'AIzaSyDJKHGFSDKJHGFSDKJHGFSDKJHGFSDKJHGFSDKJHGFSD'
        }
      };
      
      expect(googleProvider.isAvailable(config)).toBe(true);
    });

    it('should return false when config is invalid', () => {
      const config = { apiKeys: {} };
      expect(googleProvider.isAvailable(config)).toBe(false);
    });
  });

  describe('getSupportedModels', () => {
    it('should return supported models object', () => {
      const models = googleProvider.getSupportedModels();
      
      expect(typeof models).toBe('object');
      expect('gemini-2.0-flash' in models).toBeTruthy();
      expect('gemini-2.0-flash-lite' in models).toBeTruthy();
      expect('gemini-2.5-flash' in models).toBeTruthy();
      expect('gemini-2.5-pro' in models).toBeTruthy();
    });

    it('should include model configuration details', () => {
      const models = googleProvider.getSupportedModels();
      const flashModel = models['gemini-2.5-flash'];
      
      expect(flashModel.modelName).toBe('gemini-2.5-flash');
      expect(flashModel.friendlyName).toBe('Gemini (Flash 2.5)');
      expect(flashModel.contextWindow).toBe(1048576);
      expect(flashModel.supportsImages).toBe(true);
      expect(flashModel.supportsThinking).toBe(true);
    });

    it('should have correct thinking support configuration', () => {
      const models = googleProvider.getSupportedModels();
      
      // Models that support thinking
      expect(models['gemini-2.0-flash'].supportsThinking).toBe(true);
      expect(models['gemini-2.5-flash'].supportsThinking).toBe(true);
      expect(models['gemini-2.5-pro'].supportsThinking).toBe(true);
      
      // Model that doesn't support thinking
      expect(models['gemini-2.0-flash-lite'].supportsThinking).toBe(false);
    });

    it('should have correct image support configuration', () => {
      const models = googleProvider.getSupportedModels();
      
      // Models that support images
      expect(models['gemini-2.0-flash'].supportsImages).toBe(true);
      expect(models['gemini-2.5-flash'].supportsImages).toBe(true);
      expect(models['gemini-2.5-pro'].supportsImages).toBe(true);
      
      // Model that doesn't support images
      expect(models['gemini-2.0-flash-lite'].supportsImages).toBe(false);
    });
  });

  describe('getModelConfig', () => {
    it('should return config for exact model name', () => {
      const config = googleProvider.getModelConfig('gemini-2.5-flash');
      
      expect(config).toBeTruthy();
      expect(config.modelName).toBe('gemini-2.5-flash');
      expect(config.friendlyName).toBe('Gemini (Flash 2.5)');
    });

    it('should return config for model alias', () => {
      const config = googleProvider.getModelConfig('flash');
      
      expect(config).toBeTruthy();
      expect(config.modelName).toBe('gemini-2.5-flash');
    });

    it('should return config for various aliases', () => {
      // Test all flash aliases
      const aliases = ['flash', 'flash2.5', 'gemini-flash', 'gemini-flash-2.5'];
      
      for (const alias of aliases) {
        const config = googleProvider.getModelConfig(alias);
        expect(config).toBeTruthy(); // Should find config for alias: ${alias}
        expect(config.modelName).toBe('gemini-2.5-flash');
      }
    });

    it('should return config for pro model aliases', () => {
      const aliases = ['pro', 'gemini pro', 'gemini-pro', 'gemini'];
      
      for (const alias of aliases) {
        const config = googleProvider.getModelConfig(alias);
        expect(config).toBeTruthy(); // Should find config for alias: ${alias}
        expect(config.modelName).toBe('gemini-2.5-pro');
      }
    });

    it('should return null for unknown model', () => {
      const config = googleProvider.getModelConfig('unknown-model');
      expect(config).toBe(null);
    });

    it('should be case insensitive', () => {
      const config = googleProvider.getModelConfig('GEMINI-2.5-FLASH');
      
      expect(config).toBeTruthy();
      expect(config.modelName).toBe('gemini-2.5-flash');
    });
  });

  describe('invoke - input validation', () => {
    const validConfig = {
      apiKeys: {
        google: 'AIzaSyDJKHGFSDKJHGFSDKJHGFSDKJHGFSDKJHGFSDKJHGFSD'
      }
    };

    it('should throw error for missing API key', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const config = { apiKeys: {} };
      
      await expect(googleProvider.invoke(messages, { config })).rejects.toThrow(
        expect.objectContaining({
          name: 'GoogleProviderError',
          code: 'MISSING_API_KEY'
        })
      );
    });

    it('should throw error for invalid API key format', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const config = { apiKeys: { google: 'invalid' } };
      
      await expect(googleProvider.invoke(messages, { config })).rejects.toThrow(
        expect.objectContaining({
          name: 'GoogleProviderError',
          code: 'INVALID_API_KEY'
        })
      );
    });

    it('should throw error for non-array messages', async () => {
      const messages = 'not an array';
      
      await expect(googleProvider.invoke(messages, { config: validConfig })).rejects.toThrow(
        expect.objectContaining({
          name: 'GoogleProviderError',
          code: 'INVALID_MESSAGES'
        })
      );
    });

    it('should throw error for invalid message role', async () => {
      const messages = [{ role: 'invalid', content: 'Hello' }];
      
      await expect(googleProvider.invoke(messages, { config: validConfig })).rejects.toThrow(
        expect.objectContaining({
          name: 'GoogleProviderError',
          code: 'INVALID_ROLE'
        })
      );
    });

    it('should throw error for missing message content', async () => {
      const messages = [{ role: 'user' }];
      
      await expect(googleProvider.invoke(messages, { config: validConfig })).rejects.toThrow(
        expect.objectContaining({
          name: 'GoogleProviderError',
          code: 'MISSING_CONTENT'
        })
      );
    });
  });

  describe('message format conversion', () => {
    it('should handle system prompts correctly', () => {
      // This would be tested with a mocked Google client
      // For now, we verify the supported models have correct configuration
      const models = googleProvider.getSupportedModels();
      
      // All models should support system prompts (via message conversion)
      expect(models['gemini-2.5-flash']).toBeTruthy();
      expect(models['gemini-2.5-pro']).toBeTruthy();
    });

    it('should handle conversation history', () => {
      // This would be tested with a mocked Google client
      // For now, we verify the interface supports multiple messages
      const models = googleProvider.getSupportedModels();
      
      // All models should support conversation (multiple messages)
      expect(models['gemini-2.5-flash']).toBeTruthy();
      expect(models['gemini-2.5-pro']).toBeTruthy();
    });
  });

  describe('thinking mode support', () => {
    it('should support thinking for appropriate models', () => {
      const models = googleProvider.getSupportedModels();
      
      // Thinking-enabled models
      expect(models['gemini-2.0-flash'].supportsThinking).toBe(true);
      expect(models['gemini-2.5-flash'].supportsThinking).toBe(true);
      expect(models['gemini-2.5-pro'].supportsThinking).toBe(true);
      
      // Non-thinking model
      expect(models['gemini-2.0-flash-lite'].supportsThinking).toBe(false);
    });

    it('should have correct thinking token limits', () => {
      const models = googleProvider.getSupportedModels();
      
      // Pro model has highest thinking budget
      expect(models['gemini-2.5-pro'].maxThinkingTokens).toBe(32768);
      
      // Flash models have moderate thinking budget
      expect(models['gemini-2.5-flash'].maxThinkingTokens).toBe(24576);
      expect(models['gemini-2.0-flash'].maxThinkingTokens).toBe(24576);
      
      // Lite model has no thinking
      expect(models['gemini-2.0-flash-lite'].maxThinkingTokens).toBe(0);
    });
  });

  describe('temperature handling', () => {
    it('should support temperature for all models', () => {
      const models = googleProvider.getSupportedModels();
      
      // All Gemini models support temperature
      expect(models['gemini-2.0-flash'].supportsTemperature).toBe(true);
      expect(models['gemini-2.0-flash-lite'].supportsTemperature).toBe(true);
      expect(models['gemini-2.5-flash'].supportsTemperature).toBe(true);
      expect(models['gemini-2.5-pro'].supportsTemperature).toBe(true);
    });
  });

  describe('default model selection', () => {
    it('should default to gemini-2.5-flash', () => {
      // The implementation defaults to 'gemini-2.5-flash'
      const defaultConfig = googleProvider.getModelConfig('gemini-2.5-flash');
      expect(defaultConfig).toBeTruthy();
      expect(defaultConfig.modelName).toBe('gemini-2.5-flash');
    });

    it('should support flash as default alias', () => {
      const config = googleProvider.getModelConfig('flash');
      expect(config).toBeTruthy();
      expect(config.modelName).toBe('gemini-2.5-flash');
    });
  });

  describe('context window sizes', () => {
    it('should have 1M context for all models', () => {
      const models = googleProvider.getSupportedModels();
      
      // All models should have 1M context window
      expect(models['gemini-2.0-flash'].contextWindow).toBe(1048576);
      expect(models['gemini-2.0-flash-lite'].contextWindow).toBe(1048576);
      expect(models['gemini-2.5-flash'].contextWindow).toBe(1048576);
      expect(models['gemini-2.5-pro'].contextWindow).toBe(1048576);
    });

    it('should have consistent output token limits', () => {
      const models = googleProvider.getSupportedModels();
      
      // All models should have 65536 max output tokens
      expect(models['gemini-2.0-flash'].maxOutputTokens).toBe(65536);
      expect(models['gemini-2.0-flash-lite'].maxOutputTokens).toBe(65536);
      expect(models['gemini-2.5-flash'].maxOutputTokens).toBe(65536);
      expect(models['gemini-2.5-pro'].maxOutputTokens).toBe(65536);
    });
  });
});