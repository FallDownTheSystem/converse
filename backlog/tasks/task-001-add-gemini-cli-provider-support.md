---
id: task-001-add-gemini-cli-provider-support
title: Add Gemini CLI Provider Support
status: "In Progress"
created_date: '2025-11-24 09:17'
updated_date: '2025-11-24 09:46'
parent: null
subtasks: []
dependencies: []
---

## Description
<!-- DESCRIPTION:BEGIN -->
Currently, users can access Google's Gemini models through the Converse MCP Server using API keys. However, users with Google subscriptions (such as Google One AI Premium or Gemini Advanced) should be able to use Gemini models through their subscription without paying per API call. This task adds support for the Gemini CLI provider, which enables subscription-based access to Gemini models.

The Gemini CLI provider uses Google's authentication system (OAuth) instead of API keys. Users authenticate once through the Gemini CLI tool, and their credentials are stored locally. The Converse server will use these credentials to access Gemini models. This is similar to how the Codex CLI provider currently works in the codebase.

When a user specifies the model name "gemini", the server will use the Gemini CLI provider to access the gemini-3-pro-preview model. This gives users with Google subscriptions an alternative to API-based access, potentially saving costs and providing access to enhanced agentic features available through the CLI that aren't available through the standard API.

The implementation will follow existing patterns from the Codex CLI integration, ensuring consistency in how CLI-based providers work throughout the codebase.
<!-- DESCRIPTION:END -->

## Specification
<!-- SPECIFICATION:BEGIN -->

### Core Requirements

**1. Package Integration**
- Install `ai-sdk-provider-gemini-cli` version 1.4.0+ as a dependency
- Package should be a regular dependency (not optional) since it's being explicitly added

**2. Model Support**
- Support only `gemini-3-pro-preview` model (added in SDK v1.3.0)
- Model trigger name: `"gemini"` (users type `model: "gemini"`)
- This will route to Gemini CLI provider instead of Google API provider

**3. Authentication**
- Support ONLY `oauth-personal` authentication type
- Use credentials from `~/.gemini/oauth_creds.json`
- Assume user has already authenticated via Gemini CLI
- No API key support needed for this provider

**4. Provider Implementation**
- Create `src/providers/gemini-cli.js` following Codex CLI pattern
- Implement full provider interface (invoke, validateConfig, isAvailable, getSupportedModels, getModelConfig)
- Return standard provider response format with content, metadata, usage stats
- Support both synchronous and streaming modes

**5. Tool Integration**
- Must work in **chat tool** (`src/tools/chat.js`)
- Must work in **consensus tool** (`src/tools/consensus.js`)
- Note: Codex currently only works in chat tool - ensure both Gemini CLI and Codex work in both tools

**6. Model Routing**
- Update `mapModelToProvider()` in chat.js to route `"gemini"` → `"gemini-cli"`
- This changes existing behavior where `"gemini"` routes to Google API provider
- Users wanting Google API provider should use specific model names like `"gemini-2.0-flash-exp"`

**7. Configuration**
- Add provider registration in `src/providers/index.js`
- No additional environment variables needed (uses OAuth creds file)
- Provider should check for credentials file existence in `isAvailable()`

**8. Streaming Support**
- Support AI SDK v5 streaming interfaces (`streamText`, `streamObject`)
- Compatible with existing streaming normalization if needed
- Handle partial responses and progress updates

**9. Error Handling**
- Graceful errors when OAuth credentials not found
- Clear error messages directing users to run `gemini` CLI for authentication
- Handle rate limiting errors from Google Cloud Code endpoints
- Log authentication errors without exposing credentials

**10. Testing**
- Integration tests following `tests/integration/providers/codex/codex-api.test.js` pattern
- Test basic chat functionality with Gemini CLI
- Test streaming responses
- Test consensus tool integration
- Test error handling (missing credentials, invalid models)
- Use conditional test execution (`testWithApiKeys` helper)

**11. Documentation**
- Update configuration guide with Gemini CLI setup instructions
- Explain OAuth authentication requirement
- Provide example usage in chat and consensus tools
- Document difference from Google API provider

### Acceptance Criteria

