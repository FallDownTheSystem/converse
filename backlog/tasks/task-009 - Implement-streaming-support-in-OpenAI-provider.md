---
id: task-009
title: Implement streaming support in OpenAI provider
status: Done
assignee:
  - '@ai'
created_date: '2025-08-23 15:15'
updated_date: '2025-08-24 08:16'
labels:
  - async
  - providers
  - openai
  - streaming
dependencies: []
---

## Description

Add streaming capabilities to the OpenAI provider for internal streaming consumption in async execution. Implements streaming for both Chat Completions API and Responses API across all supported OpenAI models (gpt-5, o3, o4-mini, etc.). Returns AsyncGenerator of streaming events compatible with ProviderStreamNormalizer. Maintains backwards compatibility with existing sync invoke() method.
## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Extend OpenAI provider invoke() method to support stream parameter
- [ ] #2 Implement streaming for Chat Completions API (stream: true)
- [ ] #3 Implement streaming for Responses API (stream: true)
- [ ] #4 AsyncGenerator return type yielding streaming chunks when stream=true
- [ ] #5 Support for all current OpenAI models (gpt-5, o3, o4-mini, gpt-4o, etc.)
- [ ] #6 Proper error handling for streaming failures and network issues
- [ ] #7 Token usage reporting in streaming mode (via stream_options.include_usage)
- [ ] #8 Unit tests covering streaming and non-streaming modes for both APIs
<!-- AC:END -->


## Implementation Plan

**Architecture Approach:**
- Extend existing OpenAI provider invoke() method with streaming capability
- Support both Chat Completions API and Responses API streaming modes  
- Return AsyncGenerator when stream=true, maintain existing response when stream=false
- Handle streaming-specific features (usage reporting, function calling, reasoning)
- Full backwards compatibility with existing synchronous behavior

**Key Files to Modify:**
- `src/providers/openai.js` - Add streaming support to existing invoke() method
- `tests/providers/openai.test.js` - Add streaming test cases alongside existing tests

**Architecture Reference Points:**
- `src/providers/openai.js:328-564` - Current invoke() method structure and error handling
- `src/providers/openai.js:359-423` - Request payload building patterns
- `src/providers/openai.js:442-446` - API call execution patterns
- Package.json:104 - OpenAI SDK version (5.11.0) with streaming support

**OpenAI Provider Streaming Extension:**
```javascript
export const openaiProvider = {
  async invoke(messages, options = {}) {
    // Extract stream parameter
    const { stream = false, ...otherOptions } = options;
    
    if (!stream) {
      // Existing synchronous behavior - NO CHANGES
      return await invokeSync(messages, options);
    }
    
    // New streaming behavior
    return invokeStreamingGenerator(messages, options);
  }
};

// New streaming generator function
async function* invokeStreamingGenerator(messages, options) {
  const {
    model = 'gpt-4o-mini',
    temperature = 0.7, 
    maxTokens = null,
    reasoning_effort = 'medium',
    verbosity = 'medium',
    use_websearch = false,
    config,
    ...otherOptions
  } = options;
  
  // Validate API key (same as existing)
  if (!config?.apiKeys?.openai || !validateApiKey(config.apiKeys.openai)) {
    yield { type: 'error', data: { error: 'MISSING_API_KEY', message: 'OpenAI API key not configured' } };
    return;
  }
  
  const openai = new OpenAI({ apiKey: config.apiKeys.openai });
  const resolvedModel = resolveModelName(model);
  const modelConfig = SUPPORTED_MODELS[resolvedModel] || {};
  
  // Use Responses API for streaming (preferred for new models)
  const shouldUseResponsesAPI = modelConfig.supportsResponsesAPI !== false;
  
  try {
    const stream = shouldUseResponsesAPI ? 
      await createResponsesAPIStream(openai, messages, options) :
      await createChatCompletionsStream(openai, messages, options);
    
    yield { type: 'start', data: { provider: 'openai', model: resolvedModel } };
    
    let accumulatedContent = '';
    let usage = null;
    
    for await (const chunk of stream) {
      const processed = shouldUseResponsesAPI ? 
        processResponsesAPIChunk(chunk) :
        processChatCompletionsChunk(chunk);
        
      if (processed.type === 'delta' && processed.data.content) {
        accumulatedContent += processed.data.content;
        yield processed;
      } else if (processed.type === 'usage') {
        usage = processed.data;
        yield processed;
      } else if (processed.type === 'end') {
        yield { 
          type: 'end', 
          data: { 
            finishReason: processed.data.finishReason,
            finalContent: accumulatedContent,
            usage: usage
          }
        };
      }
    }
    
  } catch (error) {
    yield { 
      type: 'error', 
      data: { 
        error: error.code || 'API_ERROR',
        message: error.message,
        recoverable: isErrorRetryable(error)
      }
    };
  }
}
```

