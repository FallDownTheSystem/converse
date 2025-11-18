---
id: task-051-add-gemini-cli-integration-to-chat-tool
title: Add Gemini CLI integration to Chat tool
status: "To Do"
created_date: '2025-11-18 19:26'
updated_date: '2025-11-18 22:32'
parent: null
subtasks: []
dependencies: []
---

## Description
<!-- DESCRIPTION:BEGIN -->
The Converse MCP Server currently supports Gemini models through direct API integration. However, Google also provides a powerful Gemini CLI tool that offers additional capabilities like built-in tool execution, file operations, and advanced context management. This task aims to integrate the Gemini CLI as an alternative execution method alongside the existing Gemini API provider.

**The Problem:**
Users who want to leverage the Gemini CLI's unique capabilities (such as its built-in tool system, file operations, and advanced context handling) currently cannot do so through the Converse MCP Server. They must choose between using our server with the Gemini API or using the Gemini CLI directly.

**The Solution:**
We will add a new Gemini CLI provider that executes the Gemini CLI tool in headless mode (non-interactive) through child process spawning. This follows the same architectural pattern we successfully used for Codex integration, where an external CLI tool is wrapped and integrated into our provider ecosystem.

**How It Works:**
When a user specifies a Gemini CLI model (like "gemini-cli" or "gemini-2.5-flash-cli"), the Chat tool will spawn the Gemini CLI as a child process, pass the prompt and context through command-line arguments, and parse the JSON output. The CLI handles the conversation internally using its own tool system and context management, while our server provides the MCP interface and conversation persistence.

**Benefits:**
- Access to Gemini CLI's built-in tool system and file operations
- Alternative execution method for users who prefer CLI-based workflows
- Consistent interface through the Chat tool regardless of underlying execution method
- Optional feature that doesn't affect existing Gemini API users
- Follows proven integration pattern from Codex implementation

This integration will be completely optional and will coexist with the existing Gemini API provider, giving users the flexibility to choose the execution method that best fits their needs.
<!-- DESCRIPTION:END -->

## Specification
<!-- SPECIFICATION:BEGIN -->

### Technical Requirements

**1. Provider Implementation**
- Create `src/providers/gemini-cli.js` following the standard provider interface pattern
- Implement all required provider methods: `invoke()`, `validateConfig()`, `isAvailable()`, `getSupportedModels()`, `getModelConfig()`
- Use child process spawning (`child_process.spawn()`) to execute `gemini` CLI command
- Support both streaming (`--output-format stream-json`) and non-streaming (`--output-format json`) modes
- Create custom error class `GeminiCLIProviderError` extending `ProviderError`

**2. CLI Execution**
- Execute Gemini CLI with `--prompt` flag for headless mode
- Use `--yolo` flag for auto-approval in automation contexts
- Pass `--output-format json` for structured output parsing
- Support `--model` flag for model selection
- Handle stdin piping for file context when needed
- Implement AbortSignal support for request cancellation

**3. Output Parsing**
- Parse JSON output schema with fields: `response`, `stats`, `error`
- Extract token usage from `stats.models[model-name].tokens` object
- Map token fields: `prompt`, `candidates`, `total`, `cached` to standard format
- Extract error information from `error` field when present
- Handle malformed JSON gracefully with error recovery

**4. Streaming Support**
- Parse JSONL (newline-delimited JSON) from `--output-format stream-json`
- Process event types: `init`, `message`, `tool_use`, `tool_result`, `error`, `result`
- Filter events to send only user-facing content (`message` events with role=assistant)
- Implement stream normalization in `ProviderStreamNormalizer`
- Accumulate content from `message` events with `delta: true`
- Extract final stats from `result` event

**5. Parameter Mapping**
- Map `model` parameter to `--model` CLI flag (e.g., "gemini-2.5-flash" → `--model gemini-2.5-flash`)
- Ignore `temperature` parameter gracefully (CLI manages internally) with debug log
- Ignore `use_websearch` parameter gracefully with debug log
- Support `files` parameter by creating temporary file context (future enhancement)
- Support `images` parameter through file paths (future enhancement)
- Map `continuation_id` to session resumption if CLI supports it

**6. Conversation Continuation**
- Gemini CLI does NOT support native session resumption in headless mode
- Store full conversation history in continuation store (all messages, not just latest)
- On continuation: Reconstruct full conversation context and send to CLI
- Format entire conversation history for CLI input (research optimal multi-turn format)
- Unlike Codex (which uses thread IDs), must send complete message history each time

**7. Configuration**
- No API key needed - assumes gcloud login authentication
- Add `config.providers.geminiclipath` for custom CLI binary path (default: "gemini")
- Add `config.providers.geminicliworkdir` for working directory
- Add `config.providers.geminicliauto_approve` for `--yolo` flag control (default: true)
- Add `config.providers.geminiclitimeout` for timeout configuration (default: 120000ms)
- Validate CLI availability using `isAvailable()` check (check if binary exists and `gcloud auth list` shows active account)

**8. Error Handling**
- Map CLI exit codes to error types: 41 (auth), 42 (input), 44 (sandbox), 52 (config), 53 (turn limit)
- Parse `error` field from JSON output when present
- Handle CLI not found error with installation instructions
- Handle JSON parse errors with raw output fallback
- Implement timeout handling (default: 120s, configurable)
- Provide actionable error messages with solutions

**9. Chat Tool Integration**
- Add model routing for "gemini-cli" and model variants (e.g., "gemini-2.5-flash-cli")
- Update `mapModelToProvider()` to route CLI-specific models to gemini-cli provider
- Ensure coexistence with existing google provider (API-based)
- Pass all standard options to provider invoke method
- Store provider name in continuation metadata

**10. Testing**
- Create unit tests in `tests/unit/providers/gemini-cli.test.js`
- Create integration tests in `tests/integration/providers/gemini-cli/gemini-cli-api.test.js`
- Use `testWithApiKeys()` helper for conditional test execution
- Test basic chat functionality with JSON output
- Test streaming functionality with JSONL output
- Test continuation support (if CLI supports sessions)
- Test error handling for various failure modes
- Test parameter mapping and unsupported parameter handling
- Use generous timeouts (90s+) for CLI operations

**11. Documentation**
- Update `docs/API.md` with Gemini CLI usage examples
- Document required environment variables in `.env.example`
- Add configuration options to API documentation
- Document model naming convention (e.g., "gemini-cli", "gemini-2.5-flash-cli")
- Document limitations compared to API provider
- Add troubleshooting section for common CLI errors

