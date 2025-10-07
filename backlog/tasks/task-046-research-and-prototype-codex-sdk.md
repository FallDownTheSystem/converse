---
id: task-046-research-and-prototype-codex-sdk
title: Research and Prototype Codex SDK
status: "To Do"
created_date: '2025-10-07 11:04'
updated_date: '2025-10-07 11:06'
parent: task-045
subtasks: []
dependencies: []
---

## Description
<!-- DESCRIPTION:BEGIN -->
Before we integrate OpenAI's Codex SDK into our MCP server, we need to understand exactly how it works in practice through hands-on experimentation. This research task involves installing the Codex SDK, running real tests with it, and documenting its actual behavior.

**Why This Matters:** The documentation and examples give us a basic understanding, but there are critical unknowns about how Codex actually behaves when running inside a Node.js server. We need to know if it will block our server, what events it really emits, how authentication works in practice, and whether it can handle the kinds of workloads we'll throw at it.

**What We're Doing:** We'll create an experimental test file completely separate from the main codebase where we can safely test the Codex SDK. Through this experimentation, we'll answer questions like: Does Codex spawn child processes that could interfere with our server? What streaming events do we actually receive and how frequently? Can we resume threads reliably? How does authentication work without a user interface? What happens when things go wrong?

**The Goal:** By the end of this task, we'll have a clear research document that answers all the critical unknowns about Codex SDK behavior. This document will guide the actual implementation in later subtasks and help us avoid costly mistakes.

**What Success Looks Like:** We'll have tested the SDK thoroughly, measured its performance characteristics, documented all the events it emits, confirmed authentication methods work, and identified any gotchas or edge cases. Most importantly, we'll know whether the SDK is suitable for integration into our MCP server and what precautions we need to take.
<!-- DESCRIPTION:END -->

## Specification
<!-- SPECIFICATION:BEGIN -->

### Research Questions to Answer

**Process and Performance:**
1. How does Codex spawn processes? (per-thread, per-instance, or shared)
2. Does process spawning block the Node.js event loop?
3. What is the first-byte latency including process spawn overhead?
4. How are file descriptors and child processes cleaned up?
5. What happens to processes on cancellation or abnormal termination?

**Event Taxonomy:**
1. What is the complete list of event types from `runStreamed()`?
2. Beyond `item.completed` and `turn.completed`, what other events exist?
3. How frequently do events fire during typical operations?
4. What event fields and metadata are included?
5. Are there any undocumented or error events?

**Authentication:**
1. Can Codex work with only `OPENAI_API_KEY` (no ChatGPT login)?
2. What's the authentication precedence: API key vs login?
3. What error messages appear when authentication fails?
4. Does headless authentication work reliably?

**Thread Management:**
1. Where are thread sessions stored? (`~/.codex/sessions`)
2. Can we control the `CODEX_HOME` location programmatically?
3. Are thread IDs stable across restarts?
4. What happens to threads when the Node.js process restarts?
5. How does thread resumption work in practice?

**Configuration and Behavior:**
1. What are the actual behavioral differences between sandbox modes?
2. How does `skipGitRepoCheck` work?
3. What happens when running in a non-Git directory?
4. Can `approval_policy` be set programmatically?
5. What `shell_environment_policy` values prevent deadlocks?

**Error Scenarios:**
1. What errors occur when Codex SDK isn't installed?
2. What errors occur when authentication is missing?
3. What errors occur in non-Git repositories?
4. How are timeouts and cancellations handled?
5. What error codes and messages does the SDK return?

**Binary and Installation:**
1. Does `@openai/codex-sdk` bundle the CLI binary or require separate installation?
2. What are the OS/platform requirements? (macOS, Linux, Windows support)
3. How large is the SDK package?
4. Are there any native dependencies?

### Acceptance Criteria

