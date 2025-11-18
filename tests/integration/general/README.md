# General Integration Tests

This directory contains general integration tests that don't fit into specific categories.

## Test Files

- `error-recovery.test.js` - Tests error handling and recovery mechanisms
- `file-validation.test.js` - Tests file validation and processing

## Running Tests

```bash
# Run all general tests
npm run test:integration:general

# Run a specific test file
npm test tests/integration/general/error-recovery.test.js
```

## Purpose

These tests ensure:

- Proper error handling across the system
- File validation and security
- Recovery from various failure scenarios
- Input validation
- Edge case handling
