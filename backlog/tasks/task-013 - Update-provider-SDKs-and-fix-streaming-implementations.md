---
id: task-013
title: Update provider SDKs and fix streaming implementations
status: To Do
assignee: []
created_date: '2025-08-23 17:52'
updated_date: '2025-08-23 18:34'
labels: []
dependencies:
  - task-009
  - task-010
  - task-011
priority: high
---

## Description

Update ALL dependencies in package.json to their latest versions. This includes both production dependencies and devDependencies. Run security audit and fix any vulnerabilities. Test compatibility after updates.

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Update openai to 5.15.0,Update @google/genai to 1.15.0,Update @mistralai/mistralai to 1.9.18,Update @anthropic-ai/sdk to 0.60.0,Implement actual streaming in Google provider,Implement actual streaming in Mistral provider,Test streaming works for all providers
- [ ] #2 Update @anthropic-ai/sdk from ^0.57.0 to ^0.60.0,Update @google/genai from ^1.12.0 to ^1.15.0,Update @mistralai/mistralai from ^1.7.5 to ^1.9.18,Update openai from ^5.11.0 to ^5.15.0,Update @modelcontextprotocol/sdk from ^1.17.1 to latest available,Update dotenv from ^17.2.1 to latest available,Update cors from ^2.8.5 to latest available,Update express from ^5.1.0 to latest stable,Update vite from ^7.0.6 to latest available,Update all devDependencies (@vitest/coverage-v8 vitest eslint prettier etc.),Run npm audit and fix any security vulnerabilities,Test all providers after updates to ensure compatibility,Verify streaming works for all providers after SDK updates
- [ ] #3 Update all production dependencies to latest versions,Update all devDependencies to latest versions,Run npm audit and fix any security vulnerabilities,Test basic functionality after dependency updates,Verify no breaking changes affect existing functionality
<!-- AC:END -->


## Implementation Plan

## Implementation Plan

### 1. Current vs Target SDK Versions Analysis

Major SDK Updates:
- @anthropic-ai/sdk: 0.57.0 to 0.60.0 (BREAKING: Web fetch API migration, new error types)
- @google/genai: 1.12.0 to 1.15.0 (Enhanced streaming, improved error handling)  
- openai: 5.11.0 to 5.15.0 (BREAKING: Web fetch API migration, export restructuring)
- @mistralai/mistralai: 1.7.5 to 1.9.18 (BREAKING: Improved streaming, API changes)

Supporting Dependencies:
- @modelcontextprotocol/sdk: ^1.17.1 to latest
- express: ^5.1.0 to latest stable
- dotenv: ^17.2.1 to latest
- cors: ^2.8.5 to latest
- vite: ^7.0.6 to latest

### 2. Breaking Changes Analysis

Web Fetch API Migration (OpenAI, Anthropic):
- Remove node-fetch polyfills
- Update error handling for new fetch-based errors
- Verify timeout and request configuration compatibility

Export Restructuring:
- OpenAI: Potential changes to client instantiation
- Anthropic: New client initialization patterns
- Update import statements in provider files

Streaming API Changes:
- Google: Enhanced streaming with better error propagation
- Mistral: New streaming interface, improved internal streaming capabilities
- Anthropic: Potential streaming API refinements

### 3. Phased Update Strategy (Risk Minimization)

Phase 1: Low-Risk Updates
Files: package.json
- Update utility dependencies (dotenv, cors)
- Update development tools (vite, vitest, eslint)
- Test server startup and basic functionality

Phase 2: Medium-Risk Updates  
Files: package.json, src/providers/openai.js
- Update OpenAI SDK (5.11.0 to 5.15.0)
- Address Web fetch API changes
- Test OpenAI provider functionality

Phase 3: High-Risk Updates
Files: package.json, src/providers/anthropic.js, src/providers/google.js, src/providers/mistral.js
- Update remaining provider SDKs
- Fix streaming implementations
- Comprehensive provider testing

### 4. Streaming Implementation Fixes

Google Provider (src/providers/google.js):
- Replace mock streaming with actual generateContentStream()
- Implement proper streaming response processing
- Add streaming error recovery
- Update to use new streaming patterns from v1.15.0

Mistral Provider (src/providers/mistral.js):
- Implement actual streaming using new v1.9.18 APIs
- Replace simulated streaming with native stream: true
- Update error handling for new streaming interface
- Ensure proper streaming response formatting

Common Streaming Improvements:
- Standardize streaming error handling across providers
- Implement consistent streaming cancellation
- Add streaming performance metrics
- Update streaming tests for new APIs

### 5. File-Specific Implementation Details

