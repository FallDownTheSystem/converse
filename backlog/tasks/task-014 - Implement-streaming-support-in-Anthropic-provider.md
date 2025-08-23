---
id: task-014
title: Implement streaming support in Anthropic provider
status: To Do
assignee: []
created_date: '2025-08-23 18:03'
updated_date: '2025-08-23 18:33'
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
- Extend existing Anthropic provider invoke() method with streaming capability using @anthropic-ai/sdk's messages.stream() method
- Return AsyncGenerator when stream=true, maintain existing response format when stream=false for full backwards compatibility
- Integrate with ProviderStreamNormalizer unified event system (start, delta, usage, end, error events)
- Follow functional architecture patterns from existing anthropicProvider object structure

**Files to Modify:**
- `src/providers/anthropic.js:329-535` - Add streaming support to invoke() method, reuse existing authentication, model resolution, message conversion, and error handling patterns
- `tests/unit/providers/anthropic.test.js` - Add streaming test cases alongside existing configuration, model management, and message conversion tests
- Update SUPPORTED_MODELS streaming flags verification (all Claude models support streaming per current flags)

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
  const stream = await anthropic.messages.stream(requestPayload);
  
  yield { type: 'start', data: { provider: 'anthropic', model: resolvedModel } };
  
  for await (const chunk of stream) {
    const processed = processStreamingChunk(chunk);
    if (processed) yield processed;
  }
}
```

**Stream Processing Events:**
Based on @anthropic-ai/sdk MessageCreateStream events:
- `message_start` → `{ type: 'start', data: { requestId, model } }`
- `content_block_delta` → `{ type: 'delta', data: { textDelta: chunk.delta.text, role: 'assistant' } }`
- `input_json_delta` → Handle tool input streaming (if applicable)
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
- `@anthropic-ai/sdk` v0.30.0+ (existing) with MessageCreateStream support
- Existing anthropic provider configuration, authentication, and error handling infrastructure
- No additional dependencies required

**Implementation Strategy:**
1. Extend invoke() method with conditional streaming logic (maintain full backwards compatibility)
2. Create invokeStreamingGenerator() function using existing patterns
3. Implement processStreamingChunk() for Anthropic event normalization
4. Add comprehensive streaming tests with mocked SDK responses
5. Verify all Claude models work with streaming (per supportsStreaming flags)
6. Test multimodal content streaming (images, PDFs)
7. Test thinking model streaming with reasoning budgets
## Implementation Notes

CRITICAL: Anthropic streaming must be implemented from scratch. Not all Claude models support streaming - verify SUPPORTED_MODELS has accurate supportsStreaming flags per model. Claude 3.5 Sonnet supports streaming with multimodal content, but older models may have limitations. Use @anthropic-ai/sdk message streaming API and implement proper token usage tracking during streaming.
