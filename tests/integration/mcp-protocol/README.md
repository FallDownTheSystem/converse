# MCP Protocol Integration Tests

This directory contains integration tests focused on the MCP (Model Context Protocol) implementation.

## Test Files

- `mcp-server.test.js` - Tests the MCP server HTTP transport layer
- `mcp-protocol.test.js` - Tests MCP protocol workflow and compliance
- `mcp-protocol-enhanced.test.js` - Enhanced protocol compliance tests with advanced scenarios
- `mcp-server-lifecycle.test.js` - Tests server initialization, configuration, and lifecycle
- `mcp-client-integration.test.js` - Comprehensive MCP client-server integration tests
- `direct-mcp-test.js` - Direct MCP functionality testing bypassing transport layer

## Running Tests

```bash
# Run all MCP protocol tests
npm run test:integration:mcp

# Run a specific test file
npm test tests/integration/mcp-protocol/mcp-server.test.js
```

## Purpose

These tests ensure:
- MCP protocol compliance
- Server lifecycle management
- Client-server communication
- HTTP transport functionality
- Protocol error handling
- Concurrent connection handling