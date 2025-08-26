---
id: task-044
title: Add summarization configuration to config schema
status: In Progress
assignee:
  - '@ai'
created_date: '2025-08-26 10:51'
updated_date: '2025-08-26 12:53'
labels:
  - configuration
  - summarization
  - foundation
dependencies: []
priority: high
---

## Description

Enable configuration of AI-powered summarization feature through environment variables. This provides the foundation for controlling when and how response summarization occurs throughout the async workflow.

Technical Requirements:
- Add `summarization` section to CONFIG_SCHEMA with `enabled` and `model` fields
- Support ENV variables: `ENABLE_RESPONSE_SUMMARIZATION` and `SUMMARIZATION_MODEL`
- Default to disabled (false) and 'gpt-5' model
- Ensure configuration loads properly and is accessible to tools

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Configuration schema includes summarization settings,ENV variables properly map to config values,Default values work when ENV vars not set,Config accessible via `config.summarization.enabled` and `config.summarization.model`,Existing tests pass
<!-- AC:END -->

## Implementation Plan

Architecture: Add new configuration section following existing patterns
Files to modify:
  - `src/config.js` - add summarization section to CONFIG_SCHEMA
Existing code to reference:
  - Current CONFIG_SCHEMA structure for patterns
  - `mcp` section for similar feature toggle pattern
Data flow: ENV vars → loadConfig() → config object → tools access
Pattern: Follow existing boolean feature flags like `HTTP_ENABLE_CORS`
