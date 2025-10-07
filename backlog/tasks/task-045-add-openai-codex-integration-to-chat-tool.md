---
id: task-045-add-openai-codex-integration-to-chat-tool
title: Add OpenAI Codex integration to Chat tool
status: "To Do"
created_date: '2025-10-07 09:53'
updated_date: '2025-10-07 11:04'
parent: null
subtasks: [task-046, task-047, task-048, task-049, task-050, task-051]
dependencies: []
---

## Description
<!-- DESCRIPTION:BEGIN -->
Add support for OpenAI's Codex agentic coding assistant as a model option in the Chat tool. Codex is an AI-powered coding assistant that runs locally and is included with OpenAI subscriptions (Plus, Pro, Team, Enterprise), allowing users to leverage it without additional API costs.

**User Benefit:** Instead of paying per API call, users can use Codex through their existing OpenAI subscription. When they specify `model: "codex"` or `model: "gpt-5-codex"` in the Chat tool, the system will use the Codex SDK instead of traditional API calls.

**How It Works:** Codex operates differently from traditional AI models - it's an agentic tool that can read files, execute commands (with configurable permissions), and maintain context through persistent threads. We'll integrate the `@openai/codex-sdk` TypeScript package to enable programmatic access to Codex within our Chat tool.

**Key Features:**
- Thread-based conversations with context persistence
- Local file access and code understanding
- Configurable sandbox modes for security (read-only, workspace-write, full-access)
- Support for multiple Codex models (gpt-5-codex, o3-codex, o4-mini-codex)
- Reasoning effort control (minimal, low, medium, high)
- Streaming responses for real-time feedback

This integration follows the same provider pattern used for OpenAI, Google, and XAI - keeping the Chat tool interface consistent while adding powerful agentic capabilities for coding tasks.
<!-- DESCRIPTION:END -->

## Specification
<!-- SPECIFICATION:BEGIN -->

### Functional Requirements

**Model Selection:**
- Support `model: "codex"` as the only identifier for Codex provider
- Use `CODEX_DEFAULT_MODEL` env var to configure which actual Codex model to use (gpt-5-codex, o3-codex, etc.)
- Do NOT route models containing "codex" in their name (e.g., "gpt-5-codex" may be served by OpenAI API)
- Update `mapModelToProvider()` to route ONLY explicit "codex" to Codex provider

**Provider Implementation:**
- Create new Codex provider following standard provider interface contract:
  - `async invoke(messages, options)` - returns response or AsyncGenerator
  - `validateConfig(config)` - validate Codex configuration
  - `isAvailable(config)` - check if Codex is configured
  - `getSupportedModels()` - return Codex model configurations
  - `getModelConfig(modelName)` - get specific model config
- Integrate `@openai/codex-sdk` TypeScript package
- Support both streaming (`runStreamed()`) and non-streaming (`run()`) execution
- Convert Converse message arrays to Codex single-prompt format
- Return responses in standard Converse provider format

**Thread Management:**
- Use `continuation_id` parameter to resume existing Codex threads
- Store Codex `threadId` in response metadata for future resumption
- Initialize new threads with appropriate working directory and configuration
- Support thread persistence through Codex SDK's built-in session storage

**Parameter Mapping:**
- Map `reasoning_effort` → Codex `reasoningEffort` (minimal/low/medium/high)
- Map `files` parameter → provide as context (Codex accesses files directly from working directory)
- Map `prompt` → extract last user message and convert message history
- Ignore `temperature` and `use_websearch` (not supported by Codex)
- Support `async: true` for background execution via existing jobRunner

**Configuration:**
- Add environment variables:
  - `CODEX_SANDBOX_MODE` (read-only | workspace-write | danger-full-access)
  - `CODEX_WORKING_DIRECTORY` (optional, defaults to CLIENT_CWD)
  - `CODEX_SKIP_GIT_CHECK` (boolean, default false)
  - `CODEX_DEFAULT_MODEL` (optional, defaults to gpt-5-codex)
- Add configuration validation in config schema
- Default sandbox mode to `read-only` for security
- Support configuring working directory per request

**Streaming Support:**
- Implement async generator for streaming responses
- Map Codex SDK events to normalized stream events:
  - `item.completed` → `delta` events
  - `turn.completed` → `end` event with usage
  - SDK errors → `error` events
- Integrate with `ProviderStreamNormalizer` via `normalizeCodexStream()`
- Support cancellation via AbortSignal

**Error Handling:**
- Handle Codex SDK initialization errors (installation, permissions)
- Handle thread creation/resumption errors
- Handle execution errors (sandbox violations, timeouts)
- Provide clear error messages for common issues (Codex not installed, subscription inactive)
- Gracefully degrade when Codex is unavailable

### Acceptance Criteria

1. **Model Selection Works:**
   - User can specify `model: "codex"` and Chat tool routes to Codex provider ✅
   - `CODEX_DEFAULT_MODEL` env var controls which Codex model is used ✅
   - Models containing "codex" in name (e.g., "gpt-5-codex") do NOT route to Codex provider ✅

2. **Basic Execution:**
   - Synchronous chat request with Codex returns valid response ✅
   - Response format matches standard provider format (content, metadata, usage) ✅
   - Simple coding tasks execute successfully (e.g., "explain this function") ✅

3. **Thread Continuation:**
   - First request returns `continuation_id` in metadata ✅
   - Second request with same `continuation_id` resumes thread ✅
   - Context is maintained across multiple requests ✅

4. **Streaming:**
   - Chat tool with `async: true` returns job_id immediately ✅
   - `check_status` shows progressive updates as Codex streams ✅
   - Final response includes complete content and usage stats ✅
   - Stream events properly normalized to standard format ✅

5. **Configuration:**
   - `CODEX_SANDBOX_MODE=read-only` restricts file modifications ✅
   - `CODEX_SANDBOX_MODE=workspace-write` allows workspace modifications ✅
   - Custom working directory can be specified ✅
   - Configuration validation prevents invalid sandbox modes ✅

6. **Parameter Handling:**
   - `reasoning_effort` maps correctly to Codex SDK ✅
   - `files` parameter provides context appropriately ✅
   - Unsupported parameters (temperature, use_websearch) are ignored without error ✅

7. **Error Handling:**
   - Clear error when Codex SDK not installed ✅
   - Clear error when OpenAI subscription doesn't include Codex ✅
   - Thread resumption with invalid `continuation_id` returns helpful error ✅
   - Sandbox violations return descriptive error messages ✅

8. **Integration:**
   - Works with existing async job system ✅
   - Works with AI summarization for status updates ✅
   - Properly registered in provider registry ✅
   - Model routing in `mapModelToProvider()` detects Codex models ✅

9. **Process Lifecycle:**
   - Cancelling async job terminates child process within 2 seconds ✅
   - No zombie processes left after cancellation or server shutdown ✅
   - AbortSignal properly wired through SDK ✅

10. **Routing Logic:**
   - Only exact "codex" routes to Codex provider ✅
   - "gpt-5-codex", "o3-codex" etc. follow normal routing (likely OpenAI) ✅
   - No automatic routing based on name containing "codex" ✅

11. **Headless Authentication:**
   - Provider works with only OPENAI_API_KEY (no UI login required) ✅
   - Meaningful error when neither login nor key present ✅

12. **Non-Git Directory Handling:**
   - Clear error message when not a Git repo ✅
   - Successful execution when CODEX_SKIP_GIT_CHECK=true ✅
   - Error provides remediation guidance ✅

13. **Concurrency:**
   - Configurable max concurrent Codex runs ✅
   - Excess requests are queued (not rejected) ✅
   - No resource starvation under load ✅

14. **Optional Dependency:**
   - Provider unavailable when SDK not installed ✅
   - Helpful installation guidance provided ✅
   - No crash when SDK missing ✅

15. **Unknown Events:**
   - Unknown Codex events don't crash ✅
   - Unknown events logged at debug level ✅
   - Event type preserved in metadata ✅

### Performance Requirements

- Thread initialization: < 2 seconds (may need relaxing due to process spawn)
- Simple query response: < 5 seconds
- Complex coding task: < 60 seconds (configurable timeout)
- Streaming latency: First delta within 2 seconds (includes process spawn)
- Thread resumption: < 1 second
- Cancellation: Process terminated within 2 seconds

### Security Requirements

- Default sandbox mode must be `read-only` for safety
- Default approval policy must be `never` or auto-deny (prevent hangs)
- Default shell environment policy must be `core` or allowlist (not `all`)
- `danger-full-access` mode requires explicit configuration with warnings
- Working directory must be validated within CLIENT_CWD bounds
- Environment variables must not leak sensitive information
- Codex thread storage (CODEX_HOME) must be isolated per instance
- Multimodal inputs (images) must be rejected or ignored gracefully
- File paths must be validated within working directory bounds

<!-- SPECIFICATION:END -->

## Design
<!-- DESIGN:BEGIN -->

### Architecture Approach

**Provider Pattern Integration:**
Codex will be implemented as a standard provider following the functional provider interface defined in `src/providers/interface.js`. This maintains architectural consistency with existing providers (OpenAI, Google, XAI, etc.) while encapsulating Codex-specific behavior.

