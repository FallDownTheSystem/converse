# Changelog

All notable changes to the Converse MCP Server project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.14.1] - 2025-09-02

### Added
- **XAI Model Support**: Added support for `grok-code-fast-1` model
  - 256K context window, optimized for agentic coding tasks
  - Economical pricing ($0.20 input / $1.50 output per 1M tokens) 
  - Full streaming support and OpenAI-compatible features
  - Includes aliases: `grok-code-fast`, `grok-code-fast-1-0825`

## [1.14.0] - 2025-08-26

### Added
- **AI-Powered Summarization**: Intelligent title generation and content summarization for async operations
  - Automatic title generation (up to 60 chars) from user prompts at request initiation  
  - Status check returns an up-to-date summary of the progress based on the partially streamed response
  - Final summaries (1-2 sentences) generated for completed responses
  - Smart summaries in check_status tool for better context understanding
  - Configurable via `ENABLE_RESPONSE_SUMMARIZATION` and `SUMMARIZATION_MODEL` (default: gpt-5-nano) environment variables

- **Enhanced Async Job Storage**: Improved job state tracking with new fields
  - `accumulated_content`: Full streaming content instead of limited preview
  - `title`: AI-generated descriptive title for each job
  - `final_summary`: Concise summary of completed job results
  - Removed `streaming_preview` field (now generated on-demand from accumulated content)

- **SummarizationService**: New centralized service for all summarization operations
  - Uses fast models (gpt-5-nano, gemini-2.5-flash) for minimal latency
  - Graceful fallback to text snippets when disabled or on errors
  - Non-blocking implementation ensures main flow continues even if summarization fails
  - Temperature set to 0.3 for consistent, focused summaries

- **FileCache Integration**: Persistent storage for async job results  
  - Wire up FileCache to persist job state across server restarts
  - Comprehensive integration tests for cache recovery and TTL management
  - Improved memory management with proper cleanup

### Changed
- **Check Status Tool**: Enhanced display with AI-generated summaries
  - Running jobs show AI-generated summaries based on accumulated content when checked
  - Job listings include titles for quick identification
  - Completed jobs display final summaries in listings
  - Async formatting functions for on-demand summary generation

- **Chat Tool Integration**: Title and summary generation during streaming
  - Generates title from user prompt at request start
  - Accumulates full content during streaming (replacing 200-char preview)
  - Creates final summary for responses over 100 characters

- **Consensus Tool Integration**: Multi-provider summary aggregation  
  - Combined content accumulation from all providers
  - Handles both single-phase and two-phase (cross-feedback) flows
  - Provider-specific previews maintained alongside combined summaries

### Technical
- New `formatStatus.js` utility for async status formatting
- Configuration schema extended with summarization settings
- Updated AsyncJobStore to accept arbitrary job fields
- Comprehensive test coverage for summarization features
- Fixed integration tests for async workflow scenarios

## [1.13.0] - 2025-01-20

### Added
- **Async Execution Support**: Run chat and consensus tools in background mode
  - Use `async: true` parameter for non-blocking execution
  - Monitor progress with check_status tool
  - Cancel running jobs with cancel_job tool
  - Persistent conversation state across async operations

- **Job Management System**: Complete async job lifecycle management
  - AsyncJobStore with LRU cache for memory management
  - EventBus for real-time progress updates
  - JobRunner for concurrent task execution
  - Automatic cleanup of completed jobs

- **Progress Tracking**: Real-time status updates for async operations
  - Streaming progress for individual providers
  - Combined progress for consensus operations
  - Detailed error reporting and recovery

## [1.12.0] - 2025-01-19

### Added
- **Execution Time Display**: Added smart execution time formatting to tool responses
  - Shows time in seconds with appropriate precision (0.05s, 1.2s, 15.3s, 1m6s)
  - Displays in metadata header for both chat and consensus tools
  - Time measurement accounts for actual LLM response durations

- **Enhanced Metadata Display**: New comprehensive metadata shown at start of responses
  - **Chat**: `[⏱️ 2.3s | 🤖 openai | 📱 gpt-5 | 🔗 conv_abc123]`
  - **Consensus**: `[⏱️ 8.7s | ✅ 2/3 models | 🔗 conv_xyz789]`
  - Environment-aware (automatically disabled in test environments)

