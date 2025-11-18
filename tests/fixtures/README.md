# Test Fixtures

This directory contains comprehensive test fixtures for the Converse MCP Server test suite. The fixtures are organized to provide consistent, reusable test data across all test files.

## Directory Structure

```
fixtures/
├── data/
│   ├── provider-responses.json    # Provider API response templates
│   ├── tool-fixtures.json         # Tool-specific test scenarios
│   ├── error-scenarios.json       # Error response templates
│   ├── edge-cases.json           # Edge case test data
│   └── sample-responses.json     # Legacy/simple response samples
├── files/
│   ├── sample.txt               # Basic text file
│   ├── sample.js                # JavaScript code sample
│   ├── sample.py                # Python code sample
│   ├── sample.ts                # TypeScript code sample
│   ├── sample.json              # Basic JSON file
│   ├── nested.json              # Deeply nested JSON
│   ├── large.json               # Large JSON file for performance testing
│   ├── large-text.txt           # Large text file
│   ├── unicode-text.txt         # Unicode character testing
│   ├── special-chars.txt        # Special characters and injection tests
│   └── empty.txt                # Empty file
├── index.js                     # Main fixture exports
├── loader.js                    # Fixture loader utility
└── README.md                    # This file
```

## Usage

### Basic Import

```javascript
import fixtures from "./fixtures/index.js";
import { fixtureLoader } from "./fixtures/loader.js";
```

### Provider Response Fixtures

```javascript
// Get a provider response template
const gpt4Response = fixtureLoader.getProviderResponse("openai", "gpt-4");

// Get a streaming response template
const streamingResponse = fixtureLoader.getProviderResponse(
  "openai",
  "gpt-4",
  "streaming",
);

// Create a custom response
const customResponse = fixtureLoader.createMockResponse(
  "openai",
  "gpt-4",
  "Custom response content",
  { usage: { total_tokens: 100 } },
);
```

### Tool Fixtures

```javascript
// Get a chat tool fixture
const chatBasic = fixtureLoader.getToolFixture("chat", "basic");
console.log(chatBasic.request); // Request parameters
console.log(chatBasic.response); // Expected response

// Get a consensus tool fixture
const consensusWithFiles = fixtureLoader.getToolFixture(
  "consensus",
  "withFiles",
);
```

### Error Scenarios

```javascript
// Get provider-specific errors
const rateLimitError = fixtureLoader.getErrorScenario("openai", "rateLimit");
const invalidKeyError = fixtureLoader.getErrorScenario("google", "invalidKey");

// Get validation errors
const missingPromptError = fixtureLoader.getErrorScenario(
  "validation",
  "missingPrompt",
);

// Get network errors
const timeoutError = fixtureLoader.getErrorScenario("network", "timeout");
```

### Edge Cases

```javascript
// Get string edge cases
const emptyString = fixtureLoader.getEdgeCase("strings", "empty");
const unicodeString = fixtureLoader.getEdgeCase("strings", "unicode");

// Get number edge cases
const infinity = fixtureLoader.getEdgeCase("numbers", "infinity");
const veryLarge = fixtureLoader.getEdgeCase("numbers", "very_large");

// Get file path edge cases
const longPath = fixtureLoader.getEdgeCase("files", "paths").very_long_path;
```

### File Fixtures

```javascript
// Load a file
const jsCode = fixtureLoader.loadFile("sample.js");

// Get file metadata
const metadata = fixtureLoader.getFileMetadata("large-text.txt");
console.log(metadata); // { path, name, content, size, lines, isEmpty }
```

### Test Scenarios

```javascript
// Get a complete test scenario
const scenario = fixtureLoader.getTestScenario("chatWithFiles");
// Returns: { tool, request, response, files, provider, model }

// List available fixtures
const providers = fixtureLoader.listFixtures("providers");
const errorTypes = fixtureLoader.listFixtures("errors");
```

### Test Matrix Generation

```javascript
// Generate a test matrix for multiple providers and models
const matrix = fixtureLoader.generateTestMatrix({
  providers: ["openai", "google"],
  models: {
    openai: ["gpt-4", "gpt-3.5-turbo"],
    google: ["gemini-2.5-pro"],
  },
  scenarios: ["success", "error"],
});

// Results in combinations like:
// [
//   { provider: 'openai', model: 'gpt-4', scenario: 'success' },
//   { provider: 'openai', model: 'gpt-4', scenario: 'error' },
//   ...
// ]
```

## Fixture Categories

### Provider Responses

- **Default responses**: Basic successful responses for each provider
- **Model-specific responses**: Responses for specific models (e.g., GPT-4, Gemini 2.5 Pro)
- **Streaming responses**: Chunked responses for streaming scenarios
- **Web search responses**: Responses with web search results

### Tool Fixtures

- **Chat tool scenarios**: Basic, with files, with images, with continuation, etc.
- **Consensus tool scenarios**: Basic, with cross-feedback, partial failures, etc.

### Error Scenarios

- **Provider errors**: Rate limits, invalid keys, model not found, etc.
- **Validation errors**: Missing parameters, invalid types, file errors
- **Network errors**: Connection refused, timeouts, DNS errors
- **MCP errors**: Tool not found, invalid params, transport errors

### Edge Cases

- **Strings**: Empty, unicode, special characters, SQL injection, XSS
- **Numbers**: Zero, negative, infinity, NaN, very large/small
- **Arrays**: Empty, nested, sparse, circular references
- **Objects**: Empty, deeply nested, special keys, prototype pollution
- **Files**: Various paths, extensions, content types
- **Images**: Different formats, sizes, corrupted data

## Best Practices

1. **Always use the fixture loader** instead of importing JSON files directly
2. **Clone fixtures** when modifying them to avoid side effects
3. **Use descriptive scenario names** when accessing fixtures
4. **Cache fixtures** when using them repeatedly in tests
5. **Clear cache** between test suites if needed: `fixtureLoader.clearCache()`

## Adding New Fixtures

1. **Provider responses**: Add to `data/provider-responses.json`
2. **Tool scenarios**: Add to `data/tool-fixtures.json`
3. **Error cases**: Add to `data/error-scenarios.json`
4. **Edge cases**: Add to `data/edge-cases.json`
5. **File fixtures**: Add files to `files/` directory

## Example Test Usage

```javascript
import { describe, it, expect } from "vitest";
import { fixtureLoader } from "../fixtures/loader.js";

describe("Provider Tests", () => {
  it("should handle successful responses", () => {
    const response = fixtureLoader.getProviderResponse("openai", "gpt-4");
    expect(response.choices[0].message.content).toBeDefined();
  });

  it("should handle rate limit errors", () => {
    const error = fixtureLoader.getErrorScenario("openai", "rateLimit");
    expect(error.error.code).toBe("rate_limit_exceeded");
  });

  it("should handle edge case strings", () => {
    const unicode = fixtureLoader.getEdgeCase("strings", "unicode");
    expect(unicode).toContain("🌍");
  });
});
```

## Maintenance

- Keep fixtures up to date with API changes
- Add new fixtures as new features are implemented
- Document any special fixture requirements
- Run fixture validation tests regularly