**Must Have:**
1. ✅ Codex SDK installed and basic execution confirmed
2. ✅ Complete event taxonomy documented with examples of all event types
3. ✅ Process spawning behavior documented (blocking/non-blocking, lifecycle)
4. ✅ Authentication methods tested and documented (API key, login, precedence)
5. ✅ First-byte latency measured (including spawn overhead)
6. ✅ Thread persistence tested (create, resume, storage location)
7. ✅ Sandbox modes tested (read-only, workspace-write, danger-full-access)
8. ✅ Error scenarios tested (no auth, no git repo, invalid thread, etc.)
9. ✅ Research document created with findings and recommendations
10. ✅ Process cleanup verified (no zombies after cancellation/termination)

**Should Have:**
1. ✅ Concurrency tested (multiple simultaneous Codex instances)
2. ✅ Working directory configuration tested
3. ✅ Approval policy behavior documented
4. ✅ Platform support documented (macOS, Linux, Windows)
5. ✅ Performance characteristics measured (memory, CPU, duration)

**Nice to Have:**
1. ⚪ Comparison with traditional API-based providers
2. ⚪ Integration patterns recommendations
3. ⚪ Known limitations documented

### Exit Criteria (Blockers for Next Phase)

These must pass before proceeding to Subtask 047:

1. **Non-blocking confirmed**: Codex SDK does NOT block Node.js event loop during execution
2. **Complete event taxonomy**: All event types documented, not just `item.completed`/`turn.completed`
3. **Headless auth viable**: API key authentication works without interactive login
4. **Realistic latency measured**: First-byte latency includes process spawn overhead (not just API call)
5. **Process cleanup verified**: No zombie processes left after cancellation or normal termination

If any of these fail, we must either find workarounds or reconsider the integration approach.

### Deliverables

1. **Experiment File**: `experiments/codex-test.js` with comprehensive SDK tests
2. **Research Document**: `backlog/docs/guides/doc-codex-research-findings.md` containing:
   - Complete event taxonomy with examples
   - Authentication behavior and recommendations
   - Process lifecycle and cleanup behavior
   - Performance measurements (latency, throughput, resource usage)
   - Error scenarios and handling strategies
   - Platform support matrix
   - Known limitations and gotchas
   - Recommendations for integration approach
3. **Test Results**: Logs, screenshots, or output demonstrating key findings

<!-- SPECIFICATION:END -->

## Design
<!-- DESIGN:BEGIN -->

**Architecture Approach:**

This is a research task with no production code changes. We'll create an isolated experimental environment to test the Codex SDK without affecting the main codebase. The approach is systematic experimentation following the scientific method:

1. **Setup Phase**: Install SDK, create test file, verify basic operation
2. **Measurement Phase**: Run controlled tests to measure performance and behavior
3. **Documentation Phase**: Record findings in structured research document
4. **Validation Phase**: Verify critical assumptions and identify blockers

**Key Files to Create:**

1. **`experiments/codex-test.js`** - Main experimental test file containing:
   - SDK installation verification
   - Basic execution tests (streaming and non-streaming)
   - Event taxonomy exploration
   - Authentication tests
   - Thread management tests
   - Error scenario tests
   - Performance benchmarks
   - Process cleanup verification

2. **`backlog/docs/guides/doc-codex-research-findings.md`** - Research document containing:
   - Executive summary of findings
   - Detailed answers to each research question
   - Event taxonomy reference with examples
   - Performance measurements and charts
   - Known issues and workarounds
   - Recommendations for integration

3. **`experiments/.env.codex`** - Test environment configuration:
   - `OPENAI_API_KEY` for authentication testing
   - `CODEX_HOME` for controlling session storage
   - Test-specific configuration values

**Experimental Test Structure:**