- **Detailed Failure Reporting**: Specific model failure information for consensus tool
  - Shows which models failed and in which phase (initial vs refinement)
  - Example: "• gemini-2.5-pro (refinement failed)" and "• grok-4 (initial failed)"
  - Helps users understand exactly what went wrong during consensus gathering

### Changed
- **BREAKING: Shorter Continuation IDs**: Switched from UUID to nanoid format
  - **Before**: `conv_f47ac10b-58cc-4372-a567-0e02b2c3d479` (41 characters)
  - **After**: `conv_nTC5QoA-ml` (15 characters) - **63% shorter**
  - Uses cryptographically secure nanoid with URL-safe alphabet
  - **Backward Compatible**: Old UUID format still accepted and validated
  - Zero collision risk tested with 100,000+ generated IDs

- **Improved Consensus Success Counting**: More accurate model success tracking
  - When cross-feedback enabled: counts only models succeeding in both phases
  - When cross-feedback disabled: counts initial phase successes
  - Properly accounts for refinement phase failures

### Technical
- Migrated from Node.js `crypto.randomUUID()` to `nanoid` for ID generation
- Enhanced validation regex to accept both UUID and nanoid formats
- Updated all test patterns to match new continuation ID format
- Added comprehensive failure detail collection and formatting

## [1.11.2] - 2025-01-19

### Fixed
- **Relative Path Support**: Fixed relative path handling in chat and consensus tools
  - File validation now uses the same working directory as context processing
  - Relative paths like `"./file.txt"` and `"file.txt"` now work correctly
  - Both tools now consistently use auto-detected client working directory for path resolution
  - Fixed issue where file validation would fail but context processing would succeed with relative paths

## [1.11.1] - 2025-01-19

### Fixed
- **File Extension Support**: Removed arbitrary file type restrictions
  - All file types now supported for text processing (previously limited to specific extensions)
  - Fixed .cshtml, .razor, .php, .jsp and other web development files being blocked
  - Only images (.jpg, .png, etc.) are treated specially (base64 encoded)
  - Removed unused `getSupportedExtensions()` and `isFileTypeSupported()` functions

## [1.11.0] - 2025-01-15

### Added
- **Automatic Client Working Directory Detection**: The server now automatically detects where it was invoked from
  - Uses `INIT_CWD`, `PWD`, or `npm_config_local_prefix` environment variables
  - Enables proper relative path resolution from the client's directory
  - Works seamlessly with npx and npm execution

### Changed
- **File Access Security**: Made file path security restrictions optional (disabled by default)
  - Removed mandatory directory restrictions that prevented access to files outside the server directory
  - Security checks can be re-enabled with `enforceSecurityCheck: true` option
  - Files can now be accessed from any location on the system
- **Relative Path Resolution**: Fixed to resolve from client's working directory instead of server's directory
  - Relative paths like `./file.txt` now work correctly from where the command was invoked
  - Both absolute and relative paths are fully supported

### Fixed
- Fixed file access issues where both absolute and relative paths were incorrectly rejected
- Fixed "File access denied" errors when trying to access files outside the Converse directory

### Changed (Previous)
- **BREAKING CHANGE: Consensus Tool Models Parameter**: Simplified model specification from object array to string array
  - Old format: `[{"model": "gpt-5"}, {"model": "gemini-2.5-pro"}]`
  - New format: `["gpt-5", "gemini-2.5-pro"]`
  - Affects all consensus tool calls in client code
  - Input schema updated to accept `items: { type: "string" }` instead of object structure
  - All tests, documentation, and examples updated to reflect new format

### Migration Guide
- Update all consensus tool calls to use string arrays:
  ```javascript
  // Before
  models: [{ model: "gpt-5" }, { model: "gemini-2.5-pro" }]
  
  // After
  models: ["gpt-5", "gemini-2.5-pro"]
  ```

## [1.10.1] - 2025-08-09

### Changed
- **Consensus Tool Auto Model Selection**: Enhanced `"auto"` model behavior for consensus tool
  - Now expands to first 3 available providers instead of just one
  - Provider priority order: OpenAI → Google → XAI → Anthropic → Mistral → DeepSeek → OpenRouter
  - Automatically selects providers based on configured API keys
  - Enables multi-model consensus without manual model specification
- **Default Model Updates**: Changed OpenAI default model from `o3` to `gpt-5` for both chat and consensus tools
- **Documentation**: Updated README with comprehensive auto model selection behavior for both tools

