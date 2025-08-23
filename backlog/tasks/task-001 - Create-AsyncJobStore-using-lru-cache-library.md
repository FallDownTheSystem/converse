---
id: task-001
title: Create AsyncJobStore using lru-cache library
status: To Do
assignee: []
created_date: '2025-08-23 14:59'
updated_date: '2025-08-23 16:48'
labels:
  - async
  - foundation
  - job-management
  - caching
dependencies: []
---

## Description

Create an in-memory job state management system to track async execution status, progress, and results using the lru-cache library for TTL management. This is the core foundation for async chat and consensus tools, providing fast access to job states with automatic cleanup. Integrates with existing continuation store patterns and uses the same ID generation approach.

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Install lru-cache dependency (latest v11+ for ESM support)
- [ ] #2 AsyncJobStore class created with create(), get(), update(), complete(), fail() methods
- [ ] #3 LRU cache configured with 24-hour TTL and reasonable max size (10k jobs)
- [ ] #4 Job state includes status (queued/running/completed/failed), providers array, overall progress, and event sequence
- [ ] #5 Uses nanoid generation compatible with existing continuation store
- [ ] #6 Integration with existing cleanup patterns (reuse existing timers)
- [ ] #7 Unit tests covering all methods and TTL behavior
- [ ] #8 Compatible with existing functional architecture patterns
<!-- AC:END -->


## Implementation Plan

**Architecture Approach:**
- Follow existing ContinuationStore patterns from `src/continuationStore.js` for consistent interface design
- Use lru-cache library (v11+ ESM) for TTL-based caching with automatic eviction
- Implement pluggable interface pattern to allow future backend swapping (Redis, database)
- Integrate with existing cleanup scheduler patterns for automatic maintenance

**Key Files to Create:**
- `src/async/asyncJobStore.js` - Main AsyncJobStore class implementation
- `tests/async/asyncJobStore.test.js` - Comprehensive unit tests

**Architecture Reference Points:**
- `src/continuationStore.js` - Interface patterns, nanoid usage, cleanup integration
- `src/config.js` - Configuration patterns and validation approaches
- `src/utils/console.js` - Debug logging patterns for consistent output

**Data Models:**
```javascript
// JobState structure
{
  jobId: string,           // nanoid-generated ID (conv_XXXXXXXXXX)
  sessionId: string,       // session ownership
  status: enum,            // 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  tool: string,            // 'chat' | 'consensus'
  createdAt: number,       // timestamp
  updatedAt: number,       // timestamp
  overall: {
    progress: number,      // 0.0 - 1.0
    startedAt?: number,
    endedAt?: number,
    result?: object,
    error?: object
  },
  providers: Map<string, ProviderState>, // per-provider tracking
  events: Array<JobEvent>,               // ring buffer (last 100 events)
  seq: number              // monotonic sequence for events
}
```

**Integration Points:**
- Reuse `generateContinuationId()` from continuationStore.js for consistent ID format
- Integrate with existing cleanup timers (every 10 minutes, same as ContinuationStore)
- Follow same error handling patterns as ContinuationStoreError
- Use same debug logging patterns from existing codebase

**Dependencies:**
- `lru-cache` (^11.0.0) - Modern ESM-compatible caching with TTL support
- `nanoid` (existing) - ID generation compatibility with continuation store

**Testing Strategy:**
- Unit tests covering all CRUD operations (create, get, update, complete, fail)
- TTL behavior testing with time mocking
- Memory limit testing with large job counts
- Error handling and edge cases
- Integration with cleanup scheduler
## Implementation Plan Reference

Refer to **Async Execution System Architecture Plan** (`backlog/docs/doc-001 - Async-Execution-System-Architecture-Plan.md`) for:
- Complete system architecture and component relationships
- Visual diagrams showing class structure, execution flow, and sequence diagrams
- Integration patterns with existing MCP server infrastructure
- Caching strategy, error handling, and testing approaches
- Context for how this task fits into the overall async execution system
