# Converse MCP Server - Complete Test Inventory

**Generated:** 2025-11-26

## Summary

- **Total Test Files:** 84
- **Total Individual Tests:** 1081

---

## Async (172 tests)

### async/asyncJobStore.test.js

**Describe Blocks:** AsyncJobStore Unit Tests > Job ID Generation and Validation > Job Creation > Job Retrieval > Job Updates > Job Completion > Job Failure > Job Existence Check > Storage Statistics > Cleanup Operations > Event Ring Buffer > Provider State Helpers > Store Interface and Pluggability > Error Handling > LRU Cache TTL Behavior > Singleton Pattern

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should generate valid job IDs with correct format | ⬜ TODO |
| 2 | should generate unique job IDs | ⬜ TODO |
| 3 | should validate job ID formats correctly | ⬜ TODO |
| 4 | should create job successfully with valid parameters | ⬜ TODO |
| 5 | should create job with custom options | ⬜ TODO |
| 6 | should reject missing jobId | ⬜ TODO |
| 7 | should reject invalid tools | ⬜ TODO |
| 8 | should accept valid tools | ⬜ TODO |
| 9 | should retrieve existing job | ⬜ TODO |
| 10 | should return null for non-existent job | ⬜ TODO |
| 11 | should reject invalid job IDs | ⬜ TODO |
| 12 | should return deep clone to prevent external mutations | ⬜ TODO |
| 13 | should update lastAccessed timestamp on retrieval | ⬜ TODO |
| 14 | should update job status | ⬜ TODO |
| 15 | should update job progress | ⬜ TODO |
| 16 | should clamp progress values | ⬜ TODO |
| 17 | should update provider states | ⬜ TODO |
| 18 | should update timestamps on update | ⬜ TODO |
| 19 | should add events on update | ⬜ TODO |
| 20 | should return false for non-existent job | ⬜ TODO |
| 21 | should reject invalid parameters | ⬜ TODO |
| 22 | should ignore invalid status values | ⬜ TODO |
| 23 | should complete job successfully | ⬜ TODO |
| 24 | should complete job with null result | ⬜ TODO |
| 25 | should add completion event | ⬜ TODO |
| 26 | should return false for non-existent job | ⬜ TODO |
| 27 | should fail job with Error object | ⬜ TODO |
| 28 | should fail job with error object | ⬜ TODO |
| 29 | should add failure event | ⬜ TODO |
| 30 | should return false for non-existent job | ⬜ TODO |
| 31 | should return true for existing job | ⬜ TODO |
| 32 | should return false for non-existent job | ⬜ TODO |
| 33 | should return comprehensive statistics | ⬜ TODO |
| 34 | should clean up all jobs when maxAge is 0 | ⬜ TODO |
| 35 | should clean up old jobs based on age | ⬜ TODO |
| 36 | should not clean up recent jobs | ⬜ TODO |
| 37 | should maintain ring buffer size for events | ⬜ TODO |
| 38 | should maintain event chronological order | ⬜ TODO |
| 39 | should set provider state | ⬜ TODO |
| 40 | should update existing provider state | ⬜ TODO |
| 41 | should return null for non-existent provider | ⬜ TODO |
| 42 | should handle job without providers map | ⬜ TODO |
| 43 | should allow setting custom store implementation | ⬜ TODO |
| 44 | should reject invalid store implementations | ⬜ TODO |
| 45 | should throw AsyncJobStoreError for various error conditions | ⬜ TODO |
| 46 | should respect TTL for automatic job expiration | ⬜ TODO |
| 47 | should return the same instance on multiple calls | ⬜ TODO |
| 48 | should setup cleanup interval only once | ⬜ TODO |

### async/eventBus.test.js

**Describe Blocks:** EventBus Unit Tests > Constructor and Initialization > Event Type Constants > Event Emission Methods > emitJobCreated > emitJobUpdated > emitJobCompleted > emitJobFailed > emitJobCancelled > emitJobStarted > Session-Based Event Filtering > Event History and Ring Buffer > Rate Limiting > Data Sanitization > Validation and Error Handling > Parameter Validation > EventBusError Class > Memory Management and Cleanup > Statistics and Monitoring > Shutdown and Cleanup > Global Instance Management

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should create EventBus with default options | ⬜ TODO |
| 2 | should create EventBus with custom options | ⬜ TODO |
| 3 | should initialize cleanup timer | ⬜ TODO |
| 4 | should initialize tracking maps | ⬜ TODO |
| 5 | should define all required event types | ⬜ TODO |
| 6 | should emit job created event with proper payload | ⬜ TODO |
| 7 | should add event to history | ⬜ TODO |
| 8 | should emit job updated event with progress data | ⬜ TODO |
| 9 | should emit job completed event with result indicator | ⬜ TODO |
| 10 | should handle null result | ⬜ TODO |
| 11 | should emit job failed event with Error object | ⬜ TODO |
| 12 | should handle plain object errors | ⬜ TODO |
| 13 | should emit job cancelled event with reason | ⬜ TODO |
| 14 | should use default reason if none provided | ⬜ TODO |
| 15 | should emit job started event with tool info | ⬜ TODO |
| 16 | should add session listener that only receives events for that session | ⬜ TODO |
| 17 | should update session activity when adding listeners | ⬜ TODO |
| 18 | should support multiple listeners for the same session and event type | ⬜ TODO |
| 19 | should remove specific session listener | ⬜ TODO |
| 20 | should remove all session listeners | ⬜ TODO |
| 21 | should return false when trying to remove non-existent session listener | ⬜ TODO |
| 22 | should return 0 when trying to remove all listeners for non-existent session | ⬜ TODO |
| 23 | should maintain event history for jobs | ⬜ TODO |
| 24 | should filter event history by session | ⬜ TODO |
| 25 | should maintain ring buffer size limit | ⬜ TODO |
| 26 | should apply limit when getting event history | ⬜ TODO |
| 27 | should return empty array for non-existent job history | ⬜ TODO |
| 28 | should handle invalid parameters gracefully | ⬜ TODO |
| 29 | should allow events within rate limit | ⬜ TODO |
| 30 | should reject events exceeding rate limit | ⬜ TODO |
| 31 | should reset rate limits after time window | ⬜ TODO |
| 32 | should track rate limits per session | ⬜ TODO |
| 33 | should sanitize sensitive data from event payloads | ⬜ TODO |
| 34 | should sanitize nested sensitive data | ⬜ TODO |
| 35 | should validate event types | ⬜ TODO |
| 36 | should validate job IDs | ⬜ TODO |
| 37 | should validate session IDs | ⬜ TODO |
| 38 | should validate callbacks when adding session listeners | ⬜ TODO |
| 39 | should validate payload size | ⬜ TODO |
| 40 | should create EventBusError with message and code | ⬜ TODO |
| 41 | should use default code if none provided | ⬜ TODO |
| 42 | should track session activity | ⬜ TODO |
| 43 | should clean up expired sessions | ⬜ TODO |
| 44 | should clean up old event history | ⬜ TODO |
| 45 | should not clean up active sessions | ⬜ TODO |
| 46 | should track event emission statistics | ⬜ TODO |
| 47 | should track listener statistics | ⬜ TODO |
| 48 | should include memory and system information in stats | ⬜ TODO |
| 49 | should shutdown cleanly | ⬜ TODO |
| 50 | should remove all event listeners on shutdown | ⬜ TODO |
| 51 | should create global instance on first access | ⬜ TODO |
| 52 | should accept custom options for global instance | ⬜ TODO |
| 53 | should allow setting custom EventBus instance | ⬜ TODO |
| 54 | should validate EventBus instance when setting | ⬜ TODO |
| 55 | should shutdown previous instance when setting new one | ⬜ TODO |
| 56 | should create EventBus with createEventBus function | ⬜ TODO |

### async/fileCache.test.js

**Describe Blocks:** FileCache Unit Tests > FileCache Initialization > Singleton Pattern > Interface Implementation > Path Generation > Directory Management > Journal Event Writing > Snapshot Writing > Snapshot Reading > Cleanup Operations > Error Handling > Cleanup Timer Integration

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should initialize with default configuration | ⬜ TODO |
| 2 | should initialize with custom configuration | ⬜ TODO |
| 3 | should start cleanup timer on initialization | ⬜ TODO |
| 4 | should stop cleanup timer when requested | ⬜ TODO |
| 5 | should return same instance on multiple calls | ⬜ TODO |
| 6 | should allow setting custom instance for testing | ⬜ TODO |
| 7 | should stop timer when replacing instance | ⬜ TODO |
| 8 | should extend FileCacheInterface | ⬜ TODO |
| 9 | should throw error for unimplemented interface methods | ⬜ TODO |
| 10 | should generate correct job directory path | ⬜ TODO |
| 11 | should generate correct journal file path | ⬜ TODO |
| 12 | should generate correct snapshot file path | ⬜ TODO |
| 13 | should ensure directory exists successfully | ⬜ TODO |
| 14 | should throw FileCacheError when directory creation fails | ⬜ TODO |
| 15 | should write journal event successfully | ⬜ TODO |
| 16 | should validate job ID parameter | ⬜ TODO |
| 17 | should validate event parameter | ⬜ TODO |
| 18 | should handle directory creation failure gracefully | ⬜ TODO |
| 19 | should handle file write failure gracefully | ⬜ TODO |
| 20 | should add metadata to events | ⬜ TODO |
| 21 | should write snapshot successfully | ⬜ TODO |
| 22 | should validate job ID parameter | ⬜ TODO |
| 23 | should validate result parameter | ⬜ TODO |
| 24 | should handle file write failure gracefully | ⬜ TODO |
| 25 | should add metadata to snapshot | ⬜ TODO |
| 26 | should read snapshot successfully from current date | ⬜ TODO |
| 27 | should search in recent directories if not found in current date | ⬜ TODO |
| 28 | should return null if snapshot not found anywhere | ⬜ TODO |
| 29 | should validate job ID parameter | ⬜ TODO |
| 30 | should handle malformed JSON gracefully | ⬜ TODO |
| 31 | should return null when base directory does not exist | ⬜ TODO |
| 32 | should filter and sort date directories correctly | ⬜ TODO |
| 33 | should clean up old directories successfully | ⬜ TODO |
| 34 | should return 0 when base directory does not exist | ⬜ TODO |
| 35 | should continue cleanup even if individual directory removal fails | ⬜ TODO |
| 36 | should handle stat errors gracefully | ⬜ TODO |
| 37 | should throw FileCacheError when cleanup fails completely | ⬜ TODO |
| 38 | should use default max age when not provided | ⬜ TODO |
| 39 | should filter date directories with regex correctly | ⬜ TODO |
| 40 | should create FileCacheError with correct properties | ⬜ TODO |
| 41 | should use default error code when not provided | ⬜ TODO |
| 42 | should propagate existing FileCacheError without wrapping | ⬜ TODO |
| 43 | should handle cleanup timer errors gracefully | ⬜ TODO |
| 44 | should log successful cleanup with count | ⬜ TODO |
| 45 | should not log when no directories cleaned | ⬜ TODO |

### async/providerStreamNormalizer.test.js

