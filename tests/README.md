# Test Suite Documentation

This directory contains the comprehensive test suite for the Converse MCP Server. Tests are organized by category to facilitate different testing scenarios and requirements.

## Test Categories

### Unit Tests (`npm run test:unit`)
- **Location**: `tests/unit/`, `tests/tools/`
- **Purpose**: Fast, isolated tests with mocked dependencies
- **Execution Time**: ~30 seconds
- **Requirements**: None (no API keys needed)
- **Use When**: During development, before commits, in CI/CD

### Integration Tests (`npm run test:integration`)
- **Location**: `tests/integration/`
- **Purpose**: Tests with real dependencies but no external API calls
- **Execution Time**: ~3 minutes
- **Requirements**: None (uses mocked providers)
- **Use When**: Validating component interactions, CI/CD

### End-to-End Tests (`npm run test:e2e` or `npm run test:real-api`)
- **Location**: `tests/integration/providers/real-api*.test.js`
- **Purpose**: Tests that make actual API calls to validate real provider behavior
- **Execution Time**: ~5-10 minutes
- **Requirements**: Valid API keys in environment
- **Use When**: Final validation before release, testing provider updates

### Provider Tests (`npm run test:providers`)
- **Location**: `tests/unit/providers/`
- **Purpose**: Unit tests for all provider implementations
- **Execution Time**: ~15 seconds
- **Requirements**: None (uses mocks)
- **Use When**: After modifying provider code

### Tool Tests (`npm run test:tools`)
- **Location**: `tests/tools/`
- **Purpose**: Tests for MCP tools (chat, consensus)
- **Execution Time**: ~20 seconds
- **Requirements**: None
- **Use When**: After modifying tool implementations

### MCP Client Tests (`npm run test:mcp-client`)
- **Location**: Various integration tests using HTTP transport
- **Purpose**: MCP protocol compliance validation, client-server testing
- **Execution Time**: ~3-5 minutes
- **Requirements**: None (uses HTTP transport)
- **Use When**: Validating MCP protocol implementation

### Performance Tests (`npm run test:performance`)
- **Location**: `tests/integration/performance*.test.js`
- **Purpose**: Performance and scalability validation
- **Execution Time**: ~5-15 minutes
- **Requirements**: Valid API keys recommended
- **Use When**: Before major releases, performance optimization

### Utility Tests (`npm run test:utils`)
- **Location**: `tests/utils/`
- **Purpose**: Tests for utility modules
- **Execution Time**: ~10 seconds
- **Requirements**: None
- **Use When**: After modifying utility code

### Resource Tests (`npm run test:resources`)
- **Location**: `tests/resources/`
- **Purpose**: Tests for MCP resources
- **Execution Time**: ~5 seconds
- **Requirements**: None
- **Use When**: After modifying resource implementations

### Prompt Tests (`npm run test:prompts`)
- **Location**: `tests/prompts/`
- **Purpose**: Tests for MCP prompts
- **Execution Time**: ~5 seconds
- **Requirements**: None
- **Use When**: After modifying prompt implementations

## Common Commands

```bash
# Run all tests
npm test

# Run specific category
npm run test:unit
npm run test:integration
npm run test:e2e

# Watch mode for development
npm run test:watch

# Run with coverage
npm run test:coverage
npm run test:coverage:unit

# Run CI-friendly tests (no API calls)
npm run test:ci

# Interactive UI
npm run test:ui
```

## Test Organization

```
tests/
├── unit/                 # Isolated unit tests
│   └── providers/        # Provider unit tests
├── integration/          # Integration tests
│   ├── providers/        # Provider integration tests (including real API)
│   └── *.test.js         # General integration tests
├── tools/                # Tool-specific tests
├── utils/                # Utility tests
├── resources/            # Resource tests
├── prompts/              # Prompt tests
├── shared/               # Shared test utilities
│   ├── mocks/            # Mock implementations
│   ├── fixtures/         # Test data
│   └── helpers/          # Test helpers
└── setup/                # Test setup files
```

## Writing Tests

1. **Choose the Right Category**: Place your test in the appropriate directory based on its scope
2. **Use Appropriate Timeouts**: Unit tests should be fast (10s), integration tests moderate (45s), E2E tests can be longer (60s+)
3. **Mock External Dependencies**: For unit and integration tests, mock API calls
4. **Use Test Utilities**: Leverage shared helpers and fixtures for consistency
5. **Follow Naming Conventions**: `*.test.js` for test files, descriptive names for test cases

## Environment Variables

- `NODE_ENV=test`: Always set for test execution
- `LOG_LEVEL`: Controls logging verbosity (error, warn, info, debug)
- `API Keys`: Required only for real API tests
  - `OPENAI_API_KEY`
  - `XAI_API_KEY`
  - `GOOGLE_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `MISTRAL_API_KEY`
  - `DEEPSEEK_API_KEY`
  - `OPENROUTER_API_KEY`

## Troubleshooting

### Tests Failing
1. Check if you have the required API keys for E2E tests
2. Ensure Node.js version is 20.0.0 or higher
3. Run `npm install` to ensure dependencies are up to date
4. Check test logs with `LOG_LEVEL=debug npm run test:unit`

### Performance Issues
1. Run tests in isolation: `npm run test:unit -- path/to/specific.test.js`
2. Use `test:watch` for faster feedback during development
3. Disable coverage for faster runs when not needed

### API Rate Limits
1. Real API tests may hit rate limits
2. Run them separately or with delays
3. Consider using mock mode for development