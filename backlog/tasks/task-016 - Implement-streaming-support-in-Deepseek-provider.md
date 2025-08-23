---
id: task-016
title: Implement streaming support in Deepseek provider
status: To Do
assignee: []
created_date: '2025-08-23 18:03'
updated_date: '2025-08-23 18:33'
labels:
  - async
  - providers
  - deepseek
  - streaming
dependencies: []
---

## Description

Add streaming capabilities to the Deepseek provider using OpenAI SDK compatibility (Deepseek uses OpenAI-compatible API) for internal streaming consumption in async execution. Supports all Deepseek models including thinking mode streaming for reasoning models.
## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Extend Deepseek provider invoke() method to support stream parameter,Implement streaming using OpenAI SDK with Deepseek base URL,Support for all Deepseek models (Coder, Chat, Reasoning),Handle thinking mode streaming for reasoning models,Update model definitions with accurate supportsStreaming flags,AsyncGenerator return type yielding streaming chunks when stream=true,Proper error handling for Deepseek-specific streaming failures,Unit tests covering streaming modes and thinking mode features
<!-- AC:END -->


## Implementation Plan

Architecture: Extend existing Deepseek provider with streaming support using OpenAI SDK compatibility

Files to modify:
-  - Main provider implementation
- Update invoke() method to handle stream parameter
- Add streaming response processing logic
-  - Ensure Deepseek provider exports are correct
-  - Add streaming test cases

Technical implementation:
- Use OpenAI SDK with custom baseURL pointing to Deepseek API (https://api.deepseek.com)
- Leverage existing OpenAI streaming patterns since Deepseek is API-compatible
- Implement AsyncGenerator pattern for streaming chunks
- Handle both regular streaming and thinking mode streaming for reasoning models

Model support verification:
- deepseek-chat: supports streaming
- deepseek-coder: supports streaming  
- deepseek-reasoner: supports streaming with thinking mode
- Update SUPPORTED_MODELS object with accurate supportsStreaming flags

Streaming response format:
- Standard chat completions streaming (data: [DONE])
- Thinking mode: separate thinking and response chunks
- Error handling for network issues and API-specific errors

Integration points:
- Follow same patterns as OpenAI provider streaming implementation
- Ensure compatibility with existing async execution framework
- Maintain consistency with other providers' streaming interfaces

Testing strategy:
- Unit tests for streaming enabled/disabled scenarios
- Mock streaming responses for different model types
- Test thinking mode streaming separately
- Error handling test cases for Deepseek-specific failures

Dependencies:
- OpenAI SDK (already available)
- Existing streaming infrastructure from other providers
## Implementation Notes

CRITICAL: Deepseek uses OpenAI-compatible API so streaming implementation should be similar to OpenAI provider. Not all Deepseek models support streaming - verify SUPPORTED_MODELS has accurate supportsStreaming flags per model. Deepseek Coder and reasoning models may have different streaming patterns especially for thinking mode output.