**Describe Blocks:** ProviderStreamNormalizer > normalize() method > OpenAI Stream Normalization > XAI Stream Normalization > Google GenAI Stream Normalization > Anthropic Stream Normalization > DeepSeek Stream Normalization > Error Handling > Event Creation Methods > Stream Validation > Case Sensitivity and Provider Names > Provider-Specific Features

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should throw error for unsupported provider | ⬜ TODO |
| 2 | should route to correct provider normalizer | ⬜ TODO |
| 3 | should normalize complete OpenAI Chat Completions stream | ⬜ TODO |
| 4 | should handle OpenAI Responses API format | ⬜ TODO |
| 5 | should normalize XAI stream with search metadata | ⬜ TODO |
| 6 | should normalize Google stream with grounding metadata | ⬜ TODO |
| 7 | should normalize Anthropic stream with thinking tokens | ⬜ TODO |
| 8 | should normalize DeepSeek stream with reasoning tokens | ⬜ TODO |
| 9 | should normalize error events correctly | ⬜ TODO |
| 10 | should handle stream processing errors | ⬜ TODO |
| 11 | should create valid start events | ⬜ TODO |
| 12 | should create valid delta events | ⬜ TODO |
| 13 | should create valid usage events | ⬜ TODO |
| 14 | should create valid end events | ⬜ TODO |
| 15 | should create valid error events | ⬜ TODO |
| 16 | should determine error recoverability correctly | ⬜ TODO |
| 17 | should validate complete valid stream | ⬜ TODO |
| 18 | should detect invalid stream structure | ⬜ TODO |
| 19 | should detect missing start or end events | ⬜ TODO |
| 20 | should validate specific event types | ⬜ TODO |
| 21 | should handle case-insensitive provider names | ⬜ TODO |
| 22 | should preserve OpenRouter routing metadata | ⬜ TODO |
| 23 | should handle Mistral streaming format | ⬜ TODO |

## Fixtures (20 tests)

### fixtures/examples/migration-example.test.js

**Describe Blocks:** Migration Example: Provider Tests > Migration Example: Error Handling > Migration Example: Tool Testing > Migration Example: Edge Case Testing > Migration Example: File Testing > Migration Example: Streaming Responses > Migration Example: Test Matrix > Migration Example: Custom Mock Responses

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should handle provider response | ⬜ TODO |
| 2 | should handle rate limit errors | ⬜ TODO |
| 3 | should process chat request | ⬜ TODO |
| 4 | should handle edge case strings | ⬜ TODO |
| 5 | should load file fixtures | ⬜ TODO |
| 6 | should generate streaming chunks | ⬜ TODO |
| 7 | should create custom mock response | ⬜ TODO |

### fixtures/fixture-validation.test.js

**Describe Blocks:** Fixture Validation > Provider Response Fixtures > Tool Fixtures > Error Scenarios > Edge Cases > File Fixtures > Fixture Loader Functions > Test Scenarios > Fixture Consistency

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should have a default response | ⬜ TODO |
| 2 | should have valid response structure | ⬜ TODO |
| 3 | should have valid streaming response structure | ⬜ TODO |
| 4 | should handle special string edge cases | ⬜ TODO |
| 5 | should handle number edge cases | ⬜ TODO |
| 6 | should handle empty file correctly | ⬜ TODO |
| 7 | should load JSON files as valid JSON | ⬜ TODO |
| 8 | should create valid mock responses | ⬜ TODO |
| 9 | should generate valid test matrix | ⬜ TODO |
| 10 | should list fixtures correctly | ⬜ TODO |
| 11 | should cache fixtures properly | ⬜ TODO |
| 12 | all provider responses should have consistent usage fields | ⬜ TODO |
| 13 | all tool fixtures should have consistent metadata | ⬜ TODO |

## Integration (167 tests)

### integration/async-workflow/async-integration.test.js

**Describe Blocks:** Async Workflow Integration Tests > Basic Async Workflow > Async Error Handling > Async Consensus Tool > Job Cancellation > Progress Tracking > Concurrent Async Jobs

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should handle async=true with immediate continuation_id response | ⬜ TODO |
| 2 | should poll status and retrieve results | ⬜ TODO |
| 3 | should handle invalid async requests gracefully | ⬜ TODO |
| 4 | should handle check_status for non-existent jobs | ⬜ TODO |
| 5 | should handle job cancellation correctly | ⬜ TODO |

### integration/async-workflow/async-scenarios.test.js

**Describe Blocks:** Async Scenarios Integration Tests > Multi-step Async Conversations > File Processing in Async Mode > Mixed Sync and Async Operations > Error Recovery Scenarios > Performance Under Load > Real-world Async Consensus Scenarios

| # | Test Name | Status |
|---|-----------|--------|
| 2 | should handle provider failures gracefully in async mode | ⬜ TODO |

### integration/async-workflow/async-summarization.test.js

**Describe Blocks:** Async Chat with Summarization Enabled

*No individual tests found (may use dynamic test generation)*

### integration/async-workflow/cache-integration.test.js

**Describe Blocks:** Cache System Integration Tests > Memory to Disk Cache Transition > Large Result Handling > Cache TTL and Cleanup > Concurrent Cache Access > Cache Performance

| # | Test Name | Status |
|---|-----------|--------|

### integration/async-workflow/filecache-integration.test.js

**Describe Blocks:** FileCache Integration Tests > FileCache Write Operations > check_status FileCache Retrieval > End-to-End Async Flow with FileCache > FileCache Directory Structure

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should write snapshot when job completes successfully | ⬜ TODO |
| 2 | should write snapshot when job fails | ⬜ TODO |
| 3 | should write snapshot when job is cancelled | ⬜ TODO |
| 4 | should retrieve completed jobs from FileCache | ⬜ TODO |
| 5 | should retrieve specific job from FileCache by continuation_id | ⬜ TODO |
| 6 | continuation_id: | ⬜ TODO |
| 8 | continuation_id: | ⬜ TODO |
| 10 | should organize snapshots by date | ⬜ TODO |
| 12 | should handle journal events | ⬜ TODO |

### integration/general/error-recovery.test.js

**Describe Blocks:** Error Scenario and Recovery Tests > Provider Error Recovery > Continuation Store Error Recovery > Network and Infrastructure Errors > Input Validation and Sanitization > Resource Exhaustion Recovery > Error Reporting and Logging > Recovery Mechanisms

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should handle provider API key errors gracefully | ⬜ TODO |
| 2 | should recover from temporary provider failures | ⬜ TODO |
| 3 | should handle provider timeout scenarios | ⬜ TODO |
| 4 | should handle continuation store corruption gracefully | ⬜ TODO |
| 5 | should handle missing continuation IDs gracefully | ⬜ TODO |
| 6 | should handle continuation store failures during save | ⬜ TODO |
| 7 | should handle DNS resolution failures | ⬜ TODO |
| 8 | should handle partial network connectivity | ⬜ TODO |
| 9 | should handle malformed JSON in arguments | ⬜ TODO |
| 10 | should handle extremely large inputs | ⬜ TODO |
| 11 | should handle special characters and encoding issues | ⬜ TODO |
| 12 | should handle memory pressure gracefully | ⬜ TODO |
| 13 | should handle rapid request bursts | ⬜ TODO |
| 14 | should provide detailed error information | ⬜ TODO |
| 15 | should maintain error correlation across requests | ⬜ TODO |
| 16 | should implement circuit breaker pattern for providers | ⬜ TODO |
| 17 | should implement retry logic for transient failures | ⬜ TODO |
| 18 | should implement graceful degradation | ⬜ TODO |

### integration/general/file-validation.test.js

**Describe Blocks:** File Validation Integration Tests > Chat Tool File Validation > Consensus Tool File Validation > Path Resolution

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should return error when files do not exist | ⬜ TODO |
| 2 | should return error when images do not exist | ⬜ TODO |
| 3 | should return error when both files and images do not exist | ⬜ TODO |
| 4 | should work normally when all files exist | ⬜ TODO |
| 5 | should handle mix of existing and non-existing files | ⬜ TODO |
| 6 | should return error when files do not exist | ⬜ TODO |
| 7 | should return error when images do not exist | ⬜ TODO |
| 8 | should work normally when all files exist | ⬜ TODO |
| 9 | should handle absolute paths correctly | ⬜ TODO |
| 10 | should handle relative paths correctly | ⬜ TODO |

### integration/mcp-protocol/mcp-client-integration.test.js

**Describe Blocks:** MCP Client Integration Test Suite > MCP Protocol Compliance Testing > Server Capabilities and Tool Discovery > Tool Execution Workflows via MCP Client > Error Scenarios and Recovery Testing > Concurrent Client Connections and Resource Management > Real API Integration via MCP Client > MCP Protocol Performance and Reliability

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should establish client-server connection with proper handshake | ⬜ TODO |
| 2 | should handle MCP initialize request correctly | ⬜ TODO |
| 3 | should maintain proper MCP session management | ⬜ TODO |
| 4 | should discover available tools through MCP client | ⬜ TODO |
| 5 | should validate tool schemas meet MCP specifications | ⬜ TODO |
| 6 | should provide comprehensive tool documentation | ⬜ TODO |
| 7 | should execute chat tool with proper MCP response format | ⬜ TODO |
| 8 | should execute consensus tool with structured response | ⬜ TODO |
| 9 | should handle tool chaining with continuation context | ⬜ TODO |
| 10 | should handle invalid tool name with proper MCP error response | ⬜ TODO |
| 11 | should handle missing required parameters with validation errors | ⬜ TODO |
| 12 | should handle consensus tool with missing models parameter | ⬜ TODO |
| 13 | should recover from tool execution errors gracefully | ⬜ TODO |
| 14 | should handle multiple concurrent tool calls | ⬜ TODO |
| 15 | should handle rapid sequential tool calls without session interference | ⬜ TODO |
| 16 | should maintain server resource limits under load | ⬜ TODO |
| 17 | should properly clean up resources after client disconnect | ⬜ TODO |
| 18 | should meet performance benchmarks for tool discovery | ⬜ TODO |
| 19 | should handle tool execution within reasonable time limits | ⬜ TODO |
| 20 | should maintain connection stability over multiple operations | ⬜ TODO |

### integration/mcp-protocol/mcp-protocol-enhanced.test.js

**Describe Blocks:** Enhanced MCP Protocol Compliance Tests > MCP SDK Integration > Tool Schema Compliance > Request/Response Cycle Compliance > Error Handling Compliance > Concurrency and Performance > Protocol Extension Support > Full Protocol Workflow

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should create server with proper MCP SDK structure | ⬜ TODO |
| 2 | should handle ListToolsRequestSchema correctly | ⬜ TODO |
| 3 | should handle CallToolRequestSchema correctly | ⬜ TODO |
| 4 | should return proper MCP error responses | ⬜ TODO |
| 5 | should have JSON Schema compliant input schemas | ⬜ TODO |
| 6 | should provide comprehensive tool descriptions | ⬜ TODO |
| 7 | should handle complete request/response cycle for chat tool | ⬜ TODO |
| 8 | should handle complete request/response cycle for consensus tool | ⬜ TODO |
| 9 | should validate argument types against schema | ⬜ TODO |
| 10 | should provide standardized error responses | ⬜ TODO |
| 11 | should include helpful error context | ⬜ TODO |
| 12 | should handle concurrent MCP requests correctly | ⬜ TODO |
| 13 | should maintain acceptable response times | ⬜ TODO |
| 14 | should support optional parameters correctly | ⬜ TODO |
| 15 | should handle future parameter extensions gracefully | ⬜ TODO |
| 16 | should complete full MCP workflow | ⬜ TODO |