### Technical Details
- Consensus tool with `["auto"]` intelligently expands to multiple providers
- Chat tool continues to use single provider selection for efficiency
- Each provider uses its optimal default model when selected via auto

## [1.10.0] - 2025-08-08

### Added
- **Google Provider**: Added comprehensive Google API configuration options
  - **GEMINI_API_KEY support**: Primary API key for Google Gemini models (recommended)
  - **GOOGLE_API_KEY fallback**: Still supported, but GEMINI_API_KEY takes priority
  - **Google Vertex AI support**: Full enterprise-grade Vertex AI integration
    - `GOOGLE_GENAI_USE_VERTEXAI`: Enable Vertex AI mode
    - `GOOGLE_CLOUD_PROJECT`: Google Cloud project ID
    - `GOOGLE_CLOUD_LOCATION`: Deployment region (e.g., us-central1)
    - `GOOGLE_API_VERSION`: API version selection (v1, v1beta, v1alpha)
  - Automatic detection of configuration mode (API Key vs Vertex AI)
  - Support for both Gemini Developer API and Vertex AI API endpoints

### Changed
- **Environment Configuration**: Updated .env files to use GEMINI_API_KEY for clarity
- **Documentation**: Enhanced README with Google/Gemini API options and Vertex AI setup

### Technical Details
- Google provider now supports three initialization modes:
  1. Gemini Developer API with GEMINI_API_KEY (simplest)
  2. Gemini Developer API with GOOGLE_API_KEY (backward compatible)
  3. Google Vertex AI with project/location configuration (enterprise)
- API version can be configured for both Gemini and Vertex AI modes
- Improved validation to handle both API key and Vertex AI configurations

## [1.9.0] - 2025-08-07

### Added
- **OpenAI Provider**: Added support for GPT-5 family models, OpenAI's latest flagship series
  - **GPT-5**: Latest flagship model with 400K context window, 128K max output tokens
    - Superior reasoning, code generation, and analysis capabilities
    - Full support for streaming, function calling, structured outputs, web search, and MCP
    - Aliases: `gpt5`, `gpt 5`, `gpt-5-2025-08-07`
  - **GPT-5-mini**: Faster, cost-efficient version for well-defined tasks
    - Same 400K context and 128K output as GPT-5
    - Optimized for speed and cost ($0.25 input, $2 output per 1M tokens)
    - Aliases: `gpt5-mini`, `gpt-5mini`, `gpt 5 mini`, `gpt-5-mini-2025-08-07`
  - **GPT-5-nano**: Fastest, most cost-efficient version
    - Same 400K context and 128K output capabilities
    - Best for summarization and classification ($0.05 input, $0.40 output per 1M tokens)
    - No web search support
    - Aliases: `gpt5-nano`, `gpt-5nano`, `gpt 5 nano`, `gpt-5-nano-2025-08-07`
  - All GPT-5 models don't support temperature parameter
  - Updated model recommendations to prefer GPT-5 family over O3 for various use cases
- **New API Features for GPT-5**:
  - **Minimal reasoning effort**: New `minimal` option for fastest responses with few reasoning tokens
  - **Verbosity control**: New `verbosity` parameter (low/medium/high) to control output length
    - Low: Concise answers, minimal code commentary
    - Medium: Balanced responses (default)
    - High: Thorough explanations and detailed code
  - Both features supported across entire GPT-5 family (GPT-5, GPT-5-mini, GPT-5-nano)
  - Enhanced chat tool to support these new parameters with proper defaults

## [1.8.3] - 2025-08-07

### Changed
- **Anthropic Provider**: Updated Claude Opus 4 to the new Opus 4.1 model
  - Model ID changed from `claude-opus-4-20250514` to `claude-opus-4-1-20250805`
  - Added new aliases: `claude-opus-4-1`, `opus-4.1`, `opus4.1`, `claude-opus-4.1`
  - Maintains all existing aliases for backward compatibility
  - Same capabilities: 200K context, 32K output tokens, extended thinking, image support

## [1.8.0] - 2025-08-04

### Added
- **OpenAI Deep Research Models**: Added support for OpenAI's deep research models
  - Added `o3-deep-research-2025-06-26` model with 90-minute timeout for comprehensive research
  - Added `o4-mini-deep-research-2025-06-26` model with 60-minute timeout for faster research
  - Both models support web search via `web_search_preview` tool
  - Models can run 30-90 minutes for in-depth analysis and multi-source synthesis
  - Requires setting `MCP_TOOL_TIMEOUT` environment variable (e.g., `5400000` for 90 minutes)