**Key Differences from Traditional Providers:**
1. **SDK vs REST API**: Uses `@openai/codex-sdk` TypeScript package instead of HTTP requests
2. **Thread-Based State**: Maintains conversation state through Codex threads (stored in `~/.codex/sessions`)
3. **Message Conversion**: Converts message arrays to single prompts (Codex uses prompts, not message history)
4. **Local Execution**: Codex runs locally and can access files directly from working directory
5. **Sandbox Configuration**: Requires sandbox mode configuration (read-only, workspace-write, danger-full-access)

### Implementation Strategy

**Phase 1: Core Provider**
- Create `src/providers/codex.js` implementing the provider interface
- Implement `invoke()` method for non-streaming execution
- Implement message-to-prompt conversion
- Add basic error handling

**Phase 2: Streaming Support**
- Implement async generator for streaming responses
- Map Codex SDK events (`item.completed`, `turn.completed`) to normalized stream format
- Add stream normalizer in `src/async/providerStreamNormalizer.js`

**Phase 3: Configuration & Integration**
- Add environment variables and config schema
- Register provider in `src/providers/index.js`
- Update `mapModelToProvider()` in `src/tools/chat.js`
- Add thread management for continuation support

**Phase 4: Testing**
- Unit tests for provider methods
- Integration tests with mock Codex SDK
- End-to-end tests with real Codex (if available)

### Key Files to Create/Modify

**New Files:**
- `src/providers/codex.js` - Codex provider implementation (~500 lines)
- `tests/providers/codex.test.js` - Comprehensive provider tests
- `tests/integration/codex-integration.test.js` - Integration tests

**Modified Files:**
- `src/providers/index.js` - Register Codex in provider registry (1 line)
- `src/tools/chat.js` - Update `mapModelToProvider()` to detect Codex models (~10 lines)
- `src/async/providerStreamNormalizer.js` - Add `normalizeCodexStream()` method (~80 lines)
- `src/config.js` - Add Codex environment variables (~20 lines)
- `docs/PROVIDERS.md` - Document Codex provider
- `docs/API.md` - Update model examples to include Codex
- `docs/EXAMPLES.md` - Add Codex usage examples
- `package.json` - Add `@openai/codex-sdk` dependency

### Architecture Diagram

```
User Request (model: "codex")
        ↓
Chat Tool (src/tools/chat.js)
        ↓
mapModelToProvider("codex") → "codex"
        ↓
Provider Registry (src/providers/index.js)
        ↓
Codex Provider (src/providers/codex.js)
        ↓
@openai/codex-sdk
        ↓
[Codex Thread Execution]
        ↓
Streaming Events → ProviderStreamNormalizer
        ↓
Unified Response Format
        ↓
User receives response
```

### Message Conversion Pattern

Codex expects single prompts, not message arrays. Conversion strategy:

**Input (Converse Format):**
```javascript
[
  { role: 'system', content: 'You are a coding assistant' },
  { role: 'user', content: 'Explain this function' },
  { role: 'assistant', content: 'This function...' },
  { role: 'user', content: 'Now add error handling' }
]
```

**Output (Codex Format):**
```javascript
// For new threads: Extract last user message
prompt = 'Now add error handling'

// For resumed threads: Thread maintains history automatically
// Just pass the new user prompt
```

### Thread Management

**New Thread:**
```javascript
const codex = new Codex();
const thread = codex.startThread({
  workingDirectory: config.server.client_cwd,
  skipGitRepoCheck: config.providers.codexSkipGitCheck
});
const result = await thread.run(prompt);
// Store thread.threadId in metadata for resumption
```

**Resume Thread:**
```javascript
const codex = new Codex();
const thread = codex.resumeThread(continuation_id); // continuation_id = threadId
const result = await thread.run(prompt);
```

### Streaming Event Mapping

**Codex SDK Events → Normalized Events:**

```javascript
// Codex: { type: 'item.completed', item: { content: '...' } }
// Normalized: { type: 'delta', content: '...', provider: 'codex' }

// Codex: { type: 'turn.completed', turn: { usage: {...} } }
// Normalized: { type: 'end', metadata: { usage: {...}, provider: 'codex' } }
```

### Configuration Schema

**Environment Variables:**
```bash
CODEX_SANDBOX_MODE=read-only           # Security sandbox mode
CODEX_DEFAULT_MODEL=gpt-5-codex        # Default Codex model
CODEX_WORKING_DIRECTORY=/path/to/dir   # Custom working directory (optional)
CODEX_SKIP_GIT_CHECK=false             # Skip Git repository validation
```

**Config.js Schema:**
```javascript
providers: {
  codexSandboxMode: {
    type: 'string',
    envVar: 'CODEX_SANDBOX_MODE',
    default: 'read-only',
    validate: (val) => ['read-only', 'workspace-write', 'danger-full-access'].includes(val)
  },
  codexDefaultModel: {
    type: 'string',
    envVar: 'CODEX_DEFAULT_MODEL',
    default: 'gpt-5-codex'
  },
  codexWorkingDirectory: {
    type: 'string',
    envVar: 'CODEX_WORKING_DIRECTORY',
    default: null
  },
  codexSkipGitCheck: {
    type: 'boolean',
    envVar: 'CODEX_SKIP_GIT_CHECK',
    default: false
  }
}
```

### Error Handling Strategy

**Common Errors to Handle:**

1. **SDK Not Installed:**
   - Error Code: `CODEX_NOT_INSTALLED`
   - Message: "OpenAI Codex SDK not found. Install with: npm install @openai/codex-sdk"

2. **Subscription Inactive:**
   - Error Code: `CODEX_SUBSCRIPTION_REQUIRED`
   - Message: "Codex requires an active OpenAI subscription (Plus, Pro, Team, or Enterprise)"

3. **Invalid Thread ID:**
   - Error Code: `INVALID_THREAD_ID`
   - Message: "Cannot resume thread: invalid or expired thread ID"

4. **Sandbox Violation:**
   - Error Code: `SANDBOX_VIOLATION`
   - Message: "Operation blocked by sandbox mode: [operation details]"

5. **Timeout:**
   - Error Code: `TIMEOUT_ERROR`
   - Message: "Codex execution timeout after [duration]ms"

### Testing Strategy

**Unit Tests (tests/providers/codex.test.js):**
- Provider interface compliance
- Message-to-prompt conversion
- Thread creation and resumption
- Error handling for various failure modes
- Configuration validation

**Integration Tests (tests/integration/codex-integration.test.js):**
- Full request/response cycle with mocked SDK
- Streaming event normalization
- Async job execution
- Continuation support

**E2E Tests (if Codex SDK available):**
- Real Codex execution
- Thread persistence
- Sandbox mode enforcement

### Dependencies

**NPM Package:**
```json
{
  "dependencies": {
    "@openai/codex-sdk": "^latest"
  }
}
```

**Existing Infrastructure:**
- Provider interface (`src/providers/interface.js`)
- Stream normalizer (`src/async/providerStreamNormalizer.js`)
- Job runner (`src/async/jobRunner.js`)
- Continuation store (`src/continuationStore.js`)
- Config system (`src/config.js`)

### Security Considerations

**Default to Read-Only:**
- Prevents accidental file modifications
- Users must explicitly configure `workspace-write` or `danger-full-access`

**Working Directory Validation:**
- Validate working directory exists and is accessible
- Prevent path traversal attacks
- Respect Git repository boundaries

**Environment Variable Hygiene:**
- Don't expose Codex thread storage paths
- Validate all configuration inputs
- Sanitize error messages to avoid leaking paths

### Performance Optimizations

**Thread Reuse:**
- Cache Codex instance across requests when possible
- Reuse threads for continuation requests
- Clean up abandoned threads periodically

**Streaming:**
- Use async generators to minimize memory usage
- Support early cancellation via AbortSignal
- Buffer minimal data before yielding events

**Timeouts:**
- Default: 60 seconds for simple queries
- Configurable via model config
- Progressive timeout warnings via streaming

### Relevant Documentation

**Codex SDK:**
- backlog/docs/guides/doc-codex-sdk.md - TypeScript SDK API reference
- backlog/docs/guides/doc-codex-config.md - Configuration options
- backlog/docs/guides/doc-codex-readme.md - Installation and setup

**Converse Architecture:**
- docs/ARCHITECTURE.md - Provider interface and patterns
- docs/PROVIDERS.md - Provider implementation guide
- docs/API.md - Tool interface and response formats

### Context Manifest

#### How Provider System Currently Works: Architecture and Integration Patterns

The Converse MCP Server follows a functional architecture pattern where ALL providers implement a unified interface defined in `src/providers/interface.js`. This interface contract is the foundation that enables seamless provider switching and consistent behavior across all AI providers.

**Provider Interface Contract (5 Required Methods):**

Every provider MUST export an object (NOT a class) with these pure functions:

1. **`async invoke(messages, options)`** - Main execution method that accepts message arrays and returns either:
   - A `ProviderResponse` object for synchronous execution: `{ content, stop_reason, rawResponse, metadata }`
   - An AsyncGenerator for streaming execution (yields events: start, delta, usage, end, error)

2. **`validateConfig(config)`** - Returns boolean indicating if API key and configuration are valid. Used for config validation at startup.

3. **`isAvailable(config)`** - Returns boolean indicating if provider can be used with current configuration. Usually delegates to validateConfig().

