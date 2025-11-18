# Provider Integration Tests

This directory contains integration tests for all supported AI providers. Tests are organized by provider to facilitate isolated testing and maintenance.

## Test Structure

Each provider has its own subdirectory containing:

- `*-api.test.js` - Basic API functionality tests
- `*-features.test.js` - Provider-specific feature tests
- `*-image.test.js` - Image processing tests (where supported)
- `*-error.test.js` - Error handling and edge case tests (where applicable)

## Provider Directories

### Main Providers

- `openai/` - OpenAI GPT models
- `google/` - Google Gemini models
- `xai/` - XAI Grok models

### Additional Providers

- `anthropic/` - Anthropic Claude models
- `deepseek/` - DeepSeek models
- `mistral/` - Mistral AI models
- `openrouter/` - OpenRouter proxy service

### Multi-Provider Tests

- `multi-provider.test.js` - Cross-provider consensus tests
- `multi-provider-error.test.js` - Error handling across providers
- `multi-provider-advanced.test.js` - Advanced scenarios and consistency tests
- `debug-tests.test.js` - Debug and diagnostic tests

## Running Tests

```bash
# Run all provider integration tests
npm run test:integration:providers

# Run tests for a specific provider
npm test -- tests/integration/providers/openai
npm test -- tests/integration/providers/google

# Run specific test file
npm test -- tests/integration/providers/openai/openai-api.test.js

# Run with specific API keys only
OPENAI_API_KEY=sk-... npm run test:integration:providers
```

## Test Categories

### API Tests (`*-api.test.js`)

- Basic chat functionality
- Model-specific behavior
- Conversation continuity
- Error handling
- Performance benchmarks

### Feature Tests (`*-features.test.js`)

- Provider-specific capabilities
- Advanced model features
- Multi-model support within provider
- Special parameters (thinking modes, reasoning effort, etc.)

### Image Tests (`*-image.test.js`)

- Image processing capabilities
- Multi-modal conversations
- Base64 and file path support
- Multiple image handling

### Error Tests (`*-error.test.js`)

- Rate limiting behavior
- Invalid input handling
- Network error recovery
- Edge cases

## Requirements

- **API Keys**: Tests require valid API keys for the providers being tested
- **Environment**: Set keys in `.env` file or environment variables
- **Network**: Internet connection required for real API calls

## Test Behavior

- Tests are automatically skipped if API keys are not available
- Each test is independent and can be run in isolation
- Timeouts are set appropriately for API response times
- Tests use minimal token usage to reduce costs

## Adding New Provider Tests

1. Create a new directory for the provider
2. Add at least `*-api.test.js` and `*-features.test.js`
3. Follow the existing test patterns
4. Update this README with the new provider
5. Ensure tests are skipped when API key is missing

## Debugging

To see detailed logs during test execution:

```bash
LOG_LEVEL=debug npm test -- tests/integration/providers/openai
```

To run in watch mode for development:

```bash
npm run test:watch -- tests/integration/providers/openai
```