### Acceptance Criteria

**Functional Requirements:**
- ✅ Users can send prompts to Gemini CLI through Chat tool using "gemini-cli" model
- ✅ JSON output is correctly parsed and returned with response text and token usage
- ✅ Streaming mode works and yields content deltas in real-time
- ✅ Error handling works for all common failure scenarios (auth, not found, parse errors)
- ✅ Configuration options work as documented
- ✅ Provider coexists with existing Gemini API provider without conflicts

**Quality Requirements:**
- ✅ All tests pass with >80% code coverage for new provider
- ✅ No regressions in existing Chat tool functionality
- ✅ pnpm run validate passes (linting, formatting, type checking)
- ✅ Documentation is complete and accurate
- ✅ Code follows existing provider patterns (Codex reference)

**Performance Requirements:**
- ✅ First response latency <5s for simple prompts (excluding CLI spawn overhead)
- ✅ Streaming provides first token within 2s of CLI output start
- ✅ No memory leaks from unclosed child processes
- ✅ Proper cleanup of temporary files and processes

**Security Requirements:**
- ✅ API keys not logged or exposed in error messages
- ✅ Input validation prevents command injection
- ✅ Auto-approve mode documented with security warnings
- ✅ Working directory properly sandboxed (configurable)

<!-- SPECIFICATION:END -->

## Design
<!-- DESIGN:BEGIN -->

### Architecture Approach

Following the established Codex CLI integration pattern (task-045), the Gemini CLI provider will:

1. **Provider Structure:** Implement a functional provider object (`geminiCliProvider`) conforming to the standard provider interface (`src/providers/interface.js`)

2. **CLI Execution Pattern:**
   - Use `child_process.spawn()` to execute `gemini` command in headless mode
   - Pass prompts via `--prompt` flag and configuration via CLI arguments
   - Parse structured JSON output from stdout
   - Handle JSONL streaming format for real-time progress

3. **Session Management:**
   - Research Gemini CLI session/conversation resumption capabilities
   - If supported: Store session ID in continuation store (similar to Codex thread ID)
   - If not supported: Extract only latest user message (stateless execution)

4. **Stream Normalization:**
   - Create async generator function that yields raw CLI events
   - Add `normalizeGeminiCLIStream()` method to `ProviderStreamNormalizer`
   - Map JSONL events to standard format: `start`, `delta`, `end`, `error`
   - Filter internal events (tool_use, tool_result), expose only user-facing content

5. **Model Routing:**
   - Add CLI-specific model names with "-cli" suffix (e.g., "gemini-2.5-flash-cli")
   - Update `mapModelToProvider()` in chat tool to route to gemini-cli provider
   - Coexist with existing google provider (API-based) without conflicts

### Key Files to Create/Modify

**New Files:**
- `src/providers/gemini-cli.js` - Main provider implementation (~400-500 lines based on codex.js)
- `tests/unit/providers/gemini-cli.test.js` - Unit tests for provider
- `tests/integration/providers/gemini-cli/gemini-cli-api.test.js` - Integration tests with HTTP server

**Modified Files:**
- `src/tools/chat.js` - Add gemini-cli model routing in `mapModelToProvider()` (lines 390-420)
- `src/async/providerStreamNormalizer.js` - Add `normalizeGeminiCLIStream()` method (~100 lines)
- `src/config.js` - Add Gemini CLI configuration loading (lines 150-200)
- `docs/API.md` - Add Gemini CLI usage section
- `docs/PROVIDERS.md` - Add Gemini CLI provider entry
- `.env.example` - Add configuration examples

### Provider Interface Implementation

**Methods to Implement:**

```javascript
export const geminiCliProvider = {
  // Main execution method
  async invoke(messages, options) {
    // 1. Extract latest user message
    // 2. Build CLI command with flags
    // 3. Spawn child process
    // 4. Parse JSON/JSONL output
    // 5. Return standardized response
  },

  // Configuration validation
  validateConfig(config) {
    // Check for API key if needed
    // Validate CLI path
    // Check working directory
  },

  // Availability check
  isAvailable(config) {
    // Check if CLI binary exists in PATH
    // Return boolean
  },

  // Model listing
  getSupportedModels() {
    // Return Gemini CLI models with metadata
  },

  // Model configuration
  getModelConfig(modelName) {
    // Return model-specific settings
  }
};
```

### CLI Command Construction Pattern

```javascript
// Example command for non-streaming:
const args = [
  '--prompt', extractedPrompt,
  '--output-format', 'json',
  '--model', modelName.replace('-cli', ''), // Strip -cli suffix
  '--yolo' // Auto-approve for headless
];

// Example for streaming:
const args = [
  '--prompt', extractedPrompt,
  '--output-format', 'stream-json',
  '--model', modelName.replace('-cli', ''),
  '--yolo'
];

const geminiProcess = spawn('gemini', args, {
  cwd: workingDirectory,
  env: { ...process.env, GEMINI_API_KEY: apiKey }
});
```

### Output Parsing Strategy

**Non-Streaming (JSON):**
1. Accumulate stdout chunks
2. Parse complete JSON on process exit
3. Extract `response`, `stats`, `error` fields
4. Map token usage from `stats.models[model].tokens`
5. Return standardized response object

**Streaming (JSONL):**
1. Use readline interface on stdout
2. Parse each line as separate JSON event
3. Filter event types: only `message` (role=assistant) are user-facing
4. Accumulate content from events with `delta: true`
5. Extract final stats from `result` event
6. Yield standardized delta events

### Error Mapping

| CLI Exit Code | Error Type | Standard Error Code | Action |
|--------------|------------|---------------------|---------|
| 0 | Success | N/A | Parse output normally |
| 41 | Auth Error | INVALID_API_KEY | Check GEMINI_CLI_API_KEY |
| 42 | Input Error | INVALID_REQUEST | Validate prompt format |
| 44 | Sandbox Error | CONFIGURATION_ERROR | Check sandbox settings |
| 52 | Config Error | CONFIGURATION_ERROR | Check settings.json |
| 53 | Turn Limit | RATE_LIMIT_ERROR | Reduce complexity |
| Other | Unknown | API_ERROR | Log raw stderr |

### Configuration Schema

