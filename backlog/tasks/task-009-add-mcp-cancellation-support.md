---
id: task-009-add-mcp-cancellation-support
title: Add MCP Cancellation Support for Sync Tool Calls
status: "In Progress"
created_date: '2026-02-20 11:19'
updated_date: '2026-02-20 13:52'
parent: null
subtasks: []
dependencies: []
---

## Description
<!-- DESCRIPTION:BEGIN -->
When a user presses Escape in Claude Code during an MCP tool call (e.g., chat or consensus), the client sends a cancellation notification to the server. Currently the server ignores this notification — the upstream API call (OpenAI, Codex, Google, etc.) runs to completion, consuming tokens and time, but the response is silently discarded.

This task wires up the MCP SDK's built-in cancellation mechanism so that pressing Escape actually aborts the in-flight provider API call. The server already has all the infrastructure in place (providers accept `signal`, SDK provides `extra.signal`) — it just needs to be connected.
<!-- DESCRIPTION:END -->

## Specification
<!-- SPECIFICATION:BEGIN -->
### Requirements

1. **Router passes AbortSignal to tools**: The `CallToolRequestSchema` handler in `router.js` must accept the `extra` parameter and pass `extra.signal` through to tool dependencies per-request.
2. **Sync chat path uses signal**: The synchronous chat tool path must include `signal` in `providerOptions` passed to `provider.invoke()`.
3. **Sync consensus path uses signal**: The synchronous consensus tool path must include `signal` in each provider call's `options`, and add an explicit abort gate before starting Phase 2 (cross-feedback).
4. **OpenAI provider passes signal to SDK**: The OpenAI provider must pass `signal` as the second argument (`RequestOptions`) to `openai.responses.create()` and `openai.chat.completions.create()`, not just check it pre-flight.
5. **Graceful abort handling**: When a tool call is cancelled, abort errors must be detected at router, tool, and provider layers — logged at `debug` level, never `error`. The MCP SDK silently drops responses after abort, so construct a clean error response and let the SDK discard it.
6. **Skip continuation state on abort**: Cancelled sync calls must not persist conversation state to the continuation store — avoid writing partial/incomplete history.
7. **No retries/failover after abort**: Abort errors must not trigger `retryWithBackoff` retries or auto-failover to the next provider candidate.

### Acceptance Criteria

- Pressing Escape in Claude Code during a sync chat call aborts the underlying HTTP request to the provider API.
- Pressing Escape during a sync consensus call aborts all in-flight provider calls (both Phase 1 and Phase 2).
- No error-level logs on cancellation — router, tool, and provider layers all log at `debug`.
- No retries or failover triggered after cancellation.
- Cancelled calls do not write to continuation store.
- Consensus Phase 2 (cross-feedback) is skipped entirely if signal is already aborted after Phase 1.
- No unhandled promise rejections on cancellation.
- Existing async path continues to work (already has signal wired up).
- All existing tests pass.
- `callTool` test utility accepts optional `signal` parameter for test coverage.
<!-- SPECIFICATION:END -->

## Design
<!-- DESIGN:BEGIN -->
### How MCP Cancellation Works (SDK v1.26.0)

The MCP SDK already handles everything automatically:

1. **Client sends `notifications/cancelled`** with `{ requestId, reason }` when user presses Escape
2. **SDK's `Protocol._oncancel()`** looks up the `AbortController` from `_requestHandlerAbortControllers` map and calls `controller.abort(reason)`
3. **Every request handler** receives `extra.signal` (an `AbortSignal`) as its second parameter
4. **After abort**, SDK checks `signal.aborted` before sending any response — silently drops it

The only missing piece: the router's `CallToolRequestSchema` handler ignores the `extra` parameter entirely.

### Architecture

```
Claude Code (Escape) → notifications/cancelled → SDK abort(reason)
                                                       ↓
                                              extra.signal.aborted = true
                                                       ↓
                               router.js → dependencies.signal → tool
                                                                   ↓
                                                         providerOptions.signal
                                                                   ↓
                                               provider.invoke() → SDK abort
                                                                   ↓
                                                        HTTP request aborted
```

### Key Files

