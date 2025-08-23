---
id: task-012
title: Add job cancellation support via abort controllers
status: To Do
assignee: []
created_date: '2025-08-23 15:16'
updated_date: '2025-08-23 18:32'
labels:
  - async
  - enhancement
  - cancellation
  - abort
dependencies:
  - task-003
  - task-001
---

## Description

Add the ability to cancel running async jobs through AbortController integration. Provides a cancel_job MCP tool and graceful cancellation of in-progress LLM requests across all providers. Updates job status to 'cancelled' and cleans up resources appropriately. This is an optional enhancement that adds advanced job management capabilities for long-running consensus operations.

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 New cancel_job MCP tool with continuation_id parameter for job cancellation
- [ ] #2 AbortController integration in JobRunner for graceful job termination
- [ ] #3 Provider-level cancellation support for OpenAI, Google GenAI, and XAI streaming
- [ ] #4 Job status updated to 'cancelled' when successfully cancelled
- [ ] #5 Timeout-based automatic cancellation for jobs exceeding configured limits
- [ ] #6 Partial result preservation for consensus jobs cancelled mid-execution
- [ ] #7 Unit tests covering cancellation scenarios, timeouts, and resource cleanup
<!-- AC:END -->

## Implementation Plan

**Architecture Approach:**
- Add new cancel_job MCP tool for user-initiated job cancellation
- Extend JobRunner with AbortController integration for graceful termination
- Implement provider-level stream cancellation support
- Add timeout-based automatic cancellation for long-running jobs
- Preserve partial results when consensus jobs are cancelled mid-execution

**Key Files to Modify:**
- `src/tools/cancelJob.js` - New MCP tool for job cancellation
- `src/async/jobRunner.js` - Add AbortController support to background execution
- `src/async/asyncJobStore.js` - Add cancelled status and cleanup methods
- `src/providers/openai.js`, `src/providers/google.js`, `src/providers/xai.js` - Stream cancellation
- `src/tools/index.js` - Register cancel_job tool
- `tests/tools/cancelJob.test.js` - Cancellation test scenarios

**Architecture Reference Points:**
- `src/tools/chat.js:25-50` - MCP tool function signature patterns
- `src/async/jobRunner.js:150-200` - Background execution patterns (from task 3)
- `src/async/asyncJobStore.js:80-120` - Job state management patterns (from task 1)
- `src/providers/openai.js:100-150` - Provider streaming patterns (from task 9)

**Cancel Job MCP Tool:**
```javascript
// New MCP tool registration in src/tools/index.js
export const TOOL_DEFINITIONS = {
  // existing tools...
  
  cancel_job: {
    name: 'cancel_job',
    description: 'Cancel a running async job by continuation_id',
    inputSchema: {
      type: 'object',
      properties: {
        continuation_id: {
          type: 'string',
          description: 'Job ID to cancel'
        },
        reason: {
          type: 'string',
          description: 'Optional reason for cancellation',
          default: 'User requested cancellation'
        }
      },
      required: ['continuation_id']
    }
  }
};

// New tool implementation in src/tools/cancelJob.js
export async function cancelJobTool(args, dependencies) {
  const { continuation_id, reason = 'User requested cancellation' } = args;
  const { asyncJobStore, jobRunner, eventBus } = dependencies;
  
  // Get session ID for security check
  const sessionId = getSessionId(dependencies);
  
  // Verify job exists and user owns it
  const job = asyncJobStore.get(continuation_id);
  if (!job) {
    return createToolError('Job not found', 'JOB_NOT_FOUND');
  }
  
  if (job.sessionId !== sessionId) {
    return createToolError('Job not found', 'JOB_NOT_FOUND'); // Don't reveal existence
  }
  
  // Check if job is cancellable
  if (!['queued', 'running'].includes(job.status)) {
    return createToolError(`Job cannot be cancelled (status: ${job.status})`, 'JOB_NOT_CANCELLABLE');
  }
  
  try {
    // Request cancellation through JobRunner
    const cancelled = await jobRunner.cancel(continuation_id, reason);
    
    if (cancelled) {
      return createToolResponse({
        continuation_id,
        status: 'cancelled',
        reason,
        message: 'Job cancellation requested successfully'
      });
    } else {
      return createToolError('Job could not be cancelled', 'CANCELLATION_FAILED');
    }
    
  } catch (error) {
    return createToolError(`Cancellation failed: ${error.message}`, 'CANCELLATION_ERROR');
  }
}
```

