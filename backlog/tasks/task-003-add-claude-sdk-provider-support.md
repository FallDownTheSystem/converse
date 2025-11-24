---
id: task-003-add-claude-sdk-provider-support
title: Add Claude SDK Provider Support
status: "In Progress"
created_date: '2025-11-24 22:20'
updated_date: '2025-11-24 23:01'
parent: null
subtasks:
dependencies:
---

<!-- DESCRIPTION:BEGIN -->

## Description

Add a new "claude" provider to the Converse MCP Server that uses Anthropic's Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) to access Claude models via subscription-based authentication, similar to how the existing codex and gemini-cli providers work.

**Problem:** Currently, the Converse MCP Server supports codex (OpenAI) and gemini-cli (Google) providers that leverage CLI-based subscription authentication rather than per-usage API costs. Users with Claude Pro/Max subscriptions want similar access to Claude models without needing to manage API keys or incur additional API costs.

**Solution:** Create a new `claude` provider that wraps the Claude Agent SDK's `query()` function. The provider will:
- Use the user's existing Claude Code CLI authentication (via `claude login`)
- NOT use API key authentication (the entire point is subscription-based access)
- Expose a single model called "claude" that routes to Claude's default model
- Follow the same patterns as codex and gemini-cli providers for consistency
- Support streaming responses via async generators
- Integrate with the chat and consensus tools

<!-- DESCRIPTION:END -->

<!-- SPECIFICATION:BEGIN -->

## Specification

### Technical Requirements

1. **Provider Implementation** (`src/providers/claude.js`)
   - Create new provider following the unified provider interface
   - Implement `invoke(messages, options)` returning `{ content, stop_reason, rawResponse, metadata }`
   - Support both synchronous and streaming modes
   - Use `query()` function from `@anthropic-ai/claude-agent-sdk`
   - Convert Converse message format to Claude SDK format

2. **Authentication**
   - MUST NOT use API key authentication (`ANTHROPIC_API_KEY`)
   - Rely on existing Claude Code CLI authentication (`claude login`)
   - Check for authentication by attempting SDK call, handle auth errors gracefully
   - No configuration keys needed in `.env` for this provider

