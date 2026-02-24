---
id: task-011-support-custom-continuation-ids
title: Support Custom Continuation IDs
status: "In Progress"
created_date: '2026-02-22 21:41'
updated_date: '2026-02-22 22:15'
parent: null
subtasks: []
dependencies: []
---

## Description
<!-- DESCRIPTION:BEGIN -->
When a caller sends a request to the chat or consensus tool with a `continuation_id` that doesn't already exist in the server's memory, the server currently throws it away and generates a brand-new ID (like `conv_aB3_xY7pQr`). This means callers cannot choose their own meaningful IDs for conversations — they always get back a server-generated one.

The proposed change lets callers provide their own custom continuation IDs. If the first request includes a `continuation_id` the server doesn't recognize, the server will use that exact ID to start the conversation instead of replacing it. The custom ID can be any string — it does not need to follow the `conv_` format the server normally generates.

To help calling models tell whether an unrecognized ID was intentional (a custom name like `"my-project-analysis"`) versus accidental (a mistyped or expired standard ID), the response metadata will include a `custom_id: true` flag when the provided ID doesn't match the server's standard format. This gives the caller enough information to decide whether to warn the user or proceed normally.

The async execution paths already preserve user-provided IDs, so only the synchronous paths need updating. The README already documents the ability to pass custom IDs, but the implementation didn't actually honor them until now.
<!-- DESCRIPTION:END -->

## Specification
<!-- SPECIFICATION:BEGIN -->
### Requirements

1. **Preserve user-provided IDs**: When `continuation_id` is provided but not found in the store, use the provided ID as-is instead of generating a new one. Start a fresh conversation under that ID.
2. **Custom ID metadata flag**: When the provided ID doesn't match the standard generated format (`conv_[A-Za-z0-9_-]{10}` or legacy UUID), include `custom_id: true` in the `continuation` response object. Rule: `custom_id: true` is set when BOTH conditions are met: (a) the ID format is non-standard per `isValidContinuationId()`, AND (b) the ID was not found in the store (new conversation). On resume (found in store), never emit `custom_id` regardless of format.
3. **Consistent behavior across tools**: Both `chat` and `consensus` tools must behave identically for custom IDs in all code paths (sync, async submission, and async completion).
4. **Error path preservation**: When a store error occurs while loading a provided `continuation_id`, preserve the user's ID (don't replace it) and start a fresh conversation.
5. **Async safety validation**: When `async === true` and a custom `continuation_id` is provided, validate it against `isSafeIdSegment()` (`[A-Za-z0-9_-]+`, max 128 chars). Return a clear error if validation fails, since async jobs use the ID as a filesystem path segment via `fileCache` and as a lookup key in `checkStatus`/`cancelJob`.

### Acceptance Criteria