### integration/mcp-protocol/mcp-protocol.test.js

**Describe Blocks:** MCP Protocol Workflow Tests > Router Setup > MCP Request/Response Protocol > Tool Schema Validation > MCP Content Protocol > Error Response Protocol > Tool Execution Flow > Protocol Compliance

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should create router with proper configuration | ⬜ TODO |
| 2 | should handle ListToolsRequest with proper schema | ⬜ TODO |
| 3 | should handle CallToolRequest with proper schema validation | ⬜ TODO |
| 4 | should return proper error responses for invalid tool calls | ⬜ TODO |
| 5 | should have valid JSON schemas for all tools | ⬜ TODO |
| 6 | should provide helpful descriptions for tools and parameters | ⬜ TODO |
| 7 | should return content in proper MCP format | ⬜ TODO |
| 8 | should handle structured responses for consensus tool | ⬜ TODO |
| 9 | should return proper MCP error format | ⬜ TODO |
| 10 | should include helpful error context | ⬜ TODO |
| 11 | should complete full tool execution workflow | ⬜ TODO |
| 12 | should handle tool chaining with continuation | ⬜ TODO |
| 13 | should conform to MCP specification | ⬜ TODO |
| 14 | should handle concurrent MCP requests | ⬜ TODO |

### integration/mcp-protocol/mcp-server-lifecycle.test.js

**Describe Blocks:** MCP Server Lifecycle Integration Tests > Server Configuration > Server Initialization > Provider Availability > Server Startup Simulation > Server Shutdown Simulation > Process Spawning Test > Memory and Performance

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should load configuration correctly | ⬜ TODO |
| 2 | should validate environment variables correctly | ⬜ TODO |
| 3 | should have MCP client configuration | ⬜ TODO |
| 4 | should create MCP server with proper metadata | ⬜ TODO |
| 5 | should detect available providers correctly | ⬜ TODO |
| 6 | should validate provider interfaces | ⬜ TODO |
| 7 | should complete startup sequence without errors | ⬜ TODO |
| 8 | should handle configuration errors gracefully | ⬜ TODO |
| 9 | should handle graceful shutdown | ⬜ TODO |
| 10 | should cleanup continuation store on shutdown | ⬜ TODO |
| 11 | should be able to spawn the actual server process | ⬜ TODO |
| 12 | should have reasonable memory usage | ⬜ TODO |
| 13 | should start up quickly | ⬜ TODO |

### integration/mcp-protocol/mcp-server.test.js

**Describe Blocks:** MCP Server Integration Tests > HTTP Transport Integration

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should handle tools/list request via HTTP | ⬜ TODO |
| 2 | should validate tool arguments properly via HTTP | ⬜ TODO |
| 3 | should have proper error handling for invalid requests via HTTP | ⬜ TODO |
| 4 | should handle concurrent operations via HTTP | ⬜ TODO |
| 5 | should provide HTTP health and info endpoints | ⬜ TODO |

### integration/performance/performance-consensus.test.js

**Describe Blocks:** Consensus Performance Tests > Parallel Execution Performance > Concurrent Consensus Performance > Memory and Resource Usage > Error Handling Performance > Scalability Testing > Performance Benchmarks

| # | Test Name | Status |
|---|-----------|--------|
| 2 | should execute consensus faster than sequential calls | ⬜ TODO |
| 3 | should maintain performance with increasing model count | ⬜ TODO |
| 4 | should handle cross-feedback performance correctly | ⬜ TODO |
| 5 | should handle multiple concurrent consensus requests | ⬜ TODO |
| 6 | should maintain quality under concurrent load | ⬜ TODO |
| 7 | should maintain reasonable memory usage during consensus | ⬜ TODO |
| 8 | should handle resource cleanup correctly | ⬜ TODO |
| 9 | should fail fast when no providers are available | ⬜ TODO |
| 10 | should handle partial provider failures efficiently | ⬜ TODO |
| 11 | should scale with real multiple providers | ⬜ TODO |
| 12 | should handle high-frequency consensus requests | ⬜ TODO |
| 13 | should meet baseline performance requirements | ⬜ TODO |

### integration/providers/anthropic/anthropic-api.test.js

**Describe Blocks:** Anthropic API Integration Tests > Basic Chat Functionality > Error Handling > Streaming Support > Performance

*No individual tests found (may use dynamic test generation)*

### integration/providers/anthropic/anthropic-error.test.js

**Describe Blocks:** Anthropic Error Handling and Edge Cases > Rate Limiting > Conversation Continuity Edge Cases

*No individual tests found (may use dynamic test generation)*

### integration/providers/anthropic/anthropic-features.test.js

**Describe Blocks:** Anthropic Feature-Specific Tests > Thinking Model Features > Multi-Model Consensus with Anthropic > Cross-Provider Features > Streaming with Advanced Features

*No individual tests found (may use dynamic test generation)*

### integration/providers/codex/codex-api.test.js

**Describe Blocks:** Codex Provider E2E Tests > Basic Chat Functionality > Streaming Support > Async Mode > Error Handling > Performance Characteristics > Consensus Tool Integration > Configuration Integration

*No individual tests found (may use dynamic test generation)*

### integration/providers/debug-tests.test.js

**Describe Blocks:** Debug Provider Message Format

*No individual tests found (may use dynamic test generation)*

### integration/providers/deepseek/deepseek-api.test.js

**Describe Blocks:** DeepSeek API Integration Tests > Basic Chat Functionality > Error Handling > Streaming Functionality > Performance

*No individual tests found (may use dynamic test generation)*

### integration/providers/deepseek/deepseek-features.test.js

**Describe Blocks:** DeepSeek Feature-Specific Tests > Specialized Model Features > Multi-Model Consensus with DeepSeek > Cross-Provider Integration

*No individual tests found (may use dynamic test generation)*

### integration/providers/gemini-cli/gemini-cli-api.test.js

**Describe Blocks:** Gemini CLI Provider E2E Tests > Basic Chat Functionality > Consensus Tool Integration > Async Mode > Error Handling > Streaming Support

*No individual tests found (may use dynamic test generation)*

### integration/providers/google/google-api.test.js

**Describe Blocks:** Google API Integration Tests > Basic Chat Functionality > Error Handling > Performance > Streaming Functionality

*No individual tests found (may use dynamic test generation)*

### integration/providers/google/google-features.test.js

**Describe Blocks:** Google Feature-Specific Tests > Thinking Mode Features > Multi-Model Consensus with Google > Cross-Provider Consensus

*No individual tests found (may use dynamic test generation)*

### integration/providers/google/google-image.test.js

**Describe Blocks:** Google Image Processing Tests > Gemini Pro Image Processing > Multi-Modal Conversations > Error Handling

*No individual tests found (may use dynamic test generation)*

### integration/providers/mistral/mistral-api.test.js

**Describe Blocks:** Mistral API Integration Tests > Basic Chat Functionality > Error Handling > Performance > Streaming Functionality

*No individual tests found (may use dynamic test generation)*

### integration/providers/mistral/mistral-features.test.js

**Describe Blocks:** Mistral Feature-Specific Tests > Advanced Model Features > Multi-Model Consensus with Mistral > Language Capabilities

*No individual tests found (may use dynamic test generation)*

### integration/providers/multi-provider-advanced.test.js

**Describe Blocks:** Advanced Multi-Provider Integration Tests > Consensus with File Context > Complex Conversation Flow > Provider Output Consistency > Concurrent Provider Requests

*No individual tests found (may use dynamic test generation)*

### integration/providers/multi-provider-error.test.js

**Describe Blocks:** Multi-Provider Error Handling Tests > Invalid Model Names Across Providers > Rate Limiting Across Providers

*No individual tests found (may use dynamic test generation)*

### integration/providers/multi-provider.test.js

**Describe Blocks:** Multi-Provider Consensus Integration Tests > Main Provider Consensus > Mixed Provider Consensus > All Provider Stress Test > Error Recovery in Consensus

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should handle consensus with all available providers | ⬜ TODO |

### integration/providers/openai/openai-api.test.js

**Describe Blocks:** OpenAI API Integration Tests > Basic Chat Functionality > Error Handling > Performance > Streaming Functionality

*No individual tests found (may use dynamic test generation)*

### integration/providers/openai/openai-features.test.js

**Describe Blocks:** OpenAI Feature-Specific Tests > O3 Model Features > Multi-Model Consensus with OpenAI > Web Search Features

*No individual tests found (may use dynamic test generation)*

### integration/providers/openrouter/openrouter-api.test.js

**Describe Blocks:** OpenRouter API Integration Tests > Basic Chat Functionality > Error Handling > Streaming Functionality > Performance

*No individual tests found (may use dynamic test generation)*

### integration/providers/openrouter/openrouter-features.test.js

**Describe Blocks:** OpenRouter Feature-Specific Tests > Thinking Model Features > Multi-Model Access > Dynamic Model Support > Consensus with OpenRouter Models

*No individual tests found (may use dynamic test generation)*

### integration/providers/xai/xai-api.test.js

**Describe Blocks:** XAI API Integration Tests > Basic Chat Functionality > Error Handling > Performance > Streaming Functionality

*No individual tests found (may use dynamic test generation)*

### integration/providers/xai/xai-features.test.js

**Describe Blocks:** XAI Feature-Specific Tests > Web Search Features > Multi-Model Consensus with XAI > Multi-Provider Consensus

*No individual tests found (may use dynamic test generation)*

### integration/providers/xai/xai-image.test.js

**Describe Blocks:** XAI Image Processing Tests > Grok-4 Image Processing > Image Processing with Text Conversations

*No individual tests found (may use dynamic test generation)*

### integration/reasoning-summaries.test.js

**Describe Blocks:** OpenAI Reasoning Summaries

*No individual tests found (may use dynamic test generation)*

### integration/services/summarizationService.api.test.js

**Describe Blocks:** SummarizationService Real API Tests > OpenAI GPT-5 Tests > Google Gemini-2.5-Flash Tests > Performance and Optimization Tests > Auto-selection Tests > Content Quality Tests

*No individual tests found (may use dynamic test generation)*

### integration/tools/consensus-image.test.js

**Describe Blocks:** Consensus Tool Image Processing

*No individual tests found (may use dynamic test generation)*

### integration/tools/continuation-flow.test.js

