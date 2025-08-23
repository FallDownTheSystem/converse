---
id: doc-001
title: Async Execution System Architecture Plan
type: technical
created_date: '2025-08-23 16:40'
---

# Async Execution System Architecture Plan

## Overview

This document outlines the comprehensive architecture and implementation plan for adding asynchronous execution capabilities to the Converse MCP Server. The system enables async execution of chat and consensus tools with background processing, comprehensive status checking, and robust caching mechanisms.

## 🎯 Goals

- **Immediate Response**: Return continuation_id instantly when `async=true`, allowing clients to continue other work
- **Background Execution**: Execute long-running operations in background for both single-provider (chat) and multi-provider (consensus) operations  
- **Robust Caching**: Two-tier caching system (memory + disk) with automatic cleanup
- **Backwards Compatibility**: Existing sync behavior unchanged when `async=false` or omitted
- **Detailed Status**: Comprehensive status checking with provider-specific completion and error handling

## 🏗️ Architecture Overview

### Core Components

#### 1. **AsyncJobStore** (In-Memory Cache)
- **Purpose**: Fast access to active job states with TTL-based eviction
- **Technology**: `lru-cache` library with 24-hour TTL and 10k job limit
- **Features**: Job creation, updates, completion tracking, automatic cleanup

#### 2. **FileCache** (Persistent Storage)
- **Purpose**: Durability across server restarts with 3-day retention
- **Technology**: Native `fs/promises` with NDJSON + JSON snapshot pattern
- **Structure**: `cache/async/{yyyy-mm-dd}/{jobId}/journal.ndjson` + `result.json`

#### 3. **JobRunner** (Background Orchestration)
- **Purpose**: Manages background execution with concurrency limits and timeouts
- **Technology**: `p-limit` for bounded concurrency, `AbortController` for cancellation
- **Features**: Non-blocking execution, progress events, graceful error handling

#### 4. **EventBus** (Internal Communication Backbone)
- **Purpose**: Internal event coordination between async components (no client communication)
- **Technology**: Node.js `EventEmitter` with session-based filtering
- **Events**: job.created, job.updated, job.completed, job.failed (internal only)

#### 5. **ProviderStreamNormalizer** (Unified Streaming)
- **Purpose**: Standardizes streaming responses across different LLM providers for internal processing
- **Providers**: OpenAI, Google GenAI, XAI, Anthropic, Mistral, Deepseek, OpenRouter
- **Output**: AsyncGenerator of standardized events (start, delta, usage, end, error) consumed internally

#### 6. **check_status Tool** (Status Interface)
- **Purpose**: Query job status with optional incremental polling
- **Features**: Memory-first lookup, disk fallback, session ownership verification
- **Parameters**: `continuation_id` (optional), `since_seq` (for incremental updates)

## 📊 Visual Architecture

The system architecture is documented through three comprehensive Mermaid diagrams:

### Class Structure
**File**: `backlog/docs/diagrams/async-class-structure.mmd`
- Shows relationships between existing infrastructure and new async components
- Illustrates data models (JobState, JobEvent) and their interactions
- Highlights integration points with current MCP server architecture

### Execution Flow  
**File**: `backlog/docs/diagrams/async-execution-flow.mmd`
- Demonstrates sync vs async execution paths
- Shows background processing workflow from job creation to completion
- Illustrates cleanup and status check flows

### Sequence Diagrams
**File**: `backlog/docs/diagrams/async-execution-sequence.mmd`
- Details step-by-step interactions for async chat execution
- Shows multi-provider consensus orchestration with cross-feedback
- Demonstrates status checking patterns and completion workflows

## 🔄 Execution Workflows

### Async Chat Tool Flow
1. **Request**: Client sends `chat(messages, async=true)`
2. **Job Creation**: AsyncJobStore creates job, returns `continuation_id` immediately
3. **Background Processing**: JobRunner executes chat with provider streaming (internal only)
4. **Internal Processing**: Streaming responses are consumed and buffered internally
5. **Completion**: Final result stored in both memory and disk with complete response
6. **Status Check**: Client can query progress/results via `check_status(continuation_id)`

### Async Consensus Tool Flow
1. **Request**: Client sends `consensus(prompt, models=["gpt-5", "gemini-2.5-pro"], async=true)`
2. **Multi-Provider Setup**: Job created with provider entries for each model
3. **Parallel Execution**: Initial responses from all providers simultaneously
4. **Progress Tracking**: Per-provider progress with overall aggregation
5. **Cross-Feedback Phase**: Models see others' responses and refine their answers
6. **Consensus Building**: Final consensus result with provider contribution details
7. **Error Resilience**: Partial failures result in `completed_with_errors` status

