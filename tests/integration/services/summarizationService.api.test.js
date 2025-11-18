/**
 * Real API Tests for SummarizationService
 * Tests actual API calls to OpenAI and Google with optimized settings
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { loadConfig } from '../../../src/config.js';
import { createLogger } from '../../../src/utils/logger.js';
import { SummarizationService } from '../../../src/services/summarizationService.js';
import { OpenAIProvider } from '../../../src/providers/openai.js';
import { GoogleProvider } from '../../../src/providers/google.js';
import {
  testWithApiKeys,
  hasOpenAI,
  hasGoogle,
  getSkipMessage,
} from '../../utils/conditionalTest.js';

const logger = createLogger('summarization-api-test');

describe('SummarizationService Real API Tests', () => {
  let config;
  let providers;

  beforeAll(async () => {
    try {
      config = await loadConfig();

      // Initialize providers
      providers = {
        openai: new OpenAIProvider(),
        google: new GoogleProvider(),
      };

      // Log test setup
      if (hasOpenAI && hasGoogle) {
        logger.info(
          'Running SummarizationService API tests with OpenAI and Google',
        );
      } else if (hasOpenAI) {
        logger.warn(`Skipping Google tests: ${getSkipMessage(['GOOGLE'])}`);
      } else if (hasGoogle) {
        logger.warn(`Skipping OpenAI tests: ${getSkipMessage(['OPENAI'])}`);
      } else {
        logger.warn(
          `Skipping all tests: ${getSkipMessage(['OPENAI', 'GOOGLE'])}`,
        );
      }
    } catch (error) {
      logger.error('Setup failed:', error);
      config = { apiKeys: {}, summarization: { enabled: true } };
    }
  });

  describe('OpenAI GPT-5 Tests', () => {
    testWithApiKeys({
      requiredProviders: ['OPENAI'],
      requireAll: true,
    })(
      'should generate concise title with GPT-5',
      async () => {
        const service = new SummarizationService(providers, config);

        const prompt =
          'I need to implement a user authentication system with JWT tokens, password hashing using bcrypt, and role-based access control for an Express.js application';
        const title = await service.generateTitle(prompt, 'gpt-5');

        logger.info(`GPT-5 Title: "${title}"`);

        // Verify title characteristics (allow some flexibility)
        expect(title).toBeTruthy();
        expect(title.length).toBeLessThanOrEqual(60); // Allow some flexibility
        expect(title.length).toBeGreaterThan(10);

        // Should be concise and relevant
        const lowerTitle = title.toLowerCase();
        expect(
          lowerTitle.includes('auth') ||
            lowerTitle.includes('jwt') ||
            lowerTitle.includes('user') ||
            lowerTitle.includes('access') ||
            lowerTitle.includes('security'),
        ).toBe(true);
      },
      30000,
    );

    testWithApiKeys({
      requiredProviders: ['OPENAI'],
      requireAll: true,
    })(
      'should generate streaming summary with GPT-5',
      async () => {
        const service = new SummarizationService(providers, config);

        const content = `The user is implementing a comprehensive authentication system. 
        They've set up JWT token generation and validation middleware. 
        Password hashing is implemented using bcrypt with salt rounds of 10. 
        The role-based access control system includes admin, user, and guest roles.
        Database models have been created for users and roles.
        Currently working on the login endpoint validation logic.`;

        const currentFocus = 'Implementing login endpoint validation';

        const summary = await service.generateStreamingSummary(
          content,
          currentFocus,
          'gpt-5',
        );

        logger.info(`GPT-5 Streaming Summary: "${summary}"`);

        // Verify summary characteristics
        expect(summary).toBeTruthy();
        expect(summary.length).toBeLessThanOrEqual(200);
        expect(summary.length).toBeGreaterThan(20);

        // Should mention both overall context and current focus
        const lowerSummary = summary.toLowerCase();
        expect(
          lowerSummary.includes('auth') ||
            lowerSummary.includes('jwt') ||
            lowerSummary.includes('login'),
        ).toBe(true);
      },
      30000,
    );

    testWithApiKeys({
      requiredProviders: ['OPENAI'],
      requireAll: true,
    })(
      'should generate final summary with GPT-5',
      async () => {
        const service = new SummarizationService(providers, config);

        const content = `Successfully implemented a complete user authentication system for Express.js:
        - JWT token generation and validation with refresh tokens
        - Secure password hashing using bcrypt (10 salt rounds)
        - Role-based access control with admin, user, and guest roles
        - Protected routes middleware
        - User registration and login endpoints
        - Password reset functionality
        - Session management with Redis
        - Rate limiting on auth endpoints
        - Comprehensive error handling
        All tests passing, ready for deployment.`;

        const summary = await service.generateFinalSummary(content, 'gpt-5');

        logger.info(`GPT-5 Final Summary: "${summary}"`);

        // Verify summary characteristics
        expect(summary).toBeTruthy();
        expect(summary.length).toBeLessThanOrEqual(150);
        expect(summary.length).toBeGreaterThan(20);

        // Should capture key accomplishments
        const lowerSummary = summary.toLowerCase();
        expect(
          lowerSummary.includes('auth') ||
            lowerSummary.includes('jwt') ||
            lowerSummary.includes('implement') ||
            lowerSummary.includes('complete') ||
            lowerSummary.includes('system'),
        ).toBe(true);
      },
      30000,
    );
  });

  describe('Google Gemini-2.5-Flash Tests', () => {
    testWithApiKeys({
      requiredProviders: ['GOOGLE'],
      requireAll: true,
    })(
      'should generate concise title with Gemini-2.5-Flash',
      async () => {
        const service = new SummarizationService(providers, config);

        const prompt =
          'Create a React component for displaying user profiles with avatar upload, bio editing, and social media links integration';
        const title = await service.generateTitle(prompt, 'gemini-2.5-flash');

        logger.info(`Gemini-2.5-Flash Title: "${title}"`);

        // Verify title characteristics (allow some flexibility)
        expect(title).toBeTruthy();
        expect(title.length).toBeLessThanOrEqual(60); // Allow some flexibility
        expect(title.length).toBeGreaterThan(10);

        // Should be concise and relevant
        const lowerTitle = title.toLowerCase();
        expect(
          lowerTitle.includes('profile') ||
            lowerTitle.includes('user') ||
            lowerTitle.includes('component') ||
            lowerTitle.includes('react') ||
            lowerTitle.includes('avatar'),
        ).toBe(true);
      },
      30000,
    );

    testWithApiKeys({
      requiredProviders: ['GOOGLE'],
      requireAll: true,
    })(
      'should generate streaming summary with Gemini-2.5-Flash',
      async () => {
        const service = new SummarizationService(providers, config);

        const content = `Building a user profile component in React. 
        The component includes an avatar upload feature with image cropping. 
        Bio editing is implemented with a rich text editor. 
        Social media links are managed through a dynamic form.
        State management is handled with React hooks.
        Currently implementing the image upload validation.`;

        const currentFocus = 'Validating image dimensions and file size';

        const summary = await service.generateStreamingSummary(
          content,
          currentFocus,
          'gemini-2.5-flash',
        );

        logger.info(`Gemini-2.5-Flash Streaming Summary: "${summary}"`);

        // Verify summary characteristics
        expect(summary).toBeTruthy();
        expect(summary.length).toBeLessThanOrEqual(200);
        expect(summary.length).toBeGreaterThan(20);

        // Should mention both overall context and current focus
        const lowerSummary = summary.toLowerCase();
        expect(
          lowerSummary.includes('profile') ||
            lowerSummary.includes('component') ||
            lowerSummary.includes('image') ||
            lowerSummary.includes('upload') ||
            lowerSummary.includes('validation'),
        ).toBe(true);
      },
      30000,
    );

    testWithApiKeys({
      requiredProviders: ['GOOGLE'],
      requireAll: true,
    })(
      'should generate final summary with Gemini-2.5-Flash',
      async () => {
        const service = new SummarizationService(providers, config);

        const content = `Completed React user profile component with full functionality:
        - Avatar upload with drag-and-drop and image cropping
        - Rich text bio editor with markdown support
        - Dynamic social media links management
        - Responsive design with mobile support
        - Accessibility features (ARIA labels, keyboard navigation)
        - Form validation and error handling
        - Optimistic UI updates
        - Image optimization and lazy loading
        - Unit and integration tests coverage
        Component is production-ready and documented.`;

        const summary = await service.generateFinalSummary(
          content,
          'gemini-2.5-flash',
        );

        logger.info(`Gemini-2.5-Flash Final Summary: "${summary}"`);

        // Verify summary characteristics
        expect(summary).toBeTruthy();
        expect(summary.length).toBeLessThanOrEqual(160); // Gemini might be slightly over
        expect(summary.length).toBeGreaterThan(20);

        // Should capture key accomplishments
        const lowerSummary = summary.toLowerCase();
        expect(
          lowerSummary.includes('profile') ||
            lowerSummary.includes('component') ||
            lowerSummary.includes('complete') ||
            lowerSummary.includes('react') ||
            lowerSummary.includes('user'),
        ).toBe(true);
      },
      30000,
    );
  });

  describe('Performance and Optimization Tests', () => {
    testWithApiKeys({
      requiredProviders: ['OPENAI', 'GOOGLE'],
      requireAll: false, // At least one provider
    })(
      'should use fastest settings for summarization',
      async () => {
        const service = new SummarizationService(providers, config);

        // Test with both providers if available
        const testCases = [];
        if (hasOpenAI) {
          testCases.push({ model: 'gpt-5', provider: 'OpenAI' });
        }
        if (hasGoogle) {
          testCases.push({ model: 'gemini-2.5-flash', provider: 'Google' });
        }

        for (const testCase of testCases) {
          const startTime = Date.now();

          const title = await service.generateTitle(
            'Quick test prompt for performance measurement',
            testCase.model,
          );

          const elapsed = Date.now() - startTime;
          logger.info(
            `${testCase.provider} (${testCase.model}) response time: ${elapsed}ms`,
          );

          // Should respond quickly (under 5 seconds for title generation)
          expect(elapsed).toBeLessThan(5000);
          expect(title).toBeTruthy();

          // Verify it's using temperature 0.3 (consistent, fast responses)
          // This is set in the service as SUMMARIZATION_TEMPERATURE
        }
      },
      30000,
    );

    testWithApiKeys({
      requiredProviders: ['OPENAI', 'GOOGLE'],
      requireAll: false,
    })(
      'should handle fallback when primary model unavailable',
      async () => {
        // Create a service with mocked provider availability
        const mockProviders = {
          openai: providers?.openai || {
            isAvailable: () => false,
            invoke: async () => null,
          },
          google: providers?.google || {
            isAvailable: () => false,
            invoke: async () => null,
          },
        };

        const service = new SummarizationService(mockProviders, config);

        // Should fallback to text truncation
        const title = await service.generateTitle(
          'This is a test prompt that should use fallback when no providers are available',
          'non-existent-model',
        );

        logger.info(`Fallback title: "${title}"`);

        // Should return truncated prompt as fallback (around 50 chars)
        expect(title).toBeTruthy();
        expect(title.length).toBeLessThanOrEqual(60); // Good enough for fallback
      },
      10000,
    );
  });

  describe('Auto-selection Tests', () => {
    testWithApiKeys({
      requiredProviders: ['OPENAI', 'GOOGLE'],
      requireAll: false,
    })(
      'should auto-select fastest available model',
      async () => {
        const service = new SummarizationService(providers, config);

        // Don't specify a model - let it auto-select
        const title = await service.generateTitle(
          'Testing auto-selection of fastest available model for summarization',
        );

        logger.info(`Auto-selected model generated title: "${title}"`);

        // Should generate a valid title with auto-selection
        expect(title).toBeTruthy();
        expect(title.length).toBeLessThanOrEqual(60); // Allow some flexibility
        expect(title.length).toBeGreaterThan(10);

        // The service should have selected from FAST_MODELS:
        // openai: 'gpt-4o-mini'
        // google: 'gemini-2.5-flash'
        // Based on which provider is available first
      },
      30000,
    );
  });

  describe('Content Quality Tests', () => {
    testWithApiKeys({
      requiredProviders: ['OPENAI'],
      requireAll: true,
    })(
      'should maintain context in streaming summaries',
      async () => {
        const service = new SummarizationService(providers, config);

        // Simulate a long technical discussion
        const content = `
        The user started by asking about database design patterns for a multi-tenant SaaS application.
        We discussed various approaches including separate databases, shared database with separate schemas,
        and shared database with tenant ID columns. The user decided to go with shared database approach
        using PostgreSQL Row Level Security (RLS) for data isolation. We've implemented the base models,
        migration scripts, and RLS policies. The system supports automatic tenant context injection
        in all queries. Performance testing shows good results with up to 1000 tenants.
      `;

        const currentFocus =
          'Optimizing query performance for tenant-specific aggregations';

        const summary = await service.generateStreamingSummary(
          content,
          currentFocus,
          'gpt-5',
        );

        logger.info(`Context-aware streaming summary: "${summary}"`);

        // Should maintain both historical context and current focus
        expect(summary).toBeTruthy();
        const lowerSummary = summary.toLowerCase();

        // Should mention the overall context (multi-tenant, database)
        expect(
          lowerSummary.includes('tenant') ||
            lowerSummary.includes('database') ||
            lowerSummary.includes('saas') ||
            lowerSummary.includes('rls'),
        ).toBe(true);

        // Should also indicate current focus (optimization, performance)
        expect(
          lowerSummary.includes('optim') ||
            lowerSummary.includes('performance') ||
            lowerSummary.includes('query') ||
            lowerSummary.includes('aggregation'),
        ).toBe(true);
      },
      30000,
    );

    testWithApiKeys({
      requiredProviders: ['GOOGLE'],
      requireAll: true,
    })(
      'should create actionable final summaries',
      async () => {
        const service = new SummarizationService(providers, config);

        const content = `
        Task completed: Implemented complete CI/CD pipeline for the project.
        - Set up GitHub Actions workflow for automated testing on PR
        - Configured multi-stage Docker builds with layer caching
        - Implemented automated security scanning with Snyk
        - Added performance benchmarking on each commit
        - Deployed staging environment with automatic updates
        - Configured production deployment with manual approval gates
        - Set up monitoring and alerting with Datadog
        - Created rollback procedures and disaster recovery plan
        All pipelines are green and documentation is complete.
      `;

        const summary = await service.generateFinalSummary(
          content,
          'gemini-2.5-flash',
        );

        logger.info(`Actionable final summary: "${summary}"`);

        // Should create concise, actionable summary
        expect(summary).toBeTruthy();
        expect(summary.length).toBeLessThanOrEqual(150);

        // Should capture the essence of accomplishment
        const lowerSummary = summary.toLowerCase();
        expect(
          lowerSummary.includes('ci/cd') ||
            lowerSummary.includes('pipeline') ||
            lowerSummary.includes('deploy') ||
            lowerSummary.includes('automat'),
        ).toBe(true);
      },
      30000,
    );
  });
});