Core Files to Modify:
- package.json - Version updates and dependency management
- src/providers/openai.js - Web fetch API migration, streaming validation
- src/providers/anthropic.js - SDK v0.60.0 compatibility, error handling
- src/providers/google.js - Real streaming implementation with v1.15.0
- src/providers/mistral.js - Native streaming with v1.9.18 APIs
- src/config.js - Update provider configurations if needed
- tests/providers/*.test.js - Update test cases for new SDK versions

Configuration Files:
- .env.example - Document any new environment variables  
- src/utils/logger.js - Potential logging improvements for new SDKs

### 6. Step-by-Step Update Sequence

Step 1: Backup and Preparation
- git checkout -b update-provider-sdks
- npm run validate (ensure current state is stable)

Step 2: Phase 1 Updates  
- npm update dotenv cors express vite @vitest/coverage-v8 vitest eslint prettier
- npm run validate

Step 3: Phase 2 - OpenAI Update
- npm install openai@5.15.0
- Update src/providers/openai.js for Web fetch API
- npm run test:providers -- openai

Step 4: Phase 3 - Remaining Provider SDKs
- npm install @anthropic-ai/sdk@0.60.0 @google/genai@1.15.0 @mistralai/mistralai@1.9.18  
- Update all provider files
- Implement real streaming for Google and Mistral
- npm run test:providers

Step 5: Security and Final Validation
- npm audit fix
- npm run validate
- npm run test:integration

### 7. Testing Strategy

Unit Tests: Update provider test files for new SDK interfaces
Integration Tests: Verify streaming works end-to-end for all providers
Manual Testing: Test consensus tool with multiple providers streaming
Performance Testing: Verify streaming performance is not degraded
Security Testing: Run audit and verify no new vulnerabilities

### 8. Risk Mitigation

Rollback Plan: Maintain original package-lock.json for quick revert
Feature Flags: Consider gradual rollout of new streaming implementations
Monitoring: Add extra logging during update period
Validation: Comprehensive testing at each phase before proceeding

### 9. Success Criteria Validation

Functional Testing:
- All providers start correctly with new SDKs
- Chat tool works with all providers
- Consensus tool streams properly from all providers
- No regression in existing functionality

Performance Testing:
- Streaming latency comparable or improved
- Memory usage stable after updates
- No new error patterns in logs

Security Testing:
- No new audit vulnerabilities
- All dependencies up to date
- Proper error handling for new SDK error types

Current Status: SDKs already updated to target versions in package.json. Ready for implementation phase focusing on streaming fixes and compatibility testing.

## Implementation Notes

This task updates ALL dependencies (production and development) to ensure the latest features and security patches are available before implementing async streaming infrastructure. Pay special attention to provider SDK updates as they may contain new streaming capabilities or breaking changes.

This task updates ALL dependencies to ensure latest features security patches and bug fixes are available. After updates test that the server starts correctly and basic provider functionality works.

### 6. Step-by-Step Update Sequence

Step 1: Backup and Preparation
- git checkout -b update-provider-sdks
- npm run validate (ensure current state is stable)

Step 2: Phase 1 Updates  
- npm update dotenv cors express vite @vitest/coverage-v8 vitest eslint prettier
- npm run validate

Step 3: Phase 2 - OpenAI Update
- npm install openai@5.15.0
- Update src/providers/openai.js for Web fetch API
- npm run test:providers -- openai

Step 4: Phase 3 - Remaining Provider SDKs
- npm install @anthropic-ai/sdk@0.60.0 @google/genai@1.15.0 @mistralai/mistralai@1.9.18  
- Update all provider files
- Implement real streaming for Google and Mistral
- npm run test:providers

Step 5: Security and Final Validation
- npm audit fix
- npm run validate
- npm run test:integration

### 7. Testing Strategy

Unit Tests: Update provider test files for new SDK interfaces
Integration Tests: Verify streaming works end-to-end for all providers
Manual Testing: Test consensus tool with multiple providers streaming
Performance Testing: Verify streaming performance is not degraded
Security Testing: Run audit and verify no new vulnerabilities

### 8. Risk Mitigation

Rollback Plan: Maintain original package-lock.json for quick revert
Feature Flags: Consider gradual rollout of new streaming implementations
Monitoring: Add extra logging during update period
Validation: Comprehensive testing at each phase before proceeding

### 9. Success Criteria Validation

Functional Testing:
- All providers start correctly with new SDKs
- Chat tool works with all providers
- Consensus tool streams properly from all providers
- No regression in existing functionality

Performance Testing:
- Streaming latency comparable or improved
- Memory usage stable after updates
- No new error patterns in logs

Security Testing:
- No new audit vulnerabilities
- All dependencies up to date
- Proper error handling for new SDK error types

Current Status: SDKs already updated to target versions in package.json. Ready for implementation phase focusing on streaming fixes and compatibility testing.
