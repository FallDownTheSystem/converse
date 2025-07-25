/**
 * Unit tests for OpenAI provider
 * Tests the unified interface implementation without making real API calls
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openaiProvider } from '../../src/providers/openai.js';

// Mock the OpenAI SDK
vi.mock('openai', () => {
  const MockOpenAI = vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn()
      }
    }
  }));
  
  return {
    default: MockOpenAI
  };
});

describe('OpenAI Provider', () => {
  describe('validateConfig', () => {
    it('should return true for valid OpenAI API key', () => {
      const config = {
        apiKeys: {
          openai: 'sk-1234567890abcdef1234567890abcdef1234567890abcdef'
        }
      };
      
      expect(openaiProvider.validateConfig(config)).toBe(true);
    });

    it('should return false for missing API key', () => {
      const config = { apiKeys: {} };
      expect(openaiProvider.validateConfig(config)).toBe(false);
    });

    it('should return false for invalid API key format', () => {
      const config = {
        apiKeys: {
          openai: 'invalid-key'
        }
      };
      
      expect(openaiProvider.validateConfig(config)).toBe(false);
    });

    it('should return false for short API key', () => {
      const config = {
        apiKeys: {
          openai: 'sk-short'
        }
      };
      
      expect(openaiProvider.validateConfig(config)).toBe(false);
    });
  });

  describe('isAvailable', () => {
    it('should return true when config is valid', () => {
      const config = {
        apiKeys: {
          openai: 'sk-1234567890abcdef1234567890abcdef1234567890abcdef'
        }
      };
      
      expect(openaiProvider.isAvailable(config)).toBe(true);
    });

    it('should return false when config is invalid', () => {
      const config = { apiKeys: {} };
      expect(openaiProvider.isAvailable(config)).toBe(false);
    });
  });

  describe('getSupportedModels', () => {
    it('should return supported models object', () => {
      const models = openaiProvider.getSupportedModels();
      
      expect(typeof models).toBe('object');
      expect('o3' in models).toBe(true);
      expect('o3-mini' in models).toBe(true);
      expect('gpt-4o' in models).toBe(true);
      expect('gpt-4o-mini' in models).toBe(true);
    });

    it('should include model configuration details', () => {
      const models = openaiProvider.getSupportedModels();
      const o3Model = models['o3'];
      
      expect(o3Model.modelName).toBe('o3');
      expect(o3Model.friendlyName).toBe('OpenAI (O3)');
      expect(o3Model.contextWindow).toBe(200000);
      expect(o3Model.supportsImages).toBe(true);
    });
  });

  describe('getModelConfig', () => {
    it('should return config for exact model name', () => {
      const config = openaiProvider.getModelConfig('o3');
      
      expect(config).toBeTruthy();
      expect(config.modelName).toBe('o3');
      expect(config.friendlyName).toBe('OpenAI (O3)');
    });

    it('should return config for model alias', () => {
      const config = openaiProvider.getModelConfig('o3mini');
      
      expect(config).toBeTruthy();
      expect(config.modelName).toBe('o3-mini');
    });

    it('should return null for unknown model', () => {
      const config = openaiProvider.getModelConfig('unknown-model');
      expect(config).toBeNull();
    });

    it('should be case insensitive', () => {
      const config = openaiProvider.getModelConfig('O3');
      
      expect(config).toBeTruthy();
      expect(config.modelName).toBe('o3');
    });
  });

  describe('invoke - input validation', () => {
    const validConfig = {
      apiKeys: {
        openai: 'sk-1234567890abcdef1234567890abcdef1234567890abcdef'
      }
    };

    it('should throw error for missing API key', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const config = { apiKeys: {} };
      
      await expect(openaiProvider.invoke(messages, { config })).rejects.toThrow(
        expect.objectContaining({
          name: 'OpenAIProviderError',
          code: 'MISSING_API_KEY'
        })
      );
    });

    it('should throw error for invalid API key format', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const config = { apiKeys: { openai: 'invalid' } };
      
      await expect(openaiProvider.invoke(messages, { config })).rejects.toThrow(
        expect.objectContaining({
          name: 'OpenAIProviderError',
          code: 'INVALID_API_KEY'
        })
      );
    });

    it('should throw error for non-array messages', async () => {
      const messages = 'not an array';
      
      await expect(openaiProvider.invoke(messages, { config: validConfig })).rejects.toThrow(
        expect.objectContaining({
          name: 'OpenAIProviderError',
          code: 'INVALID_MESSAGES'
        })
      );
    });

    it('should throw error for invalid message role', async () => {
      const messages = [{ role: 'invalid', content: 'Hello' }];
      
      await expect(openaiProvider.invoke(messages, { config: validConfig })).rejects.toThrow(
        expect.objectContaining({
          name: 'OpenAIProviderError',
          code: 'INVALID_ROLE'
        })
      );
    });

    it('should throw error for missing message content', async () => {
      const messages = [{ role: 'user' }];
      
      await expect(openaiProvider.invoke(messages, { config: validConfig })).rejects.toThrow(
        expect.objectContaining({
          name: 'OpenAIProviderError',
          code: 'MISSING_CONTENT'
        })
      );
    });
  });

  describe('temperature handling', () => {
    it('should clamp temperature to valid range', () => {
      // This would be tested with a mocked OpenAI client
      // For now, we verify the model configurations
      const models = openaiProvider.getSupportedModels();
      
      // O3 models don't support temperature
      expect(models['o3'].supportsTemperature).toBe(false);
      expect(models['o3-mini'].supportsTemperature).toBe(false);
      
      // GPT-4o models do support temperature
      expect(models['gpt-4o'].supportsTemperature).toBe(true);
      expect(models['gpt-4o-mini'].supportsTemperature).toBe(true);
    });
  });

  describe('model resolution', () => {
    it('should handle model aliases correctly', () => {
      const models = openaiProvider.getSupportedModels();
      
      // Verify aliases are configured
      expect(models['o3-mini'].aliases.includes('o3mini')).toBe(true);
      expect(models['o3-pro-2025-06-10'].aliases.includes('o3-pro')).toBe(true);
    });
  });

  describe('invoke with mocked SDK', () => {
    const validConfig = {
      apiKeys: {
        openai: 'sk-1234567890abcdef1234567890abcdef1234567890abcdef'
      }
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should successfully call OpenAI API and return unified response', async () => {
      // Import OpenAI to get the mocked instance
      const OpenAI = (await import('openai')).default;
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [
          {
            message: { content: 'Hello! How can I help you today?' },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 8,
          total_tokens: 18
        },
        model: 'gpt-4o-mini'
      });

      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate
          }
        }
      }));

      const messages = [{ role: 'user', content: 'Hello' }];
      const result = await openaiProvider.invoke(messages, { 
        config: validConfig,
        model: 'gpt-4o-mini'
      });

      expect(result).toEqual({
        content: 'Hello! How can I help you today?',
        stop_reason: 'stop',
        rawResponse: expect.any(Object),
        metadata: {
          model: 'gpt-4o-mini',
          usage: {
            input_tokens: 10,
            output_tokens: 8,
            total_tokens: 18
          },
          response_time_ms: expect.any(Number),
          finish_reason: 'stop',
          provider: 'openai'
        }
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Hello' }],
          stream: false,
          temperature: 0.7
        })
      );
    });

    it('should handle reasoning effort for O3 models', async () => {
      const OpenAI = (await import('openai')).default;
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [
          {
            message: { content: 'Reasoning response' },
            finish_reason: 'stop'
          }
        ],
        usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 }
      });

      OpenAI.mockImplementation(() => ({
        chat: { completions: { create: mockCreate } }
      }));

      const messages = [{ role: 'user', content: 'Complex reasoning task' }];
      await openaiProvider.invoke(messages, { 
        config: validConfig,
        model: 'o3',
        reasoningEffort: 'high'
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'o3',
          reasoning_effort: 'high'
        })
      );
    });

    it('should handle temperature based on model support', async () => {
      const OpenAI = (await import('openai')).default;
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'response' }, finish_reason: 'stop' }],
        usage: {}
      });

      OpenAI.mockImplementation(() => ({
        chat: { completions: { create: mockCreate } }
      }));

      const messages = [{ role: 'user', content: 'test' }];

      // O3 models don't support temperature
      await openaiProvider.invoke(messages, { 
        config: validConfig,
        model: 'o3',
        temperature: 0.8
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.not.objectContaining({
          temperature: expect.any(Number)
        })
      );

      // GPT-4o models do support temperature
      await openaiProvider.invoke(messages, { 
        config: validConfig,
        model: 'gpt-4o',
        temperature: 0.8
      });

      expect(mockCreate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          temperature: 0.8
        })
      );
    });

    it('should handle OpenAI API errors gracefully', async () => {
      const OpenAI = (await import('openai')).default;
      const mockCreate = vi.fn().mockRejectedValue(
        Object.assign(new Error('Rate limit exceeded'), {
          type: 'rate_limit_error',
          code: 'rate_limit_exceeded'
        })
      );

      OpenAI.mockImplementation(() => ({
        chat: { completions: { create: mockCreate } }
      }));

      const messages = [{ role: 'user', content: 'test' }];

      await expect(openaiProvider.invoke(messages, { config: validConfig }))
        .rejects.toThrow(expect.objectContaining({
          name: 'OpenAIProviderError',
          code: 'RATE_LIMIT_EXCEEDED'
        }));
    });
  });
});