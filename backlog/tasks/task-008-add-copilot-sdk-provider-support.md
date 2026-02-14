---
id: task-008-add-copilot-sdk-provider-support
title: Add Copilot SDK Provider Support
status: "In Progress"
created_date: '2026-02-14 18:07'
updated_date: '2026-02-14 18:45'
parent: null
subtasks: []
dependencies: []
---

## Description
<!-- DESCRIPTION:BEGIN -->
Add a new "copilot" provider to the Converse MCP Server that uses GitHub's Copilot CLI SDK to access Copilot models via subscription-based authentication, similar to how the existing Claude SDK, Codex CLI, and Gemini CLI providers are implemented.

**Problem:** Currently, the Converse MCP Server supports several CLI-based providers (Codex, Claude SDK, Gemini CLI) that leverage subscription authentication rather than per-usage API costs. Users with GitHub Copilot subscriptions (Individual, Business, or Enterprise) want similar access to Copilot models without needing to manage separate API keys or incur additional API costs.

**Solution:** Create a new `copilot` provider that wraps the GitHub Copilot CLI SDK. The provider will:
- Use the user's existing GitHub Copilot CLI authentication
- NOT use API key authentication (the entire point is subscription-based access)
- Expose Copilot models available through the SDK
- Follow the same patterns as the Claude SDK, Codex, and Gemini CLI providers for consistency
- Support streaming responses via async generators
- Integrate with both the chat and consensus tools
<!-- DESCRIPTION:END -->

## Specification
<!-- SPECIFICATION:BEGIN -->
### Technical Requirements

1. **Provider Implementation** (`src/providers/copilot.js`)
   - Implement unified provider interface: `invoke()`, `validateConfig()`, `isAvailable()`, `getSupportedModels()`, `getModelConfig()`
   - Return `{ content, stop_reason, rawResponse, metadata }` from `invoke()`
   - Support both sync and streaming modes

2. **SDK Integration** (`@github/copilot-sdk`)
   - Package: `@github/copilot-sdk` (lazy-loaded via dynamic import)
   - Client: `CopilotClient` — manages CLI process lifecycle via JSON-RPC
   - Session: `CopilotSession` — per-request conversation
   - Streaming: `session.on()` callback events → async generator → normalized events
   - Cleanup: `session.destroy()` after each request; client singleton persists
   - **Use installed SDK types as source of truth for event names** (not external docs which may be stale)

3. **Authentication** (GitHub only, no BYOK)
   - Uses existing Copilot CLI login (stored OAuth credentials via `useLoggedInUser: true`)
   - Auto-detects env vars: `COPILOT_GITHUB_TOKEN` > `GH_TOKEN` > `GITHUB_TOKEN`
   - No new `.env` config keys — `validateConfig()` returns `true` optimistically
   - Auth errors surface at runtime: "Install and authenticate Copilot CLI: copilot auth login"

4. **Client Lifecycle**
   - Module-level singleton `CopilotClient` (lazy init, `autoStart: true`, `autoRestart: true`)
   - Fresh `CopilotSession` per request with `{ model, streaming: true/false }`
   - `session.destroy()` in finally block after every request

5. **Model Support**
   - Primary entry: `copilot` (user-facing alias)
   - Aliases: `copilot-sdk`, `github-copilot`
   - **Model selection via `COPILOT_MODEL` env var** — if set, passed to SDK; if absent, omit `model` from session config (SDK picks default, likely whatever was last selected in Copilot CLI)
   - **Precedence:** explicit `model` param from user request > `COPILOT_MODEL` env > SDK default
   - Config: `contextWindow: 128000`, `maxOutputTokens: 16384`, `supportsStreaming: true`, `supportsImages: false`, `supportsTemperature: false`, timeout: 120000ms

6. **Message Conversion**
   - Extract last user message from messages array (same as Claude SDK pattern)
   - String content → `session.send({ prompt })` or `session.sendAndWait({ prompt })`
   - Array content → extract text parts, join with newline (images not supported)

7. **Streaming Events (SDK → normalized)**
   - **Verify actual event names from installed SDK types** (e.g., `assistant.message_delta` vs `assistant.message.delta`)
   - Delta events → `{ type: 'delta', data: { textDelta } }`
   - Usage events (if available from SDK) → `{ type: 'usage', usage: { input_tokens, output_tokens, total_tokens } }`
   - Idle/complete → `{ type: 'end', stop_reason: 'stop' }`
   - Error events → throw `CopilotProviderError`
   - Normalize in-provider AND add passthrough normalizer entry in `providerStreamNormalizer.js` (required for async chat path)

