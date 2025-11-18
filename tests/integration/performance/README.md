# Performance Integration Tests

This directory contains tests focused on performance, scalability, and resource usage.

## Test Files

- `performance-consensus.test.js` - Performance tests for the consensus tool with multiple providers

## Running Tests

```bash
# Run all performance tests
npm run test:integration:performance

# Run with extended timeout for load tests
npm run test:performance
```

## Purpose

These tests ensure:

- Acceptable response times under load
- Memory usage remains reasonable
- Concurrent request handling
- Resource cleanup
- Scalability limits
- Performance benchmarks are met