```javascript
// Environment Variables
GEMINI_CLI_API_KEY=your_api_key_here
GEMINI_CLI_PATH=gemini                    # Default: "gemini"
GEMINI_CLI_WORKDIR=/path/to/workdir       # Default: CLIENT_CWD
GEMINI_CLI_AUTO_APPROVE=true              # Default: true
GEMINI_CLI_TIMEOUT=120000                 # Default: 120s

// Config Object (src/config.js)
config.providers = {
  geminiclikey: process.env.GEMINI_CLI_API_KEY,
  geminiclipath: process.env.GEMINI_CLI_PATH || 'gemini',
  geminicliworkdir: process.env.GEMINI_CLI_WORKDIR,
  geminicliauto_approve: process.env.GEMINI_CLI_AUTO_APPROVE !== 'false',
  geminiclitimeout: parseInt(process.env.GEMINI_CLI_TIMEOUT || '120000', 10)
};
```

### Critical Implementation Details

**1. Process Spawning:**
- Use `spawn()` not `exec()` for better stream handling
- Set `stdio: ['pipe', 'pipe', 'pipe']` for stdin/stdout/stderr access
- Implement AbortSignal handling for cancellation
- Clean up child processes on error or completion

**2. Message Conversion:**
```javascript
function convertMessagesToPrompt(messages) {
  // Similar to Codex pattern:
  // 1. Extract last user message
  // 2. Handle string vs array content
  // 3. Filter out images if not supported
  // 4. Return plain text prompt
}
```

**3. Stream Generator Pattern:**
```javascript
async function* createStreamingGenerator(geminiProcess, signal) {
  const rl = readline.createInterface({ input: geminiProcess.stdout });

  try {
    for await (const line of rl) {
      if (signal?.aborted) throw new Error('Cancelled');

      try {
        const event = JSON.parse(line);
        yield event; // Pass to normalizer
      } catch (err) {
        // Ignore malformed lines, log at debug level
      }
    }
  } finally {
    rl.close();
  }
}
```

**4. Session Resumption (if supported):**
```javascript
// Store session ID
const conversationState = {
  messages: updatedMessages,
  provider: 'gemini-cli',
  model,
  lastUpdated: Date.now(),
  geminiCliSessionId: extractedSessionId // From init event
};

// Resume session
const sessionId = continuation_id && continuationStore
  ? await getSessionIdFromContinuation(continuation_id, continuationStore)
  : null;

if (sessionId) {
  args.push('--session', sessionId); // If CLI supports it
}
```

### Testing Strategy

**Unit Tests:**
- Mock child process spawning
- Test message-to-prompt conversion
- Test JSON parsing with valid/invalid input
- Test error mapping from exit codes
- Test configuration validation

**Integration Tests:**
- Use `testWithApiKeys()` wrapper for conditional execution
- Test basic chat with JSON output (90s timeout)
- Test streaming with JSONL output (90s timeout)
- Test conversation continuation (180s timeout for 2 calls)
- Test error scenarios (auth failure, CLI not found, etc.)
- Test parameter mapping and ignored parameters

### Dependencies

**Required:**
- Gemini CLI tool installed and in PATH (`gemini` command available)
- Gemini API key (GEMINI_CLI_API_KEY environment variable)
- Node.js built-in modules: `child_process`, `readline`

**Optional:**
- Custom CLI binary path (if not in PATH)
- Custom working directory (defaults to CLIENT_CWD)

### Patterns to Follow from Codex Integration

1. **Optional Dependency:** CLI availability check in `isAvailable()`, don't fail server startup
2. **Defensive Parsing:** Handle malformed JSON gracefully, log and continue
3. **Generous Timeouts:** Default 120s, configurable via environment variable
4. **Debug Logging:** Use `debugLog()` for CLI commands, `debugError()` for failures
5. **Path Normalization:** Use `normalizeExtendedPath()` for Windows compatibility
6. **Graceful Degradation:** Ignore unsupported parameters with debug logs
7. **Cancellation Support:** Implement AbortSignal handling, kill child process on abort
8. **Error Context:** Preserve original errors, provide actionable messages

### Context Manifest

**How the Converse MCP Server Provider System Currently Works:**

The Converse MCP Server implements a functional provider architecture where each AI provider (OpenAI, Google, XAI, Anthropic, Mistral, DeepSeek, OpenRouter, and Codex) is implemented as a pure functional module conforming to a unified provider interface. When a user makes a chat request, the Chat tool (`src/tools/chat.js`) receives the request with a model parameter, uses `mapModelToProvider()` to determine which provider should handle the request (lines 390-469), selects the appropriate provider from the providers registry, and calls `provider.invoke(messages, options)` to execute the request. The provider returns a standardized response format `{ content, stop_reason, rawResponse, metadata }` that the Chat tool processes and returns to the user.

**Provider Interface Contract (src/providers/interface.js):**

Every provider MUST implement five core methods. The `invoke(messages, options)` method is the main execution entry point that accepts an array of messages in Converse format (role + content) and an options object containing model, temperature, stream, signal, config, continuation_id, continuationStore, reasoning_effort, verbosity, and use_websearch. It returns either a Promise resolving to the standard response object (for non-streaming) or an AsyncGenerator yielding raw provider events (for streaming). The `validateConfig(config)` method checks if the provider has valid configuration and API keys, returning true if the provider can be used. The `isAvailable(config)` method determines provider availability based on configuration, typically delegating to validateConfig(). The `getSupportedModels()` method returns an object mapping model names to ModelConfig objects containing modelName, friendlyName, contextWindow, maxOutputTokens, supportsStreaming, supportsImages, supportsTemperature, supportsWebSearch, timeout, description, and optional aliases array. Finally, `getModelConfig(modelName)` returns the ModelConfig for a specific model name or alias, returning null if not found.

**The Codex CLI Provider Implementation Pattern (Reference for Gemini CLI):**

The Codex provider (`src/providers/codex.js`) demonstrates the exact pattern needed for CLI-based providers. It uses dynamic imports to lazy-load the optional `@openai/codex-sdk` dependency (lines 65-84), preventing server startup failures if the SDK isn't installed. The provider converts the message array to a single prompt using `convertMessagesToPrompt()` (lines 94-131), which extracts the last user message since Codex maintains conversation history internally via thread IDs. For conversation continuation, it retrieves the thread ID from the continuation store using `getThreadIdFromContinuation()` (lines 137-145) and resumes existing threads or creates new ones (lines 260-261). The provider spawns the Codex process using the SDK (not child_process.spawn), but the architectural pattern is identical to what Gemini CLI needs.