- Calling chat with `continuation_id: "my-custom-id"` (not in store) returns `continuation.id === "my-custom-id"` and `continuation.custom_id === true`.
- Calling chat with `continuation_id: "my-custom-id"` (already in store from prior call) returns `continuation.id === "my-custom-id"` and `custom_id` is absent/falsy (it's a normal resume).
- Calling chat with `continuation_id: "conv_XXXXXXXXXX"` (valid format, not in store — expired/stale) returns `continuation.id === "conv_XXXXXXXXXX"` and `custom_id` is absent (format matches standard, likely accidental).
- Calling chat without `continuation_id` generates a new `conv_` ID as before — no behavior change.
- Consensus tool behaves identically to chat for all above scenarios.
- Async paths preserve custom IDs and include `custom_id` in both submission and completion responses.
- Async mode rejects custom IDs with unsafe characters (spaces, dots, path separators, etc.) with a clear validation error.
- The `custom_id` flag appears in ALL continuation objects: sync response, async submission, async completion, and consensus JSON content continuation.

### Edge Cases

- **Empty string `continuation_id`**: Treated as falsy — generate a new ID (no change from current behavior, JS truthiness handles this).
- **Unsafe characters in async mode**: Custom ID like `"my project/analysis"` with `async: true` → return validation error explaining character restrictions. Same ID in sync mode → accepted.
- **ID collisions**: A custom ID that happens to match a different conversation's auto-generated `conv_` ID would load that conversation's history. This is existing behavior and acceptable — the ID namespace is shared.
- **Store error with custom ID**: Preserve the custom ID and start fresh (same as the not-found case). If the ID is non-standard, set `custom_id: true`.
<!-- SPECIFICATION:END -->

## Design
<!-- DESIGN:BEGIN -->
**Architecture Approach:**
Remove the `generateContinuationId()` fallback in the sync paths of both tools when a user-provided ID is not found in the store. Instead, keep the user's ID and start a fresh conversation. Add a `custom_id` flag to the response `continuation` object by checking the provided ID against `isValidContinuationId()` (which finally gets a use).

The change is purely behavioral — no new modules, classes, or infrastructure. The store already accepts arbitrary string keys.

**Key Files:**
- `src/tools/chat.js` — Sync path (lines 168-175): remove `generateContinuationId()` calls; async submission (line 147): add `custom_id`; sync response (lines 445-453): add `custom_id`; async completion (line 1100): add `custom_id`; async path (line 67-77): add `isSafeIdSegment` validation when `async === true`
- `src/tools/consensus.js` — Sync path (lines 178-185): same change; async submission (line 156): add `custom_id`; sync JSON content continuation (line 661): add `custom_id`; sync top-level continuation (line 690): add `custom_id`; async completion (line 1420): add `custom_id`; async path (line 80-90): add `isSafeIdSegment` validation
- `src/continuationStore.js` — `isValidContinuationId()` already exported, needs import in tool files
- `src/utils/idValidation.js` — `isSafeIdSegment()` already exported, needs import in tool files for async validation
- `tests/tools/chat.test.js` — Update "invalid continuation ID" test (line 281-295)
- `tests/integration/tools/continuation-flow.test.js` — Update assertion (line 332-345)
- `tests/integration/tools/tools-integration.test.js` — Update assertion (line 339-353)

**Patterns to Follow:**
- The async paths already use the pattern `continuation_id || generateContinuationId()` — the sync paths should converge to the same "preserve user input" behavior.
- The `continuation` response object already has varying shapes between chat and consensus. Adding an optional `custom_id` boolean follows this pattern.
- Use `isValidContinuationId()` from `continuationStore.js` to detect non-standard IDs — this gives the existing dead-code function a purpose.

**Dependencies:**
None. `isValidContinuationId` is already exported from `continuationStore.js`.

**Context Manifest:**

### How This Currently Works: Continuation ID Handling

The continuation ID system manages persistent multi-turn conversations across the chat and consensus tools. A continuation ID is a string identifier that maps to stored conversation state (message history, provider info, metadata) in an in-memory Map-based store.

**ID Generation:** `generateContinuationId()` in `src/continuationStore.js` (line 331-334) creates IDs with the format `conv_<10-char-nanoid>`, using the `nanoid` library with a URL-safe alphabet (`A-Za-z0-9_-`). Example: `conv_V1StGXR8_Z`.

**ID Validation:** `isValidContinuationId()` (lines 341-355) checks for two formats: the nanoid pattern `^conv_[A-Za-z0-9_-]{10}$` and a legacy UUID pattern `^conv_[0-9a-f]{8}-...`. However, this function is exported but **never imported or called** anywhere in `src/`. It exists solely as a utility and is not enforced during set/get operations.

**Sync Chat Path (lines 159-180 of `src/tools/chat.js`):**
The flow has three branches:
1. If `continuation_id` is provided AND found in the store: load conversation history from it, keep using that ID.
2. If `continuation_id` is provided AND NOT found in the store (line 169-171): **discard the user-provided ID and generate a new one** via `generateContinuationId()`. This is the behavior the task aims to change.
3. If no `continuation_id` is provided (line 177-179): generate a new one.

On error loading from store (line 172-176): also generates a new ID.

```javascript
// Current behavior (chat.js lines 159-180):
let continuationId = continuation_id;
if (continuationId) {
  try {
    const existingState = await continuationStore.get(continuationId);
    if (existingState) {
      conversationHistory = existingState.messages || [];
    } else {
      // Invalid continuation ID - start fresh with new ID
      continuationId = generateContinuationId();
    }
  } catch (error) {
    continuationId = generateContinuationId();
  }
} else {
  continuationId = generateContinuationId();
}
```

**Async Chat Path (lines 67-157 of `src/tools/chat.js`):**
For async execution, the continuation ID is set on line 76-77:
```javascript
const conversationContinuationId =
  continuation_id || generateContinuationId();
```
This already preserves user-provided IDs since it only generates when `continuation_id` is falsy. However, it does not check whether the ID exists in the store first. The ID is used as both the job ID and the continuation ID for the async job. The actual conversation loading happens later inside `executeChatWithStreaming()` (lines 735-748), where the store lookup occurs but a not-found result simply means starting with empty history (no ID replacement).

**Sync Consensus Path (lines 168-190 of `src/tools/consensus.js`):**
Identical pattern to sync chat:
```javascript
let continuationId = continuation_id;
if (continuationId) {
  try {
    const existingState = await dependencies.continuationStore.get(continuationId);
    if (existingState) {
      conversationHistory = existingState.messages || [];
    } else {
      // Invalid continuation ID - start fresh
      continuationId = generateContinuationId();
    }
  } catch (error) {
    continuationId = generateContinuationId();
  }
} else {
  continuationId = generateContinuationId();
}
```

**Async Consensus Path (line 90 of `src/tools/consensus.js`):**
Same pattern as async chat: `const bgContinuationId = continuation_id || generateContinuationId();`
The streaming execution function (`executeConsensusWithStreaming`, lines 924-935) does the store lookup but does not replace the ID on not-found.

**Store Persistence:** After the provider call returns, the conversation state (message history, provider, model, timestamps) is saved to the store using `continuationStore.set(continuationId, state)`. This is where a custom ID would first appear in the store. The store does not enforce any format on the ID; it only requires it be a non-empty string (line 106 of `continuationStore.js`).

**Response Shape:** Both tools include the continuation ID in the response in two places:
1. A text line `continuation_id: <id>` prepended to the response content.
2. A `continuation` object at the top level of the MCP response: `{ id, provider, model, messageCount }` (chat) or `{ id, messageCount }` (consensus).

**The README already documents custom continuation IDs** (line 128 of README.md): `"continuation_id": "my-analysis-task"  // Optional: custom ID for tracking`. This suggests the feature was intended but the implementation silently replaces unknown IDs with generated ones.

### For New Feature Implementation: What Needs to Connect

The change is narrow: in four code locations (two sync paths, two async paths), when a `continuation_id` is provided but not found in the store, use the provided ID as-is instead of generating a new one. Additionally, metadata should indicate the ID was user-provided.

**Sync chat path** (`src/tools/chat.js` lines 168-171): Remove the `generateContinuationId()` call when `existingState` is null. Keep `continuationId = continuation_id` (which is already set on line 160). Optionally add a flag indicating this is a custom/new custom ID.

**Sync consensus path** (`src/tools/consensus.js` lines 178-181): Same change. Remove the `generateContinuationId()` call when `existingState` is null.

**Error paths in both sync tools** (chat.js line 175, consensus.js line 185): On store error, currently generates a new ID. Should preserve the user-provided ID here too.

**Async paths**: Already mostly correct since they use `continuation_id || generateContinuationId()`. The streaming execution functions (`executeChatWithStreaming` lines 735-748, `executeConsensusWithStreaming` lines 924-935) do not replace IDs on not-found. No change needed in async paths.

**Metadata addition**: The conversation state saved to the store could include a `customId: true` field. The continuation object in the response could also include this. The `conversationState` objects are constructed inline (chat.js lines 396-403, consensus.js lines 561-571), so adding a property there is straightforward.

**Test impact**: The test at `tests/tools/chat.test.js` line 281-295 ("should handle invalid continuation ID gracefully") expects the continuation ID to NOT equal the provided invalid ID. This test will need to be updated since the new behavior preserves the user-provided ID. The test at `tests/integration/tools/continuation-flow.test.js` line 332-345 ("should handle invalid continuation IDs gracefully") similarly asserts `expect(response.continuation.id).not.toBe('invalid-continuation-id')` and expects `messageCount` of 2 (new conversation). This must also be updated.

**Schema description update**: The `continuation_id` field in both tool input schemas (`chat.js` lines 1141-1144, `consensus.js` lines 1695-1699) should note that unrecognized IDs will be used as-is to start a new conversation (rather than being silently replaced).

**`isValidContinuationId` function**: Currently unused. The new feature makes it even less relevant since custom IDs will not follow the `conv_` format. It could be removed or documented as a utility for callers who want to distinguish generated vs custom IDs.

### Technical Reference Details

#### Component Interfaces & Signatures

```javascript
// src/continuationStore.js
export function generateContinuationId(): string
// Returns `conv_${nanoid(10)}` - format: conv_[A-Za-z0-9_-]{10}

export function isValidContinuationId(continuationId: string): boolean
// Validates against nanoid and legacy UUID patterns. UNUSED in src/.

export function addMessageToHistory(state: object, message: object): object
// Imported by chat.js and consensus.js but only used in imports (not called in current code).

// MemoryContinuationStore methods:
async set(continuationId: string, state: object): Promise<void>
// Validates: non-empty string ID, object state. Stores with lastAccessed/createdAt metadata.
// No format validation on the ID itself.

async get(continuationId: string): Promise<object|null>
// Returns null if not found. Returns state with _metadata: { createdAt, lastAccessed }.
```

```javascript
// src/tools/chat.js
export async function chatTool(args, dependencies): Promise<MCPResponse>
// args.continuation_id: string (optional) - user-provided continuation ID
// dependencies.continuationStore: ContinuationStoreInterface

export function mapModelToProvider(model: string, providers: object): string
```

```javascript
// src/tools/consensus.js
export async function consensusTool(args, dependencies): Promise<MCPResponse>
// args.continuation_id: string (optional) - user-provided continuation ID
```

```javascript
// src/tools/index.js
export function createToolResponse(content, isError?, additionalFields?): MCPResponse
// Handles structured objects with continuation/metadata fields.
// Preserves continuation at top level of MCP response.

export function createToolError(message, error?): MCPResponse
```

#### Data Structures

```javascript
// Conversation state shape (stored in Map):
{
  messages: Array<{ role: string, content: string }>,
  provider: string,           // e.g. 'openai'
  model: string,              // e.g. 'auto' or 'gpt-5'
  lastUpdated: number,        // Date.now()
  codexThreadId?: string,     // For Codex provider thread resumption
  // For consensus:
  type?: 'consensus',
  consensusData?: {
    modelsRequested: number,
    providersSuccessful: number,
    providersFailed: number,
    crossFeedbackEnabled: boolean
  },
  // Internal metadata added by store:
  lastAccessed: number,
  createdAt: number
}

// MCP response continuation object:
{
  id: string,                 // The continuation ID
  provider?: string,          // Chat only
  model?: string,             // Chat only
  messageCount: number,       // Non-system messages
  status?: string             // 'processing' for async
}
```

#### Configuration Requirements

No configuration changes needed. The store accepts any non-empty string as an ID.

#### File Locations

**Implementation files to modify:**
- `src/tools/chat.js` - Lines 159-180 (sync path), no change needed for async path (lines 76-77 already preserve custom IDs)
- `src/tools/consensus.js` - Lines 168-190 (sync path), no change needed for async path (line 90 already preserves custom IDs)
- `src/continuationStore.js` - Optional: deprecate/remove `isValidContinuationId` or update docs

**Schema definitions to update:**
- `src/tools/chat.js` - Lines 1141-1144 (continuation_id property description)
- `src/tools/consensus.js` - Lines 1695-1699 (continuation_id property description)

**Tests to update:**
- `tests/tools/chat.test.js` - Line 281-295 ("should handle invalid continuation ID gracefully") - must change assertion from `not.toBe` to `toBe`
- `tests/integration/tools/continuation-flow.test.js` - Line 332-345 ("should handle invalid continuation IDs gracefully") - same assertion change
- `tests/tools/consensus.test.js` - Similar continuation tests around line 620-650

**Test mocks:**
- `tests/mocks/utils/continuationStore.mock.js` - No changes needed (mock already handles get returning null for unknown IDs)

**Documentation:**
- `README.md` - Line 128 already documents custom IDs; may want to expand the description
<!-- DESIGN:END -->

## TODO
<!-- TODO:BEGIN -->
### Imports
- [ ] Import `isValidContinuationId` in `src/tools/chat.js` and `src/tools/consensus.js`
- [ ] Import `isSafeIdSegment` from `src/utils/idValidation.js` in both tool files

### Sync path changes
- [ ] Modify chat sync path (chat.js lines 168-175): remove `generateContinuationId()` when `existingState` is null or on store error — keep user's ID, track whether it's a custom ID via `isValidContinuationId()`
- [ ] Modify consensus sync path (consensus.js lines 178-185): same change as chat

### Async path changes
- [ ] Add `isSafeIdSegment` validation in chat async path (line ~67-77): when `async === true` AND `continuation_id` is provided AND `!isSafeIdSegment(continuation_id)`, return clear validation error
- [ ] Add same validation in consensus async path (line ~80-90)
- [ ] Pass `isCustomId` flag through dependencies to `executeChatWithStreaming` (so completion result can include it)
- [ ] Pass `isCustomId` flag through dependencies to `executeConsensusWithStreaming`

### `custom_id` flag in responses
- [ ] Add `custom_id: true` to chat sync response continuation (line ~448)
- [ ] Add `custom_id: true` to chat async submission continuation (line ~148)
- [ ] Add `custom_id: true` to chat async completion continuation (line ~1100)
- [ ] Add `custom_id: true` to consensus sync JSON content continuation (line ~661)
- [ ] Add `custom_id: true` to consensus sync top-level continuation (line ~690)
- [ ] Add `custom_id: true` to consensus async submission continuation (line ~156)
- [ ] Add `custom_id: true` to consensus async completion continuation (line ~1420)

### Schema descriptions
- [ ] Update `continuation_id` schema description in chat (line 1142-1143) to document custom ID behavior and async character restrictions
- [ ] Update `continuation_id` schema description in consensus (line 1697-1698) to match

### Tests — update existing
- [ ] Update: `tests/tools/chat.test.js` line 281-295 — flip assertion to expect preserved ID, add `custom_id: true` assertion
- [ ] Update: `tests/integration/tools/continuation-flow.test.js` line 332-345 — flip assertion to expect preserved ID
- [ ] Update: `tests/integration/tools/tools-integration.test.js` line 339-353 — update for preserved ID

### Tests — add new
- [ ] Chat: custom ID preserved and `custom_id: true` on first use
- [ ] Chat: custom ID on second use (resume) does NOT have `custom_id`
- [ ] Chat: standard-format ID not found returns that ID without `custom_id`
- [ ] Chat: store error with custom ID preserves ID and sets `custom_id: true`
- [ ] Consensus: custom ID preserved and `custom_id: true` on first use
- [ ] Consensus: custom ID on second use (resume) does NOT have `custom_id`
- [ ] Async: custom ID with unsafe characters returns validation error
- [ ] Async: custom ID with safe characters is accepted and preserved

### Verify
- [ ] Run `pnpm test -- tests/tools/chat.test.js tests/tools/consensus.test.js` to verify
<!-- TODO:END -->

## Notes
<!-- NOTES:BEGIN -->
- The README (line 128) already documents `"continuation_id": "my-analysis-task"` as a custom ID for tracking, but the sync implementation silently replaced it. This task aligns the implementation with the documented behavior.
- `isValidContinuationId()` was previously dead code (exported but never imported). This task gives it a purpose: distinguishing custom IDs from standard-format IDs in the response metadata.
- The async paths already preserve user-provided IDs via `continuation_id || generateContinuationId()` — the core ID preservation needs no change there, but `custom_id` metadata and `isSafeIdSegment` validation do need adding.
- The `custom_id` flag is intentionally only set when the ID format doesn't match standard — a `conv_XXXXXXXXXX` ID that's not found is more likely an expired/stale ID than an intentional custom one.

**Review findings (Codex, 2026-02-22):**
- `check_status` (line 51), `cancel_job`, and `fileCache` (4 locations) enforce `isSafeIdSegment` (`[A-Za-z0-9_-]+` max 128) on IDs used as filesystem paths. Custom IDs in async mode must pass this check or fail downstream. Added requirement #5 for async-mode validation.
- Consensus has TWO continuation objects in sync responses: one inside JSON content (line 661) and one top-level MCP (line 690). Both need `custom_id`.
- Async completion results (chat.js:1100, consensus.js:1420) also need `custom_id` — requires passing `isCustomId` flag through dependencies to streaming functions.
- Review continuation_id: `conv_N8kfuXmPip`

**Related Tasks:**
- None
<!-- NOTES:END -->