### Changed
- **Web Search Implementation**: Simplified web search to use only `web_search_preview` tool type
  - Removed unused `web_search` tool type references
  - All OpenAI models now consistently use `web_search_preview` when web search is enabled
  - Removed support for always-search models (`gpt-4o-search-preview`, `gpt-4o-mini-search-preview`)

### Technical Details
- Deep research models work with existing chat tool - no separate research tool needed
- Models are integrated into the standard OpenAI provider implementation
- Supports all standard features: streaming, images, context, continuation
- Progress notifications and cancellation infrastructure ready for future Claude Code UI support

## [1.7.3] - 2025-08-02

### Fixed
- **Test Suite**: Fixed numerous test failures across the codebase
  - Fixed syntax errors in fixture files (duplicate `__dirname` declarations, invalid JSON)
  - Fixed JSON parsing errors in edge-cases.json (sparse arrays, JavaScript expressions, hex escape sequences)
  - Fixed performance test reliability by using consistent model selection
  - Fixed consensus tool cross-feedback by ensuring proper message alternation for Anthropic API
  - Fixed image validation to handle base64 data URLs properly
  - Fixed mock provider implementations to properly track method calls
- **Image Processing**: Enhanced image quality settings
  - Updated OpenAI provider to use `detail: 'high'` for better image analysis
  - Updated XAI provider to use `detail: 'high'` for better image analysis
- **Path Utilities**: Removed shebang line from pathUtils.js module

### Added
- **Test Images**: Added test images (fruits.png, tulips.png, baboon.png) for image processing tests
- **Dependencies**: Added vite as a dependency (was missing)

### Improved
- **Test Coverage**: Enhanced test reliability and coverage
  - Updated image tests to use real images instead of invalid base64 strings
  - Added proper base64 encoding helper for XAI image tests
  - Fixed mock provider tests to properly handle call tracking
  - Improved error message matching in provider tests

## [1.7.2] - 2025-01-27

### Added
- **Cross-Platform Support**: Comprehensive cross-platform compatibility improvements
  - Created `src/utils/pathUtils.js` utility module for platform-agnostic operations
  - Added `cross-env` and `rimraf` dependencies for cross-platform npm scripts
  - Platform-specific path handling for Windows, Linux, and macOS
  - Cross-platform timeout commands and process spawning

### Changed
- **npm Scripts**: Updated all scripts to use cross-platform commands
  - Replaced Unix-specific `rm -rf` with `rimraf` package
  - All environment variable assignments now use `cross-env`
  - Scripts now work correctly on Windows, Linux, and macOS
- **Path Handling**: Improved path operations throughout codebase
  - Fixed path comparisons to use proper URL methods instead of string replacement
  - Line counting now handles both CRLF (Windows) and LF (Unix/Mac) line endings
  - Test files use platform-agnostic path helpers instead of hardcoded paths
- **Process Spawning**: Updated to use Node.js executable path
  - Tests now use `process.execPath` instead of hardcoded 'node' command
  - Proper spawn options for Windows compatibility

### Fixed
- **Windows Compatibility**: Fixed multiple Windows-specific issues
  - Path separator handling in file operations
  - Process spawning in test files
  - Timeout commands in validation script
- **Test Reliability**: Fixed hardcoded paths in tests
  - Replaced Windows-specific paths (C:\) with platform helpers
  - Replaced Unix-specific paths (/tmp) with OS temp directory
- **JSON Import**: Fixed ES module JSON import syntax for better compatibility
  - Tests now use `readFileSync` and `JSON.parse` instead of import assertions

### Improved
- **Code Quality**: Enhanced linting and code standards
  - Changed `no-unused-vars` to warning level for better DX
  - Added missing global variables to ESLint config
  - Fixed numerous linting issues across the codebase

## [1.7.1] - 2025-07-28

### Changed
- **Test Organization**: Reorganized integration tests into provider-specific structure
  - Provider tests now in `tests/integration/providers/{provider}/` directories
  - Each provider has separate API, features, and image test files
  - Removed archived test files that were replaced