For streaming, Codex uses `createStreamingGenerator()` (lines 151-183) that yields raw SDK events, which are then normalized by `ProviderStreamNormalizer.normalizeCodexStream()` (lines 708-832). The normalizer filters events, yielding only user-facing content from `item.completed` events with type `agent_message`, ignoring internal reasoning events. Token usage is extracted from `turn.completed` events and normalized to the standard format `{ input_tokens, output_tokens, total_tokens, cached_input_tokens }`. The provider handles unsupported parameters gracefully by logging debug warnings and continuing execution (lines 214-219).

Configuration values are read from `config.providers` using lowercase names with underscores removed (e.g., `config.providers.codexapikey`, `config.providers.codexsandboxmode`). The working directory defaults to `config.server.client_cwd` (line 245), which auto-detects from INIT_CWD/PWD environment variables. Critical implementation details include using `normalizeExtendedPath()` to handle Windows extended-length paths (line 247), checking for cancellation via `signal?.aborted` throughout execution, and always using streaming internally even for non-streaming requests due to SDK limitations (lines 271-295).

**Chat Tool Integration and Model Routing:**

The Chat tool (`src/tools/chat.js`) receives requests through the MCP protocol, validates parameters, processes context (files, images), builds the message array, selects the provider using `mapModelToProvider()`, and calls `provider.invoke()`. The `mapModelToProvider()` function uses keyword matching to route models to providers. For example, models containing "gpt", "o1", "o3", or "o4" route to OpenAI (lines 428-431); "grok" routes to XAI (lines 434-436); "gemini", "flash", or "pro" route to Google (lines 439-442). The Codex provider uses exact matching - only "codex" routes to it, preventing "gpt-5-codex" from incorrectly routing (lines 399-401). For the Gemini CLI provider, models should use a "-cli" suffix (e.g., "gemini-2.5-flash-cli") to distinguish from the API-based google provider.

When async mode is enabled (`async: true`), the Chat tool submits a background job to the JobRunner and returns immediately with a continuation_id. The job executes using `executeChatWithStreaming()` (lines 478-823), which calls `provider.invoke()` with `stream: true` and `signal: context.signal`. The provider returns an AsyncGenerator that is normalized by `ProviderStreamNormalizer.normalize()`, which converts provider-specific events to standard `{ type, provider, model, timestamp, data }` format. The normalized stream is consumed, accumulating content from `delta` events and extracting usage from `end` events.

**Stream Normalization Architecture:**

The `ProviderStreamNormalizer` (`src/async/providerStreamNormalizer.js`) is a singleton that routes streams to provider-specific normalizers registered in the `normalizers` object (lines 36-45). Each normalizer is an async generator function that consumes the raw provider stream and yields standardized events. The standard event types are: `start` (initialization with requestId), `delta` (text content chunk with textDelta), `usage` (token statistics with input_tokens/output_tokens/total_tokens), `reasoning_summary` (OpenAI reasoning models only), `end` (completion with final content, stopReason, usage, metadata), and `error` (error information with message, code, recoverable flag).

The Codex normalizer (`normalizeCodexStream`, lines 708-832) demonstrates the CLI provider pattern. It processes events in a switch statement, mapping `thread.started` to start events (capturing thread_id), `item.completed` with type `agent_message` to delta events, and `turn.completed` to end events. Internal events like `item.completed` with type `reasoning` are logged at debug level but not yielded. Unknown event types are logged but don't crash the normalizer. The normalizer tracks whether an end event has been sent using a `hasEnded` flag and exits early after `turn.completed`, `turn.failed`, or `error` events to prevent processing stale events.

**Configuration System and Environment Variables:**

Configuration is loaded from environment variables only (no config files) using the CONFIG_SCHEMA defined in `src/config.js` (lines 39-127). Each provider reads configuration from `config.providers.*` using lowercase keys with underscores removed. For example, `CODEX_API_KEY` becomes `config.providers.codexapikey` (line 104), `CODEX_SANDBOX_MODE` becomes `config.providers.codexsandboxmode` (line 105), and `CODEX_SKIP_GIT_CHECK` becomes `config.providers.codexskipgitcheck` (line 106).

The Gemini CLI provider will need: `GEMINI_CLI_API_KEY` (stored as `config.providers.geminiclikey`), `GEMINI_CLI_PATH` (stored as `config.providers.geminiclipath`, default: "gemini"), `GEMINI_CLI_WORKDIR` (stored as `config.providers.geminicliworkdir`, default: CLIENT_CWD), `GEMINI_CLI_AUTO_APPROVE` (stored as `config.providers.geminicliauto_approve`, default: true), and `GEMINI_CLI_TIMEOUT` (stored as `config.providers.geminiclitimeout`, default: 120000). Boolean values must be explicitly checked for `!== false` to preserve false values (line 301), since `CODEX_SKIP_GIT_CHECK=false` would otherwise be dropped.

Configuration validation happens at load time (lines 233-254) and runtime (lines 565-647). API key format validation occurs in `validateApiKeyFormat()` (lines 178-205), checking for provider-specific prefixes and minimum lengths. For Google/Gemini, the special value "VERTEX_AI" is allowed for Vertex AI mode (line 192). The Gemini CLI should accept any API key with length >= 20 characters.

**Error Handling and Provider Errors:**

All providers use custom error classes extending `ProviderError` from `src/providers/interface.js` (lines 138-150). The CodexProviderError demonstrates the pattern (lines 40-45): a constructor that accepts message, code, and originalError, and sets the error name. Standard error codes from `ErrorCodes` (lines 155-183) include: MISSING_API_KEY, INVALID_API_KEY, INVALID_MESSAGES, MODEL_NOT_FOUND, CONTEXT_LENGTH_EXCEEDED, NO_RESPONSE_CONTENT, RATE_LIMIT_EXCEEDED, QUOTA_EXCEEDED, API_ERROR, TIMEOUT_ERROR, and NETWORK_ERROR.

The Gemini CLI provider should map CLI exit codes to error types: 41 → INVALID_API_KEY (auth error), 42 → INVALID_REQUEST (input error), 44 → CONFIGURATION_ERROR (sandbox error), 52 → CONFIGURATION_ERROR (config error), 53 → RATE_LIMIT_ERROR (turn limit). When the CLI binary is not found, the error message should include installation instructions: "Gemini CLI not installed. Install from: [installation URL]". All errors should preserve the original error using the originalError parameter for debugging.

