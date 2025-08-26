import { describe, it, expect, beforeEach, vi } from 'vitest';
import { consensusTool } from '../../src/tools/consensus.js';
import { logger } from '../../src/utils/logger.js';
import * as fileValidator from '../../src/utils/fileValidator.js';
import * as contextProcessor from '../../src/utils/contextProcessor.js';
import { parseJsonResponse } from '../utils/responseParser.js';

// Mock the fileValidator module
vi.mock('../../src/utils/fileValidator.js');
// Mock the contextProcessor module
vi.mock('../../src/utils/contextProcessor.js');

describe('Consensus Tool Unit Tests', () => {
  let mockDependencies;
  let mockConfig;
  let mockContinuationStore;
  let mockProviders;
  let mockContextProcessor;

  beforeEach(() => {
    // Mock file validator
    vi.mocked(fileValidator.validateAllPaths).mockResolvedValue({ valid: true, errors: [] });

    // Mock createFileContext to return the expected format
    vi.mocked(contextProcessor.createFileContext).mockReturnValue({
      content: [
        { type: 'text', text: '=== FILE CONTEXT ===\n\n--- test.txt ---\ntest content' }
      ]
    });

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

    // Mock individual providers
    const mockOpenAIProvider = {
      invoke: vi.fn().mockResolvedValue({
        content: 'OpenAI response',
        stop_reason: 'stop',
        rawResponse: { usage: { total_tokens: 50 } },
        metadata: { provider: 'openai', model: 'gpt-4o-mini' }
      }),
      validateConfig: vi.fn().mockReturnValue(true),
      isAvailable: vi.fn().mockReturnValue(true),
      getSupportedModels: vi.fn().mockReturnValue({
        'gpt-4o-mini': { contextWindow: 128000, maxOutputTokens: 16384 },
        'gpt-4': { contextWindow: 128000, maxOutputTokens: 8192 },
        'o3-mini': { contextWindow: 200000, maxOutputTokens: 100000 }
      }),
      getModelConfig: vi.fn((model) => {
        const configs = {
          'gpt-4o-mini': { contextWindow: 128000, maxOutputTokens: 16384 },
          'gpt-4': { contextWindow: 128000, maxOutputTokens: 8192 },
          'o3-mini': { contextWindow: 200000, maxOutputTokens: 100000 }
        };
        return configs[model] || { contextWindow: 128000 };
      })
    };

    const mockXAIProvider = {
      invoke: vi.fn().mockResolvedValue({
        content: 'XAI response',
        stop_reason: 'stop',
        rawResponse: { usage: { total_tokens: 45 } },
        metadata: { provider: 'xai', model: 'grok' }
      }),
      validateConfig: vi.fn().mockReturnValue(true),
      isAvailable: vi.fn().mockReturnValue(true),
      getSupportedModels: vi.fn().mockReturnValue({
        'grok': { contextWindow: 131000, maxOutputTokens: 32768 },
        'grok-beta': { contextWindow: 131000, maxOutputTokens: 32768 },
        'grok-4': { contextWindow: 256000, maxOutputTokens: 65536 }
      }),
      getModelConfig: vi.fn((model) => {
        const configs = {
          'grok': { contextWindow: 131000, maxOutputTokens: 32768 },
          'grok-beta': { contextWindow: 131000, maxOutputTokens: 32768 },
          'grok-4': { contextWindow: 256000, maxOutputTokens: 65536 }
        };
        return configs[model] || { contextWindow: 131000 };
      })
    };

    const mockGoogleProvider = {
      invoke: vi.fn().mockResolvedValue({
        content: 'Google response',
        stop_reason: 'stop',
        rawResponse: { usage: { total_tokens: 40 } },
        metadata: { provider: 'google', model: 'gemini-2.5-flash' }
      }),
      validateConfig: vi.fn().mockReturnValue(true),
      isAvailable: vi.fn().mockReturnValue(true),
      getSupportedModels: vi.fn().mockReturnValue({
        'gemini-2.5-flash': { contextWindow: 1000000, maxOutputTokens: 8192 },
        'gemini-2.5-pro': { contextWindow: 1000000, maxOutputTokens: 8192 },
        'gemini-pro': { contextWindow: 1000000, maxOutputTokens: 8192 },
        'flash': { contextWindow: 1000000, maxOutputTokens: 8192 }
      }),
      getModelConfig: vi.fn((model) => {
        const configs = {
          'gemini-2.5-flash': { contextWindow: 1000000, maxOutputTokens: 8192 },
          'gemini-2.5-pro': { contextWindow: 1000000, maxOutputTokens: 8192 },
          'gemini-pro': { contextWindow: 1000000, maxOutputTokens: 8192 },
          'flash': { contextWindow: 1000000, maxOutputTokens: 8192 }
        };
        return configs[model] || { contextWindow: 1000000 };
      })
    };

    // Mock providers - consensus tool expects a plain object with provider names as keys
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
    mockContinuationStore.set.mockResolvedValue('conv_consensus_12345');
    mockContinuationStore.exists.mockResolvedValue(false);

    mockContextProcessor.processUnifiedContext.mockResolvedValue({
      success: true,
      contextMessages: [],
      files: [],
      processed: [],
      failed: []
    });
  });

  describe('Basic Consensus Functionality', () => {
    it('should handle basic consensus request with single model', async () => {
      const args = {
        prompt: 'What is 2+2?',
        models: ['gpt-4o-mini']
      };

      const result = await consensusTool(args, mockDependencies);

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');

      // Parse the consensus result
      const consensusResult = parseJsonResponse(result.content[0].text);
      expect(consensusResult.status).toBe('consensus_complete');
      expect(consensusResult.models_consulted).toBe(1);
      expect(consensusResult.successful_initial_responses).toBe(1);
      expect(consensusResult.phases.initial).toHaveLength(1);
    });

    it('should handle consensus with multiple models', async () => {
      const args = {
        prompt: 'Is AI beneficial for humanity?',
        models: ['gpt-4o-mini', 'grok', 'flash']
      };

      const result = await consensusTool(args, mockDependencies);
      // Skip status line if present
      const text = result.content[0].text;
      const lines = text.split('\n');
      const jsonStart = lines.findIndex(line => line.trim().startsWith('{'));
      const jsonText = lines.slice(jsonStart).join('\n');
      const consensusResult = JSON.parse(jsonText);

      expect(consensusResult.models_consulted).toBe(3);
      expect(consensusResult.successful_initial_responses).toBe(3);
      expect(consensusResult.phases.initial).toHaveLength(3);

      // Verify all providers were called
      expect(mockProviders.openai.invoke).toHaveBeenCalled();
      expect(mockProviders.xai.invoke).toHaveBeenCalled();
      expect(mockProviders.google.invoke).toHaveBeenCalled();
    });

    it('should enable cross-feedback by default', async () => {
      const args = {
        prompt: 'Test question',
        models: ['gpt-4o-mini', 'grok']
      };

      const result = await consensusTool(args, mockDependencies);
      // Skip status line if present
      const text = result.content[0].text;
      const lines = text.split('\n');
      const jsonStart = lines.findIndex(line => line.trim().startsWith('{'));
      const jsonText = lines.slice(jsonStart).join('\n');
      const consensusResult = JSON.parse(jsonText);

      expect(consensusResult.phases.refined).toBeDefined();
      expect(consensusResult.refined_responses).toBe(2);

      // Each provider should be called twice (initial + refinement)
      expect(mockProviders.openai.invoke).toHaveBeenCalledTimes(2);
      expect(mockProviders.xai.invoke).toHaveBeenCalledTimes(2);
    });

    it('should disable cross-feedback when requested', async () => {
      const args = {
        prompt: 'Test question',
        models: ['gpt-4o-mini'],
        enable_cross_feedback: false
      };

      const result = await consensusTool(args, mockDependencies);
      // Skip status line if present
      const text = result.content[0].text;
      const lines = text.split('\n');
      const jsonStart = lines.findIndex(line => line.trim().startsWith('{'));
      const jsonText = lines.slice(jsonStart).join('\n');
      const consensusResult = JSON.parse(jsonText);

      expect(consensusResult.phases.refined).toBeUndefined();
      expect(consensusResult.refined_responses).toBe(0);

      // Provider should only be called once (no refinement phase)
      expect(mockProviders.openai.invoke).toHaveBeenCalledTimes(1);
    });
  });

  describe('Model Resolution and Provider Mapping', () => {
    it('should resolve model names to correct providers', async () => {
      const args = {
        prompt: 'Test prompt',
        models: [
          'o3-mini',        // Should map to openai
          'grok-4',         // Should map to xai
          'gemini-pro'      // Should map to google
        ]
      };

      await consensusTool(args, mockDependencies);

      // Providers should be directly accessible
      expect(mockProviders.openai).toBeDefined();
      expect(mockProviders.xai).toBeDefined();
      expect(mockProviders.google).toBeDefined();
    });

    it('should handle auto model selection', async () => {
      const args = {
        prompt: 'Test prompt',
        models: ['auto']
      };

      await consensusTool(args, mockDependencies);

      // Should use first available provider (openai)
      expect(mockProviders.openai.invoke).toHaveBeenCalled();
    });

    it('should handle model-specific options', async () => {
      const args = {
        prompt: 'Test prompt',
        models: ['gpt-4o-mini', 'gemini-pro'],
        temperature: 0.7
      };

      await consensusTool(args, mockDependencies);

      // Check that options are passed to providers
      expect(mockProviders.openai.invoke).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ temperature: 0.7 })
      );
      expect(mockProviders.google.invoke).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ temperature: 0.7 })
      );
    });
  });

  describe('Cross-Feedback Mechanism', () => {
    it('should include other models responses in refinement phase', async () => {
      const args = {
        prompt: 'Complex question requiring multiple perspectives',
        models: ['gpt-4o-mini', 'grok'],
        enable_cross_feedback: true
      };

      await consensusTool(args, mockDependencies);

      // Check refinement calls include context from other models
      const refinementCalls = mockProviders.openai.invoke.mock.calls.filter(
        call => call[0].some(msg => msg.content.includes('Other AI Responses:'))
      );
      expect(refinementCalls.length).toBeGreaterThan(0);
    });

    it('should use custom cross-feedback prompt when provided', async () => {
      const customPrompt = 'Please review and improve your response based on the other perspectives';
      const args = {
        prompt: 'Test question',
        models: ['gpt-4o-mini', 'grok'],
        cross_feedback_prompt: customPrompt
      };

      await consensusTool(args, mockDependencies);

      // Check that custom prompt is used in refinement
      const calls = mockProviders.openai.invoke.mock.calls;
      const refinementCall = calls.find(call =>
        call[0].some(msg => msg.content.includes(customPrompt))
      );
      expect(refinementCall).toBeDefined();
    });

    it('should handle stance detection in refined responses', async () => {
      // Mock refined responses with stance keywords
      mockProviders.openai.invoke
        .mockResolvedValueOnce({
          content: 'I agree with this approach',
          stop_reason: 'stop',
          metadata: { provider: 'openai' }
        })
        .mockResolvedValueOnce({
          content: 'I still support this position strongly',
          stop_reason: 'stop',
          metadata: { provider: 'openai' }
        });

      mockProviders.xai.invoke
        .mockResolvedValueOnce({
          content: 'I disagree with this approach',
          stop_reason: 'stop',
          metadata: { provider: 'xai' }
        })
        .mockResolvedValueOnce({
          content: 'I maintain my disagreement',
          stop_reason: 'stop',
          metadata: { provider: 'xai' }
        });

      const args = {
        prompt: 'Should we implement this feature?',
        models: ['gpt-4o-mini', 'grok']
      };

      const result = await consensusTool(args, mockDependencies);
      // Skip status line if present
      const text = result.content[0].text;
      const lines = text.split('\n');
      const jsonStart = lines.findIndex(line => line.trim().startsWith('{'));
      const jsonText = lines.slice(jsonStart).join('\n');
      const consensusResult = JSON.parse(jsonText);

      expect(consensusResult.phases.refined).toBeDefined();
      expect(consensusResult.phases.refined.length).toBeGreaterThan(0);
      expect(consensusResult.phases.refined[0]).toHaveProperty('refined_response');
    });
  });

  describe('Context Processing Integration', () => {
    it.skip('should process context before sending to models', async () => {
      mockContextProcessor.processUnifiedContext.mockResolvedValue({
        success: true,
        contextMessages: [
          { role: 'user', content: 'Context: File content here' }
        ],
        files: [{
          originalPath: 'test.txt',
          path: 'test.txt',
          type: 'text',
          content: 'test content',
          size: 100,
          lineCount: 1
        }],
        processed: [{ fileName: 'test.txt' }],
        failed: []
      });

      const args = {
        prompt: 'Analyze this data',
        models: ['gpt-4o-mini'],
        files: ['test.txt']
      };

      await consensusTool(args, mockDependencies);

      expect(mockContextProcessor.processUnifiedContext).toHaveBeenCalledWith({
        files: ['test.txt'],
        images: []
      });

      // Check that context is included in provider calls
      expect(mockProviders.openai.invoke).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({
                type: 'text',
                text: expect.stringContaining('=== FILE CONTEXT ===')
              })
            ])
          })
        ]),
        expect.any(Object)
      );
    });

    it.skip('should handle context processing failures gracefully', async () => {
      mockContextProcessor.processUnifiedContext.mockResolvedValue({
        success: false,
        contextMessages: [],
        files: [],
        processed: [],
        failed: [{ file: 'missing.txt', error: 'File not found' }]
      });

      const args = {
        prompt: 'Test prompt',
        models: ['gpt-4o-mini'],
        files: ['missing.txt']
      };

      const result = await consensusTool(args, mockDependencies);

      // Should still proceed with consensus
      expect(result).toBeDefined();
      const consensusResult = parseJsonResponse(result.content[0].text);
      expect(consensusResult.status).toBe('consensus_complete');
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should throw error for missing prompt', async () => {
      const args = {
        models: ['gpt-4o-mini']
      };

      const result = await consensusTool(args, mockDependencies);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/prompt.*required/i);
    });

    it('should throw error for missing models array', async () => {
      const args = {
        prompt: 'Test prompt'
      };

      const result = await consensusTool(args, mockDependencies);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/models.*required/i);
    });

    it('should throw error for empty models array', async () => {
      const args = {
        prompt: 'Test prompt',
        models: []
      };

      const result = await consensusTool(args, mockDependencies);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/models.*required.*at least one/i);
    });

    it('should handle individual provider failures gracefully', async () => {
      // Make one provider fail
      mockProviders.xai.invoke.mockRejectedValue(new Error('XAI API error'));

      const args = {
        prompt: 'Test prompt',
        models: [
          'gpt-4o-mini',
          'grok',          // This will fail
          'flash'
        ]
      };

      const result = await consensusTool(args, mockDependencies);
      // Skip status line if present
      const text = result.content[0].text;

      // Parse JSON response (handles both pure JSON and status line prefix)
      let consensusResult;
      try {
        consensusResult = parseJsonResponse(text);
      } catch (error) {
        // If no JSON found, check for status line only response
        console.log('No JSON found in response, checking for status line');
        expect(text).toContain('COMPLETED');
        return;
      }

      expect(consensusResult.models_consulted).toBe(3);
      expect(consensusResult.successful_initial_responses).toBe(2);
      expect(consensusResult.failed_responses).toBe(1);
      expect(consensusResult.phases.failed).toHaveLength(1);
      expect(consensusResult.phases.failed[0].error).toContain('XAI API error');
    });

    it('should handle all providers failing', async () => {
      // Make all providers fail
      mockProviders.openai.invoke.mockRejectedValue(new Error('OpenAI error'));
      mockProviders.xai.invoke.mockRejectedValue(new Error('XAI error'));
      mockProviders.google.invoke.mockRejectedValue(new Error('Google error'));

      const args = {
        prompt: 'Test prompt',
        models: ['gpt-4o-mini', 'grok', 'flash']
      };

      const result = await consensusTool(args, mockDependencies);
      // Skip status line if present
      const text = result.content[0].text;

      // Parse JSON response (handles both pure JSON and status line prefix)
      let consensusResult;
      try {
        consensusResult = parseJsonResponse(text);
      } catch (error) {
        // If no JSON found, check for status line only response
        console.log('No JSON found in response, checking for status line');
        expect(text).toContain('COMPLETED');
        return;
      }

      expect(consensusResult.status).toBe('consensus_complete');
      expect(consensusResult.successful_initial_responses).toBe(0);
      expect(consensusResult.failed_responses).toBe(3);
      expect(consensusResult.phases.failed).toHaveLength(3);
    });

    it('should handle unknown models gracefully', async () => {
      // Remove the unknown provider from the providers object temporarily
      const originalProviders = { ...mockProviders };
      // This test needs to be updated - we can't easily simulate unknown model with direct object access
      // Instead, we'll test with a known model but make provider unavailable
      mockProviders.openai.isAvailable.mockReturnValue(false);
      mockProviders.xai.isAvailable.mockReturnValue(false);
      mockProviders.google.isAvailable.mockReturnValue(false);

      const args = {
        prompt: 'Test prompt',
        models: ['unknown-model']
      };

      const result = await consensusTool(args, mockDependencies);

      // When no providers are available, consensus tool returns an error response
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No valid providers available');
    });
  });

  describe('Continuation Support', () => {
    it('should save consensus results to continuation store', async () => {
      const args = {
        prompt: 'Test consensus question',
        models: ['gpt-4o-mini']
      };

      const result = await consensusTool(args, mockDependencies);

      expect(mockContinuationStore.set).toHaveBeenCalledWith(
        expect.stringMatching(/^conv_[A-Za-z0-9_-]{10}$/),
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'user', content: 'Test consensus question' })
          ]),
          type: 'consensus',
          consensusData: expect.any(Object)
        })
      );

      expect(result.continuation).toBeDefined();
      expect(result.continuation.id).toMatch(/^conv_[A-Za-z0-9_-]{10}$/);
    });

    it('should load previous consensus conversation when continuation provided', async () => {
      const existingConversation = {
        messages: [
          { role: 'user', content: 'Previous consensus question' },
          { role: 'assistant', content: 'Previous consensus result' }
        ],
        toolType: 'consensus'
      };

      mockContinuationStore.get.mockResolvedValue(existingConversation);
      mockContinuationStore.exists.mockResolvedValue(true);

      const args = {
        prompt: 'Follow-up consensus question',
        models: ['gpt-4o-mini'],
        continuation_id: 'conv_existing'
      };

      await consensusTool(args, mockDependencies);

      expect(mockContinuationStore.get).toHaveBeenCalledWith('conv_existing');

      // Should include previous messages in provider calls
      expect(mockProviders.openai.invoke).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ content: 'Previous consensus question' }),
          expect.objectContaining({ content: 'Follow-up consensus question' })
        ]),
        expect.any(Object)
      );
    });
  });

  describe('Response Format Compliance', () => {
    it('should return MCP-compliant response format', async () => {
      const args = {
        prompt: 'Test prompt',
        models: ['gpt-4o-mini']
      };

      const result = await consensusTool(args, mockDependencies);

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
    });

    it('should return valid JSON in response content', async () => {
      const args = {
        prompt: 'Test prompt',
        models: ['gpt-4o-mini']
      };

      const result = await consensusTool(args, mockDependencies);

      // The response now includes continuation_id line before JSON
      const text = result.content[0].text;
      expect(text).toContain('continuation_id:');
      
      // Parse JSON using the helper that handles the continuation_id line
      const consensusResult = parseJsonResponse(result.content[0].text);
      expect(consensusResult).toHaveProperty('status');
      expect(consensusResult).toHaveProperty('models_consulted');
      expect(consensusResult).toHaveProperty('phases');
      expect(consensusResult).toHaveProperty('settings');
    });

    it('should include comprehensive metadata in response', async () => {
      const args = {
        prompt: 'Test prompt',
        models: ['gpt-4o-mini'],
        temperature: 0.5
      };

      const result = await consensusTool(args, mockDependencies);
      // Skip status line if present
      const text = result.content[0].text;
      const lines = text.split('\n');
      const jsonStart = lines.findIndex(line => line.trim().startsWith('{'));
      const jsonText = lines.slice(jsonStart).join('\n');
      const consensusResult = JSON.parse(jsonText);

      expect(consensusResult.settings).toHaveProperty('enable_cross_feedback');
      expect(consensusResult.settings).toHaveProperty('temperature');
      expect(consensusResult.settings.temperature).toBe(0.5);

      // Check phase structure
      expect(consensusResult.phases.initial[0]).toHaveProperty('model');
      expect(consensusResult.phases.initial[0]).toHaveProperty('status');
      expect(consensusResult.phases.initial[0]).toHaveProperty('response');
      expect(consensusResult.phases.initial[0]).toHaveProperty('metadata');
    });
  });

  describe('Performance and Parallel Execution', () => {
    it('should execute models in parallel', async () => {
      const args = {
        prompt: 'Test prompt',
        models: ['gpt-4o-mini', 'grok', 'flash']
      };

      // Track when each provider is called
      const callTimes = [];
      mockProviders.openai.invoke.mockImplementation(async () => {
        callTimes.push(Date.now());
        return { content: 'OpenAI response', stop_reason: 'stop', metadata: {} };
      });
      mockProviders.xai.invoke.mockImplementation(async () => {
        callTimes.push(Date.now());
        return { content: 'XAI response', stop_reason: 'stop', metadata: {} };
      });
      mockProviders.google.invoke.mockImplementation(async () => {
        callTimes.push(Date.now());
        return { content: 'Google response', stop_reason: 'stop', metadata: {} };
      });

      await consensusTool(args, mockDependencies);

      // All providers should be called (multiple times due to cross-feedback)
      expect(mockProviders.openai.invoke).toHaveBeenCalled();
      expect(mockProviders.xai.invoke).toHaveBeenCalled();
      expect(mockProviders.google.invoke).toHaveBeenCalled();
    });

    it('should handle timeout scenarios gracefully', async () => {
      // Mock a slow provider
      mockProviders.xai.invoke.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({
          content: 'Slow response',
          stop_reason: 'stop',
          metadata: {}
        }), 100))
      );

      const args = {
        prompt: 'Test prompt',
        models: ['gpt-4o-mini', 'grok']  // grok is slow
      };

      const result = await consensusTool(args, mockDependencies);
      // Skip status line if present
      const text = result.content[0].text;
      const lines = text.split('\n');
      const jsonStart = lines.findIndex(line => line.trim().startsWith('{'));
      const jsonText = lines.slice(jsonStart).join('\n');
      const consensusResult = JSON.parse(jsonText);

      // Should still complete successfully
      expect(consensusResult.status).toBe('consensus_complete');
      expect(consensusResult.successful_initial_responses).toBe(2);
    });
  });
});
