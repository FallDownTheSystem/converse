---
id: task-012-add-conversation-tool-turn-based-round-table
title: Add Conversation Tool (Turn-Based Multi-Model Round-Table)
status: "In Progress"
created_date: '2026-05-31 00:30'
updated_date: '2026-05-31 00:50'
parent: null
subtasks: []
dependencies: []
---

## Description
<!-- DESCRIPTION:BEGIN -->
The Converse MCP Server currently has two multi-model patterns: `chat` (one model, multi-turn) and `consensus` (many models answering the SAME prompt in parallel, optionally cross-critiquing once). This task adds a third tool, `conversation`, that runs a **turn-based round-table**: instead of all models answering simultaneously, the models speak one after another in a caller-specified order, and each model sees the FULL running transcript of everything said before it on its turn.

Concretely: the caller provides an initial prompt and an ordered list of models, e.g. `["codex", "gemini"]`. On turn 1, the first model (codex) is told it is participating in a multi-model round-table with the other named participants, that it speaks in this position, and that its response will be passed on to the next model — then it responds to the prompt. On turn 2 the next model (gemini) receives the initial prompt PLUS codex's response (the full transcript so far) and responds to all of it. This continues down the ordered list; the last model's turn completes one "lap" around the table.

The full result of the lap (every model's turn) is returned to the caller (Claude). The caller then decides whether to keep the conversation going for another lap by passing back the `continuation_id`. Each subsequent call runs another full lap with the same ordered model list, every model again seeing the entire accumulated transcript, and each lap appends to the same stored transcript. The round-table can therefore take as many laps as the caller wants.

This differs from `consensus` in three ways: (1) models respond sequentially, not in parallel; (2) later models in the order see earlier models' responses within the same lap (consensus only shares responses in a single optional cross-feedback round); (3) the caller drives multiple laps via continuation, accumulating a single shared transcript.
<!-- DESCRIPTION:END -->

## Specification
<!-- SPECIFICATION:BEGIN -->
### Requirements

1. **New tool `conversation`**: A new MCP tool registered as `conversation` in `src/tools/index.js`, implemented in `src/tools/conversation.js`, following the functional `async function(args, dependencies) => mcpResponse` contract used by `chat` and `consensus`.

2. **Ordered, sequential turns**: Given `models: ["codex", "gemini", ...]`, the tool calls the models strictly in array order. Model N+1 is only invoked after model N's turn has finished. Model N+1's input includes model N's response from the current lap.

3. **Running transcript visibility**: Each model, on its turn, receives a message array containing: the system prompt, the accumulated prior-lap transcript (from `continuation_id` if resuming), the original lap prompt for this lap, and every preceding turn from the CURRENT lap rendered as labeled prior turns. A model must be able to see and respond to all prior turns.

4. **Round-table system framing**: Each model on its turn is given framing (via a per-turn system/context message) stating: it is participant in a multi-model round-table; the ordered list of all participants; its own position (e.g. "you are model 2 of 3, speaking after codex, before claude"); that prior turns follow; and that its response will be passed to the next participant (or, if last, returned to the user). See Design for the exact prompt construction.

5. **One lap per call**: A single tool invocation runs exactly one full lap (one turn per model in the list, in order). The caller continues the round-table by issuing another call with the returned `continuation_id`.

6. **Continuation = one accumulating transcript**: One `continuation_id` maps to one round-table transcript. On resume, the prior transcript is re-rendered into each model's turn packet so every model sees the full history across all laps. Each completed lap appends its turns to the stored `messages` for that `continuation_id`. Reuse `continuationStore` patterns identically to `consensus` (load on entry, save on completion, skip save on abort). **Model list per lap**: the caller MAY supply a different ordered `models` list on a resuming lap (e.g. to drop a failed participant or add one); the new lap uses the list provided in THAT call. The accumulated transcript is shared regardless of which models ran in earlier laps. Store `modelsOrdered` per lap in `conversationData` so each lap records who participated. (This resolves the apparent tension between "same ordered list each lap" as the common case and the edge-case note that a caller may change models.)

7. **Per-turn failure handling (skip-with-note, continue lap)**: If a model fails on its turn (provider error, not available, invalid spec), record the failure as a turn with an error note, DO NOT abort the lap, and continue to the next model. Subsequent models see a note that the failed model did not contribute (not a fabricated response). This mirrors consensus's "partial failures don't stop other models" philosophy, adapted to the sequential flow. Rationale in Design.

8. **Input schema**: Accept `prompt` (required string), `models` (required string array, min 1, ordered), `continuation_id` (optional string), `files` (optional string array), `images` (optional string array), `temperature` (optional number, default 0.2 matching consensus), `reasoning_effort` (optional enum, default 'medium'), `use_websearch` (optional boolean, default false), `async` (optional boolean, default false), `export` (optional boolean, default false), and a conversation-specific optional `turn_prompt` (optional string) that lets the caller inject a custom per-turn instruction appended to the round-table framing. Required: `['prompt', 'models']`.

9. **File/image context**: Reuse the consensus context-processing flow (`validateAllPaths`, `contextProcessor.processUnifiedContext`, `createFileContext`). Files/images are attached to the lap prompt (the first user message of the lap) so all models in the lap see them, exactly as consensus attaches context to its single user message.

10. **Model resolution**: Reuse the existing `mapModelToProvider` / `resolveAutoModel` / `getDefaultModelForProvider` logic. A single `["auto"]` entry expands to the first available provider's default model (a single-model round-table is valid — it degenerates to sequential self-turns across laps). Multiple explicit models are resolved per-entry as consensus does. Invalid/unavailable models are recorded as failed turns per requirement 7 (they still occupy their position in the order).

11. **Synchronous result format**: Return an MCP response whose content includes: a status line (non-test env) `✅ COMPLETED | CONVERSATION | <id> | <elapsed>s | <succeeded>/<total> turns | <models_list>`, a `continuation_id: <id>` line, and a transcript of the lap with each turn labeled `### <model> (turn <n>):` followed by the response (or an error note for failed turns). Include a top-level `continuation` object `{ id, messageCount, ...(custom_id) }` consistent with consensus. Apply `applyTokenLimit`/`getTokenLimit` to the serialized result as consensus does.

12. **Async/background support**: Support `async: true` using the existing `jobRunner` + `providerStreamNormalizer` + `asyncJobStore` infrastructure, integrating with `check_status` and `cancel_job`. Per-turn progress must be reported via `context.updateJob` (status line shows current turn `N/total`, accumulated transcript, current model). Generate a title up-front (as consensus does) and a final summary on completion via `SummarizationService`.

13. **Custom continuation IDs**: Honor the custom-ID behavior consistent with consensus/chat: preserve a user-provided unrecognized ID, set `custom_id: true` when the ID is non-standard AND not found in the store, and in async mode validate the ID with `isSafeIdSegment()`.

14. **Cancellation**: Honor `signal?.aborted` in the sync path between turns (check before each turn; stop the lap and return a cancellation error if aborted) and inside the async streaming loop (as consensus does), and skip persisting state on abort.

15. **Documentation & registration updates**: Update `docs/API.md` (tool contract), `docs/EXAMPLES.md` (usage examples), `CLAUDE.md` ("Available Tools" list — currently lists four tools), and the help resource/prompt if it enumerates tools.

### Acceptance Criteria

- `conversation` appears in `list_tools` output with the specified input schema and a description distinguishing it from `consensus` (sequential turns vs parallel).
- Calling `conversation` with `prompt` + `models: ["A","B"]` (sync) returns a transcript containing exactly two labeled turns in order A then B, where B's turn was produced AFTER and with visibility of A's response (verifiable via a mock provider that echoes the last user message).
- The returned `continuation_id` can be passed to a second `conversation` call; the second lap's first model receives a message array that contains the first lap's full transcript (A and B turns) before the new lap prompt.
- A model that fails on its turn produces an error-note turn; the lap still runs the remaining models; the response reports `<succeeded>/<total>` correctly and lists the failed model in failure details.
- Stored conversation state under the `continuation_id` accumulates turns across laps (messageCount grows each lap).
- `async: true` returns a continuation_id immediately, runs the lap in the background, and `check_status` for that ID shows per-turn progress and, on completion, the full transcript, title, and final summary.
- `cancel_job` cancels an in-flight async conversation; a sync conversation aborts cleanly when the request signal fires (no partial state persisted).
- Custom continuation IDs behave identically to consensus (preserve, `custom_id: true`, async `isSafeIdSegment` validation).
- `pnpm run lint` and `pnpm run typecheck` pass; new unit tests under `tests/unit/tools/conversation.test.js` pass without real API calls (provider mocks).

### Edge Cases

- **Single-model list** `["codex"]`: valid; one turn per lap. Across laps it becomes a model talking to itself with accumulating context.
- **All models fail in a lap**: lap completes with zero successful turns; response reports `0/N`, lists all failures, still returns/saves the (error-note) transcript and continuation_id so the caller can retry with the same or a changed `models` list (per requirement 6). NOTE: do NOT copy consensus's hard `No valid providers available` early-return (`consensus.js:393`) — for conversation, even `["auto"]` with no available provider, or every model unavailable, must produce failed turns and complete/save the lap. Only reject before the loop when `models` is empty/invalid at the schema level.
- **First model fails, later models succeed**: later models see a note that the first participant did not respond; lap continues.
- **`continuation_id` provided but not found**: start a fresh round-table under that ID (custom-ID rules apply); no prior transcript prepended.
- **Empty/whitespace prompt**: rejected with `createToolError('Prompt is required and must be a string')` (same guard as consensus).
- **Abort mid-lap (sync)**: stop before the next turn, return a cancellation error, do not persist.
- **`async: true` with unsafe custom `continuation_id`**: rejected with the same validation message pattern consensus uses.
- **asyncJobStore tool enum**: `asyncJobStore.create()` currently rejects tools other than `'chat'`/`'consensus'` — `'conversation'` must be added to that allow-list (see Design), or async submission will throw `INVALID_TOOL`.
<!-- SPECIFICATION:END -->

## Design
<!-- DESIGN:BEGIN -->
**Architecture Approach:**

`conversation` is structurally a hybrid of `consensus` (multi-model fan-out, file/image handling, model resolution, async/streaming/summarization, custom-ID handling, token limiting) and `chat` (single sequential provider call producing one assistant message that is appended to history). The core new logic is a **sequential loop over the ordered model list within one lap**, where after each model responds, its turn is appended to an in-lap working message array so the next model sees it.

Build `src/tools/conversation.js` by closely mirroring `src/tools/consensus.js`'s overall skeleton (same imports, same arg validation, same context processing, same custom-ID logic, same async submission wrapper, same token-limiting/result-shaping), and REPLACE consensus's two-phase parallel `Promise.allSettled` core with a sequential `for (const model of models)` lap loop. Each iteration builds a fresh provider-input message array = `[systemPrompt, ...priorTranscriptFromStore, lapPromptUserMessage, ...currentLapTurnsRendered, perTurnFramingMessage]` and calls the provider once via `provider.invoke(messages, options)` (sync) or the streaming path (async).

To avoid duplicating the ~300-line model-resolution + mapping helpers, **extract the shared model-routing helpers** (`mapModelToProvider`, `resolveAutoModel`, `getDefaultModelForProvider`) — they are currently duplicated between `chat.js` and `consensus.js`. Preferred: import the already-exported `mapModelToProvider` from `chat.js` (it is `export`ed) and move `resolveAutoModel`/`getDefaultModelForProvider` into a small shared module `src/utils/modelRouting.js`, then have conversation import from there. Fallback if extraction risks scope creep: copy the three helpers into `conversation.js` verbatim (consensus already duplicates them, so a third copy is consistent with the current codebase, just not ideal). The implementer should attempt the extraction but must not refactor consensus/chat call sites beyond swapping the import if it threatens the atomic scope — flag to the orchestrator if extraction balloons.

**Transcript construction (the heart of the tool):**

> CRITICAL provider constraint (verified, codex review 2026-05-31): the SDK providers most likely to be round-table participants — Codex (`src/providers/codex.js:123`), Claude SDK (`src/providers/claude.js:113`), and Copilot (`src/providers/copilot.js:399`) — all reduce the message array to ONLY the LAST `user` message (`messages.filter(m => m.role === 'user').pop()`). They ignore system messages, assistant messages, and all earlier user messages. Therefore the per-turn provider input MUST pack the entire turn context (prior-lap transcript + lap prompt + same-lap turns + framing) into a SINGLE final `user` message. A design that spreads context across multiple messages would be invisible to exactly these providers.

The provider message array for the model at position `i` (0-based) in a lap is therefore:

1. `{ role: 'system', content: CONVERSATION_PROMPT }` — included for API-style providers (openai/anthropic/google/etc.) that DO honor system + history. SDK providers ignore it; that's fine because the framing in the final user message restates the role.
2. A single final `{ role: 'user', content: <turnPacket> }` — the self-contained "turn packet" (string, or, when files/images are present, a content array `[...contextParts, { type:'text', text: turnPacketText }]` so multimodal providers attach files to THIS message). The packet text is composed in this order:
   - `priorTranscriptText` — the accumulated history from prior laps, re-rendered as labeled context (see persistence note below). Empty on a new conversation.
   - `lapPromptText` — `Original topic for this round:\n<prompt>`.
   - `sameLapTurnsText` — for each model `0..i-1` that already spoke THIS lap: `### <model> said:\n<response>` or `### <model> did not respond (error: <short>)`. Omitted for the opener (i=0).
   - `framingText` — the round-table framing for THIS model (participant name, ordered list, position i+1 of N, prev/next, instruction, optional `turn_prompt`).

   For API-style providers the system prompt + (optionally) prior history could ALSO be supplied as separate messages, but because the packet already self-describes everything, the single-final-user-message form is used uniformly for ALL providers. This guarantees identical visibility regardless of provider type and sidesteps the multi-distinct-`assistant`-voice problem entirely (no same-lap turn is ever emitted as an `assistant` message to a provider).

After the provider returns, store the turn in a `lapTurns` array: `{ model, provider, status: 'success'|'failed', response|error, position: i }`.

**Persistence vs. provider-input (kept separate):**
- PERSISTED stored state mirrors consensus: `continuationStore.set` stores `messages = [{system:CONVERSATION_PROMPT}, lapPromptUserMessage, {role:'assistant', content: formatLapTranscript(lapTurns)}]` for lap 1, with each subsequent lap appending another `(user lapPrompt, assistant lapTranscript)` pair. This keeps `messageCount` semantics and export/turn-extraction working (the exporter pairs user→assistant turns).
- PROVIDER-INPUT does NOT pass that stored `assistant` history raw to the next lap's providers. Instead, on resume, the stored prior laps are RE-RENDERED into `priorTranscriptText` (labeled `## Earlier in this round-table (lap N):` blocks) and embedded in the next turn packet's leading section. This prevents a provider from mistaking prior multi-speaker transcript for its own previous output, and ensures last-user-only SDK providers still see the history. A helper `renderStoredTranscriptToText(storedMessages)` extracts the user/assistant pairs from stored state and produces this labeled text.

**Per-turn framing prompt (built in code, not a static constant):**

```
You are participant "<model>" in a multi-model round-table conversation.
Participants, in speaking order: <model1>, <model2>, ... .
You are speaking in position <i+1> of <N>, after <prevModel or "no one (you open the round)">, before <nextModel or "no one (you close this round)">.
The original topic/prompt for this round is shown above, followed by any responses already given this round.
Respond to the whole conversation so far — build on, challenge, or refine what others have said; do not merely repeat them.
Your response will be passed to the next participant (<nextModel>), or returned to the user if you are last.
<turn_prompt if provided>
```

**New system prompt `CONVERSATION_PROMPT`** in `src/systemPrompts.js` — model it on `CONSENSUS_PROMPT` but reframed for sequential dialogue (collaborative round-table, see prior turns, advance the discussion, keep the CRITICAL LINE NUMBER + IF MORE INFORMATION NEEDED blocks for parity). Do NOT mandate the rigid `## Approach / ## Why This Works / ...` consensus structure — conversation responses should read as dialogue turns.

**Failure handling decision (skip-with-note, continue lap):**
Consensus uses `Promise.allSettled` so one model failing never blocks others, and reports `<success>/<total>` with failure details. The sequential analog is: wrap each turn's provider call in try/catch; on failure push a `{ status: 'failed', error }` turn, render it to later models as `### <model> did not respond (error: <short>)`, and continue. This is chosen over aborting the lap because (a) it matches consensus's partial-failure philosophy, (b) a round-table is still useful if one participant drops, and (c) aborting would waste already-completed turns and complicate continuation. Pre-resolution failures (unknown/unavailable model) are likewise recorded as failed turns occupying their position, so ordering/visibility framing stays correct.

**Async path:**
Mirror `executeConsensusWithStreaming` but sequential. Create a `executeConversationWithStreaming(args, deps, context)` that: loads prior transcript, processes context, then loops models in order calling a per-turn streaming helper (adapt `executeConsensusPhaseWithStreaming` to run ONE provider at a time, updating `context.updateJob` with `conversation_progress: "<n>/<total>"`, `accumulated_content` = running formatted transcript, current turn status). Use the same `provider.stream()` vs `invoke({stream:true})` detection consensus uses. Generate title up-front (passed from submission) and final summary at the end.

> CRITICAL async-status constraint (verified, codex review 2026-05-31): `src/utils/formatStatus.js:293` only renders a COMPLETED job's output when `jobStatus.result.content` is a truthy string. Consensus's async result has no `content` field, so its completed status relies on `accumulated_content` during streaming — but the final `check_status` view needs `result.content` to show the transcript. Therefore the conversation async result object MUST include a top-level `content: formatLapTranscript(lapTurns)` (the full rendered lap transcript), in addition to the structured fields. Without it, `check_status` shows the status line but an empty body on completion.

Return a result object: `{ status:'conversation_complete', content: formatLapTranscript(lapTurns), models_consulted, successful_turns, failed_turns, turns: lapTurns, continuation:{ id, messageCount, ...custom_id }, settings:{ temperature, models_requested:models }, metadata:{ execution_time, async_execution, successful_models, total_models, failure_details, title, final_summary } }`.

**asyncJobStore tool allow-list:**
`src/async/asyncJobStore.js` `create()` (line ~170) validates `['chat','consensus'].includes(tool)`. Add `'conversation'`. Also confirm no other place hard-codes the two-tool list (the `getTools` filter in `tools/index.js` strips `async` from chat/consensus schemas when async is disabled — add `conversation` to that branch so its `async` param is also stripped when `DISABLE_ASYNC_TOOLS` is set).

**Key Files:**
- `src/tools/conversation.js` — NEW. The tool implementation: sync lap loop, async submission + `executeConversationWithStreaming`, per-turn streaming helper, transcript/framing builders, result formatting. Mirrors `consensus.js` structure.
- `src/systemPrompts.js` — ADD `CONVERSATION_PROMPT` export (model on `CONSENSUS_PROMPT`, reframed for sequential dialogue).
- `src/tools/index.js` — REGISTER `conversation: conversationTool` in the `tools` map (line ~19-24); EXTEND the `DISABLE_ASYNC_TOOLS` filter branch (line ~49) to also strip `async` from `conversation`'s schema.
- `src/async/asyncJobStore.js` — EXTEND `create()` tool allow-list (line ~170) to include `'conversation'`.
- `src/utils/modelRouting.js` — NEW (preferred extraction). Houses `mapModelToProvider`, `resolveAutoModel`, `getDefaultModelForProvider` shared by chat/consensus/conversation. If extraction is deferred, conversation copies the three helpers locally and this file is not created (note in Notes). DECISION (per codex review): do NOT import these from `chat.js` — that drags tool-level dependencies and risks circular imports. Either create the pure `modelRouting.js` module, or copy the helpers locally into `conversation.js`. Importing from another TOOL file is disallowed.
- `docs/API.md` — ADD `conversation` tool contract section.
- `docs/EXAMPLES.md` — ADD round-table usage examples.
- `CLAUDE.md` — UPDATE "Available Tools" (four → five tools) with a `conversation` entry.
- `src/utils/formatStatus.js` — ADD a small `conversation` branch (verified needed): in the human-readable status builder near line ~260-310, handle `conversation_progress`/`models_list` in the in-progress view, and ensure the completed view renders `result.content` (which conversation now supplies). The completed-job `if (jobStatus.result.content)` block at line ~293 already prints content once the async result includes `content`; the only NEW work is an optional in-progress progress line for conversation. Confirm no consensus regressions.
- `src/resources/helpResource.js` / `src/prompts/helpPrompt.js` — UPDATE if they enumerate tools (verify during implementation).
- `tests/tools/conversation.test.js` — NEW (path corrected: existing tool tests live under `tests/tools/`, run via `pnpm run test:tools`, NOT `tests/unit/tools/`). Unit tests with provider mocks (no real API), covering ordering/visibility, failure-skip, continuation accumulation, custom-ID, schema, sync result shape. (Async/streaming covered by lighter unit tests or noted as integration-only to avoid real calls.)
- `src/providers/codex.js`, `src/providers/claude.js`, `src/providers/copilot.js` — READ-ONLY reference (not modified). Confirm the last-user-message-only behavior that drives the single-turn-packet design; no changes here.

**Patterns to Follow:**
- Arg validation guards copied from consensus (`!args.prompt`, `!args.models` array check).
- Context processing block copied verbatim from consensus (validateAllPaths → processUnifiedContext → createFileContext → attach to lap user message).
- Custom-ID logic copied from consensus/chat (task-011 pattern): `isValidContinuationId`, `isSafeIdSegment`, `custom_id` flag in all continuation objects (sync content, sync top-level, async submission, async completion).
- Async submission wrapper copied from consensus (`jobRunner.submit({ tool: 'conversation', sessionId: bgContinuationId, options: {...args, jobId, models_list, title} }, runFn)`), status line `⏳ SUBMITTED | CONVERSATION | ...`.
- Result token-limiting via `applyTokenLimit`/`getTokenLimit`; failure details via `formatFailureDetails` from `tools/index.js`.
- State save: load on entry (`continuationStore.get`), save on completion (`continuationStore.set`) with `type: 'conversation'`, skip save when `signal?.aborted`.
- `exportConversation` call when `export: true`, passing `models` and the conversation state (the exporter already handles `models` metadata and turn extraction; conversation's stored user/assistant turn pairs will export cleanly).

**Dependencies:**
- None new. Reuses `nanoid` (via continuationStore), `SummarizationService`, `jobRunner`, `asyncJobStore`, `providerStreamNormalizer`, `contextProcessor`, `tokenLimiter`, `fileValidator`, `conversationExporter`, `idValidation`. All already imported by consensus.
- Conceptually related to task-011 (custom continuation IDs) — conversation must implement the same `custom_id` behavior. Task-011's continuation handling is the reference.

**Context Manifest:**

### How the sibling tools work (verified from source)

**consensus.js** (`consensusTool(args, dependencies)`):
- Destructures deps: `config, providers, continuationStore, contextProcessor, jobRunner, providerStreamNormalizer, signal`.
- Validates `prompt` (string) and `models` (non-empty array). Extracts `prompt, models, files=[], images=[], continuation_id, enable_cross_feedback=true, cross_feedback_prompt, temperature=0.2, reasoning_effort='medium', use_websearch=false, async=false, export=false`.
- `async` branch: validates jobRunner/normalizer present; validates custom ID via `isSafeIdSegment`; `bgContinuationId = continuation_id || generateContinuationId()`; computes `isCustomId` via `isValidContinuationId` + store check; generates `title` via `SummarizationService.generateTitle`; `jobRunner.submit({tool:'consensus', sessionId:bgContinuationId, options:{...args, jobId:bgContinuationId, models_list, title}}, async (context)=>executeConsensusWithStreaming(args,{...deps,continuationId:bgContinuationId,isCustomId,title},context))`; returns a `⏳ SUBMITTED | CONSENSUS | ...` status line + `continuation_id` + `continuation:{id,status:'processing',...custom_id}` and `async_execution:true`.
- Sync path: loads history (`continuationStore.get`), else generates ID; on not-found/error sets `isCustomId = !isValidContinuationId(...)` (task-011 behavior). Validates files via `validateAllPaths({files,images},{clientCwd})`. Processes context via `contextProcessor.processUnifiedContext(request,{enforceSecurityCheck:false,skipSecurityCheck:true,clientCwd})` → `createFileContext(allProcessedFiles,{includeMetadata:true,includeErrors:true})`. Builds `messages = [{role:'system',content:CONSENSUS_PROMPT}, ...conversationHistory, userMessage]` where `userMessage.content` is the prompt string OR `[...contextMessage.content, {type:'text',text:prompt}]`.
- Resolves models: `["auto"]`→first 3 available providers' defaults; per-model `mapModelToProvider` + `resolveAutoModel`; unavailable/unknown → `failedModels` list. Builds `providerCalls[]` with `{model, provider, providerInstance, options:{temperature,reasoning_effort,use_websearch,signal,config,model:resolvedModelName}}`.
- Phase 1: `Promise.allSettled(providerCalls.map(call => call.providerInstance.invoke(messages, call.options)))`. Phase 2 (cross-feedback): per-model rebuilds `[...messages, {assistant: initialResponse}, {user: feedbackPrompt}]` and invokes again. (Conversation replaces this whole two-phase block with one sequential loop.)
- Saves state: `continuationState = { messages: [...messages, consensusMessage], type:'consensus', lastUpdated, consensusData:{...} }` where `consensusMessage` is ONE assistant message with the full formatted `## Initial Responses ... ## Refined Responses ...` text. `continuationStore.set(continuationId, state)`. Skipped if `signal?.aborted`.
- Result: builds `result` object, `JSON.stringify`, `applyTokenLimit(resultStr, getTokenLimit(config))`, prepends status line + `continuation_id:` line, appends `formatFailureDetails`. Returns `createToolResponse({content, continuation:{id,messageCount,...custom_id}})`.
- `executeConsensusWithStreaming(args, deps, context)`: same setup, then `executeConsensusPhaseWithStreaming(providerCalls, messages, 'initial', context, normalizer)` which per provider tries `providerInstance.stream(...)` else `invoke({...,stream:true})`, normalizes via `streamNormalizer.normalize(provider, stream, {provider,model,requestId})`, loops events (`delta`→accumulate + `context.updateJob({provider_i_preview, accumulated_content})`, `usage`, `end`, `error`), updates `consensus_progress` and per-provider status. Returns result object with `metadata{execution_time, async_execution, successful_models, total_models, failure_details, title, final_summary}`.

**chat.js** single-call reference: builds `messages=[system?, ...history, userMessage]`, calls `selectedProvider.invoke(messages, providerOptions)` (with `retryWithBackoff` + auto failover), appends `{role:'assistant',content:response.content}` to history, saves `{messages, provider, model, lastUpdated, codexThreadId}`. Async via `executeChatWithStreaming` with full streaming event loop and `context.updateJob({accumulated_content, progress})`. Conversation's per-turn call is essentially chat's single-call pattern, looped.

**continuationStore.js**: `get(id)→state|null` (returns `{...state,_metadata}`), `set(id,state)` (trims to last 100 messages), `generateContinuationId()→conv_<nanoid10>`, `isValidContinuationId(id)` (conv_ nanoid or legacy UUID). Store accepts any non-empty string ID (custom IDs work).

**asyncJobStore.js**: `create(tool, options)` REQUIRES `tool ∈ {'chat','consensus'}` (line ~170) and `options.jobId`. Must add `'conversation'`. Job state has `accumulated_content, title, final_summary` fields and `update()` applies arbitrary non-reserved keys (so `conversation_progress`, per-turn fields land as direct props). `getAllJobs`, `complete`, `fail` are tool-agnostic.

**jobRunner.js**: `submit(jobSpec, runFunction, options)` creates job (passing `jobSpec.tool` to `asyncJobStore.create`), runs `runFunction(context)` in background with `context = {jobId, tool, signal, updateJob, emitEvent}`. On completion writes FileCache snapshot using `finalJobState.tool` (tool-agnostic). Cancellation via abortController.

**checkStatus.js / cancelJob.js**: tool-agnostic; key by `continuation_id` via asyncJobStore then fileCache. `isSafeIdSegment` enforced on the ID. Conversation async jobs work with these unchanged, PROVIDED the job was created (hence the asyncJobStore enum fix). `formatStatus.js` formatters are used by checkStatus — verify they render the conversation result's `phases`/`turns` shape (they read generic fields like `accumulated_content`, `title`, `final_summary`; conversation should populate those so status display works without formatter changes; if a turns-specific view is desired, that is out of scope — generic display is acceptable).

**router.js / index.js**: tools auto-registered from `getTools()`; `list_tools` reads `handler.description`/`handler.inputSchema`. No router change needed beyond registering the tool in `tools/index.js`. Tool is invoked as `tool(toolArgs, {...dependencies, signal})` — conversation receives `signal` for cancellation.

### Why a single self-contained turn packet (final user message)
Two reasons, the first decisive:
1. **Last-user-only SDK providers (verified).** `codex.js:123`, `claude.js:113`, `copilot.js:399` reduce the message array to the last `user` message and ignore everything else. Any context placed in the system message, assistant messages, or earlier user messages is invisible to them. Since these are the primary round-table participants, ALL turn context (prior-lap history, lap prompt, same-lap turns, framing) must be packed into ONE final user message.
2. **Speaker-attribution.** Providers attribute `assistant`-role messages to themselves. Rendering another participant's turn as `assistant` would make the current model think it already said that. Embedding same-lap turns as labeled text inside the (user) packet avoids this entirely — no participant's turn is ever sent as an `assistant` message during provider input.

PERSISTED state still collapses each lap into one `assistant` message (matching consensus's `[...messages, oneAssistantMessage]` shape) for storage/export simplicity, but that stored assistant text is RE-RENDERED into labeled user-packet text (`renderStoredTranscriptToText`) on resume rather than replayed as raw assistant history.
<!-- DESIGN:END -->

## TODO
<!-- TODO:BEGIN -->
### Scaffolding & shared helpers
- [ ] Create `src/utils/modelRouting.js` exporting `mapModelToProvider(model, providers)`, `resolveAutoModel(model, providerName)`, `getDefaultModelForProvider(providerName)` by moving the implementations currently in `consensus.js` (lines ~738-914) verbatim. Keep `chat.js`'s exported `mapModelToProvider` working — re-export from `modelRouting.js` or leave chat's as-is and import the shared one only in conversation. Do NOT import routing helpers from `chat.js` (avoids tool-level deps / circular imports). If this extraction expands beyond a clean move, STOP and instead copy the three helpers into `conversation.js` (note the decision in Notes).
- [ ] Add `CONVERSATION_PROMPT` export to `src/systemPrompts.js`, modeled on `CONSENSUS_PROMPT`: keep the CRITICAL LINE NUMBER and IF MORE INFORMATION NEEDED blocks; reframe the intro for a collaborative sequential round-table (see Design framing prompt); do NOT include the rigid `## Approach/## Why This Works` mandatory structure.

### conversation.js — sync path
- [ ] Create `src/tools/conversation.js` with `conversationTool(args, dependencies)`; import the same modules consensus imports plus `CONVERSATION_PROMPT` and the model-routing helpers.
- [ ] Validate `args.prompt` (string) and `args.models` (non-empty array) with the same error messages consensus uses.
- [ ] Destructure args: `prompt, models, files=[], images=[], continuation_id, temperature=0.2, reasoning_effort='medium', use_websearch=false, async=false, export:shouldExport=false, turn_prompt`.
- [ ] Implement sync continuation load: `continuationStore.get` → prior `conversationHistory`; on not-found/error apply task-011 custom-ID logic (`isCustomId = !isValidContinuationId(continuationId)`); else `generateContinuationId()`.
- [ ] Process files/images via `validateAllPaths` + `contextProcessor.processUnifiedContext` + `createFileContext` (copy consensus block); build `lapUserMessage` (prompt string or `[...contextParts,{type:'text',text:prompt}]`).
- [ ] Strip any leading system message from loaded `conversationHistory` so the system prompt is not double-stacked; keep the rest as `priorTranscript`.
- [ ] Resolve models into ordered `turnPlan[]` entries `{model, provider, providerInstance|null, resolvedModel, preFailReason|null}` using `mapModelToProvider`/`resolveAutoModel`; handle `["auto"]` → single default model; record unknown/unavailable as `preFailReason` (do NOT drop — they keep their position). Do NOT early-return on "no valid providers" (unlike consensus.js:393) — an all-unavailable lap must still run and save with all-failed turns.
- [ ] Implement `renderStoredTranscriptToText(storedMessages)` → extracts user/assistant pairs from prior stored state and returns labeled text (`## Earlier in this round-table (lap N):\n<prompt>\n<assistant lap transcript>` blocks); returns `''` for a new conversation. This is the resume history embedded in each turn packet (NOT passed as raw assistant messages).
- [ ] Implement `buildTurnPacket({ priorTranscriptText, prompt, sameLapTurns, i, models, turn_prompt })` → returns the single self-contained packet TEXT in order: prior-transcript section, `Original topic for this round:\n<prompt>`, same-lap turns (`### <model> said:\n<resp>` or `### <model> did not respond (error: ...)`, omitted when i=0), then the framing (participant name, ordered list, position i+1 of N, prev/next, instruction, optional `turn_prompt`). This packet is the LAST user message — the only thing last-user-only SDK providers (codex/claude/copilot) will see.
- [ ] Implement the sequential lap loop: for each `turnPlan[i]`, if `signal?.aborted` return `createToolError('Conversation request cancelled')`; if `preFailReason` push a failed turn and continue; else build `packetText = buildTurnPacket(...)`, build the final user message content (string, or `[...contextParts, {type:'text', text: packetText}]` when files/images present), build messages `[{role:'system', content:CONVERSATION_PROMPT}, {role:'user', content: finalUserContent}]`, call `providerInstance.invoke(messages, options)`, push `{model, provider, status:'success', response}`; on throw push `{status:'failed', error:msg}` and continue. NOTE: same-lap turns and prior history live INSIDE the final user message — never as separate assistant/user messages — so all provider types see identical context.
- [ ] Build the persisted assistant message: one `{role:'assistant', content: formatLapTranscript(lapTurns)}` where `formatLapTranscript` renders `### <model> (turn n):\n<response or error note>` blocks plus a trailing `**Summary:** Conversation lap completed with X/Y successful turns.`
- [ ] Save state when not aborted: `continuationStore.set(continuationId, { messages:[...priorTranscript-with-system-restored?, lapUserMessage, assistantMessage], type:'conversation', lastUpdated:Date.now(), conversationData:{ modelsOrdered:models, turnsSuccessful, turnsFailed } })`. (Persist a single system message at index 0 once, then accumulating user/assistant pairs — match consensus's `[...messages, consensusMessage]` shape: build `messages` array exactly like consensus does for storage.)
- [ ] If `shouldExport`, call `exportConversation(conversationState, { clientCwd, continuation_id, models, temperature, reasoning_effort, use_websearch, files, images })`.
- [ ] Build sync result: status line `✅ COMPLETED | CONVERSATION | <id> | <elapsed>s elapsed | <succeeded>/<total> turns | <models_list>` (skip in test env), `continuation_id:` line, then `result` object `{ status:'conversation_complete', models_consulted, successful_turns, failed_turns, turns:lapTurns, continuation:{id,messageCount,...custom_id}, settings:{temperature, models_requested:models} }`; `applyTokenLimit`; append `formatFailureDetails(failureDetails)`; return `createToolResponse({content, continuation:{id,messageCount,...custom_id}})`.

### conversation.js — async path
- [ ] Add the `async` branch mirroring consensus: validate jobRunner/normalizer; `isSafeIdSegment` validation for custom IDs; `bgContinuationId = continuation_id || generateContinuationId()`; compute `isCustomId`; generate `title`; `jobRunner.submit({tool:'conversation', sessionId:bgContinuationId, options:{...args, jobId:bgContinuationId, models_list, title}}, async(context)=>executeConversationWithStreaming(args,{...deps,continuationId:bgContinuationId,isCustomId,title},context))`; return `⏳ SUBMITTED | CONVERSATION | <id> | 1/1 | Started: <time> | "<title>" | <models_list>` + `continuation_id` line + `continuation:{id,status:'processing',...custom_id}` + `async_execution:true`.
- [ ] Implement `executeConversationWithStreaming(args, deps, context)`: load prior transcript, process context, resolve `turnPlan`, generate/use `title`, then loop turns sequentially calling a per-turn streaming helper; after each turn `context.updateJob({ conversation_progress:'<n>/<total>', accumulated_content: runningFormattedTranscript, title, progress:{ phase:'conversation', total_turns, completed_turns:n, current_model } })`; on completion generate `final_summary` via `SummarizationService.generateFinalSummary(combinedResponses)`, save state, optional export; return result object that INCLUDES `content: formatLapTranscript(lapTurns)` at top level (REQUIRED — `formatStatus.js:293` only renders completed output from `result.content`), plus `metadata{execution_time, async_execution, successful_models, total_models, failure_details, title, final_summary}` and `continuation:{id,messageCount,...custom_id}`.
- [ ] Implement the per-turn streaming helper (adapt `executeConsensusPhaseWithStreaming` to a single provider per call): try `providerInstance.stream(messages,options)` else `invoke({...options,stream:true})`; if async-iterable normalize via `providerStreamNormalizer.normalize(provider, stream, {provider, model, requestId:`${context.jobId}-turn-${i}`})` and accumulate `delta`/`end`/`usage`/`error`; else use the plain response; check `context.signal.aborted` before and during; return `{model, provider, status, response|error}`.

### Registration & infra
- [ ] Register `conversation: conversationTool` in the `tools` map in `src/tools/index.js`.
- [ ] In `src/tools/index.js` `getTools` disable-async branch, add `conversation` to the set whose schema has `async` stripped (alongside `chat`/`consensus`).
- [ ] In `src/async/asyncJobStore.js` `create()`, change the tool allow-list from `['chat','consensus']` to `['chat','consensus','conversation']` and update the error message string accordingly.
- [ ] In `src/utils/formatStatus.js` (human-readable status builder, ~line 260-310): add an in-progress branch that surfaces `conversation_progress` and `models_list` for conversation jobs (mirror how consensus progress is shown); verify the completed-job block at ~line 293 renders `result.content` (now supplied by the async result). Do not regress consensus/chat formatting.

### Schema & metadata
- [ ] Set `conversationTool.description` distinguishing it from consensus: e.g. `TURN-BASED ROUND-TABLE - Models respond SEQUENTIALLY in the order given; each model sees the full running transcript and builds on prior turns. One call = one lap; pass continuation_id for more laps. Contrast with consensus (parallel, same prompt). Use the "files" parameter to share code.`
- [ ] Define `conversationTool.inputSchema` with properties `models` (array,minItems:1, ordered — note order matters in description), `prompt` (required), `continuation_id`, `files`, `images`, `temperature`(default 0.2), `reasoning_effort`(enum, default 'medium'), `use_websearch`(default false), `async`(default false), `export`(default false), `turn_prompt`(string, optional — custom per-turn instruction); `required:['prompt','models']`. Copy field descriptions from consensus where shared; write new descriptions for `models` (emphasize ORDER) and `turn_prompt`.

### Documentation
- [ ] Add a `conversation` tool section to `docs/API.md` (parameters table + sync/async examples + transcript output shape) following the consensus section's structure.
- [ ] Add round-table examples to `docs/EXAMPLES.md` (basic 2-model lap, multi-lap via continuation_id, async + check_status).
- [ ] Update `CLAUDE.md` "Available Tools" list: change "four main tools" to five and add a `conversation` entry describing turn-based round-table behavior and one example request block.
- [ ] Check `src/resources/helpResource.js` and `src/prompts/helpPrompt.js` for a hard-coded tool enumeration; add `conversation` if present (skip if they read from `getTools()` dynamically).

### Tests (unit, no real API calls)
- [ ] Create `tests/tools/conversation.test.js` (path: `tests/tools/`, run via `pnpm run test:tools`) using provider mocks (follow existing `tests/tools/*.test.js` patterns; mock providers whose `invoke` echoes/labels the last user message so visibility is assertable).
- [ ] Test: 2-model sync lap returns two turns in order A then B; B's invoked final user message (the packet) contains A's response text (assert the mock recorded the last user message) — proves ordering + visibility through the single-packet design that last-user-only providers rely on.
- [ ] Test: continuation — second call with returned `continuation_id` passes the first lap's transcript into the second lap's first-model `messages`; stored `messageCount` grows across laps.
- [ ] Test: a model throwing on its turn yields a failed turn note, the lap continues to the next model, and result reports correct `<succeeded>/<total>` with the failed model in failure details.
- [ ] Test: unknown/unavailable model is recorded as a failed turn occupying its position (later models still run and see the gap note).
- [ ] Test: custom `continuation_id` (non-standard, not in store) preserved with `custom_id:true`; resume of same ID has no `custom_id`.
- [ ] Test: input schema present, `required:['prompt','models']`, description distinguishes from consensus; tool registered in `getTools()`.
- [ ] Test: empty prompt → `createToolError`; aborted `signal` before a turn → cancellation error and no `continuationStore.set` call (assert mock not called).

- [ ] Test: async result object includes a top-level `content` string (the rendered lap transcript) so `check_status` shows the transcript on completion (guards the `formatStatus.js:293` requirement).
- [ ] Test: a resuming lap may supply a different `models` list; the new lap runs that list and the stored transcript still includes the earlier lap's turns (continuation transcript is shared, per-lap `modelsOrdered` recorded).

### Verify
- [ ] Run `pnpm test -- tests/tools/conversation.test.js` and confirm pass.
- [ ] Run `pnpm run lint` and `pnpm run typecheck`; fix issues with `npx eslint --fix` (NOT prettier).
<!-- TODO:END -->

## Notes
<!-- NOTES:BEGIN -->
### Key design decisions
- **One lap per call, caller-driven laps via continuation_id** — matches the orchestrator brief and reuses the consensus continuation pattern (one ID = one accumulating transcript).
- **Skip-with-note on per-turn failure (don't abort lap)** — chosen to match consensus's `Promise.allSettled` partial-failure philosophy, adapted to sequential flow. Failed/unavailable models still occupy their position so framing/visibility stays correct.
- **Single self-contained turn packet as the final user message** — forced by last-user-only SDK providers (codex/claude/copilot, verified) and also solves speaker-attribution. Prior-lap history is re-rendered into the packet on resume, not replayed as raw assistant messages. (See "Why a single self-contained turn packet" above.)
- **Caller may change `models` per resuming lap** — the shared transcript persists across laps regardless; `modelsOrdered` recorded per lap.
- **No `enable_cross_feedback` parameter** — conversation's sequential visibility IS the feedback mechanism; the consensus cross-feedback knob is intentionally omitted. `turn_prompt` is the conversation-specific knob instead.
- **Async result must carry top-level `content`** — `formatStatus.js:293` renders completed async output only from `result.content`; conversation supplies it so `check_status` shows the final transcript.
- **All-fail laps still complete and save** — do NOT copy consensus's `No valid providers` early return (`consensus.js:393`).
- **Reuse, don't fork, infra** — context processing, custom-ID handling, async submission, token limiting, summarization, export are copied/shared from consensus to keep behavior consistent.

### Codex review (2026-05-31, continuation_id conv_mIzSMO94Sn) — incorporated
All applied findings were verified against the real code before applying:
- **[HIGH, applied]** SDK providers read only the last user message (`codex.js:123`/`claude.js:113`/`copilot.js:399`) — redesigned provider input to a single self-contained turn packet. (Was the plan's biggest latent bug.)
- **[HIGH, applied]** `formatStatus.js:293` needs `result.content` for completed async display — async result now includes top-level `content`; added a formatStatus conversation branch.
- **[MED, applied]** Continuation model-list semantics — clarified: caller may change `models` per lap; record `modelsOrdered` per lap.
- **[MED, applied]** Prior stored history re-rendered as labeled user text, not raw assistant replay.
- **[MED, applied]** All-fail / `["auto"]`-with-no-provider must complete the lap — do not copy consensus's `No valid providers` early return.
- **[LOW, applied]** Test path corrected to `tests/tools/conversation.test.js` (`pnpm run test:tools`).
- **[LOW, applied]** Don't import routing helpers from `chat.js`; use a pure `modelRouting.js` or local copy.
- Codex confirmed the turn-based approach is feasible and skip-with-note failure handling is the right consensus analogue. No scope expansion was introduced.

### Implementation outcome (2026-05-31)
- **modelRouting decision**: Extracted `mapModelToProvider`/`resolveAutoModel`/`getDefaultModelForProvider` into a new pure module `src/utils/modelRouting.js`. ONLY `conversation.js` imports from it; `chat.js`/`consensus.js` keep their existing local copies (call sites untouched) to keep the diff focused and avoid circular-import risk. This is the plan's preferred-but-bounded path.
- **Files created**: `src/tools/conversation.js`, `src/utils/modelRouting.js`, `tests/tools/conversation.test.js`.
- **Files modified**: `src/systemPrompts.js` (CONVERSATION_PROMPT), `src/tools/index.js` (register + async-strip branch), `src/async/asyncJobStore.js` (allow-list), `src/utils/formatStatus.js` (conversation in-progress branch + conversation_progress passthrough), `docs/API.md`, `docs/EXAMPLES.md`, `CLAUDE.md` (four→five tools).
- **helpResource.js / helpPrompt.js**: no change needed — they enumerate tools dynamically from `getTools()`.
- **Verification**: `pnpm run lint` clean on changed files; `pnpm run typecheck` passes; `pnpm run test:tools` = 202 passed | 4 skipped (12 files, includes 25 new conversation tests), no regressions.
- **Codex review (conv_ERwjSeFqsD)**: Both non-negotiables confirmed honored. Findings applied (all verified against the real code first):
  - **H1 (fixed)**: async cancellation during a turn was demoted to a failed turn instead of aborting the lap — `executeTurnWithStreaming` now rethrows abort/AbortError so it propagates to the job runner and the save block is skipped.
  - **H2 (fixed)**: sync response omitted the labeled lap transcript required by requirement 11 — the sync result object now carries top-level `content: formatLapTranscript(lapTurns)`, symmetric with the async result.
  - **MED whitespace prompt (fixed)**: prompt guard now also rejects whitespace-only strings (`!args.prompt.trim()`).
  - **MED async progress object (fixed)**: `context.updateJob` no longer passes an object as the reserved `progress` key (asyncJobStore treats it as a numeric 0..1, which an object corrupts to NaN). Now passes numeric `progress: (i+1)/total` plus flat keys (`conversation_phase`, `total_turns`, `completed_turns`, `current_model`). NOTE: `consensus.js` has the identical object-progress pattern; left untouched as out-of-scope and flagged to the orchestrator.
  - **MED modelsOrdered per-lap (no change)**: `conversationData.modelsOrdered` already stores the current lap's list, which satisfies requirement 6; the transcript is the designated shared record. Codex's concern was a misread.
  - Also fixed two of my own issues found while applying the above: a new async test wrongly asserted `submitResult.async_execution===true` (`createToolResponse` only surfaces content/continuation/metadata — same contract as consensus), and a lint indentation error in a test helper.
- **Final verification**: `pnpm test -- tests/tools/conversation.test.js` = 25 passed; `pnpm run test:tools` = 202 passed | 4 skipped (12 files), no regressions; eslint on changed files = clean (exit 0); `pnpm run typecheck` = passes.

### Open Questions (flag to orchestrator if they affect scope)
- Whether to extract `mapModelToProvider`/`resolveAutoModel`/`getDefaultModelForProvider` into `src/utils/modelRouting.js` (preferred) vs. a third local copy. Extraction touches chat.js/consensus.js imports — if that risks the atomic scope, default to a local copy and leave a refactor task for later. Surfaced because it is the one place this task could grow.
- A richer conversation-specific per-turn async status VIEW (beyond rendering `result.content` + a progress line) is NOT in scope; generic display with the added `content`/progress branch is accepted. A fancier turns view would be a follow-up task.

### Relevant Documentation
- `docs/API.md` — existing chat/consensus contracts are the template for the new conversation section.
- `docs/ARCHITECTURE.md` — functional tool architecture and dependency-injection conventions the new tool must follow.

### Related Tasks
- task-011-support-custom-continuation-ids — conversation must implement the same `custom_id` / `isSafeIdSegment` behavior; that task is the reference implementation.
- task-009-add-mcp-cancellation-support — conversation's sync per-turn abort checks follow this task's `signal` conventions.
<!-- NOTES:END -->
