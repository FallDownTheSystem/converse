# Changelog

All notable changes to the Converse MCP Server project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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