✅ User can use `model: "gemini"` in chat tool to access gemini-3-pro-preview via CLI
✅ User can use `model: "gemini"` in consensus tool alongside other models
✅ Streaming works correctly for long responses
✅ Authentication errors provide helpful guidance (e.g., "Run: gemini CLI to authenticate")
✅ Provider gracefully handles missing credentials file
✅ All tests pass with OAuth credentials configured
✅ Codex provider works in both chat and consensus tools (if not already)
✅ Documentation clearly explains setup and usage
✅ No regressions in existing provider functionality

### Non-Requirements

❌ No API key authentication support (OAuth only)
❌ No fallback to Google API provider (explicit choice by user)
❌ No support for other Gemini models (gemini-2.5-pro, gemini-2.5-flash, etc.)
❌ No image URL support (base64 only, per SDK limitations)
❌ No configuration flags to enable/disable (always available if credentials exist)

<!-- SPECIFICATION:END -->

## Design
<!-- DESIGN:BEGIN -->
**Architecture Approach:**

This implementation follows the established CLI-based provider pattern from the Codex integration. We'll create a new provider (`gemini-cli`) that wraps the `ai-sdk-provider-gemini-cli` package and integrates it into the existing provider system.

**Key Design Decisions:**

1. **Model Routing**: The model name `"gemini"` will route to the gemini-cli provider instead of the Google API provider. This requires updating the model routing logic to check for exact match before keyword matching.

2. **Authentication**: OAuth-only authentication using credentials from `~/.gemini/oauth_creds.json`. No API keys, no environment variables needed.

3. **No Fallback**: Unlike some designs, there's no automatic fallback to the Google API provider. Users explicitly choose CLI vs API by using `"gemini"` (CLI) or specific model names like `"gemini-2.0-flash-exp"` (API).

4. **Standard Interface**: The provider implements the same 5-method interface as all other providers, ensuring it works seamlessly with both chat and consensus tools.

5. **AI SDK v5 Integration**: The provider uses AI SDK v5's `generateText()` and `streamText()` functions, which handle message conversion and streaming internally - no custom conversion needed.

**Key Files to Create/Modify:**

**Create:**
- `src/providers/gemini-cli.js` - New provider implementation (primary file)
- `tests/integration/providers/gemini-cli/gemini-cli-api.test.js` - Integration tests

**Modify:**
- `src/providers/index.js` - Register gemini-cli provider (add import and registry entry)
- `src/tools/chat.js` - Update model routing logic (add exact match for "gemini" before keyword matching)
- `tests/utils/apiKeyDetection.js` - Add OAuth credentials file detection
- `tests/utils/conditionalTest.js` - Add hasGeminiCli helper
- `docs/PROVIDERS.md` - Document Gemini CLI setup and usage
- `docs/API.md` - Add Gemini CLI to provider list

**No Changes Needed:**
- `src/config.js` - No environment variables to add
- `src/async/providerStreamNormalizer.js` - AI SDK v5 streaming works with existing normalizers
- `package.json` - Dependencies already installed (ai-sdk-provider-gemini-cli v1.4.0)

**Implementation Pattern:**

Follow the Codex provider structure exactly:
- Dynamic SDK import (lazy loading)
- OAuth credentials file detection in `isAvailable()`
- Standard response format with usage metadata
- Support for both sync and streaming modes
- Proper error handling with helpful messages

**Dependencies:**
- `ai-sdk-provider-gemini-cli` v1.4.0+ (already installed)
- `ai` package v5+ (already installed)
- Gemini CLI tool must be installed globally (`npm install -g @google/gemini-cli`)
- User must authenticate via `gemini` CLI command before first use

**Context Manifest:**

### How Provider Integration Currently Works: CLI-Based Providers

The Converse MCP Server has an established pattern for integrating CLI-based providers, as demonstrated by the Codex provider implementation. Understanding this flow is critical because the Gemini CLI provider will follow the exact same architectural pattern.

**Provider Interface Contract (src/providers/interface.js):**