**JobRunner AbortController Integration:**
```javascript
// Extend JobRunner class (from task 3) with cancellation support
export class JobRunner {
  constructor(dependencies) {
    this.asyncJobStore = dependencies.asyncJobStore;
    this.eventBus = dependencies.eventBus;
    this.fileCache = dependencies.fileCache;
    this.concurrencyLimit = pLimit(10);
    this.activeJobs = new Map(); // Track active AbortControllers
  }
  
  async submit(jobSpec, runFunction, options = {}) {
    const jobId = generateContinuationId();
    const abortController = new AbortController();
    
    // Store abort controller for cancellation
    this.activeJobs.set(jobId, {
      abortController,
      startTime: Date.now(),
      timeout: options.timeout || 5 * 60 * 1000 // 5 minute default
    });
    
    // Create job with cancellation support
    const job = this.asyncJobStore.create({
      jobId,
      sessionId: jobSpec.sessionId,
      tool: jobSpec.tool,
      status: 'queued',
      createdAt: Date.now(),
      abortSignal: abortController.signal
    });
    
    // Set up timeout-based cancellation
    const timeoutId = setTimeout(() => {
      if (this.activeJobs.has(jobId)) {
        this.cancel(jobId, 'Timeout exceeded');
      }
    }, options.timeout || 5 * 60 * 1000);
    
    this.activeJobs.get(jobId).timeoutId = timeoutId;
    
    // Submit for background execution
    this.executeInBackground(jobId, runFunction, options);
    
    return jobId;
  }
  
  // New cancellation method
  async cancel(jobId, reason = 'Cancelled') {
    const jobControl = this.activeJobs.get(jobId);
    const job = this.asyncJobStore.get(jobId);
    
    if (!jobControl || !job) {
      return false; // Job not found or already completed
    }
    
    try {
      // Signal abortion
      jobControl.abortController.abort(reason);
      
      // Clear timeout
      if (jobControl.timeoutId) {
        clearTimeout(jobControl.timeoutId);
      }
      
      // Update job status
      this.asyncJobStore.update(jobId, {
        status: 'cancelled',
        endedAt: Date.now(),
        cancelReason: reason
      });
      
      // Preserve partial results for consensus jobs
      const partialResults = this.preservePartialResults(job);
      if (partialResults) {
        this.fileCache.writeSnapshot(jobId, {
          jobId,
          status: 'cancelled', 
          partialResults,
          cancelReason: reason
        });
      }
      
      // Emit cancellation event
      this.eventBus.emitJobCancelled(jobId, job.sessionId, { reason });
      
      // Cleanup
      this.activeJobs.delete(jobId);
      
      return true;
      
    } catch (error) {
      debugError(`[JobRunner] Cancellation failed for ${jobId}:`, error);
      return false;
    }
  }
  
  // Modified background execution with abort signal handling
  async executeInBackground(jobId, runFunction, options) {
    const job = this.asyncJobStore.get(jobId);
    const jobControl = this.activeJobs.get(jobId);
    
    if (!job || !jobControl) return;
    
    try {
      // Update to running
      this.asyncJobStore.update(jobId, { status: 'running', startedAt: Date.now() });
      this.eventBus.emitJobUpdated(jobId, job.sessionId, { status: 'running' });
      
      // Execute with abort signal
      const result = await runFunction({
        job,
        signal: jobControl.abortController.signal,
        emit: (event) => {
          // Check for cancellation before emitting
          if (jobControl.abortController.signal.aborted) return;
          
          this.eventBus.emitJobUpdated(jobId, job.sessionId, event);
          this.fileCache.writeJournalEvent(jobId, event);
        },
        update: (patch) => {
          if (jobControl.abortController.signal.aborted) return;
          this.asyncJobStore.update(jobId, patch);
        }
      });
      
      // Job completed successfully
      if (!jobControl.abortController.signal.aborted) {
        this.completeJob(jobId, result);
      }
      
    } catch (error) {
      if (error.name === 'AbortError' || jobControl.abortController.signal.aborted) {
        // Job was cancelled - status already set in cancel()
        debugInfo(`[JobRunner] Job ${jobId} was cancelled`);
      } else {
        // Job failed
        this.failJob(jobId, error);
      }
    } finally {
      // Always cleanup
      if (jobControl.timeoutId) {
        clearTimeout(jobControl.timeoutId);
      }
      this.activeJobs.delete(jobId);
    }
  }
  
  // Preserve partial results for consensus jobs
  preservePartialResults(job) {
    if (job.tool !== 'consensus') return null;
    
    const partialResults = {};
    const completedProviders = [];
    
    // Extract completed provider responses
    job.providers.forEach((state, model) => {
      if (state.phase === 'completed' && state.result) {
        completedProviders.push({
          model,
          result: state.result,
          completedAt: state.completedAt
        });
      }
    });
    
    if (completedProviders.length > 0) {
      partialResults.completedProviders = completedProviders;
      partialResults.totalProviders = job.providers.size;
      partialResults.completionRate = completedProviders.length / job.providers.size;
    }
    
    return completedProviders.length > 0 ? partialResults : null;
  }
}
```

