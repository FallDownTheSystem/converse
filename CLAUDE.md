# Claude Development Guide for Converse MCP Server

This repository contains the **Converse MCP Server** - a functional Node.js implementation of an MCP server.

## Repository Structure

- **`src/`** - Main source code for the Converse MCP Server
- **`docs/`** - Complete documentation (API, Architecture, Examples)
- **`tests/`** - Comprehensive test suite (unit, integration, e2e)
- **`scripts/`** - Development and build scripts
- **`examples/`** - Usage examples and sample configurations
- **`bin/`** - Executable binaries for CLI usage

## Converse MCP Server (Node.js)

The **Converse MCP Server** follows a functional architecture with two main tools:

1. **Chat Tool** - Single-provider conversational AI with context support
2. **Consensus Tool** - Multi-provider parallel execution with response aggregation

### Development Setup
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test
```

For detailed implementation guidance, see:
- `docs/API.md` - Complete API reference
- `docs/ARCHITECTURE.md` - System architecture and design principles
- `docs/EXAMPLES.md` - Usage examples and patterns

## Quick Reference Commands

### Code Quality Checks

Before making any changes or submitting PRs, always run the comprehensive quality checks:

```bash
# Run all quality checks (linting, formatting, tests)
npm run validate

# Run individual checks
npm run lint
npm run typecheck
npm run test
npm run format:check
```

### Development Commands

```bash
# Start development server with hot reload
npm run dev

# Run in debug mode
npm run debug

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:providers
npm run test:tools
```

### Server Management

#### Setup/Update the Server
```bash
# Install dependencies and start
npm install
npm start
```

#### View Logs
```bash
# Follow logs in real-time with debug logging
LOG_LEVEL=debug npm run dev

# Or check specific log levels
LOG_LEVEL=info npm start
```

### Testing

#### Run All Tests
```bash
# Run full test suite
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

#### Run Specific Test Categories
```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# End-to-end tests with real API calls
npm run test:e2e

# Provider tests
npm run test:providers

# Tool tests
npm run test:tools

# MCP client tests (HTTP-based client-server testing)
npm run test:mcp-client

# Performance tests
npm run test:performance

# Utility tests
npm run test:utils

# Resource tests
npm run test:resources

# Prompt tests
npm run test:prompts
```

### Development Workflow

#### Before Making Changes
1. Install dependencies: `npm install`
2. Run quality checks: `npm run validate`
3. Start development server: `npm run dev`

#### After Making Changes
1. Run quality checks again: `npm run validate`
2. Run tests: `npm test`
3. Verify functionality: `npm start`
4. Check logs for any issues

#### Before Committing/PR
1. Final quality check: `npm run validate`
2. Verify all tests pass: `npm test`
3. Check documentation is up to date

### Available Tools

The Converse MCP Server includes two main tools:

1. **Chat Tool** (`chat`)
   - General conversational AI
   - File and image support
   - Continuation support for persistent conversations
   - Uses functional architecture

2. **Consensus Tool** (`consensus`)
   - Parallel multi-model consensus gathering
   - Two-phase workflow: initial responses + cross-model refinement
   - All models consulted simultaneously for speed
   - Models can see each other's responses and refine their answers
   - Single tool call with clean interface
   - Robust error handling - partial failures don't stop other models
   - Optional: disable cross-feedback for faster single-phase consensus

### Using the Consensus Tool

The consensus tool operates with parallel processing across multiple AI providers:

```javascript
// Example request structure:
{
  "prompt": "Should we implement real-time collaboration features?",
  "models": ["gpt-5", "grok-4", "gemini-2.5-pro"],
  "files": ["/c/Users/username/Documents/project/spec.md"],  // Optional - use git-bash paths
  "enable_cross_feedback": true,           // Optional, defaults to true
  "cross_feedback_prompt": null            // Optional custom refinement prompt
}
```

```javascript
// Alternative with fast models for quick consensus:
{
  "prompt": "Should we use TypeScript for this component?",
  "models": ["gemini-2.5-flash", "o4-mini", "gpt-4.1"],
  "files": ["/c/Users/username/project/src/components/Header.tsx"]
}
```

The tool will:
1. Send your question to all models simultaneously (parallel execution)
2. Collect initial responses from each model
3. Share each model's response with the others for refinement
4. Allow models to refine their answers based on collective insights
5. Return both initial and refined responses in a single result

### Common Troubleshooting

#### Server Issues
```bash
# Check if environment is set up correctly
npm run validate

# View recent errors
LOG_LEVEL=debug npm start

# Check dependencies
npm install
```

#### Test Failures
```bash
# Run tests with verbose output
npm run test -- --verbose

# Run specific test file
npm run test tests/tools/chat.test.js

# Check for syntax issues
npm run lint
```

#### Configuration Issues
```bash
# Verify API keys are configured
cat .env

# Check configuration loading
LOG_LEVEL=debug npm start
```

### File Structure Context

- `src/index.js` - Main entry point and MCP server setup
- `src/config.js` - Configuration and environment management
- `src/tools/` - MCP tool implementations (chat.js and consensus.js)
- `src/providers/` - AI provider implementations (OpenAI, Google, XAI)
- `src/utils/` - Utility functions (logging, context processing, etc.)
- `src/transport/` - HTTP transport layer for MCP communication
- `src/router.js` - Request routing and middleware
- `src/systemPrompts.js` - System prompt templates
- `src/continuationStore.js` - Conversation state management
- `tests/` - Comprehensive test suite
- `scripts/` - Development and build automation scripts
- `docs/` - Complete documentation

### Environment Requirements

- Node.js 20.0.0+ (LTS recommended)
- NPM or compatible package manager
- API keys for at least one provider (OpenAI, Google, or XAI)
- Environment variables configured in `.env` file

### Configuration

The server uses environment-driven configuration. Copy `.env.example` to `.env` and configure:

```bash
# Required: At least one API key
OPENAI_API_KEY=sk-proj-your_key_here
GOOGLE_API_KEY=your_google_key_here
XAI_API_KEY=xai-your_key_here

# Optional: Server settings
MAX_MCP_OUTPUT_TOKENS=200000
LOG_LEVEL=info
PORT=3157
```

### Deployment

The server can be deployed using:

```bash
# NPX (recommended)
npx converse-mcp-server

# Global installation
npm install -g converse-mcp-server
converse

# From source
git clone https://github.com/FallDownTheSystem/converse.git
cd converse
npm install
npm start
```

This guide provides everything needed to efficiently work with the Converse MCP Server codebase using Claude.