- **Test Commands**: Updated test command naming for consistency
  - `npm run test:e2e` now preferred over `test:real-api` (both still work)
  - Added provider subcategory commands for granular testing
- **Documentation**: Updated all test documentation to reflect new structure
  - Updated `tests/README.md` with new test organization
  - Updated main `README.md` with current test commands
  - Added `tests/integration/providers/README.md` for provider test guidance

### Added
- **Provider Image Tests**: Added dedicated image processing tests
  - `xai/xai-image.test.js` - XAI Grok-4 image processing
  - `google/google-image.test.js` - Google Gemini image processing
- **Error Handling Tests**: Added comprehensive error handling tests
  - `anthropic/anthropic-error.test.js` - Rate limiting and edge cases
  - `multi-provider-error.test.js` - Cross-provider error handling
- **Advanced Tests**: Added advanced multi-provider scenarios
  - `multi-provider-advanced.test.js` - Consensus with files, consistency tests
  - `debug-tests.test.js` - Message format debugging

### Fixed
- **Test Configuration**: Updated `suites.config.js` to use new test paths
  - Fixed real-api suite to use glob patterns for new structure
  - Properly excludes archived directory from test runs

## [1.7.0] - 2025-07-28

### Changed
- **Configuration**: Server name and version are now automatically read from package.json
  - Removed `MCP_SERVER_NAME` and `MCP_SERVER_VERSION` environment variables
  - Ensures version consistency across all parts of the application
- **OpenRouter Provider**: Requires `OPENROUTER_DYNAMIC_MODELS=true` to use models in `provider/model` format
  - Previously allowed dynamic models without explicit configuration
  - Now properly enforces the environment variable requirement
- **Tool Descriptions**: Updated parameter descriptions for better clarity
  - Model examples now show `o3`, `gemini-2.5-pro`, `grok-4-0709`
  - File and image paths show both absolute (Windows) and relative path examples
  - Reasoning effort examples updated to `low`, `medium`, `high`
  - Simplified use_websearch description
- **Help System**: Help prompt now dynamically generates tool documentation from metadata
  - Ensures consistency between implementation and documentation
  - No more manual updates needed when tool parameters change

### Added
- **Environment Variables Documentation**: Added all missing environment variables to help prompt
  - All API keys (ANTHROPIC, MISTRAL, DEEPSEEK, OPENROUTER)
  - OpenRouter configuration options
  - HTTP server configuration options

### Removed
- **Unused Build Script**: Removed unused `build.js` script and related npm scripts
  - Project doesn't require build step as it's pure Node.js
  - Removed `build` and `build:fast` npm scripts
- **Obsolete Environment Variables**: Cleaned up documentation
  - Removed references to `GOOGLE_LOCATION` (already unused)
  - Removed references to `XAI_BASE_URL` (not configurable via env)

### Fixed
- **OpenRouter Dynamic Models**: Fixed behavior to require explicit enablement
  - Models with "/" format now properly require `OPENROUTER_DYNAMIC_MODELS=true`
  - Returns clear error message when dynamic models are disabled

## [1.6.0] - 2025-07-27

### Added
- **OpenRouter Provider**: Dynamic model discovery support
  - Enable with `OPENROUTER_DYNAMIC_MODELS=true` environment variable
  - Automatically fetches model capabilities from OpenRouter's endpoints API
  - Supports any model available on OpenRouter without manual configuration
  - Model capabilities are cached for 24 hours to improve performance
  - Added support for `openrouter/auto` model for automatic model selection
- **Model Routing**: Enhanced model routing logic
  - Models with "/" format check native providers first before routing to OpenRouter
  - Allows using models like `anthropic/claude-3.5-sonnet` via OpenRouter when not available natively
  - Maintains backward compatibility with keyword-based routing

### Changed
- **OpenRouter Provider**: Added static configurations for Qwen3 and Kimi models
  - `qwen/qwen3-235b-a22b-thinking-2507` - 235B model with thinking capabilities
  - `qwen/qwen3-coder` - Specialized for coding tasks
  - `moonshotai/kimi-k2` - 200K context window

## [1.5.5] - 2025-07-26

### Fixed
- **Anthropic Provider**: Increased SDK timeout to 20 minutes for thinking models
  - Prevents "Streaming is strongly recommended" errors for long-running requests
  - Claude 4 series models now work properly with thinking mode enabled
- **Tests**: Updated test expectations for max_tokens being required by API