```javascript
// experiments/codex-test.js structure:

import { Codex } from '@openai/codex-sdk';

// Test 1: Basic Execution
async function testBasicExecution() {
  // Verify SDK loads, thread starts, simple prompt executes
}

// Test 2: Streaming Events
async function testStreamingEvents() {
  // Log ALL events with timestamps, types, and content
  // Measure event frequency and latency
}

// Test 3: Thread Persistence
async function testThreadPersistence() {
  // Create thread, save ID, terminate process, resume thread
}

// Test 4: Authentication Methods
async function testAuthentication() {
  // Test with API key, without auth, verify error messages
}

// Test 5: Sandbox Modes
async function testSandboxModes() {
  // Test each mode, verify actual behavior matches docs
}

// Test 6: Process Lifecycle
async function testProcessLifecycle() {
  // Monitor child processes, test cancellation, check for zombies
}

// Test 7: Error Scenarios
async function testErrorScenarios() {
  // Invalid thread ID, non-Git directory, timeouts, etc.
}

// Test 8: Performance Benchmarks
async function testPerformance() {
  // Measure: spawn time, first-byte latency, throughput
  // Monitor: CPU, memory, file descriptors
}

// Test 9: Concurrency
async function testConcurrency() {
  // Run multiple Codex instances simultaneously
  // Check for conflicts, resource contention
}
```

**Testing Methodology:**

1. **Event Logging**: Log every event with full details:
   ```javascript
   for await (const event of events) {
     console.log(JSON.stringify({
       timestamp: Date.now(),
       type: event.type,
       event: event,
       keys: Object.keys(event)
     }, null, 2));
   }
   ```

2. **Performance Measurement**:
   ```javascript
   const startTime = Date.now();
   const { events } = await thread.runStreamed(prompt);
   let firstByteTime = null;

   for await (const event of events) {
     if (!firstByteTime && event.type === 'delta') {
       firstByteTime = Date.now() - startTime;
     }
   }
   ```

3. **Process Monitoring**:
   ```javascript
   // Before test
   const beforePs = execSync('ps aux | grep codex').toString();

   // Run test

   // After test
   const afterPs = execSync('ps aux | grep codex').toString();
   // Compare to detect zombies
   ```

**Research Document Structure:**

```markdown
# Codex SDK Research Findings

## Executive Summary
[Key findings, go/no-go decision, major risks]

## Event Taxonomy
### Complete Event Types
- item.completed: [description, frequency, fields, example]
- turn.completed: [description, frequency, fields, example]
- [all other event types discovered]

### Unknown Event Handling
[How to handle unexpected events]

## Process Lifecycle
### Spawning Behavior
[Blocking/non-blocking, per-thread vs shared]

### Cleanup
[File descriptors, child processes, zombie prevention]

## Authentication
### Methods Tested
[API key, login, precedence]

### Recommendations
[Best approach for MCP server]

## Performance Characteristics
### Latency
[First-byte including spawn overhead]

### Resource Usage
[CPU, memory, file descriptors]

### Concurrency
[Max concurrent instances, conflicts]

## Thread Management
### Storage
[Location, control, persistence]

### Resumption
[Reliability, limitations]

## Configuration
### Sandbox Modes
[Actual behavior vs docs]

### Approval Policy
[Headless-safe settings]

### Shell Environment
[Secret leakage prevention]

## Error Scenarios
[Complete catalog with error codes and messages]

## Platform Support
[macOS, Linux, Windows compatibility]

## Integration Recommendations
### Architecture Approach
[Based on findings]

### Critical Precautions
[Must-have safeguards]

### Known Limitations
[What won't work]

## Gotchas and Surprises
[Unexpected behaviors discovered]
```

**Dependencies:**

- `@openai/codex-sdk` - The TypeScript SDK we're testing
- Node.js 20+ - Required by Codex SDK
- Valid OpenAI API key or ChatGPT login - For authentication testing
- Git repository (or test `skipGitRepoCheck`) - Codex requirement

**Tools Needed:**

- `ps` command - For process monitoring
- `time` command - For performance measurement
- Process explorer/htop - For resource monitoring (optional)

**Context Manifest:**

This is a pure research task with no codebase context needed. The Context Manifest will be added after this task when we begin implementation tasks that need to understand existing provider patterns, configuration systems, etc.

<!-- DESIGN:END -->

## TODO
<!-- TODO:BEGIN -->

