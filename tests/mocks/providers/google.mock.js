/**
 * Mock Google provider for testing
 * Implements Google Gemini-specific behavior and response formats
 */

import { vi } from 'vitest';
import { createMockProvider, MockResponseBuilder } from './base.mock.js';
import { ProviderError, ErrorCodes } from '../../../src/providers/interface.js';

// Google model configurations matching the real provider
const GOOGLE_MODELS = {
  'gemini-2.0-flash-exp': {
    modelName: 'gemini-2.0-flash-exp',
    friendlyName: 'Gemini 2.0 Flash (Experimental)',
    contextWindow: 1048576,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: false,
    supportsThinking: true,
    maxThinkingTokens: 32768,
    timeout: 60000,
    description: 'Next generation model with native tool use',
    aliases: []
  },
  'gemini-2.0-flash-thinking-exp': {
    modelName: 'gemini-2.0-flash-thinking-exp',
    friendlyName: 'Gemini 2.0 Flash Thinking (Experimental)',
    contextWindow: 32767,
    maxOutputTokens: 8192,
    supportsStreaming: false,
    supportsImages: false,
    supportsTemperature: false,
    supportsWebSearch: false,
    supportsThinking: true,
    maxThinkingTokens: 65536,
    timeout: 300000,
    description: 'Reasoning model optimized for complex tasks',
    aliases: ['gemini-2.0-flash-thinking-exp-1219']
  },
  'gemini-1.5-pro': {
    modelName: 'gemini-1.5-pro',
    friendlyName: 'Gemini 1.5 Pro',
    contextWindow: 2097152,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: false,
    supportsThinking: false,
    timeout: 60000,
    description: 'Advanced model for complex reasoning tasks',
    aliases: ['gemini-1.5-pro-002', 'gemini-1.5-pro-latest']
  },
  'gemini-1.5-flash': {
    modelName: 'gemini-1.5-flash',
    friendlyName: 'Gemini 1.5 Flash',
    contextWindow: 1048576,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: false,
    supportsThinking: false,
    timeout: 30000,
    description: 'Fast and versatile model for various tasks',
    aliases: ['gemini-1.5-flash-002', 'gemini-1.5-flash-latest']
  },
  'gemini-1.5-flash-8b': {
    modelName: 'gemini-1.5-flash-8b',
    friendlyName: 'Gemini 1.5 Flash 8B',
    contextWindow: 1048576,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: false,
    supportsThinking: false,
    timeout: 30000,
    description: 'Smaller, faster variant of Gemini 1.5 Flash',
    aliases: ['gemini-1.5-flash-8b-latest']
  }
};

// Mock Google GenerativeAI SDK structure
export const MockGoogleGenerativeAI = vi.fn().mockImplementation(() => ({
  getGenerativeModel: vi.fn().mockImplementation(() => ({
    generateContent: vi.fn(),
    generateContentStream: vi.fn()
  }))
}));