**Provider-Level Stream Cancellation:**
```javascript
// OpenAI provider cancellation support (src/providers/openai.js)
async function* invokeStreamingGenerator(messages, options) {
  const { signal } = options; // AbortSignal from JobRunner
  
  try {
    const openai = new OpenAI({ apiKey: config.apiKeys.openai });
    
    // Create stream with abort signal
    const stream = await openai.chat.completions.create({
      // ... existing payload
      signal // Pass abort signal to OpenAI SDK
    });
    
    for await (const chunk of stream) {
      // Check for cancellation before processing each chunk
      if (signal?.aborted) {
        yield { type: 'cancelled', data: { reason: signal.reason } };
        return;
      }
      
      // Process chunk normally
      const processed = processChatCompletionsChunk(chunk);
      if (processed) yield processed;
    }
    
  } catch (error) {
    if (error.name === 'AbortError' || signal?.aborted) {
      yield { type: 'cancelled', data: { reason: signal.reason || 'Cancelled' } };
    } else {
      yield { type: 'error', data: { error: error.code, message: error.message } };
    }
  }
}

// Similar patterns for Google GenAI and XAI providers
// Google: Pass signal to generateContentStream()
// XAI: Pass signal to OpenAI-compatible stream creation
```

**AsyncJobStore Cancellation Support:**
```javascript
// Extend AsyncJobStore (from task 1) with cancellation methods
export class AsyncJobStore {
  // ... existing methods
  
  // Cancel a job
  cancel(jobId, reason = 'Cancelled') {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    
    // Only cancel if job is active
    if (!['queued', 'running'].includes(job.status)) {
      return false;
    }
    
    // Update job state
    job.status = 'cancelled';
    job.overall.endedAt = Date.now();
    job.overall.cancelReason = reason;
    job.updatedAt = Date.now();
    job.seq++;
    
    // Add cancellation event
    job.events.push({
      seq: job.seq,
      timestamp: Date.now(),
      type: 'job.cancelled',
      data: { reason }
    });
    
    return true;
  }
  
  // Get all cancellable jobs for a session
  getCancellableJobs(sessionId) {
    const jobs = [];
    for (const job of this.jobs.values()) {
      if (job.sessionId === sessionId && ['queued', 'running'].includes(job.status)) {
        jobs.push({
          jobId: job.jobId,
          tool: job.tool,
          status: job.status,
          createdAt: job.createdAt
        });
      }
    }
    return jobs;
  }
  
  // Cleanup cancelled jobs (called by TTL expiration)
  cleanup() {
    const now = Date.now();
    const expiredJobs = [];
    
    for (const [jobId, job] of this.jobs.entries()) {
      const age = now - job.createdAt;
      const maxAge = job.status === 'cancelled' ? 
        this.cancelledJobTTL : 
        this.defaultTTL;
        
      if (age > maxAge) {
        expiredJobs.push(jobId);
      }
    }
    
    expiredJobs.forEach(jobId => this.jobs.delete(jobId));
    return expiredJobs.length;
  }
}
```

