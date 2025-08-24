---
id: task-008
title: Create check_status MCP tool for job status queries
status: Done
assignee:
  - '@ai'
created_date: '2025-08-23 15:14'
updated_date: '2025-08-24 15:32'
labels:
  - async
  - tools
  - status
  - mcp-tool
dependencies:
  - task-001
  - task-002
---

## Description

Create a new MCP tool that allows clients to check the status of async jobs. Supports querying specific jobs by continuation_id or listing all active/recent jobs for a session. Returns detailed progress information, streaming updates, partial results, and final outcomes. Integrates with AsyncJobStore for memory-based lookups and FileCache for completed job retrieval. Includes incremental polling support via since_seq parameter.

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 New check_status MCP tool with proper schema definition
- [ ] #2 Support for querying specific job by continuation_id parameter
- [ ] #3 When no continuation_id provided, return all active/recent jobs for session
- [ ] #4 Integration with AsyncJobStore for fast in-memory job status lookups
- [ ] #5 Fallback to FileCache for completed jobs not in memory
- [ ] #6 Incremental polling support with since_seq parameter for new events only
- [ ] #7 Response includes job status, progress, provider details, partial output, and final results
- [ ] #8 Session ownership verification for security (users only see their own jobs)
<!-- AC:END -->


## Implementation Plan

