/**
 * Example: Migrating Tests to Use Centralized Fixtures
 * This file demonstrates how to update existing tests to use the new fixture system
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fixtureLoader } from '../loader.js';

describe('Migration Example: Provider Tests', () => {
  // BEFORE: Hardcoded mock responses
  /*
  const mockResponse = {
    id: 'chatcmpl-123',
    object: 'chat.completion',
    created: 1234567890,
    model: 'gpt-4',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: 'Test response' },
      finish_reason: 'stop'
    }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
  };
  */

  // AFTER: Using centralized fixtures
  const mockResponse = fixtureLoader.getProviderResponse('openai', 'gpt-4');

  it('should handle provider response', () => {
    expect(mockResponse.choices[0].message.content).toBeDefined();
    expect(mockResponse.model).toBe('gpt-4');
  });
});

describe('Migration Example: Error Handling', () => {
  // BEFORE: Inline error objects
  /*
  const rateLimitError = {
    error: {
      message: 'Rate limit exceeded',
      type: 'rate_limit_error',
      code: 'rate_limit_exceeded'
    }
  };
  */

  // AFTER: Using error fixtures
  const rateLimitError = fixtureLoader.getErrorScenario('openai', 'rateLimit');

  it('should handle rate limit errors', () => {
    expect(rateLimitError.error.code).toBe('rate_limit_exceeded');
  });
});

describe('Migration Example: Tool Testing', () => {
  // BEFORE: Manual test data creation
  /*
  const chatRequest = {
    prompt: 'What is 2+2?',
    model: 'gpt-4o-mini',
    temperature: 0.7
  };
  const expectedResponse = {
    content: '2+2 equals 4.',
    metadata: {
      model: 'gpt-4o-mini',
      provider: 'openai',
      usage: { prompt_tokens: 8, completion_tokens: 10, total_tokens: 18 }
    }
  };
  */

  // AFTER: Using tool fixtures
  const { request, response } = fixtureLoader.getToolFixture('chat', 'basic');

  it('should process chat request', () => {
    expect(request.prompt).toBeDefined();
    expect(response.content).toBeDefined();
    expect(response.metadata.model).toBe('gpt-4o-mini');
  });
});

describe('Migration Example: Edge Case Testing', () => {
  // BEFORE: Hardcoded edge cases
  /*
  const testStrings = [
    '',
    '   ',
    'Hello 世界 🌍',
    'test@example.com',
    '../../../etc/passwd'
  ];
  */

  // AFTER: Using comprehensive edge case fixtures
  const emptyString = fixtureLoader.getEdgeCase('strings', 'empty');
  const unicodeString = fixtureLoader.getEdgeCase('strings', 'unicode');
  const sqlInjection = fixtureLoader.getEdgeCase('strings', 'sql_injection');

  it('should handle edge case strings', () => {
    expect(emptyString).toBe('');
    expect(unicodeString).toContain('🌍');
    expect(sqlInjection).toContain('DROP TABLE');
  });
});

describe('Migration Example: File Testing', () => {
  // BEFORE: Creating test files on the fly
  /*
  const testFile = 'test content';
  const testPath = '/tmp/test.txt';
  fs.writeFileSync(testPath, testFile);
  */

  // AFTER: Using pre-created file fixtures
  const jsCode = fixtureLoader.loadFile('sample.js');
  const largeFile = fixtureLoader.getFileMetadata('large-text.txt');

  it('should load file fixtures', () => {
    expect(jsCode).toContain('function');
    expect(largeFile.size).toBeGreaterThan(1000);
    expect(largeFile.lines).toBeGreaterThan(50);
  });
});

describe('Migration Example: Streaming Responses', () => {
  // BEFORE: Manually creating streaming chunks
  /*
  const chunks = [
    { choices: [{ delta: { content: 'Hello' } }] },
    { choices: [{ delta: { content: ' world' } }] },
    { choices: [{ delta: { content: '!' }, finish_reason: 'stop' }] }
  ];
  */

  // AFTER: Using streaming response generator
  const chunks = fixtureLoader.createStreamingChunks('openai', [
    'Hello',
    ' world',
    '!',
  ]);

  it('should generate streaming chunks', () => {
    expect(chunks).toHaveLength(3);
    expect(chunks[0].choices[0].delta.content).toBe('Hello');
    expect(chunks[2].choices[0].finish_reason).toBe('stop');
  });
});

describe('Migration Example: Test Matrix', () => {
  // BEFORE: Manual loops for multiple providers/models
  /*
  const providers = ['openai', 'google', 'xai'];
  const models = {
    openai: ['gpt-4', 'gpt-3.5-turbo'],
    google: ['gemini-2.5-pro'],
    xai: ['grok-4']
  };

  providers.forEach(provider => {
    models[provider].forEach(model => {
      it(`should test ${provider}/${model}`, () => {
        // test logic
      });
    });
  });
  */

  // AFTER: Using test matrix generator
  const testMatrix = fixtureLoader.generateTestMatrix({
    providers: ['openai', 'google'],
    models: {
      openai: ['gpt-4', 'gpt-3.5-turbo'],
      google: ['gemini-2.5-pro'],
    },
    scenarios: ['success', 'error'],
  });

  testMatrix.forEach(({ provider, model, scenario }) => {
    it(`should handle ${scenario} scenario for ${provider}/${model}`, () => {
      if (scenario === 'success') {
        const response = fixtureLoader.getProviderResponse(provider, model);
        expect(response).toBeDefined();
      } else {
        const error = fixtureLoader.getErrorScenario(provider, 'rateLimit');
        expect(error).toBeDefined();
      }
    });
  });
});

describe('Migration Example: Custom Mock Responses', () => {
  // BEFORE: Building mock responses from scratch
  /*
  const createMockResponse = (content) => ({
    id: 'test-id',
    object: 'chat.completion',
    created: Date.now(),
    model: 'gpt-4',
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: 'stop'
    }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
  });
  */

  // AFTER: Using fixture helper
  const customResponse = fixtureLoader.createMockResponse(
    'openai',
    'gpt-4',
    'This is my custom response',
    { usage: { total_tokens: 50 } },
  );

  it('should create custom mock response', () => {
    expect(customResponse.choices[0].message.content).toBe(
      'This is my custom response',
    );
    expect(customResponse.usage.total_tokens).toBe(50);
  });
});

/**
 * Migration Checklist:
 *
 * 1. Replace hardcoded mock data with fixture loader calls
 * 2. Use getProviderResponse() for provider-specific responses
 * 3. Use getToolFixture() for tool-specific test scenarios
 * 4. Use getErrorScenario() for error testing
 * 5. Use getEdgeCase() for edge case values
 * 6. Use loadFile() instead of creating test files
 * 7. Use createStreamingChunks() for streaming tests
 * 8. Use generateTestMatrix() for parameterized tests
 * 9. Use createMockResponse() for custom responses
 * 10. Clean up old mock data and test file creation code
 */
