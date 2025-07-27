# Mock Provider Documentation

This directory contains comprehensive mock implementations for all AI providers supported by the Converse MCP Server. These mocks are designed for testing and provide full control over provider behavior.

## Overview

The mock provider system consists of:

1. **Base Mock Provider** - Core functionality and utilities
2. **Provider-Specific Mocks** - Implementations for each AI provider
3. **Response Builders** - Utilities for creating consistent responses
4. **Behavior Configuration** - Control over delays, errors, and responses
5. **Call Tracking** - Assertion helpers for testing

## Usage

### Basic Usage

```javascript
import { createMockProvider, mockOpenAIProvider } from '../mocks/providers';

// Use pre-configured mock
const provider = mockOpenAIProvider;

// Or create a custom mock
const customProvider = createMockProvider({
  name: 'custom-provider',
  invoke: vi.fn().mockResolvedValue({
    content: 'Custom response',
    stop_reason: 'stop'
  })
});
```

### Provider-Specific Mocks

Each provider has a dedicated mock with provider-specific behavior:

```javascript
import {
  mockOpenAIProvider,
  mockGoogleProvider,
  mockXAIProvider,
  mockAnthropicProvider,
  mockOpenRouterProvider,
  mockMistralProvider,
  mockDeepSeekProvider
} from '../mocks/providers';

// Each mock implements the complete provider interface
const response = await mockOpenAIProvider.invoke(messages, options);
```

### Response Building

Use the `MockResponseBuilder` for consistent response creation:

```javascript
import { MockResponseBuilder } from '../mocks/providers';

const response = new MockResponseBuilder()
  .withContent('Hello, world!')
  .withModel('gpt-4')
  .withUsage({ input_tokens: 10, output_tokens: 20 })
  .withProvider('openai')
  .build();
```

### Behavior Configuration

Configure mock behavior for different scenarios:

```javascript
import { createMockProvider } from '../mocks/providers';

const provider = createMockProvider();

// Add delays
provider.behavior.addDelay(500); // 500ms delay

// Add errors on specific calls
provider.behavior.addError(
  new ProviderError('Rate limit', ErrorCodes.RATE_LIMIT_EXCEEDED),
  2 // Throw on second call
);

// Add custom responses
provider.behavior.addResponse(
  new MockResponseBuilder().withContent('Custom').build(),
  1 // Return on first call
);
```

### Call Tracking

Track and assert on provider method calls:

```javascript
const provider = createMockProvider();

// Make some calls
await provider.invoke(messages, options);
await provider.validateConfig(config);

// Assert on calls
expect(provider.tracker.getCallCount('invoke')).toBe(1);
expect(provider.tracker.getLastCall('invoke').args.options.model).toBe('gpt-4');

// Reset tracking
provider.tracker.reset();
```

### Error Simulation

Simulate various error conditions:

```javascript
import { createMockProviderWithError, ErrorCodes } from '../mocks/providers';

// Create provider that always throws
const errorProvider = createMockProviderWithError({
  message: 'API key invalid',
  code: ErrorCodes.INVALID_API_KEY
});

// Provider-specific errors
import { createMockOpenAIError } from '../mocks/providers';

const openAIError = createMockOpenAIError('rate_limit');
```

### Streaming Responses

Test streaming behavior:

```javascript
import { createMockProviderWithStreaming } from '../mocks/providers';

const streamProvider = createMockProviderWithStreaming(['Hello', ' ', 'world']);

const response = await streamProvider.invoke(messages, { stream: true });
for await (const chunk of response) {
  console.log(chunk.content); // "Hello", " ", "world"
}
```

### Rate Limiting Simulation

Test rate limit handling:

```javascript
import { createMockProviderWithRateLimit } from '../mocks/providers';

const rateLimitedProvider = createMockProviderWithRateLimit(3);

// First 3 calls succeed
await rateLimitedProvider.invoke(messages);
await rateLimitedProvider.invoke(messages);
await rateLimitedProvider.invoke(messages);

// Fourth call throws rate limit error
await expect(rateLimitedProvider.invoke(messages))
  .rejects.toThrow('Rate limit exceeded');
```

## Provider-Specific Features

### OpenAI

- Thinking models (o1, o3) with reasoning token tracking
- Web search support for compatible models
- Responses API format support

```javascript
const provider = createMockOpenAIProvider();
const response = await provider.invoke(messages, {
  model: 'o1',
  reasoning_effort: 'high',
  config: { apiKeys: { openai: 'key' } }
});

expect(response.metadata.usage.reasoning_tokens).toBe(5000);
```

### Google

- Thinking models support
- Safety ratings simulation
- Large context window handling

