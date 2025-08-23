---
id: task-007
title: Add async parameter support to consensus tool
status: To Do
assignee: []
created_date: '2025-08-23 15:14'
updated_date: '2025-08-23 17:52'
labels:
  - async
  - tools
  - consensus
  - multi-provider
dependencies:
  - task-003
  - task-005
---

## Description

Extend the existing consensus tool to support async execution mode with detailed multi-provider progress tracking. When async=true, the tool returns a continuation_id immediately and executes consensus in background with two phases: initial responses and cross-feedback refinement. Tracks per-provider progress, handles partial failures gracefully, and provides detailed status updates throughout the consensus process.

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Add async boolean parameter to consensus tool schema (defaults to false)
- [ ] #2 Backwards compatibility maintained - existing sync consensus behavior unchanged
- [ ] #3 When async=true, return continuation_id immediately and start background execution
- [ ] #4 Two-phase async execution: initial responses + cross-feedback refinement
- [ ] #5 Per-provider progress tracking with phase information (initializing, prompting, streaming, finished)
- [ ] #6 Graceful handling of partial provider failures (completed_with_errors status)
- [ ] #7 Integration with ProviderStreamNormalizer for unified progress updates across all providers
- [ ] #8 Unit tests covering sync/async modes, partial failures, and multi-phase progress tracking
<!-- AC:END -->

## Implementation Plan

**Architecture Approach:**
- Add async boolean parameter to existing consensus tool schema (defaults to false)
- Extend existing two-phase consensus execution (initial + cross-feedback) for async mode
- Per-provider progress tracking with detailed phase information
- Graceful partial failure handling (completed_with_errors status)
- Real-time progress aggregation across multiple providers

**Key Files to Modify:**
- `src/tools/consensus.js` - Extend existing consensusTool function with async parameter support
- `tests/tools/consensus.test.js` - Add async execution test cases with multi-provider scenarios

**Architecture Reference Points:**
- `src/tools/consensus.js:25-598` - Existing consensus implementation patterns
- `src/tools/consensus.js:238-259` - Current parallel execution with Promise.allSettled
- `src/tools/consensus.js:415-459` - Cross-feedback refinement phase implementation
- `src/continuationStore.js:308-311` - generateContinuationId() for job IDs

**Consensus Tool Async Extension:**
```javascript
export async function consensusTool(args, dependencies) {
  // Extract async parameter (defaults to false)
  const { async = false, ...otherArgs } = args;
  
  if (!async) {
    // Existing synchronous behavior - NO CHANGES
    return await executeConsensusSync(otherArgs, dependencies);
  }
  
  // New asynchronous execution path
  return await executeConsensusAsync(otherArgs, dependencies);
}

// New async execution function
async function executeConsensusAsync(args, dependencies) {
  const { jobRunner, asyncJobStore } = dependencies;
  const { models } = args;
  
  // 1. Create job with per-provider tracking
  const continuationId = generateContinuationId();
  const jobSpec = {
    tool: 'consensus',
    args,
    sessionId: getSessionId(),
    providers: models.map(model => ({
      model,
      phase: 'queued', 
      progress: 0.0,
      tokensIn: 0,
      tokensOut: 0
    }))
  };
  
  // 2. Submit to JobRunner for background execution
  const jobId = jobRunner.submit(
    jobSpec,
    async (context) => await runConsensusJob(context),
    { timeout: 600000 } // 10 minutes for consensus
  );
  
  return createToolResponse({
    continuation_id: jobId,
    status: 'queued',
    started_at: new Date().toISOString(),
    tool: 'consensus',
    providers: jobSpec.providers.length
  });
}
```

**Multi-Provider Async Execution:**
```javascript
async function runConsensusJob(context) {
  const { job, signal, emit, update, providers, config } = context;
  const { models, enable_cross_feedback = true } = job.args;
  
  // Phase 1: Initial responses from all providers (parallel)
  update({ consensus_phase: 'initial_responses' });
  emit({ type: 'consensus.phase_start', phase: 'initial_responses' });
  
  const initialResults = await Promise.allSettled(
    models.map(async (model) => {
      return await executeProviderWithStreaming(model, context);
    })
  );
  
  // Analyze initial results for partial failures
  const successful = initialResults.filter(r => r.status === 'fulfilled');
  const failed = initialResults.filter(r => r.status === 'rejected');
  
  if (successful.length === 0) {
    // All providers failed
    throw new Error('All providers failed in initial phase');
  }
  
  // Phase 2: Cross-feedback refinement (if enabled and multiple successes)
  let finalResults = successful.map(r => r.value);
  
  if (enable_cross_feedback && successful.length > 1) {
    update({ consensus_phase: 'cross_feedback' });
    emit({ type: 'consensus.phase_start', phase: 'cross_feedback' });
    
    finalResults = await Promise.allSettled(
      successful.map(async (result) => {
        return await executeCrossFeedbackWithStreaming(result.value, context);
      })
    );
  }
  
  // Build final consensus result
  const consensusResult = buildConsensusResult(finalResults, failed);
  
  // Determine final status
  const status = failed.length > 0 ? 'completed_with_errors' : 'completed';
  
  return { result: consensusResult, status, errors: failed.map(f => f.reason) };
}
```

