---
id: task-003
title: Create JobRunner for background execution orchestration
status: To Do
assignee: []
created_date: '2025-08-23 15:13'
updated_date: '2025-08-23 18:37'
labels:
  - async
  - foundation
  - execution
  - orchestration
dependencies:
  - task-001
  - task-004
---

## Description

Create a background job execution system that orchestrates async chat and consensus operations. Uses a bounded worker pool to manage concurrent LLM requests, integrates with AsyncJobStore for state management, and emits events via EventBus. Supports job timeouts, cancellation via AbortController, and graceful error handling. Provides the core execution layer that enables async=true functionality in MCP tools.

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 JobRunner class with submit() method that returns jobId immediately
- [ ] #2 Bounded concurrency using p-limit library for managing parallel LLM requests
- [ ] #3 Integration with AsyncJobStore for job state updates during execution
- [ ] #4 AbortController support for job timeouts and cancellation
- [ ] #5 Event emission to EventBus for job lifecycle (created, updated, completed, failed)
- [ ] #6 Background execution using setImmediate to avoid blocking MCP responses
- [ ] #7 Graceful error handling with proper job state transitions
- [ ] #8 Unit tests covering concurrency limits, timeouts, and error scenarios
<!-- AC:END -->


## Implementation Plan

**Architecture Approach:**
- Use `p-limit` library for bounded concurrency control (battle-tested, lightweight)
- Non-blocking background execution with `setImmediate()` pattern
- AbortController integration for timeout and cancellation support
- Event-driven communication with AsyncJobStore and EventBus
- Functional architecture following existing patterns

**Key Files to Create:**
- `src/async/jobRunner.js` - Main JobRunner class implementation
- `tests/async/jobRunner.test.js` - Unit tests covering concurrency, timeouts, errors

**Architecture Reference Points:**
- `src/tools/consensus.js:238-259` - Existing parallel execution with Promise.allSettled patterns
- `src/continuationStore.js:275-286` - Cleanup timer integration patterns
- `src/transport/httpTransport.js` - Session management and timeout patterns
- `src/utils/console.js` - Debug logging for job execution

**Core JobRunner Interface:**
```javascript
class JobRunner {
  constructor(dependencies) {
    this.asyncJobStore = dependencies.asyncJobStore;
    this.eventBus = dependencies.eventBus;
    this.fileCache = dependencies.fileCache;
    this.limiter = pLimit(10); // configurable concurrency
  }

  // Main submission method - returns jobId immediately
  submit(jobSpec, runFunction, options = {}) {
    // 1. Create job in AsyncJobStore (status: queued)
    // 2. Emit job.created event
    // 3. Submit to limiter queue for background execution
    // 4. Return jobId immediately
  }

  // Background execution wrapper
  async executeJob(jobId, runFunction, options) {
    // 1. Update job status to running
    // 2. Set up AbortController for timeout/cancellation
    // 3. Execute runFunction with context (job, signal, emit, update)
    // 4. Handle success/failure and final status updates
  }
}
```

**RunFunction Context:**
```javascript
// Context provided to chat/consensus execution functions
{
  job: JobState,                    // current job state
  signal: AbortSignal,              // for cancellation/timeout
  emit: (event) => void,            // emit job events
  update: (patch) => void,          // update job state
  providers: ProviderRegistry,      // access to LLM providers
  config: Configuration             // system configuration
}
```

**Integration Points:**
- AsyncJobStore: Job state management and updates during execution
- EventBus: Lifecycle event emission (created, updated, completed, failed)
- FileCache: Journal event writing and snapshot creation on completion
- Provider system: Access to LLM providers for chat/consensus execution
- Internal event coordination: Background job status changes propagated through EventBus

**Error Handling Strategy:**
- Timeout errors: AbortController triggers, job marked as failed with timeout code
- Provider errors: Captured and stored in job state, allow partial success for consensus
- System errors: Graceful degradation, proper cleanup of resources
- Memory pressure: Reject new jobs if queue exceeds limits

**Concurrency Management:**
- Default limit: 10 concurrent jobs (configurable)
- Queue prioritization: FIFO with optional priority levels
- Resource monitoring: Track memory usage and active job counts
- Graceful shutdown: Complete running jobs, reject new submissions

**Dependencies:**
- `p-limit` (^4.0.0) - Proven concurrency control library
- Existing AsyncJobStore and EventBus from tasks 1 and 4
- Existing provider system and configuration

## Implementation Plan Reference

Refer to **Async Execution System Architecture Plan** (`backlog/docs/doc-001 - Async-Execution-System-Architecture-Plan.md`) for:
- Complete system architecture and component relationships
- Visual diagrams showing class structure, execution flow, and sequence diagrams
- Integration patterns with existing MCP server infrastructure
- Caching strategy, error handling, and testing approaches
- Context for how this task fits into the overall async execution system