## 💾 Caching Strategy

### Memory Cache (AsyncJobStore)
- **TTL**: 24 hours
- **Capacity**: 10,000 jobs (configurable)
- **Content**: Full job state, streaming buffers, events, final results
- **Cleanup**: Automatic eviction every 10 minutes via existing cleanup scheduler

### File Cache (FileCache)
- **Retention**: 3 days
- **Structure**: Daily directories with job subdirectories
- **Journal**: NDJSON append-only log for streaming events
- **Snapshot**: JSON final result on completion
- **Cleanup**: Daily removal of directories older than 3 days

### Access Pattern
```
check_status(jobId) → 
  AsyncJobStore.get(jobId) → 
    if found: return full state
    else: FileCache.readSnapshot(jobId) → return cached result
```

## 🔄 Provider Streaming Integration

### OpenAI Provider
- **APIs**: Both Chat Completions API and Responses API
- **Models**: All supported (gpt-5, o3, o4-mini, gpt-4o, etc.)
- **Features**: Token usage reporting, reasoning effort, web search

### Google GenAI Provider  
- **API**: `generateContentStream()` method
- **Models**: All Gemini models (2.0-flash, 2.5-flash, 2.5-pro)
- **Features**: Thinking mode streaming, grounding/web search

### XAI Provider
- **API**: OpenAI SDK with XAI base URL
- **Models**: All Grok models (grok-4-0709, grok-3, grok-3-fast)
- **Features**: Live search for grok-4, image input support

### Anthropic Provider
- **API**: MessageCreateStream with Server-Sent Events
- **Models**: All Claude models (Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku)
- **Features**: Thinking mode streaming, caching support, multimodal input

### Mistral Provider
- **API**: Native Mistral SDK streaming or polling-based fallback
- **Models**: Mistral Large, Magistral models, Mistral Medium variants
- **Features**: Function calling, reasoning models with extended timeouts

### Deepseek Provider  
- **API**: OpenAI-compatible SDK with Deepseek base URL
- **Models**: Deepseek V3, Deepseek Reasoner with thinking mode
- **Features**: Code generation, reasoning capabilities, cost-effective inference

### OpenRouter Provider
- **API**: Multi-provider aggregation with dynamic capability detection
- **Models**: 200+ models from various providers (OpenAI, Anthropic, Google, etc.)
- **Features**: Unified interface, automatic fallbacks, model-specific optimizations

## 📡 Status Communication

### MCP Tool Response Pattern
The system follows standard MCP tool patterns where:

- **Immediate Response**: `continuation_id` returned instantly for async operations
- **Status Checking**: Clients poll via `check_status` tool for completion
- **Complete Results**: Full responses provided when job finishes, not streamed
- **Internal Streaming**: Provider streaming used internally for efficiency, not exposed

### Session Management  
- Jobs are associated with session ownership for security
- Status checks validate session ownership
- Automatic cleanup prevents unauthorized access

## 🛡️ Error Handling & Resilience

### Consensus Partial Failures
- **Some Succeed**: Status = `completed_with_errors`, include successful results
- **All Fail**: Status = `failed`, preserve error details
- **Provider Tracking**: Individual provider status and error information

### Resource Management
- **Timeouts**: Configurable per-job timeouts with AbortController
- **Concurrency**: Bounded execution using p-limit
- **Memory**: Automatic cleanup prevents memory leaks
- **Disk Space**: Graceful degradation if disk space low

### Network Resilience
- **Streaming Failures**: Automatic retries with exponential backoff (Google provider)
- **Connection Issues**: Proper error propagation with recovery information
- **Partial Streams**: Preserve partial results on interruption

## 🔧 Implementation Phases

### Phase 1: Foundation (Tasks 1-5)
1. **AsyncJobStore**: LRU cache-based job state management
2. **FileCache**: File system persistence with NDJSON + snapshots  
3. **JobRunner**: Background execution with concurrency control
4. **EventBus**: Event system for job lifecycle management
5. **ProviderStreamNormalizer**: Unified streaming interface

### Phase 2: Tool Integration (Tasks 6-8)
6. **Chat Tool Async**: Add `async` parameter support to chat tool
7. **Consensus Tool Async**: Multi-provider async execution with detailed tracking
8. **check_status Tool**: Status query interface with incremental polling