**Architecture Approach:**
- New MCP tool following existing tool patterns and registration
- Memory-first lookup with FileCache fallback for completed jobs
- Session ownership verification for security in multi-tenant environment
- Incremental polling support via since_seq parameter
- Optional continuation_id parameter (if omitted, list all user's jobs)

**Key Files to Create:**
- `src/tools/checkStatus.js` - New MCP tool implementation
- `tests/tools/checkStatus.test.js` - Unit tests covering all query scenarios

**Architecture Reference Points:**
- `src/tools/chat.js:25-50` - MCP tool function signature and argument validation patterns
- `src/tools/index.js` - Tool registration and MCP schema patterns
- `src/router.js` - Session management and security patterns
- `src/transport/httpTransport.js` - Session ID extraction patterns

**MCP Tool Registration:**
```javascript
// In src/tools/index.js - add new tool registration
export const TOOL_DEFINITIONS = {
  // existing tools...
  
  check_status: {
    name: 'check_status',
    description: 'Check status of async jobs with optional incremental polling',
    inputSchema: {
      type: 'object',
      properties: {
        continuation_id: {
          type: 'string',
          description: 'Optional specific job ID to check. If omitted, returns all active/recent jobs'
        },
        since_seq: {
          type: 'number',
          description: 'Optional sequence number for incremental updates'
        }
      }
    }
  }
};

// Add tool function export
export { checkStatusTool } from './checkStatus.js';
```

**Check Status Tool Implementation:**
```javascript
export async function checkStatusTool(args, dependencies) {
  const { asyncJobStore, fileCache, sessionManager } = dependencies;
  const { continuation_id, since_seq } = args;
  
  // Get session ID for ownership verification
  const sessionId = getSessionId(dependencies);
  
  if (continuation_id) {
    // Query specific job
    return await getJobStatus(continuation_id, sessionId, since_seq, dependencies);
  } else {
    // List all jobs for session
    return await listSessionJobs(sessionId, dependencies);
  }
}

// Get specific job status
async function getJobStatus(jobId, sessionId, sinceSeq, dependencies) {
  const { asyncJobStore, fileCache } = dependencies;
  
  // Try memory first (fast path)
  const job = asyncJobStore.get(jobId);
  
  if (job) {
    // Verify session ownership
    if (job.sessionId !== sessionId) {
      return createToolError('Job not found', 'JOB_NOT_FOUND');
    }
    
    // Return current status with optional filtering
    return createJobStatusResponse(job, sinceSeq);
  }
  
  // Fallback to disk cache
  const snapshot = await fileCache.readSnapshot(jobId);
  if (snapshot && snapshot.sessionId === sessionId) {
    return createJobStatusFromSnapshot(snapshot);
  }
  
  return createToolError('Job not found', 'JOB_NOT_FOUND');
}

// List all jobs for session
async function listSessionJobs(sessionId, dependencies) {
  const { asyncJobStore, fileCache } = dependencies;
  const jobs = [];
  
  // Get active jobs from memory
  const activeJobs = asyncJobStore.listBySession(sessionId);
  jobs.push(...activeJobs);
  
  // Get recent completed jobs from disk (last 24 hours)
  const recentJobs = await fileCache.listRecentJobs(sessionId, 24 * 60 * 60 * 1000);
  jobs.push(...recentJobs.filter(job => !jobs.some(j => j.jobId === job.jobId)));
  
  return createToolResponse({
    jobs: jobs.map(job => createJobSummary(job)),
    total: jobs.length,
    active: activeJobs.length,
    completed: recentJobs.length
  });
}
```

**Job Status Response Format:**
```javascript
function createJobStatusResponse(job, sinceSeq) {
  // Filter events by sequence number if provided
  const events = sinceSeq ? 
    job.events.filter(e => e.seq > sinceSeq) : 
    job.events.slice(-50); // Last 50 events by default
  
  const response = {
    continuation_id: job.jobId,
    status: job.status,
    tool: job.tool,
    created_at: new Date(job.createdAt).toISOString(),
    updated_at: new Date(job.updatedAt).toISOString(),
    
    // Overall progress information
    overall: {
      progress: job.overall.progress || 0,
      runtime_ms: job.overall.endedAt ? 
        (job.overall.endedAt - job.overall.startedAt) : 
        (Date.now() - (job.overall.startedAt || job.createdAt))
    },
    
    // Provider-specific information
    providers: Array.from(job.providers.entries()).map(([model, state]) => ({
      provider: getProviderName(model),
      model: model,
      phase: state.phase,
      progress: state.progress,
      tokens_in: state.tokensIn,
      tokens_out: state.tokensOut,
      error: state.error || null
    })),
    
    // Partial output for progress visibility
    partial_output: getPartialOutput(job),
    
    // Events for incremental polling
    events: events,
    next_seq: job.seq, // For next incremental poll
    
    // Final result if completed
    final_result: isJobCompleted(job.status) ? job.overall.result : null,
    
    // Error information if failed
    error: job.status === 'failed' ? job.overall.error : null
  };
  
  // Additional consensus-specific information
  if (job.tool === 'consensus') {
    response.consensus_phase = job.consensus_phase;
    response.providers_completed = job.providers.size;
    response.providers_failed = Array.from(job.providers.values()).filter(p => p.phase === 'error').length;
  }
  
  return createToolResponse(response);
}
```

**Security & Session Management:**
```javascript
function getSessionId(dependencies) {
  const { request, sessionManager } = dependencies;
  
  // Extract session ID from MCP request context
  // This follows existing patterns from HTTP transport
  const sessionId = request?.meta?.sessionId || 
                   sessionManager?.getCurrentSessionId() ||
                   'default';
  
  return sessionId;
}

// Verify job ownership
function verifyJobOwnership(job, sessionId) {
  return job.sessionId === sessionId;
}
```

**Incremental Polling Support:**
```javascript
// Client polling pattern
async function pollJobStatus(continuationId) {
  let lastSeq = 0;
  
  while (true) {
    const response = await checkStatus({ 
      continuation_id: continuationId,
      since_seq: lastSeq 
    });
    
    if (response.events?.length > 0) {
      // Process new events
      processJobEvents(response.events);
      lastSeq = response.next_seq;
    }
    
    if (['completed', 'failed', 'cancelled'].includes(response.status)) {
      return response; // Job finished
    }
    
    await sleep(1000); // Poll every second
  }
}
```

**FileCache Integration:**
```javascript
// Add methods to FileCache for job listing
class FileCache {
  async listRecentJobs(sessionId, maxAgeMs) {
    // Scan recent daily directories
    // Read snapshots filtering by sessionId
    // Return job summaries for listing
  }
  
  async readSnapshot(jobId) {
    // Read result.json from appropriate daily directory
    // Parse and return job snapshot
  }
}
```

**Error Handling:**
- **Job not found**: Clear error message with JOB_NOT_FOUND code
- **Session access denied**: Silent filtering (job appears as not found)
- **File system errors**: Graceful degradation to memory-only data
- **Invalid parameters**: Proper validation with descriptive error messages

**Integration Points:**
- AsyncJobStore: Primary data source for active jobs with polling-based status checks
- FileCache: Fallback for completed jobs and historical data
- Session Management: Security and multi-tenancy support

**Testing Strategy:**
- Test specific job queries with various job states
- Test job listing for sessions with multiple jobs
- Test incremental polling with since_seq parameter
- Test security (users can't see other users' jobs)
- Test error scenarios (not found, access denied)

**Dependencies:**
- AsyncJobStore (task 1) for active job data
- FileCache (task 2) for completed job persistence  
- Existing session management and MCP tool patterns

## Implementation Notes

Successfully implemented check_status MCP tool with all acceptance criteria met. Added getJobsBySession method to AsyncJobStore for efficient session-based job queries. Tool supports both specific job queries and session job listing, with memory-first lookup and FileCache fallback. Includes comprehensive unit tests with 100% coverage of functionality including security, error handling, and response formatting. All tests pass and code quality checks are clean.
## Implementation Plan Reference

Refer to **Async Execution System Architecture Plan** (`backlog/docs/doc-001 - Async-Execution-System-Architecture-Plan.md`) for:
- Complete system architecture and component relationships
- Visual diagrams showing class structure, execution flow, and sequence diagrams
- Integration patterns with existing MCP server infrastructure
- Caching strategy, error handling, and testing approaches
- Context for how this task fits into the overall async execution system