**Chat Completions API Streaming:**
```javascript
async function createChatCompletionsStream(openai, messages, options) {
  const { model, temperature, maxTokens, use_websearch } = options;
  
  const requestPayload = {
    model: resolvedModel,
    messages: convertMessages(messages, false), // Chat format
    stream: true,
    stream_options: { include_usage: true }, // Get usage in final chunk
    temperature: Math.max(0, Math.min(2, temperature)),
  };
  
  if (maxTokens) requestPayload.max_tokens = maxTokens;
  if (use_websearch) requestPayload.tools = [{ type: 'web_search' }];
  
  return await openai.chat.completions.create(requestPayload);
}

function processChatCompletionsChunk(chunk) {
  const choice = chunk.choices?.[0];
  
  if (choice?.delta?.content) {
    return {
      type: 'delta',
      data: { 
        content: choice.delta.content,
        role: choice.delta.role,
        index: choice.index
      }
    };
  }
  
  // Usage information in final chunk
  if (chunk.usage) {
    return {
      type: 'usage', 
      data: {
        inputTokens: chunk.usage.prompt_tokens,
        outputTokens: chunk.usage.completion_tokens,
        totalTokens: chunk.usage.total_tokens
      }
    };
  }
  
  // End of stream
  if (choice?.finish_reason) {
    return {
      type: 'end',
      data: { finishReason: choice.finish_reason }
    };
  }
  
  return { type: 'unknown', data: chunk };
}
```

**Responses API Streaming:**
```javascript
async function createResponsesAPIStream(openai, messages, options) {
  const { model, reasoning_effort, verbosity, use_websearch } = options;
  
  const requestPayload = {
    model: resolvedModel,
    input: convertMessages(messages, true), // Responses format
    stream: true,
  };
  
  // Add reasoning effort for thinking models (o3, GPT-5)
  if ((resolvedModel.startsWith('o3') || resolvedModel.startsWith('gpt-5')) && reasoning_effort) {
    requestPayload.reasoning = { effort: reasoning_effort };
  }
  
  // Add verbosity for GPT-5 models
  if (resolvedModel.startsWith('gpt-5') && verbosity) {
    requestPayload.text = { verbosity: verbosity };
  }
  
  // Add web search tools
  if (use_websearch) {
    requestPayload.tools = [{ type: 'web_search_preview' }];
  }
  
  return await openai.responses.create(requestPayload);
}

function processResponsesAPIChunk(chunk) {
  // Responses API streams output_text directly
  if (chunk.output_text) {
    return {
      type: 'delta',
      data: { 
        content: chunk.output_text,
        role: 'assistant'
      }
    };
  }
  
  // Usage and completion handling
  if (chunk.usage) {
    return {
      type: 'usage',
      data: {
        inputTokens: chunk.usage.input_tokens,
        outputTokens: chunk.usage.output_tokens, 
        totalTokens: chunk.usage.total_tokens
      }
    };
  }
  
  if (chunk.status && ['completed', 'stop'].includes(chunk.status)) {
    return {
      type: 'end',
      data: { finishReason: chunk.status }
    };
  }
  
  return { type: 'unknown', data: chunk };
}
```

**Model-Specific Features:**
```javascript
// Handle reasoning models (o3, o4, GPT-5)
function supportsReasoning(model) {
  return model.startsWith('o3') || model.startsWith('o4') || model.startsWith('gpt-5');
}

// Handle deep research models (extended timeouts)
function isDeepResearchModel(model) {
  return model.includes('deep-research');
}

// Web search support
function supportsWebSearch(model, modelConfig) {
  return modelConfig.supportsWebSearch && use_websearch;
}
```

