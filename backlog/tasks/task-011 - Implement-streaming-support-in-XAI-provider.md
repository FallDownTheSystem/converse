---
id: task-011
title: Implement streaming support in XAI provider
status: To Do
assignee: []
created_date: '2025-08-23 15:16'
updated_date: '2025-08-23 18:33'
labels:
  - async
  - providers
  - xai
  - streaming
dependencies: []
---

## Description

Add streaming capabilities to the XAI provider using OpenAI SDK with XAI base URL for internal streaming consumption in async execution. Supports all Grok models (grok-4-0709, grok-3, grok-3-fast) with live search functionality for grok-4. Uses OpenAI-compatible streaming interface but with XAI-specific features. Returns AsyncGenerator compatible with ProviderStreamNormalizer.
## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Extend XAI provider invoke() method to support stream parameter
- [ ] #2 Implement streaming using OpenAI SDK with stream: true and XAI base URL
- [ ] #3 Support for all Grok models (grok-4-0709, grok-3, grok-3-fast)
- [ ] #4 Live search integration for grok-4-0709 in streaming mode (search_parameters)
- [ ] #5 Image input support for grok-4-0709 with streaming responses
- [ ] #6 AsyncGenerator return type yielding streaming chunks when stream=true
- [ ] #7 Proper error handling for XAI-specific streaming failures
- [ ] #8 Unit tests covering streaming modes, live search, and multimodal input
<!-- AC:END -->


## Implementation Plan

**Architecture Approach:**
- Extend existing XAI provider invoke() method with OpenAI SDK streaming capabilities
- Use OpenAI-compatible streaming interface with XAI base URL (https://api.x.ai/v1)
- Support all Grok models with live search functionality for grok-4-0709
- Return AsyncGenerator when stream=true, maintain existing response when stream=false
- Handle XAI-specific features (live search, multimodal input for grok-4)

**XAI Configuration & Environment Setup:**

**Environment Variables:**
- XAI_API_KEY format: xai-<base64-encoded-key> (required)
- XAI_BASE_URL: https://api.x.ai/v1 (default)
- XAI_REQUEST_TIMEOUT: 300000ms for reasoning models, 60000ms for fast models
- XAI_RETRY_ATTEMPTS: 3 (configurable retry count for rate limits)
- XAI_SEARCH_COST_WARNING_THRESHOLD: 10 (search queries per hour before warning)
- XAI_MAX_CONCURRENT_STREAMS: 5 (concurrent streaming connections limit)

**Model Capability Matrix with Configurations:**
- grok-4-0709: streaming, images, web search, 128k context, 32k output, 300s timeout
- grok-3: streaming only, 128k context, 8k output, 120s timeout  
- grok-3-fast: streaming only, 32k context, 4k output, 60s timeout
- Rate limits: grok-4 (30 rpm, 50k tpm), grok-3 (60 rpm, 100k tpm), grok-3-fast (120 rpm, 200k tpm)
- Search cost: 0.025 per source for grok-4-0709 live search

**Live Search Parameter Configuration:**
- Search modes: auto (recommended), always, never
- Default parameters: maxSources=10, searchTimeout=30s, relevanceThreshold=0.7
- Cost management: maxSearchesPerHour=40, warningThreshold=0.50, dailySpendLimit=5.00
- Caching: 1-hour TTL, 1000 max cached results, query hash strategy

**Rate Limiting & Quota Management:**
- Backoff strategy: 1s initial, 60s max, exponential with jitter
- Queue management: 100 max queue, 5min timeout, 3 priority levels
- Quota tracking: hourly windows, alerts at 70%/90%/95%, UTC daily reset

**Performance Optimization for Reasoning Models:**
- Connection pooling: 20 max sockets, 30s keep-alive, 5min timeout
- Streaming: 8KB buffer, 16KB high water mark, 100ms flush interval
- Memory management: 50 max context turns, compress at 40 turns, 512MB limit
- Reasoning: enable thinking, 60s thinking timeout, medium depth
- Caching: 1h response cache, 24h embedding cache, LRU algorithm

**Monitoring & Observability:**
- Metrics: 30s collection, 7d retention, track duration/tokens/cost/errors
- Health checks: 1min interval, 30s timeout, 5s response/5% error/99% availability thresholds
- Logging: structured JSON, 100MB rotation, 5 files, API key redaction
- Alerts: high error rate (10%), search cost spike (2.00/hour), quota exceeded (95%)
- Performance: 10% sample rate, track first token/search times/completion

**Key Files to Modify:**
- src/providers/xai.js - Add streaming support to existing invoke() method
- src/config.js - Add XAI-specific configuration options
- src/utils/monitoring.js - Add XAI provider monitoring
- tests/providers/xai.test.js - Add streaming test cases with live search scenarios

## Implementation Notes

IMPORTANT: XAI live search costs /usr/bin/bash.025 per source used. Implement usage tracking and user notifications to prevent unexpected bills. Consider adding search usage limits and cost warnings.

IMPORTANT: XAI live search costs /usr/bin/bash.025 per source used. Implement usage tracking and user notifications to prevent unexpected bills. Consider adding search usage limits and cost warnings. STREAMING: Not all Grok models support streaming - verify model-specific capabilities. grok-4-0709 supports multimodal and live search streaming, but older models may have limitations. Update SUPPORTED_MODELS with accurate flags.

## Implementation Plan Reference

Refer to **Async Execution System Architecture Plan** (`backlog/docs/doc-001 - Async-Execution-System-Architecture-Plan.md`) for:
- Complete system architecture and component relationships
- Visual diagrams showing class structure, execution flow, and sequence diagrams
- Integration patterns with existing MCP server infrastructure
- Caching strategy, error handling, and testing approaches
- Context for how this task fits into the overall async execution system
