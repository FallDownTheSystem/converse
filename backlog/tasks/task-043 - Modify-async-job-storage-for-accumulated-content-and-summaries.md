---
id: task-043
title: Modify async job storage for accumulated content and summaries
status: To Do
assignee:
  - '@ai'
created_date: '2025-08-26 10:51'
updated_date: '2025-08-26 11:10'
labels:
  - async
  - job-management
  - storage
dependencies: []
priority: high
---

## Description

Update the AsyncJobStore to track full accumulated content during streaming and store generated titles/summaries. This replaces the limited streaming_preview with full content accumulation and enables on-demand preview generation.

Technical Requirements:
- Add `accumulated_content` field to store full streaming content
- Add `title` field for generated request titles
- Add `final_summary` field for completed job summaries
- Remove `streaming_preview` field (now generated on-demand)
- Ensure proper cleanup and memory management

Dependencies: task-039

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Job state includes accumulated_content, title, and final_summary fields,updateJob() method handles new fields properly,Memory management respects existing limits,Backward compatibility maintained for existing jobs,Existing tests pass
<!-- AC:END -->

## Implementation Plan

Architecture: Extend existing job state structure
Files to modify:
  - `src/async/asyncJobStore.js` - add new fields, update methods
Existing code to reference:
  - Current job state structure and updateJob method
  - LRU cache implementation for memory management
Data flow: Streaming content → accumulated_content → stored in job state
Pattern: Follow existing field update patterns in updateJob()

Note: The `streaming_preview` field is currently set in src/tools/chat.js (lines 638-640) and src/tools/consensus.js, not in asyncJobStore itself. Those will be handled in tasks 040 and 042 respectively. This task focuses on adding the new fields to the job state structure.
