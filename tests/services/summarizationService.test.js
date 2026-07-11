/**
 * Tests for SummarizationService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SummarizationService } from '../../src/services/summarizationService.js';

describe('SummarizationService', () => {
  let mockProviders;
  let mockConfig;
  let service;

  beforeEach(() => {
    // Setup mock providers
    mockProviders = {
      openai: {
        isAvailable: vi.fn().mockReturnValue(true),
        invoke: vi.fn(),
      },
      google: {
        isAvailable: vi.fn().mockReturnValue(false),
        invoke: vi.fn(),
      },
    };

    // Setup mock config
    mockConfig = {
      apiKeys: {
        openai: 'test-key',
      },
      summarization: {
        enabled: true, // Enable summarization for tests
        model: null, // Use auto-selection
      },
    };

    // Create service instance
    service = new SummarizationService(mockProviders, mockConfig);
  });

  describe('generateTitle', () => {
    it('should generate a title when provider is available', async () => {
      mockProviders.openai.invoke.mockResolvedValue({
        content: 'Test Title for Request',
      });

      const title = await service.generateTitle(
        'Create a REST API endpoint for user authentication',
      );

      expect(title).toBe('Test Title for Request');
      expect(mockProviders.openai.invoke).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({
            role: 'user',
            content: 'Create a REST API endpoint for user authentication',
          }),
        ]),
        expect.objectContaining({
          model: 'gpt-5-nano', // Updated to new default
          maxTokens: 200, // Increased tokens
          reasoning_effort: 'minimal', // Added for speed
          config: mockConfig,
        }),
      );
    });

    it('should fallback to text snippet when provider fails', async () => {
      mockProviders.openai.invoke.mockRejectedValue(new Error('API error'));

      const title = await service.generateTitle(
        'Create a REST API endpoint for user authentication',
      );

      expect(title).toBe('Create a REST API endpoint for user authentication');
    });

    it('should truncate title to 60 characters', async () => {
      mockProviders.openai.invoke.mockResolvedValue({
        content:
          'This is a very long title that definitely exceeds sixty characters in total length',
      });

      const title = await service.generateTitle('Test prompt');

      // Note: trim() first, then substring(0, 60) gives exactly 60 chars
      expect(title).toBe('This is a very long title that definitely exceeds sixty char');
      expect(title.length).toBe(60);
    });

    it('should handle empty prompt gracefully', async () => {
      const title = await service.generateTitle('');

      expect(title).toBe('Untitled');
      expect(mockProviders.openai.invoke).not.toHaveBeenCalled();
    });
  });

  describe('generateStreamingSummary', () => {
    it('should generate streaming summary when provider is available', async () => {
      mockProviders.openai.invoke.mockResolvedValue({
        content:
          'Overall the code implements authentication. Currently working on JWT validation.',
      });

      const summary = await service.generateStreamingSummary(
        'Full implementation of authentication system',
        'JWT token validation',
      );

      expect(summary).toBe(
        'Overall the code implements authentication. Currently working on JWT validation.',
      );
      expect(mockProviders.openai.invoke).toHaveBeenCalled();
    });

    it('should fallback when provider unavailable', async () => {
      mockProviders.openai.isAvailable.mockReturnValue(false);

      const summary = await service.generateStreamingSummary(
        'Full implementation of authentication system',
        'JWT token validation',
      );

      expect(summary).toContain('Full implementation');
      expect(summary).toContain('JWT token validation');
      expect(mockProviders.openai.invoke).not.toHaveBeenCalled();
    });
  });

  describe('generateFinalSummary', () => {
    it('should generate final summary when provider is available', async () => {
      mockProviders.openai.invoke.mockResolvedValue({
        content:
          'Successfully implemented user authentication with JWT tokens.',
      });

      const summary = await service.generateFinalSummary(
        'Complete authentication implementation details...',
      );

      expect(summary).toBe(
        'Successfully implemented user authentication with JWT tokens.',
      );
      expect(mockProviders.openai.invoke).toHaveBeenCalled();
    });

    it('should fallback to text snippet on error', async () => {
      mockProviders.openai.invoke.mockRejectedValue(new Error('API error'));

      const summary = await service.generateFinalSummary(
        'Complete authentication implementation details...',
      );

      expect(summary).toContain(
        'Complete authentication implementation details',
      );
      expect(summary).toContain('...');
    });
  });

  describe('setEnabled', () => {
    it('should disable summarization when set to false', async () => {
      service.setEnabled(false);

      const title = await service.generateTitle('Test prompt');

      expect(title).toBe('Test prompt');
      expect(mockProviders.openai.invoke).not.toHaveBeenCalled();
    });

    it('should re-enable summarization when set to true', async () => {
      service.setEnabled(false);
      service.setEnabled(true);

      mockProviders.openai.invoke.mockResolvedValue({
        content: 'Generated Title',
      });

      const title = await service.generateTitle('Test prompt');

      expect(title).toBe('Generated Title');
      expect(mockProviders.openai.invoke).toHaveBeenCalled();
    });
  });

  describe('provider selection', () => {
    it('should use first available provider', async () => {
      mockProviders.openai.isAvailable.mockReturnValue(false);
      mockProviders.google.isAvailable.mockReturnValue(true);
      mockProviders.google.invoke.mockResolvedValue({
        content: 'Google Generated Title',
      });

      const title = await service.generateTitle('Test prompt');

      expect(title).toBe('Google Generated Title');
      expect(mockProviders.google.invoke).toHaveBeenCalled();
    });

    it('should fallback when no providers available', async () => {
      mockProviders.openai.isAvailable.mockReturnValue(false);
      mockProviders.google.isAvailable.mockReturnValue(false);

      const title = await service.generateTitle('Test prompt for fallback');

      expect(title).toBe('Test prompt for fallback');
      expect(mockProviders.openai.invoke).not.toHaveBeenCalled();
      expect(mockProviders.google.invoke).not.toHaveBeenCalled();
    });

    it('should use fallback when summarization is disabled', async () => {
      // Create service with summarization disabled
      const disabledConfig = {
        ...mockConfig,
        summarization: {
          enabled: false,
          model: null,
        },
      };
      const disabledService = new SummarizationService(
        mockProviders,
        disabledConfig,
      );

      const title = await disabledService.generateTitle(
        'Test prompt with disabled summarization',
      );

      // Should use fallback (truncated prompt)
      expect(title).toBe('Test prompt with disabled summarization');
      expect(mockProviders.openai.invoke).not.toHaveBeenCalled();
    });

    it('should use configured model when specified', async () => {
      // Create service with custom model
      const customModelConfig = {
        ...mockConfig,
        summarization: {
          enabled: true,
          model: 'gpt-4o-mini',
        },
      };
      const customService = new SummarizationService(
        mockProviders,
        customModelConfig,
      );

      mockProviders.openai.invoke.mockResolvedValue({
        content: 'Custom Model Title',
      });

      const title = await customService.generateTitle('Test with custom model');

      expect(title).toBe('Custom Model Title');
      expect(mockProviders.openai.invoke).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          model: 'gpt-4o-mini',
        }),
      );
    });
  });
});
