---
id: task-005
title: Create ProviderStreamNormalizer for unified streaming interface
status: To Do
assignee: []
created_date: '2025-08-23 15:13'
updated_date: '2025-08-23 18:37'
labels:
  - async
  - foundation
  - streaming
  - providers
dependencies:
  - task-009
  - task-010
  - task-011
  - task-014
  - task-015
  - task-016
  - task-017
---

## Description

Create a unified streaming interface that normalizes streaming responses from different LLM providers (OpenAI, Google GenAI, XAI) into a consistent event format. Converts provider-specific streaming formats into standardized events (start, delta, usage, end, error) that can be consumed uniformly by chat and consensus tools. Enables internal stream normalization for efficient async processing and seamless provider switching.
## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ProviderStreamNormalizer class with normalize() method for each provider
- [ ] #2 Unified event format with types: start, delta, usage, end, error
- [ ] #3 OpenAI streaming normalization (both Chat Completions and Responses API)
- [ ] #4 Google GenAI streaming normalization (generateContentStream)
- [ ] #5 XAI streaming normalization (OpenAI-compatible format)
- [ ] #6 Event payload includes provider, model, timestamp, and normalized data
- [ ] #7 AsyncGenerator interface returning standardized streaming events
- [ ] #8 Unit tests with mock provider streams and event validation
<!-- AC:END -->


## Implementation Plan

**Architecture Approach:**
- Provider-specific normalizer functions returning unified AsyncGenerator streams
- Standardized event types: start, delta, usage, end, error
- Plugin pattern allowing new providers without changing core logic
- Error resilience with automatic retry logic (Google) and graceful degradation
- Internal stream buffering for efficient async processing

**Key Files to Create:**
- `src/async/providerStreamNormalizer.js` - Main normalizer implementation
- `tests/async/providerStreamNormalizer.test.js` - Unit tests with mock streams

**Architecture Reference Points:**
- `src/providers/openai.js:328-564` - OpenAI provider invoke patterns and error handling
- `src/providers/google.js:332-504` - Google GenAI provider patterns and retry logic
- `src/providers/xai.js:170-307` - XAI provider patterns and request structure
- `src/tools/consensus.js:238-259` - Existing Promise.allSettled parallel patterns

**Provider Stream Normalizer Interface:**
```javascript
class ProviderStreamNormalizer {
  constructor(dependencies) {
    this.providers = dependencies.providers;
    this.config = dependencies.config;
  }

  // Main normalization entry point
  async* normalizeProviderStream(providerName, model, messages, options) {
    const normalizer = this.getNormalizer(providerName);
    yield* normalizer(model, messages, options);
  }

  // Provider-specific normalizers
  async* normalizeOpenAIStream(model, messages, options) { }
  async* normalizeGoogleStream(model, messages, options) { }  
  async* normalizeXAIStream(model, messages, options) { }
}
```

**Unified Event Format:**
```javascript
// start event
{
  type: 'start',
  provider: 'openai',
  model: 'gpt-5', 
  timestamp: 1706123456000,
  data: {
    requestId: 'req_abc123',
    estimatedTokens: 2000
  }
}

// delta event (text streaming)
{
  type: 'delta',
  provider: 'openai',
  model: 'gpt-5',
  timestamp: 1706123457000,
  data: {
    textDelta: 'Hello, how can I help',
    role: 'assistant',
    index: 0
  }
}

// usage event (token counting)
{
  type: 'usage',
  provider: 'openai', 
  model: 'gpt-5',
  timestamp: 1706123458000,
  data: {
    inputTokens: 150,
    outputTokens: 890,
    totalTokens: 1040
  }
}

// end event (completion)
{
  type: 'end',
  provider: 'openai',
  model: 'gpt-5', 
  timestamp: 1706123470000,
  data: {
    finishReason: 'stop',
    finalUsage: { inputTokens: 150, outputTokens: 890 }
  }
}

// error event (failures)
{
  type: 'error',
  provider: 'openai',
  model: 'gpt-5',
  timestamp: 1706123458000,
  data: {
    error: 'rate_limit_exceeded',
    message: 'Rate limit exceeded',
    retryAfter: 30000,
    recoverable: true
  }
}
```

**Provider-Specific Implementation:**

**OpenAI Normalizer:**
- Handle both Chat Completions API and Responses API streaming formats
- Extract deltas from `choices[0].delta.content` (Chat) or `output_text` (Responses)
- Token usage from final chunk with `stream_options.include_usage: true`
- Error mapping from OpenAI error codes to normalized format

**Google GenAI Normalizer:**
- Use `generateContentStream()` with thinking mode support
- Extract text deltas from streaming response chunks
- Handle `usageMetadata` for token counting
- Implement retry logic with exponential backoff (existing in google.js)
- Support grounding metadata from web search

**XAI Normalizer:**
- OpenAI-compatible streaming via XAI base URL
- Handle live search results for grok-4-0709 
- Extract deltas from standard OpenAI streaming format
- Support multimodal input (images) for grok-4

**Error Handling Strategy:**
- Provider failures don't crash the normalizer
- Retryable errors (network, temporary) handled with exponential backoff
- Non-retryable errors (quota, auth) immediately surfaced as error events
- Partial stream recovery when possible (resume from last successful chunk)

**Integration Points:**
- JobRunner: Consumes normalized streams for internal processing
- Chat/Consensus tools: Use normalized streams for unified stream handling
- AsyncJobStore: Store streaming events for status checking
- EventBus: Emit normalized events for async job lifecycle management

**Testing Strategy:**
- Mock provider streams with various success/error scenarios
- Test event format standardization across all providers
- Error handling and retry behavior testing
- Performance testing with concurrent streams

**Dependencies:**
- Existing provider implementations (openai.js, google.js, xai.js) 
- Provider SDKs: openai, @google/genai packages
- No additional dependencies required

## Implementation Plan Reference

Refer to **Async Execution System Architecture Plan** (`backlog/docs/doc-001 - Async-Execution-System-Architecture-Plan.md`) for:
- Complete system architecture and component relationships
- Visual diagrams showing class structure, execution flow, and sequence diagrams
- Integration patterns with existing MCP server infrastructure
- Caching strategy, error handling, and testing approaches
- Context for how this task fits into the overall async execution system
