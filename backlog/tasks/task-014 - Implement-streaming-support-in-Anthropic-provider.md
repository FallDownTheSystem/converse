---
id: task-014
title: Implement streaming support in Anthropic provider
status: Done
assignee:
  - '@ai'
created_date: '2025-08-23 18:03'
updated_date: '2025-08-24 09:43'
labels:
  - async
  - providers
  - anthropic
  - streaming
dependencies: []
---

## Description

Add streaming capabilities to the Anthropic provider using @anthropic-ai/sdk message streaming for internal streaming consumption in async execution. Supports all Claude models (3.5 Sonnet, Haiku, Opus) with multimodal streaming for images and PDFs. Returns AsyncGenerator compatible with ProviderStreamNormalizer.
## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Extend Anthropic provider invoke() method to support stream parameter,Implement streaming using Anthropic SDK's message streaming API,Support for all Claude models with model-specific streaming flags,Handle multimodal streaming (images, PDFs, documents),AsyncGenerator return type yielding streaming chunks when stream=true,Proper error handling for Anthropic-specific streaming failures,Token usage reporting in streaming mode,Unit tests covering streaming modes and multimodal input
<!-- AC:END -->


## Implementation Plan

**Architecture Integration:**
- Extend existing Anthropic provider invoke() method with streaming capability using @anthropic-ai/sdk's messages.create({stream: true}) method
- Return AsyncGenerator when stream=true, maintain existing response format when stream=false for full backwards compatibility
- Integrate with unified event system (start, delta, usage, end, error events)
- Follow functional architecture patterns from existing anthropicProvider object structure

**Files to Modify:**
- `src/providers/anthropic.js:329-535` - Add streaming support to invoke() method, reuse existing authentication, model resolution, message conversion, and error handling patterns
- `tests/unit/providers/anthropic.test.js` - Add streaming test cases alongside existing configuration, model management, and message conversion tests
- Update SUPPORTED_MODELS streaming flags verification (all Claude models support streaming per current flags)

**Detailed Implementation Steps:**
1. Add streaming condition check in invoke() method similar to OpenAI pattern (lines 445-447)
2. Create _createStreamingGenerator() private method following OpenAI pattern (lines 556-733)
3. Implement Anthropic SDK streaming event handling:
   - message_start → { type: 'start' }
   - content_block_delta with text_delta → { type: 'delta', content }
   - content_block_delta with thinking_delta → handle thinking tokens
   - message_delta with usage → { type: 'usage', usage }
   - message_stop → { type: 'end' }
4. Add error handling following OpenAI error pattern (lines 693-731)
5. Support thinking tokens and cache usage in metadata
6. Add unit tests extending existing test structure
7. Test with real API calls for all Claude models

**API Integration Approach:**
```javascript
// New streaming generator function
async function* invokeStreamingGenerator(messages, options) {
  const { model, temperature, maxTokens, reasoning_effort, config } = options;
  
  // Reuse existing validation and setup (lines 342-372)
  const Anthropic = await getAnthropicSDK();
  const anthropic = new Anthropic({
    apiKey: config.apiKeys.anthropic,
    defaultHeaders: { 'anthropic-beta': 'prompt-caching-2024-07-31,extended-cache-ttl-2025-04-11' }
  });
  
  // Reuse existing message conversion (line 373)
  const { systemPrompt, messages: anthropicMessages } = convertMessagesToAnthropic(messages);
  
  // Build streaming request payload (similar to lines 376-430)
  const requestPayload = {
    model: resolvedModel,
    messages: anthropicMessages,
    stream: true // Enable streaming
  };
  
  // Use @anthropic-ai/sdk streaming method
  const stream = await anthropic.messages.create(requestPayload);
  
  yield { type: 'start', data: { provider: 'anthropic', model: resolvedModel } };
  
  for await (const chunk of stream) {
    const processed = processStreamingChunk(chunk);
    if (processed) yield processed;
  }
}
```
**Stream Processing Events:**
Based on @anthropic-ai/sdk streaming events:
- `message_start` → `{ type: 'start', data: { requestId, model } }`
- `content_block_delta` → `{ type: 'delta', data: { textDelta: chunk.delta.text, role: 'assistant' } }`
- `message_delta` → Process usage metadata and stop reasons
- `message_stop` → `{ type: 'end', data: { finishReason: message.stop_reason, finalUsage } }`
- `error` → `{ type: 'error', data: { error: error.type, message: error.message } }` 
**Error Handling Strategy:**
- Reuse existing AnthropicProviderError class and error mapping (lines 501-533)
- Map Anthropic streaming errors to ErrorCodes (RATE_LIMIT_EXCEEDED, QUOTA_EXCEEDED, CONTEXT_LENGTH_EXCEEDED)
- Handle stream interruptions gracefully with partial content recovery
- Anthropic-specific error codes: invalid_request_error, not_found_error, authentication_error
- Implement retry logic for temporary failures (network issues, 500 errors)