**EventBus Cancellation Events:**
```javascript
// Add cancellation event types to EventBus (from task 4)
export class EventBus extends EventEmitter {
  // ... existing methods
  
  emitJobCancelled(jobId, sessionId, data) {
    const event = {
      type: 'job.cancelled',
      jobId,
      sessionId,
      timestamp: Date.now(),
      data: {
        reason: data.reason,
        partialResults: data.partialResults || null
      }
    };
    
    this.emit('job.cancelled', event);
    this.emit('job.*', event);
  }
}
```

**Timeout-Based Auto-Cancellation:**
```javascript
// Add timeout configuration to JobRunner
const JOB_TIMEOUTS = {
  chat: 5 * 60 * 1000,      // 5 minutes
  consensus: 15 * 60 * 1000, // 15 minutes  
  default: 10 * 60 * 1000    // 10 minutes
};

export class JobRunner {
  getJobTimeout(tool) {
    return JOB_TIMEOUTS[tool] || JOB_TIMEOUTS.default;
  }
  
  async submit(jobSpec, runFunction, options = {}) {
    const timeout = options.timeout || this.getJobTimeout(jobSpec.tool);
    
    // ... setup code
    
    // Set timeout for auto-cancellation
    const timeoutId = setTimeout(() => {
      this.cancel(jobId, `Timeout exceeded (${timeout}ms)`);
    }, timeout);
    
    this.activeJobs.get(jobId).timeoutId = timeoutId;
    
    // ... rest of method
  }
}
```

**Integration Testing:**
```javascript
// Integration test for cancellation scenarios
describe('Job Cancellation Integration', () => {
  it('should cancel running job via cancel_job tool', async () => {
    // 1. Start long-running consensus job
    const chatResponse = await submitConsensusJob({
      prompt: 'Complex analysis task',
      models: ['gpt-4', 'gemini-pro', 'grok-3'],
      async: true
    });
    
    const { continuation_id } = chatResponse;
    
    // 2. Wait for job to start
    await waitForJobStatus(continuation_id, 'running');
    
    // 3. Cancel the job
    const cancelResponse = await cancelJob({ continuation_id });
    
    expect(cancelResponse.status).toBe('cancelled');
    
    // 4. Verify job status updated
    const statusResponse = await checkStatus({ continuation_id });
    expect(statusResponse.status).toBe('cancelled');
    expect(statusResponse.partial_results).toBeDefined();
  });
  
  it('should auto-cancel job on timeout', async () => {
    // Mock slow provider to trigger timeout
    mockProviderDelay('openai', 10000);
    
    const response = await submitChatJob({
      prompt: 'test',
      async: true,
      timeout: 1000 // 1 second timeout
    });
    
    // Wait for timeout
    await sleep(2000);
    
    const status = await checkStatus({ continuation_id: response.continuation_id });
    expect(status.status).toBe('cancelled');
    expect(status.error).toContain('Timeout exceeded');
  });
});
```

**Error Handling & Edge Cases:**
- **Job not found**: Return appropriate error without revealing existence
- **Job already completed**: Cannot cancel completed/failed jobs
- **Provider stream errors**: Handle abort errors gracefully 
- **Partial consensus results**: Preserve completed provider responses
- **Timeout vs manual cancel**: Different reasons in event data
- **Resource cleanup**: Always cleanup AbortController and timeouts

**Integration Points:**
- JobRunner (task 3): Core cancellation orchestration
- AsyncJobStore (task 1): Status updates and cleanup
- EventBus (task 4): Cancellation event broadcasting  
- All provider implementations (tasks 9-11): Stream cancellation support

**Testing Strategy:**
- Test user-initiated cancellation via cancel_job tool
- Test timeout-based auto-cancellation
- Test provider-level stream cancellation (network interruption simulation)
- Test partial result preservation for consensus jobs
- Test security (users can't cancel other users' jobs)
- Test resource cleanup and memory leaks

**Dependencies:**
- JobRunner with AbortController support
- Provider streaming implementations with signal support
- EventBus for cancellation event broadcasting
- MCP tool registration patterns

## Implementation Plan Reference

Refer to **Async Execution System Architecture Plan** (`backlog/docs/doc-001 - Async-Execution-System-Architecture-Plan.md`) for:
- Complete system architecture and component relationships
- Visual diagrams showing class structure, execution flow, and sequence diagrams
- Integration patterns with existing MCP server infrastructure
- Caching strategy, error handling, and testing approaches
- Context for how this task fits into the overall async execution system