4. **`getSupportedModels()`** - Returns object mapping model names to ModelConfig objects. Each ModelConfig includes: modelName, friendlyName, contextWindow, maxOutputTokens, supportsStreaming, supportsImages, supportsTemperature, timeout, description, aliases.

5. **`getModelConfig(modelName)`** - Returns ModelConfig for specific model name or alias, or null if not found. Handles case-insensitive matching and alias resolution.

**Message Format and Conversion:**

Messages flow through the system in a standardized format (Anthropic/Claude-style):
```javascript
{
  role: 'system' | 'user' | 'assistant',
  content: string | Array<ContentItem>
}
```

For multimodal content (text + images):
```javascript
content: [
  { type: 'text', text: '...' },
  { type: 'image', source: { media_type: 'image/jpeg', data: 'base64...' } }
]
```

Each provider converts this standard format to its own API format in the `convertMessages()` or equivalent function. For example:
- OpenAI: Converts to both Chat Completions API format (for older models) and Responses API format (for GPT-5, o3, etc.)
- Google: Converts to Gemini format with `role: 'user'|'model'` and `parts: [{ text }]` structure
- Anthropic: Uses messages directly as they match Anthropic's format

**Error Handling Architecture:**

Providers define custom error classes extending the base Error:
```javascript
class ProviderNameError extends Error {
  constructor(message, code, originalError = null) {
    super(message);
    this.name = 'ProviderNameError';
    this.code = code;
    this.originalError = originalError;
  }
}
```

Common error codes (from `src/providers/interface.js`):
- Configuration: `MISSING_API_KEY`, `INVALID_API_KEY`
- Request: `INVALID_MESSAGES`, `INVALID_ROLE`, `MISSING_CONTENT`
- Model: `MODEL_NOT_FOUND`, `CONTEXT_LENGTH_EXCEEDED`
- Response: `NO_RESPONSE_CONTENT`, `NO_RESPONSE_CHOICE`
- Rate/Quota: `RATE_LIMIT_EXCEEDED`, `QUOTA_EXCEEDED`
- Other: `API_ERROR`, `TIMEOUT_ERROR`, `NETWORK_ERROR`

**Provider Registration and Discovery:**

Providers are registered in `src/providers/index.js` via a simple object map:
```javascript
const providers = {
  openai: openaiProvider,
  xai: xaiProvider,
  google: googleProvider,
  anthropic: anthropicProvider,
  mistral: mistralProvider,
  deepseek: deepseekProvider,
  openrouter: openrouterProvider
};
```

The registry provides:
- `getProvider(name)` - Get provider by name
- `getProviders()` - Get all providers
- `getAvailableProviders(config)` - Filter to providers with valid API keys
- `registerProvider(name, provider)` - Add new provider (validates interface)

**Model Routing in Chat Tool:**

The Chat tool (`src/tools/chat.js`) uses `mapModelToProvider()` to route model names to providers. This function uses keyword matching:

```javascript
// Routing logic examples:
if (modelLower.includes('gpt') || modelLower.includes('o3') || modelLower.includes('o4'))
  return 'openai';
if (modelLower.includes('grok'))
  return 'xai';
if (modelLower.includes('gemini') || modelLower.includes('flash') || modelLower.includes('pro'))
  return 'google';
if (modelLower.includes('claude') || modelLower.includes('opus') || modelLower.includes('sonnet'))
  return 'anthropic';
```

For models with `/` (like `org/model`), it checks each provider's `getModelConfig()` first, then defaults to OpenRouter if no native provider supports it.

**Codex Integration Requirements:**

Codex differs significantly from traditional API-based providers:

1. **SDK vs REST API**: Uses `@openai/codex-sdk` TypeScript package, not HTTP requests
2. **Thread-Based Conversations**: State managed by Codex SDK in `~/.codex/sessions`, not our continuationStore
3. **Single Prompt Format**: Codex expects single prompts, not message arrays. Need to convert message history to single prompt for new threads.
4. **Local File Access**: Codex runs locally and accesses files directly from working directory (no need to pass file contents)
5. **Sandbox Modes**: Requires configuration for security: read-only, workspace-write, or danger-full-access

#### How Streaming Architecture Currently Works: ProviderStreamNormalizer

When async execution is enabled (`async: true` parameter), the Chat tool uses a sophisticated streaming architecture that normalizes provider-specific streaming formats into a unified event stream.

**Stream Event Types (Unified Format):**

The `ProviderStreamNormalizer` (`src/async/providerStreamNormalizer.js`) defines 6 event types:

1. **`start`** - Stream initialization
   - Fields: `provider`, `model`, `timestamp`, `data.requestId`

2. **`delta`** - Text content chunk
   - Fields: `provider`, `model`, `timestamp`, `data.textDelta`, `data.role`
   - Optional metadata: `isThinking` (Anthropic), `isReasoning` (DeepSeek)

3. **`usage`** - Token usage statistics
   - Fields: `provider`, `model`, `timestamp`, `data.usage` (inputTokens, outputTokens, totalTokens)
   - Provider-specific fields preserved: `thinking_tokens`, `reasoning_tokens`, `cache_*`

4. **`reasoning_summary`** - Reasoning summary for thinking models
   - Fields: `provider`, `model`, `timestamp`, `data.content`
   - Used by OpenAI o3/o4/GPT-5 models

5. **`end`** - Stream completion
   - Fields: `provider`, `model`, `timestamp`, `data.content`, `data.stopReason`, `data.usage`, `data.responseTimeMs`, `data.metadata`

6. **`error`** - Error event
   - Fields: `provider`, `model`, `timestamp`, `data.error` (message, code, recoverable)

**Provider-Specific Normalizers:**

Each provider has a dedicated normalizer method in the ProviderStreamNormalizer class:
- `normalizeOpenAIStream()` - Handles both Chat Completions and Responses API formats
- `normalizeXAIStream()` - Similar to OpenAI, includes search metadata
- `normalizeGoogleStream()` - Handles Gemini format, grounding metadata
- `normalizeAnthropicStream()` - Includes thinking tokens and cache usage
- `normalizeMistralStream()` - Standard format
- `normalizeDeepSeekStream()` - Includes reasoning tokens for R1 model
- `normalizeOpenRouterStream()` - Includes routing metadata

**Streaming Flow in Chat Tool:**

When `async: true` is passed to Chat tool:

1. **Job Submission**: Chat tool submits background job via `jobRunner.submit()`
   - Passes `continuation_id` as job ID for resume support
   - Generates title using `SummarizationService` for initial response

2. **Stream Creation**: Provider's `invoke()` called with `stream: true` and `signal: context.signal`
   - Provider returns AsyncGenerator yielding provider-specific events

3. **Stream Normalization**: Raw stream passed to `providerStreamNormalizer.normalize()`
   - Returns normalized AsyncGenerator with unified event format

4. **Event Processing**: Chat tool consumes normalized stream:
   ```javascript
   for await (const event of normalizedStream) {
     switch (event.type) {
       case 'start':
         await context.updateJob({ status: 'running', provider, model, title });
         break;
       case 'delta':
         accumulatedContent += event.data.textDelta;
         await context.updateJob({ accumulated_content: accumulatedContent });
         break;
       case 'reasoning_summary':
         await context.updateJob({ reasoning_summary: event.data.content });
         break;
       case 'usage':
         finalUsage = event.data.usage;
         break;
       case 'end':
         // Build final response
         break;
       case 'error':
         throw new Error(event.data.error.message);
     }
   }
   ```

5. **Job Updates**: Each event updates job store via `context.updateJob()`:
   - Progress tracking: `accumulated_content`, `reasoning_summary`
   - Status updates: `status`, `provider`, `model`, `title`
   - Final summary generation via `SummarizationService`

**AbortSignal Support:**

Streaming supports cancellation via AbortSignal:
- Signal passed from jobRunner context: `signal: context?.signal`
- Checked during stream processing: `if (signal?.aborted) throw Error`
- Enables job cancellation via `cancel_job` tool

**Codex Streaming Integration:**

Codex SDK provides `runStreamed()` method that returns async generator with events:
- `item.completed` - Item (response chunk) completed
- `turn.completed` - Full turn completed with usage stats

These need to be mapped to normalized events:
```javascript
async *normalizeCodexStream(stream, context) {
  for await (const event of stream) {
    if (event.type === 'item.completed') {
      yield this.createDeltaEvent(event.item.content, 'codex', context.model);
    } else if (event.type === 'turn.completed') {
      yield this.createEndEvent({
        content: event.turn.finalResponse,
        usage: event.turn.usage,
        // ... metadata
      }, 'codex', context.model);
    }
  }
}
```

#### How Configuration System Currently Works: Environment-Based Config

Configuration is loaded from environment variables ONLY - no config files except `.env` for local development. The system is defined in `src/config.js` with a comprehensive schema that validates all settings at startup.

**Configuration Schema Structure:**

The `CONFIG_SCHEMA` object defines 6 top-level categories:

1. **server** - Server and environment settings
   - `PORT`, `HOST`, `NODE_ENV`, `LOG_LEVEL`
   - `CLIENT_CWD` - Auto-detected from `INIT_CWD`, `PWD`, or `process.cwd()`