**Error Handling & Recovery:**
```javascript
function isErrorRetryable(error) {
  const retryableErrors = ['rate_limit_exceeded', 'server_error', 'timeout'];
  return retryableErrors.includes(error.code) || error.status >= 500;
}

// Streaming-specific error handling
async function* handleStreamingError(error, context) {
  if (isErrorRetryable(error)) {
    yield {
      type: 'error',
      data: {
        error: error.code,
        message: error.message,
        recoverable: true,
        retryAfter: error.retryAfter || 1000
      }
    };
  } else {
    yield {
      type: 'error', 
      data: {
        error: error.code,
        message: error.message,
        recoverable: false
      }
    };
  }
}
```

**Integration Points:**
- ProviderStreamNormalizer (task 5): Consumes this AsyncGenerator for unified streaming
- JobRunner (task 3): Uses streaming for background progress updates
- Chat/Consensus tools: Real-time progress via streaming deltas

**Testing Strategy:**
- Mock OpenAI streaming responses for both APIs
- Test all supported models with streaming
- Test error scenarios and recovery
- Test model-specific features (reasoning, web search)
- Verify backwards compatibility (non-streaming behavior unchanged)

**Dependencies:**
- OpenAI SDK 5.11.0+ with streaming support
- Existing OpenAI provider configuration and error handling patterns

## Implementation Notes

CRITICAL: Streaming must be implemented with model-specific support checking. Not all OpenAI models support streaming - verify SUPPORTED_MODELS has accurate supportsStreaming flags per model. Some models (like o1-series) may have streaming limitations. Implement runtime checking for model streaming capabilities and provide graceful fallback for non-streaming models.

Successfully implemented streaming support for OpenAI provider with the following key features:

**Core Implementation:**
- Extended invoke() method to return AsyncGenerator when stream=true while maintaining backwards compatibility
- Added private _createStreamingGenerator() method handling both Chat Completions API and Responses API streaming formats
- Implemented structured event streaming: start, delta, usage, end, and error events

**API Support:**
- Chat Completions API streaming with stream_options.include_usage for token usage reporting 
- Responses API streaming with native usage reporting in response.done events
- Automatic API selection based on model supportsResponsesAPI configuration
- Graceful fallback to non-streaming for models that don't support streaming

**Event Structure:**
- start: Initialization with model, provider, api_type metadata
- delta: Content chunks with incremental text updates
- usage: Token usage information (input_tokens, output_tokens, total_tokens)
- end: Final completion with full content, metadata, and response times
- error: Comprehensive error handling with recoverable flags

**Model Support:**
- All OpenAI models support streaming (gpt-5, o3/o4, gpt-4 series)
- Model-specific features: reasoning_effort for thinking models, verbosity for GPT-5
- Web search integration with proper streaming support

**Testing:**
- Comprehensive unit tests covering both API formats, error handling, fallback behavior
- Mock streaming implementations for reliable testing
- Test coverage for usage reporting, model selection, and error scenarios

**Error Handling:**  
- Proper OpenAI error code mapping (quota, rate limits, model not found, etc.)
- Streaming-specific error events with recovery information
- Maintains existing error throwing behavior for compatibility

**Files Modified:**
- src/providers/openai.js: Extended with streaming functionality (~200 lines added)
- tests/unit/providers/openai.test.js: Added comprehensive streaming test suite (~340 lines added)

The implementation follows the task specification exactly, providing seamless streaming integration while maintaining full backwards compatibility. Ready for integration with ProviderStreamNormalizer and JobRunner components.

## Implementation Plan Reference

Refer to **Async Execution System Architecture Plan** (`backlog/docs/doc-001 - Async-Execution-System-Architecture-Plan.md`) for:
- Complete system architecture and component relationships
- Visual diagrams showing class structure, execution flow, and sequence diagrams
- Integration patterns with existing MCP server infrastructure
- Caching strategy, error handling, and testing approaches
- Context for how this task fits into the overall async execution system