| File | Change |
|------|--------|
| `src/router.js` | Accept `extra` in handler, pass `extra.signal` into dependencies |
| `src/tools/chat.js` | Pass `dependencies.signal` into `providerOptions` in sync path |
| `src/tools/consensus.js` | Pass `dependencies.signal` into `call.options` in sync path |
| `src/providers/openai.js` | Pass `signal` as second arg to SDK `.create()` calls |

### Current State Analysis

**Router** (`src/router.js:201`):
```js
// CURRENT — ignores extra
server.setRequestHandler(CallToolRequestSchema, async (request) => {
```
```js
// NEEDED — accept extra, pass signal
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  // ... pass extra.signal into dependencies
```

**Chat sync path** (`src/tools/chat.js:337-346`):
```js
// CURRENT — no signal
const providerOptions = {
  model: resolvedModel,
  temperature,
  reasoning_effort,
  // ... no signal
};
```

**Consensus sync path** (`src/tools/consensus.js:354-365`):
```js
// CURRENT — no signal
options: {
  temperature,
  reasoning_effort,
  use_websearch,
  config,
  model: resolvedModelName,
  // ... no signal
}
```

**OpenAI provider** (`src/providers/openai.js:566-572`):
```js
// CURRENT — signal not passed to SDK
response = await openai.responses.create(requestPayload);
// NEEDED
response = await openai.responses.create(requestPayload, { signal });
```

### Provider Signal Support Status

| Provider | Accepts signal | Passes to SDK | Needs fix |
|----------|---------------|---------------|-----------|
| openai | Yes (destructured) | No — only pre-flight check | Yes |
| google | Yes | Yes (retry wrapper) | No |
| xai | Yes | Yes (`requestWithSignal.signal`) | No |
| claude | Yes | Yes (`abortController` forwarding) | No |
| codex | Yes | Yes (`thread.runStreamed(prompt, { signal })`) | No |
| copilot | Yes | Partial (loop check only) | Minor |
| openai-compatible | Yes | Yes (`requestWithSignal.signal`) | No |

### Token Billing Reality

Client-side abort does NOT stop server-side LLM generation. Aborting is most effective when:
- Triggered early (before many tokens generated)
- Using streaming (server detects dropped connection faster)
- Non-streaming requests: server always completes full response regardless

This is a limitation of all provider APIs — none expose server-side cancel for standard text generation. Still, aborting client-side: frees local resources, stops consuming bandwidth, prevents unnecessary processing in the MCP server, and for streaming gives the earliest possible signal to the server.

**Context Manifest:**

### How MCP Request Handling Currently Works: CallTool Flow

When Claude Code invokes a tool (chat or consensus), the MCP SDK receives a JSON-RPC request and dispatches it through `Protocol._onrequest()`. The SDK creates a fresh `AbortController` for each incoming request, stores it in `_requestHandlerAbortControllers` keyed by request ID, then calls the registered handler with two arguments: `(request, extra)` where `extra` is `RequestHandlerExtra` containing `signal: AbortSignal`, `sessionId`, `requestId`, `sendNotification`, `sendRequest`, and more. When the client sends `notifications/cancelled`, the SDK looks up the controller by request ID and calls `abort(reason)`.