All providers must implement five core methods, regardless of whether they use API keys or OAuth:
- `async invoke(messages, options)` - Main execution method that returns `{ content, stop_reason, rawResponse, metadata }`
- `validateConfig(config)` - Returns boolean indicating if provider can initialize
- `isAvailable(config)` - Runtime check if provider is ready to handle requests
- `getSupportedModels()` - Returns object mapping model names to ModelConfig objects
- `getModelConfig(modelName)` - Returns specific model configuration or null

**How Codex Provider Works (src/providers/codex.js):**

When a user invokes the chat tool with `model: "codex"`, here's what happens:

1. **Lazy SDK Loading:** The provider uses dynamic imports to load `@openai/codex-sdk` only when needed (line 66-85). This pattern keeps the SDK as an optional dependency. For Gemini CLI, we'll do the same with `ai-sdk-provider-gemini-cli`.

2. **Message Conversion:** Codex expects single prompts, not message arrays. The `convertMessagesToPrompt` function (lines 95-148) extracts the last user message from the message history. This differs from Gemini CLI which uses AI SDK v5's standard message format - Gemini CLI will consume the full message array directly.

3. **Authentication Check:** Codex's `isAvailable()` method (line 423) returns true if the SDK is installed - it doesn't validate credentials upfront. Authentication happens lazily during the first `invoke()` call. Gemini CLI should check for `~/.gemini/oauth_creds.json` existence.

4. **Configuration Values:** Codex reads provider-specific config from `config.providers` (lines 273-299):
   - `config.providers.codexapikey` - Optional API key (maps from CODEX_API_KEY env var)
   - `config.providers.codexsandboxmode` - Sandbox setting (read-only, workspace-write, danger-full-access)
   - `config.providers.codexskipgitcheck` - Git repository validation toggle
   - `config.providers.codexapprovalpolicy` - Command approval policy

   For Gemini CLI, we won't need any of these - just OAuth credentials file detection.

5. **Streaming Implementation:** Codex internally ALWAYS uses streaming (line 314), even for synchronous mode. When `stream: false`, it consumes the stream internally and returns the complete response. This is a workaround for SDK limitations. For Gemini CLI, the AI SDK v5 handles both modes natively through `generateText()` and `streamText()`.

6. **Response Format:** The invoke method returns:
```javascript
{
  content: "response text",
  stop_reason: "stop", // from StopReasons enum
  rawResponse: { content, usage },
  metadata: {
    provider: "codex",
    model: "codex",
    threadId: "uuid-here", // for continuation
    usage: { input_tokens, output_tokens, total_tokens, cached_input_tokens },
    response_time_ms: 1234,
    finish_reason: "stop"
  }
}
```

**Model Routing Logic (src/tools/chat.js, line 431-511):**

The `mapModelToProvider` function determines which provider handles each model name. Current routing for similar providers:

```javascript
// Exact match check (line 440-442)
if (modelLower === 'codex') {
  return 'codex';
}

// Keyword matching for Google models (lines 492-499)
if (
  modelLower.includes('gemini') ||
  modelLower.includes('flash') ||
  modelLower.includes('pro') ||
  modelLower === 'google'
) {
  return 'google';
}
```

**CRITICAL:** The spec says `model: "gemini"` should route to gemini-cli, but currently this would route to the Google API provider. We need to add an exact match check BEFORE the keyword matching:

```javascript
// Add this BEFORE the Google keyword matching:
if (modelLower === 'gemini') {
  return 'gemini-cli';
}
```

This means users wanting Google API provider must use specific model names like `gemini-2.5-pro` or `gemini-2.0-flash`. The short name "gemini" becomes reserved for CLI access.

**Provider Registry (src/providers/index.js):**

New providers are registered by:
1. Importing the provider object: `import { geminiCliProvider } from './gemini-cli.js';`
2. Adding to the registry map (line 25-34): `'gemini-cli': geminiCliProvider,`

That's it. The registry exports `getProvider(name)` and `getAvailableProviders(config)` functions used throughout the codebase.

**Consensus Tool Integration (src/tools/consensus.js, lines 314-349):**

