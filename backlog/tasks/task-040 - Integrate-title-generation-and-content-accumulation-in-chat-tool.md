---
id: task-040
title: Integrate title generation and content accumulation in chat tool
status: Done
assignee:
  - '@ai'
created_date: '2025-08-26 10:51'
updated_date: '2025-08-26 11:43'
labels:
  - tools
  - chat
  - summarization
  - streaming
dependencies: []
priority: medium
---

## Description

Modify the chat tool to generate titles at request initiation, accumulate full streaming content, and generate final summaries upon completion. This provides the data needed for enhanced status displays.

Technical Requirements:
- Generate title from user prompt at request start
- Store full accumulated content instead of 200-char preview
- Generate final summary after successful completion
- Non-blocking - summarization failures don't affect main flow
- Only execute when summarization is enabled

Dependencies: task-039, task-040, task-041

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Title generated and stored at request initiation,Full content accumulated during streaming,Final summary generated for completed responses > 100 chars,Main chat flow continues even if summarization fails,No impact when summarization disabled,Existing tests pass
<!-- AC:END -->

## Implementation Plan

Architecture: Integrate SummarizationService into existing streaming flow
Files to modify:
  - src/tools/chat.js - executeChatWithStreaming function
Existing code to reference:
  - Current streaming accumulation logic
  - Lines 638-640: Replace streaming_preview with accumulated_content storage
  - context.updateJob() patterns
  - SummarizationService from task-040
Data flow: Request → Generate title → Stream → Accumulate → Complete → Generate summary
Integration points: Before streaming starts (title), during streaming (accumulate), after completion (summary)
Error handling: Try-catch around summarization, log failures, continue main flow
  - Import pattern: import SummarizationService from '../services/summarizationService.js'
SummarizationService instantiation: 
- Extract config and providers from dependencies parameter
- Create instance: `const summarizer = new SummarizationService(config, providers);`
- Note: providers is the full providers object from dependencies, not a single provider

## Implementation Notes

Successfully integrated SummarizationService into chat tool's streaming flow. Changes made: 1) Added SummarizationService import to chat.js, 2) Generate title from user prompt at request start, 3) Replaced 200-char streaming_preview with full accumulated_content storage, 4) Generate final summary for responses > 100 chars after completion, 5) Added title and summary to returned result object. Non-blocking implementation ensures main flow continues even if summarization fails. Tests passing, type checking passed.