```javascript
const provider = createMockGoogleProvider();
const response = await provider.invoke(messages, {
  model: 'gemini-2.0-flash-thinking-exp',
  config: { apiKeys: { google: 'key' } }
});
```

### XAI

- Web search with live results
- Real-time knowledge simulation

```javascript
const provider = createMockXAIProvider();
const response = await provider.invoke(messages, {
  model: 'grok-4',
  use_websearch: true,
  config: { apiKeys: { xai: 'key' } }
});

expect(response.rawResponse.extra.live_search).toBe(true);
```

### Anthropic

- Claude-specific message format
- Image support validation
- Streaming event format

```javascript
const provider = createMockAnthropicProvider();
const response = await provider.invoke(messages, {
  model: 'claude-3-5-sonnet-20241022',
  config: { apiKeys: { anthropic: 'key' } }
});
```

### OpenRouter

- Dynamic model support
- Endpoints API simulation
- Model discovery

```javascript
const provider = createMockOpenRouterProvider();

// Dynamic model
const response = await provider.invoke(messages, {
  model: 'custom/new-model',
  config: { apiKeys: { openrouter: 'key' } }
});

// Refresh model list
const models = await provider.refreshModelList();
```

### Mistral

- Code generation (Codestral)
- Vision models (Pixtral)

```javascript
const provider = createMockMistralProvider();
const response = await provider.invoke(messages, {
  model: 'codestral-latest',
  config: { apiKeys: { mistral: 'key' } }
});
```

### DeepSeek

- Reasoning model with thinking tokens
- Cache-aware token tracking

```javascript
const provider = createMockDeepSeekProvider();
const response = await provider.invoke(messages, {
  model: 'deepseek-reasoner',
  reasoning_effort: 'high',
  config: { apiKeys: { deepseek: 'key' } }
});

expect(response.metadata.usage.reasoning_tokens).toBe(15000);
```

## Testing Examples

### Unit Test Example

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { createMockProvider } from '../mocks/providers';

describe('MyComponent', () => {
  let mockProvider;
  
  beforeEach(() => {
    mockProvider = createMockProvider();
  });
  
  it('should handle provider responses', async () => {
    // Configure response
    mockProvider.invoke.mockResolvedValue({
      content: 'Test response',
      stop_reason: 'stop'
    });
    
    // Test your component
    const result = await myComponent.process(mockProvider);
    
    // Assert
    expect(mockProvider.invoke).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ model: 'gpt-4' })
    );
    expect(result).toBe('Test response');
  });
});
```

### Integration Test Example

```javascript
import { createMockProviderRegistry } from '../mocks/providers';

describe('Tool Integration', () => {
  let registry;
  
  beforeEach(() => {
    registry = createMockProviderRegistry();
  });
  
  afterEach(() => {
    registry.reset();
  });
  
  it('should work with multiple providers', async () => {
    const config = { apiKeys: { openai: 'key', google: 'key' } };
    const available = registry.getAvailable(config);
    
    expect(available).toHaveProperty('openai');
    expect(available).toHaveProperty('google');
  });
});
```

## Best Practices

1. **Reset mocks between tests** - Use `resetAllMocks()` or `provider.tracker.reset()`
2. **Configure behavior upfront** - Set up delays, errors, and responses before testing
3. **Use specific mocks** - Prefer provider-specific mocks over generic ones
4. **Track calls for assertions** - Use the call tracker for detailed test assertions
5. **Simulate realistic scenarios** - Use delays and errors to test edge cases

## API Reference

### Base Mock Functions

- `createMockProvider(overrides)` - Create a generic mock provider
- `createMockProviderWithError(error)` - Create error-throwing mock
- `createMockProviderWithStreaming(chunks)` - Create streaming mock
- `createMockProviderWithRateLimit(limit)` - Create rate-limited mock
- `createMockProviderWithLatency(min, max)` - Create latency mock
- `resetAllMocks(...providers)` - Reset all provider mocks

### MockResponseBuilder Methods

- `withContent(content)` - Set response content
- `withModel(model)` - Set model name
- `withUsage(usage)` - Set token usage
- `withStopReason(reason)` - Set stop reason
- `withProvider(provider)` - Set provider name
- `withResponseTime(ms)` - Set response time
- `withRawResponse(raw)` - Set raw response
- `build()` - Build the response object

### CallTracker Methods

- `recordCall(method, args)` - Record a method call
- `getCalls(method?)` - Get all or filtered calls
- `getLastCall(method?)` - Get the most recent call
- `getCallCount(method?)` - Get call count
- `reset()` - Clear all tracked calls

### MockProviderBehavior Methods

- `addDelay(ms)` - Add response delay
- `addError(error, onCall?)` - Add error on specific call
- `addResponse(response, onCall?)` - Add custom response
- `getBehaviorForCall(callNumber)` - Get behavior for call