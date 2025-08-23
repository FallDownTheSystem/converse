---
id: task-017
title: Implement streaming support in OpenRouter provider
status: To Do
assignee: []
created_date: '2025-08-23 18:03'
updated_date: '2025-08-23 18:39'
labels:
  - async
  - providers
  - openrouter
  - streaming
dependencies: []
---

## Description

Add streaming capabilities to the OpenRouter provider for internal streaming consumption across 100+ supported models. Uses OpenRouter's unified streaming API with model-specific capability detection and routing. Handles provider differences and model-specific streaming support.
## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Extend OpenRouter provider invoke() method to support stream parameter,Implement streaming using OpenRouter's unified streaming API,Support streaming across 100+ models with dynamic capability detection,Handle provider-specific streaming differences (OpenAI vs Anthropic vs others),Update model registry with accurate per-model streaming flags,AsyncGenerator return type yielding streaming chunks when stream=true,Graceful fallback for models that don't support streaming,Unit tests covering multiple model types and streaming behaviors
<!-- AC:END -->


## Implementation Plan

Architecture: Extend existing OpenRouter provider class with streaming support using unified OpenRouter API

Files to modify:
-  - Add streaming implementation to invoke() method
-  - Update model registry with streaming capability flags
-  - Add streaming test coverage

Existing code to reference:
-  - Existing streaming implementation pattern
-  - OpenAI-style streaming format handling
-  - Anthropic-style streaming format handling
-  - Common streaming utilities

Key technical requirements:
1. Dynamic capability detection - Query OpenRouter's model metadata API to determine streaming support per model
2. Multi-provider format handling - OpenRouter routes to different underlying providers (OpenAI, Anthropic, Google, etc.) each with different streaming formats
3. Unified response transformation - Convert provider-specific streaming chunks to consistent format
4. Graceful fallback - Non-streaming response for models without streaming support
5. AsyncGenerator implementation - Yield streaming chunks when stream=true parameter provided

Data flow:
1. Check model streaming capability from registry/API
2. Route request to OpenRouter with appropriate streaming headers
3. Process provider-specific streaming response format
4. Transform chunks to unified format
5. Yield via AsyncGenerator or return complete response

Integration points:
- Will be used by chat and consensus tools for real-time responses
- Must maintain compatibility with existing provider interface
- Needs error handling for streaming connection issues

Dependencies:
- No new dependencies required - use existing streaming utilities
- OpenRouter API key configuration already in place

Model registry updates:
- Add 'streaming' boolean flag to each model entry
- Group models by underlying provider for format handling
- Include rate limit and context window info for streaming optimization

## Implementation Notes

CRITICAL: OpenRouter aggregates 100+ models from different providers each with different streaming capabilities. Must implement dynamic model capability detection and handle provider-specific streaming differences (OpenAI vs Anthropic vs Google formats). Not all models support streaming - implement graceful fallback for non-streaming models. Update model registry with per-model streaming flags.