**Describe Blocks:** Continuation Flow Integration Tests > Single Conversation Flow > Multiple Concurrent Conversations > Consensus Tool Continuation > Error Handling in Continuation Flow > Continuation Store Management > Continuation Flow Performance > Real-World Continuation Scenarios

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should create and maintain conversation across multiple requests | ⬜ TODO |
| 2 | should handle conversation persistence across router instances | ⬜ TODO |
| 3 | should handle multiple independent conversations simultaneously | ⬜ TODO |
| 4 | should handle concurrent access to same conversation | ⬜ TODO |
| 5 | should maintain consensus conversation history | ⬜ TODO |
| 6 | should handle mixed tool conversations | ⬜ TODO |
| 7 | should handle invalid continuation IDs gracefully | ⬜ TODO |
| 8 | should handle corrupted conversation state | ⬜ TODO |
| 9 | should handle provider errors during continuation | ⬜ TODO |
| 10 | should provide accurate conversation statistics | ⬜ TODO |
| 11 | should handle conversation cleanup correctly | ⬜ TODO |
| 12 | should handle bulk cleanup operations | ⬜ TODO |
| 13 | should maintain reasonable performance with long conversations | ⬜ TODO |
| 14 | should handle rapid continuation requests | ⬜ TODO |
| 15 | should handle conversation interruption and resumption | ⬜ TODO |
| 16 | should handle conversation branching scenario | ⬜ TODO |

### integration/tools/tools-integration.test.js

**Describe Blocks:** Tools Integration Tests > Chat Tool Integration > Consensus Tool Integration > Provider Integration > Context Processing Integration > Continuation Store Integration > Error Handling Integration > Performance Integration

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should handle basic chat requests | ⬜ TODO |
| 2 | should handle chat with continuation | ⬜ TODO |
| 3 | should handle invalid provider gracefully | ⬜ TODO |
| 4 | should process file context | ⬜ TODO |
| 5 | should handle basic consensus requests | ⬜ TODO |
| 6 | should handle multiple models | ⬜ TODO |
| 7 | should handle cross-feedback when enabled | ⬜ TODO |
| 8 | should validate provider interfaces | ⬜ TODO |
| 9 | should check provider availability | ⬜ TODO |
| 10 | should provide model configurations | ⬜ TODO |
| 11 | should process unified context | ⬜ TODO |
| 12 | should handle file processing errors gracefully | ⬜ TODO |
| 13 | should store and retrieve conversation state | ⬜ TODO |
| 14 | should provide statistics | ⬜ TODO |
| 15 | should handle missing required parameters | ⬜ TODO |
| 16 | should handle consensus tool validation | ⬜ TODO |
| 17 | should handle invalid continuation IDs | ⬜ TODO |
| 18 | should complete tool execution within reasonable time | ⬜ TODO |
| 19 | should handle concurrent tool executions | ⬜ TODO |

## Prompts (11 tests)

### prompts/help.test.js

**Describe Blocks:** Help Prompt > helpPromptHandler > Dynamic content generation

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should have correct metadata | ⬜ TODO |
| 2 | should have topic argument | ⬜ TODO |
| 3 | should generate full help when no topic specified | ⬜ TODO |
| 4 | should generate tools help when topic is tools | ⬜ TODO |
| 5 | should generate models help when topic is models | ⬜ TODO |
| 6 | should generate parameters help when topic is parameters | ⬜ TODO |
| 7 | should generate examples help when topic is examples | ⬜ TODO |
| 8 | should handle unknown topic gracefully | ⬜ TODO |
| 9 | should include real model information from providers | ⬜ TODO |
| 10 | should include model aliases | ⬜ TODO |
| 11 | should include model features | ⬜ TODO |

## Resources (7 tests)

### resources/helpResource.test.js

**Describe Blocks:** Help Resource > helpResourceMetadata > listResources > helpResourceHandler

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should have correct metadata | ⬜ TODO |
| 2 | should return array with help resource metadata | ⬜ TODO |
| 3 | should return resource content with correct structure | ⬜ TODO |
| 4 | should include help documentation content | ⬜ TODO |
| 5 | should include version information | ⬜ TODO |
| 6 | should include model details with descriptions | ⬜ TODO |
| 7 | should include configuration and best practices | ⬜ TODO |

## Root (4 tests)

### core-continuation-verification.test.js

**Describe Blocks:** Core Continuation Verification Tests

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should handle multiple chat continuations with math progression | ⬜ TODO |
| 3 | should handle consensus with math continuation | ⬜ TODO |
| 4 | should handle mixed chat and consensus with math progression | ⬜ TODO |

## Services (14 tests)

### services/summarizationService.test.js

**Describe Blocks:** SummarizationService > generateTitle > generateStreamingSummary > generateFinalSummary > setEnabled > provider selection

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should generate a title when provider is available | ⬜ TODO |
| 2 | should fallback to text snippet when provider fails | ⬜ TODO |
| 3 | should truncate title to 50 characters | ⬜ TODO |
| 4 | should handle empty prompt gracefully | ⬜ TODO |
| 5 | should generate streaming summary when provider is available | ⬜ TODO |
| 6 | should fallback when provider unavailable | ⬜ TODO |
| 7 | should generate final summary when provider is available | ⬜ TODO |
| 8 | should fallback to text snippet on error | ⬜ TODO |
| 9 | should disable summarization when set to false | ⬜ TODO |
| 10 | should re-enable summarization when set to true | ⬜ TODO |
| 11 | should use first available provider | ⬜ TODO |
| 12 | should fallback when no providers available | ⬜ TODO |
| 13 | should use fallback when summarization is disabled | ⬜ TODO |
| 14 | should use configured model when specified | ⬜ TODO |

## Shared (11 tests)

### shared/examples/usage-example.test.js

**Describe Blocks:** Shared Test Utilities Usage Examples > Mock Provider Examples > Mock Tool Examples > Helper Utilities Examples > Fixture Examples > Integration Examples

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should create a basic mock provider | ⬜ TODO |
| 2 | should create provider-specific mocks | ⬜ TODO |
| 3 | should use mock provider registry | ⬜ TODO |
| 4 | should create mock chat tool | ⬜ TODO |
| 5 | should use async helpers | ⬜ TODO |
| 6 | should use filesystem mocks | ⬜ TODO |
| 7 | should use continuation store mock | ⬜ TODO |
| 8 | should use response fixtures | ⬜ TODO |
| 9 | should use prompt fixtures | ⬜ TODO |
| 10 | should create test matrix | ⬜ TODO |
| 11 | should combine utilities for complex test scenarios | ⬜ TODO |

## Tools (167 tests)

### tools/async/jobRunner.test.js

**Describe Blocks:** JobRunner > Constructor > Job Submission > Job Execution > Concurrency Control > Job Cancellation > Job Timeouts > Statistics and Monitoring > Graceful Shutdown > Factory Functions > Integration with AsyncJobStore > Error Handling

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should create JobRunner with required dependencies | ⬜ TODO |
| 2 | should throw error without asyncJobStore | ⬜ TODO |
| 3 | should use default options when none provided | ⬜ TODO |
| 4 | should submit job and return job ID immediately | ⬜ TODO |
| 5 | should validate job specification | ⬜ TODO |
| 6 | should emit job.created event on submission | ⬜ TODO |
| 7 | should handle job execution errors | ⬜ TODO |
| 8 | should emit job lifecycle events | ⬜ TODO |
| 9 | should respect concurrency limits | ⬜ TODO |
| 10 | should track active job count correctly | ⬜ TODO |
| 11 | should cancel queued job | ⬜ TODO |
| 12 | should cancel running job | ⬜ TODO |
| 13 | should emit cancellation event | ⬜ TODO |
| 14 | should not cancel completed jobs | ⬜ TODO |
| 15 | should timeout long-running jobs | ⬜ TODO |
| 16 | should use default timeout when not specified | ⬜ TODO |
| 17 | should track statistics correctly | ⬜ TODO |
| 18 | should return comprehensive stats | ⬜ TODO |
| 19 | should wait for active jobs to complete during shutdown | ⬜ TODO |
| 20 | should force shutdown after timeout | ⬜ TODO |
| 21 | should create JobRunner with createJobRunner | ⬜ TODO |
| 22 | should manage global instance with getJobRunner | ⬜ TODO |
| 23 | should validate runner instance in setJobRunner | ⬜ TODO |
| 24 | should create jobs with proper initial state | ⬜ TODO |
| 25 | should update job status during execution | ⬜ TODO |
| 26 | should handle AsyncJobStore errors gracefully | ⬜ TODO |
| 27 | should handle system errors during execution | ⬜ TODO |

### tools/async-support.test.js

**Describe Blocks:** Async Support Tests > Chat Tool Async Support > Consensus Tool Async Support > Backwards Compatibility

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should execute synchronously when async=false (default) | ⬜ TODO |
| 2 | should execute synchronously when async parameter is omitted | ⬜ TODO |
| 3 | should submit async job when async=true | ⬜ TODO |
| 4 | should preserve existing continuation_id in async mode | ⬜ TODO |
| 5 | should return error when async dependencies are missing | ⬜ TODO |
| 6 | should handle job submission errors gracefully | ⬜ TODO |
| 7 | should execute synchronously when async=false (default) | ⬜ TODO |
| 8 | should execute synchronously when async parameter is omitted | ⬜ TODO |
| 9 | should submit async job when async=true | ⬜ TODO |
| 10 | should preserve existing continuation_id in async mode | ⬜ TODO |
| 11 | should return error when async dependencies are missing | ⬜ TODO |
| 12 | should handle job submission errors gracefully | ⬜ TODO |
| 13 | should support cross-feedback in async mode | ⬜ TODO |
| 14 | should maintain existing chat behavior when async parameter is not used | ⬜ TODO |
| 15 | should maintain existing consensus behavior when async parameter is not used | ⬜ TODO |

### tools/cancelJob.test.js

**Describe Blocks:** Cancel Job Tool > Input Validation > Dependency Validation > Job Not Found > Job Status Validation > Successful Cancellation > Partial Result Preservation > Cancellation Failures > Error Handling > Metadata and Response Format > Tool Schema Validation

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should return error for missing continuation_id | ⬜ TODO |
| 2 | should return error for invalid continuation_id type | ⬜ TODO |
| 3 | should return error for empty continuation_id | ⬜ TODO |
| 4 | should return error when JobRunner is missing | ⬜ TODO |
| 5 | should return error when AsyncJobStore is missing | ⬜ TODO |
| 6 | should handle job not found | ⬜ TODO |
| 7 | should not cancel completed job | ⬜ TODO |
| 8 | should not cancel failed job | ⬜ TODO |
| 9 | should handle already cancelled job | ⬜ TODO |
| 10 | should cancel queued job successfully | ⬜ TODO |
| 11 | should cancel running job successfully | ⬜ TODO |
| 12 | should preserve partial results when available | ⬜ TODO |
| 13 | should preserve accumulated_content when available | ⬜ TODO |
| 14 | should handle null partial results | ⬜ TODO |
| 15 | should handle cancellation failure | ⬜ TODO |
| 16 | should handle job completion during cancellation attempt | ⬜ TODO |
| 17 | should handle job store errors | ⬜ TODO |
| 18 | should handle job runner errors | ⬜ TODO |
| 19 | should include metadata display with execution time | ⬜ TODO |
| 20 | should return proper MCP response structure | ⬜ TODO |
| 21 | should have correct tool description | ⬜ TODO |
| 22 | should have correct input schema | ⬜ TODO |

### tools/chat.export.test.js