3. **Model Support**
   - Single model: `claude` (maps to SDK's default model)
   - Model config: `supportsStreaming: true`, `supportsImages: false` (SDK limitation)
   - No aliases needed for MVP

4. **Streaming Support**
   - Use `query()` async generator for streaming
   - Yield normalized events compatible with `ProviderStreamNormalizer`
   - Handle SDK message types: `system`, `assistant`, `result`
   - Extract content from `assistant` messages, capture usage from `result`

5. **Provider Registration**
   - Register in `src/providers/index.js`
   - Add model routing in `src/tools/chat.js` (`mapModelToProvider`)
   - Add default model resolution in `resolveAutoModel`

### Acceptance Criteria

- [ ] Provider passes `validateConfig()` when Claude CLI is authenticated
- [ ] Provider returns error with clear message when not authenticated
- [ ] Chat tool works with `model: "claude"`
- [ ] Consensus tool works with `claude` as one of the models
- [ ] Streaming responses work correctly
- [ ] Non-streaming responses work correctly
- [ ] Provider does NOT attempt API key authentication
- [ ] Error handling maps common errors to standard error codes
- [ ] Unit tests pass for provider
- [ ] Integration with existing tools (chat/consensus) works

### Out of Scope
- Multiple model variants (opus, sonnet, haiku) - keep simple with single "claude" model
- Image/multimodal support (SDK has limitations)
- Session/conversation persistence (handled by continuation store)
- Configuration options (permissionMode, allowedTools, etc.) - use SDK defaults

<!-- SPECIFICATION:END -->

<!-- DESIGN:BEGIN -->

## Design

### Architecture Approach

Follow the established patterns from `codex.js` and `gemini-cli.js` providers:

1. **Lazy Loading**: Dynamically import SDK only when provider is used
2. **Message Conversion**: Convert Converse message format to SDK's expected format
3. **Streaming Generator**: Create async generator yielding normalized events
4. **Error Mapping**: Map SDK errors to standard `ErrorCodes`
5. **Unified Response**: Return standard `{ content, stop_reason, rawResponse, metadata }` format

### Key Files to Create/Modify

**Create:**
- `src/providers/claude.js` - Main provider implementation

**Modify:**
- `src/providers/index.js` - Register the claude provider
- `src/tools/chat.js` - Add model routing for "claude"

### Provider Structure (claude.js)

```javascript
// Model configuration
const SUPPORTED_MODELS = {
  claude: {
    modelName: 'claude',
    friendlyName: 'Claude (via Agent SDK)',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsImages: false,
    supportsTemperature: false,
    timeout: 120000,
    description: 'Claude via Agent SDK - requires claude login authentication'
  }
};

// Provider exports
export const claudeProvider = {
  invoke,           // Main execution function
  validateConfig,   // Check if authenticated (no API key check!)
  isAvailable,      // Availability check
  getSupportedModels,
  getModelConfig
};
```

### SDK Integration Pattern

```javascript
import { query } from '@anthropic-ai/claude-agent-sdk';

// Streaming mode - iterate over query() generator
const response = query({
  prompt: lastUserMessage,
  options: {
    maxTurns: 1,  // Single turn for chat
    // Do NOT pass apiKey or authentication options
  }
});

for await (const message of response) {
  // Handle: system (init), assistant (content), result (final)
}
```

### Message Type Handling

| SDK Message Type | Action |
|-----------------|--------|
| `system` (subtype: `init`) | Extract session_id, model info |
| `assistant` | Extract content from `message.content` |
| `result` (subtype: `success`) | Extract final result, usage stats |
| `result` (subtype: `error_*`) | Handle error, throw ProviderError |

### Authentication Check

Unlike other providers that check for API keys, this provider:
- Does NOT check for `ANTHROPIC_API_KEY`
- Returns `true` from `validateConfig()` optimistically
- Handles authentication errors at runtime with clear error message

### Context Manifest

<!-- CONTEXT_MANIFEST:BEGIN -->

## How the Provider System Currently Works

The Converse MCP Server implements a **functional provider architecture** where each AI provider is a module exporting an object with pure functions rather than classes. This design enables seamless provider switching and uniform async processing.

### Provider Interface Contract

Every provider MUST implement the unified interface defined in `src/providers/interface.js`:

**Required Methods:**
1. **`invoke(messages, options)`** - Main execution function that accepts message arrays and returns either:
   - Synchronous: `{ content, stop_reason, rawResponse, metadata }`
   - Streaming: AsyncGenerator yielding provider-specific events
2. **`validateConfig(config)`** - Checks if provider configuration is valid (returns boolean)
3. **`isAvailable(config)`** - Checks if provider is available with current config (returns boolean)
4. **`getSupportedModels()`** - Returns object mapping model names to ModelConfig objects
5. **`getModelConfig(modelName)`** - Returns ModelConfig for a specific model or null

**Message Format:**
- Input: Array of `{ role: 'system'|'user'|'assistant', content: string|Array<ContentItem> }`
- Content can be simple strings OR multimodal arrays with text/image parts
- Images use Anthropic format: `{ type: 'image', source: { type: 'base64', media_type: '...', data: '...' } }`

**Response Format:**
```javascript
{
  content: string,              // Generated text
  stop_reason: string,          // 'stop', 'length', 'tool_use', etc.
  rawResponse: Object,          // Original API response
  metadata: {
    provider: string,           // Provider name
    model: string,              // Model used
    usage: {                    // Token usage
      input_tokens: number,
      output_tokens: number,
      total_tokens: number,
      cached_input_tokens: number
    },
    response_time_ms: number,
    finish_reason: string
  }
}
```

### Authentication Patterns

The codebase supports **three authentication patterns**:

1. **API Key Authentication** (OpenAI, Google API, XAI, Anthropic)
   - Keys stored in `config.apiKeys[provider]` (e.g., `config.apiKeys.openai`)
   - `validateConfig()` checks for API key presence
   - Example: `src/providers/openai.js`

2. **OAuth/CLI Authentication** (Gemini CLI)
   - Uses filesystem-based credentials from separate CLI tool
   - Checks for credentials file in `~/.gemini/oauth_creds.json`
   - `validateConfig()` checks file existence, NOT API keys
   - Example: `src/providers/gemini-cli.js` (lines 60-68)

3. **SDK-Based Authentication** (Codex, **Claude SDK**)
   - Uses authentication handled by external SDK
   - Returns `true` from `validateConfig()` optimistically
   - Handles authentication errors at runtime when SDK is invoked
   - Example: `src/providers/codex.js` (lines 413-418)

**For Claude SDK Provider:** Follow pattern #3 - SDK handles auth via `claude login`, so `validateConfig()` should return `true` and let authentication errors surface during execution.

### Lazy Loading Pattern

Providers use **dynamic imports** to keep SDKs as optional dependencies:

```javascript
async function getClaudeSDK() {
  try {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    return query;
  } catch (error) {
    throw new ClaudeProviderError(
      'Claude SDK not installed. Install with: npm install @anthropic-ai/claude-agent-sdk',
      'CLAUDE_SDK_NOT_INSTALLED',
      error
    );
  }
}
```

This pattern is used in:
- `src/providers/codex.js` (lines 66-85) - Codex SDK
- `src/providers/gemini-cli.js` (lines 74-86) - Gemini CLI SDK

### Message Conversion for Prompt-Only APIs

Some providers (Codex, Claude SDK) expect **single prompts** rather than message history. The conversion pattern:

```javascript
function convertMessagesToPrompt(messages) {
  // Find last user message
  const lastUserMessage = messages.filter(m => m.role === 'user').pop();

  // Extract text from string or multimodal content
  if (typeof lastUserMessage.content === 'string') {
    return lastUserMessage.content;
  }

  // Handle multimodal: extract text parts, warn about images
  if (Array.isArray(lastUserMessage.content)) {
    const textParts = lastUserMessage.content
      .filter(item => item.type === 'text')
      .map(item => item.text);
    return textParts.join('\n');
  }
}
```

See `src/providers/codex.js` (lines 88-148) for full implementation.

### Streaming Implementation

Providers implement streaming via **AsyncGenerator functions** that yield provider-specific events. These are then normalized by `ProviderStreamNormalizer` (in `src/async/providerStreamNormalizer.js`).

**Two streaming modes:**

1. **Provider yields raw events** → Normalizer converts to standard format
2. **Provider yields pre-normalized events** → Normalizer passes through

**Standard event types:**
- `{ type: 'start', provider, model }` - Stream initialization
- `{ type: 'delta', data: { textDelta } }` - Content chunk
- `{ type: 'usage', usage: { input_tokens, output_tokens, ... } }` - Token usage
- `{ type: 'end', stop_reason, finish_reason }` - Completion
- `{ type: 'error', error, provider }` - Error

**For Claude SDK:** The SDK's `query()` function returns an AsyncGenerator yielding `SDKMessage` types. Create a streaming generator that:
1. Iterates over SDK messages
2. Yields normalized events for each message type
3. Handles `assistant`, `result`, and `system` message types

See `src/providers/gemini-cli.js` (lines 108-182) for a clean streaming implementation.

### Provider Registration

Providers are registered in `src/providers/index.js`:

```javascript
import { claudeProvider } from './claude.js';

const providers = {
  openai: openaiProvider,
  xai: xaiProvider,
  'gemini-cli': geminiCliProvider,
  codex: codexProvider,
  claude: claudeProvider,  // ADD THIS
};
```

The provider name in this registry is used by the model routing logic.

### Model Routing in Chat Tool

The chat tool maps model names to providers via `mapModelToProvider()` in `src/tools/chat.js` (lines 456-554):

**Current routing logic:**
1. `auto` → Checks availability in priority: codex > gemini-cli > openai
2. `codex` → codex provider
3. `gemini` or `gemini-cli` → gemini-cli provider
4. OpenRouter patterns → openrouter provider
5. Model prefix patterns (e.g., `gpt-` → openai, `claude-` → anthropic)
6. Falls back to provider lookup

**For Claude SDK:** Add exact match check after gemini-cli:
```javascript
// Check Claude SDK (exact match only)
if (modelLower === 'claude') {
  return 'claude';
}
```

### Default Model Resolution

When `model: "auto"` is used, `resolveAutoModel()` maps provider to default model (lines 436-454):

```javascript
const defaults = {
  codex: 'codex',
  'gemini-cli': 'gemini',
  openai: 'gpt-5',
  xai: 'grok-4-0709',
  google: 'gemini-pro',
  anthropic: 'claude-sonnet-4-20250514',
  // Add: claude: 'claude'
};
```

### Error Handling Pattern

Providers use custom error classes extending `ProviderError`:

```javascript
class ClaudeProviderError extends ProviderError {
  constructor(message, code, originalError = null) {
    super(message, code, originalError);
    this.name = 'ClaudeProviderError';
  }
}
```

**Map SDK errors to standard ErrorCodes:**
- Authentication failures → `ErrorCodes.INVALID_API_KEY`
- Timeout errors → `ErrorCodes.TIMEOUT_ERROR`
- Rate limits → `ErrorCodes.RATE_LIMIT_EXCEEDED`
- Generic failures → `ErrorCodes.API_ERROR`

See error code definitions in `src/providers/interface.js` (lines 155-183).

### SDK Message Types (Claude Agent SDK)

From `agent-sdk/typescript.md`, the `query()` function yields these message types:

**`SDKSystemMessage` (type: 'system')**
- Subtype: 'init'
- Contains: session_id, model, tools, mcp_servers, permissionMode
- Use: Extract session info, log initialization

**`SDKAssistantMessage` (type: 'assistant')**
- Contains: message.content (array of ContentBlock from Anthropic SDK)
- Use: Extract text content for streaming/accumulation

**`SDKResultMessage` (type: 'result')**
- Subtype: 'success' or 'error_*'
- Contains: usage (NonNullableUsage), result (string), duration_ms
- Use: Extract final usage stats, completion status

### Configuration Values

Provider configurations are accessed via `options.config`:
- `config.apiKeys[provider]` - API keys
- `config.providers[providerkey]` - Provider-specific settings
- `config.server.client_cwd` - Client working directory

**For Claude SDK:** No configuration needed (authentication via CLI), but could optionally support:
- `config.providers.claudeworkingdirectory` - Override CWD for SDK
- `config.providers.claudesandboxmode` - Sandbox mode (read-only, workspace-write, etc.)

---

## Technical Reference

### Primary Files to Modify

**`src/providers/claude.js` (CREATE NEW)**
- Location: New file in src/providers/
- Purpose: Implement Claude SDK provider following unified interface
- Pattern: Similar to `codex.js` structure (SDK-based, prompt conversion, streaming)

**`src/providers/index.js` (MODIFY)**
- Lines 17-18: Add import: `import { claudeProvider } from './claude.js';`
- Lines 26-36: Add to providers object: `claude: claudeProvider,`

**`src/tools/chat.js` (MODIFY)**
- Lines 436-454: Add to `resolveAutoModel()` defaults: `claude: 'claude',`
- Lines 456-554: Add to `mapModelToProvider()` after line 479:
  ```javascript
  // Check Claude SDK (exact match only)
  if (modelLower === 'claude') {
    return 'claude';
  }
  ```

**`src/tools/consensus.js` (MODIFY - same changes as chat.js)**
- Function `resolveAutoModel()` (around line 716-722)
- Function `mapModelToProvider()` (around line 724-800)

### Reference Files (Read-Only Context)

**`src/providers/interface.js`**
- Lines 85-132: Provider interface definition
- Lines 138-150: ProviderError base class
- Lines 155-183: ErrorCodes enum
- Lines 212-220: StopReasons enum

**`src/providers/codex.js`**
- Lines 20-36: Model configuration structure (SUPPORTED_MODELS)
- Lines 41-46: Custom error class pattern
- Lines 66-85: Lazy SDK loading pattern
- Lines 88-148: Message to prompt conversion
- Lines 167-211: Streaming generator pattern
- Lines 256-406: Main invoke() implementation
- Lines 413-418: validateConfig() for SDK-based auth

**`src/providers/gemini-cli.js`**
- Lines 26-44: Model configuration with sdkModelName mapping
- Lines 60-68: OAuth credentials check pattern
- Lines 74-86: Lazy SDK import pattern
- Lines 108-182: Clean streaming generator implementation
- Lines 221-268: Message format conversion (multimodal handling)

**`src/async/providerStreamNormalizer.js`**
- Lines 34-46: Provider normalizer registry
- Lines 48-81: Main normalize() method

### Key Function Signatures

**`invoke(messages, options)`** - Provider interface
```javascript
async invoke(messages, options = {}) {
  const { model, config, stream, signal, continuation_id, continuationStore,
          reasoning_effort, temperature, use_websearch } = options;

  // Return AsyncGenerator for streaming OR
  // Return { content, stop_reason, rawResponse, metadata }
}
```

**`validateConfig(config)`** - Configuration validation
```javascript
validateConfig(_config) {
  return true; // For SDK-based auth, optimistically return true
}
```

**`getModelConfig(modelName)`** - Model lookup
```javascript
getModelConfig(modelName) {
  const modelNameLower = modelName.toLowerCase();

  // Check exact match
  if (SUPPORTED_MODELS[modelNameLower]) {
    return SUPPORTED_MODELS[modelNameLower];
  }

  // Check aliases
  for (const [_name, config] of Object.entries(SUPPORTED_MODELS)) {
    if (config.aliases?.some(alias => alias.toLowerCase() === modelNameLower)) {
      return config;
    }
  }

  return null;
}
```

### SDK Function Signatures (Claude Agent SDK)

**`query({ prompt, options })`** - From @anthropic-ai/claude-agent-sdk
```typescript
function query({
  prompt: string | AsyncIterable<SDKUserMessage>,
  options?: {
    model?: string,
    cwd?: string,
    maxTurns?: number,
    // ... other options
  }
}): AsyncGenerator<SDKMessage, void>
```

**Message Types:**
- `SDKSystemMessage`: { type: 'system', subtype: 'init', session_id, model, ... }
- `SDKAssistantMessage`: { type: 'assistant', message: { content: ContentBlock[] }, ... }
- `SDKResultMessage`: { type: 'result', subtype: 'success'|'error_*', usage, result, ... }

### Patterns to Follow

**1. Provider Module Structure** (from `codex.js`)
```javascript
// Model configuration
const SUPPORTED_MODELS = { ... };

// Custom error class
class ClaudeProviderError extends ProviderError { ... }

// Helper functions
async function getClaudeSDK() { ... }
function convertMessagesToPrompt(messages) { ... }
async function* createStreamingGenerator(...) { ... }

// Provider export
export const claudeProvider = {
  async invoke(messages, options) { ... },
  validateConfig(config) { ... },
  isAvailable(config) { ... },
  getSupportedModels() { ... },
  getModelConfig(modelName) { ... }
};
```

**2. Lazy SDK Loading** (from `codex.js` lines 66-85)
- Dynamic import with try/catch
- Clear error message if SDK missing
- Custom error code for SDK not installed

**3. Message Conversion** (from `codex.js` lines 88-148)
- Find last user message
- Handle string content
- Handle array content (extract text, warn about images)
- Validate message format

**4. Streaming Generator** (from `gemini-cli.js` lines 108-182)
- Yield start event
- Iterate SDK response, yield deltas
- Yield usage event
- Yield end event with stop_reason
- Handle cancellation via signal

**5. Error Mapping** (from `codex.js` lines 372-406)
- Catch errors during execution
- Map to standard ErrorCodes
- Include originalError for debugging
- Re-throw as provider-specific error

<!-- CONTEXT_MANIFEST:END -->

<!-- DESIGN:END -->

<!-- TODO:BEGIN -->

## TODO

### Implementation Steps

1. **Create Provider File**
   - [x] Create `src/providers/claude.js`
   - [x] Add model configuration (SUPPORTED_MODELS)
   - [x] Implement custom error class `ClaudeProviderError`
   - [x] Implement lazy SDK loading (`getClaudeSDK()`)

2. **Implement Core Functions**
   - [x] Implement `convertMessagesToPrompt()` - extract last user message
   - [x] Implement `createStreamingGenerator()` - yield normalized events
   - [x] Implement `invoke()` - main execution with streaming/sync modes
   - [x] Implement `validateConfig()` - return true (no API key check)
   - [x] Implement `isAvailable()`, `getSupportedModels()`, `getModelConfig()`

3. **Register Provider**
   - [x] Import and register in `src/providers/index.js`
   - [x] Add model routing in `src/tools/chat.js` (`mapModelToProvider`)
   - [x] Add default model in `resolveAutoModel()`

4. **Stream Normalization**
   - [x] Handle SDK message types (system, assistant, result) - built into createStreamingGenerator
   - Note: No changes needed to providerStreamNormalizer.js as events are pre-normalized

5. **Testing**
   - [ ] Add unit tests in `tests/providers/claude.test.js`
   - [ ] Test streaming mode
   - [ ] Test sync mode
   - [ ] Test error handling (auth failure, timeout, etc.)

6. **Verification**
   - [ ] Test with chat tool: `model: "claude"`
   - [ ] Test with consensus tool including claude
   - [x] Verify no API key is used

<!-- TODO:END -->

<!-- NOTES:BEGIN -->

## Notes

### Key Implementation Decisions

1. **No API Key Authentication**: Unlike the Anthropic provider that uses `ANTHROPIC_API_KEY`, this provider intentionally does NOT use API key authentication. The user must be logged in via `claude login` command.

2. **Single Model**: Only expose `claude` model name. The SDK handles model selection internally.

3. **SDK Message Format**: The Claude Agent SDK returns messages via async generator. Key types:
   - `system` with `subtype: 'init'` - session initialization
   - `assistant` - model responses with `message.content`
   - `result` with `subtype: 'success'` or `'error_*'` - final results with usage

4. **Prompt-Only Interface**: Like codex, the SDK expects single prompts, not message history. Extract last user message content.

### Reference Documentation

- Claude Agent SDK docs: `agent-sdk/` folder
- TypeScript reference: `agent-sdk/typescript.md`
- Sessions guide: `agent-sdk/sessions.md`

### Related Files

- `src/providers/codex.js` - Reference implementation (thread-based, no API key)
- `src/providers/gemini-cli.js` - Reference implementation (OAuth-based, no API key)
- `src/providers/interface.js` - Provider interface and error codes
- `src/providers/index.js` - Provider registration
- `src/tools/chat.js` - Model routing

### Implementation Log (2025-11-24)

**Files Created:**
- `src/providers/claude.js` - Main provider implementation (479 lines)

**Files Modified:**
- `src/providers/index.js` - Added import and registration for claudeProvider
- `src/tools/chat.js` - Added model routing for claude/claude-sdk/claude-code, added default model
- `src/tools/consensus.js` - Added model routing for claude/claude-sdk/claude-code, added default model

**Key Implementation Details:**
- Uses `@anthropic-ai/claude-agent-sdk` package (lazy-loaded as optional dependency)
- Authentication via `claude login` CLI command (NOT API keys)
- Single model exposed: `claude` with aliases `claude-sdk` and `claude-code`
- Model routing: `claude`, `claude-sdk`, `claude-code` → claude provider (SDK)
- Model routing: `claude-3-*`, `claude-sonnet`, etc. → anthropic provider (API)
- Streaming uses pre-normalized events compatible with ProviderStreamNormalizer
- SDK options: `maxTurns: 1`, `permissionMode: 'bypassPermissions'`

**Linting:** Passed (no errors in claude.js)

**User Testing Required:** Manual verification with actual SDK needed

### Bug Fix (2025-11-24 23:01)

**Issues Found During Testing:**

1. **`error_max_turns` error when using `files` parameter**
   - Root cause: `maxTurns: 1` was too restrictive
   - When files are passed, the SDK needs additional turns to read files using internal tools
   - Fix: Increased `maxTurns` from 1 to 10

2. **Images not being sent to the model**
   - Root cause: Using single message mode (string prompt) which doesn't support images
   - According to `agent-sdk/streaming-vs-single-mode.md`:
     > Single message input mode does **not** support: Direct image attachments in messages
   - Fix: Implemented streaming input mode for multimodal content
   - When images are present, the provider now uses an `AsyncGenerator<SDKUserMessage>` instead of a plain string

**Changes Made:**

1. **`convertMessagesToPrompt()` → `convertMessagesToSdkInput()`**
   - Now returns `{ prompt, sdkMessage, hasImages }` instead of just a string
   - If images are present, builds an `SDKUserMessage` object with multimodal content
   - If no images, returns a plain string prompt

2. **Added `createSdkMessageGenerator()`**
   - Helper async generator that yields a single SDK user message
   - Required for streaming input mode

3. **Updated `createStreamingGenerator()`**
   - Now accepts both `prompt` (string) and `sdkMessage` (object) parameters
   - Uses streaming input mode (AsyncGenerator) when sdkMessage is present
   - Uses single message mode (string) for text-only content
   - Increased `maxTurns` from 1 to 10

4. **Updated model config**
   - Changed `supportsImages: false` → `supportsImages: true`

<!-- NOTES:END -->