// Create Google-specific mock provider
export function createMockGoogleProvider(overrides = {}) {
  const baseProvider = createMockProvider({
    name: 'google'
  });

  // Create Google-specific provider with proper tracker access
  const googleProvider = {
    ...baseProvider,

    getSupportedModels: vi.fn().mockImplementation(() => GOOGLE_MODELS),

    getModelConfig: vi.fn().mockImplementation((modelName) => {
      // Check direct match
      if (GOOGLE_MODELS[modelName]) {
        return GOOGLE_MODELS[modelName];
      }

      // Check aliases
      for (const model of Object.values(GOOGLE_MODELS)) {
        if (model.aliases && model.aliases.includes(modelName)) {
          return model;
        }
      }

      return null;
    }),

    invoke: vi.fn().mockImplementation(async (messages, options = {}) => {
      // Track the call
      baseProvider.tracker.recordCall('invoke', { messages, options });

      const modelConfig = GOOGLE_MODELS[options.model] || GOOGLE_MODELS['gemini-1.5-flash'];

      // Simulate Google-specific validations
      if (!options.config?.apiKeys?.google) {
        throw new ProviderError('Google API key is required', ErrorCodes.MISSING_API_KEY);
      }

      // Simulate thinking models behavior
      if (modelConfig.supportsThinking && modelConfig.modelName.includes('thinking')) {
        return new MockResponseBuilder()
          .withContent('Let me think step by step about this problem...')
          .withModel(options.model)
          .withProvider('google')
          .withUsage({
            input_tokens: 150,
            output_tokens: 75,
            total_tokens: 225
          })
          .withRawResponse({
            candidates: [{
              content: {
                parts: [{ text: 'Let me think step by step about this problem...' }],
                role: 'model'
              },
              finishReason: 'STOP'
            }],
            usageMetadata: {
              promptTokenCount: 150,
              candidatesTokenCount: 75,
              totalTokenCount: 225
            }
          })
          .build();
      }

      // Default response
      return new MockResponseBuilder()
        .withContent('Mock Google response')
        .withModel(options.model || 'gemini-1.5-flash')
        .withProvider('google')
        .build();
    })
  };

  // Apply overrides and return
  return Object.assign(googleProvider, overrides);
}

// Export default instance
export const mockGoogleProvider = createMockGoogleProvider();

// Mock response generators for Google format
export function createMockGoogleResponse(content = 'Test response', options = {}) {
  return {
    candidates: [{
      content: {
        parts: [{ text: content }],
        role: 'model'
      },
      finishReason: options.finishReason || 'STOP',
      index: 0,
      safetyRatings: options.safetyRatings || []
    }],
    usageMetadata: {
      promptTokenCount: options.promptTokens || 10,
      candidatesTokenCount: options.outputTokens || 20,
      totalTokenCount: (options.promptTokens || 10) + (options.outputTokens || 20)
    }
  };
}

// Mock streaming response generator
export function createMockGoogleStreamResponse(chunks = ['Hello', ' world', '!']) {
  return chunks.map((chunk, index) => ({
    candidates: [{
      content: {
        parts: [{ text: chunk }],
        role: 'model'
      },
      finishReason: index === chunks.length - 1 ? 'STOP' : undefined,
      index: 0
    }]
  }));
}

// Error response generators
export function createMockGoogleError(type = 'invalid_api_key', message = null) {
  const errors = {
    invalid_api_key: {
      error: {
        code: 403,
        message: message || 'API key not valid. Please pass a valid API key.',
        status: 'PERMISSION_DENIED'
      }
    },
    quota_exceeded: {
      error: {
        code: 429,
        message: message || 'Resource has been exhausted',
        status: 'RESOURCE_EXHAUSTED'
      }
    },
    model_not_found: {
      error: {
        code: 404,
        message: message || 'Model not found',
        status: 'NOT_FOUND'
      }
    },
    safety_block: {
      error: {
        code: 400,
        message: message || 'Response blocked due to safety settings',
        status: 'INVALID_ARGUMENT'
      }
    }
  };

  return errors[type] || errors.invalid_api_key;
}

// Create a mock Google client with configurable behavior
export function createMockGoogleClient(behavior = {}) {
  const model = {
    generateContent: vi.fn().mockImplementation(async (params) => {
      if (behavior.throwError) {
        throw createMockGoogleError(behavior.errorType);
      }

      return createMockGoogleResponse(
        behavior.content || 'Mock response',
        behavior.responseOptions || {}
      );
    }),

    generateContentStream: vi.fn().mockImplementation(async function* (params) {
      if (behavior.throwError) {
        throw createMockGoogleError(behavior.errorType);
      }

      const chunks = behavior.chunks || ['Test', ' streaming', ' response'];
      for (const chunk of createMockGoogleStreamResponse(chunks)) {
        yield chunk;
      }
    })
  };

  return {
    getGenerativeModel: vi.fn().mockReturnValue(model)
  };
}