**Model Support Implementation:**
All SUPPORTED_MODELS have supportsStreaming: true:
- claude-opus-4-1-20250805: Supports streaming with thinking mode and multimodal content
- claude-sonnet-4-20250514: Supports streaming with thinking mode and multimodal content  
- claude-3-7-sonnet-20250219: Supports streaming with thinking mode and multimodal content
- claude-3-5-sonnet-20241022: Supports streaming with multimodal content (no thinking)
- claude-3-5-haiku-20241022: Supports streaming (text only, no thinking)

**Multimodal Streaming Support:**
- Reuse existing image processing from convertMessagesToAnthropic() (lines 216-227)
- Claude models support streaming with images in base64 format
- Handle complex content arrays with text + image blocks during streaming
- PDF support through base64 encoding (same as images)

**Token Usage Tracking:**
```javascript
function processStreamingChunk(chunk) {
  switch (chunk.type) {
    case 'message_start':
      return { type: 'start', data: { requestId: chunk.message.id, model: chunk.message.model } };
    
    case 'content_block_delta':
      if (chunk.delta.type === 'text_delta') {
        return { type: 'delta', data: { textDelta: chunk.delta.text, role: 'assistant' } };
      }
      if (chunk.delta.type === 'thinking_delta') {
        return { type: 'thinking', data: { thinkingDelta: chunk.delta.text } };
      }
      break;
      
    case 'message_delta':
      if (chunk.usage) {
        return {
          type: 'usage',
          data: {
            inputTokens: chunk.usage.input_tokens,
            outputTokens: chunk.usage.output_tokens,
            totalTokens: (chunk.usage.input_tokens || 0) + (chunk.usage.output_tokens || 0),
            thinkingTokens: chunk.usage.thinking_input_tokens || 0,
            cacheCreationInputTokens: chunk.usage.cache_creation_input_tokens || 0,
            cacheReadInputTokens: chunk.usage.cache_read_input_tokens || 0
          }
        };
      }
      break;
      
    case 'message_stop':
      return { 
        type: 'end', 
        data: { 
          finishReason: chunk.message.stop_reason,
          finalUsage: chunk.message.usage 
        }
      };
  }
  return null;
}
```
**Testing Implementation:**
- Mock @anthropic-ai/sdk streaming responses using vitest mocking patterns from existing tests
- Test streaming scenarios: successful streaming, network failures, rate limits, authentication errors
- Test multimodal streaming (text + images)
- Test thinking models streaming (Claude 4 series with reasoning_effort)
- Test token usage reporting accuracy during streaming
- Test stream interruption and error recovery
- Verify backwards compatibility (non-streaming mode unchanged)

**Integration Points:**
- AsyncJobStore: Store streaming events for job status queries
- ProviderStreamNormalizer: Consume Anthropic AsyncGenerator for unified streaming interface
- EventBus: Emit streaming events for real-time client updates  
- JobRunner: Use streaming for background execution progress tracking
- Chat/Consensus tools: Real-time progress via normalized streaming events