**Testing Infrastructure and Patterns:**

Tests use `testWithApiKeys()` from `tests/utils/conditionalTest.js` to conditionally execute based on API key availability. The wrapper checks for required providers and skips tests with descriptive messages if keys are missing. Example usage from `tests/integration/providers/codex/codex-api.test.js` (lines 42-62):

```javascript
testWithApiKeys({
  requiredProviders: ['CODEX'],
  requireAll: true
})('should work with basic Codex chat', async () => {
  await withHTTPTestServer(async (client) => {
    const result = await client.callTool({
      name: 'chat',
      arguments: {
        prompt: 'What is 2+2? Answer with just the number.',
        model: 'codex'
      }
    });

    expect(result.isError).toBeFalsy();
    expect(result.content).toBeDefined();
    expect(result.content[0].text).toContain('4');
  });
}, 90000); // 90s timeout
```

The `withHTTPTestServer()` utility function (lines 475-485) manages server lifecycle, starting the HTTP transport server with test configuration, passing the MCP client to the test function, and ensuring proper cleanup even if tests fail. Tests use generous timeouts (90s for single calls, 180s for continuation tests) to account for slow CLI startup and execution. The client receives parsed responses with `result.isError`, `result.content[0].text`, and `result.continuation.id` fields.

For testing CLI availability, the pattern from Codex tests checks `hasCodex` from apiKeyDetection and skips gracefully (lines 29-34). Test files should be organized as: `tests/unit/providers/gemini-cli.test.js` for unit tests with mocked child processes, and `tests/integration/providers/gemini-cli/gemini-cli-api.test.js` for integration tests with real CLI execution.

**Utility Functions and Path Handling:**

The `debugLog()` and `debugError()` functions from `src/utils/console.js` (lines 24-38) respect LOG_LEVEL and transport mode, suppressing output during tests and stdio transport to prevent JSON-RPC corruption. Use these instead of console.log/error. The `normalizeExtendedPath()` function from `src/utils/pathUtils.js` (lines 207-223) removes Windows extended-length path prefixes (\\?\\) and handles UNC paths (\\?\\UNC\\server\\share), critical for Codex working directory handling.

The continuation store (`src/continuationStore.js`) provides `getContinuationStore()` to access the singleton store (lines 272-294), `generateContinuationId()` to create short IDs with format "conv_XXXXXXXXXX" using nanoid (lines 324-327), and `isValidContinuationId()` to validate ID format (lines 334-347). Conversation state is stored using `await continuationStore.set(continuationId, state)` where state contains `{ messages, provider, model, lastUpdated, [providerSpecificFields] }`. For Codex, the thread ID is stored as `codexThreadId` in the state (line 309). The Gemini CLI provider should store any session ID similarly as `geminiCliSessionId`.

**Critical Implementation Dependencies and File Locations:**

**Provider Implementation:**
- Create: `src/providers/gemini-cli.js` (~400-500 lines based on codex.js structure)
- Reference: `src/providers/codex.js` (CLI provider pattern, lines 1-400)
- Reference: `src/providers/google.js` (existing Gemini API provider for comparison)
- Interface: `src/providers/interface.js` (contract definition, must export geminiCliProvider object)

**Stream Normalization:**
- Modify: `src/async/providerStreamNormalizer.js`
- Add to registry: Line 44, add `geminicli: this.normalizeGeminiCLIStream.bind(this)`
- Add method: ~100 lines starting around line 833, `normalizeGeminiCLIStream(stream, context)`
- Pattern: Follow `normalizeCodexStream` (lines 708-832) for event filtering and mapping

**Chat Tool Integration:**
- Modify: `src/tools/chat.js`
- Update: `mapModelToProvider()` function (lines 390-469)
- Add routing: Around line 440, add check for "-cli" suffix to route to gemini-cli provider
- Pattern: `if (modelLower.includes('gemini') && modelLower.includes('cli')) return 'geminicli';`

**Configuration:**
- Modify: `src/config.js`
- Add schema: Lines 90-109 (providers section), add GEMINI_CLI_* variables
- Add validation: Lines 296-328 (provider config loading)
- Pattern: Follow CODEX_* configuration structure exactly

**Testing:**
- Create: `tests/unit/providers/gemini-cli.test.js` (unit tests with mocked child_process)
- Create: `tests/integration/providers/gemini-cli/gemini-cli-api.test.js` (integration tests)
- Reference: `tests/integration/providers/codex/codex-api.test.js` (test structure and patterns)
- Use: `tests/utils/conditionalTest.js` (testWithApiKeys wrapper)
- Use: `tests/utils/HTTPMCPServerManager.js` (withHTTPTestServer helper)

**Documentation:**
- Update: `docs/API.md` - Add Gemini CLI usage examples with CLI-specific models
- Update: `.env.example` - Add GEMINI_CLI_* environment variable examples with descriptions
- Optional: `docs/PROVIDERS.md` - Add entry for gemini-cli provider with installation instructions

**Key Dependencies (all built-in or already installed):**
- `child_process` module for spawning Gemini CLI (built-in Node.js)
- `readline` module for JSONL stream parsing (built-in Node.js)
- Gemini CLI binary must be installed separately by users (external dependency)
- No new npm packages required

**External Gemini CLI Research Required:**

Before implementation, research the actual Gemini CLI capabilities:
1. **Command-line interface**: Determine exact flags for headless mode, output format, model selection
2. **Output format**: Confirm JSON/JSONL schema, event types, field names
3. **Session management**: Check if CLI supports conversation resumption with session IDs
4. **Authentication**: Confirm if CLI uses GOOGLE_API_KEY, GEMINI_API_KEY, or custom variable
5. **Error codes**: Document all CLI exit codes and their meanings
6. **Installation**: Determine how users install the CLI (npm, pip, binary download)

**Critical Patterns to Follow:**

1. **Optional Dependency Pattern**: Use `isAvailable()` to check CLI presence, don't fail server startup
2. **Defensive Parsing**: Handle malformed JSON gracefully, log and continue with fallback
3. **Generous Timeouts**: Default 120s, configurable via GEMINI_CLI_TIMEOUT
4. **Debug Logging**: Use `debugLog()` for CLI commands and output, `debugError()` for failures
5. **Path Normalization**: Apply `normalizeExtendedPath()` to working directory from CLIENT_CWD
6. **Graceful Degradation**: Ignore unsupported parameters (temperature, use_websearch) with debug logs
7. **Cancellation Support**: Check `signal?.aborted` before and during execution, kill child process on abort
8. **Error Context**: Preserve original errors, provide actionable messages with solutions

