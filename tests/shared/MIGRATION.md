# Test Utilities Migration Guide

This guide helps you migrate existing tests to use the new comprehensive shared test utilities.

## Quick Start

Instead of creating mocks manually in each test file, import from the shared utilities:

```javascript
// Before
import { vi } from "vitest";
const mockProvider = {
  invoke: vi.fn().mockResolvedValue({ content: "test" }),
  // ... other properties
};

// After
import { createMockProvider } from "../shared";
const mockProvider = createMockProvider();
```

## Import Changes

### Old Way - Multiple Imports

```javascript
import { vi } from "vitest";
import path from "path";
import { createMockProvider } from "../mocks/providers/base.mock.js";
import { getFixturePath } from "../utils/helpers/testHelpers.js";
```

### New Way - Single Import

```javascript
import testUtils, { createMockProvider, helpers, fixtures } from "../shared";
```

## Common Patterns

### Creating Mock Providers

```javascript
// Basic mock provider
const provider = createMockProvider();

// Provider-specific mocks
const openai = createMockOpenAIProvider();
const google = createMockGoogleProvider();
const xai = createMockXAIProvider();

// Provider with error
const errorProvider = createMockProviderWithError(new Error("API Error"));

// Provider registry
const registry = createMockProviderRegistry();
const openai = registry.get("openai");
```

### Creating Mock Configuration

```javascript
// Before
const mockConfig = {
  apiKeys: { openai: "sk-test" },
  server: { port: 3157 },
};

// After
const mockConfig = helpers.config.createMockConfig({
  apiKeys: { openai: "sk-test" },
});
```

### Using Test Helpers

```javascript
// Logger
const logger = helpers.logging.createMockLogger();

// Async utilities
await helpers.async.waitFor(() => condition);
const deferred = helpers.async.createDeferred();

// File system
const fs = helpers.filesystem.mockFileSystem();

// Continuation store
const store = helpers.stores.createMockContinuationStore();
```

### Using Fixtures

```javascript
// Response fixtures
const openaiResponse = fixtures.responses.openai.chat;
const googleResponse = fixtures.responses.google.generateContent;

// Prompt fixtures
const prompt = fixtures.prompts.simple;

// Error fixtures
const rateLimitError = fixtures.errors.api.openai.rateLimit;

// Model lists
const fastModels = fixtures.models.fast;
const intelligentModels = fixtures.models.intelligent;
```

## Migration Checklist

1. **Update imports** - Replace individual mock/helper imports with shared utilities
2. **Replace manual mocks** - Use factory functions instead of manual mock objects
3. **Use fixture data** - Replace hardcoded test data with fixtures
4. **Standardize setup** - Use `helpers.setup.beforeEachTest()` in beforeEach hooks
5. **Update assertions** - Use assertion helpers for common patterns

## Example Migration

### Before

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { chatTool } from "../../src/tools/chat.js";

describe("Chat Tool", () => {
  let mockProviders;

  beforeEach(() => {
    vi.clearAllMocks();

    mockProviders = {
      openai: {
        invoke: vi.fn().mockResolvedValue({
          content: "Test response",
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
        validateConfig: vi.fn().mockReturnValue(true),
        isAvailable: vi.fn().mockReturnValue(true),
      },
    };
  });

  it("should handle chat request", async () => {
    const result = await chatTool.handler(
      {
        prompt: "Hello",
      },
      { providers: mockProviders },
    );

    expect(result.result).toBe("Test response");
  });
});
```

### After

```javascript
import { describe, it, expect, beforeEach } from "vitest";
import { createMockOpenAIProvider, helpers, fixtures } from "../shared";
import { chatTool } from "../../src/tools/chat.js";

describe("Chat Tool", () => {
  let mockProviders;

  beforeEach(() => {
    helpers.setup.beforeEachTest();

    mockProviders = {
      openai: createMockOpenAIProvider(),
    };
  });

  it("should handle chat request", async () => {
    const result = await chatTool.handler(
      {
        prompt: fixtures.prompts.simple,
      },
      { providers: mockProviders },
    );

    expect(result.result).toBe("Mock response");
  });
});
```

## Benefits

1. **Consistency** - All tests use the same mock patterns
2. **Maintainability** - Update mocks in one place
3. **Type Safety** - Factory functions ensure correct mock structure
4. **Reusability** - Share common test scenarios
5. **Documentation** - Self-documenting test utilities
