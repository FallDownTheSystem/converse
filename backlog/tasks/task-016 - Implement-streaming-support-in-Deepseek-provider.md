---
id: task-016
title: Implement streaming support in Deepseek provider
status: Done
assignee:
  - '@ai'
created_date: '2025-08-23 18:03'
updated_date: '2025-08-24 14:10'
labels:
  - async
  - providers
  - deepseek
  - streaming
dependencies: []
---

## Description

Add streaming support for DeepSeek provider by implementing streaming functionality in the shared OpenAI-compatible factory.

**Context:**
DeepSeek provider currently lacks streaming support, which limits real-time response capabilities and user experience. The provider uses the shared createOpenAICompatibleProvider factory from openai-compatible.js.

**Technical Requirements:**
- Implement streaming in createOpenAICompatibleProvider factory function
- Support OpenAI-compatible SSE streaming format with data: and event: prefixes
- Handle reasoning mode generically by checking modelConfig.supportsReasoning
- Maintain consistent streaming event format: start, delta, thinking, usage, end, error
- Both DeepSeek and OpenRouter will inherit streaming capabilities automatically

**Integration Points:**
- Factory function returns provider with streaming capabilities
- invoke() method detects stream=true parameter and returns streaming generator
- Existing transformResponse handles provider-specific streaming metadata
- MCP tools (chat/consensus) already support streaming responses
## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Extend Deepseek provider invoke() method to support stream parameter,Implement streaming using OpenAI SDK with Deepseek base URL,Support for all Deepseek models (Coder, Chat, Reasoning),Handle thinking mode streaming for reasoning models,Update model definitions with accurate supportsStreaming flags,AsyncGenerator return type yielding streaming chunks when stream=true,Proper error handling for Deepseek-specific streaming failures,Unit tests covering streaming modes and thinking mode features
<!-- AC:END -->


## Implementation Plan

High-level design (from existing plan):
- Add streaming support to createOpenAICompatibleProvider factory function instead of individual provider rewrites
- Add _createStreamingGenerator method to the provider object returned by factory
- Modify invoke() method to check for stream=true and return streaming generator  
- Handle reasoning mode generically by checking modelConfig.supportsReasoning
- Use existing transformResponse for provider-specific streaming metadata
- Maintain same streaming event format: start, delta, thinking, usage, end, error

Detailed implementation steps:
1. Add _createStreamingGenerator method to openai-compatible.js factory return object - similar to OpenAI pattern
2. Modify invoke() method to detect stream=true and call _createStreamingGenerator 
3. Implement streaming logic using OpenAI SDK with baseURL - handle both reasoning and non-reasoning models
4. Add error handling for streaming-specific failures in factory
5. Add streaming test cases to deepseek-api.test.js - test both deepseek-chat and deepseek-reasoner models
6. Verify automatic streaming inheritance works for DeepSeek without provider changes
7. Run validation tests to ensure both streaming and non-streaming modes work correctly

## Implementation Notes

CRITICAL: Deepseek uses OpenAI-compatible API so streaming implementation should be similar to OpenAI provider. Not all Deepseek models support streaming - verify SUPPORTED_MODELS has accurate supportsStreaming flags per model. Deepseek Coder and reasoning models may have different streaming patterns especially for thinking mode output.

CORRECTED IMPLEMENTATION APPROACH:

**Why factory approach instead of direct provider modification:**
- Both DeepSeek and OpenRouter use the same createOpenAICompatibleProvider factory
- Both need identical streaming functionality (OpenAI-compatible streaming format)  
- Implementing streaming in the shared factory eliminates code duplication
- OpenRouter (task-017) will automatically get streaming support when implemented
- Follows DRY principles and maintains consistency across providers

**Updated rationale:**
The implementation approach should be changed to implement streaming support in the shared createOpenAICompatibleProvider factory function in src/providers/openai-compatible.js instead of rewriting the DeepSeek provider directly.

**Technical benefits:**
✅ Eliminates code duplication between providers
✅ OpenRouter gets streaming support automatically (task-017)
✅ Consistent streaming behavior across all OpenAI-compatible providers
✅ Single place to maintain and debug streaming logic  
✅ Future OpenAI-compatible providers inherit streaming for free

The DeepSeek provider itself (src/providers/deepseek.js) should remain using the factory pattern and will automatically gain streaming capabilities when the factory is enhanced.

Successfully implemented streaming support in the createOpenAICompatibleProvider factory. Added _createStreamingGenerator method with full OpenAI-compatible streaming (start, delta, thinking, usage, end, error events). Both deepseek-chat and deepseek-reasoner models now support streaming. Comprehensive test suite added with real API tests for both models including reasoning model thinking events. Implementation uses factory pattern so OpenRouter will automatically inherit streaming when task-017 is implemented. Files modified: src/providers/openai-compatible.js (main implementation), tests/integration/providers/deepseek/deepseek-api.test.js (streaming tests). All tests pass and validation successful.