<!-- DESIGN:END -->

## TODO
<!-- TODO:BEGIN -->

### Phase 1: Research and Setup (CRITICAL - Must complete before implementation)
- [x] **AUTH**: ~~Confirmed~~ - Uses gcloud login only, no API keys needed. Assume CLI installed and authenticated.
- [x] **SESSION**: ~~Confirmed~~ - No native headless session resumption. Must store full conversation history and resend on continuation.
- [x] **SESSION**: ~~Researched~~ - Must format full conversation history in prompt text (not structured). Consider using Gemini API SDK instead for proper multi-turn.
- [x] **STDIN**: ~~Confirmed~~ - Stdin piping fully supported and RECOMMENDED for large prompts (bypasses shell limits)
- [x] **STDIN**: ~~Confirmed~~ - `--prompt` flag limited by shell (32KB Windows, 128KB Linux). Use stdin for larger content.
- [x] **FILES**: ~~Confirmed~~ - `--include-directories dir1,dir2` works. Also supports `@path` syntax and stdin piping.
- [x] **FILES**: ~~Confirmed~~ - Multiple methods: stdin piping (recommended), `@path` syntax, `--include-directories` flag
- [x] **MODELS**: ~~Confirmed~~ - gemini-2.5-pro (default), gemini-2.5-flash, gemini-2.5-flash-lite, gemini-2.0-flash, gemini-3-pro-preview
- [x] **MODELS**: ~~Confirmed~~ - CLI names match API names EXACTLY (1:1 mapping, no translation needed)
- [x] **OUTPUT**: ~~Confirmed~~ - 6 event types: init, message, tool_use, tool_result, error, result (all documented with schemas)
- [x] **OUTPUT**: ~~Confirmed~~ - tool_use/tool_result events DO appear in stream-json output
- [x] **OUTPUT**: ~~Documented~~ - Exit codes: 0 (success), 41 (auth), 42 (input), 44 (sandbox), 52 (config), 53 (turn limit)
- [x] **ERRORS**: ~~Confirmed~~ - CLI can return exit 0 with embedded error field in JSON output
- [x] **ERRORS**: ~~Documented~~ - stderr contains diagnostics, stdout contains JSON/JSONL responses
- [ ] **RATE_LIMITS**: Still needs verification - likely follows Google API quotas (60 RPM free tier, 120 RPM paid)

### Phase 2: Provider Implementation
- [ ] Create `src/providers/gemini-cli.js` with provider interface structure
- [ ] Implement `convertMessagesToPrompt()` to extract latest user message
- [ ] Implement `getSupportedModels()` with Gemini CLI model configurations
- [ ] Implement `getModelConfig()` to lookup models by name or alias
- [ ] Implement `validateConfig()` to check CLI availability and API key
- [ ] Implement `isAvailable()` to verify CLI binary exists in PATH

### Phase 3: CLI Execution
- [ ] Implement non-streaming mode with JSON output parsing
- [ ] Implement streaming mode with JSONL output parsing
- [ ] Add CLI command construction with proper argument escaping for prompts
- [ ] Handle prompts exceeding shell limits by using stdin piping
- [ ] Support `--prompt`, `--output-format`, `--model`, `--yolo`, `--include-directories` flags
- [ ] Implement process spawning with AbortSignal support
- [ ] Add proper cleanup of child processes on error/completion
- [ ] Implement timeout handling (default 120s, configurable)
- [ ] Handle process hangs with timeout + kill signal
- [ ] Parse both stdout JSON and stderr diagnostics
- [ ] Handle CLI returning exit 0 with embedded error field

### Phase 4: Stream Normalization
- [ ] Add `normalizeGeminiCLIStream()` method to `src/async/providerStreamNormalizer.js`
- [ ] Register normalizer in normalizers registry (line 44)
- [ ] Map init event to start event (capture session_id, model)
- [ ] Map message events (role=assistant) to delta events
- [ ] Map result event to end event (extract stats, usage)
- [ ] Map error events to error events
- [ ] **DECISION**: Determine if tool_use/tool_result should be surfaced or filtered
- [ ] **DECISION**: Determine if thought tokens should be tracked separately
- [ ] Handle malformed JSONL lines gracefully (log and continue)
- [ ] Handle partial stats in streaming mode
- [ ] Extract token usage from result event stats.models[model].tokens
- [ ] Handle session ID from init event (if CLI supports sessions)
- [ ] Add timestamps from event metadata if available

### Phase 5: Configuration
- [ ] Add GEMINI_CLI_* variables to CONFIG_SCHEMA in `src/config.js` (lines 90-109)
- [ ] Add configuration loading in provider config section (lines 296-328)
- [ ] No API key config needed - authentication via gcloud login only
- [ ] Add GEMINI_CLI_PATH with explicit default "gemini" and validation
- [ ] Add GEMINI_CLI_WORKDIR defaulting to CLIENT_CWD with path existence validation
- [ ] Add GEMINI_CLI_AUTO_APPROVE with explicit default true and boolean handling (!== false)
- [ ] Add GEMINI_CLI_TIMEOUT with default 120000 and numeric range validation (min: 10000, max: 600000)
- [ ] Document relationship between config keys and environment variables
- [ ] Add validation rules for all configuration values
- [ ] Implement isAvailable() check: verify binary exists AND gcloud auth is active
- [ ] Add helper to check gcloud auth status (`gcloud auth list --filter=status:ACTIVE --format="value(account)"`)
- [ ] Handle case where CLI binary exists but gcloud not authenticated (clear error message)

### Phase 6: Error Handling
- [ ] Create GeminiCLIProviderError class extending ProviderError
- [ ] Map CLI exit codes to error types (41→INVALID_API_KEY, 42→INVALID_REQUEST, 44→CONFIGURATION_ERROR, 52→CONFIGURATION_ERROR, 53→RATE_LIMIT_ERROR)
- [ ] Handle exit 0 with embedded error field in JSON output
- [ ] Parse error field from JSON output when present (type, message, code)
- [ ] Parse stderr diagnostics for additional error context
- [ ] Handle CLI not found error with installation instructions (npm, brew, gcloud)
- [ ] Handle JSON parse errors with raw output fallback and logging
- [ ] Handle malformed JSONL mid-stream (log and continue)
- [ ] Implement backoff/retry guidance for transient failures
- [ ] Handle timeout errors with clear messaging
- [ ] Handle process hang scenarios with kill signal
- [ ] Preserve original errors for debugging with originalError parameter
- [ ] Provide actionable error messages with solutions