**Describe Blocks:** Chat Tool Export Feature

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should export a new conversation when export is enabled | ⬜ TODO |
| 2 | should not export when export is disabled (default) | ⬜ TODO |
| 3 | should export continuation of existing conversation | ⬜ TODO |
| 4 | should not rewrite existing turn files (incremental export) | ⬜ TODO |
| 5 | should handle path traversal attempts in continuation_id | ⬜ TODO |
| 6 | should export conversation with files and images | ⬜ TODO |
| 7 | should handle export errors gracefully without interrupting chat | ⬜ TODO |
| 8 | should update metadata atomically with each turn | ⬜ TODO |

### tools/chat.test.js

**Describe Blocks:** Chat Tool Unit Tests > Basic Chat Functionality > Continuation Support > Context Processing > Provider Integration > Error Handling > Response Format Compliance > Edge Cases and Input Validation

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should handle basic chat request | ⬜ TODO |
| 2 | should handle chat with model specification | ⬜ TODO |
| 3 | should handle auto model selection | ⬜ TODO |
| 4 | should handle temperature parameter | ⬜ TODO |
| 5 | should create new conversation when no continuation provided | ⬜ TODO |
| 6 | should load existing conversation when continuation provided | ⬜ TODO |
| 7 | should handle invalid continuation ID gracefully | ⬜ TODO |
| 8 | should process file context when files provided | ⬜ TODO |
| 9 | should process image context when images provided | ⬜ TODO |
| 10 | should process web search context when provided | ⬜ TODO |
| 11 | should handle context processing failures gracefully | ⬜ TODO |
| 12 | should map model names to correct providers | ⬜ TODO |
| 13 | should handle provider-specific options | ⬜ TODO |
| 14 | should handle reasoning effort for O3 models | ⬜ TODO |
| 15 | should throw error for missing prompt | ⬜ TODO |
| 16 | should throw error for empty prompt | ⬜ TODO |
| 17 | should handle provider errors gracefully | ⬜ TODO |
| 18 | should handle no available providers | ⬜ TODO |
| 19 | should handle unknown model gracefully | ⬜ TODO |
| 20 | should handle continuation store errors | ⬜ TODO |
| 21 | should return MCP-compliant response format | ⬜ TODO |
| 22 | should include provider metadata in response | ⬜ TODO |
| 23 | should handle streaming responses appropriately | ⬜ TODO |
| 24 | should handle very long prompts | ⬜ TODO |
| 25 | should handle special characters in prompt | ⬜ TODO |
| 26 | should handle multiple file types | ⬜ TODO |
| 27 | should handle boundary temperature values | ⬜ TODO |

### tools/checkStatus.fixes.test.js

**Describe Blocks:** Check Status Tool - Fixes > Fix 1: Provider shows correctly for chat tool > Fix 2: Elapsed time calculates correctly > Fix 3: Human-readable status format > Integration: All fixes work together

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should show the correct provider for a chat job | ⬜ TODO |
| 2 | should show | ⬜ TODO |
| 3 | should show correct elapsed time for a running job | ⬜ TODO |
| 4 | should show minutes and seconds for long-running jobs | ⬜ TODO |
| 5 | should show sub-second time correctly | ⬜ TODO |
| 6 | should format running job status in human-readable format | ⬜ TODO |
| 7 | should format completed job with full response content | ⬜ TODO |
| 8 | should format failed job with error message | ⬜ TODO |
| 9 | should format consensus job with provider details | ⬜ TODO |
| 10 | should correctly handle a real chat job scenario | ⬜ TODO |

### tools/checkStatus.improvements.test.js

**Describe Blocks:** Check Status Tool - Improvements > Chat Tool: No Progress Percentage > Consensus Tool: x/y Progress Format > Consensus Tool: Models List Display > Streaming Preview Capability

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should not show progress percentage for chat tool | ⬜ TODO |
| 2 | should show x/y initial format during initial phase | ⬜ TODO |
| 3 | should show x/y refined format during refinement phase | ⬜ TODO |
| 4 | should show list of models instead of | ⬜ TODO |
| 5 | should show streaming preview for chat tool | ⬜ TODO |
| 6 | should show provider previews for consensus tool | ⬜ TODO |

### tools/checkStatus.test.js

**Describe Blocks:** Check Status Tool > Input Validation > Specific Job Queries > Session Job Listing > Response Formatting > Error Handling > Tool Metadata

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should validate continuation_id type | ⬜ TODO |
| 2 | should query specific job from memory store | ⬜ TODO |
| 3 | should fallback to file cache for completed jobs | ⬜ TODO |
| 4 | should return job regardless of sessionId (single-user local server) | ⬜ TODO |
| 5 | should handle job not found | ⬜ TODO |
| 6 | should list all jobs for session | ⬜ TODO |
| 7 | should return 10 most recent jobs by default | ⬜ TODO |
| 8 | should handle empty job list | ⬜ TODO |
| 9 | should always include result (output always enabled) | ⬜ TODO |
| 10 | should include provider details | ⬜ TODO |
| 11 | should handle AsyncJobStore errors gracefully | ⬜ TODO |
| 12 | should handle FileCache errors gracefully | ⬜ TODO |
| 13 | should have correct tool description | ⬜ TODO |
| 14 | should have valid input schema | ⬜ TODO |

### tools/consensus.export.test.js

**Describe Blocks:** Consensus Tool Export Feature

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should export a consensus conversation when export is enabled | ⬜ TODO |
| 2 | should not export when export is disabled (default) | ⬜ TODO |
| 3 | should export consensus with cross-feedback disabled | ⬜ TODO |
| 4 | should export consensus with multiple models and custom temperature | ⬜ TODO |

### tools/consensus.test.js

**Describe Blocks:** Consensus Tool Unit Tests > Basic Consensus Functionality > Model Resolution and Provider Mapping > Cross-Feedback Mechanism > Context Processing Integration > Error Handling and Resilience > Continuation Support > Response Format Compliance > Performance and Parallel Execution

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should handle basic consensus request with single model | ⬜ TODO |
| 2 | should handle consensus with multiple models | ⬜ TODO |
| 4 | should enable cross-feedback by default | ⬜ TODO |
| 6 | should disable cross-feedback when requested | ⬜ TODO |
| 8 | should resolve model names to correct providers | ⬜ TODO |
| 9 | should handle auto model selection | ⬜ TODO |
| 10 | should handle model-specific options | ⬜ TODO |
| 11 | should include other models responses in refinement phase | ⬜ TODO |
| 12 | should use custom cross-feedback prompt when provided | ⬜ TODO |
| 13 | should handle stance detection in refined responses | ⬜ TODO |
| 15 | should throw error for missing prompt | ⬜ TODO |
| 16 | should throw error for missing models array | ⬜ TODO |
| 17 | should throw error for empty models array | ⬜ TODO |
| 18 | should handle individual provider failures gracefully | ⬜ TODO |
| 19 | should handle all providers failing | ⬜ TODO |
| 20 | should handle unknown models gracefully | ⬜ TODO |
| 21 | should save consensus results to continuation store | ⬜ TODO |
| 22 | should load previous consensus conversation when continuation provided | ⬜ TODO |
| 23 | should return MCP-compliant response format | ⬜ TODO |
| 24 | should return valid JSON in response content | ⬜ TODO |
| 25 | should include comprehensive metadata in response | ⬜ TODO |
| 27 | should execute models in parallel | ⬜ TODO |
| 28 | should handle timeout scenarios gracefully | ⬜ TODO |

### tools/model-mapping.test.js

**Describe Blocks:** Model Mapping > mapModelToProvider logic > Integration test with actual providers > Model routing behavior verification

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should route simple model names by keyword | ⬜ TODO |
| 2 | should route slash models to OpenRouter if not in native provider | ⬜ TODO |
| 3 | should handle OpenRouter auto variations | ⬜ TODO |
| 4 | should verify the new routing logic works correctly | ⬜ TODO |
| 5 | confirms slash models route correctly based on actual provider support | ⬜ TODO |

## Unit (320 tests)

### unit/async/cache-ttl.test.js

**Describe Blocks:** Cache TTL Configuration > AsyncJobStore Memory TTL > FileCache Disk TTL > Memory to Disk Transition with TTL

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should use environment variable for memory TTL | ⬜ TODO |
| 2 | should use default TTL when environment variable not set | ⬜ TODO |
| 3 | should handle different TTL values for different instances | ⬜ TODO |
| 4 | should use environment variable for disk TTL | ⬜ TODO |
| 5 | should use default TTL when environment variable not set | ⬜ TODO |
| 6 | should handle job transition from memory to disk with different TTLs | ⬜ TODO |

### unit/config-codex.test.js

**Describe Blocks:** Codex Configuration > Default Values > Sandbox Mode Validation > Approval Policy Validation > Boolean False Preservation > Combined Configuration > Configuration Key Normalization

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should load default values when env vars not set | ⬜ TODO |
| 2 | should accept valid sandbox mode: read-only | ⬜ TODO |
| 3 | should accept valid sandbox mode: workspace-write | ⬜ TODO |
| 4 | should accept valid sandbox mode: danger-full-access | ⬜ TODO |
| 5 | should throw error for invalid sandbox mode | ⬜ TODO |
| 6 | should accept valid approval policy: never | ⬜ TODO |
| 7 | should accept valid approval policy: untrusted | ⬜ TODO |
| 8 | should accept valid approval policy: on-failure | ⬜ TODO |
| 9 | should accept valid approval policy: on-request | ⬜ TODO |
| 10 | should throw error for invalid approval policy | ⬜ TODO |
| 11 | should preserve CODEX_SKIP_GIT_CHECK=false in config | ⬜ TODO |
| 12 | should parse CODEX_SKIP_GIT_CHECK=true correctly | ⬜ TODO |
| 13 | should handle CODEX_SKIP_GIT_CHECK=0 as false | ⬜ TODO |
| 14 | should handle CODEX_SKIP_GIT_CHECK=1 as true | ⬜ TODO |
| 15 | should load all Codex config values together | ⬜ TODO |
| 16 | should normalize keys to lowercase without underscores | ⬜ TODO |

### unit/mocks/providers.test.js

**Describe Blocks:** Mock Provider Base > createMockProvider > MockResponseBuilder > CallTracker > MockProviderBehavior > Mock Provider Variants > createMockProviderWithError > createMockProviderWithStreaming > createMockProviderWithRateLimit > createMockProviderWithLatency > Provider-Specific Mocks > OpenAI Mock > Google Mock > XAI Mock > Anthropic Mock > OpenRouter Mock > Mistral Mock > DeepSeek Mock > Mock Provider Registry > Reset All Mocks

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should create a provider with default behavior | ⬜ TODO |
| 2 | should track method calls | ⬜ TODO |
| 3 | should allow behavior configuration | ⬜ TODO |
| 4 | should build a complete response | ⬜ TODO |
| 5 | should track multiple calls | ⬜ TODO |
| 6 | should get last call | ⬜ TODO |
| 7 | should reset tracking | ⬜ TODO |
| 8 | should handle delays | ⬜ TODO |
| 9 | should throw errors on specific calls | ⬜ TODO |
| 10 | should return custom responses | ⬜ TODO |
| 11 | should create provider that throws ProviderError | ⬜ TODO |
| 12 | should handle streaming responses | ⬜ TODO |
| 13 | should handle non-streaming requests | ⬜ TODO |
| 14 | should throw after limit is reached | ⬜ TODO |
| 15 | should add random latency within range | ⬜ TODO |
| 16 | should handle thinking models | ⬜ TODO |
| 17 | should handle web search | ⬜ TODO |
| 18 | should validate API key | ⬜ TODO |
| 19 | should handle thinking models | ⬜ TODO |
| 20 | should handle web search | ⬜ TODO |
| 21 | should validate image support | ⬜ TODO |
| 22 | should handle dynamic models | ⬜ TODO |
| 23 | should refresh model list | ⬜ TODO |
| 24 | should handle code generation | ⬜ TODO |
| 25 | should handle reasoning models | ⬜ TODO |
| 26 | should include all default providers | ⬜ TODO |
| 27 | should register custom providers | ⬜ TODO |
| 28 | should get available providers | ⬜ TODO |
| 29 | should reset all providers | ⬜ TODO |
| 30 | should reset multiple providers | ⬜ TODO |