2. **transport** - MCP transport configuration (stdio or HTTP)
   - `MCP_TRANSPORT` - 'stdio' or 'http'
   - HTTP settings: port, host, timeouts, session management
   - CORS: origins, methods, headers, credentials
   - Security: DNS rebinding protection, rate limiting

3. **apiKeys** - Provider API keys (at least one required)
   - `OPENAI_API_KEY`, `XAI_API_KEY`, `GOOGLE_API_KEY`, `GEMINI_API_KEY`
   - `ANTHROPIC_API_KEY`, `MISTRAL_API_KEY`, `DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY`

4. **providers** - Provider-specific configuration
   - OpenRouter: `OPENROUTER_REFERER`, `OPENROUTER_TITLE`, `OPENROUTER_DYNAMIC_MODELS`
   - Google Vertex AI: `GOOGLE_GENAI_USE_VERTEXAI`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`

5. **mcp** - MCP output limits
   - `MAX_MCP_OUTPUT_TOKENS` - Default 25000

6. **summarization** - AI summarization config
   - `ENABLE_RESPONSE_SUMMARIZATION` - Default false
   - `SUMMARIZATION_MODEL` - Default 'gpt-5-nano'

**Schema Definition Format:**

Each config key specifies:
```javascript
KEY_NAME: {
  type: 'string' | 'number' | 'boolean',
  default: value,              // Used if env var not set
  required: false,             // If true, must be set
  secret: true,                // If true, masked in logs
  description: 'Description'
}
```

**Configuration Loading Process:**

1. **Environment Loading**: `dotenv.config()` loads `.env` or `.env.test`
2. **Schema Validation**: Each env var validated against schema via `validateEnvVar()`
   - Type conversion: string → number/boolean as needed
   - Required check: throws if required and missing
   - Default application: uses default if not set
3. **API Key Validation**: Each API key format validated via `validateApiKeyFormat()`
   - OpenAI: starts with `sk-`, length >= 20
   - XAI: starts with `xai-`, length >= 20
   - Google: length >= 20 or special `VERTEX_AI` marker
   - Anthropic: starts with `sk-ant-`, length >= 30
4. **Config Object Assembly**: Structured config object created with nested properties
5. **Runtime Validation**: Additional checks via `validateRuntimeConfig()`
   - Port ranges, timeout minimums, etc.

**Configuration Access Patterns:**

The config object structure:
```javascript
{
  server: { port, host, node_env, log_level, client_cwd },
  transport: { mcptransport, port, host, ... },
  apiKeys: { openai, xai, google, anthropic, mistral, deepseek, openrouter },
  providers: { openrouterreferer, googlegenaiusevertexai, ... },
  mcp: { max_mcp_output_tokens, name, version },
  summarization: { enabled, model },
  environment: { isDevelopment, isProduction, nodeEnv }
}
```

Helper functions:
- `getProviderConfig(config, providerName)` - Get provider-specific config
- `isProviderAvailable(config, providerName)` - Check if provider has valid API key
- `getAvailableProviders(config)` - List all available providers

**Codex Configuration Needs:**

For Codex integration, we need to add to the `providers` section of CONFIG_SCHEMA:

```javascript
providers: {
  // Existing keys...
  CODEX_SANDBOX_MODE: {
    type: 'string',
    default: 'read-only',
    description: 'Codex sandbox mode (read-only | workspace-write | danger-full-access)'
  },
  CODEX_DEFAULT_MODEL: {
    type: 'string',
    default: 'gpt-5-codex',
    description: 'Default Codex model'
  },
  CODEX_WORKING_DIRECTORY: {
    type: 'string',
    default: null,
    description: 'Custom working directory for Codex (defaults to CLIENT_CWD)'
  },
  CODEX_SKIP_GIT_CHECK: {
    type: 'boolean',
    default: false,
    description: 'Skip Git repository check for working directory'
  }
}
```

Access in provider via: `config.providers.codexsandboxmode`, `config.providers.codexdefaultmodel`, etc. (keys are lowercased and underscores removed during loading).

#### How Thread/Continuation Management Currently Works: State Persistence

The Converse server manages conversation state for multi-turn conversations using the continuation store system (`src/continuationStore.js`). This is a pluggable architecture with an in-memory backend that can be swapped for different storage implementations.

**Continuation Store Interface:**

The base interface (`ContinuationStoreInterface`) defines:
1. **`async set(continuationId, state)`** - Store conversation state
2. **`async get(continuationId)`** - Retrieve conversation state or null
3. **`async delete(continuationId)`** - Delete conversation state
4. **`async exists(continuationId)`** - Check if continuation exists
5. **`async getStats()`** - Get storage statistics
6. **`async cleanup(maxAgeMs)`** - Clean up old conversations

**Continuation ID Format:**

Generated by `generateContinuationId()` using nanoid:
- Format: `conv_XXXXXXXXXX` (10 character nanoid)
- Example: `conv_V1StGXR8_Z`
- Validation: `isValidContinuationId()` checks format

**Conversation State Structure:**

State stored in continuation store:
```javascript
{
  messages: [
    { role: 'system', content: 'System prompt' },
    { role: 'user', content: 'User message' },
    { role: 'assistant', content: 'Assistant response' }
  ],
  provider: 'openai',
  model: 'gpt-5',
  lastUpdated: 1234567890,
  // Metadata added by store:
  createdAt: 1234567890,
  lastAccessed: 1234567890
}
```

**Chat Tool Continuation Flow:**

1. **New Conversation**: If no `continuation_id` provided:
   - Generate new ID: `continuationId = generateContinuationId()`
   - Create fresh message history: `conversationHistory = []`

2. **Resume Conversation**: If `continuation_id` provided:
   - Load state: `existingState = await continuationStore.get(continuation_id)`
   - Restore history: `conversationHistory = existingState.messages || []`
   - If invalid ID: Generate new ID and start fresh

3. **Build Request**: Combine system prompt, history, and new message:
   ```javascript
   messages = [
     { role: 'system', content: CHAT_PROMPT },
     ...conversationHistory,
     { role: 'user', content: prompt }
   ];
   ```

4. **Save Response**: After provider response:
   ```javascript
   const assistantMessage = { role: 'assistant', content: response.content };
   const updatedMessages = [...messages, assistantMessage];

   await continuationStore.set(continuationId, {
     messages: updatedMessages,
     provider: providerName,
     model,
     lastUpdated: Date.now()
   });
   ```

5. **Return Continuation ID**: Include in response for next turn:
   ```javascript
   return {
     content: response.content,
     continuation: {
       id: continuationId,
       provider: providerName,
       model,
       messageCount: updatedMessages.filter(msg => msg.role !== 'system').length
     }
   };
   ```

**Memory Management:**

The in-memory store (`MemoryContinuationStore`) includes:
- Max conversations: 1000 (prevents memory leaks)
- Max messages per conversation: 100 (truncates old messages)
- Automatic cleanup: Runs every hour, removes conversations older than 24 hours
- LRU eviction: Removes oldest when max reached

**Codex Thread Management Integration:**

Codex has its own thread persistence in `~/.codex/sessions`, but we need to bridge it with our continuation system:

1. **New Thread**: When no `continuation_id`:
   ```javascript
   const thread = codex.startThread({
     workingDirectory: config.server.client_cwd,
     skipGitRepoCheck: config.providers.codexSkipGitCheck
   });
   const turn = await thread.run(prompt);

   // Store Codex threadId as metadata
   await continuationStore.set(continuationId, {
     codexThreadId: thread.threadId,
     provider: 'codex',
     model: 'gpt-5-codex',
     lastUpdated: Date.now()
   });
   ```

2. **Resume Thread**: When `continuation_id` provided:
   ```javascript
   const state = await continuationStore.get(continuation_id);
   if (state?.codexThreadId) {
     const thread = codex.resumeThread(state.codexThreadId);
     const turn = await thread.run(prompt);
     // Update state with new timestamp
   }
   ```

3. **Message Conversion**: Codex uses single prompts, not message arrays:
   - For new threads: Pass prompt directly
   - For resumed threads: Codex maintains history internally, just pass new prompt
   - No need to convert message arrays since Codex handles history

#### Testing Patterns and Infrastructure: Provider Tests

The test suite uses Vitest and follows a clear structure with unit tests, integration tests, and end-to-end tests. Provider tests are organized to validate interface compliance, configuration, and actual API behavior.

**Test File Organization:**

Provider tests live in:
- **Unit Tests**: `tests/unit/providers/<provider>.test.js` - Interface compliance, no API calls
- **Integration Tests**: `tests/integration/providers/<provider>/<provider>-api.test.js` - Real API calls
- **Feature Tests**: `tests/integration/providers/<provider>/<provider>-features.test.js` - Specific features

**Unit Test Structure (tests/unit/providers/google.test.js):**

```javascript
import { describe, it, expect } from 'vitest';
import { googleProvider } from '../../../src/providers/google.js';

