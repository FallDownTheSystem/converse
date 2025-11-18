/**
 * Unit tests for ProviderStreamNormalizer
 * Tests normalization of provider-specific streaming formats into unified events
 */

import { describe, it, expect, beforeEach } from 'vitest';
import providerStreamNormalizer from '../../src/async/providerStreamNormalizer.js';
import { EVENT_TYPES } from '../../src/async/providerStreamNormalizer.js';

describe('ProviderStreamNormalizer', () => {
  let normalizer;

  beforeEach(() => {
    normalizer = providerStreamNormalizer;
  });

  describe('normalize() method', () => {
    it('should throw error for unsupported provider', async () => {
      const mockStream = async function* () {
        yield { type: 'start' };
      };

      await expect(async () => {
        for await (const event of normalizer.normalize(
          'unsupported',
          mockStream(),
        )) {
          // Should not reach here
        }
      }).rejects.toThrow(
        'Unsupported provider for streaming normalization: unsupported',
      );
    });

    it('should route to correct provider normalizer', async () => {
      const mockStream = async function* () {
        yield {
          type: 'start',
          timestamp: new Date().toISOString(),
          model: 'gpt-5',
          provider: 'openai',
        };
        yield {
          type: 'end',
          content: 'Hello',
          stop_reason: 'stop',
          metadata: { model: 'gpt-5' },
        };
      };

      const events = [];
      for await (const event of normalizer.normalize('openai', mockStream(), {
        model: 'gpt-5',
      })) {
        events.push(event);
      }

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe(EVENT_TYPES.START);
      expect(events[0].provider).toBe('openai');
      expect(events[1].type).toBe(EVENT_TYPES.END);
    });
  });

  describe('OpenAI Stream Normalization', () => {
    it('should normalize complete OpenAI Chat Completions stream', async () => {
      const mockOpenAIStream = async function* () {
        yield {
          type: 'start',
          timestamp: new Date().toISOString(),
          model: 'gpt-5',
          provider: 'openai',
          api_type: 'Chat Completions API',
        };
        yield {
          type: 'delta',
          content: 'Hello ',
          timestamp: new Date().toISOString(),
        };
        yield {
          type: 'delta',
          content: 'world!',
          timestamp: new Date().toISOString(),
        };
        yield {
          type: 'usage',
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            total_tokens: 15,
          },
          timestamp: new Date().toISOString(),
        };
        yield {
          type: 'end',
          content: 'Hello world!',
          stop_reason: 'stop',
          metadata: {
            model: 'gpt-5',
            usage: {
              input_tokens: 10,
              output_tokens: 5,
              total_tokens: 15,
            },
            provider: 'openai',
            api_type: 'Chat Completions API',
          },
          timestamp: new Date().toISOString(),
        };
      };

      const events = [];
      for await (const event of normalizer.normalize(
        'openai',
        mockOpenAIStream(),
        { model: 'gpt-5' },
      )) {
        events.push(event);
      }

      expect(events).toHaveLength(5);

      // Validate start event
      expect(events[0].type).toBe(EVENT_TYPES.START);
      expect(events[0].provider).toBe('openai');
      expect(events[0].model).toBe('gpt-5');
      expect(events[0].data.requestId).toBeDefined();

      // Validate delta events
      expect(events[1].type).toBe(EVENT_TYPES.DELTA);
      expect(events[1].data.textDelta).toBe('Hello ');
      expect(events[2].type).toBe(EVENT_TYPES.DELTA);
      expect(events[2].data.textDelta).toBe('world!');

      // Validate usage event
      expect(events[3].type).toBe(EVENT_TYPES.USAGE);
      expect(events[3].data.usage.inputTokens).toBe(10);
      expect(events[3].data.usage.outputTokens).toBe(5);
      expect(events[3].data.usage.totalTokens).toBe(15);

      // Validate end event
      expect(events[4].type).toBe(EVENT_TYPES.END);
      expect(events[4].data.content).toBe('Hello world!');
      expect(events[4].data.stopReason).toBe('stop');
      expect(events[4].data.usage.inputTokens).toBe(10);
    });

    it('should handle OpenAI Responses API format', async () => {
      const mockResponsesAPIStream = async function* () {
        yield {
          type: 'start',
          timestamp: new Date().toISOString(),
          model: 'gpt-5',
          provider: 'openai',
          api_type: 'Responses API',
        };
        yield {
          type: 'delta',
          content: 'Response API test',
          timestamp: new Date().toISOString(),
        };
        yield {
          type: 'end',
          content: 'Response API test',
          stop_reason: 'stop',
          metadata: {
            model: 'gpt-5',
            api_type: 'Responses API',
            usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 },
          },
          timestamp: new Date().toISOString(),
        };
      };

      const events = [];
      for await (const event of normalizer.normalize(
        'openai',
        mockResponsesAPIStream(),
      )) {
        events.push(event);
      }

      expect(events).toHaveLength(3);
      expect(events[0].type).toBe(EVENT_TYPES.START);
      expect(events[1].type).toBe(EVENT_TYPES.DELTA);
      expect(events[2].type).toBe(EVENT_TYPES.END);
      expect(events[2].data.metadata.api_type).toBe('Responses API');
    });
  });

  describe('XAI Stream Normalization', () => {
    it('should normalize XAI stream with search metadata', async () => {
      const mockXAIStream = async function* () {
        yield {
          type: 'start',
          timestamp: new Date().toISOString(),
          model: 'grok-4-0709',
          provider: 'xai',
        };
        yield {
          type: 'delta',
          content: 'XAI response with search',
          timestamp: new Date().toISOString(),
        };
        yield {
          type: 'usage',
          usage: {
            input_tokens: 15,
            output_tokens: 8,
            total_tokens: 23,
            search_sources_used: 3,
            search_cost_estimate: 0.075,
          },
          timestamp: new Date().toISOString(),
        };
        yield {
          type: 'end',
          content: 'XAI response with search',
          stop_reason: 'stop',
          metadata: {
            model: 'grok-4-0709',
            usage: { input_tokens: 15, output_tokens: 8, total_tokens: 23 },
            provider: 'xai',
            web_search_used: true,
          },
          timestamp: new Date().toISOString(),
        };
      };

      const events = [];
      for await (const event of normalizer.normalize('xai', mockXAIStream(), {
        model: 'grok-4-0709',
      })) {
        events.push(event);
      }

      expect(events).toHaveLength(4);
      expect(events[0].provider).toBe('xai');
      expect(events[2].data.usage.search_sources_used).toBe(3);
      expect(events[3].data.metadata.searchSourcesUsed).toBe(3);
      expect(events[3].data.metadata.searchCostEstimate).toBe(0.075);
    });
  });

  describe('Google GenAI Stream Normalization', () => {
    it('should normalize Google stream with grounding metadata', async () => {
      const mockGoogleStream = async function* () {
        yield {
          type: 'start',
          timestamp: new Date().toISOString(),
          model: 'gemini-2.5-pro',
          provider: 'google',
        };
        yield {
          type: 'delta',
          content: 'Google response',
          timestamp: new Date().toISOString(),
        };
        yield {
          type: 'usage',
          usage: {
            input_tokens: 20,
            output_tokens: 12,
            total_tokens: 32,
          },
          groundingMetadata: {
            groundingSupport: true,
            searchQueries: ['test query'],
          },
          timestamp: new Date().toISOString(),
        };
        yield {
          type: 'end',
          content: 'Google response',
          stop_reason: 'stop',
          metadata: {
            model: 'gemini-2.5-pro',
            usage: { input_tokens: 20, output_tokens: 12, total_tokens: 32 },
            provider: 'google',
          },
          timestamp: new Date().toISOString(),
        };
      };

      const events = [];
      for await (const event of normalizer.normalize(
        'google',
        mockGoogleStream(),
      )) {
        events.push(event);
      }

      expect(events).toHaveLength(4);
      expect(events[0].provider).toBe('google');
      expect(events[3].data.metadata.groundingSupport).toBe(true);
      expect(events[3].data.metadata.searchQueries).toEqual(['test query']);
    });
  });

  describe('Anthropic Stream Normalization', () => {
    it('should normalize Anthropic stream with thinking tokens', async () => {
      const mockAnthropicStream = async function* () {
        yield {
          type: 'start',
          timestamp: new Date().toISOString(),
          model: 'claude-3.5-sonnet',
          provider: 'anthropic',
        };
        yield {
          type: 'delta',
          content: '<thinking>Let me think...</thinking>',
          isThinking: true,
          timestamp: new Date().toISOString(),
        };
        yield {
          type: 'delta',
          content: 'Anthropic response',
          timestamp: new Date().toISOString(),
        };
        yield {
          type: 'usage',
          usage: {
            input_tokens: 25,
            output_tokens: 15,
            total_tokens: 40,
            thinking_tokens: 10,
            cache_creation_input_tokens: 100,
            cache_read_input_tokens: 50,
          },
          timestamp: new Date().toISOString(),
        };
        yield {
          type: 'end',
          content: '<thinking>Let me think...</thinking>Anthropic response',
          stop_reason: 'end_turn',
          metadata: {
            model: 'claude-3.5-sonnet',
            usage: {
              input_tokens: 25,
              output_tokens: 15,
              total_tokens: 40,
              thinking_tokens: 10,
            },
            provider: 'anthropic',
          },
          timestamp: new Date().toISOString(),
        };
      };

      const events = [];
      for await (const event of normalizer.normalize(
        'anthropic',
        mockAnthropicStream(),
      )) {
        events.push(event);
      }

      expect(events).toHaveLength(5);
      expect(events[0].provider).toBe('anthropic');
      expect(events[1].data.isThinking).toBe(true);
      expect(events[2].data.isThinking).toBe(false);
      expect(events[3].data.usage.thinking_tokens).toBe(10);
      expect(events[4].data.metadata.thinkingTokens).toBe(10);
      expect(events[4].data.metadata.cacheUsage.creation).toBe(100);
      expect(events[4].data.metadata.cacheUsage.read).toBe(50);
    });
  });

  describe('DeepSeek Stream Normalization', () => {
    it('should normalize DeepSeek stream with reasoning tokens', async () => {
      const mockDeepSeekStream = async function* () {
        yield {
          type: 'start',
          timestamp: new Date().toISOString(),
          model: 'deepseek-r1',
          provider: 'deepseek',
        };
        yield {
          type: 'delta',
          content: 'Reasoning content',
          isReasoning: true,
          timestamp: new Date().toISOString(),
        };
        yield {
          type: 'delta',
          content: 'Final answer',
          timestamp: new Date().toISOString(),
        };
        yield {
          type: 'usage',
          usage: {
            input_tokens: 30,
            output_tokens: 20,
            total_tokens: 50,
            reasoning_tokens: 15,
          },
          timestamp: new Date().toISOString(),
        };
        yield {
          type: 'end',
          content: 'Reasoning contentFinal answer',
          stop_reason: 'stop',
          metadata: {
            model: 'deepseek-r1',
            usage: { input_tokens: 30, output_tokens: 20, total_tokens: 50 },
            provider: 'deepseek',
          },
          timestamp: new Date().toISOString(),
        };
      };

      const events = [];
      for await (const event of normalizer.normalize(
        'deepseek',
        mockDeepSeekStream(),
      )) {
        events.push(event);
      }

      expect(events).toHaveLength(5);
      expect(events[0].provider).toBe('deepseek');
      expect(events[1].data.isReasoning).toBe(true);
      expect(events[2].data.isReasoning).toBe(false);
      expect(events[3].data.usage.reasoning_tokens).toBe(15);
      expect(events[4].data.metadata.reasoningTokens).toBe(15);
    });
  });

  describe('Error Handling', () => {
    it('should normalize error events correctly', async () => {
      const mockErrorStream = async function* () {
        yield {
          type: 'start',
          timestamp: new Date().toISOString(),
          model: 'gpt-5',
          provider: 'openai',
        };
        yield {
          type: 'error',
          error: {
            message: 'Rate limit exceeded',
            code: 'RATE_LIMIT_EXCEEDED',
            recoverable: true,
          },
          timestamp: new Date().toISOString(),
        };
      };

      const events = [];
      for await (const event of normalizer.normalize(
        'openai',
        mockErrorStream(),
      )) {
        events.push(event);
      }

      expect(events).toHaveLength(2);
      expect(events[1].type).toBe(EVENT_TYPES.ERROR);
      expect(events[1].data.error.message).toBe('Rate limit exceeded');
      expect(events[1].data.error.recoverable).toBe(true);
    });

    it('should handle stream processing errors', async () => {
      const mockFailingStream = async function* () {
        yield {
          type: 'start',
          timestamp: new Date().toISOString(),
          model: 'gpt-5',
          provider: 'openai',
        };
        throw new Error('Stream processing failed');
      };

      await expect(async () => {
        for await (const event of normalizer.normalize(
          'openai',
          mockFailingStream(),
        )) {
          // Should yield error event before throwing
        }
      }).rejects.toThrow('Stream processing failed');
    });
  });

  describe('Event Creation Methods', () => {
    it('should create valid start events', () => {
      const startEvent = normalizer.createStartEvent('openai', 'gpt-5', {
        requestId: 'test-123',
        estimatedTokens: 1000,
      });

      expect(startEvent.type).toBe(EVENT_TYPES.START);
      expect(startEvent.provider).toBe('openai');
      expect(startEvent.model).toBe('gpt-5');
      expect(startEvent.data.requestId).toBe('test-123');
      expect(startEvent.data.estimatedTokens).toBe(1000);
      expect(startEvent.timestamp).toBeGreaterThan(0);
    });

    it('should create valid delta events', () => {
      const deltaEvent = normalizer.createDeltaEvent(
        'Hello',
        'anthropic',
        'claude-3.5-sonnet',
        {
          isThinking: true,
        },
      );

      expect(deltaEvent.type).toBe(EVENT_TYPES.DELTA);
      expect(deltaEvent.data.textDelta).toBe('Hello');
      expect(deltaEvent.data.isThinking).toBe(true);
      expect(deltaEvent.data.role).toBe('assistant');
      expect(deltaEvent.data.index).toBe(0);
    });

    it('should create valid usage events', () => {
      const usage = {
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
        thinking_tokens: 25,
      };

      const usageEvent = normalizer.createUsageEvent(
        usage,
        'anthropic',
        'claude-3.5-sonnet',
      );

      expect(usageEvent.type).toBe(EVENT_TYPES.USAGE);
      expect(usageEvent.data.usage.inputTokens).toBe(100);
      expect(usageEvent.data.usage.outputTokens).toBe(50);
      expect(usageEvent.data.usage.totalTokens).toBe(150);
      expect(usageEvent.data.usage.thinking_tokens).toBe(25);
    });

    it('should create valid end events', () => {
      const params = {
        content: 'Final response',
        stopReason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
        responseTime: 2500,
        metadata: { model: 'claude-3.5-sonnet', provider: 'anthropic' },
      };

      const endEvent = normalizer.createEndEvent(
        params,
        'anthropic',
        'claude-3.5-sonnet',
      );

      expect(endEvent.type).toBe(EVENT_TYPES.END);
      expect(endEvent.data.content).toBe('Final response');
      expect(endEvent.data.stopReason).toBe('end_turn');
      expect(endEvent.data.usage.inputTokens).toBe(100);
      expect(endEvent.data.responseTimeMs).toBe(2500);
    });

    it('should create valid error events', () => {
      const error = new Error('Test error');
      error.code = 'TEST_ERROR';
      error.recoverable = true;

      const errorEvent = normalizer.createErrorEvent(error, 'openai', true);

      expect(errorEvent.type).toBe(EVENT_TYPES.ERROR);
      expect(errorEvent.data.error.message).toBe('Test error');
      expect(errorEvent.data.error.code).toBe('TEST_ERROR');
      expect(errorEvent.data.error.recoverable).toBe(true);
    });

    it('should determine error recoverability correctly', () => {
      const rateLimitError = {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limited',
      };
      const quotaError = { code: 'QUOTA_EXCEEDED', message: 'Quota exceeded' };
      const chunkError = {
        code: 'CHUNK_PROCESSING_ERROR',
        message: 'Chunk failed',
        recoverable: true,
      };

      const rateLimitEvent = normalizer.createErrorEvent(
        rateLimitError,
        'openai',
      );
      const quotaEvent = normalizer.createErrorEvent(quotaError, 'openai');
      const chunkEvent = normalizer.createErrorEvent(chunkError, 'openai');

      expect(rateLimitEvent.data.error.recoverable).toBe(true);
      expect(quotaEvent.data.error.recoverable).toBe(false);
      expect(chunkEvent.data.error.recoverable).toBe(true);
    });
  });

  describe('Stream Validation', () => {
    it('should validate complete valid stream', async () => {
      const mockValidStream = async function* () {
        yield normalizer.createStartEvent('openai', 'gpt-5');
        yield normalizer.createDeltaEvent('Hello', 'openai', 'gpt-5');
        yield normalizer.createUsageEvent(
          { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
          'openai',
          'gpt-5',
        );
        yield normalizer.createEndEvent(
          {
            content: 'Hello',
            stopReason: 'stop',
            usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
            responseTime: 1000,
          },
          'openai',
          'gpt-5',
        );
      };

      const validation = await normalizer.validateStream(mockValidStream());

      expect(validation.valid).toBe(true);
      expect(validation.hasStart).toBe(true);
      expect(validation.hasEnd).toBe(true);
      expect(validation.errorCount).toBe(0);
      expect(validation.totalEvents).toBe(4);
    });

    it('should detect invalid stream structure', async () => {
      const mockInvalidStream = async function* () {
        yield { invalidEvent: true }; // Missing required fields
      };

      const validation = await normalizer.validateStream(mockInvalidStream());

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('Invalid event structure');
    });

    it('should detect missing start or end events', async () => {
      const mockIncompleteStream = async function* () {
        yield normalizer.createDeltaEvent('Hello', 'openai', 'gpt-5');
        // Missing start and end events
      };

      const validation = await normalizer.validateStream(
        mockIncompleteStream(),
      );

      expect(validation.valid).toBe(false);
      expect(validation.hasStart).toBe(false);
      expect(validation.hasEnd).toBe(false);
    });

    it('should validate specific event types', async () => {
      const mockInvalidDeltaStream = async function* () {
        yield normalizer.createStartEvent('openai', 'gpt-5');
        yield {
          type: 'delta',
          provider: 'openai',
          model: 'gpt-5',
          timestamp: Date.now(),
          data: {},
        }; // Missing textDelta
        yield normalizer.createEndEvent(
          { content: '', stopReason: 'stop' },
          'openai',
          'gpt-5',
        );
      };

      const validation = await normalizer.validateStream(
        mockInvalidDeltaStream(),
      );

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('Delta event missing textDelta');
    });
  });

  describe('Case Sensitivity and Provider Names', () => {
    it('should handle case-insensitive provider names', async () => {
      const mockStream = async function* () {
        yield {
          type: 'start',
          timestamp: new Date().toISOString(),
          model: 'gpt-5',
          provider: 'openai',
        };
        yield {
          type: 'end',
          content: 'test',
          stop_reason: 'stop',
          metadata: {},
        };
      };

      const events1 = [];
      for await (const event of normalizer.normalize('OpenAI', mockStream())) {
        events1.push(event);
      }

      const events2 = [];
      for await (const event of normalizer.normalize('OPENAI', mockStream())) {
        events2.push(event);
      }

      expect(events1).toHaveLength(2);
      expect(events2).toHaveLength(2);
      expect(events1[0].provider).toBe('openai');
      expect(events2[0].provider).toBe('openai');
    });
  });

  describe('Provider-Specific Features', () => {
    it('should preserve OpenRouter routing metadata', async () => {
      const mockOpenRouterStream = async function* () {
        yield {
          type: 'start',
          timestamp: new Date().toISOString(),
          model: 'gpt-5',
          provider: 'openrouter',
        };
        yield {
          type: 'delta',
          content: 'test',
          timestamp: new Date().toISOString(),
        };
        yield {
          type: 'usage',
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
          routingInfo: { actualProvider: 'openai', cost: 0.002 },
          timestamp: new Date().toISOString(),
        };
        yield {
          type: 'end',
          content: 'test',
          stop_reason: 'stop',
          metadata: {
            usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
          },
          timestamp: new Date().toISOString(),
        };
      };

      const events = [];
      for await (const event of normalizer.normalize(
        'openrouter',
        mockOpenRouterStream(),
      )) {
        events.push(event);
      }

      const endEvent = events.find((e) => e.type === EVENT_TYPES.END);
      expect(endEvent.data.metadata.actualProvider).toBe('openai');
      expect(endEvent.data.metadata.cost).toBe(0.002);
    });

    it('should handle Mistral streaming format', async () => {
      const mockMistralStream = async function* () {
        yield {
          type: 'start',
          timestamp: new Date().toISOString(),
          model: 'mistral-large',
          provider: 'mistral',
        };
        yield {
          type: 'delta',
          content: 'Mistral response',
          timestamp: new Date().toISOString(),
        };
        yield {
          type: 'end',
          content: 'Mistral response',
          stop_reason: 'stop',
          metadata: {
            model: 'mistral-large',
            usage: { input_tokens: 8, output_tokens: 4, total_tokens: 12 },
          },
          timestamp: new Date().toISOString(),
        };
      };

      const events = [];
      for await (const event of normalizer.normalize(
        'mistral',
        mockMistralStream(),
      )) {
        events.push(event);
      }

      expect(events).toHaveLength(3);
      expect(events[0].provider).toBe('mistral');
      expect(events[1].data.textDelta).toBe('Mistral response');
      expect(events[2].data.usage.inputTokens).toBe(8);
    });
  });
});