### unit/providers/anthropic.test.js

**Describe Blocks:** Anthropic Provider > Configuration > Model Management > Message Invocation > Stop Reason Mapping > Error Handling > Streaming Functionality > SDK Loading

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should validate configuration with valid API key | ⬜ TODO |
| 2 | should reject configuration without API key | ⬜ TODO |
| 3 | should reject configuration with invalid API key format | ⬜ TODO |
| 4 | should check availability same as config validation | ⬜ TODO |
| 5 | should return supported models | ⬜ TODO |
| 6 | should get model config by exact name | ⬜ TODO |
| 7 | should get Claude Haiku 4.5 config with correct specifications | ⬜ TODO |
| 8 | should get model config by alias | ⬜ TODO |
| 9 | should resolve Claude Haiku 4.5 by various aliases | ⬜ TODO |
| 10 | should handle case-insensitive model names | ⬜ TODO |
| 11 | should return null for unknown model | ⬜ TODO |
| 12 | should invoke with basic messages | ⬜ TODO |
| 13 | should handle system messages | ⬜ TODO |
| 14 | should concatenate multiple system messages | ⬜ TODO |
| 15 | should handle image content | ⬜ TODO |
| 16 | should handle custom parameters | ⬜ TODO |
| 17 | should handle thinking models with reasoning_effort | ⬜ TODO |
| 18 | should handle claude-sonnet-4 with thinking enabled | ⬜ TODO |
| 19 | should not add thinking for models that do not support it | ⬜ TODO |
| 20 | should cap max tokens to model limit | ⬜ TODO |
| 21 | should handle string response content | ⬜ TODO |
| 22 | should map unknown stop reason to OTHER | ⬜ TODO |
| 23 | should handle missing API key | ⬜ TODO |
| 24 | should handle invalid API key format | ⬜ TODO |
| 25 | should validate message format | ⬜ TODO |
| 26 | should validate individual messages | ⬜ TODO |
| 27 | should validate message roles | ⬜ TODO |
| 28 | should validate message content | ⬜ TODO |
| 29 | should validate first message is from user | ⬜ TODO |
| 30 | should validate message alternation | ⬜ TODO |
| 31 | should handle no response content | ⬜ TODO |
| 32 | should handle API errors | ⬜ TODO |
| 33 | should handle invalid request errors | ⬜ TODO |
| 34 | should handle model not found errors | ⬜ TODO |
| 35 | should handle context length errors | ⬜ TODO |
| 36 | should return AsyncGenerator when stream=true | ⬜ TODO |
| 37 | should handle streaming events correctly | ⬜ TODO |
| 38 | should handle thinking deltas in streaming | ⬜ TODO |
| 39 | should fall back to non-streaming for unsupported models | ⬜ TODO |
| 40 | should handle streaming errors gracefully | ⬜ TODO |
| 41 | should handle event processing errors | ⬜ TODO |
| 42 | should handle ping events by ignoring them | ⬜ TODO |

### unit/providers/deepseek.test.js

**Describe Blocks:** DeepSeek Provider > Configuration > Model Management > Message Invocation > Stop Reason Mapping > Error Handling

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should validate configuration with valid API key | ⬜ TODO |
| 2 | should reject configuration without API key | ⬜ TODO |
| 3 | should reject configuration with invalid API key format | ⬜ TODO |
| 4 | should check availability same as config validation | ⬜ TODO |
| 5 | should return supported models | ⬜ TODO |
| 6 | should get model config by exact name | ⬜ TODO |
| 7 | should get model config by alias | ⬜ TODO |
| 8 | should handle case-insensitive model names | ⬜ TODO |
| 9 | should return null for unknown model | ⬜ TODO |
| 10 | should invoke with basic messages | ⬜ TODO |
| 11 | should handle custom parameters | ⬜ TODO |
| 12 | should cap max tokens to model limit | ⬜ TODO |
| 13 | should reject image content since DeepSeek does not support images | ⬜ TODO |
| 14 | should map unknown stop reason to OTHER | ⬜ TODO |
| 15 | should handle missing API key | ⬜ TODO |
| 16 | should handle API errors | ⬜ TODO |
| 17 | should handle model not found errors | ⬜ TODO |
| 18 | should handle context length errors | ⬜ TODO |
| 19 | should handle no response choice | ⬜ TODO |
| 20 | should handle no response content | ⬜ TODO |

### unit/providers/google.test.js

**Describe Blocks:** Google Provider > validateConfig > isAvailable > getSupportedModels > getModelConfig > invoke - input validation > message format conversion > thinking mode support > temperature handling > default model selection > context window sizes > streaming support

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should return true for valid Google API key | ⬜ TODO |
| 2 | should return false for missing API key | ⬜ TODO |
| 3 | should return false for short API key | ⬜ TODO |
| 4 | should return true for minimum length API key | ⬜ TODO |
| 5 | should return true when config is valid | ⬜ TODO |
| 6 | should return false when config is invalid | ⬜ TODO |
| 7 | should return supported models object | ⬜ TODO |
| 8 | should include model configuration details | ⬜ TODO |
| 9 | should have correct thinking support configuration | ⬜ TODO |
| 10 | should have correct image support configuration | ⬜ TODO |
| 11 | should include Gemini 3.0 model with correct configuration | ⬜ TODO |
| 12 | should return config for exact model name | ⬜ TODO |
| 13 | should return config for model alias | ⬜ TODO |
| 14 | should return config for various aliases | ⬜ TODO |
| 15 | should return config for default aliases (now pointing to Gemini 3.0) | ⬜ TODO |
| 16 | should return config for Gemini 3.0 specific aliases | ⬜ TODO |
| 17 | should still return config for explicit Gemini 2.5 Pro aliases | ⬜ TODO |
| 18 | should return null for unknown model | ⬜ TODO |
| 19 | should be case insensitive | ⬜ TODO |
| 20 | should throw error for missing API key | ⬜ TODO |
| 21 | should throw error for invalid API key format | ⬜ TODO |
| 22 | should throw error for non-array messages | ⬜ TODO |
| 23 | should throw error for invalid message role | ⬜ TODO |
| 24 | should throw error for missing message content | ⬜ TODO |
| 25 | should handle system prompts correctly | ⬜ TODO |
| 26 | should handle conversation history | ⬜ TODO |
| 27 | should support thinking for appropriate models | ⬜ TODO |
| 28 | should have correct thinking token limits | ⬜ TODO |
| 29 | should support temperature for all models | ⬜ TODO |
| 30 | should default to gemini-2.5-flash | ⬜ TODO |
| 31 | should support flash as default alias | ⬜ TODO |
| 32 | should have 1M context for all models | ⬜ TODO |
| 33 | should have consistent output token limits | ⬜ TODO |
| 34 | should support streaming for all models | ⬜ TODO |
| 35 | should have _createStreamingGenerator method | ⬜ TODO |
| 36 | should handle stream parameter in invoke method | ⬜ TODO |
| 37 | should fallback to non-streaming for models that do not support it | ⬜ TODO |
| 38 | should handle thinking mode in streaming | ⬜ TODO |
| 39 | should handle web search grounding in streaming | ⬜ TODO |

### unit/providers/mistral.test.js

**Describe Blocks:** Mistral Provider > Configuration > Model Management > Message Invocation > Stop Reason Mapping > Error Handling

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should validate configuration with valid API key | ⬜ TODO |
| 2 | should reject configuration without API key | ⬜ TODO |
| 3 | should reject configuration with invalid API key format | ⬜ TODO |
| 4 | should check availability same as config validation | ⬜ TODO |
| 5 | should return supported models | ⬜ TODO |
| 6 | should get model config by exact name | ⬜ TODO |
| 7 | should get model config by alias | ⬜ TODO |
| 8 | should handle case-insensitive model names | ⬜ TODO |
| 9 | should return null for unknown model | ⬜ TODO |
| 10 | should invoke with basic messages | ⬜ TODO |
| 11 | should handle image content | ⬜ TODO |
| 12 | should handle custom parameters | ⬜ TODO |
| 13 | should cap max tokens to model limit | ⬜ TODO |
| 14 | should map unknown stop reason to OTHER | ⬜ TODO |
| 15 | should handle missing API key | ⬜ TODO |
| 16 | should validate message format | ⬜ TODO |
| 17 | should validate individual messages | ⬜ TODO |
| 18 | should validate message roles | ⬜ TODO |
| 19 | should validate message content | ⬜ TODO |
| 20 | should handle no response choice | ⬜ TODO |
| 21 | should handle no response content | ⬜ TODO |
| 22 | should handle API errors | ⬜ TODO |
| 23 | should handle invalid request errors | ⬜ TODO |
| 24 | should handle model not found errors | ⬜ TODO |
| 25 | should handle context length errors | ⬜ TODO |

### unit/providers/openai-compatible.test.js

**Describe Blocks:** OpenAI-Compatible Provider Base Module > Provider Creation > Configuration Validation > Model Management > Message Invocation > Stop Reason Mapping > Error Handling > Retry Helper

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should create provider with required methods | ⬜ TODO |
| 2 | should accept custom headers in configuration | ⬜ TODO |
| 3 | should accept custom validation function | ⬜ TODO |
| 4 | should validate configuration with API key | ⬜ TODO |
| 5 | should reject configuration without API key | ⬜ TODO |
| 6 | should reject configuration with empty API key | ⬜ TODO |
| 7 | should use default API key if provider-specific key not found | ⬜ TODO |
| 8 | should check availability same as config validation | ⬜ TODO |
| 9 | should return supported models | ⬜ TODO |
| 10 | should get model config by exact name | ⬜ TODO |
| 11 | should get model config by alias | ⬜ TODO |
| 12 | should handle case-insensitive model names | ⬜ TODO |
| 13 | should return null for unknown model | ⬜ TODO |
| 14 | should invoke with basic messages | ⬜ TODO |
| 15 | should handle custom parameters | ⬜ TODO |
| 16 | should handle image content | ⬜ TODO |
| 17 | should apply default parameters | ⬜ TODO |
| 18 | should apply request transformation | ⬜ TODO |
| 19 | should apply response transformation | ⬜ TODO |
| 20 | should respect model timeout configuration | ⬜ TODO |
| 21 | should handle models without temperature support | ⬜ TODO |
| 22 | should cap max tokens to model limit | ⬜ TODO |
| 23 | should handle missing API key | ⬜ TODO |
| 24 | should handle invalid API key error | ⬜ TODO |
| 25 | should handle quota exceeded error | ⬜ TODO |
| 26 | should handle rate limit error | ⬜ TODO |
| 27 | should handle model not found error | ⬜ TODO |
| 28 | should handle context length error | ⬜ TODO |
| 29 | should handle timeout error | ⬜ TODO |
| 30 | should handle network error | ⬜ TODO |
| 31 | should handle no response choice | ⬜ TODO |
| 32 | should handle no response content | ⬜ TODO |
| 33 | should validate message format | ⬜ TODO |
| 34 | should validate individual messages | ⬜ TODO |
| 35 | should validate message roles | ⬜ TODO |
| 36 | should validate message content | ⬜ TODO |
| 37 | should retry on rate limit errors | ⬜ TODO |
| 38 | should retry on timeout errors | ⬜ TODO |
| 39 | should not retry on non-retryable errors | ⬜ TODO |
| 40 | should throw last error after max retries | ⬜ TODO |
| 41 | should use exponential backoff | ⬜ TODO |

