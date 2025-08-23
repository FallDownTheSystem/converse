---
id: task-002
title: Create FileCache system using native fs/promises
status: Done
assignee:
  - '@ai'
created_date: '2025-08-23 15:02'
updated_date: '2025-08-23 20:17'
labels:
  - async
  - foundation
  - persistence
  - file-system
dependencies:
  - task-001
---

## Description

Create a file-based caching system for persisting async job progress and results to disk using Node.js native fs/promises API. Uses NDJSON journal files for streaming progress events and JSON snapshots for final results. Provides durability across server restarts and 3-day retention with automatic cleanup. Complements the in-memory AsyncJobStore for long-term persistence.

Technical Requirements:
- Native Node.js fs/promises API (no external file system dependencies)
- NDJSON (Newline Delimited JSON) format for streaming journal entries
- JSON format for final result snapshots with pretty-printing
- Hierarchical directory structure for organization and cleanup
- Automatic cleanup mechanism with configurable retention
- Error resilience for common file system issues

Architecture:
- FileCache class as primary interface
- Directory-based organization by date and job ID
- Append-only journal for progress streaming
- Single snapshot file for completed results
- Integration points with AsyncJobStore for synchronization

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 FileCache class with writeJournalEvent(), writeSnapshot(), readSnapshot() methods using native fs/promises,Directory structure: cache/async/{yyyy-mm-dd}/{jobId}/ with journal.ndjson and result.json,NDJSON journal using JSON.stringify() + newline for append-only streaming events,JSON snapshot written once on job completion with pretty-printed formatting,Recursive directory creation using fs.mkdir({ recursive: true }),Daily cleanup task removes directories older than 3 days,Graceful error handling for disk full, permission errors, corrupt files,Unit tests covering file operations, cleanup, and error scenarios,Integration tests with AsyncJobStore ensuring both systems stay in-sync,Integration with existing error handling patterns
<!-- AC:END -->

## Implementation Plan Reference

Refer to **Async Execution System Architecture Plan** (`backlog/docs/doc-001 - Async-Execution-System-Architecture-Plan.md`) for:
- Complete system architecture and component relationships
- Visual diagrams showing class structure, execution flow, and sequence diagrams
- Integration patterns with existing MCP server infrastructure
- Caching strategy, error handling, and testing approaches
- Context for how this task fits into the overall async execution system

## Implementation Plan

**Architecture Approach:**
- Use native Node.js `fs/promises` for all file operations (zero dependencies)
- NDJSON journal pattern for append-only streaming event logs
- JSON snapshots for final completed job results
- Daily directory structure for automatic cleanup organization
- Graceful error handling following existing codebase patterns

**Key Files to Create:**
- `src/async/fileCache.js` - Main FileCache class implementation  
- `tests/async/fileCache.test.js` - Comprehensive unit tests including error scenarios

**Directory Structure Design:**
```
cache/async/
├── 2025-01-31/           # Daily directories
│   ├── conv_abc123/      # Job-specific subdirectories  
│   │   ├── journal.ndjson # Streaming events (append-only)
│   │   └── result.json    # Final snapshot (written once)
│   └── conv_def456/
│       ├── journal.ndjson
│       └── result.json
└── 2025-01-30/           # Previous days (cleaned up after 3 days)
```

**Architecture Reference Points:**
- `src/continuationStore.js` - Error handling patterns and cleanup integration
- `src/config.js` - Configuration loading and path resolution patterns
- `src/utils/console.js` - Debug logging for file operations
- Existing cleanup timer patterns for integration

**File Operations Design:**
```javascript
// NDJSON Journal Events
{"seq":1,"ts":1706123456,"type":"job.created","jobId":"conv_abc123","sessionId":"sess_xyz"}
{"seq":2,"ts":1706123457,"type":"provider.start","provider":"openai","model":"gpt-5"}
{"seq":3,"ts":1706123458,"type":"provider.delta","provider":"openai","delta":"Hello"}

// JSON Snapshot (final result)
{
  "jobId": "conv_abc123",
  "status": "completed", 
  "tool": "chat",
  "createdAt": 1706123456000,
  "completedAt": 1706123470000,
  "result": {...},
  "providers": {...},
  "usage": {...}
}
```

**Integration Points:**
- Use existing daily cleanup scheduler pattern (extend from ContinuationStore cleanup)
- Follow same error handling as ContinuationStoreError for consistency
- Integrate with AsyncJobStore for coordinated caching strategy
- Use same debug logging patterns for file operations

**Error Handling Strategy:**
- Disk full: Log warning, continue with memory-only operation
- Permission errors: Graceful degradation with error logging
- Corrupt files: Skip and log, don't crash cleanup process
- Directory creation failures: Auto-retry with exponential backoff

**Performance Considerations:**
- Append-only NDJSON writes for minimal disk I/O during streaming
- Single JSON snapshot write on completion (not during streaming)
- Batch directory cleanup operations (not per-file)
- Configurable retention period (default 3 days)

**Dependencies:**
- Native `fs/promises` only - no external libraries required
- `path` module for directory operations
- Existing logging utilities from utils/console.js

**DETAILED EXECUTION STEPS:**

1. Create src/async/fileCache.js with FileCacheInterface, FileCacheError, FileCache class, and singleton pattern
2. Implement writeJournalEvent() method for NDJSON streaming with fs.appendFile 
3. Implement writeSnapshot() method for pretty-printed JSON with fs.writeFile
4. Implement readSnapshot() method for reading completed jobs with fs.readFile
5. Implement cleanup() method for removing old directories with fs.readdir/fs.rm
6. Add FILE_CACHE_ERROR codes to existing error handling system
7. Create comprehensive test suite at tests/async/fileCache.test.js following asyncJobStore.test.js patterns
8. Mock all fs/promises operations for isolated testing
9. Test all methods, error scenarios, cleanup operations, and edge cases
10. Verify all acceptance criteria are met and tests pass

## Implementation Notes

Successfully implemented FileCache system using native fs/promises API
- Created hierarchical directory structure: cache/async/{yyyy-mm-dd}/{jobId}/
- Implemented NDJSON journal streaming with writeJournalEvent() method
- Implemented JSON snapshot storage with writeSnapshot() method  
- Implemented readSnapshot() method with fallback search in recent directories
- Added automatic cleanup system with 3-day retention (configurable)
- Integrated with existing error handling system (added 5 new error codes to ERROR_CODES)
- Created FileCacheError class extending ConverseMCPError
- Implemented singleton pattern with getFileCache() function
- Created comprehensive test suite with 45 passing tests covering all functionality
- Follows all existing codebase patterns and conventions
- All acceptance criteria met and verified
- Integration ready with AsyncJobStore for persistent job storage across server restarts

Files created:
- src/async/fileCache.js (main implementation)  
- tests/async/fileCache.test.js (comprehensive test suite)

Files modified:
- src/utils/errorHandler.js (added file cache error codes)