The consensus tool works with ANY provider that implements the interface. For each model in the `models` array:
1. Call `mapModelToProvider(modelName, providers)` to get provider name
2. Get provider from registry: `providers[providerName]`
3. Check availability: `provider.isAvailable(config)`
4. Add to `providerCalls` array for parallel execution
5. Call `provider.invoke(messages, options)` with the same messages for each provider

No special handling needed for CLI-based providers - they work identically to API-based providers in consensus mode.

**Streaming Normalization (src/async/providerStreamNormalizer.js):**

The `ProviderStreamNormalizer` class normalizes provider-specific streaming events into unified format:
- `start` - Stream initialization
- `delta` - Content chunk
- `usage` - Token usage stats
- `end` - Stream completion with metadata
- `error` - Error with recovery info

Codex has its own normalizer (line 782-862) that converts Codex SDK events:
- `thread.started` → `start` event
- `item.completed` (type: agent_message) → `delta` event with accumulated content
- `turn.completed` → `end` event with usage stats

**For Gemini CLI:** The AI SDK v5 likely returns standard AI SDK streaming events. We need to check if the SDK's streaming format matches OpenAI's format (which has a normalizer at line 87-180). If so, we can reuse that normalizer. If not, implement a custom `normalizeGeminiCliStream` method.

### For New Feature Implementation: Gemini CLI Provider

Since we're implementing a new provider that follows existing patterns, here's what needs to connect:

**1. Provider File Structure (src/providers/gemini-cli.js):**

Follow the Codex structure exactly:
- Import statements: `debugLog`, `debugError` from utils, `ProviderError`, `ErrorCodes`, `StopReasons` from interface
- SUPPORTED_MODELS object defining available models
- Helper functions for SDK interaction
- Main provider export: `export const geminiCliProvider = { invoke, validateConfig, isAvailable, getSupportedModels, getModelConfig }`

**2. Authentication Flow:**

Unlike Codex which can use ChatGPT login OR API key, Gemini CLI ONLY uses OAuth. The credentials file location is `~/.gemini/oauth_creds.json` (from AI SDK docs). The `isAvailable()` method should:

```javascript
isAvailable(_config) {
  const credsPath = join(homedir(), '.gemini', 'oauth_creds.json');
  return existsSync(credsPath);
}
```

**3. SDK Integration:**

The `ai-sdk-provider-gemini-cli` package (already installed in package.json v1.4.0) exports `createGeminiProvider`. According to the README:

```javascript
import { createGeminiProvider } from 'ai-sdk-provider-gemini-cli';

const gemini = createGeminiProvider({
  authType: 'oauth-personal',
});

// Then use with AI SDK v5:
import { generateText, streamText } from 'ai';

// Synchronous
const result = await generateText({
  model: gemini('gemini-3-pro-preview'),
  messages: [...],
  temperature: 0.5,
});

// Streaming
const { textStream } = await streamText({
  model: gemini('gemini-3-pro-preview'),
  messages: [...],
});
```

**4. Message Format:**

Unlike Codex which requires prompt conversion, AI SDK v5 uses standard message arrays. Our provider can pass messages directly to `generateText()`/`streamText()`. No conversion needed.

**5. Supported Models:**

From the spec, only `gemini-3-pro-preview` is supported. Define in SUPPORTED_MODELS:

```javascript
const SUPPORTED_MODELS = {
  'gemini-3-pro-preview': {
    modelName: 'gemini-3-pro-preview',
    friendlyName: 'Gemini (Pro 3.0 Preview via CLI)',
    contextWindow: 1048576,
    maxOutputTokens: 64000,
    supportsStreaming: true,
    supportsImages: true, // Base64 only per SDK limitations
    supportsTemperature: true,
    supportsThinking: true,
    supportsWebSearch: true,
    timeout: 300000,
    description: 'Gemini 3.0 Pro via OAuth - requires Gemini CLI authentication',
  },
};
```

**6. Configuration:**

No environment variables needed. The provider auto-detects OAuth credentials from `~/.gemini/oauth_creds.json`. No entries in CONFIG_SCHEMA required.

**7. Error Handling:**

Provide clear error messages when OAuth credentials are missing:

```javascript
throw new ProviderError(
  'Gemini CLI authentication required. Run: gemini (interactive CLI) to authenticate',
  ErrorCodes.INVALID_API_KEY, // Reuse this code for auth errors
);
```