## [1.5.4] - 2025-07-26

### Fixed
- **Anthropic Provider**: Removed non-existent 'thinking-2025-01-27' beta header
  - Thinking mode is controlled through model selection, not beta headers

## [1.5.3] - 2025-07-26

### Fixed
- **Google Provider**: Fixed gemini-2.0-flash configuration - model does not support thinking mode
- **Anthropic Provider**: Fixed Claude 4 series models token handling
  - No longer set max_tokens for opus-4 and sonnet-4 models, letting SDK use defaults (32k/64k)
  - Prevents "context length exceeded" errors that were actually SDK warnings about streaming
- **Tests**: Updated test expectations to match new error message formats

## [1.5.1] - 2025-07-26

### Fixed
- **Mistral Provider**: Fixed image handling by correcting the image URL field name from `image_url` to `imageUrl` to match Mistral API expectations
  - Models supporting images (mistral-medium-3) now properly process image content
  - Resolved validation errors when sending images to Mistral API

## [1.4.0] - 2025-07-26

### Changed
- **BREAKING**: **Transport Default**: Changed default transport from HTTP to stdio for standard MCP compliance
  - Stdio transport is now the default (launched automatically by Claude)
  - HTTP transport available via `--transport=http` or `MCP_TRANSPORT=http` for development/debugging
  - Updated CLI help and documentation to reflect new defaults
  - No functionality lost - all transport methods still available

### Fixed
- **Test Stability**: Fixed timeout issue in file context processing test
- **Test Environment**: Added explicit `MCP_TRANSPORT=http` to test environment to maintain HTTP testing

### Documentation
- Updated README.md to show stdio as default transport
- Updated help text and examples to reflect new transport defaults
- Clarified when to use HTTP transport (development/debugging scenarios)

## [1.3.4] - 2025-07-26

### Added
- **Anthropic Prompt Caching**: Implemented automatic prompt caching with 1-hour TTL for system prompts
  - Reduces latency and API costs for repeated requests
  - Minimum 1024 tokens required (2048 for Haiku models)
  - Cache metrics available in response metadata
- **Provider Documentation**: Added comprehensive documentation for all new providers (Anthropic, DeepSeek, Mistral, OpenRouter)

### Fixed
- **Anthropic Provider**: Fixed thinking budget calculation to properly account for token limits
- **Anthropic Provider**: Force temperature to 1 when thinking is enabled (API requirement)
- **Anthropic Provider**: Fixed context length issues with Claude Sonnet 4

### Improved
- **Test Coverage**: Added comprehensive integration tests for all new providers
- **Error Handling**: Better error messages for model availability and context limits

## [1.3.3] - 2025-07-26

### Fixed
- **Anthropic Provider**: Fixed context length calculation for thinking models
- **Mistral Provider**: Fixed SDK import order to resolve constructor errors

## [1.3.2] - 2025-07-26

### Fixed
- **OpenRouter Provider**: Fixed HTTP-Referer header configuration issue by correcting config key casing
- **Missing Dependencies**: Added `@anthropic-ai/sdk` and `@mistralai/mistralai` as dependencies to fix provider initialization errors

## [1.3.1] - 2025-07-26

### Improved
- **Help System**: Updated help documentation and resources to display models from all 7 providers (previously only showed 3)
- **Auto Model Selection**: Enhanced "auto" model selector to support all providers with intelligent defaults:
  - OpenAI: `o3` (powerful reasoning model)
  - Google: `gemini-2.5-pro` (advanced capabilities)
  - Anthropic: `claude-sonnet-4-20250514` (Sonnet 4)
  - Mistral: `magistral-medium-2506` (frontier-class model)
  - DeepSeek: `deepseek-reasoner` (reasoning model)
  - XAI: `grok-4-0709` (unchanged)
  - OpenRouter: `qwen/qwen3-coder` (unchanged)
- **Model Aliases**: Added comprehensive aliases for all models across all providers for easier access
- **Provider Detection**: Updated `mapModelToProvider` function to recognize models from all 7 providers

### Fixed
- **Help Command**: Fixed issue where help command only displayed models from original 3 providers
- **Model Resolution**: Fixed model name resolution to work with all provider models and their aliases

## [1.3.0] - 2025-07-26

