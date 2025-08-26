---
id: task-041
title: Enhance checkStatus tool with on-demand summaries and improved display
status: To Do
assignee:
  - '@ai'
created_date: '2025-08-26 10:51'
updated_date: '2025-08-26 11:09'
labels:
  - tools
  - status
  - summarization
  - display
dependencies: []
priority: low
---

## Description

Update the checkStatus tool to generate summaries on-demand for running jobs and display titles/summaries in job listings. This completes the user-facing experience for the summarization feature.

Technical Requirements:
- Generate streaming summaries on-demand when status checked
- Include titles in job status displays
- Show final summaries in job listings (not individual queries)
- Format adjustments for readability
- Pass dependencies (config, providers) for summarization

Dependencies: task-039, task-040, task-041, task-042, task-043

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Running jobs show AI-generated or snippet preview when checked,Job listings include titles in status lines,Completed jobs in listings show final summaries,Individual job queries don't show summaries,Graceful fallback when summarization unavailable,Existing tests pass
<!-- AC:END -->

## Implementation Plan

Architecture: Existing status formatting utilities in src/utils/formatStatus.js
Files to modify:
  - src/tools/checkStatus.js - main check_status tool implementation
  - src/utils/formatStatus.js - status formatting utilities
  - Modify formatJobStatus function (line 436-451)
  - Update formatHumanReadableStatus and formatConversationHistory signatures

Core changes needed:
1. Add SummarizationService dependency injection to formatting functions
2. Make formatHumanReadableStatus async for title/summary generation
3. Update formatConversationHistory to accept dependencies parameter
4. Update all call sites to pass dependencies and handle async operations
5. Update formatJobStatus to include new job fields

Passing dependencies: 
- Update formatHumanReadableStatus signature: async function formatHumanReadableStatus(jobStatus, options = {})
- Update formatConversationHistory signature: async function formatConversationHistory(jobStatus, continuationId, dependencies)
- Update formatJobListHumanReadable: Keep synchronous (uses stored summaries only)
- Call site updates:
  - Line 67: await formatHumanReadableStatus(jobStatus, { sequence: 1/1, dependencies })
  - Line 66: formatConversationHistory(jobStatus, continuation_id, dependencies) 
  - Line 298 inside formatConversationHistory: await formatHumanReadableStatus(jobStatus, { sequence: 1/1, skipContent: false, dependencies })
- Import SummarizationService: Add import { SummarizationService } from ../services/summarizationService.js at top

formatJobStatus updates (line 436-451):
- Remove: streaming_preview: job.streaming_preview or null (line 450)
- Add these fields after line 449:
  - accumulated_content: job.accumulated_content or null,
  - title: job.title or null,
  - final_summary: job.final_summary or null,

Integration points:
- checkStatus.js uses formatStatus utilities for output formatting
- Status formatting functions need access to SummarizationService
- Must handle async operations in status display pipeline
- Keep backward compatibility for existing status queries

Dependencies: SummarizationService from task-038
Documentation: Update API.md with enhanced status response format