**8. Model Routing Update:**

In `src/tools/chat.js`, add BEFORE line 492 (Google keyword matching):

```javascript
// Gemini CLI provider (exact match for "gemini" only)
if (modelLower === 'gemini') {
  return 'gemini-cli';
}
```

**9. Testing Pattern:**

Follow `tests/integration/providers/codex/codex-api.test.js` structure:
- Use `testWithApiKeys({ requiredProviders: ['GEMINI_CLI'], requireAll: true })`
- Test basic chat, streaming, async mode, error handling
- Add to `tests/utils/apiKeyDetection.js`: Check for credentials file existence
- Add to `tests/utils/conditionalTest.js`: Export `hasGeminiCli` helper

### Technical Reference Details

#### Provider Interface Signatures

```javascript
// From src/providers/interface.js
export const ProviderInterface = {
  async invoke(messages, options = {}) {
    // messages: Array<{ role: 'system'|'user'|'assistant', content: string|Array }>
    // options: { model, config, stream, signal, continuation_id, continuationStore, reasoning_effort, temperature, use_websearch }
    // Returns: Promise<{ content, stop_reason, rawResponse, metadata }> | AsyncGenerator
  },
  validateConfig(config) {
    // config: { apiKeys: {}, providers: {}, server: {}, ... }
    // Returns: boolean
  },
  isAvailable(config) {
    // Returns: boolean (runtime check)
  },
  getSupportedModels() {
    // Returns: Object<string, ModelConfig>
  },
  getModelConfig(modelName) {
    // Returns: ModelConfig | null
  },
};
```

#### Error Codes Available

From `src/providers/interface.js` (lines 155-183):
- `MISSING_API_KEY`, `INVALID_API_KEY` - Use for auth errors
- `INVALID_MESSAGES`, `INVALID_MESSAGE`, `INVALID_ROLE`, `MISSING_CONTENT` - Message validation
- `MODEL_NOT_FOUND`, `CONTEXT_LENGTH_EXCEEDED` - Model errors
- `RATE_LIMIT_EXCEEDED`, `QUOTA_EXCEEDED` - Rate limiting
- `API_ERROR`, `TIMEOUT_ERROR`, `NETWORK_ERROR` - General errors

#### Configuration Access Pattern

```javascript
// Inside invoke():
const {
  model = 'gemini-3-pro-preview',
  config,
  stream = false,
  signal, // AbortSignal for cancellation
  continuation_id,
  continuationStore,
  reasoning_effort,
  temperature,
  use_websearch,
} = options;

// Provider-specific config (not needed for Gemini CLI):
const providerConfig = config.providers?.somesetting;
```

#### Response Metadata Structure

```javascript
{
  content: "actual response text",
  stop_reason: "stop", // or "length", "tool_use", "content_filter", "safety", "error", "other"
  rawResponse: {}, // Original SDK response
  metadata: {
    provider: "gemini-cli",
    model: "gemini-3-pro-preview",
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
      cached_input_tokens: 0,
    },
    response_time_ms: 1234,
    finish_reason: "stop", // Provider-specific reason
  },
}
```

#### File Locations Summary

**Implementation:**
- `src/providers/gemini-cli.js` - New provider implementation
- `src/providers/index.js` - Add registration (line 16 import, line 33 registry entry)
- `src/tools/chat.js` - Add model routing (before line 492)
- `src/async/providerStreamNormalizer.js` - Add normalizer if needed (line 44 registry, new method)

**Testing:**
- `tests/integration/providers/gemini-cli/gemini-cli-api.test.js` - New integration tests
- `tests/utils/apiKeyDetection.js` - Add credential detection
- `tests/utils/conditionalTest.js` - Add `hasGeminiCli` export

**Documentation:**
- No changes to `src/config.js` needed (no env vars)
- Update `docs/API.md` with Gemini CLI provider usage
- Update `docs/PROVIDERS.md` with authentication instructions
<!-- DESIGN:END -->

## TODO
<!-- TODO:BEGIN -->