### Setup Phase
- [ ] Create `experiments/` directory if it doesn't exist
- [ ] Install `@openai/codex-sdk`: `npm install @openai/codex-sdk`
- [ ] Create `experiments/codex-test.js` with basic structure
- [ ] Create `experiments/.env.codex` with test configuration
- [ ] Verify SDK loads and basic import works

### Core Testing Phase
- [ ] **Test 1: Basic Execution**
  - [ ] Test non-streaming execution with `thread.run()`
  - [ ] Test streaming execution with `thread.runStreamed()`
  - [ ] Verify basic prompts work
  - [ ] Document response structure

- [ ] **Test 2: Event Taxonomy**
  - [ ] Log ALL events from `runStreamed()` with full details
  - [ ] Document every event type discovered (not just item/turn)
  - [ ] Measure event frequency and timing
  - [ ] Test if unknown events crash or are handled gracefully

- [ ] **Test 3: Process Lifecycle**
  - [ ] Monitor process tree before/during/after execution
  - [ ] Test if execution blocks Node.js event loop
  - [ ] Measure process spawn overhead
  - [ ] Test cancellation mid-stream
  - [ ] Verify no zombie processes after completion
  - [ ] Verify no zombie processes after cancellation

- [ ] **Test 4: Authentication**
  - [ ] Test with `OPENAI_API_KEY` only (no login)
  - [ ] Test without any authentication (document error)
  - [ ] Test with ChatGPT login only (if applicable)
  - [ ] Document authentication precedence
  - [ ] Document error messages for auth failures

- [ ] **Test 5: Thread Management**
  - [ ] Create new thread and save `threadId`
  - [ ] Verify thread storage location (`~/.codex/sessions`)
  - [ ] Test `codex.resumeThread(threadId)`
  - [ ] Verify context persists across resumption
  - [ ] Test with custom `CODEX_HOME` location
  - [ ] Test thread behavior after Node.js process restart

- [ ] **Test 6: Sandbox Modes**
  - [ ] Test `read-only` mode (verify write fails)
  - [ ] Test `workspace-write` mode (verify workspace writable)
  - [ ] Test `danger-full-access` mode
  - [ ] Document actual vs expected behavior

- [ ] **Test 7: Configuration**
  - [ ] Test `skipGitRepoCheck: true` in non-Git directory
  - [ ] Test `skipGitRepoCheck: false` in non-Git directory (expect error)
  - [ ] Test custom `workingDirectory`
  - [ ] Test if `approval_policy` can be set programmatically
  - [ ] Document safe approval policy for headless mode

- [ ] **Test 8: Error Scenarios**
  - [ ] Test with invalid `threadId` for resumption
  - [ ] Test in non-Git directory without `skipGitRepoCheck`
  - [ ] Test with missing authentication
  - [ ] Test with network issues (if applicable)
  - [ ] Document all error codes and messages

- [ ] **Test 9: Performance Benchmarks**
  - [ ] Measure first-byte latency (including spawn overhead)
  - [ ] Measure total execution time for simple prompt
  - [ ] Monitor CPU usage during execution
  - [ ] Monitor memory usage during execution
  - [ ] Monitor file descriptor usage
  - [ ] Test multiple sequential executions (warm vs cold)

- [ ] **Test 10: Concurrency**
  - [ ] Run 3 concurrent Codex instances
  - [ ] Run 10 concurrent Codex instances
  - [ ] Check for resource conflicts or contention
  - [ ] Verify no cross-instance interference

### Documentation Phase
- [ ] Create research document: `backlog/docs/guides/doc-codex-research-findings.md`
- [ ] Write executive summary with key findings
- [ ] Document complete event taxonomy with examples
- [ ] Document process lifecycle behavior
- [ ] Document authentication methods and recommendations
- [ ] Document performance measurements
- [ ] Document thread management findings
- [ ] Document configuration options tested
- [ ] Document error scenarios and handling
- [ ] Document platform support (OS/architecture)
- [ ] Write integration recommendations
- [ ] Document known limitations and gotchas

