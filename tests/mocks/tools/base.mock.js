/**
 * Base mock tool for testing
 * Provides a consistent interface for mocking tool behavior
 */

import { vi } from 'vitest';

export function createMockTool(overrides = {}) {
  return {
    name: 'mock-tool',
    description: 'A mock tool for testing',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Input prompt' }
      },
      required: ['prompt']
    },
    handler: vi.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: 'Mock tool response'
      }]
    }),
    ...overrides
  };
}

export function createMockToolWithError(error) {
  return createMockTool({
    handler: vi.fn().mockRejectedValue(error)
  });
}

export function createMockToolWithValidation(validator) {
  const tool = createMockTool();
  const originalHandler = tool.handler;

  tool.handler = vi.fn().mockImplementation(async (args) => {
    const validation = validator(args);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }
    return originalHandler(args);
  });

  return tool;
}
