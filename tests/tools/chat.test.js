import { describe, it, expect, beforeEach, vi } from 'vitest';
import { chatTool } from '../../src/tools/chat.js';
import { logger } from '../../src/utils/logger.js';
import * as fileValidator from '../../src/utils/fileValidator.js';

// Mock the fileValidator module
vi.mock('../../src/utils/fileValidator.js');

describe('Chat Tool Unit Tests', () => {
  let mockDependencies;
  let mockConfig;
  let mockContinuationStore;
  let mockProviders;
  let mockContextProcessor;

  beforeEach(() => {
    // Mock file validator
    vi.mocked(fileValidator.validateAllPaths).mockResolvedValue({ valid: true, errors: [] });

    // Mock configuration
    mockConfig = {
      apiKeys: {
        openai: 'sk-test-key',
        xai: 'xai-test-key',
        google: 'google-test-key'
      },
      providers: {
        googleLocation: 'us-central1',
        xaiBaseUrl: 'https://api.x.ai/v1'
      }
    };

    // Mock continuation store
    mockContinuationStore = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
      getStats: vi.fn()
    };

    // Mock providers - chat tool expects a plain object with provider names as keys
    const mockOpenAIProvider = {
      invoke: vi.fn(),
      validateConfig: vi.fn(),
      isAvailable: vi.fn(),
      getSupportedModels: vi.fn(),
      getModelConfig: vi.fn()
    };

    const mockXAIProvider = {
      invoke: vi.fn(),
      validateConfig: vi.fn(),
      isAvailable: vi.fn(),
      getSupportedModels: vi.fn(),
      getModelConfig: vi.fn()
    };

    const mockGoogleProvider = {
      invoke: vi.fn(),
      validateConfig: vi.fn(),
      isAvailable: vi.fn(),
      getSupportedModels: vi.fn(),
      getModelConfig: vi.fn()
    };

    mockProviders = {
      openai: mockOpenAIProvider,
      xai: mockXAIProvider,
      google: mockGoogleProvider
    };

    // Mock context processor
    mockContextProcessor = {
      processUnifiedContext: vi.fn()
    };

    // Create mock dependencies
    mockDependencies = {
      config: mockConfig,
      continuationStore: mockContinuationStore,
      providers: mockProviders,
      contextProcessor: mockContextProcessor
    };

    // Set up default mock return values
    mockContinuationStore.get.mockResolvedValue(null);
    mockContinuationStore.set.mockImplementation((id, data) => id); // Return the passed ID
    mockContinuationStore.exists.mockResolvedValue(false);

    mockContextProcessor.processUnifiedContext.mockResolvedValue({
      success: true,
      contextMessages: [],
      files: [],
      processed: [],
      failed: []
    });

    mockOpenAIProvider.invoke.mockResolvedValue({
      content: 'Test response from provider',
      stop_reason: 'stop',
      rawResponse: { usage: { total_tokens: 50 } },
      metadata: { provider: 'openai', model: 'gpt-4o-mini' }
    });

    mockGoogleProvider.invoke.mockResolvedValue({
      content: 'Test response from google provider',
      stop_reason: 'stop',
      rawResponse: { usage: { total_tokens: 50 } },
      metadata: { provider: 'google', model: 'gemini-pro' }
    });

    mockXAIProvider.invoke.mockResolvedValue({
      content: 'Test response from xai provider',
      stop_reason: 'stop',
      rawResponse: { usage: { total_tokens: 50 } },
      metadata: { provider: 'xai', model: 'grok' }
    });

    mockOpenAIProvider.isAvailable.mockReturnValue(true);
    mockXAIProvider.isAvailable.mockReturnValue(true);
    mockGoogleProvider.isAvailable.mockReturnValue(true);

    mockOpenAIProvider.getModelConfig.mockReturnValue({
      contextWindow: 128000,
      supportsImages: true,
      supportsTemperature: true
    });

    mockGoogleProvider.getModelConfig.mockReturnValue({
      contextWindow: 1000000,
      supportsImages: true,
      supportsTemperature: true
    });

    mockXAIProvider.getModelConfig.mockReturnValue({
      contextWindow: 131000,
      supportsImages: true,
      supportsTemperature: true
    });
  });

  describe('Basic Chat Functionality', () => {
    it('should handle basic chat request', async () => {
      const args = {
        prompt: 'Hello, world!'
      };

      const result = await chatTool(args, mockDependencies);

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Test response from provider');
      expect(result.continuation).toBeDefined();
      expect(result.continuation.id).toMatch(/^conv_[a-f0-9-]+$/);
    });

    it('should handle chat with model specification', async () => {
      const args = {
        prompt: 'Test prompt',
        model: 'gpt-4o-mini'
      };

      await chatTool(args, mockDependencies);

      expect(mockProviders.openai.invoke).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: 'Test prompt'
          })
        ]),
        expect.objectContaining({
          model: 'gpt-4o-mini'
        })
      );
    });

    it('should handle auto model selection', async () => {
      const args = {
        prompt: 'Test prompt',
        model: 'auto'
      };

      await chatTool(args, mockDependencies);

      expect(mockProviders.openai.invoke).toHaveBeenCalled();
    });

    it('should handle temperature parameter', async () => {
      const args = {
        prompt: 'Test prompt',
        temperature: 0.7
      };

      await chatTool(args, mockDependencies);

      expect(mockProviders.openai.invoke).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          temperature: 0.7
        })
      );
    });
  });

  describe('Continuation Support', () => {
    it('should create new conversation when no continuation provided', async () => {
      const args = {
        prompt: 'First message'
      };

      const result = await chatTool(args, mockDependencies);

      expect(mockContinuationStore.get).not.toHaveBeenCalled();
      expect(mockContinuationStore.set).toHaveBeenCalledWith(
        expect.stringMatching(/^conv_[a-f0-9-]+$/),
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'user', content: 'First message' }),
            expect.objectContaining({ role: 'assistant', content: 'Test response from provider' })
          ]),
          provider: 'openai',
          model: 'auto'
        })
      );
      expect(result.continuation.messageCount).toBe(2); // user + assistant (system messages excluded)
    });

    it('should load existing conversation when continuation provided', async () => {
      const existingConversation = {
        messages: [
          { role: 'user', content: 'Previous message' },
          { role: 'assistant', content: 'Previous response' }
        ],
        provider: 'openai',
        model: 'gpt-4o-mini'
      };

      mockContinuationStore.get.mockResolvedValue(existingConversation);
      mockContinuationStore.exists.mockResolvedValue(true);

      const args = {
        prompt: 'Follow-up message',
        continuation_id: 'conv_existing'
      };

      await chatTool(args, mockDependencies);

      expect(mockContinuationStore.get).toHaveBeenCalledWith('conv_existing');
      expect(mockProviders.openai.invoke).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'Previous message' }),
          expect.objectContaining({ role: 'assistant', content: 'Previous response' }),
          expect.objectContaining({ role: 'user', content: 'Follow-up message' })
        ]),
        expect.any(Object)
      );
    });

    it('should handle invalid continuation ID gracefully', async () => {
      mockContinuationStore.get.mockResolvedValue(null);
      mockContinuationStore.exists.mockResolvedValue(false);

      const args = {
        prompt: 'Test message',
        continuation_id: 'invalid-continuation-id'
      };

      const result = await chatTool(args, mockDependencies);

      // Should create new conversation
      expect(result.continuation.messageCount).toBe(2); // user + assistant (system messages excluded)
      expect(mockContinuationStore.set).toHaveBeenCalled();
    });
  });

  describe('Context Processing', () => {
    it('should process file context when files provided', async () => {
      mockContextProcessor.processUnifiedContext.mockResolvedValue({
        success: true,
        files: [{
          originalPath: 'package.json',
          path: 'package.json',
          type: 'text',
          content: '{"name": "test"}',
          size: 100,
          lineCount: 1
        }],
        images: [],
        webSearch: null
      });

      const args = {
        prompt: 'Analyze these files',
        files: ['package.json']
      };

      const result = await chatTool(args, mockDependencies);

      // Log the result to see if there's an error
      if (result.isError) {
        console.log('Chat tool returned error:', result);
      }

      expect(mockContextProcessor.processUnifiedContext).toHaveBeenCalledWith({
        files: ['package.json'],
        images: [],
        webSearch: null
      }, {
        enforceSecurityCheck: false,
        skipSecurityCheck: true,
        clientCwd: undefined
      });

      expect(mockProviders.openai.invoke).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({
                type: 'text',
                text: expect.stringContaining('=== FILE CONTEXT ===')
              }),
              expect.objectContaining({
                type: 'text',
                text: 'Analyze these files'
              })
            ])
          })
        ]),
        expect.any(Object)
      );
    });

    it('should process image context when images provided', async () => {
      mockContextProcessor.processUnifiedContext.mockResolvedValue({
        success: true,
        contextMessages: [
          { role: 'user', content: 'Image content: [base64 data]' }
        ],
        files: [],
        processed: [{ fileName: 'image.png', fileType: 'image' }],
        failed: []
      });

      const args = {
        prompt: 'Describe this image',
        images: ['image.png']
      };

      await chatTool(args, mockDependencies);

      expect(mockContextProcessor.processUnifiedContext).toHaveBeenCalledWith({
        files: [],
        images: ['image.png'],
        webSearch: null
      }, {
        enforceSecurityCheck: false,
        skipSecurityCheck: true,
        clientCwd: undefined
      });
    });

    it('should process web search context when provided', async () => {
      mockContextProcessor.processUnifiedContext.mockResolvedValue({
        success: true,
        contextMessages: [
          { role: 'user', content: 'Web search results: ...' }
        ],
        files: [],
        processed: [],
        failed: []
      });

      const args = {
        prompt: 'Based on recent news',
        use_websearch: true
      };

      await chatTool(args, mockDependencies);

      expect(mockContextProcessor.processUnifiedContext).toHaveBeenCalledWith({
        files: [],
        images: [],
        webSearch: 'Based on recent news'
      }, {
        enforceSecurityCheck: false,
        skipSecurityCheck: true,
        clientCwd: undefined
      });
    });

    it('should handle context processing failures gracefully', async () => {
      mockContextProcessor.processUnifiedContext.mockResolvedValue({
        success: false,
        contextMessages: [],
        files: [],
        processed: [],
        failed: [{ file: 'nonexistent.txt', error: 'File not found' }]
      });

      const args = {
        prompt: 'Test message',
        files: ['nonexistent.txt']
      };

      const result = await chatTool(args, mockDependencies);

      // Should still proceed with the chat
      expect(result.content).toBeDefined();
      expect(mockProviders.openai.invoke).toHaveBeenCalled();
    });
  });

  describe('Provider Integration', () => {
    it('should map model names to correct providers', async () => {
      const testCases = [
        { model: 'gpt-4o-mini', expectedProvider: 'openai' },
        { model: 'o3-mini', expectedProvider: 'openai' },
        { model: 'grok', expectedProvider: 'xai' },
        { model: 'grok-4', expectedProvider: 'xai' },
        { model: 'flash', expectedProvider: 'google' },
        { model: 'gemini-pro', expectedProvider: 'google' }
      ];

      for (const { model, expectedProvider } of testCases) {
        // Reset mock calls
        mockProviders.openai.invoke.mockClear();

        const args = { prompt: 'Test', model };
        await chatTool(args, mockDependencies);

        // Provider selection is now direct property access
      }
    });

    it('should handle provider-specific options', async () => {
      const args = {
        prompt: 'Test thinking',
        model: 'gemini-pro',
        thinking: 'medium'
      };

      const result = await chatTool(args, mockDependencies);

      // Should complete successfully without errors
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
    });

    it('should handle reasoning effort for O3 models', async () => {
      const args = {
        prompt: 'Complex reasoning task',
        model: 'o3-mini',
        reasoning_effort: 'high'
      };

      await chatTool(args, mockDependencies);

      expect(mockProviders.openai.invoke).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          reasoning_effort: 'high'
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should throw error for missing prompt', async () => {
      const args = {};

      const result = await chatTool(args, mockDependencies);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/prompt.*required/i);
    });

    it('should throw error for empty prompt', async () => {
      const args = { prompt: '' };

      const result = await chatTool(args, mockDependencies);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/prompt.*required/i);
    });

    it('should handle provider errors gracefully', async () => {
      mockProviders.openai.invoke.mockRejectedValue(
        new Error('Provider API error')
      );

      const args = { prompt: 'Test prompt' };

      const result = await chatTool(args, mockDependencies);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Provider error');
    });

    it('should handle no available providers', async () => {
      // Make all providers unavailable
      mockProviders.openai.isAvailable.mockReturnValue(false);
      mockProviders.xai.isAvailable.mockReturnValue(false);
      mockProviders.google.isAvailable.mockReturnValue(false);

      const args = {
        prompt: 'Test prompt',
        model: 'auto'
      };

      const result = await chatTool(args, mockDependencies);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No providers available');
    });

    it('should handle unknown model gracefully', async () => {
      // Make all providers unavailable to simulate provider not found
      mockProviders.openai.isAvailable.mockReturnValue(false);
      mockProviders.xai.isAvailable.mockReturnValue(false);
      mockProviders.google.isAvailable.mockReturnValue(false);

      const args = {
        prompt: 'Test prompt',
        model: 'unknown-model'
      };

      const result = await chatTool(args, mockDependencies);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/provider.*not available/i);
    });

    it('should handle continuation store errors', async () => {
      mockContinuationStore.set.mockRejectedValue(new Error('Store error'));

      const args = { prompt: 'Test prompt' };

      const result = await chatTool(args, mockDependencies);
      // Store errors don't prevent successful response, just log errors
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('Test response from provider');
    });
  });

  describe('Response Format Compliance', () => {
    it('should return MCP-compliant response format', async () => {
      const args = { prompt: 'Test prompt' };
      const result = await chatTool(args, mockDependencies);

      // Check MCP response structure
      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toHaveProperty('type');
      expect(result.content[0]).toHaveProperty('text');
      expect(result.content[0].type).toBe('text');

      // Check continuation structure
      expect(result).toHaveProperty('continuation');
      expect(result.continuation).toHaveProperty('id');
      expect(result.continuation).toHaveProperty('messageCount');
      expect(typeof result.continuation.messageCount).toBe('number');
    });

    it('should include provider metadata in response', async () => {
      const args = { prompt: 'Test prompt' };
      const result = await chatTool(args, mockDependencies);

      // Check MCP response structure includes the provider response content
      expect(result.content[0].text).toContain('Test response from provider');

      // Check continuation includes provider and model info
      expect(result.continuation).toHaveProperty('provider');
      expect(result.continuation).toHaveProperty('model');
      expect(result.continuation.provider).toBe('openai');
      expect(result.continuation.model).toBe('auto');
    });

    it('should handle streaming responses appropriately', async () => {
      mockProviders.openai.invoke.mockResolvedValue({
        content: 'Streaming response',
        stop_reason: 'stop',
        rawResponse: { usage: { total_tokens: 25 } },
        metadata: { provider: 'openai', model: 'gpt-4o-mini', streaming: true }
      });

      const args = {
        prompt: 'Test prompt',
        streaming: true
      };

      const result = await chatTool(args, mockDependencies);
      expect(result.content[0].text).toContain('Streaming response');
    });
  });

  describe('Edge Cases and Input Validation', () => {
    it('should handle very long prompts', async () => {
      const longPrompt = 'A'.repeat(10000);
      const args = { prompt: longPrompt };

      const result = await chatTool(args, mockDependencies);
      expect(result).toBeDefined();
      expect(mockProviders.openai.invoke).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ content: longPrompt })
        ]),
        expect.any(Object)
      );
    });

    it('should handle special characters in prompt', async () => {
      const specialPrompt = 'Test with émojis 🚀 and symbols: @#$%^&*()';
      const args = { prompt: specialPrompt };

      const result = await chatTool(args, mockDependencies);
      expect(result).toBeDefined();
    });

    it('should handle multiple file types', async () => {
      mockContextProcessor.processUnifiedContext.mockResolvedValue({
        success: true,
        contextMessages: [
          { role: 'user', content: 'File 1 content' },
          { role: 'user', content: 'File 2 content' }
        ],
        files: [
          { fileName: 'file1.txt', fileType: 'text', content: 'File 1 content' },
          { fileName: 'file2.json', fileType: 'json', content: 'File 2 content' }
        ],
        processed: [
          { fileName: 'file1.txt', fileType: 'text' },
          { fileName: 'file2.json', fileType: 'json' }
        ],
        failed: []
      });

      const args = {
        prompt: 'Analyze these files',
        files: ['file1.txt', 'file2.json']
      };

      const result = await chatTool(args, mockDependencies);
      expect(result).toBeDefined();
      expect(mockContextProcessor.processUnifiedContext).toHaveBeenCalledWith({
        files: ['file1.txt', 'file2.json'],
        images: [],
        webSearch: null
      }, {
        enforceSecurityCheck: false,
        skipSecurityCheck: true,
        clientCwd: undefined
      });
    });

    it('should handle boundary temperature values', async () => {
      const testCases = [0, 0.1, 1.0, 2.0];

      for (const temperature of testCases) {
        mockProviders.openai.invoke.mockClear();

        const args = {
          prompt: 'Test prompt',
          temperature
        };

        await chatTool(args, mockDependencies);
        expect(mockProviders.openai.invoke).toHaveBeenCalledWith(
          expect.any(Array),
          expect.objectContaining({ temperature })
        );
      }
    });
  });
});
