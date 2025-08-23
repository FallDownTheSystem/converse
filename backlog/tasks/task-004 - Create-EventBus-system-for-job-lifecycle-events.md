---
id: task-004
title: Create EventBus system for job lifecycle events
status: To Do
assignee: []
created_date: '2025-08-23 15:13'
updated_date: '2025-08-23 17:02'
labels:
  - async
  - foundation
  - events
  - communication
dependencies: []
---

## Description

Create an event system for broadcasting job lifecycle events throughout the async execution system. Uses Node.js EventEmitter pattern to decouple components and enable structured event handling. Supports typed events for job creation, updates, completion, and errors. Provides the communication backbone between JobRunner, AsyncJobStore, and other system components.

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 EventBus class extending Node.js EventEmitter with typed event methods
- [ ] #2 Support for job lifecycle events (job.created, job.updated, job.completed, job.failed)
- [ ] #3 Event payload includes jobId, sessionId, timestamp, and event-specific data
- [ ] #4 Event filtering by sessionId for multi-tenant safety
- [ ] #5 Memory-efficient event handling with automatic cleanup of listeners
- [ ] #6 Unit tests covering event emission, filtering, and listener management
- [ ] #7 Structured event payload format for consistent data access
<!-- AC:END -->


## Implementation Plan

**Architecture Approach:**
- Extend Node.js EventEmitter for proven event handling patterns
- Typed event system with consistent payload structures
- Session-based event filtering for multi-tenant security
- Loose coupling between components via events
- Memory-efficient listener management with automatic cleanup

**Key Files to Create:**
- `src/async/eventBus.js` - Main EventBus class implementation
- `tests/async/eventBus.test.js` - Unit tests covering event emission, filtering, and listener management

**Architecture Reference Points:**
- `src/router.js` - Session management and request context patterns
- `src/utils/console.js` - Debug logging for event tracing
- Node.js EventEmitter - Core event handling patterns

**EventBus Interface Design:**
```javascript
class EventBus extends EventEmitter {
  constructor(dependencies) {
    super();
    this.sessionManager = dependencies.sessionManager;
  }

  // Typed event emission methods
  emitJobCreated(jobId, sessionId, metadata) { }
  emitJobUpdated(jobId, sessionId, updateData) { }
  emitJobCompleted(jobId, sessionId, result) { }
  emitJobFailed(jobId, sessionId, error) { }

  // Session-filtered listener registration
  onJobEvents(sessionId, callback) { }
  offJobEvents(sessionId, callback) { }
}
```

**Event Payload Standards:**
```javascript
// job.created
{
  type: 'job.created',
  jobId: 'conv_abc123',
  sessionId: 'sess_xyz789', 
  timestamp: 1706123456000,
  data: {
    tool: 'chat',
    inputSummary: 'User asked about...'
  }
}

// job.updated  
{
  type: 'job.updated',
  jobId: 'conv_abc123',
  sessionId: 'sess_xyz789',
  timestamp: 1706123457000,
  data: {
    status: 'running',
    overallProgress: 0.65,
    providerUpdates: [...],
    delta: 'partial response text...'
  }
}

// job.completed
{
  type: 'job.completed', 
  jobId: 'conv_abc123',
  sessionId: 'sess_xyz789',
  timestamp: 1706123470000,
  data: {
    final: true,
    result: {...},
    totalDuration: 14000
  }
}
```

**Integration Points:**
- JobRunner: Event emission during job lifecycle transitions
- AsyncJobStore: Event storage in job ring buffers for check_status
- Session Management: Filtering events by session ownership

**Security & Filtering:**
- Session ownership verification before event delivery
- Event payload sanitization to prevent information leakage
- Rate limiting on event emission to prevent abuse
- Automatic cleanup of listeners for expired sessions

**Memory Management:**
- Automatic cleanup of listeners when sessions expire
- Event payload size limits to prevent memory bloat  
- Listener count monitoring with warnings for potential leaks
- Integration with existing cleanup timers

**Error Handling:**
- Graceful handling of listener exceptions (don't crash EventBus)
- Comprehensive error logging for debugging
- Debug logging for event emission and delivery issues

**Dependencies:**
- Node.js EventEmitter (built-in) - Core event handling
- Session management system for security filtering
## Implementation Plan Reference

Refer to **Async Execution System Architecture Plan** (`backlog/docs/doc-001 - Async-Execution-System-Architecture-Plan.md`) for:
- Complete system architecture and component relationships
- Visual diagrams showing class structure, execution flow, and sequence diagrams
- Integration patterns with existing MCP server infrastructure
- Caching strategy, error handling, and testing approaches
- Context for how this task fits into the overall async execution system
