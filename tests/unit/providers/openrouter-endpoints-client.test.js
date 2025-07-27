/**
 * OpenRouter Endpoints API Client Tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchModelEndpoints,
  fetchModelEndpointsWithCache,
  createEndpointsCache,
  endpointsCache
} from '../../../src/providers/openrouter-endpoints-client.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('OpenRouter Endpoints API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetch.mockClear();
    endpointsCache.clear();
  });

  describe('parseModelId', () => {
    it('should parse valid model IDs', async () => {
      const mockResponse = {
        data: {
          id: 'anthropic/claude-3',
          name: 'Claude 3',
          endpoints: [{
            context_length: 200000,
            max_completion_tokens: 4096,
            provider_name: 'Anthropic',
            supported_parameters: ['temperature']
          }],
          architecture: {
            input_modalities: ['text']
          }
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse
      });

      const result = await fetchModelEndpoints('anthropic/claude-3');
      
      expect(fetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/models/anthropic/claude-3/endpoints',
        expect.objectContaining({
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        })
      );
      
      expect(result).toBeDefined();
      expect(result.modelName).toBe('anthropic/claude-3');
    });

    it('should return null for invalid model IDs', async () => {
      const invalidIds = [
        null,
        undefined,
        '',
        'no-slash',
        '/leading-slash',
        'trailing-slash/',
        'too/many/slashes'
      ];

      for (const id of invalidIds) {
        const result = await fetchModelEndpoints(id);
        expect(result).toBeNull();
        expect(fetch).not.toHaveBeenCalled();
      }
    });
  });

  describe('fetchModelEndpoints', () => {
    it('should convert endpoint data to model config', async () => {
      const mockResponse = {
        data: {
          id: 'anthropic/claude-sonnet-4',
          name: 'Anthropic: Claude Sonnet 4',
          description: 'Claude Sonnet 4 excels in coding',
          created: 1747930371,
          architecture: {
            tokenizer: 'Claude',
            instruct_type: null,
            modality: 'text+image->text',
            input_modalities: ['image', 'text'],
            output_modalities: ['text']
          },
          endpoints: [{
            name: 'Anthropic | anthropic/claude-4-sonnet',
            context_length: 200000,
            pricing: {
              prompt: '0.000003',
              completion: '0.000015',
              image: '0.0048'
            },
            provider_name: 'Anthropic',
            max_completion_tokens: 64000,
            max_prompt_tokens: null,
            supported_parameters: [
              'max_tokens',
              'temperature',
              'stop',
              'reasoning',
              'include_reasoning',
              'tools',
              'tool_choice'
            ]
          }]
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse
      });

      const config = await fetchModelEndpoints('anthropic/claude-sonnet-4');

      expect(config).toMatchObject({
        modelName: 'anthropic/claude-sonnet-4',
        friendlyName: 'Anthropic: Claude Sonnet 4',
        description: 'Claude Sonnet 4 excels in coding',
        contextWindow: 200000,
        maxOutputTokens: 64000,
        supportsStreaming: true,
        supportsImages: true,
        supportsTemperature: true,
        supportsThinking: true,
        supportsTools: true,
        isDynamic: true
      });

      expect(config.metadata).toMatchObject({
        selectedProvider: 'Anthropic',
        pricing: mockResponse.data.endpoints[0].pricing
      });
    });

    it('should handle 404 responses', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      const result = await fetchModelEndpoints('nonexistent/model');
      expect(result).toBeNull();
    });

    it('should handle network errors', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchModelEndpoints('test/model');
      expect(result).toBeNull();
    });

    it('should handle invalid response structure', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ invalid: 'response' })
      });

      const result = await fetchModelEndpoints('test/model');
      expect(result).toBeNull();
    });

    it('should prefer certain providers', async () => {
      const mockResponse = {
        data: {
          id: 'test/model',
          name: 'Test Model',
          endpoints: [
            {
              provider_name: 'Unknown Provider',
              context_length: 8192,
              max_completion_tokens: 2048,
              supported_parameters: []
            },
            {
              provider_name: 'Google',
              context_length: 128000,
              max_completion_tokens: 8192,
              supported_parameters: ['temperature']
            }
          ],
          architecture: { input_modalities: ['text'] }
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse
      });

      const config = await fetchModelEndpoints('test/model');

      // Should select Google endpoint over Unknown Provider
      expect(config.contextWindow).toBe(128000);
      expect(config.maxOutputTokens).toBe(8192);
      expect(config.metadata.selectedProvider).toBe('Google');
    });
  });

  describe('Cache functionality', () => {
    it('should cache successful responses', async () => {
      const mockResponse = {
        data: {
          id: 'cached/model',
          name: 'Cached Model',
          endpoints: [{
            context_length: 16384,
            max_completion_tokens: 4096,
            provider_name: 'TestProvider',
            supported_parameters: []
          }],
          architecture: { input_modalities: ['text'] }
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse
      });

      // First call - should fetch from API
      const result1 = await fetchModelEndpointsWithCache('cached/model');
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result1).toBeDefined();

      // Second call - should use cache
      const result2 = await fetchModelEndpointsWithCache('cached/model');
      expect(fetch).toHaveBeenCalledTimes(1); // Still only 1 call
      expect(result2).toEqual(result1);
    });

    it('should cache failed requests with shorter TTL', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      // First call - should fetch from API
      const result1 = await fetchModelEndpointsWithCache('notfound/model');
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result1).toBeNull();

      // Second call - should use cache
      const result2 = await fetchModelEndpointsWithCache('notfound/model');
      expect(fetch).toHaveBeenCalledTimes(1); // Still only 1 call
      expect(result2).toBeNull();
    });

    it('should provide cache management methods', () => {
      const cache = createEndpointsCache();
      
      expect(cache.size()).toBe(0);
      
      cache.set('test-key', { test: 'value' });
      expect(cache.size()).toBe(1);
      expect(cache.get('test-key')).toEqual({ found: true, value: { test: 'value' } });
      
      cache.clear();
      expect(cache.size()).toBe(0);
      expect(cache.get('test-key')).toEqual({ found: false, value: null });
    });

    it('should expire cache entries', () => {
      const cache = createEndpointsCache();
      
      // Set with immediate expiry
      cache.set('expired-key', { test: 'value' }, true);
      
      // Mock time passing (more than 5 minutes for failed TTL)
      const originalNow = Date.now;
      Date.now = vi.fn(() => originalNow() + 6 * 60 * 1000);
      
      expect(cache.get('expired-key')).toEqual({ found: false, value: null });
      
      // Restore Date.now
      Date.now = originalNow;
    });
  });
});