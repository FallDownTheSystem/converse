---
id: task-006
title: Add async parameter support to chat tool
status: Done
assignee:
  - '@ai'
created_date: '2025-08-23 15:14'
updated_date: '2025-08-24 15:20'
labels:
  - async
  - tools
  - chat
  - integration
dependencies:
  - task-003
  - task-005
---

## Description

Extend the existing chat tool to support async execution mode. When async=true, the tool returns a continuation_id immediately and executes the chat request in the background using JobRunner. Maintains full backwards compatibility - when async=false or omitted, the tool works exactly as before. Uses ProviderStreamNormalizer internally for stream processing and stores complete results for later retrieval.

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Add async boolean parameter to chat tool schema (defaults to false)
- [ ] #2 Backwards compatibility maintained - existing behavior unchanged when async=false
- [ ] #3 When async=true, return continuation_id immediately and start background execution
- [ ] #4 Integration with JobRunner for background chat execution
- [ ] #5 Use ProviderStreamNormalizer for internal stream processing and result assembly
- [ ] #6 EventBus integration for internal job lifecycle coordination
- [ ] #7 Proper error handling for both sync and async execution paths
- [ ] #8 Unit tests covering both sync and async modes with complete result verification
<!-- AC:END -->


## Implementation Plan

**Architecture Approach:**
- Add async boolean parameter to existing chat tool schema (defaults to false)
- Fork execution path: sync (existing) vs async (new background execution)
- Complete backwards compatibility - zero impact on existing sync behavior
- Integration with JobRunner for background execution
- Internal stream consumption via ProviderStreamNormalizer for complete result assembly

**Key Files to Modify:**
- `src/tools/chat.js` - Extend existing chatTool function with async parameter support
- `tests/tools/chat.test.js` - Add async execution test cases alongside existing sync tests

**Architecture Reference Points:**
- `src/tools/chat.js:25-564` - Existing chat tool implementation patterns
- `src/tools/consensus.js:238-259` - Parallel execution patterns for reference
- `src/continuationStore.js:308-311` - generateContinuationId() for job IDs
- `src/transport/httpTransport.js` - Session management for job ownership

**Chat Tool Async Extension:**
```javascript
export async function chatTool(args, dependencies) {
  // Extract async parameter (defaults to false)
  const { async = false, ...otherArgs } = args;
  
  if (!async) {
    // Existing synchronous behavior - NO CHANGES
    return await executeChatSync(otherArgs, dependencies);
  }
  
  // New asynchronous execution path
  return await executeChatAsync(otherArgs, dependencies);
}

// New async execution function  
async function executeChatAsync(args, dependencies) {
  const { jobRunner, asyncJobStore } = dependencies;
  
  // 1. Create job immediately and return continuation_id
  const continuationId = generateContinuationId();
  
  // 2. Submit to JobRunner for background execution
  const jobId = jobRunner.submit(
    { tool: 'chat', args, sessionId: getSessionId() },
    async (context) => await runChatJob(context),
    { timeout: 300000 }
  );
  
  // 3. Return immediately with continuation_id
  return createToolResponse({
    continuation_id: jobId,
    status: 'queued',
    started_at: new Date().toISOString(),
    tool: 'chat'
  });
}

// Background chat execution function
async function runChatJob(context) {
  const { job, signal, update, providers, config } = context;
  
  // 1. Process context (files, images) - same as sync version
  // 2. Select provider and model - same as sync version  
  // 3. Use ProviderStreamNormalizer for internal stream consumption
  // 4. Update job state with progress internally
  // 5. Return complete result for job completion
}
```

**Backwards Compatibility Strategy:**
```javascript
// Existing sync behavior - completely unchanged
if (!async) {
  return await executeChatSync(args, dependencies);
}
```
- All existing tests continue to pass without modification
- Default async=false maintains identical behavior
- No impact on tool schema or MCP registration
- Existing error handling patterns preserved

**Async Execution Flow:**
1. **Immediate Response**: Return continuation_id and status='queued' instantly
2. **Background Processing**: JobRunner executes chat in background thread
3. **Stream Consumption**: ProviderStreamNormalizer processes provider streams internally
4. **Completion**: Complete result stored in AsyncJobStore when finished
5. **Status Checking**: Client can query progress and retrieve results via check_status tool

**Integration Points:**
- JobRunner: Background execution orchestration with timeout support
- ProviderStreamNormalizer: Internal stream processing and result assembly
- AsyncJobStore: Job state management and result storage
- EventBus: Internal job lifecycle event coordination
- FileCache: Persistence of complete job results

**Internal Stream Processing Implementation:**
```javascript
// Internal streaming consumption during chat execution
for await (const event of providerStream) {
  switch (event.type) {
    case 'delta':
      // Accumulate response internally
      accumulatedText += event.data.textDelta;
      update({ partial_output: accumulatedText });
      break;
    case 'usage':
      // Track token usage internally
      update({ usage: event.data });
      break;
    case 'end':
      // Store complete result
      return { result: finalResult, usage: totalUsage };
  }
}
```

**Error Handling:**
- Provider errors: Captured and stored in job state with recovery information
- Timeout errors: Job marked as failed after configured timeout (5 minutes default)
- System errors: Graceful degradation with proper error details
- Context processing errors: Same validation as sync version, but stored in job state

**Testing Strategy:**
- Async execution tests alongside existing sync tests
- Mock JobRunner for unit testing
- Integration tests with real background execution
- Error scenario testing (timeouts, provider failures)
- Backwards compatibility verification (all existing tests pass)

**Dependencies:**
- JobRunner (from task 3) for background orchestration  
- ProviderStreamNormalizer (from task 5) for internal stream processing
- AsyncJobStore (from task 1) for job state management
- EventBus (from task 4) for internal event coordination


## Implementation Notes

Successfully implemented async parameter support for chat tool. Added async boolean parameter (default: false) with full backwards compatibility. When async=true, returns continuation_id immediately and executes chat in background using JobRunner. Integrated ProviderStreamNormalizer for unified stream processing. Added comprehensive test coverage verifying both sync and async modes work correctly.
## Implementation Plan Reference

Refer to **Async Execution System Architecture Plan** (`backlog/docs/doc-001 - Async-Execution-System-Architecture-Plan.md`) for:
- Complete system architecture and component relationships
- Visual diagrams showing class structure, execution flow, and sequence diagrams
- Integration patterns with existing MCP server infrastructure
- Caching strategy, error handling, and testing approaches
- Context for how this task fits into the overall async execution system