### Phase 7: Chat Tool Integration
- [ ] Update `mapModelToProvider()` in `src/tools/chat.js` (lines 390-469)
- [ ] Add routing for models with "-cli" suffix to gemini-cli provider
- [ ] Test coexistence with existing google provider (no conflicts)
- [ ] Verify all standard options are passed to provider invoke method

### Phase 8: Session Management (NO native support - manual history tracking)
- [ ] Store full message history in continuation store (not session ID)
- [ ] Format multi-turn conversation for CLI prompt (research best format)
- [ ] Implement conversation reconstruction from continuation store
- [ ] Test conversation continuity with multiple turns (resending full history)
- [ ] Document limitation that full history is resent each time (performance consideration)
- [ ] Consider truncation strategy for very long conversations (token limits)

### Phase 9: Testing
- [ ] Create `tests/unit/providers/gemini-cli.test.js` with mocked child_process
- [ ] Test message-to-prompt conversion (string content, array content, images)
- [ ] Test JSON parsing with valid/invalid input
- [ ] Test JSONL parsing with malformed lines mid-stream
- [ ] Test error mapping from all exit codes (0, 41, 42, 44, 52, 53)
- [ ] Test exit 0 with embedded error field
- [ ] Test configuration validation (path existence, numeric ranges, booleans)
- [ ] Test CLI binary not found scenario
- [ ] Test timeout cancellation with AbortSignal
- [ ] Test process cleanup on error
- [ ] Create `tests/integration/providers/gemini-cli/gemini-cli-api.test.js`
- [ ] **CONDITIONAL**: Test suite requires both API key AND CLI installation
- [ ] Test basic chat with JSON output (90s timeout)
- [ ] Test streaming with JSONL output (90s timeout)
- [ ] Test streaming with tool_use/tool_result events (if applicable)
- [ ] Test conversation continuation (180s timeout, if supported)
- [ ] Test error scenarios (auth failure, invalid model)
- [ ] Test parameter mapping and ignored parameters (temperature, use_websearch)
- [ ] Test configuration overrides (custom binary path, workdir, timeout)
- [ ] Test file context handling with --include-directories
- [ ] Test large prompts with stdin piping
- [ ] Test partial stats in streaming mode
- [ ] Test graceful degradation when CLI not installed

### Phase 10: Documentation
- [ ] Update `docs/API.md` with Gemini CLI usage examples
- [ ] Document model naming convention (gemini-cli, gemini-2.5-flash-cli)
- [ ] Add installation instructions (npm install -g @google/generative-ai-cli, brew, gcloud)
- [ ] Document authentication methods (GEMINI_CLI_API_KEY vs gcloud login)
- [ ] Add configuration section with all environment variables and defaults
- [ ] Document validation rules for each configuration option
- [ ] Document security considerations for --yolo flag
- [ ] Document limitations compared to API provider (session resumption, file handling)
- [ ] Add troubleshooting section for common errors (CLI not found, auth failures, exit codes)
- [ ] Document how to verify CLI availability (gemini --version)
- [ ] Update `.env.example` with GEMINI_CLI_* examples and comments
- [ ] Update `docs/PROVIDERS.md` with gemini-cli provider entry
- [ ] Document rate limits and concurrency considerations

### Phase 11: Quality Assurance
- [ ] Run full test suite: `pnpm test`
- [ ] Run linting: `pnpm run lint`
- [ ] Run type checking: `pnpm run typecheck`
- [ ] Run formatting check: `pnpm run format:check`
- [ ] Run complete validation: `pnpm run validate`
- [ ] Verify no regressions in existing functionality
- [ ] Test with multiple model configurations
- [ ] Verify async execution compatibility

<!-- TODO:END -->

## Notes
<!-- NOTES:BEGIN -->

**Relevant Documentation:**
- backlog/docs/guides/doc-codex-research-findings.md - Complete CLI provider integration research including event taxonomy, process lifecycle, thread management, authentication, performance characteristics, configuration options, error scenarios, and integration recommendations
- backlog/docs/guides/doc-codex-sdk.md - SDK usage patterns for CLI integration including streaming examples, thread creation/resumption, working directory controls, and event handling patterns
- backlog/docs/guides/doc-codex-config.md - Configuration patterns for CLI tools including environment-driven configuration, sandbox modes, approval policies, and working directory configuration
- docs/ARCHITECTURE.md - Overall provider system architecture including provider abstraction, registry pattern, model resolution, functional programming principles, stream normalization, and continuation store integration
- docs/PROVIDERS.md - Provider configuration and feature documentation including provider-specific features, configuration examples, environment variables, and model selection/routing logic

**Related Tasks:**
- task-045-add-openai-codex-integration-to-chat-tool - Parent task for Codex CLI integration (complete reference implementation)
- task-046-research-and-prototype-codex-sdk - Research phase for understanding CLI-based providers
- task-047-implement-codex-provider-and-e2e-tests - Provider implementation and testing patterns
- task-048-map-chat-tool-parameters-to-codex-configuration - Parameter mapping between chat tool and CLI configuration
- task-050-update-documentation-for-codex-integration - Documentation patterns and examples

**Implementation Notes:**

*Model Naming Strategy:*
Use "-cli" suffix to distinguish from API-based models:
- "gemini-cli" - Default Gemini CLI model
- "gemini-2.5-flash-cli" - Gemini 2.5 Flash via CLI
- "gemini-2.5-pro-cli" - Gemini 2.5 Pro via CLI
This prevents routing conflicts with existing google provider while maintaining clear user intent.

*Key Differences from Codex:*
1. Codex uses SDK (dynamic import), Gemini CLI uses child_process.spawn (direct CLI)
2. Codex has thread resumption via SDK, Gemini CLI session resumption needs research
3. Codex SDK manages tool execution, Gemini CLI has built-in tool system
4. Authentication may differ (CODEX_API_KEY vs GEMINI_CLI_API_KEY)