In `src/router.js` at line 201, the `CallToolRequestSchema` handler is registered as:
```js
server.setRequestHandler(CallToolRequestSchema, async (request) => {
```
The handler signature only accepts `request`, completely ignoring the `extra` second parameter. This means `extra.signal` (the AbortSignal connected to the SDK's abort machinery) is never captured and never forwarded.

The handler extracts `toolName` and `toolArgs` from `request.params`, validates the tool, then calls:
```js
const result = await tool(toolArgs, dependencies);
```
where `dependencies` is created once at router initialization via `createDependencies(config)` (line 193) and reused for all requests. The dependencies object includes: `config`, `continuationStore`, `providers`, `contextProcessor`, `asyncJobStore`, `jobRunner`, `fileCache`, `providerStreamNormalizer`, `sessionId`, and `router`. There is no `signal` property.

This means the entire flow from tool invocation through provider API call runs without any awareness of cancellation for synchronous (non-async) calls. When a user presses Escape, the SDK aborts the signal, but nobody is listening.

The router also has a `callTool` method (line 394) used for testing, which similarly does not accept or pass a signal.

### How the Sync Chat Path Works

`chatTool(args, dependencies)` in `src/tools/chat.js` destructures dependencies at line 36-43 (config, providers, continuationStore, contextProcessor, jobRunner, providerStreamNormalizer) and never looks for `signal`.

For the sync path (when `async` is false, starting line 158), the tool:
1. Loads conversation history from continuationStore
2. Validates and processes file/image context
3. Builds messages array with system prompt, history, and user message
4. Resolves provider via `mapModelToProvider()` and builds candidates
5. Constructs `providerOptions` at lines 337-346:
```js
const providerOptions = {
  model: resolvedModel,
  temperature,
  reasoning_effort,
  verbosity,
  use_websearch,
  config,
  continuation_id,
  continuationStore,
};
```
No `signal` property is present.
6. Calls `retryWithBackoff(() => selectedProvider.invoke(messages, providerOptions), ...)` at line 349
7. On auto mode, iterates through `providerCandidates` with failover

The `retryWithBackoff` function in `src/utils/errorHandler.js` (line 462) has no abort signal awareness. It retries based on `isRecoverableError()` checks, which look for network/timeout/rate-limit patterns. Abort errors would not match these patterns, so `retryWithBackoff` would correctly not retry an aborted request, but it also would not proactively check signal state between retries.

### How the Sync Consensus Path Works

`consensusTool(args, dependencies)` in `src/tools/consensus.js` follows a similar pattern. For sync execution (when `async` is false), it:
1. Resolves models to provider calls, building `providerCalls` array at lines 354-366
2. Each call's `options` object contains:
```js
options: {
  temperature,
  reasoning_effort,
  use_websearch,
  config,
  model: resolvedModelName,
}
```
No `signal` property.
3. Phase 1 runs via `Promise.allSettled()` at line 379, invoking `call.providerInstance.invoke(messages, call.options)` in parallel
4. Phase 2 (cross-feedback) similarly calls `call.providerInstance.invoke(modelFeedbackMessages, call.options)` at line 476

Without signal in the options, none of these parallel calls can be cancelled.

### How the Async Paths Already Work (Reference Implementation)

The async paths serve as the reference implementation for how signal should flow.

**Chat async path** (`executeChatWithStreaming`, line 681): The streaming options include signal from the job runner's context:
```js
const streamingOptions = {
  ...providerOptions,
  stream: true,
  signal: context?.signal,
};
```
The job runner creates an `AbortController` per job (jobRunner.js line 121), stores it in `this.abortControllers` map, and passes `abortController.signal` to `_executeJob`. The execution context passed to the run function includes `signal` (line 306). The `cancel_job` tool triggers `abortController.abort('Job cancelled by user')`.

**Consensus async path** (`executeConsensusWithStreaming`, line 883): Each provider call includes signal at line 1094:
```js
options: {
  temperature,
  reasoning_effort,
  use_websearch,
  signal: context?.signal,
  config,
  model: resolvedModelName,
}
```
The streaming phase also checks `context.signal.aborted` at multiple points (lines 1450, 1511).

### How Providers Handle Signal

All providers accept `signal` in their `options` parameter via the `InvokeOptions` interface defined in `src/providers/interface.js` line 40: `@property {AbortSignal} [signal] - AbortSignal for cancelling requests`.

**OpenAI** (`src/providers/openai.js`): Destructures `signal` from options at line 381. Pre-flight abort check at line 559. For non-streaming, the signal is NOT passed to `openai.responses.create()` or `openai.chat.completions.create()` (lines 568, 572). For streaming, the signal is similarly not passed to the `.create()` call (lines 803, 807), but is checked during stream iteration (line 814). The OpenAI SDK (Stainless) supports `signal` as a second argument: `client.responses.create(body, { signal })`.

**XAI** (`src/providers/xai.js`): Destructures `signal` at line 229. Pre-flight check at line 334. Passes signal to the OpenAI SDK `.create()` call via `requestWithSignal.signal = signal` (lines 342-343). Checks during streaming at line 499. This provider is fully wired up.

**Google** (`src/providers/google.js`): Destructures `signal` at line 400. Pre-flight check at line 588. Checks inside retry wrapper at lines 596. For streaming, checks during iteration at line 770. Uses Google GenAI SDK which does not have a direct signal pass-through, but the provider checks abort state at multiple points.

**OpenAI-compatible** (`src/providers/openai-compatible.js`): Used by DeepSeek and OpenRouter. Destructures `signal` at line 298. Pre-flight check at line 421. Passes signal to `.create()` via `requestWithSignal` pattern (lines 429-430). Streaming also checks at line 550. Fully wired up.

**Anthropic** (`src/providers/anthropic.js`): Does NOT destructure signal from options (line 461-475). The Anthropic SDK supports `signal` in `RequestOptions` as a second argument to `.messages.create()`. This provider currently has no abort support.

**Mistral** (`src/providers/mistral.js`): Does NOT destructure signal from options (line 257-271). The Mistral SDK may support signal through its stream/create options. Currently has no abort support.

**Claude SDK** (`src/providers/claude.js`): Destructures `signal` at line 371. Creates a forwarding AbortController at line 240 since the SDK expects `AbortController`, not `AbortSignal`. Checks during streaming at line 275. Fully wired up.

**Codex SDK** (`src/providers/codex.js`): Destructures `signal` at line 227. Passes to `thread.runStreamed(prompt, { signal })` at line 193. Checks during streaming at line 197. Fully wired up.

**Copilot SDK** (`src/providers/copilot.js`): Destructures `signal` at line 388. Passes to streaming generator at line 429. Checks during event loop at line 336. Fully wired up.

**Gemini CLI** (`src/providers/gemini-cli.js`): Destructures `signal` at line 331. Passes as `abortSignal` to ai-sdk at line 125. Checks during streaming at line 140. Fully wired up.

### For New Feature Implementation: What Needs to Connect

**1. Router handler signature change (src/router.js line 201)**
The handler must accept the `extra` second parameter. The signal should be injected per-request, not stored in the shared `dependencies` object (which is created once at startup). The cleanest approach is to add `signal` to the tool call: `await tool(toolArgs, { ...dependencies, signal: extra.signal })`. This pattern preserves all existing dependencies while adding the per-request signal.

The test-facing `callTool` method (line 394) should also accept an optional signal for test coverage.

**2. Chat sync path signal injection (src/tools/chat.js lines 337-346)**
Extract `signal` from `dependencies` and add it to `providerOptions`:
```js
const { config, providers, continuationStore, contextProcessor, signal } = dependencies;
// ...
const providerOptions = { ...existingOptions, signal };
```
The `retryWithBackoff` wrapping at line 349 works correctly: abort errors are not "recoverable" per `isRecoverableError()`, so retry will not re-attempt an aborted call. However, if signal is already aborted before retry starts, the provider will immediately throw on the pre-flight check, and retryWithBackoff will exit.

**3. Consensus sync path signal injection (src/tools/consensus.js lines 354-365)**
Add `signal` to each provider call's options:
```js
options: { temperature, reasoning_effort, use_websearch, signal: dependencies.signal, config, model: resolvedModelName }
```
For Phase 2 (cross-feedback, line 476), signal should also be included in the refinement call options.

**4. OpenAI provider signal pass-through (src/providers/openai.js)**
Lines 566-572 (non-streaming sync path): The signal is destructured but not passed. The OpenAI SDK v5 accepts `RequestOptions` as a second argument. Change:
```js
response = await openai.responses.create(requestPayload);
// to
response = await openai.responses.create(requestPayload, { signal });
```
Same for `openai.chat.completions.create(requestPayload)` at line 572.

Lines 799-807 (streaming path): Same change for both responses and completions API.

**5. Error handling for abort (src/router.js catch block, lines 249-264)**
The catch block currently calls `createErrorResponse(error, toolName, ...)`. When `signal.aborted` is true, the error will be an `AbortError` (name === 'AbortError') or a generic Error with message containing 'aborted'. The SDK itself checks `abortController.signal.aborted` after the handler returns/throws and silently drops the response. So the router's catch block will run, but the response it sends will be discarded by the SDK. Still, it is good practice to detect abort errors and log them at debug level rather than error level, to avoid noisy logs:
```js
if (extra?.signal?.aborted) {
  requestLogger.debug('Tool execution cancelled by client');
  return createErrorResponse(new Error('Request cancelled'), toolName);
}
```

**6. Anthropic and Mistral providers (optional improvement)**
These providers do not currently accept `signal`. Since signal is passed as part of an options object and both providers destructure only known keys, an extra `signal` property will be harmlessly ignored. No immediate change is needed for correctness, but for completeness the providers could be updated to pass `signal` to their respective SDKs.

### Technical Reference Details

#### Component Interfaces & Signatures

**MCP SDK handler signature** (from `@modelcontextprotocol/sdk/dist/esm/shared/protocol.d.ts`):
```ts
setRequestHandler<T>(requestSchema: T, handler: (request: SchemaOutput<T>, extra: RequestHandlerExtra) => Result | Promise<Result>): void;
```

**RequestHandlerExtra type** (protocol.d.ts lines 173-226):
```ts
type RequestHandlerExtra = {
  signal: AbortSignal;
  authInfo?: AuthInfo;
  sessionId?: string;
  _meta?: RequestMeta;
  requestId: RequestId;
  sendNotification: (notification) => Promise<void>;
  sendRequest: (request, resultSchema, options?) => Promise<SchemaOutput>;
  // ... task-related fields
};
```

**Tool function signature**: `async function(args: object, dependencies: object): Promise<MCPResponse>`

**Provider invoke signature**: `async invoke(messages: Message[], options?: InvokeOptions): Promise<ProviderResponse | AsyncGenerator>`

**InvokeOptions** (interface.js lines 33-44): Includes `signal?: AbortSignal`

**retryWithBackoff** (errorHandler.js line 462): `async function retryWithBackoff(fn, options?)` where options include `retries`, `delay`, `backoffFactor`, `maxDelay`, `operation`. Does not accept or check signal.

**isRecoverableError** (errorHandler.js line 310): Returns true for network/timeout/rate-limit/quota/temporary patterns. Abort errors will NOT match, so aborted calls will not be retried.

#### Data Structures

**Dependencies object** (router.js lines 158-172):
```js
{ config, continuationStore, providers, contextProcessor: { processUnifiedContext },
  asyncJobStore, jobRunner, fileCache, providerStreamNormalizer,
  sessionId: 'local-user', router: { createErrorResponse, validateToolArguments } }
```
Signal needs to be added per-request, not at creation time.

**providerOptions** in chat sync path (chat.js lines 337-346):
```js
{ model, temperature, reasoning_effort, verbosity, use_websearch, config, continuation_id, continuationStore }
```

**call.options** in consensus sync path (consensus.js lines 358-365):
```js
{ temperature, reasoning_effort, use_websearch, config, model }
```

**Job execution context** (jobRunner.js lines 302-310):
```js
{ jobId, tool, signal, updateJob: (updates) => store.update(jobId, updates),
  emitEvent: (eventType, data) => this.emit(eventType, { jobId, ...data }) }
```

#### Configuration Requirements

No new configuration needed. The signal is provided by the MCP SDK automatically.

#### File Locations
- Router: `src/router.js` (line 201 handler, line 394 test callTool)
- Chat tool: `src/tools/chat.js` (line 34 chatTool, line 337 providerOptions)
- Consensus tool: `src/tools/consensus.js` (line 37 consensusTool, line 354 providerCalls)
- OpenAI provider: `src/providers/openai.js` (line 372 invoke, lines 559-572 sync, lines 785-807 stream)
- Error handler: `src/utils/errorHandler.js` (line 310 isRecoverableError, line 462 retryWithBackoff)
- Provider interface: `src/providers/interface.js` (line 40 signal in InvokeOptions)
- Job runner (reference): `src/async/jobRunner.js` (line 121 AbortController creation, line 306 context.signal)
- Cancel job tool: `src/tools/cancelJob.js`
- Tests: `tests/tools/cancelJob.test.js`
- MCP SDK protocol: `node_modules/@modelcontextprotocol/sdk/dist/esm/shared/protocol.js` (line 310 AbortController, line 363 handler call, line 174 _oncancel)
- MCP SDK types: `node_modules/@modelcontextprotocol/sdk/dist/esm/shared/protocol.d.ts` (line 173 RequestHandlerExtra, line 177 signal: AbortSignal)
<!-- DESIGN:END -->

## TODO
<!-- TODO:BEGIN -->
- [x] Update `CallToolRequestSchema` handler in `src/router.js` to accept `extra` parameter and pass `extra?.signal` into tool dependencies per-request via spread
- [x] Update `callTool` test utility in `src/router.js` (line 394) to accept optional `signal` parameter
- [x] Add abort detection in router catch block — check `extra?.signal?.aborted` or `error.name === 'AbortError'`, log at `debug` not `error`
- [x] Update sync chat path in `src/tools/chat.js` to destructure `signal` from dependencies and include in `providerOptions`
- [x] Guard chat continuation store write (`chat.js:392-406`) — skip if `signal?.aborted`
- [x] Update chat tool top-level catch (`chat.js:472`) — detect abort, log at `debug`
- [x] Update sync consensus path in `src/tools/consensus.js` to include `dependencies.signal` in `call.options`
- [x] Add explicit abort gate in consensus before Phase 2 cross-feedback — `if (signal?.aborted)` skip refinement
- [x] Update consensus tool top-level catch (`consensus.js:691`) — detect abort, log at `debug`
- [x] Fix OpenAI provider to pass `signal` as second arg to `openai.responses.create()` and `openai.chat.completions.create()` (both sync and streaming paths)
- [x] Run existing tests to verify no regressions
<!-- TODO:END -->

## Notes
<!-- NOTES:BEGIN -->
### Review Feedback (Codex + Gemini)

**Design decisions from review:**
- **Abort error logging**: All three layers (router, tool, provider) currently log cancellations as errors. Must detect abort and log at `debug` level instead. Codex identified specific lines: `chat.js:473`, `consensus.js:691`, `router.js:251`.
- **Consensus post-abort work**: `Promise.allSettled` swallows per-call failures, so consensus can proceed into Phase 2 after abort. Add explicit `if (signal?.aborted)` gate before starting refinement.
- **Skip continuation state**: On abort, do not write partial conversation state to continuation store. Guard the save at `chat.js:392-406`.
- **Let SDK handle response dropping**: The MCP SDK checks `signal.aborted` after handler returns/throws and silently drops the response. No special internal abort path needed — construct a clean error response and let the SDK discard it.
- **`retryWithBackoff` sleep**: Not signal-aware during backoff delay, so cancellation can be delayed until timeout expires. Acceptable for now — abort errors won't match `isRecoverableError()` so retries won't fire, but the backoff sleep itself could block. Low priority since sync path uses retries=3 with 500ms base delay.
- **Test utility**: `callTool` in router.js needs optional `signal` parameter for test coverage (flagged by Gemini).
- **OpenAI SDK confirmed**: Codex verified against installed SDK types that `{ signal }` as second arg is correct (`node_modules/openai/internal/request-options.d.ts:56`).

### Research Findings

**MCP SDK cancellation is fully implemented** in `@modelcontextprotocol/sdk` v1.26.0:
- `Protocol._requestHandlerAbortControllers`: `Map<RequestId, AbortController>` — one per in-flight request
- `_oncancel()`: called on `notifications/cancelled`, does `controller.abort(reason)`
- Handler signature: `async (request, extra) => {}` where `extra.signal` is the `AbortSignal`
- Post-abort: SDK checks `signal.aborted` before sending response — silently drops it
- Connection close: `_onclose()` aborts ALL in-flight controllers

**Codex SDK limitation**: `@openai/codex-sdk` has no `abort()` API (open issue #5494). Current workaround: break from `for await` loop on signal abort. The subprocess may continue running.

**OpenAI SDK signal passing**: The OpenAI SDK (Stainless-generated) accepts signal in `RequestOptions` as the second argument: `client.responses.create(body, { signal })`. Currently the openai.js provider destructures signal but never passes it to the actual API call.

**Relevant Documentation:**
- MCP Spec 2025-06-18: `notifications/cancelled` — fire-and-forget, `{ requestId, reason? }`
- OpenAI SDK: `RequestOptions.signal` (second argument to `.create()`)
- Google SDK: `abortSignal` field in request config
- Anthropic SDK: `RequestOptions.signal` (second argument) or `stream.controller.abort()`

**Related Tasks:**
- None
<!-- NOTES:END -->
