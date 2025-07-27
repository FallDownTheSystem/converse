/**
 * Example test demonstrating usage of shared test utilities
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import testUtils, {
  createMockProvider,
  createMockOpenAIProvider,
  createMockChatTool,
  createMockProviderRegistry,
  createMockResponse,
  helpers,
  fixtures
} from '../index.js';

describe('Shared Test Utilities Usage Examples', () => {
  let mockConfig;
  let mockLogger;
  let env;

  beforeEach(() => {
    // Use setup helper
    helpers.setup.beforeEachTest();
    
    // Create mock configuration
    mockConfig = helpers.config.createMockConfig({
      server: { port: 3000 }
    });
    
    // Create mock logger
    mockLogger = helpers.logging.createMockLogger();
    
    // Setup test environment
    env = helpers.setup.setupTestEnvironment({
      LOG_LEVEL: 'debug'
    });
  });

  afterEach(() => {
    // Cleanup
    helpers.setup.afterEachTest();
    env.restore();
  });

  describe('Mock Provider Examples', () => {
    it('should create a basic mock provider', () => {
      const provider = createMockProvider({
        name: 'test-provider'
      });

      expect(provider.name).toBe('test-provider');
      expect(provider.invoke).toBeDefined();
      expect(provider.validateConfig()).toBe(true);
    });

    it('should create provider-specific mocks', async () => {
      const openai = createMockOpenAIProvider();
      
      expect(openai.name).toBe('openai');
      expect(openai.getSupportedModels()).toContain('gpt-4');
      
      const result = await openai.invoke();
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('usage');
    });

    it('should use mock provider registry', () => {
      const registry = createMockProviderRegistry();
      
      expect(registry.list()).toContain('openai');
      expect(registry.list()).toContain('google');
      expect(registry.list()).toContain('xai');
      
      const openai = registry.get('openai');
      expect(openai).toBeDefined();
      expect(openai.name).toBe('openai');
    });
  });

  describe('Mock Tool Examples', () => {
    it('should create mock chat tool', async () => {
      const chatTool = createMockChatTool();
      
      const result = await chatTool.handler({
        prompt: 'Hello',
        model: 'gpt-4'
      });
      
      expect(result).toHaveProperty('result');
      expect(result).toHaveProperty('continuation_id');
      expect(result).toHaveProperty('model_used');
    });
  });

  describe('Helper Utilities Examples', () => {
    it('should use async helpers', async () => {
      const deferred = helpers.async.createDeferred();
      
      setTimeout(() => deferred.resolve('done'), 100);
      
      const result = await deferred.promise;
      expect(result).toBe('done');
    });

    it('should use filesystem mocks', async () => {
      const fs = helpers.filesystem.mockFileSystem();
      
      await fs.writeFile('/test.txt', 'Hello');
      const content = await fs.readFile('/test.txt');
      
      expect(content).toBe('Hello');
      expect(fs.writeFile).toHaveBeenCalledWith('/test.txt', 'Hello');
    });

    it('should use continuation store mock', () => {
      const store = helpers.stores.createMockContinuationStore();
      
      store.set('test-123', { data: 'test' });
      
      expect(store.exists('test-123')).toBe(true);
      expect(store.get('test-123')).toEqual({ data: 'test' });
    });
  });

  describe('Fixture Examples', () => {
    it('should use response fixtures', () => {
      const openaiResponse = fixtures.responses.openai.chat;
      
      expect(openaiResponse).toHaveProperty('id');
      expect(openaiResponse).toHaveProperty('choices');
      expect(openaiResponse.choices[0].message.content).toContain('OpenAI');
    });

    it('should use prompt fixtures', () => {
      const simplePrompt = fixtures.prompts.simple;
      const complexPrompt = fixtures.prompts.complex;
      
      expect(simplePrompt).toBe('What is 2+2?');
      expect(complexPrompt).toContain('recursion');
    });

    it('should create test matrix', () => {
      const matrix = fixtures.createTestMatrix({
        providers: ['openai', 'google'],
        models: ['gpt-4', 'gemini-2.5-pro'],
        scenarios: ['success']
      });
      
      expect(matrix).toHaveLength(4);
      expect(matrix[0]).toHaveProperty('provider');
      expect(matrix[0]).toHaveProperty('model');
      expect(matrix[0]).toHaveProperty('scenario');
    });
  });

  describe('Integration Examples', () => {
    it('should combine utilities for complex test scenarios', async () => {
      // Create mock provider with custom response
      const provider = createMockProvider({
        invoke: vi.fn().mockResolvedValue(
          createMockResponse({
            content: fixtures.prompts.simple,
            model: 'gpt-4'
          })
        )
      });
      
      // Use the provider
      const result = await provider.invoke({
        prompt: fixtures.prompts.simple
      });
      
      // Assert using helpers
      helpers.assertions.expectPartialMatch(result, {
        content: fixtures.prompts.simple,
        model: 'gpt-4'
      });
    });
  });
});