### Added
- **New Providers**: Added support for 5 new AI providers, expanding model options:
  - **Anthropic**: Support for Claude models including Opus 4, Sonnet 3.5, and Haiku 3.5
  - **Mistral AI**: Support for Magistral Medium, Magistral Small, and Mistral Medium 3
  - **DeepSeek**: Support for DeepSeek Chat (V3) and DeepSeek Reasoner (R1) models
  - **OpenRouter**: Gateway to access Qwen3 235B Thinking, Qwen3 Coder, and Kimi K2 models
  - **OpenAI-Compatible Base Module**: Reusable factory for creating providers with OpenAI-compatible APIs

### Features
- **Unified Provider Interface**: All providers implement consistent interface with error handling
- **Advanced Model Capabilities**: 
  - Thinking/reasoning models with configurable effort levels (Anthropic, OpenRouter)
  - Multimodal support for images (Anthropic, Mistral Medium 3)
  - Extended context windows (up to 200K tokens for Claude, 200K for Kimi K2)
- **Enhanced Error Handling**: Provider-specific error mapping to unified error codes
- **Comprehensive Test Coverage**: Added extensive unit tests for all new providers
- **Dynamic SDK Loading**: Lazy loading of provider SDKs for better performance

### Improved
- **Provider Architecture**: Refactored to use base modules for code reuse
- **Model Configuration**: Rich metadata for each model including capabilities and limits
- **Temperature Handling**: Fixed temperature parameter conflicts in OpenAI-compatible providers
- **Image Validation**: Added proper validation for models that don't support images
- **Integration Tests**: Fixed MCP server initialization with required capabilities

### Fixed
- **OpenAI-Compatible Providers**: Fixed temperature default parameter override issue
- **Error Re-throwing**: Fixed error handling in Anthropic provider to avoid double-wrapping
- **Mock Setup**: Fixed dynamic import mocking patterns in provider tests
- **API Key Validation**: Added proper validation for provider-specific key formats

## [1.2.1] - 2025-07-26

### Changed
- **Dependencies**: Updated dotenv from v16.4.7 to v17.2.1
- **Dependencies**: Updated eslint to latest version (9.17.0)
- **Configuration**: Added `quiet: true` option to dotenv configuration to suppress verbose logging output

### Fixed
- **Tests**: Fixed test failures caused by dotenv v17's verbose logging interfering with JSON parsing in MCP protocol tests
- **Tests**: Updated tests to properly handle MCP protocol error responses instead of expecting thrown errors
- **Tests**: Added missing prompts and resources capabilities to test server instances

### Improved
- **Code Quality**: All code now passes latest eslint rules and formatting standards

## [1.2.0] - 2025-07-26

### Added
- **Help Prompt**: Added comprehensive help prompt (`/converse:help`) that provides detailed documentation about all tools, parameters, providers, and models
  - Supports topic-specific help queries (tools, models, providers, parameters, examples)
  - Dynamically pulls real-time model information from provider files
  - Explicitly instructs LLMs to share the information with users
- **Help Resource**: Added MCP resource (`converse://help`) that exposes the same help documentation plus server version information
  - Accessible via MCP resource protocol for programmatic access
  - Includes current server version from package.json
- **MCP Capabilities**: Extended server capabilities to support both prompts and resources in addition to tools

### Improved
- **Documentation**: Help content automatically stays up-to-date by fetching model details directly from provider implementations
- **User Experience**: Both prompt and resource provide comprehensive guidance including model selection tips, configuration advice, and best practices

## [1.1.2] - 2025-07-26

### Fixed
- **Binary Entry Point**: Fixed "startServer is not a function" error when running via npx/npm by properly exporting main function from index.js
- **Module Structure**: Improved module architecture to support both CLI and programmatic usage
- **Stdio Transport**: Removed console output from bin file to prevent JSON-RPC protocol corruption

### Changed
- **Entry Point Pattern**: index.js now exports main function and only auto-executes when run directly, following Node.js best practices

## [1.1.1] - 2025-07-26

### Improved
- **Consensus Tool Output**: Optimized output format by removing redundant `rawResponse` fields, reducing output size by ~70-80% while maintaining all essential information
- **Performance**: Significantly reduced memory usage and network payload for consensus tool responses

### Changed
- **Output Structure**: Removed `rawResponse` from both initial and refined consensus responses while maintaining backward compatibility

## [1.1.0] - 2025-07-26