### Provider Implementation
- [ ] Create `src/providers/gemini-cli.js` with full provider interface
  - [ ] Import AI SDK provider: `import { createGeminiProvider } from 'ai-sdk-provider-gemini-cli'`
  - [ ] Implement `invoke(messages, options)` method (sync and streaming modes)
  - [ ] Implement `validateConfig(config)` method (always returns true, no config needed)
  - [ ] Implement `isAvailable(config)` method (check ~/.gemini/oauth_creds.json existence)
  - [ ] Implement `getSupportedModels()` method (return gemini-3-pro-preview model config)
  - [ ] Implement `getModelConfig(modelName)` method
  - [ ] Add proper error handling with helpful OAuth setup messages
  - [ ] Support temperature, reasoning_effort, and other AI SDK v5 parameters

### Integration
- [ ] Register provider in `src/providers/index.js`
  - [ ] Add import: `import { geminiCliProvider } from './gemini-cli.js';`
  - [ ] Add to registry object: `'gemini-cli': geminiCliProvider,`
- [ ] Update model routing in `src/tools/chat.js`
  - [ ] Add exact match check for `"gemini"` before line 492 (Google keyword matching)
  - [ ] Route `"gemini"` → `"gemini-cli"` provider

### Codex Consensus Support (Additional Requirement)
- [ ] Verify Codex provider works in consensus tool
  - [ ] Test consensus with `models: ["codex", "gpt-5", "claude-sonnet-4"]`
  - [ ] If not working, debug and fix Codex consensus integration
  - [ ] Ensure both Codex and Gemini CLI work in consensus

### Testing
- [ ] Update test utilities
  - [ ] Add OAuth credentials detection to `tests/utils/apiKeyDetection.js`
  - [ ] Add `hasGeminiCli()` helper to `tests/utils/conditionalTest.js`
- [ ] Create integration tests at `tests/integration/providers/gemini-cli/gemini-cli-api.test.js`
  - [ ] Test basic chat functionality
  - [ ] Test streaming responses
  - [ ] Test consensus tool integration
  - [ ] Test error handling (missing OAuth credentials)
  - [ ] Test async mode with background execution
  - [ ] Use conditional execution: `testWithApiKeys({ requiredProviders: ['GEMINI_CLI'] })`
- [ ] Run full test suite to verify no regressions
  - [ ] `pnpm run validate` (all quality checks)
  - [ ] `pnpm test` (full test suite)
  - [ ] `pnpm run test:providers` (provider-specific tests)

### Documentation
- [ ] Update `docs/PROVIDERS.md`
  - [ ] Add "Google CLI (Gemini CLI)" section
  - [ ] Document OAuth authentication setup (run `gemini` CLI)
  - [ ] Explain model name `"gemini"` routes to CLI provider
  - [ ] Add usage examples for chat and consensus tools
  - [ ] Document difference from Google API provider
- [ ] Update `docs/API.md`
  - [ ] Add Gemini CLI to supported providers list
  - [ ] Document gemini-3-pro-preview model capabilities
- [ ] Add usage examples
  - [ ] Chat tool example with `model: "gemini"`
  - [ ] Consensus tool example with Gemini CLI + other models
  - [ ] Streaming example

### Validation
- [ ] Verify all acceptance criteria met
  - [ ] ✅ `model: "gemini"` works in chat tool
  - [ ] ✅ `model: "gemini"` works in consensus tool
  - [ ] ✅ Streaming works correctly
  - [ ] ✅ Authentication errors provide helpful guidance
  - [ ] ✅ Graceful handling of missing credentials
  - [ ] ✅ Codex works in both chat and consensus tools
  - [ ] ✅ Documentation is clear and complete
  - [ ] ✅ No regressions in existing functionality
- [ ] Manual testing
  - [ ] Test with real OAuth credentials
  - [ ] Test error case (no credentials)
  - [ ] Test in both chat and consensus tools
  - [ ] Verify streaming output quality
  - [ ] Check performance characteristics

<!-- TODO:END -->

## Notes
<!-- NOTES:BEGIN -->
[Implementation decisions, issues encountered, important discoveries will be recorded here during implementation]
<!-- NOTES:END -->
