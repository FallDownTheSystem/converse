# Changelog

All notable changes to the Converse MCP Server project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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