describe('Google Provider', () => {
  describe('validateConfig', () => {
    it('should return true for valid Google API key', () => {
      const config = { apiKeys: { google: 'AIzaSyDJK...' } };
      expect(googleProvider.validateConfig(config)).toBe(true);
    });

    it('should return false for missing API key', () => {
      const config = { apiKeys: {} };
      expect(googleProvider.validateConfig(config)).toBe(false);
    });
  });

  describe('isAvailable', () => {
    // Similar tests for availability checking
  });

  describe('getSupportedModels', () => {
    it('should return supported models object', () => {
      const models = googleProvider.getSupportedModels();
      expect('gemini-2.5-flash' in models).toBeTruthy();
    });

    it('should include model configuration details', () => {
      const models = googleProvider.getSupportedModels();
      expect(models['gemini-2.5-flash'].supportsImages).toBe(true);
    });
  });

  describe('getModelConfig', () => {
    it('should return config for exact model name', () => {
      const config = googleProvider.getModelConfig('gemini-2.5-flash');
      expect(config.modelName).toBe('gemini-2.5-flash');
    });

    it('should return config for model alias', () => {
      const config = googleProvider.getModelConfig('flash');
      expect(config.modelName).toBe('gemini-2.5-flash');
    });
  });

  describe('invoke - input validation', () => {
    it('should throw error for missing API key', async () => {
      await expect(
        googleProvider.invoke([{ role: 'user', content: 'Hello' }], { config: {} })
      ).rejects.toThrow(expect.objectContaining({
        name: 'GoogleProviderError',
        code: 'MISSING_API_KEY'
      }));
    });
  });
});
```

**Test Patterns and Assertions:**

1. **Interface Compliance Tests**:
   - Verify all required methods exist and have correct signatures
   - Test return types and error handling
   - Validate configuration validation logic

2. **Model Configuration Tests**:
   - Verify model registry structure
   - Test alias resolution (case-insensitive)
   - Check model capabilities flags

3. **Error Handling Tests**:
   - Use `expect.objectContaining()` to match error properties
   - Test custom error classes with `name` and `code` fields
   - Verify error messages are descriptive

4. **Input Validation Tests**:
   - Test with invalid inputs (null, wrong types, missing fields)
   - Verify appropriate errors thrown
   - Check error codes match expected values

**Mock Patterns:**

Tests use Vitest mocking for external dependencies:
```javascript
import { vi } from 'vitest';

// Mock SDK
vi.mock('@openai/codex-sdk', () => ({
  Codex: vi.fn().mockImplementation(() => ({
    startThread: vi.fn().mockReturnValue({
      run: vi.fn().mockResolvedValue({ finalResponse: 'Test response' })
    })
  }))
}));
```

**Integration Test Patterns:**

Integration tests (when API keys available) test real provider behavior:
```javascript
describe.skipIf(!process.env.GOOGLE_API_KEY)('Google API Integration', () => {
  it('should make successful API call', async () => {
    const config = { apiKeys: { google: process.env.GOOGLE_API_KEY } };
    const result = await googleProvider.invoke(
      [{ role: 'user', content: 'Say hello' }],
      { config, model: 'gemini-2.5-flash' }
    );

    expect(result).toHaveProperty('content');
    expect(result.content).toBeTruthy();
    expect(result.metadata.provider).toBe('google');
  });
});
```

**Codex Provider Test Requirements:**

For the Codex provider, tests should cover:

1. **Unit Tests** (`tests/unit/providers/codex.test.js`):
   - Interface compliance (all 5 methods)
   - validateConfig with sandbox mode validation
   - getSupportedModels returns Codex models (gpt-5-codex, o3-codex, etc.)
   - getModelConfig handles aliases correctly
   - Message-to-prompt conversion logic
   - Error handling for invalid configs

2. **Integration Tests** (`tests/integration/providers/codex/codex-api.test.js`):
   - Thread creation and execution (if Codex SDK available)
   - Thread resumption with threadId
   - Streaming event generation
   - Sandbox mode enforcement
   - Working directory configuration

3. **Mock Tests** (when SDK not available):
   - Mock Codex SDK responses
   - Verify stream event mapping
   - Test error scenarios

#### Technical Reference: Key Implementation Details

**File Locations:**

- Provider implementation: `src/providers/codex.js` (~500 lines)
- Provider registration: `src/providers/index.js` (add 1 line: `codex: codexProvider`)
- Model routing: `src/tools/chat.js` `mapModelToProvider()` function (~line 386)
- Stream normalizer: `src/async/providerStreamNormalizer.js` (add `normalizeCodexStream()` method)
- Config schema: `src/config.js` `CONFIG_SCHEMA.providers` section (~line 91)
- Tests: `tests/unit/providers/codex.test.js`, `tests/integration/providers/codex/codex-api.test.js`

**Provider Function Signatures:**

```javascript
export const codexProvider = {
  async invoke(messages, options = {}) {
    const { model = 'gpt-5-codex', config, stream = false, signal, ...otherOptions } = options;

    if (!config?.apiKeys?.openai) {
      throw new CodexProviderError('OpenAI API key required for Codex', 'MISSING_API_KEY');
    }

    if (stream) {
      return this._createStreamingGenerator(messages, options);
    }

    // Non-streaming implementation
    const codex = new Codex();
    const thread = codex.startThread({ workingDirectory, skipGitRepoCheck });
    const turn = await thread.run(convertMessagesToPrompt(messages));

    return {
      content: turn.finalResponse,
      stop_reason: 'stop',
      rawResponse: turn,
      metadata: { /* usage, model, provider, threadId */ }
    };
  },

  validateConfig(config) {
    return !!(config?.apiKeys?.openai && config.apiKeys.openai.startsWith('sk-'));
  },

  isAvailable(config) {
    return this.validateConfig(config);
  },

  getSupportedModels() {
    return {
      'gpt-5-codex': {
        modelName: 'gpt-5-codex',
        friendlyName: 'OpenAI Codex (GPT-5)',
        contextWindow: 400000,
        maxOutputTokens: 128000,
        supportsStreaming: true,
        supportsImages: false,
        supportsTemperature: false,
        timeout: 3600000,
        description: 'Agentic coding assistant with local file access',
        aliases: ['codex', 'gpt5-codex']
      },
      'o3-codex': { /* similar structure */ }
    };
  },

  getModelConfig(modelName) {
    const resolved = resolveModelName(modelName);
    return SUPPORTED_MODELS[resolved] || null;
  },

  async *_createStreamingGenerator(messages, options) {
    // Streaming implementation
    const codex = new Codex();
    const thread = codex.startThread({ /* config */ });
    const { events } = await thread.runStreamed(convertMessagesToPrompt(messages));

    yield { type: 'start', /* metadata */ };

    for await (const event of events) {
      if (event.type === 'item.completed') {
        yield { type: 'delta', content: event.item.content };
      } else if (event.type === 'turn.completed') {
        yield { type: 'end', content: finalContent, metadata: { usage: event.usage } };
      }
    }
  }
};
```

**Message to Prompt Conversion:**

```javascript
function convertMessagesToPrompt(messages) {
  // For new threads: Extract last user message (system prompt handled by Codex)
  // For resumed threads: Just return new user message
  const lastUserMessage = messages.filter(m => m.role === 'user').pop();
  return lastUserMessage?.content || '';
}
```

**Model Routing Update:**

In `src/tools/chat.js` `mapModelToProvider()` function, add after line ~419:

```javascript
// Codex models
if (modelLower.includes('codex')) {
  return 'codex';
}
```

**Stream Normalizer Integration:**

In `src/async/providerStreamNormalizer.js`, add to constructor registry (~line 43):

```javascript
this.normalizers = {
  openai: this.normalizeOpenAIStream.bind(this),
  // ... other normalizers
  codex: this.normalizeCodexStream.bind(this)
};
```

Then implement:

```javascript
async *normalizeCodexStream(stream, context) {
  const provider = 'codex';
  const model = context.model || 'gpt-5-codex';
  const startTime = Date.now();

  let accumulatedContent = '';
  let finalUsage = null;

  try {
    for await (const event of stream) {
      if (event.type === 'start') {
        yield this.createStartEvent(provider, model, event);
      } else if (event.type === 'delta') {
        accumulatedContent += event.content;
        yield this.createDeltaEvent(event.content, provider, model);
      } else if (event.type === 'usage') {
        finalUsage = event.usage;
        yield this.createUsageEvent(event.usage, provider, model);
      } else if (event.type === 'end') {
        yield this.createEndEvent({
          content: event.content || accumulatedContent,
          stopReason: 'stop',
          usage: event.metadata?.usage || finalUsage,
          responseTime: Date.now() - startTime,
          metadata: event.metadata
        }, provider, model);
      } else if (event.type === 'error') {
        yield this.createErrorEvent(event.error, provider);
      }
    }
  } catch (error) {
    yield this.createErrorEvent(error, provider);
    throw error;
  }
}
```

**Configuration Schema Addition:**

In `src/config.js`, add to `CONFIG_SCHEMA.providers` (~line 91):

```javascript
providers: {
  // Existing keys...
  CODEX_SANDBOX_MODE: {
    type: 'string',
    default: 'read-only',
    description: 'Codex sandbox mode (read-only | workspace-write | danger-full-access)'
  },
  CODEX_DEFAULT_MODEL: {
    type: 'string',
    default: 'gpt-5-codex',
    description: 'Default Codex model when user specifies "codex"'
  },
  CODEX_WORKING_DIRECTORY: {
    type: 'string',
    default: null,
    description: 'Custom working directory for Codex (defaults to CLIENT_CWD)'
  },
  CODEX_SKIP_GIT_CHECK: {
    type: 'boolean',
    default: false,
    description: 'Skip Git repository validation check'
  }
}
```

Access in provider:
```javascript
const sandboxMode = config.providers.codexsandboxmode || 'read-only';
const workingDir = config.providers.codexworkingdirectory || config.server.client_cwd;
```

**Codex SDK Usage Patterns:**

```javascript
import { Codex } from '@openai/codex-sdk';