### unit/providers/openai.test.js

**Describe Blocks:** OpenAI Provider > validateConfig > isAvailable > getSupportedModels > getModelConfig > invoke - input validation > temperature handling > model resolution > invoke with mocked SDK > streaming functionality

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should return true for valid OpenAI API key | ⬜ TODO |
| 2 | should return false for missing API key | ⬜ TODO |
| 3 | should return false for invalid API key format | ⬜ TODO |
| 4 | should return false for short API key | ⬜ TODO |
| 5 | should return true when config is valid | ⬜ TODO |
| 6 | should return false when config is invalid | ⬜ TODO |
| 7 | should return supported models object | ⬜ TODO |
| 8 | should include model configuration details | ⬜ TODO |
| 9 | should include GPT-5 Pro configuration with correct properties | ⬜ TODO |
| 10 | should return config for exact model name | ⬜ TODO |
| 11 | should return config for model alias | ⬜ TODO |
| 12 | should return null for unknown model | ⬜ TODO |
| 13 | should be case insensitive | ⬜ TODO |
| 14 | should return config for GPT-5 Pro aliases | ⬜ TODO |
| 15 | should throw error for missing API key | ⬜ TODO |
| 16 | should throw error for invalid API key format | ⬜ TODO |
| 17 | should throw error for non-array messages | ⬜ TODO |
| 18 | should throw error for invalid message role | ⬜ TODO |
| 19 | should throw error for missing message content | ⬜ TODO |
| 20 | should clamp temperature to valid range | ⬜ TODO |
| 21 | should handle model aliases correctly | ⬜ TODO |
| 22 | should successfully call OpenAI API and return unified response | ⬜ TODO |
| 23 | should handle reasoning effort for O3 models | ⬜ TODO |
| 24 | should handle temperature based on model support | ⬜ TODO |
| 25 | should handle OpenAI API errors gracefully | ⬜ TODO |
| 26 | should return AsyncGenerator when stream=true | ⬜ TODO |
| 27 | should handle Responses API streaming format | ⬜ TODO |
| 28 | should handle streaming errors gracefully | ⬜ TODO |
| 29 | should fall back to non-streaming for unsupported models | ⬜ TODO |
| 30 | should include usage reporting for Chat Completions API streaming | ⬜ TODO |

### unit/providers/openrouter-endpoints-client.test.js

**Describe Blocks:** OpenRouter Endpoints API Client > parseModelId > fetchModelEndpoints > Cache functionality

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should parse valid model IDs | ⬜ TODO |
| 2 | should return null for invalid model IDs | ⬜ TODO |
| 3 | should convert endpoint data to model config | ⬜ TODO |
| 4 | should handle 404 responses | ⬜ TODO |
| 5 | should handle network errors | ⬜ TODO |
| 6 | should handle invalid response structure | ⬜ TODO |
| 7 | should prefer certain providers | ⬜ TODO |
| 8 | should cache successful responses | ⬜ TODO |
| 9 | should cache failed requests with shorter TTL | ⬜ TODO |
| 10 | should provide cache management methods | ⬜ TODO |
| 11 | should expire cache entries | ⬜ TODO |

### unit/providers/openrouter.test.js

**Describe Blocks:** OpenRouter Provider > Configuration > Model Management > Message Invocation > Stop Reason Mapping > Error Handling

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should validate configuration with valid API key | ⬜ TODO |
| 2 | should reject configuration without API key | ⬜ TODO |
| 3 | should reject configuration with invalid API key format | ⬜ TODO |
| 4 | should check availability same as config validation | ⬜ TODO |
| 5 | should return supported models | ⬜ TODO |
| 6 | should get model config by exact name | ⬜ TODO |
| 7 | should get model config by alias | ⬜ TODO |
| 8 | should handle case-insensitive model names | ⬜ TODO |
| 9 | should return null for unknown model | ⬜ TODO |
| 10 | should get config for openrouter/auto model | ⬜ TODO |
| 11 | should support openrouter auto aliases | ⬜ TODO |
| 12 | should return dynamic config when dynamic models enabled | ⬜ TODO |
| 13 | should not return dynamic config when disabled | ⬜ TODO |
| 14 | should fetch model config from API when invoking with dynamic model | ⬜ TODO |
| 15 | should handle API fetch errors gracefully | ⬜ TODO |
| 16 | should invoke with basic messages | ⬜ TODO |
| 17 | should reject invocation without referer header | ⬜ TODO |
| 18 | should handle custom parameters | ⬜ TODO |
| 19 | should include optional title header when provided | ⬜ TODO |
| 20 | should cap max tokens to model limit | ⬜ TODO |
| 21 | should handle models that do not support images | ⬜ TODO |
| 22 | should map unknown stop reason to OTHER | ⬜ TODO |
| 23 | should handle missing API key | ⬜ TODO |
| 24 | should handle API errors | ⬜ TODO |
| 25 | should handle model not found errors | ⬜ TODO |
| 26 | should handle context length errors | ⬜ TODO |
| 27 | should handle no response choice | ⬜ TODO |
| 28 | should handle no response content | ⬜ TODO |

### unit/providers/xai.test.js

**Describe Blocks:** XAI Provider > validateConfig > isAvailable > getSupportedModels > getModelConfig > invoke - input validation > model resolution > temperature handling > base URL configuration > streaming functionality

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should return true for valid XAI API key | ⬜ TODO |
| 2 | should return false for missing API key | ⬜ TODO |
| 3 | should return false for invalid API key format | ⬜ TODO |
| 4 | should return false for short API key | ⬜ TODO |
| 5 | should return false for OpenAI format key | ⬜ TODO |
| 6 | should return true when config is valid | ⬜ TODO |
| 7 | should return false when config is invalid | ⬜ TODO |
| 8 | should return supported models object | ⬜ TODO |
| 9 | should include model configuration details | ⬜ TODO |
| 10 | should have correct image support configuration | ⬜ TODO |
| 11 | should return config for exact model name | ⬜ TODO |
| 12 | should return config for model alias | ⬜ TODO |
| 13 | should return config for various aliases | ⬜ TODO |
| 14 | should return null for unknown model | ⬜ TODO |
| 15 | should be case insensitive | ⬜ TODO |
| 16 | should throw error for missing API key | ⬜ TODO |
| 17 | should throw error for invalid API key format | ⬜ TODO |
| 18 | should throw error for OpenAI format key | ⬜ TODO |
| 19 | should throw error for non-array messages | ⬜ TODO |
| 20 | should throw error for invalid message role | ⬜ TODO |
| 21 | should throw error for missing message content | ⬜ TODO |
| 22 | should handle model aliases correctly | ⬜ TODO |
| 23 | should default to grok-4-0709 model | ⬜ TODO |
| 24 | should support temperature for all models | ⬜ TODO |
| 25 | should use default XAI base URL when not configured | ⬜ TODO |
| 26 | should use custom base URL when configured | ⬜ TODO |
| 27 | should return AsyncGenerator when stream=true | ⬜ TODO |
| 28 | should handle streaming with live search | ⬜ TODO |
| 29 | should handle streaming errors gracefully | ⬜ TODO |
| 30 | should work with unknown models using streaming | ⬜ TODO |
| 31 | should include usage reporting for streaming mode | ⬜ TODO |
| 32 | should handle all Grok models with streaming | ⬜ TODO |

## Utils (188 tests)

### utils/contextProcessor.test.js

**Describe Blocks:** Context Processor Unit Tests > Relative Path Handling > Unified Context Processing > Error Handling with Relative Paths > Security Validation with Relative Paths > File Context Creation with Mixed Paths > Line Range Processing > createFileContext with Line Ranges

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should convert relative paths to absolute paths for text files | ⬜ TODO |
| 2 | should convert relative paths to absolute paths for images | ⬜ TODO |
| 3 | should handle nested relative paths | ⬜ TODO |
| 4 | should handle current directory relative paths | ⬜ TODO |
| 5 | should process multiple files with mixed relative and absolute paths | ⬜ TODO |
| 6 | should process images with relative paths in unified context | ⬜ TODO |
| 7 | should handle mixed files and images with relative paths | ⬜ TODO |
| 8 | should handle non-existent relative path files | ⬜ TODO |
| 9 | should preserve original relative path in error messages | ⬜ TODO |
| 10 | should validate relative paths against allowed directories | ⬜ TODO |
| 11 | should reject relative paths outside allowed directories when security is enforced | ⬜ TODO |
| 12 | should allow any paths when security check is disabled (default) | ⬜ TODO |
| 13 | should create context message preserving original paths | ⬜ TODO |
| 14 | should extract lines with full range {start:end} | ⬜ TODO |
| 15 | should extract lines from start to specified end {:end} | ⬜ TODO |
| 16 | should extract lines from specified start to end of file {start:} | ⬜ TODO |
| 17 | should clamp end to actual file bounds when range exceeds file length | ⬜ TODO |
| 18 | should return empty content when start > file length | ⬜ TODO |
| 19 | should treat start=0 as start=1 | ⬜ TODO |
| 20 | should return error for empty range {:} | ⬜ TODO |
| 21 | should return error when start > end | ⬜ TODO |
| 22 | should process file normally without range specifier | ⬜ TODO |
| 23 | should handle relative paths with ranges | ⬜ TODO |
| 24 | should handle single line extraction {n:n} | ⬜ TODO |
| 25 | should handle files with Windows-style line endings (CRLF) | ⬜ TODO |
| 26 | should treat invalid range syntax as part of filename | ⬜ TODO |
| 27 | should include range info in file header when range was applied | ⬜ TODO |
| 28 | should not include range info for full file reads | ⬜ TODO |

### utils/conversationExporter.test.js

**Describe Blocks:** Conversation Exporter > Basic Export > Complex Content Handling > Incremental Export > Metadata Generation > Edge Cases > Cross-platform Support

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should export a simple conversation | ⬜ TODO |
| 2 | should skip system messages in turn numbering | ⬜ TODO |
| 3 | should handle complex content with files and images | ⬜ TODO |
| 4 | should handle base64 images appropriately | ⬜ TODO |
| 5 | should not overwrite existing turn files | ⬜ TODO |
| 6 | should generate complete metadata | ⬜ TODO |
| 7 | should update metadata atomically | ⬜ TODO |
| 8 | should handle incomplete turn pairs | ⬜ TODO |
| 9 | should sanitize continuation_id for folder names | ⬜ TODO |
| 10 | should handle empty conversations gracefully | ⬜ TODO |
| 11 | should handle missing continuation_id | ⬜ TODO |
| 12 | should handle file system errors gracefully | ⬜ TODO |
| 13 | should handle Windows-style paths | ⬜ TODO |
| 14 | should resolve relative paths correctly | ⬜ TODO |