### Fixed
- **Image Processing**: Fixed image handling in chat and consensus tools where images were being sent in a separate message from the prompt, causing XAI (Grok) and Google (Gemini) providers to not receive images correctly
- **Message Structure**: Both tools now properly merge context (including images) and prompt into a single user message with complex content array
- **Provider Compatibility**: All three providers (OpenAI, XAI, Google) now correctly process images with their respective format requirements

### Added
- **Integration Tests**: Added comprehensive image processing tests for consensus tool to verify all providers handle images correctly

### Improved
- **Image Format Validation**: Enhanced image format conversion for XAI and Google providers with proper debugging output
- **File Validation**: Added file existence validation before processing context to prevent errors

## [1.0.3] - 2025-07-26

### Fixed
- **Stdio Transport**: Fixed configuration loading error (`Cannot convert undefined or null to object`) that prevented stdio transport from starting
- **Console Suppression**: Fixed logger to properly suppress console output in stdio transport mode from startup
- **Transport Detection**: Moved transport type detection to very early in startup process to prevent any console output interference

### Improved
- **JSON-RPC Protocol**: Enhanced stdio transport reliability by eliminating all console output that could corrupt the protocol stream
- **Logger Configuration**: Improved logger reconfiguration timing to respect transport mode from the beginning

### Changed
- **Default Port**: Changed default HTTP server port from 3000 to 3157 to avoid common port conflicts

## [1.0.2] - 2025-07-26

### Fixed
- **Console Logging**: Replaced remaining `console.log` and `console.error` calls with proper structured logger to prevent stdio transport corruption
- **Configuration**: Fixed console output in config loading that could interfere with MCP JSON-RPC protocol

### Changed  
- **Documentation**: Updated model examples to use latest intelligent models (o3, grok-4, gemini-2.5-pro) and fast models (gemini-2.5-flash, o4-mini, gpt-4.1)
- **File Paths**: Updated example file paths in documentation to use git-bash compatible paths (`/c/Users/username/...`)

### Removed
- **Unused Configuration**: Removed unused `GOOGLE_LOCATION` and `XAI_BASE_URL` environment variables from configuration files
- **Legacy Config**: Cleaned up unused Docker, DIAL, and OpenRouter configuration remnants from environment files

### Improved
- **Logger Integration**: Enhanced error logging consistency across chat and consensus tools
- **Transport Safety**: Strengthened stdio transport protection against console output interference

## [1.0.1] - 2025-07-25

### Fixed
- **Binary Script**: Fixed Windows compatibility for bin script import path

## [1.0.0] - 2025-07-25

### Added
- **Initial Release**: Complete Node.js implementation with functional architecture
- **Chat Tool**: Single-provider conversational AI with context and continuation support
- **Consensus Tool**: Multi-provider parallel execution with cross-model feedback
- **Provider Support**: OpenAI, Google/Gemini, and X.AI/Grok providers
- **Token Limiting**: Configurable response size limits (default: 25,000, max: 200,000 tokens)
- **System Prompts**: Dedicated prompts for chat and consensus tools
- **Context Processing**: File and image support with security validation
- **Continuation System**: Persistent conversation management
- **Configuration Management**: Environment-driven configuration system
- **Comprehensive Documentation**: API reference, architecture guide, and examples
- **Test Suite**: Unit, integration, and end-to-end tests
- **NPX Support**: Direct execution via `npx FallDownTheSystem/converse`
- **MCP Compliance**: Full Model Context Protocol implementation
- **Error Handling**: Robust error handling with graceful degradation
- **Logging System**: Structured logging with configurable levels

### Features
- **Parallel Consensus**: Simultaneous model execution for faster responses
- **Cross-Model Feedback**: Models can refine responses based on other models' insights
- **Auto Model Selection**: Intelligent model selection when using "auto" parameter
- **Multiple Response Formats**: Support for text, JSON, and structured responses
- **File Context Processing**: Support for multiple file formats with line numbering
- **Image Analysis**: Base64 image processing for visual context
- **Flexible Configuration**: Environment variables with sensible defaults
- **Provider Abstraction**: Unified interface across different AI providers
- **Request Validation**: Comprehensive input validation and sanitization

## Notes

This is a simplified Node.js implementation of an MCP Server focused on providing just the essential Chat and Consensus tools for a streamlined experience. The parallel consensus workflow represents a major architectural improvement, providing faster and more nuanced multi-model analysis.