// Initialize Codex instance
const codex = new Codex();

// Start new thread
const thread = codex.startThread({
  workingDirectory: '/path/to/project',
  skipGitRepoCheck: false
});

// Execute turn (non-streaming)
const turn = await thread.run('Explain this function');
console.log(turn.finalResponse);
console.log(turn.usage); // { inputTokens, outputTokens }

// Execute turn (streaming)
const { events } = await thread.runStreamed('Implement the fix');
for await (const event of events) {
  if (event.type === 'item.completed') {
    console.log(event.item.content);
  } else if (event.type === 'turn.completed') {
    console.log(event.usage);
  }
}

// Resume existing thread
const savedThreadId = 'thread_abc123';
const resumedThread = codex.resumeThread(savedThreadId);
await resumedThread.run('Continue working');

// Thread ID for storage
const threadId = thread.threadId; // Store this in continuationStore
```

**Environment Variables (.env.example):**

```bash
# Codex Configuration (optional)
CODEX_SANDBOX_MODE=read-only                    # read-only | workspace-write | danger-full-access
CODEX_DEFAULT_MODEL=gpt-5-codex                 # Default Codex model
CODEX_WORKING_DIRECTORY=/path/to/project        # Custom working directory (optional)
CODEX_SKIP_GIT_CHECK=false                      # Skip Git repository check
```

<!-- DESIGN:END -->

## TODO
<!-- TODO:BEGIN -->

This is a **parent task** that coordinates the integration of OpenAI Codex into the Chat tool through 5 subtasks. Each subtask represents a distinct phase of research, development, and validation.

### Subtask 046: Research and Prototype Codex SDK

**Goal:** Understand how the Codex SDK actually works through hands-on experimentation.

**What needs to be researched:**
- How does Codex spawn processes? Does it block the Node.js event loop?
- What events do we actually receive from `runStreamed()`? Format? Timing? Frequency? Coverage beyond item.completed/turn.completed?
- How does thread persistence work? Where are sessions stored? Can we control CODEX_HOME location?
- What are the actual differences between sandbox modes in practice?
- Does Codex require the CLI to be installed separately or does the SDK bundle it?
- How does authentication work? ChatGPT login vs API key vs both? Precedence?
- What happens when Codex isn't installed or authenticated?
- **NEW:** Does SDK bundle the binary or require separate install?
- **NEW:** What approval events exist? Can they deadlock headless runs?
- **NEW:** What's the complete event taxonomy (not just item/turn)?
- **NEW:** How does process spawning affect first-byte latency?
- **NEW:** Can we control shell_environment_policy programmatically?

**What needs to be confirmed:**
- Codex can run within our MCP server process without blocking
- Streaming events can be consumed by async generators
- Thread IDs are stable and can be used for resumption
- Working directory can be set programmatically
- Errors are catchable and provide useful information
- **NEW:** Binary spawning happens per-thread or per-instance
- **NEW:** File descriptors are properly cleaned up on cancel
- **NEW:** Git repo check can be bypassed programmatically
- **NEW:** API key auth works without interactive login

**What needs to be tested:**
- Install SDK: `npm install @openai/codex-sdk`
- Create `experiments/codex-test.js` with basic SDK calls
- Test non-streaming execution: `thread.run(prompt)`
- Test streaming execution: `thread.runStreamed(prompt)` - log ALL event types
- Test thread resumption: `codex.resumeThread(threadId)`
- Test different sandbox modes and observe actual behavior
- Test approval_policy settings (never, untrusted, on-failure, on-request)
- Test error scenarios (invalid thread, missing auth, not a git repo, etc.)
- Measure response times and streaming latency (include spawn overhead)
- **NEW:** Test in non-Git directory with and without skipGitRepoCheck
- **NEW:** Test headless auth with only OPENAI_API_KEY
- **NEW:** Monitor process tree for zombie children
- **NEW:** Test cancellation mid-stream - does process terminate?

**Exit Criteria (Must Pass Before Proceeding):**
- Confirm non-blocking behavior (doesn't hang event loop)
- Document complete event taxonomy with examples
- Confirm viable headless auth path (API key works)
- Measure realistic first-byte latency with spawn overhead

**What systems need to be created:**
- Experimental test file separate from main codebase
- Research document with findings, quirks, and gotchas

**Deliverable:** Research document with findings and recommended integration approach.

---

### Subtask 047: Test SDK Integration in MCP Server Environment

**Goal:** Verify Codex SDK works within our actual MCP server environment, not just in isolation.

**What needs to be researched:**
- How does Codex interact with our stdio/HTTP transport?
- Does Codex process spawning interfere with MCP message handling?
- Can multiple Codex threads run concurrently without conflicts?
- How does Codex handle the server's working directory vs requested working directory?
- What happens to Codex threads when the server restarts?
- **NEW:** What's the OS support matrix? (macOS arm64/x64, Linux musl/glibc, Windows?)
- **NEW:** How does CPU-bound Codex affect other MCP operations?

**What needs to be confirmed:**
- Codex doesn't block MCP request/response cycle
- Streaming works with our async job system
- Multiple concurrent Codex requests don't conflict
- Server shutdown doesn't leave zombie Codex processes
- Codex can access files in CLIENT_CWD correctly
- **NEW:** Process termination on SIGTERM/SIGINT is clean
- **NEW:** Cancellation during tool calls works without orphans
- **NEW:** Memory and file descriptors don't leak under load

**What needs to be tested:**
- Create temporary test endpoint in Chat tool with hardcoded Codex calls
- Test simple synchronous request through MCP
- Test async request with job tracking
- Test multiple concurrent requests (stress test with N=10+)
- Test server shutdown/restart behavior (SIGTERM, SIGINT)
- Monitor process tree for zombie processes
- Test file access from different working directories
- **NEW:** Test cancellation during streaming (before first delta, mid-stream, during tool call)
- **NEW:** Test on target OS platforms (macOS, Linux at minimum)
- **NEW:** Test provider fails gracefully when SDK not installed
- **NEW:** Run 50+ short turns and check for fd/memory leaks

**Concurrency Stress Tests:**
- 10 concurrent Codex runs with CPU-bound tasks
- Verify no MCP message handling delays
- Verify server remains responsive
- Check CPU/memory usage patterns

**What unit tests should be written:**
- Mock Codex SDK for testing integration points
- Test async job submission with mocked Codex response
- Test concurrent request handling
- Test cleanup on server shutdown
- **NEW:** Test AbortSignal propagation
- **NEW:** Test process cleanup on cancel
- **NEW:** Test optional dependency handling

**What systems need to be updated:**
- May need process cleanup in server shutdown handler
- May need working directory validation logic
- **NEW:** Add concurrency limiter/queue for Codex provider
- **NEW:** Add platform check (block on Windows if unsupported)

**Exit Criteria:**
- Passes concurrency stress test without degrading MCP performance
- Clean shutdown verified (no zombies on SIGTERM)
- Cancellation verified (process dies within 2s)
- Works on macOS and Linux

**Deliverable:** Proof of concept showing Codex working in MCP server with notes on integration issues.

---

### Subtask 048: Implement Configuration System and Parameter Mapping

**Goal:** Build the configuration layer and map Chat tool parameters to Codex SDK options with secure defaults.

**What needs to be researched:**
- Which Chat tool parameters are relevant to Codex?
- How do we map `reasoning_effort` to Codex reasoning levels?
- What should default values be for Codex-specific config?
- How do we handle parameters Codex doesn't support (temperature, use_websearch)?
- **NEW:** What approval_policy prevents hangs in headless runs?
- **NEW:** What shell_environment_policy is safe for servers?
- **NEW:** How to handle CODEX_HOME in containerized/multi-tenant deployments?

**What needs to be confirmed:**
- Configuration validation catches invalid sandbox modes
- Environment variables load correctly
- Default values are secure (read-only sandbox, non-blocking approval policy)
- Parameter mapping preserves user intent
- **NEW:** Headless auth precedence: API key vs login vs neither
- **NEW:** Per-request working_directory overrides work securely
- **NEW:** Unsupported params (temperature, use_websearch) logged but don't error

**What needs to be tested:**
- Add Codex env vars to config schema
- Test config loading with various env var combinations
- Test validation rejects invalid sandbox modes
- Test parameter mapping function with all combinations
- Test defaults when optional params not provided
- **NEW:** Test approval_policy defaults to non-blocking setting
- **NEW:** Test shell_environment_policy defaults to secure setting
- **NEW:** Test working directory validation (must be within CLIENT_CWD)
- **NEW:** Test multimodal input rejection (images not supported)
- **NEW:** Test per-request config overrides with security clamps

**What unit tests should be written:**
- Config validation tests for each Codex env var
- Parameter mapping tests covering all input combinations
- Default value tests
- Invalid input handling tests
- **NEW:** Approval policy validation tests
- **NEW:** Shell environment policy validation tests
- **NEW:** Working directory security tests (prevent path traversal)
- **NEW:** Unsupported parameter handling tests

**Configuration Additions:**
```javascript
CODEX_SANDBOX_MODE: 'read-only' (default)
CODEX_APPROVAL_POLICY: 'never' (default, prevents hangs)
CODEX_SHELL_ENVIRONMENT_POLICY: 'core' (default, secure)
CODEX_DEFAULT_MODEL: 'gpt-5-codex'
CODEX_WORKING_DIRECTORY: null (uses CLIENT_CWD)
CODEX_SKIP_GIT_CHECK: false
CODEX_HOME: null (SDK default, consider isolation)
CODEX_MAX_CONCURRENT: 3 (default, prevent resource starvation)
```

**What systems need to be created:**
- Codex config schema in `src/config.js`
- Parameter mapping utility function with security validation
- Config validation logic with secure defaults
- Working directory validator (must be within CLIENT_CWD)

**What systems need to be updated:**
- Config loading to include Codex settings
- `.env.example` with Codex variables and security guidance
- **NEW:** Add feature flag: `ENABLE_CODEX_PROVIDER` (default: false until proven)

**Deliverable:** Working configuration system that maps Chat tool params to Codex SDK options with secure, non-blocking defaults.

---

### Subtask 049: Implement Streaming and Continuation Support

**Goal:** Integrate Codex streaming with our event system, map continuation_id to Codex thread resumption, and handle extended event taxonomy.

**What needs to be researched:**
- Exact format of Codex streaming events (from Subtask 046 findings)
- How to map Codex events to our normalized format
- How to store Codex thread IDs in continuation store
- How to resume threads across multiple requests
- **NEW:** Complete event taxonomy beyond item.completed/turn.completed
- **NEW:** How to handle approval requests, tool calls, diffs, violations
- **NEW:** Behavior on server restart (what happens to Codex threads?)

**What needs to be confirmed:**
- Codex streaming integrates with ProviderStreamNormalizer
- Thread IDs can be stored in continuation store
- Threads can be resumed using stored IDs
- Context is maintained across resumed threads
- Streaming provides real-time updates
- **NEW:** AbortSignal properly wires through to SDK for cancellation
- **NEW:** Unknown events are logged but don't crash
- **NEW:** Continuation store doesn't duplicate message history (Codex maintains its own)

**What needs to be tested:**
- Create minimal Codex provider with streaming support
- Test streaming event normalization
- Test storing thread ID in continuation store (only threadId + metadata, not messages)
- Test resuming thread with continuation_id
- Test multiple turns in same conversation
- Test async execution with streaming
- **NEW:** Test AbortSignal cancellation during streaming
- **NEW:** Test unknown event handling (ignore + log)
- **NEW:** Test approval events don't hang (should auto-deny with policy=never)
- **NEW:** Test continuation after server restart (Codex threads persist in ~/.codex/sessions)

**What unit tests should be written:**
- Stream normalizer tests for Codex events (all known types)
- Continuation store integration tests
- Thread resumption tests
- Multi-turn conversation tests
- **NEW:** Unknown event handling tests
- **NEW:** AbortSignal cancellation tests
- **NEW:** Continuation store format tests (minimal metadata only)

**Event Mapping Strategy:**
```javascript
// Known events to map:
item.completed → delta
turn.completed → end + usage
approval.requested → warning (log, shouldn't happen with policy=never)
tool.executed → log only (metadata)
diff.generated → log only (metadata)
sandbox.violation → error
unknown → log at debug, preserve in metadata
```

**What systems need to be created:**
- Codex streaming generator implementation with extended event coverage
- Codex stream normalizer in ProviderStreamNormalizer
- Thread ID storage logic (minimal: threadId, model, sandbox, workingDir only)

**What systems need to be updated:**
- ProviderStreamNormalizer with Codex support and safe fallback for unknown events
- Continuation store format for Codex (no message duplication)
- **NEW:** Add event type logger for unknown Codex events

**Deliverable:** Working streaming and continuation system for Codex conversations with robust event handling.

---

### Subtask 050: Create Full Provider Implementation and Update Documentation

**Goal:** Complete the Codex provider following standard patterns, with all learnings from earlier subtasks applied, and document everything.

**What needs to be researched:**
- What edge cases need handling based on earlier testing?
- What error messages are most helpful for users?
- What documentation do users need to successfully use Codex?
- **NEW:** What specific error codes from Subtasks 046-049 need mapping?

**What needs to be confirmed:**
- Provider follows interface contract exactly
- All provider methods implemented correctly
- Model routing detects only exact "codex" (not models containing "codex")
- Error messages are clear and actionable
- Documentation is complete and accurate
- **NEW:** Routing ensures "o3-codex" routes normally (NOT to Codex provider)
- **NEW:** Optional dependency handling works (graceful when SDK missing)
- **NEW:** Dynamic import used for SDK (keeps install size small)

**What needs to be tested:**
- Full provider with all methods implemented
- Model routing in Chat tool with precedence tests
- Error handling for all scenarios (from research findings)
- Integration with existing Chat tool features
- All acceptance criteria from parent task
- **NEW:** Routing tests: "codex" → Codex, "gpt-5-codex" → OpenAI, "o3-codex" → OpenAI
- **NEW:** Multimodal rejection tests (images gracefully rejected)
- **NEW:** Unsupported parameter tests (temperature, use_websearch logged but ignored)
- **NEW:** Optional dependency tests (SDK not installed)

**What unit tests should be written:**
- Provider interface compliance tests
- Message-to-prompt conversion tests
- Error handling tests for each error type (all codes from research)
- Model config and routing tests with precedence validation
- **NEW:** Model routing tests (only exact "codex" routes to Codex)
- **NEW:** Error message clarity tests
- **NEW:** Optional dependency handling tests

**Error Code Mapping (from research):**
```javascript
CODEX_NOT_INSTALLED: "OpenAI Codex SDK not found. Install: npm install @openai/codex-sdk"
CODEX_SUBSCRIPTION_REQUIRED: "Codex requires active OpenAI subscription or API key"
MISSING_API_KEY: "OpenAI API key required for Codex headless auth"
INVALID_THREAD_ID: "Cannot resume thread: invalid or expired thread ID"
SANDBOX_VIOLATION: "Operation blocked by {sandbox_mode} mode: {details}"
TIMEOUT_ERROR: "Codex execution timeout after {duration}ms"
CONFIGURATION_ERROR: "Not a Git repository. Use CODEX_SKIP_GIT_CHECK=true or run 'git init'"
```

**Model Routing Implementation:**
```javascript
// Only exact "codex" routes to Codex provider
// This prevents hijacking API model names like "gpt-5-codex" or "o3-codex"
if (modelLower === 'codex') {
  return 'codex';
}
// Normal routing for everything else
if (modelLower.includes('gpt') || modelLower.includes('o3') || modelLower.includes('o4')) {
  return 'openai';
}
```

**What systems need to be created:**
- Complete `src/providers/codex.js` with dynamic import
- Provider tests in `tests/providers/codex.test.js`
- Integration tests with SDK mocking
- Documentation sections with real examples

**What systems need to be updated:**
- `src/providers/index.js` - register Codex provider (conditional on SDK presence)
- `src/tools/chat.js` - model routing with correct precedence
- `docs/PROVIDERS.md` - Codex section with security guidance
- `docs/API.md` - Codex examples with all models
- `docs/EXAMPLES.md` - usage examples + headless auth guidance
- `README.md` - mention Codex support + OS requirements

**Deliverable:** Complete, tested, documented Codex provider integration with secure defaults and robust error handling.

---

### Subtask 051: Security & Ops Hardening

**Goal:** Harden the Codex integration for production use with security best practices and operational safeguards.

**What needs to be researched:**
- Multi-tenant scenarios: How to isolate CODEX_HOME per instance?
- Containerized deployments: Where should thread storage live?
- Enterprise/ZDR requirements: Can we disable thread persistence?
- Attack vectors: What malicious inputs could bypass sandbox?

**What needs to be confirmed:**
- shell_environment_policy defaults prevent leaking secrets
- Working directory validation prevents path traversal
- Approval policy prevents interactive deadlocks
- CODEX_HOME isolation works in multi-tenant setups
- Resource limits prevent DoS via concurrent requests

**Security Hardening Checklist:**

1. **Environment Sanitization:**
   - shell_environment_policy = 'core' by default (not 'all')
   - Explicitly allowlist safe env vars: PATH, HOME, USER, TMPDIR
   - Block env vars containing: KEY, SECRET, TOKEN, PASSWORD
   - Test: Verify secrets aren't leaked to Codex subprocesses

2. **Approval Policy Safety:**
   - approval_policy = 'never' by default (prevent hangs)
   - Document when 'untrusted' or 'on-failure' are safe
   - Test: Verify no interactive approval prompts in headless mode
   - Log all approval denials at warning level

3. **Working Directory Validation:**
   - Validate requested workingDirectory is within CLIENT_CWD
   - Reject paths with '..' or absolute paths outside CLIENT_CWD
   - Default to CLIENT_CWD when not specified
   - Test: Attempt path traversal attacks (e.g., '../../../etc/passwd')

4. **Sandbox Mode Enforcement:**
   - sandbox_mode = 'read-only' by default
   - 'danger-full-access' requires explicit ENV variable + warning logs
   - Document risks of each mode clearly
   - Test: Verify read-only blocks file writes, workspace-write allows workspace only

5. **CODEX_HOME Isolation:**
   - Support CODEX_HOME override for multi-tenant deployments
   - Document how to isolate per user/tenant
   - Consider: Thread storage opt-out for ZDR compliance
   - Test: Verify threads don't leak across instances

6. **Concurrency Limits:**
   - Max 3 concurrent Codex runs by default (CODEX_MAX_CONCURRENT)
   - Queue excess requests (don't reject)
   - Monitor CPU/memory usage under load
   - Test: 20 concurrent requests don't degrade server

7. **OS Support Matrix:**
   - Explicitly support: macOS (arm64/x64), Linux (musl/glibc)
   - Explicitly block: Windows (sandbox unsupported)
   - Add platform detection on provider init
   - Clear error: "Codex not supported on Windows"
   - Test: Verify works on macOS + Linux, blocks on Windows

8. **Optional Dependency Handling:**
   - Use dynamic import for @openai/codex-sdk
   - Provider.isAvailable() returns false when SDK missing
   - Clear installation guidance in error message
   - Test: Server starts without SDK installed (provider just unavailable)

9. **Multimodal Input Validation:**
   - Reject image inputs with clear error (Codex doesn't support)
   - Reject file paths outside workingDirectory
   - Log unsupported parameters at debug (temperature, use_websearch)
   - Test: Verify rejection messages are helpful

10. **Feature Flag:**
    - ENABLE_CODEX_PROVIDER = false by default
    - Must be explicitly enabled in production
    - Document why (experimental, OS-dependent)
    - Test: Provider not registered when flag = false

**Operational Safeguards:**

1. **Process Cleanup:**
   - Hook SIGTERM/SIGINT for graceful shutdown
   - Terminate all Codex child processes on shutdown
   - Verify no zombies left behind
   - Test: Kill server, check process tree

2. **Resource Monitoring:**
   - Log Codex usage (duration, model, tokens)
   - Track concurrent Codex count
   - Alert when approaching limits
   - Test: Monitor metrics under load

3. **Error Normalization:**
   - Map all Codex errors to standard error codes
   - Include remediation guidance in error messages
   - Log full error details at debug level
   - Test: Verify error messages are actionable

**What unit tests should be written:**
- Working directory validation tests (path traversal attempts)
- Environment sanitization tests (verify secrets blocked)
- Approval policy tests (verify no hangs)
- Sandbox enforcement tests (verify read-only blocks writes)
- Concurrency limit tests (verify queueing works)
- Platform detection tests (verify Windows blocked)
- Optional dependency tests (verify graceful degradation)
- Multimodal rejection tests (verify images rejected)

**What systems need to be created:**
- Working directory validator with security checks
- Environment sanitization logic
- Concurrency limiter/queue
- Platform detection and blocking logic
- Process cleanup handler for SIGTERM/SIGINT

**What systems need to be updated:**
- Config schema with security-focused defaults
- Provider initialization with platform check
- Error messages with remediation guidance
- Documentation with security best practices

**Threat Model Coverage:**
- Path traversal attacks → Blocked by working directory validator
- Secret leakage → Blocked by environment sanitization
- Resource exhaustion → Mitigated by concurrency limits
- Interactive deadlocks → Prevented by approval_policy=never
- Sandbox escapes → Sandboxbox mode defaults to read-only
- Privilege escalation → Per-request overrides clamped by server allowlist

**Deliverable:** Hardened Codex integration ready for production with security best practices, operational safeguards, and comprehensive threat mitigation.

<!-- TODO:END -->

## Notes
<!-- NOTES:BEGIN -->

### Parent Task Structure

**This is a parent task** that contains the complete scope, specification, and high-level design for integrating OpenAI Codex into the Chat tool. It does NOT contain implementation details - those will be developed in 5 subtasks as we learn more about how Codex actually works in practice.

**Subtask Structure:**
- **046**: Research SDK behavior through experimentation
- **047**: Test in real MCP server environment
- **048**: Build configuration and parameter mapping
- **049**: Implement streaming and continuation
- **050**: Complete provider and documentation

Each subtask will be planned individually using `/new-task` after the previous phase is complete, allowing us to make informed decisions based on actual findings.

### High-Level Planning Decisions

**Phased Approach Rationale:** We're breaking this into research-first phases because:
1. We don't know if Codex SDK blocks the event loop
2. We don't know the actual streaming event format
3. We need to confirm thread persistence behavior before designing storage
4. We need to test in the real environment before finalizing the architecture

**Architecture Hypothesis:** Codex will likely be implemented as a standard provider (not special-cased in Chat tool) to maintain architectural consistency. This hypothesis will be validated in Subtask 047.

**Security Priority (CRITICAL):** After GPT-5 review, security defaults are paramount:
- Sandbox mode defaults to `read-only` (prevent file modifications)
- Approval policy defaults to `never` (prevent interactive hangs in headless mode)
- Shell environment policy defaults to `core` (prevent secret leakage)
- Feature flag required: `ENABLE_CODEX_PROVIDER=false` by default
- Working directory validation prevents path traversal attacks
- CODEX_HOME isolation for multi-tenant deployments

**Critical Research Questions (Updated After GPT-5 Review):**
1. Does Codex spawn child processes that could block our server?
2. What's the **complete** event taxonomy (not just item.completed/turn.completed)?
3. How does thread storage work - can we control the session directory?
4. Can multiple Codex instances run concurrently without conflicts?
5. How does Codex handle authentication - API key, OAuth, or something else?
6. **NEW:** What approval events exist that could deadlock headless runs?
7. **NEW:** Can we prevent zombie processes on cancellation/shutdown?
8. **NEW:** What's the OS support matrix (Windows unsupported?)?
9. **NEW:** How does binary spawning affect first-byte latency?
10. **NEW:** Can shell_environment_policy be controlled programmatically?

**Known Challenges (Expanded After Review):**
- Message format mismatch: Codex uses single prompts, we use message arrays
- Thread management: Codex has native threads, we have continuation_id
- Process lifecycle: Need to ensure clean shutdown without zombie processes
- Working directory: Need to coordinate CLIENT_CWD with Codex's working directory
- **NEW:** Model routing: Only exact "codex" routes to Codex (not model names containing "codex")
- **NEW:** Headless authentication: ChatGPT login won't work, need API key path
- **NEW:** Git repository requirement: Fails by default if not a git repo
- **NEW:** Interactive approvals: Can deadlock headless runs if policy wrong
- **NEW:** Event coverage gaps: Unknown events could cause silent failures
- **NEW:** Concurrency control: CPU-intensive runs could starve server resources
- **NEW:** Optional dependency: Must handle SDK not installed gracefully
- **NEW:** Platform support: Windows likely unsupported, need explicit check

### Critical Findings from GPT-5 Review

**Process Lifecycle Risks:**
- SDK spawns CLI binary per thread, exchanges JSONL over stdio
- File descriptors and child processes must be managed explicitly
- Cancellation requires proper AbortSignal wiring
- Server shutdown requires cleanup hooks for SIGTERM/SIGINT

**Authentication in Headless Environments:**
- ChatGPT login (`Sign in with ChatGPT`) requires UI - won't work in MCP server
- Must use API key for headless auth
- Need clear error when neither login nor key present
- Document API key precedence clearly

**Approval Policy Deadlock Risk:**
- Default approval policies may wait for interactive user input
- In headless/MCP context, this causes permanent hangs
- Must set `approval_policy = "never"` or auto-deny
- Document when interactive policies are safe

**Extended Event Taxonomy:**
- Beyond item.completed/turn.completed, expect: approval.requested, tool.executed, diff.generated, sandbox.violation
- Unknown events must be logged but not crash
- Approval events shouldn't happen with policy=never, but need fallback

**Routing Logic (Updated After User Feedback):**
- Only exact `model: "codex"` routes to Codex provider
- Models containing "codex" in name (e.g., "gpt-5-codex", "o3-codex") follow normal routing
- This prevents hijacking API model names that OpenAI may serve
- `CODEX_DEFAULT_MODEL` env var controls which Codex model is actually used
- Test: "codex" → Codex provider, "gpt-5-codex" → OpenAI provider

**Concurrency and Resource Limits:**
- Local agent runs are CPU-heavy
- Multiple concurrent runs will degrade entire server
- Need provider-scoped concurrency limits (default: 3)
- Queue excess requests, don't reject

**Platform Support Matrix:**
- Sandbox likely only works on macOS and Linux
- Windows may require `danger-full-access` (unsupported sandboxing)
- Need explicit OS detection and blocking/warning

**Optional Dependency Pattern:**
- Use dynamic import for SDK to avoid breaking installs
- Server should start without SDK (provider just unavailable)
- Clear error messages with installation guidance

**Relevant Documentation:**
- backlog/docs/guides/doc-codex-sdk.md - Codex SDK API reference (theoretical)
- backlog/docs/guides/doc-codex-config.md - Codex configuration options (theoretical)
- docs/ARCHITECTURE.md - Provider interface contract (our system)
- docs/PROVIDERS.md - Provider implementation guidelines (our system)

**Note:** Documentation marked "theoretical" needs validation through hands-on testing in Subtasks 046-047.

<!-- NOTES:END -->
