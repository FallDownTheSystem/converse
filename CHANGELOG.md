# Changelog

All notable changes to the Converse MCP Server project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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