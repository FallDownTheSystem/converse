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

**IMPORTANT: This project uses pnpm, not npm.**

```bash
# Install dependencies (use pnpm, NOT npm)
pnpm install

# Start development server
pnpm run dev

# Run tests
pnpm test
```

For detailed implementation guidance, see:
- `docs/API.md` - Complete API reference
- `docs/ARCHITECTURE.md` - System architecture and design principles
- `docs/EXAMPLES.md` - Usage examples and patterns

## Quick Reference Commands

**IMPORTANT: Always use `pnpm` instead of `npm` for this project.**

### Code Quality Checks

Before making any changes or submitting PRs, always run the comprehensive quality checks:

```bash
# Run all quality checks (linting, formatting, tests)
pnpm run validate

# Run individual checks
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run format:check
```

### Development Commands

```bash
# Start development server with hot reload
pnpm run dev

# Run in debug mode
pnpm run debug

# Run specific test suites
pnpm run test:unit
pnpm run test:integration
pnpm run test:providers
pnpm run test:tools
```

### Server Management

#### Setup/Update the Server
```bash
# Install dependencies and start (use pnpm)
pnpm install
pnpm start
```

#### View Logs
```bash
# Follow logs in real-time with debug logging
LOG_LEVEL=debug pnpm run dev

# Or check specific log levels
LOG_LEVEL=info pnpm start

# Debug with summarization enabled
ENABLE_RESPONSE_SUMMARIZATION=true LOG_LEVEL=debug pnpm run dev
```

### Testing

#### Run All Tests
```bash
# Run full test suite
pnpm test

# Run tests with coverage
pnpm run test:coverage

# Run tests in watch mode
pnpm run test:watch
```

#### Run Specific Test Categories
```bash
# Unit tests only
pnpm run test:unit

# Integration tests only
pnpm run test:integration

# End-to-end tests with real API calls
pnpm run test:e2e

# Provider tests
pnpm run test:providers

# Tool tests
pnpm run test:tools

# MCP client tests (HTTP-based client-server testing)
pnpm run test:mcp-client

# Performance tests
pnpm run test:performance

# Utility tests
pnpm run test:utils

# Resource tests
pnpm run test:resources

# Prompt tests
pnpm run test:prompts
```

### Development Workflow

#### Before Making Changes
1. Install dependencies: `pnpm install`
2. Run quality checks: `pnpm run validate`
3. Start development server: `pnpm run dev`

#### After Making Changes
1. Run quality checks again: `pnpm run validate`
2. Run tests: `pnpm test`
3. Verify functionality: `pnpm start`
4. Check logs for any issues

#### Before Committing/PR
1. Final quality check: `pnpm run validate`
2. Verify all tests pass: `pnpm test`
3. Check documentation is up to date

### Available Tools

The Converse MCP Server includes four main tools:

1. **Chat Tool** (`chat`)
   - General conversational AI with async support
   - File and image support
   - Continuation support for persistent conversations
   - Background execution with `async: true` parameter
   - Uses functional architecture with streaming
   - AI-powered title generation and content summarization

2. **Consensus Tool** (`consensus`)
   - Parallel multi-model consensus gathering with async support
   - Background processing with per-provider progress tracking
   - Robust error handling - partial failures don't stop other models
   - Combined summaries from all providers

3. **Check Status Tool** (`check_status`)
   - Monitor progress of asynchronous operations
   - Retrieve results from completed background jobs
   - List recent jobs with status information
   - Smart display with AI-generated titles and summaries

4. **Cancel Job Tool** (`cancel_job`)
   - Cancel running asynchronous operations
   - Graceful termination with resource cleanup

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

// Asynchronous consensus (for complex analysis):
{
  "prompt": "Design a scalable architecture for our system",
  "models": ["gpt-5", "gemini-2.5-pro", "claude-sonnet-4"],
  "files": ["/c/Users/username/project/docs/architecture.md"],
  "async": true,          // Run in background
  "enable_cross_feedback": true
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
pnpm run validate

# View recent errors
LOG_LEVEL=debug pnpm start

# Check dependencies
pnpm install
```

#### Test Failures
```bash
# Run tests with verbose output
pnpm test -- --verbose

# Run specific test file
pnpm test tests/tools/chat.test.js

# Check for syntax issues
pnpm run lint
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
- **pnpm** (required - do NOT use npm or yarn)
  - Install: `npm install -g pnpm` or `corepack enable`
- API keys for at least one provider (OpenAI, Google, or XAI)
- Environment variables configured in `.env` file

### AI Summarization Feature (v1.14.0+)

When enabled, the server automatically generates intelligent titles and summaries for better context understanding:

- **Automatic Title Generation**: Creates descriptive titles (up to 60 chars) for each request
- **Streaming Summaries**: Status check returns an up-to-date summary of the progress based on the partially streamed response  
- **Final Summaries**: Concise 1-2 sentence summaries of completed responses
- **Smart Status Display**: Enhanced check_status tool shows titles and summaries in job listings
- **Persistent Context**: Summaries are stored with async jobs for better progress tracking

**Configuration**:
```bash
# Enable in your .env file
ENABLE_RESPONSE_SUMMARIZATION=true    # Default: false  
SUMMARIZATION_MODEL=gpt-5-nano        # Default: gpt-5-nano
```

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

# Optional: AI Summarization (v1.14.0+)
ENABLE_RESPONSE_SUMMARIZATION=true
SUMMARIZATION_MODEL=gpt-5-nano
```

### Deployment

The server can be deployed using:

```bash
# NPX (for users - uses npm registry)
npx converse-mcp-server

# Global installation (for users)
npm install -g converse-mcp-server
converse

# From source (for development - use pnpm)
git clone https://github.com/FallDownTheSystem/converse.git
cd converse
pnpm install
pnpm start
```

**Note:** End users can use npm/npx to install the published package. Developers working on the codebase must use pnpm.

This guide provides everything needed to efficiently work with the Converse MCP Server codebase using Claude.