**Dependencies:**
- `@anthropic-ai/sdk` v0.30.0+ (existing) with streaming support
- Existing anthropic provider configuration, authentication, and error handling infrastructure
- No additional dependencies required

## Implementation Notes

CRITICAL: Anthropic streaming must be implemented from scratch. Not all Claude models support streaming - verify SUPPORTED_MODELS has accurate supportsStreaming flags per model. Claude 3.5 Sonnet supports streaming with multimodal content, but older models may have limitations. Use @anthropic-ai/sdk message streaming API and implement proper token usage tracking during streaming.

Successfully implemented streaming support for Anthropic provider using @anthropic-ai/sdk v0.60.0. Implementation includes:

- Full AsyncGenerator pattern following OpenAI provider architecture
- Complete Anthropic SDK event handling (message_start, content_block_delta, message_delta, message_stop)
- Thinking tokens support with proper budget calculation and temperature forcing
- Multimodal content support (images, PDFs) ready for streaming
- Comprehensive error handling with recoverable/non-recoverable error classification
- Token usage reporting including thinking tokens, cache usage (creation, read)
- Extensive unit tests covering all streaming scenarios and edge cases
- Real API testing confirmed working with all Claude models including thinking models (Sonnet 4, Opus 4.1)
- Performance: Fast real-time streaming with proper event normalization
- Full backwards compatibility maintained with existing non-streaming behavior

Files modified:
- src/providers/anthropic.js - Main streaming implementation
- tests/unit/providers/anthropic.test.js - Unit tests for streaming functionality

All acceptance criteria completed and validated with real API testing.

CRITICAL: Anthropic streaming must be implemented from scratch. Not all Claude models support streaming - verify SUPPORTED_MODELS has accurate supportsStreaming flags per model. Claude 3.5 Sonnet supports streaming with multimodal content, but older models may have limitations. Use @anthropic-ai/sdk message streaming API and implement proper token usage tracking during streaming.

Successfully implemented streaming support for Anthropic provider using @anthropic-ai/sdk v0.60.0. Implementation includes:

- Full AsyncGenerator pattern following OpenAI provider architecture
- Complete Anthropic SDK event handling (message_start, content_block_delta, message_delta, message_stop)
- Thinking tokens support with proper budget calculation and temperature forcing
- Multimodal content support (images, PDFs) ready for streaming
- Comprehensive error handling with recoverable/non-recoverable error classification
- Token usage reporting including thinking tokens, cache usage (creation, read)
- Extensive unit tests covering all streaming scenarios and edge cases
- Real API testing confirmed working with all Claude models including thinking models (Sonnet 4, Opus 4.1)
- Performance: Fast real-time streaming with proper event normalization
- Full backwards compatibility maintained with existing non-streaming behavior

Files modified:
- src/providers/anthropic.js - Main streaming implementation
- tests/unit/providers/anthropic.test.js - Unit tests for streaming functionality

Real API Integration Tests Added:
- tests/integration/providers/anthropic/anthropic-api.test.js - Added comprehensive streaming tests including:
  * Basic streaming with Claude Haiku (fast model)  
  * Thinking model streaming with Claude Sonnet 4 (with reasoning_effort support)
  * Multimodal model streaming with Claude 3.5 Sonnet
  * Error handling in streaming scenarios
- tests/integration/providers/anthropic/anthropic-features.test.js - Added advanced streaming tests:
  * Streaming with thinking tokens and cache usage tracking
  * Multi-model streaming capability testing across different Claude models
  * Comprehensive token usage verification (thinking, cache creation/read)

All real API integration tests follow the established pattern from OpenAI, Google, and XAI providers by directly importing and testing the provider with real API calls. Tests validate full streaming event flow (start → deltas → usage → end) with proper metadata and token usage reporting.

All acceptance criteria completed and validated with real API testing.
