# Tools Integration Tests

This directory contains integration tests for the chat and consensus tools.

## Test Files

- `tools-integration.test.js` - Comprehensive tests for both chat and consensus tools
- `continuation-flow.test.js` - Tests conversation continuation and state management
- `consensus-image.test.js` - Tests consensus tool with image processing capabilities

## Running Tests

```bash
# Run all tools tests
npm run test:integration:tools

# Run a specific test file
npm test tests/integration/tools/continuation-flow.test.js
```

## Purpose

These tests ensure:
- Tool functionality with real dependencies
- Conversation continuation support
- File and image processing
- Cross-tool integration
- Error handling and recovery
- Context processing