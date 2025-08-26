import { describe, it, expect, beforeEach, vi } from 'vitest';
import { chatTool } from '../../src/tools/chat.js';
import { consensusTool } from '../../src/tools/consensus.js';
import * as fileValidator from '../../src/utils/fileValidator.js';

// Mock the fileValidator module
vi.mock('../../src/utils/fileValidator.js');

describe('Async Support Tests', () => {
  let mockDependencies;
  let mockConfig;
  let mockContinuationStore;
  let mockProviders;
  let mockContextProcessor;
  let mockJobRunner;
  let mockProviderStreamNormalizer;

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
      },
      environment: {
        nodeEnv: 'test'
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

    // Mock providers
    const mockOpenAIProvider = {
      invoke: vi.fn().mockResolvedValue({
        content: 'Test response from OpenAI',
        metadata: { usage: { input_tokens: 10, output_tokens: 20 } }
      }),
      validateConfig: vi.fn(),
      isAvailable: vi.fn().mockReturnValue(true),
      getSupportedModels: vi.fn(),
      getModelConfig: vi.fn()
    };

    const mockXAIProvider = {
      invoke: vi.fn().mockResolvedValue({
        content: 'Test response from XAI',
        metadata: { usage: { input_tokens: 12, output_tokens: 18 } }
      }),
      validateConfig: vi.fn(),
      isAvailable: vi.fn().mockReturnValue(true),
      getSupportedModels: vi.fn(),
      getModelConfig: vi.fn()
    };

    const mockGoogleProvider = {
      invoke: vi.fn().mockResolvedValue({
        content: 'Test response from Google',
        metadata: { usage: { input_tokens: 8, output_tokens: 25 } }
      }),
      validateConfig: vi.fn(),
      isAvailable: vi.fn().mockReturnValue(true),
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
      processUnifiedContext: vi.fn().mockResolvedValue({
        success: true,
        contextMessages: [],
        files: [],
        processed: [],
        failed: [],
        images: []
      })
    };

    // Mock job runner
    mockJobRunner = {
      submit: vi.fn().mockResolvedValue('test-job-id-123')
    };

    // Mock provider stream normalizer
    mockProviderStreamNormalizer = {
      normalize: vi.fn()
    };

    // Create mock dependencies
    mockDependencies = {
      config: mockConfig,
      continuationStore: mockContinuationStore,
      providers: mockProviders,
      contextProcessor: mockContextProcessor,
      jobRunner: mockJobRunner,
      providerStreamNormalizer: mockProviderStreamNormalizer
    };

    // Set up default mock return values
    mockContinuationStore.get.mockResolvedValue(null);
    mockContinuationStore.set.mockImplementation((id, data) => id);
    mockContinuationStore.exists.mockResolvedValue(false);
  });

  describe('Chat Tool Async Support', () => {
    it('should execute synchronously when async=false (default)', async () => {
      const args = {
        prompt: 'Test sync chat',
        async: false
      };

      const result = await chatTool(args, mockDependencies);

      expect(result.content[0].text).toContain('Test response from OpenAI');
      expect(result.continuation).toBeDefined();
      expect(result.continuation.id).toBeTruthy();
      expect(mockJobRunner.submit).not.toHaveBeenCalled();
    });

    it('should execute synchronously when async parameter is omitted', async () => {
      const args = {
        prompt: 'Test sync chat default'
      };

      const result = await chatTool(args, mockDependencies);

      expect(result.content[0].text).toContain('Test response from OpenAI');
      expect(mockJobRunner.submit).not.toHaveBeenCalled();
    });

    it('should submit async job when async=true', async () => {
      const args = {
        prompt: 'Test async chat',
        async: true
      };

      const result = await chatTool(args, mockDependencies);

      expect(result.content[0].text).toContain('⏳ PROCESSING | CHAT');
      expect(result.continuation.id).toBeTruthy();
      // job_id is no longer returned in continuation object
      expect(result.continuation.status).toBe('processing');
      // async_execution is not part of the final response structure
      expect(mockJobRunner.submit).toHaveBeenCalledOnce();
    });

    it('should preserve existing continuation_id in async mode', async () => {
      const existingContinuationId = 'existing-chat-123';
      const args = {
        prompt: 'Test async chat with continuation',
        async: true,
        continuation_id: existingContinuationId
      };

      const result = await chatTool(args, mockDependencies);

      expect(result.continuation.id).toBe(existingContinuationId);
      expect(mockJobRunner.submit).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'local-user', // Uses standard session ID
          tool: 'chat',
          options: expect.objectContaining({
            ...args,
            jobId: existingContinuationId
          })
        }),
        expect.any(Function)
      );
    });

    it('should return error when async dependencies are missing', async () => {
      const depsWithoutAsync = {
        ...mockDependencies,
        jobRunner: null,
        providerStreamNormalizer: null
      };

      const args = {
        prompt: 'Test async without deps',
        async: true
      };

      const result = await chatTool(args, depsWithoutAsync);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Async execution not available');
    });

    it('should handle job submission errors gracefully', async () => {
      mockJobRunner.submit.mockRejectedValue(new Error('Job submission failed'));

      const args = {
        prompt: 'Test async error',
        async: true
      };

      const result = await chatTool(args, mockDependencies);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Async execution failed');
    });
  });

  describe('Consensus Tool Async Support', () => {
    it('should execute synchronously when async=false (default)', async () => {
      const args = {
        prompt: 'Test sync consensus',
        models: ['gpt-5', 'gemini-2.5-pro'],
        async: false
      };

      const result = await consensusTool(args, mockDependencies);

      expect(result.content[0].text).toContain('successful_initial_responses');
      expect(result.continuation).toBeDefined();
      expect(mockJobRunner.submit).not.toHaveBeenCalled();
    });

    it('should execute synchronously when async parameter is omitted', async () => {
      const args = {
        prompt: 'Test sync consensus default',
        models: ['gpt-5']
      };

      const result = await consensusTool(args, mockDependencies);

      expect(result.content[0].text).toContain('successful_initial_responses');
      expect(mockJobRunner.submit).not.toHaveBeenCalled();
    });

    it('should submit async job when async=true', async () => {
      const args = {
        prompt: 'Test async consensus',
        models: ['gpt-5', 'gemini-2.5-pro', 'grok-4-0709'],
        async: true
      };

      const result = await consensusTool(args, mockDependencies);

      expect(result.content[0].text).toContain('⏳ PROCESSING | CONSENSUS');
      expect(result.continuation.id).toBeTruthy();
      // job_id is no longer returned in continuation object
      expect(result.continuation.status).toBe('processing');
      // async_execution is not part of the final response structure
      expect(mockJobRunner.submit).toHaveBeenCalledOnce();
    });

    it('should preserve existing continuation_id in async mode', async () => {
      const existingContinuationId = 'existing-consensus-456';
      const args = {
        prompt: 'Test async consensus with continuation',
        models: ['gpt-5', 'gemini-2.5-pro'],
        async: true,
        continuation_id: existingContinuationId
      };

      const result = await consensusTool(args, mockDependencies);

      expect(result.continuation.id).toBe(existingContinuationId);
      expect(mockJobRunner.submit).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: existingContinuationId, // Consensus uses continuation_id as sessionId
          tool: 'consensus',
          options: expect.objectContaining({
            ...args,
            jobId: existingContinuationId
          })
        }),
        expect.any(Function)
      );
    });

    it('should return error when async dependencies are missing', async () => {
      const depsWithoutAsync = {
        ...mockDependencies,
        jobRunner: null,
        providerStreamNormalizer: null
      };

      const args = {
        prompt: 'Test async without deps',
        models: ['gpt-5'],
        async: true
      };

      const result = await consensusTool(args, depsWithoutAsync);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Async execution not available');
    });

    it('should handle job submission errors gracefully', async () => {
      mockJobRunner.submit.mockRejectedValue(new Error('Job submission failed'));

      const args = {
        prompt: 'Test async error',
        models: ['gpt-5'],
        async: true
      };

      const result = await consensusTool(args, mockDependencies);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Async execution failed');
    });

    it('should support cross-feedback in async mode', async () => {
      const args = {
        prompt: 'Test async consensus with cross-feedback',
        models: ['gpt-5', 'gemini-2.5-pro'],
        enable_cross_feedback: true,
        async: true
      };

      const result = await consensusTool(args, mockDependencies);

      // async_execution is not part of the final response structure
      expect(mockJobRunner.submit).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: 'consensus',
          options: expect.objectContaining({
            enable_cross_feedback: true
          })
        }),
        expect.any(Function)
      );
    });
  });

  describe('Backwards Compatibility', () => {
    it('should maintain existing chat behavior when async parameter is not used', async () => {
      const args = {
        prompt: 'Test compatibility',
        model: 'gpt-5',
        temperature: 0.7
      };

      const result = await chatTool(args, mockDependencies);

      // Should work exactly as before
      expect(result.content[0].text).toContain('Test response from OpenAI');
      expect(result.continuation).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(mockJobRunner.submit).not.toHaveBeenCalled();
    });

    it('should maintain existing consensus behavior when async parameter is not used', async () => {
      const args = {
        prompt: 'Test compatibility consensus',
        models: ['gpt-5', 'gemini-2.5-pro'],
        temperature: 0.3,
        enable_cross_feedback: false
      };

      const result = await consensusTool(args, mockDependencies);

      // Should work exactly as before
      expect(result.content[0].text).toContain('successful_initial_responses');
      expect(result.continuation).toBeDefined();
      expect(mockJobRunner.submit).not.toHaveBeenCalled();
    });
  });
});