8. **Stream Normalizer** (`src/async/providerStreamNormalizer.js`)
   - Add generic passthrough normalizer for `copilot` (and `claude`, `gemini-cli` for consistency)
   - Passthrough: events already in normalized format (start/delta/usage/end) → wrap in standard `createXxxEvent()` calls
   - Required because async chat always calls `providerStreamNormalizer.normalize()` (chat.js:865)

9. **Tool Access Control** (like Codex's sandbox modes)
   - `COPILOT_TOOL_ACCESS` env var: `read-only` (default) | `full`
   - Implement via `onPermissionRequest` callback on session config (permission kinds are stable: `read`, `write`, `shell`, `url`, `mcp`)
   - Read-only: allow `read` permission kind, deny `write`/`shell`/`url`/`mcp`
   - Full: allow all permission kinds
   - Add to `CONFIG_SCHEMA.providers` in `src/config.js`

10. **Provider Registration & Model Routing**
    - Register `copilot: copilotProvider` in `src/providers/index.js`
    - `mapModelToProvider()` in chat.js and consensus.js: exact match `copilot`/`copilot-sdk`/`github-copilot` → `'copilot'` (after claude check, before openrouter)
    - `resolveAutoModel()` / `getDefaultModelForProvider()`: `copilot: 'copilot'`
    - Auto-selection priority: add `'copilot'` after `claude`, before `openai` — update ALL duplicated priority paths (chat sync, chat async, consensus sync, consensus async)

11. **Config Validation Fix** (`src/config.js`)
    - Change `loadConfig()` validation from "at least one API key" to "at least one usable provider"
    - SDK-based providers (copilot, codex, claude, gemini-cli) count as usable even without API keys
    - Enables Copilot-only setups without requiring dummy API keys

12. **Node Version Bump**
    - Update `engines.node` in `package.json` from `>=20` to `>=24`
    - Latest `@github/copilot-sdk` requires Node >=24
    - Update CI matrix, Dockerfile, and docs to reflect new baseline

13. **Error Handling**
    - `CopilotProviderError extends ProviderError`
    - SDK not installed → code: `'COPILOT_SDK_NOT_INSTALLED'`
    - Auth failure → `ErrorCodes.INVALID_API_KEY`
    - Timeout → `ErrorCodes.TIMEOUT_ERROR`
    - Rate limit → `ErrorCodes.RATE_LIMIT_EXCEEDED`
    - Other → `ErrorCodes.API_ERROR`

### Acceptance Criteria

- [ ] `validateConfig()` returns `true` optimistically
- [ ] Chat tool works with `model: "copilot"` — returns response (sync and async)
- [ ] Consensus tool works with copilot alongside other models
- [ ] Streaming yields correct normalized events (start → delta(s) → usage? → end)
- [ ] Non-streaming returns complete `{ content, stop_reason, rawResponse, metadata }`
- [ ] No API keys required — only Copilot CLI auth
- [ ] Copilot can be the only configured provider (config validation updated)
- [ ] Graceful error when SDK not installed (clear install instructions)
- [ ] Graceful error when not authenticated (clear auth instructions)
- [ ] `session.destroy()` called after every request (no leaked sessions)
- [ ] Tool access defaults to read-only; `COPILOT_TOOL_ACCESS=full` enables all tools
- [ ] `COPILOT_MODEL` env var controls default model; absent = SDK picks
- [ ] Async chat works (stream normalizer passthrough registered)
- [ ] `pnpm run validate` passes with no regressions
- [ ] Node >=24 engine requirement reflected in package.json

### Out of Scope

- Image/multimodal support (SDK supports file attachments but not base64 images)
- Multi-turn conversation via SDK sessions (Converse manages history separately)
- Custom agents / MCP servers within Copilot SDK sessions
- BYOK (Bring Your Own Key) provider configuration
- Refactoring shared auto-provider selection into single helper (separate task)
- Making `mapModelToProvider('auto')` availability-aware (separate task)
<!-- SPECIFICATION:END -->

## Design
<!-- DESIGN:BEGIN -->
**Architecture Approach:**

Follow the established patterns from `codex.js`, `claude.js`, and `gemini-cli.js` providers:

1. **Lazy Loading**: Dynamically import SDK only when provider is used
2. **Message Conversion**: Convert Converse message format to SDK's expected format
3. **Streaming Generator**: Create async generator yielding normalized events
4. **Error Mapping**: Map SDK errors to standard `ErrorCodes`
5. **Unified Response**: Return standard `{ content, stop_reason, rawResponse, metadata }` format

**Key Files:**
- `src/providers/copilot.js` - New provider implementation (create)
- `src/providers/index.js` - Register the copilot provider (modify)
- `src/tools/chat.js` - Add model routing for copilot (modify)
- `src/tools/consensus.js` - Add model routing for copilot (modify)
- `tests/providers/copilot.test.js` - Unit tests (create)

**Patterns to Follow:**
- `src/providers/claude.js` - Reference for SDK-based auth (optimistic validateConfig, runtime auth errors)
- `src/providers/codex.js` - Reference for lazy SDK loading, message conversion, streaming generator
- `src/providers/gemini-cli.js` - Reference for clean streaming implementation
- `src/providers/interface.js` - Provider interface contract and error codes

**Dependencies:**
- GitHub Copilot CLI SDK package (to be identified and added as optional dependency)
- Existing provider infrastructure (no changes needed to core architecture)
- User must have an active GitHub Copilot subscription and be authenticated via the CLI

**Context Manifest:**

### How Providers Currently Work: Full Flow from Model Name to Response

The Converse MCP Server uses a functional architecture where providers are plain objects exporting functions (not classes). A request flows through these stages:

**1. Model Routing (mapModelToProvider):** When a user specifies a model name (e.g., `"codex"`, `"gemini"`, `"claude"`), the `mapModelToProvider()` function in both `src/tools/chat.js` (line 526) and `src/tools/consensus.js` (line 731) maps it to a provider name. SDK-based providers use exact-match routing:

```javascript
// From src/tools/chat.js lines 541-558
if (modelLower === 'codex') return 'codex';
if (modelLower === 'gemini' || modelLower === 'gemini-cli') return 'gemini-cli';
if (modelLower === 'claude' || modelLower === 'claude-sdk' || modelLower === 'claude-code') return 'claude';
```

The `"auto"` mode checks provider availability in priority order: `codex > gemini-cli > openai`. After routing, `resolveAutoModel()` maps `"auto"` to a provider's default model name (e.g., `codex: 'codex'`, `'gemini-cli': 'gemini'`, `claude: 'claude'`). These defaults are defined in both `chat.js` (line 487) and `consensus.js` (line 704, via `getDefaultModelForProvider`).

**2. Provider Registry (src/providers/index.js):** All providers are imported and registered in a flat object map. The registry key is the provider name used in routing. Registration is a simple static import plus object entry:

```javascript
import { codexProvider } from './codex.js';
import { claudeProvider } from './claude.js';
import { geminiCliProvider } from './gemini-cli.js';

const providers = {
  codex: codexProvider,
  claude: claudeProvider,
  'gemini-cli': geminiCliProvider,
  // ...API-key providers...
};
```

**3. Provider Interface (src/providers/interface.js):** Every provider must export an object implementing five methods: `invoke(messages, options)`, `validateConfig(config)`, `isAvailable(config)`, `getSupportedModels()`, and `getModelConfig(modelName)`. The `invoke` method returns `{ content, stop_reason, rawResponse, metadata }` for synchronous mode, or an `AsyncGenerator` for streaming mode. The metadata object contains `{ provider, model, usage: { input_tokens, output_tokens, total_tokens, cached_input_tokens }, response_time_ms, finish_reason }`.

**4. SDK-Based Provider Pattern (claude.js, codex.js, gemini-cli.js):** These three providers share a common architectural pattern that the copilot provider must follow:

- **Lazy SDK Loading:** A `getXxxSDK()` async function uses dynamic `import()` to load the SDK only when needed. If the import fails, it throws a custom `XxxProviderError` with a descriptive install message. The `isXxxAvailable()` function returns `true` optimistically since the real check happens at import time. Example from `src/providers/claude.js` lines 63-82:

```javascript
async function getClaudeSDK() {
  try {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    return query;
  } catch (error) {
    throw new ClaudeProviderError(
      'Failed to load Claude SDK. Install with: npm install @anthropic-ai/claude-agent-sdk',
      'CLAUDE_SDK_LOAD_ERROR', error);
  }
}
```

- **Custom Error Class:** Each SDK provider defines a custom error class extending `ProviderError` from `interface.js`. The class sets a distinctive `name` property. Pattern:

```javascript
class ClaudeProviderError extends ProviderError {
  constructor(message, code, originalError = null) {
    super(message, code, originalError);
    this.name = 'ClaudeProviderError';
  }
}
```

- **SUPPORTED_MODELS Configuration:** A constant object defines model metadata. The key is the user-facing model name (lowercase). Fields: `modelName`, `friendlyName`, `contextWindow`, `maxOutputTokens`, `supportsStreaming`, `supportsImages`, `supportsTemperature`, `supportsWebSearch`, `supportsThinking` (optional), `timeout`, `description`, `aliases` (array of alternative names), and optionally `sdkModelName` (for internal SDK model mapping, used by gemini-cli).

- **Message Conversion:** Each SDK provider converts the Converse message format (array of `{role, content}` objects where content can be string or array of `{type, text/source}`) to the SDK's expected format. Claude SDK extracts the last user message and converts to either a string prompt or an SDK message object with streaming input. Codex extracts just the last user message text. Gemini CLI converts content arrays to AI SDK `ModelMessage` format.

- **validateConfig / isAvailable:** SDK-based providers that use subscription auth return `true` optimistically. Claude and Codex always return `true` (auth errors surface at runtime). Gemini CLI checks for OAuth credentials file existence at `~/.gemini/oauth_creds.json`. These providers do NOT check `config.apiKeys` since they do not use API keys.

- **Streaming Generator:** The `createStreamingGenerator()` async generator function yields normalized events in this order: `{ type: 'start', provider, model }` -> multiple `{ type: 'delta', data: { textDelta } }` -> `{ type: 'usage', usage: { input_tokens, output_tokens, total_tokens, cached_input_tokens } }` -> `{ type: 'end', stop_reason, finish_reason }`. Claude and Gemini CLI providers yield these pre-normalized events directly. Codex yields raw SDK events that are then normalized by `ProviderStreamNormalizer`.

- **invoke() Method:** Accepts `(messages, options)` where options includes `{ model, config, stream, signal, reasoning_effort, temperature, use_websearch }`. When `stream=true`, returns the async generator directly. When `stream=false`, internally creates the generator, consumes it, accumulates content, and returns the unified response object.

**5. Stream Normalization (src/async/providerStreamNormalizer.js):** The `ProviderStreamNormalizer` class has per-provider normalizer methods registered in `this.normalizers`. Currently registered: `openai`, `xai`, `google`, `anthropic`, `mistral`, `deepseek`, `openrouter`, `codex`. The `normalize(provider, stream, context)` method routes to the correct normalizer. Providers like Claude and Gemini CLI that yield pre-normalized events (start/delta/usage/end format) do NOT need a normalizer entry -- they are consumed directly. Only Codex, which yields raw SDK events (thread.started, item.completed, turn.completed, etc.), has a normalizer.

The choice of approach depends on the Copilot SDK's streaming format. If it yields its own event types, a normalizer entry is needed. If the provider can normalize events internally (like Claude and Gemini CLI do), no normalizer entry is required. The Claude/Gemini CLI approach (normalize in the provider) is simpler and preferred.

**6. Chat Tool Invocation Flow:** The chat tool at `src/tools/chat.js` calls `selectedProvider.invoke(messages, providerOptions)` for synchronous requests (line 346) and `selectedProvider.invoke(messages, streamingOptions)` with `stream: true` for async background jobs (line 864). The async path then pipes through `providerStreamNormalizer.normalize()` to consume the stream. For providers whose streaming generators already yield normalized events, the normalizer just passes them through using the generic handler matching event.type checks (start/delta/usage/end/error).

**7. Consensus Tool Invocation Flow:** The consensus tool at `src/tools/consensus.js` calls providers in parallel via `Promise.allSettled()`. It checks for `call.providerInstance.stream` function existence first. If the provider has a `.stream()` method, it uses streaming with normalization. Otherwise it falls back to `.invoke()`. SDK-based providers do NOT have a separate `.stream()` method -- they use `invoke()` with `stream: true` in options to return a generator.

**8. Configuration:** API-key providers have entries in `CONFIG_SCHEMA.apiKeys` (`src/config.js`). SDK-based providers that do not use API keys (codex, claude, gemini-cli) either have no config entries at all (claude, gemini-cli) or have optional config entries under `CONFIG_SCHEMA.providers` (codex has `CODEX_API_KEY`, `CODEX_SANDBOX_MODE`, etc.). The copilot provider needs NO new config entries since it uses subscription-based authentication. The `loadConfig()` function validates that at least one API key OR Vertex AI is configured -- SDK-based providers bypass this validation by not requiring API keys. The config validation may need attention if copilot is the only provider configured (currently, at least one API key must exist).

### For New Feature Implementation: What Needs to Connect

**Files to Create:**

1. `src/providers/copilot.js` -- New provider module. Follow the claude.js pattern most closely since both use subscription-based auth with optimistic validateConfig. Structure:
   - `SUPPORTED_MODELS` constant with copilot model config
   - `CopilotProviderError` class extending `ProviderError`
   - `getCopilotSDK()` async function with dynamic import
   - Message conversion function (convert Converse messages to SDK format)
   - `createStreamingGenerator()` async generator yielding normalized events (start/delta/usage/end)
   - `copilotProvider` object with `invoke`, `validateConfig`, `isAvailable`, `getSupportedModels`, `getModelConfig`

2. `tests/integration/providers/copilot/copilot-api.test.js` -- E2E tests following the pattern from `codex-api.test.js` and `gemini-cli-api.test.js`. Uses `withHTTPTestServer`, `testWithApiKeys`, `loadConfig`.

**Files to Modify:**

3. `src/providers/index.js` -- Add import and registry entry:
   ```javascript
   import { copilotProvider } from './copilot.js';
   // In providers object:
   copilot: copilotProvider,
   ```

4. `src/tools/chat.js` -- Three changes:
   - `mapModelToProvider()` (line 526): Add exact match for copilot model names before the keyword matching section (around line 558, after the claude check):
     ```javascript
     if (modelLower === 'copilot' || modelLower === 'copilot-sdk') return 'copilot';
     ```
   - `resolveAutoModel()` (line 482): Add `copilot: 'copilot'` to the defaults map (line 487)
   - Consider adding copilot to the auto-selection priority in mapModelToProvider's auto handling (line 530)

5. `src/tools/consensus.js` -- Three parallel changes:
   - `mapModelToProvider()` (line 731): Add same exact match routing
   - `getDefaultModelForProvider()` (line 703): Add `copilot: 'copilot'` entry
   - Consider adding copilot to the auto-selection priority

6. `tests/utils/apiKeyDetection.js` -- Add `COPILOT` entry to `API_KEY_CONFIGS` with a `customCheck` function (similar to CODEX pattern at line 71). Check for SDK package existence via filesystem check of `node_modules/` path.

7. `tests/utils/conditionalTest.js` -- Add `export const hasCopilot = hasApiKey('COPILOT');` (line 69 area).

8. `package.json` -- Add Copilot SDK as a dependency. Current SDK-based deps are listed as regular dependencies (not optional): `"@anthropic-ai/claude-agent-sdk": "^0.2.32"`, `"@openai/codex-sdk": "^0.98.0"`, `"ai-sdk-provider-gemini-cli": "^2.0.1"`. The copilot SDK package should be added similarly.

**Stream Normalization Decision:**

If the Copilot SDK yields standard chat-completion-like events, the provider should normalize them internally in `createStreamingGenerator()` (like claude.js and gemini-cli.js do) and NOT require a normalizer entry in `providerStreamNormalizer.js`. If the SDK yields unique event types (like Codex's thread.started/item.completed/turn.completed), then add a `normalizecopilotStream` method to `ProviderStreamNormalizer` and register it in the constructor's `this.normalizers` map.

**Patterns That Must Be Followed:**

- Module exports a single named export (e.g., `export const copilotProvider = { ... }`)
- All functions are pure or use closures; no classes for the provider itself (only for errors)
- Provider name in the registry should be `'copilot'` (lowercase, no hyphens)
- Model name routing uses exact lowercase match (not keyword/substring matching like API providers)
- Unsupported parameters (temperature, use_websearch, reasoning_effort) should be logged at debug level and ignored, not errored
- AbortSignal handling: check `signal?.aborted` in streaming loops and throw on cancellation
- The streaming generator must yield events in order: start -> deltas -> usage -> end
- Error mapping: catch SDK errors and map to standard ErrorCodes (INVALID_API_KEY for auth, TIMEOUT_ERROR, RATE_LIMIT_EXCEEDED, API_ERROR as fallback)

**Assumptions That Might Break:**

- The `loadConfig()` function in `src/config.js` (line 612) requires at least one API key or Vertex AI. If copilot is the only provider, config validation will fail. This may need adjustment to also check for SDK-based provider availability, or copilot users will need at least one API key configured alongside it.
- The consensus tool's streaming path (line 1448-1451) checks for `call.providerInstance.stream` method. SDK providers use `invoke()` with `stream: true` instead. The consensus tool handles this by falling back to `invoke()` -- this works correctly for SDK providers.

### Technical Reference Details

#### Component Interfaces & Signatures

**Provider Interface (src/providers/interface.js):**
```typescript
interface Provider {
  invoke(messages: Message[], options: InvokeOptions): Promise<ProviderResponse> | AsyncGenerator;
  validateConfig(config: object): boolean;
  isAvailable(config: object): boolean;
  getSupportedModels(): Record<string, ModelConfig>;
  getModelConfig(modelName: string): ModelConfig | null;
}
```

**InvokeOptions:**
```typescript
interface InvokeOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  reasoning_effort?: string;  // 'none'|'minimal'|'low'|'medium'|'high'|'max'
  use_websearch?: boolean;
  signal?: AbortSignal;
  config: { apiKeys: object; providers?: object; server?: { client_cwd?: string } };
  continuation_id?: string;
  continuationStore?: object;
}
```

**ProviderResponse:**
```typescript
interface ProviderResponse {
  content: string;
  stop_reason: string;  // StopReasons enum value
  rawResponse: object;
  metadata: {
    provider: string;
    model: string;
    usage: { input_tokens: number; output_tokens: number; total_tokens: number; cached_input_tokens: number } | null;
    response_time_ms: number;
    finish_reason: string;
  };
}
```

**Streaming Event Types (yielded by generator):**
```typescript
{ type: 'start', provider: string, model: string }
{ type: 'delta', data: { textDelta: string } }
{ type: 'usage', usage: { input_tokens: number, output_tokens: number, total_tokens: number, cached_input_tokens: number } }
{ type: 'end', stop_reason: string, finish_reason: string }
```

**ProviderError constructor:** `new ProviderError(message: string, code: string, originalError?: Error)`

**ErrorCodes constants:** `MISSING_API_KEY`, `INVALID_API_KEY`, `INVALID_MESSAGES`, `MODEL_NOT_FOUND`, `RATE_LIMIT_EXCEEDED`, `QUOTA_EXCEEDED`, `API_ERROR`, `TIMEOUT_ERROR`, `NETWORK_ERROR`, and others.

**StopReasons constants:** `STOP`, `LENGTH`, `TOOL_USE`, `CONTENT_FILTER`, `SAFETY`, `ERROR`, `OTHER`.

#### Data Structures

**ModelConfig shape:**
```javascript
{
  modelName: 'copilot',
  friendlyName: 'GitHub Copilot (via CLI SDK)',
  contextWindow: number,      // e.g., 128000
  maxOutputTokens: number,    // e.g., 16384
  supportsStreaming: true,
  supportsImages: boolean,
  supportsTemperature: boolean,
  supportsWebSearch: boolean,
  supportsThinking: boolean,   // optional
  timeout: number,             // milliseconds
  description: string,
  aliases: string[],           // e.g., ['copilot-sdk']
  sdkModelName: string,        // optional, for internal SDK mapping
}
```

**Message format (Converse internal):**
```javascript
{ role: 'system'|'user'|'assistant', content: string | ContentItem[] }
// ContentItem: { type: 'text', text: string } | { type: 'image', source: { type: 'base64', media_type: string, data: string } }
```

#### Configuration Requirements

No new environment variables needed. The copilot provider uses GitHub Copilot CLI subscription-based authentication. Existing Codex provider config keys are under `CONFIG_SCHEMA.providers` with prefix `CODEX_` -- copilot should NOT need similar config keys unless the SDK requires specific settings.

#### File Locations

- **New provider implementation:** `src/providers/copilot.js`
- **Provider registry:** `src/providers/index.js`
- **Provider interface/errors:** `src/providers/interface.js`
- **Chat tool routing:** `src/tools/chat.js` (functions: `mapModelToProvider` at line 526, `resolveAutoModel` at line 482)
- **Consensus tool routing:** `src/tools/consensus.js` (functions: `mapModelToProvider` at line 731, `getDefaultModelForProvider` at line 703, `resolveAutoModel` at line 723)
- **Stream normalizer:** `src/async/providerStreamNormalizer.js` (only if raw SDK events need normalizing)
- **Configuration:** `src/config.js` (no changes expected)
- **Reference providers:** `src/providers/claude.js`, `src/providers/codex.js`, `src/providers/gemini-cli.js`
- **Test utilities:** `tests/utils/apiKeyDetection.js`, `tests/utils/conditionalTest.js`
- **Test location:** `tests/integration/providers/copilot/copilot-api.test.js`
- **Package config:** `package.json` (add SDK dependency)
<!-- DESIGN:END -->

## TODO
<!-- TODO:BEGIN -->
### Setup
- [ ] Install SDK: `pnpm add @github/copilot-sdk`
- [ ] Bump Node engine in `package.json` from `>=20` to `>=24`
- [ ] Verify actual SDK event names from installed types (`node_modules/@github/copilot-sdk/dist/`)

### Provider Implementation
- [ ] Create `src/providers/copilot.js` (~250 lines, modeled on claude.js):
  - [ ] `SUPPORTED_MODELS` constant (copilot entry with aliases: copilot-sdk, github-copilot)
  - [ ] `CopilotProviderError extends ProviderError`
  - [ ] `getCopilotSDK()` — lazy `import('@github/copilot-sdk')`
  - [ ] `getCopilotClient()` — module-level singleton, `autoStart: true`, `autoRestart: true`
  - [ ] `convertMessagesToPrompt(messages)` — extract last user message text
  - [ ] `createStreamingGenerator(client, prompt, options, signal)` — bridge `session.on()` events to async generator; verify event names against SDK types
  - [ ] Tool access control via `onPermissionRequest` callback based on `COPILOT_TOOL_ACCESS` env var
  - [ ] Model selection: `COPILOT_MODEL` env → session config; precedence: explicit > env > SDK default
  - [ ] `copilotProvider.invoke(messages, options)` — stream mode returns generator, sync mode consumes internally
  - [ ] `copilotProvider.validateConfig()` — return `true` optimistically
  - [ ] `copilotProvider.isAvailable()`, `getSupportedModels()`, `getModelConfig()`

### Integration
- [ ] Register in `src/providers/index.js`: import + `copilot: copilotProvider`
- [ ] Add passthrough normalizer to `src/async/providerStreamNormalizer.js` for `copilot` (and `claude`, `gemini-cli` for consistency)
- [ ] `src/tools/chat.js`:
  - [ ] `mapModelToProvider()` — add `copilot`/`copilot-sdk`/`github-copilot` exact matches
  - [ ] `resolveAutoModel()` — add `copilot: 'copilot'`
  - [ ] Auto-selection priority — add `'copilot'` after `'claude'` in ALL paths (sync + async)
- [ ] `src/tools/consensus.js`:
  - [ ] `mapModelToProvider()` — same exact matches
  - [ ] `getDefaultModelForProvider()` — add `copilot: 'copilot'`
  - [ ] Auto-selection priority — add `'copilot'` in ALL paths

### Config Changes
- [ ] `src/config.js`:
  - [ ] Add `COPILOT_TOOL_ACCESS` to `CONFIG_SCHEMA.providers` (values: `read-only`|`full`, default: `read-only`)
  - [ ] Add `COPILOT_MODEL` to `CONFIG_SCHEMA.providers` (optional string, no default)
  - [ ] Fix `loadConfig()` validation: "at least one usable provider" instead of "at least one API key"

### Testing
- [ ] `tests/utils/apiKeyDetection.js` — add `COPILOT` entry with `customCheck` (SDK presence + auth readiness)
- [ ] `tests/utils/conditionalTest.js` — add `hasCopilot` export
- [ ] Run `pnpm run validate`

### Verification
- [ ] Manual test: chat tool sync with `model: "copilot"`
- [ ] Manual test: chat tool async with `model: "copilot"` (verifies normalizer)
- [ ] Manual test: consensus tool with copilot alongside other providers
- [ ] Manual test: `COPILOT_TOOL_ACCESS=read-only` blocks write operations
- [ ] Manual test: `COPILOT_MODEL=gpt-5` selects specific model
<!-- TODO:END -->

## Notes
<!-- NOTES:BEGIN -->
### Copilot SDK Technical Reference

**Package:** `@github/copilot-sdk` (Technical Preview — may have breaking changes)
**Architecture:** App → SDK Client → JSON-RPC → Copilot CLI (server mode)
**Requires:** Copilot CLI installed in PATH (`copilot --version`), Node >=24

**IMPORTANT:** External docs (README, instructions file) may contain stale event names. Always verify against installed SDK types at `node_modules/@github/copilot-sdk/dist/generated/session-events.d.ts`.

**Client API:**
```javascript
import { CopilotClient } from '@github/copilot-sdk';
const client = new CopilotClient({ autoStart: true, autoRestart: true, useLoggedInUser: true });
await client.start();
```

**Session API:**
```javascript
const session = await client.createSession({ model: 'gpt-4.1', streaming: true });
// Sync: const response = await session.sendAndWait({ prompt: 'Hello' });
// Async: session.send({ prompt }); + session.on(callback);
await session.destroy();
```

**Streaming Events (verify against SDK types):**
- `assistant.message_delta` (underscore, NOT dot) → incremental text
- `assistant.message` → complete message
- `assistant.usage` → token usage data (EXISTS — earlier assumption was wrong)
- `assistant.reasoning_delta` → incremental reasoning
- `assistant.reasoning` → complete reasoning
- `session.idle` → processing complete
- `session.error` → error description

**Auth Priority:** `githubToken` param > `COPILOT_GITHUB_TOKEN` > `GH_TOKEN` > `GITHUB_TOKEN` > stored CLI credentials

**Permission Kinds (for onPermissionRequest):** `read`, `write`, `shell`, `url`, `mcp`

### Key Implementation Decisions

1. **Client Singleton:** One `CopilotClient` per process. Creating/destroying per request too expensive (spawns CLI process). `autoRestart: true` handles crashes.

2. **Session Per Request:** New `CopilotSession` per `invoke()`, destroyed after. Matches stateless provider pattern — Converse manages history externally.

3. **Usage Data Available:** SDK emits `assistant.usage` events with token counts (corrected from earlier assumption of no usage data).

4. **Event-to-Generator Bridge:** SDK uses push-based `session.on(callback)`. Bridge to pull-based async generator using Promise + queue pattern. Idle resolves, error rejects.

5. **Normalize In-Provider + Normalizer Entry:** Yield pre-normalized events from `createStreamingGenerator()` AND register passthrough normalizer in `providerStreamNormalizer.js`. Async chat path (`chat.js:865`) always calls `normalize()` — without an entry, async requests throw.

6. **Tool Access via onPermissionRequest:** Safer than tool allowlists (tool names can drift, permission kinds are stable). Read-only mode: allow `read`, deny all others. Full mode: allow all.

7. **Model Precedence:** User request model param > `COPILOT_MODEL` env var > SDK default (omit model from session). The `"copilot"` alias is only for Converse routing — never passed directly to SDK.

8. **Config Validation Fix:** Change `loadConfig()` from "at least one API key" to "at least one usable provider" so SDK-only setups work.

### Review History

**Codex Review (2026-02-14):** Identified 10 issues across 2 rounds. Critical fixes applied:
- Stream normalizer entry required (async chat would fail)
- Config validation blocks SDK-only users
- SDK event names use underscores not dots
- SDK DOES provide usage data via `assistant.usage`
- Node >=24 required for latest SDK
- Tool access must be restricted by default (security)
- `"copilot"` is not a valid SDK model ID (use env var or omit)

### Related Tasks
- task-003-add-claude-sdk-provider-support — Claude SDK provider (primary reference)
- task-001-add-gemini-cli-provider-support — Gemini CLI provider (reference)

### Related Files
- `src/providers/claude.js` — Primary reference (SDK-based auth, streaming generator)
- `src/providers/codex.js` — Reference (SDK lifecycle, thread management, tool access)
- `src/providers/gemini-cli.js` — Reference (clean streaming, model mapping)
- `src/providers/interface.js` — ProviderError, ErrorCodes, StopReasons
- `src/providers/index.js` — Provider registry
- `src/tools/chat.js` — mapModelToProvider (line 526), resolveAutoModel (line 482)
- `src/tools/consensus.js` — mapModelToProvider (line 731), getDefaultModelForProvider (line 703)
- `src/async/providerStreamNormalizer.js` — Stream normalizer (passthrough entry needed)
- `src/config.js` — Config schema + loadConfig validation (needs fix)
- `tests/utils/apiKeyDetection.js` — API key detection for tests
- `tests/utils/conditionalTest.js` — Conditional test helpers
- `copilot-sdk-nodejs.instructions.md` — SDK instructions (may be stale, verify against installed types)
<!-- NOTES:END -->