*Critical Implementation Decisions:*
- Follow Codex pattern exactly for consistency (proven, tested architecture)
- Use child_process.spawn() not exec() for better stream handling
- Parse JSONL line-by-line using readline interface
- Filter tool_use and tool_result events (internal), only expose message events
- Default to --yolo flag for headless automation (security consideration - document clearly)
- Generous timeouts (120s default) to account for CLI startup and execution

*Testing Strategy:*
- Mock child_process in unit tests to avoid CLI dependency
- Use testWithApiKeys() for conditional integration test execution
- Test both JSON and JSONL output formats
- Verify graceful degradation when CLI not installed
- Test error scenarios with various exit codes

*Documentation Priorities:*
1. Installation instructions for Gemini CLI
2. Model naming convention (-cli suffix)
3. Configuration options with security warnings (--yolo)
4. Limitations compared to API provider
5. Troubleshooting common errors (CLI not found, auth failures)

[Additional implementation decisions, issues encountered, and discoveries will be added during implementation]

**Codex Review Findings (2025-11-18):**

*Summary:*
Comprehensive review by Codex identified gaps in research requirements, error handling, stream normalization, and testing. Plan correctly understands CLI capabilities but treats some aspects as confirmed facts rather than hypotheses requiring verification.

*Major Findings:*
1. **Authentication ambiguity**: Must verify if CLI uses GEMINI_API_KEY, GOOGLE_API_KEY, or gcloud login
2. **Session persistence unverified**: /chat save/resume commands appear interactive-only, headless session support needs proof
3. **Stream normalization incomplete**: Current plan only maps assistant messages, missing tool_use, tool_result, error events
4. **Error handling gaps**: Missing stdout parse failures, stderr diagnostics, exit 0 with embedded errors
5. **Configuration validation lacking**: Need explicit defaults, validation rules, path existence checks
6. **Testing coverage gaps**: Missing CLI-not-found, malformed JSONL, partial stats, file context tests
7. **Documentation incomplete**: Missing installation instructions, auth methods, security warnings

*Risk Assessment:*
- **Moderate-High**: Authentication and session handling unverified; may fail silently if gcloud-only
- **Moderate**: Stream normalization may drop tool events, leading to incomplete outputs
- **Moderate**: JSON parsing assumptions; malformed CLI output will produce cryptic failures
- **Low-Moderate**: Config/flag mismatches easier to fix once requirements clarified

*Actions Taken:*
- Expanded Phase 1 research from 4 to 18 critical verification tasks
- Added stdin piping, file context, model discovery, auth fallback research
- Enhanced error handling to include stderr parsing, exit 0 errors, malformed JSONL
- Expanded stream normalization to handle all event types with decision points
- Added configuration validation rules and explicit defaults
- Increased testing coverage with 22 unit/integration test scenarios
- Enhanced documentation requirements with installation, auth, security considerations

*Remaining Questions for Phase 1:*
1. How does Gemini CLI authenticate in headless mode?
2. Does headless mode support session IDs for resumption?
3. Can large prompts be piped via stdin?
4. Which models are available and do names match API models?
5. Does CLI provide per-event timestamps/metadata?
6. Are there rate limits or concurrency constraints?

**Research Findings (2025-11-18 22:32):**

All critical research questions answered through comprehensive exploration:

*Authentication (Confirmed by User):*
- Uses gcloud login only, NO API keys needed
- Assume CLI is installed and authenticated
- Provider should check `gcloud auth list --filter=status:ACTIVE` in isAvailable()

*Session Management (Confirmed by User):*
- NO native headless session resumption support
- Must store full conversation history ourselves
- Resend complete history with each continuation request
- Consider using Gemini API SDK instead of CLI for proper multi-turn (SDK has startChat() with structured history)

*Stdin Piping (Research Confirmed):*
- ✅ FULLY SUPPORTED and RECOMMENDED for large prompts
- Bypasses shell argument limits entirely
- Examples: `cat file.txt | gemini`, `echo "prompt" | gemini`
- `--prompt` flag limited by shell: 32KB (Windows CMD), 128KB (Linux)
- Use stdin for ANY prompt >10KB to be safe

*File Context (Research Confirmed):*
- `--include-directories dir1,dir2` - Add multiple directories
- `@path` syntax in interactive mode - NOT available in headless
- Stdin piping - RECOMMENDED method: `cat files | gemini --prompt "analyze"`
- Working directory automatically scanned with .gitignore respect

*Models (Research Confirmed):*
- **Available models**: gemini-2.5-pro (DEFAULT), gemini-2.5-flash, gemini-2.5-flash-lite, gemini-2.0-flash, gemini-2.0-flash-lite, gemini-3-pro-preview
- **Naming**: CLI names match API names EXACTLY (1:1 mapping, no translation)
- **No list command**: No `--list-models` command exists
- **Context window**: All 2.5+ models have 1M token context window
- **Max output**: 65,536 tokens for 2.5 models, 8,192 for 2.0

*JSONL Event Schema (Research Confirmed):*
- **6 event types total**: init, message, tool_use, tool_result, error, result
- **All events have timestamps**: RFC 3339 format with millisecond precision
- **tool_use/tool_result**: YES, these appear in headless mode streaming
- **Complete schema documented** in research findings
- **Event correlation**: tool_id links tool_use → tool_result
- **Session tracking**: session_id from init event

*Error Handling (Research Confirmed):*
- **Exit codes**: 0 (success), 41 (auth), 42 (input), 44 (sandbox), 52 (config), 53 (turn limit)
- **Exit 0 with error**: YES, CLI can return exit 0 with embedded error field in JSON
- **stderr vs stdout**: stderr = diagnostics, stdout = JSON/JSONL responses
- **Error event**: Non-fatal errors emitted as error events in stream, session continues

*Key Implementation Decisions Based on Research:*
1. Use stdin piping for prompts >10KB (including conversation history)
2. Format conversation history as text block (no structured turn support in CLI)
3. Map 6 JSONL event types in normalizer (init→start, message→delta, result→end, error→error)
4. Tool events (tool_use/tool_result) should be logged but NOT sent to user (internal operations)
5. Exit code 0 doesn't guarantee success - must parse JSON error field
6. Model names pass through to CLI without translation (CLI uses same names as API)
7. Check gcloud auth status in isAvailable() before assuming CLI works

*Alternative Recommendation:*
For proper multi-turn conversations, consider using Gemini API SDK (@google/generative-ai) instead of CLI. The CLI is stateless in headless mode and requires manual history management.

<!-- NOTES:END -->
