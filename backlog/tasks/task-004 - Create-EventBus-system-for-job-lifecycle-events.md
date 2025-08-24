---
id: task-004
title: Create EventBus system for job lifecycle events
status: Done
assignee:
  - '@ai'
created_date: '2025-08-23 15:13'
updated_date: '2025-08-24 07:44'
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

### Architecture Approach
- Extend Node.js EventEmitter for proven event handling patterns
- Typed event system with consistent payload structures  
- Session-based event filtering for multi-tenant security
- Loose coupling between components via events
- Memory-efficient listener management with automatic cleanup

### Key Files to Create
- `src/async/eventBus.js` - Main EventBus class implementation
- `tests/async/eventBus.test.js` - Unit tests covering event emission, filtering, and listener management

### Architecture Reference Points
- `src/router.js` - Session management and request context patterns
- `src/utils/console.js` - Debug logging for event tracing
- Node.js EventEmitter - Core event handling patterns

### Integration Points
- **JobRunner**: Event emission during job lifecycle transitions
- **AsyncJobStore**: Event storage in job ring buffers for check_status
- **Session Management**: Filtering events by session ownership

### Security & Memory Management
- Session ownership verification before event delivery
- Automatic cleanup of listeners when sessions expire
- Event payload sanitization and size limits
- Rate limiting and memory leak monitoring


## Implementation Notes

Successfully implemented EventBus system with all required features: typed event system extending Node.js EventEmitter, session-based filtering with ownership verification, memory management with automatic cleanup, comprehensive unit tests (56 tests passing), integrated with JobRunner and AsyncJobStore for complete job lifecycle event handling. Provides communication backbone between async system components with structured event payloads, rate limiting, data sanitization, and ring buffer support.
## Detailed Implementation Steps:

1. **Create EventBus class extending EventEmitter (src/async/eventBus.js)**
   - Import EventEmitter from 'events' module
   - Create EventBusError class for error handling
   - Define event type constants (JOB_CREATED, JOB_UPDATED, JOB_COMPLETED, JOB_FAILED)
   - Implement constructor with configuration options and session tracking

2. **Implement core event emission methods**
   - `emitJobCreated(jobId, sessionId, data)` - Job creation events
   - `emitJobUpdated(jobId, sessionId, data)` - Job progress/state updates
   - `emitJobCompleted(jobId, sessionId, result)` - Job completion events
   - `emitJobFailed(jobId, sessionId, error)` - Job failure events
   - Include timestamp, event validation, and payload sanitization

3. **Implement session-based event filtering system**
   - `addSessionListener(sessionId, eventType, callback)` - Session-scoped listeners
   - `removeSessionListener(sessionId, eventType, callback)` - Cleanup specific listeners
   - `removeAllSessionListeners(sessionId)` - Cleanup all session listeners
   - Session ownership verification before event delivery

4. **Add memory management and cleanup features**
   - Automatic listener cleanup when sessions expire
   - Event rate limiting per session to prevent abuse
   - Memory usage monitoring and warnings
   - Graceful cleanup on EventBus shutdown

5. **Implement event history and ring buffer support**
   - `getEventHistory(jobId, sessionId, limit)` - Get recent events for job
   - Integration with AsyncJobStore event storage
   - Event payload size limits and truncation

6. **Create comprehensive unit tests (tests/async/eventBus.test.js)**
   - Event emission and listener registration tests
   - Session-based filtering and security tests
   - Memory management and cleanup tests
   - Error handling and edge case tests
   - Integration with existing AsyncJobStore and JobRunner tests

7. **Add EventBus integration to JobRunner**
   - Inject EventBus dependency into JobRunner constructor
   - Emit events at appropriate lifecycle points in _executeJob method
   - Update JobRunner tests to verify event emission

8. **Update AsyncJobStore to handle EventBus events**
   - Add EventBus listener for storing events in job ring buffers
   - Ensure events are accessible via check_status functionality
   - Update AsyncJobStore tests for event integration

## Implementation Plan Reference

Refer to **Async Execution System Architecture Plan** (`backlog/docs/doc-001 - Async-Execution-System-Architecture-Plan.md`) for:
- Complete system architecture and component relationships
- Visual diagrams showing class structure, execution flow, and sequence diagrams
- Integration patterns with existing MCP server infrastructure
- Caching strategy, error handling, and testing approaches
- Context for how this task fits into the overall async execution system
