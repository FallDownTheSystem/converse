---
id: task-042
title: Integrate title generation and content accumulation in consensus tool
status: To Do
assignee:
  - '@ai'
created_date: '2025-08-26 10:51'
updated_date: '2025-08-26 11:12'
labels:
  - tools
  - consensus
  - summarization
  - streaming
  - multi-provider
dependencies: []
---

## Description

Modify the consensus tool to generate titles at request initiation, accumulate full streaming content from multiple providers, and generate final summaries upon completion. Similar to chat tool but handles multi-provider complexity.

Technical Requirements:
- Generate title from user prompt at request start
- Accumulate combined content from all providers
- Generate final summary after all providers complete
- Handle two-phase consensus (initial + refined)
- Maintain provider-specific previews

Dependencies: task-039, task-040, task-041

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Title generated and stored at request initiation
- [ ] #2 Combined content accumulated from all providers
- [ ] #3 Final summary generated for completed consensus
- [ ] #4 Works with both single-phase and two-phase consensus
- [ ] #5 No impact when summarization disabled
- [ ] #6 Existing tests pass
<!-- AC:END -->

## Implementation Plan

Architecture: Integrate SummarizationService into consensus streaming flow
Files to modify:
  - src/tools/consensus.js - executeConsensusWithStreaming function
Existing code to reference:
  - Current multi-provider streaming logic
  - Provider state management
  - SummarizationService from task-040
Data flow: Request → Generate title → Multi-provider stream → Accumulate → Complete → Generate summary
Integration: Similar to chat but aggregate content from all providers
Complexity: Handle provider-specific accumulation + combined summary

Specific implementation details:
- Import pattern: `import { SummarizationService } from '../services/summarizationService.js';`
- SummarizationService instantiation: 
  - Extract config and providers from dependencies parameter
  - Create instance: `const summarizer = new SummarizationService(config, providers);`
  - Note: providers is the full providers object from dependencies, not a single provider
- Replace any streaming_preview updates with accumulated_content storage
- Aggregate content from all providers for final summary