### Phase 3: Provider Streaming (Tasks 9-17) 
9. **OpenAI Streaming**: Both Chat Completions and Responses API streaming
10. **Google GenAI Streaming**: generateContentStream with thinking mode
11. **XAI Streaming**: OpenAI-compatible streaming with XAI features
12. **SDK Updates**: Update all provider SDKs and fix streaming implementations (HIGH PRIORITY)
13. **Anthropic Streaming**: MessageCreateStream with SSE event processing
14. **Mistral Streaming**: Native SDK streaming or polling-based fallback
15. **Deepseek Streaming**: OpenAI-compatible streaming with thinking mode
16. **OpenRouter Streaming**: Multi-provider streaming aggregation

### Phase 4: Advanced Features (Task 17)
17. **Job Cancellation**: Optional AbortController-based cancellation support

## 🧪 Testing Strategy

### Unit Tests
- **Component Isolation**: Each component tested independently with mocks
- **Edge Cases**: TTL eviction, disk failures, network timeouts
- **Error Scenarios**: Provider failures, partial consensus, memory limits

### Integration Tests
- **End-to-End Flows**: Full async execution with real provider mocking
- **Status Communication**: Complete response delivery and session filtering
- **Caching Behavior**: Memory/disk coordination and cleanup

### Performance Tests
- **Concurrency**: Multiple concurrent jobs with resource limits
- **Memory Usage**: Long-running jobs and cleanup effectiveness  
- **Disk I/O**: Journal writing and snapshot performance

## 🚀 Deployment Considerations

### Configuration
- **Environment Variables**: TTL settings, concurrency limits, cleanup intervals
- **Provider Settings**: Streaming timeouts, retry policies
- **Disk Limits**: Cache directory size monitoring

### Monitoring
- **Job Metrics**: Creation rate, completion time, failure rates
- **Resource Usage**: Memory consumption, disk usage, active job count
- **Provider Health**: Streaming success rates, error patterns

### Scalability
- **In-Process Design**: Suitable for moderate concurrency (hundreds of jobs)
- **Future Extensions**: Pluggable interfaces allow Redis/database backends
- **Horizontal Scaling**: Architecture supports distributed deployment

## 🔄 Migration & Compatibility

### Backwards Compatibility
- **Default Behavior**: `async=false` preserves existing sync behavior
- **API Compatibility**: No changes to existing tool schemas or responses
- **Client Impact**: Clients can opt-in to async features gradually

### Migration Path
1. **Deploy Foundation**: Core components without breaking changes
2. **Enable Async Tools**: Add `async` parameter support (default false)
3. **Client Updates**: Clients can begin using async features
4. **Full Adoption**: Gradual migration of use cases to async execution

## 📋 Success Metrics

### Functional Goals
- ✅ Chat and consensus tools support `async=true` parameter
- ✅ Immediate `continuation_id` return for async requests  
- ✅ Complete response delivery when jobs finish
- ✅ Comprehensive status checking with provider details
- ✅ Robust error handling with partial failure support

### Performance Goals
- ✅ <100ms response time for async job creation
- ✅ <1s lookup time for status checks (memory)
- ✅ <5s lookup time for status checks (disk)
- ✅ 99%+ reliability for job completion tracking
- ✅ Automatic cleanup with no manual intervention required

### Quality Goals
- ✅ 100% backwards compatibility maintained
- ✅ Comprehensive test coverage (>90%)
- ✅ Zero memory leaks in long-running scenarios
- ✅ Graceful degradation under resource constraints
- ✅ Clear error messages and recovery guidance

---

## 📚 Related Documents

- **Tasks**: See backlog tasks `task-001` through `task-017` for detailed implementation steps
- **Diagrams**: 
  - Class structure: `backlog/docs/diagrams/async-class-structure.mmd`
  - Execution flow: `backlog/docs/diagrams/async-execution-flow.mmd`  
  - Sequence diagrams: `backlog/docs/diagrams/async-execution-sequence.mmd`
- **API Documentation**: Will be updated in `docs/API.md` upon implementation
- **Architecture Guide**: Will be updated in `docs/ARCHITECTURE.md` with async patterns

This architecture plan provides a comprehensive blueprint for implementing robust, scalable async execution while maintaining the functional patterns and quality standards of the existing Converse MCP Server.