**Per-Provider Progress Tracking:**
```javascript
async function executeProviderWithStreaming(model, context) {
  const { emit, update } = context;
  const providerName = getProviderName(model);
  
  // Update provider phase
  updateProviderState(model, { phase: 'initializing', progress: 0.05 });
  emit({ type: 'provider.phase_change', provider: providerName, phase: 'initializing' });
  
  // Get normalized stream
  const providerStream = normalizeProviderStream(providerName, model, messages, options);
  
  let accumulatedText = '';
  let tokenCount = 0;
  
  for await (const event of providerStream) {
    switch (event.type) {
      case 'start':
        updateProviderState(model, { phase: 'prompting', progress: 0.1 });
        emit({ type: 'provider.started', provider: providerName, model });
        break;
        
      case 'delta':
        // Update streaming progress
        accumulatedText += event.data.textDelta;
        tokenCount++;
        const streamingProgress = Math.min(0.9, 0.1 + (tokenCount / 2000) * 0.8);
        updateProviderState(model, { 
          phase: 'streaming', 
          progress: streamingProgress,
          partial_output: accumulatedText.slice(-500) // Keep last 500 chars
        });
        emit({ type: 'provider.delta', provider: providerName, delta: event.data.textDelta });
        break;
        
      case 'usage':
        updateProviderState(model, { 
          tokensIn: event.data.inputTokens,
          tokensOut: event.data.outputTokens 
        });
        break;
        
      case 'end':
        updateProviderState(model, { phase: 'completed', progress: 1.0 });
        emit({ type: 'provider.completed', provider: providerName });
        break;
        
      case 'error':
        updateProviderState(model, { phase: 'error', error: event.data });
        emit({ type: 'provider.error', provider: providerName, error: event.data });
        throw new Error(`Provider ${providerName} failed: ${event.data.message}`);
    }
  }
  
  return { provider: providerName, model, content: accumulatedText };
}
```

**Overall Progress Calculation:**
```javascript
function calculateOverallProgress(providers) {
  const startedProviders = providers.filter(p => p.progress > 0);
  if (startedProviders.length === 0) return 0;
  
  const avgProgress = startedProviders.reduce((sum, p) => sum + p.progress, 0) / startedProviders.length;
  return Math.min(0.95, avgProgress); // Cap at 95% until final consensus
}
```

**Error Handling & Partial Failures:**
- **Some providers fail**: Status = `completed_with_errors`, include successful results
- **All providers fail**: Status = `failed`, preserve all error details  
- **Timeout scenarios**: Per-provider timeouts vs overall job timeout
- **Cross-feedback failures**: Graceful fallback to initial responses

**Integration Points:**
- JobRunner: Complex multi-provider background orchestration
- ProviderStreamNormalizer: Unified streaming from multiple providers simultaneously  
- AsyncJobStore: Rich job state with per-provider tracking
- EventBus: Detailed progress events for each provider and phase

**Status Response Format:**
```javascript
{
  status: 'running',
  tool: 'consensus',
  consensus_phase: 'cross_feedback',
  overall_progress: 0.73,
  providers: [
    { provider: 'openai', model: 'gpt-5', phase: 'completed', progress: 1.0, tokens_out: 450 },
    { provider: 'google', model: 'gemini-2.5-pro', phase: 'streaming', progress: 0.65, tokens_out: 320 },
    { provider: 'xai', model: 'grok-4', phase: 'error', error: 'rate_limit_exceeded' }
  ],
  partial_consensus: 'Based on available responses...'
}
```

**Dependencies:**
- JobRunner (task 3) for multi-provider orchestration
- ProviderStreamNormalizer (task 5) for unified streaming across providers
- AsyncJobStore (task 1) for complex job state management
- EventBus (task 4) for detailed progress broadcasting

## Implementation Plan Reference

Refer to **Async Execution System Architecture Plan** (`backlog/docs/doc-001 - Async-Execution-System-Architecture-Plan.md`) for:
- Complete system architecture and component relationships
- Visual diagrams showing class structure, execution flow, and sequence diagrams
- Integration patterns with existing MCP server infrastructure
- Caching strategy, error handling, and testing approaches
- Context for how this task fits into the overall async execution system