### Validation Phase
- [ ] Verify all Exit Criteria pass:
  - [ ] Non-blocking behavior confirmed
  - [ ] Complete event taxonomy documented
  - [ ] Headless auth viable
  - [ ] Realistic latency measured
  - [ ] Process cleanup verified
- [ ] Review findings with critical eye
- [ ] Identify any blockers for next phase
- [ ] Document go/no-go decision for integration

<!-- TODO:END -->

## Notes
<!-- NOTES:BEGIN -->

### Task Context

This is the first subtask (046) of the parent task-045 (Add OpenAI Codex integration to Chat tool). This research phase is critical because we're dealing with many unknowns about how Codex SDK actually behaves in production.

**Why Research First:** The Codex SDK documentation provides basic usage examples, but doesn't answer critical questions about production deployment: process lifecycle, event taxonomy beyond the basics, authentication in headless environments, and performance characteristics. We need answers before designing the integration.

**Key Risks Being Investigated:**
1. **Event Loop Blocking**: If Codex blocks the Node.js event loop, it could freeze our entire MCP server
2. **Zombie Processes**: Improper cleanup could leave orphaned Codex processes consuming resources
3. **Authentication Failure**: If headless auth doesn't work, the feature is unusable in MCP servers
4. **Unknown Events**: If we only handle `item.completed`/`turn.completed`, we might miss critical events
5. **First-byte Latency**: Process spawn overhead might make Codex too slow for interactive use

**Parent Task Reference:**
- Parent task: task-045-add-openai-codex-integration-to-chat-tool.md
- This is subtask 1 of 6 (046, 047, 048, 049, 050, 051)
- Next subtask (047) depends on findings from this research
- See parent task TODO section "Subtask 046" for the original requirements that informed this plan

**Critical Questions from Parent Task:**
The parent task identified these unknowns that MUST be answered:
1. Does Codex spawn child processes that could block our server? (Test 3)
2. What's the complete event taxonomy? (Test 2)
3. How does thread storage work - can we control the session directory? (Test 5)
4. Can multiple Codex instances run concurrently without conflicts? (Test 10)
5. How does authentication work - API key, OAuth, or something else? (Test 4)
6. What approval events exist that could deadlock headless runs? (Test 7)
7. Can we prevent zombie processes on cancellation/shutdown? (Test 3)
8. What's the OS support matrix? (Test 9)
9. How does binary spawning affect first-byte latency? (Test 9)
10. Can shell_environment_policy be controlled programmatically? (Test 7)

**Exit Criteria Importance:**
The 5 exit criteria are NOT arbitrary - they're the minimum requirements to proceed. If ANY fail, we must either:
- Find workarounds in this task
- Document the blocker and adjust the integration approach
- Potentially abandon the Codex integration if fundamental issues are discovered

**Relevant Documentation:**
- backlog/docs/guides/doc-codex-sdk.md - SDK API reference (theoretical knowledge)
- backlog/docs/guides/doc-codex-readme.md - Installation and CLI usage
- backlog/docs/guides/doc-codex-config.md - Configuration options reference
- Parent task Context Manifest - Provider architecture patterns (for later tasks)

**Research vs Implementation:**
This task is ONLY research - no production code changes. The findings will inform:
- Subtask 047: Testing SDK in MCP server environment
- Subtask 048: Configuration system design
- Subtask 049: Streaming and continuation implementation
- Subtask 050: Full provider implementation

**Experimental Environment:**
The `experiments/` directory is intentionally isolated from the main codebase:
- No imports from `src/` (avoid coupling)
- Can break or throw errors without affecting production
- Easy to delete after research is complete
- Results captured in research document for reference

**What "Success" Looks Like:**
Not just "tests pass" - we need a comprehensive research document that:
- Answers every research question with evidence
- Provides code examples and logs
- Measures real performance numbers
- Documents error scenarios with exact error messages
- Makes clear go/no-go recommendation
- Identifies precautions needed for integration

If this research is thorough, implementation tasks will be straightforward. If rushed, we'll discover issues mid-implementation causing rework.

<!-- NOTES:END -->