### utils/fileValidator.test.js

**Describe Blocks:** File Validator Unit Tests > validateFilePaths > validateAllPaths > File Validator Integration Tests

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should return valid for empty file paths | ⬜ TODO |
| 2 | should return valid for null/undefined input | ⬜ TODO |
| 3 | should validate single existing file | ⬜ TODO |
| 4 | should validate multiple existing files | ⬜ TODO |
| 5 | should handle absolute paths correctly | ⬜ TODO |
| 6 | should report single missing file | ⬜ TODO |
| 7 | should report multiple missing files | ⬜ TODO |
| 8 | should handle mixed existing and missing files | ⬜ TODO |
| 9 | should handle invalid path types | ⬜ TODO |
| 10 | should use custom file type in error message | ⬜ TODO |
| 11 | should return valid for empty input | ⬜ TODO |
| 12 | should validate only files when no images provided | ⬜ TODO |
| 13 | should validate only images when no files provided | ⬜ TODO |
| 14 | should validate both files and images | ⬜ TODO |
| 15 | should report missing files separately from images | ⬜ TODO |
| 16 | should report both missing files and images | ⬜ TODO |
| 17 | should handle mixed paths correctly | ⬜ TODO |
| 18 | should work with chat tool error format | ⬜ TODO |

### utils/HTTPMCPServerManager.test.js

**Describe Blocks:** HTTPMCPServerManager > Server Lifecycle > Client Connection > Tool Operations > HTTP Endpoints > Session Management > Health and Status > Error Handling > Utility Functions > Configuration Options

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should start and stop server successfully | ⬜ TODO |
| 2 | should not allow starting already started server | ⬜ TODO |
| 3 | should handle stopping non-started server gracefully | ⬜ TODO |
| 4 | should timeout if startup takes too long | ⬜ TODO |
| 5 | should provide working MCP client | ⬜ TODO |
| 6 | should throw error when getting client before start | ⬜ TODO |
| 7 | should list tools successfully | ⬜ TODO |
| 8 | should execute tool calls successfully | ⬜ TODO |
| 9 | should handle tool call timeout | ⬜ TODO |
| 10 | should handle invalid tool calls | ⬜ TODO |
| 11 | should provide health endpoint | ⬜ TODO |
| 12 | should provide info endpoint | ⬜ TODO |
| 13 | should handle HTTP endpoint errors gracefully | ⬜ TODO |
| 14 | should create session for isolation | ⬜ TODO |
| 15 | should handle concurrent operations | ⬜ TODO |
| 16 | should provide health status when stopped | ⬜ TODO |
| 17 | should provide health status when running | ⬜ TODO |
| 18 | should perform basic functionality test | ⬜ TODO |
| 19 | should handle port conflicts gracefully | ⬜ TODO |
| 20 | should cleanup resources on error | ⬜ TODO |
| 21 | createHTTPTestServer should work | ⬜ TODO |
| 22 | withHTTPTestServer should manage lifecycle | ⬜ TODO |
| 23 | should respect custom host and port | ⬜ TODO |
| 24 | should respect environment variables | ⬜ TODO |

### utils/HTTPMCPTestClient.test.js

**Describe Blocks:** HTTPMCPTestClient > Client Lifecycle > Tool Operations > Health Check > HTTP Endpoints Testing > Concurrent Operations > Debug and Monitoring > Retry Logic > Utility Functions > Error Handling > Configuration

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should start and stop client successfully | ⬜ TODO |
| 2 | should not allow starting already started client | ⬜ TODO |
| 3 | should handle stopping non-started client gracefully | ⬜ TODO |
| 4 | should list tools successfully | ⬜ TODO |
| 5 | should call tools with simplified interface | ⬜ TODO |
| 6 | should use chat helper method | ⬜ TODO |
| 7 | should use consensus helper method | ⬜ TODO |
| 8 | should handle tool errors gracefully | ⬜ TODO |
| 9 | should enforce ready state | ⬜ TODO |
| 10 | should perform comprehensive health check | ⬜ TODO |
| 11 | should handle unhealthy state | ⬜ TODO |
| 12 | should test HTTP endpoints directly | ⬜ TODO |
| 13 | should execute operations concurrently | ⬜ TODO |
| 14 | should test session isolation | ⬜ TODO |
| 15 | should provide debug information | ⬜ TODO |
| 16 | should track operation count | ⬜ TODO |
| 17 | should retry failed operations | ⬜ TODO |
| 18 | should not retry non-retryable errors | ⬜ TODO |
| 19 | createHTTPTestClient should work | ⬜ TODO |
| 20 | withHTTPTestClient should manage lifecycle | ⬜ TODO |
| 21 | createMultipleHTTPTestClients should work | ⬜ TODO |
| 22 | testHTTPConcurrency should work | ⬜ TODO |
| 23 | should handle startup failures gracefully | ⬜ TODO |
| 24 | should handle network errors | ⬜ TODO |
| 25 | should respect custom configuration | ⬜ TODO |

### utils/MCPServerManager.test.js

**Describe Blocks:** MCPServerManager > Constructor and Configuration > Server Lifecycle > Tool Operations > Error Handling > Debugging and Monitoring > Utility Functions > Concurrent Operations

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should create manager with default options | ⬜ TODO |
| 2 | should merge custom options with defaults | ⬜ TODO |
| 3 | should have correct initial state | ⬜ TODO |
| 4 | should start and stop server successfully | ⬜ TODO |
| 5 | should throw error when starting already started server | ⬜ TODO |
| 6 | should handle multiple stop calls gracefully | ⬜ TODO |
| 7 | should throw error when getting client from stopped server | ⬜ TODO |
| 8 | should list available tools | ⬜ TODO |
| 9 | should execute tool calls successfully | ⬜ TODO |
| 10 | should handle tool call timeouts | ⬜ TODO |
| 11 | should handle invalid tool calls | ⬜ TODO |
| 12 | should handle server startup failures gracefully | ⬜ TODO |
| 13 | should throw error when executing tools on stopped server | ⬜ TODO |
| 14 | should throw error when listing tools on stopped server | ⬜ TODO |
| 15 | should capture stderr output | ⬜ TODO |
| 16 | should provide health status | ⬜ TODO |
| 17 | should create test server with factory function | ⬜ TODO |
| 18 | should run test with server lifecycle management | ⬜ TODO |
| 19 | should cleanup server even if test function throws | ⬜ TODO |
| 20 | should handle multiple tool calls concurrently | ⬜ TODO |

### utils/MCPTestClient.test.js

**Describe Blocks:** MCPTestClient > Constructor and Configuration > Client Lifecycle > Tool Operations > Health Check > Concurrent Operations > Retry Logic > Debugging and Monitoring > Utility Functions > Multiple Clients

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should create client with default options | ⬜ TODO |
| 2 | should merge custom options with defaults | ⬜ TODO |
| 3 | should have correct initial state | ⬜ TODO |
| 4 | should start and stop client successfully | ⬜ TODO |
| 5 | should throw error when starting already started client | ⬜ TODO |
| 6 | should handle multiple stop calls gracefully | ⬜ TODO |
| 7 | should throw error when calling operations on stopped client | ⬜ TODO |
| 8 | should list available tools | ⬜ TODO |
| 9 | should call tools using generic callTool method | ⬜ TODO |
| 10 | should call chat tool using simplified interface | ⬜ TODO |
| 11 | should call consensus tool using simplified interface | ⬜ TODO |
| 12 | should handle tool call timeouts | ⬜ TODO |
| 13 | should handle invalid tool calls | ⬜ TODO |
| 14 | should perform health check successfully | ⬜ TODO |
| 15 | should execute concurrent operations successfully | ⬜ TODO |
| 16 | should handle failed operations in concurrent execution | ⬜ TODO |
| 17 | should not retry non-retryable errors | ⬜ TODO |
| 18 | should provide debug information | ⬜ TODO |
| 19 | should track operation count | ⬜ TODO |
| 20 | should track uptime | ⬜ TODO |
| 21 | should create test client with factory function | ⬜ TODO |
| 22 | should run test with automatic client lifecycle | ⬜ TODO |
| 23 | should cleanup client even if test function throws | ⬜ TODO |
| 24 | should create multiple test clients | ⬜ TODO |

### utils/pathParser.test.js

**Describe Blocks:** Path Parser > parseFilePathWithRange > extractLineRange > validateRange

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should return original path when no range specifier | ⬜ TODO |
| 2 | should parse full range specifier {start:end} | ⬜ TODO |
| 3 | should parse range with start only {start:} | ⬜ TODO |
| 4 | should parse range with end only {:end} | ⬜ TODO |
| 5 | should detect empty range {:} as isEmpty | ⬜ TODO |
| 6 | should treat 0 as 1 for start line | ⬜ TODO |
| 7 | should handle relative paths with ranges | ⬜ TODO |
| 8 | should handle absolute Windows paths with ranges | ⬜ TODO |
| 9 | should handle paths with nested directories | ⬜ TODO |
| 10 | should treat invalid syntax as part of filename (letters in range) | ⬜ TODO |
| 11 | should treat negative numbers as part of filename | ⬜ TODO |
| 12 | should treat braces not at end as part of filename | ⬜ TODO |
| 13 | should handle empty string input | ⬜ TODO |
| 14 | should handle null input | ⬜ TODO |
| 15 | should handle undefined input | ⬜ TODO |
| 16 | should handle files that look like they have ranges but with spaces | ⬜ TODO |
| 17 | should handle single line range {n:n} | ⬜ TODO |
| 18 | should extract lines with full range | ⬜ TODO |
| 19 | should extract from start to specified end | ⬜ TODO |
| 20 | should extract from specified start to end of file | ⬜ TODO |
| 21 | should clamp end to actual file bounds | ⬜ TODO |
| 22 | should return empty when start > file length | ⬜ TODO |
| 23 | should treat start < 1 as 1 | ⬜ TODO |
| 24 | should return all lines when range is null | ⬜ TODO |
| 25 | should handle empty lines array | ⬜ TODO |
| 26 | should handle single line extraction | ⬜ TODO |
| 27 | should handle null lines array | ⬜ TODO |
| 28 | should return valid for null range | ⬜ TODO |
| 29 | should return valid for normal range | ⬜ TODO |
| 30 | should return invalid for empty range | ⬜ TODO |
| 31 | should return invalid when start > end | ⬜ TODO |
| 32 | should return valid when start = end | ⬜ TODO |
| 33 | should return valid for start-only range | ⬜ TODO |
| 34 | should return valid for end-only range | ⬜ TODO |

### utils/test-skip-messages.test.js

**Describe Blocks:** Skip Message Demonstration Tests

| # | Test Name | Status |
|---|-----------|--------|
| 1 | should always run regardless of API keys | ⬜ TODO |

