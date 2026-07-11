/**
 * Comprehensive mock tools for testing
 * Consolidates all tool mocking utilities
 */

import { vi } from 'vitest';

/**
 * Base mock tool factory
 */
export function createMockTool(overrides = {}) {
  return {
    name: overrides.name || 'mock-tool',
    description: overrides.description || 'A mock tool for testing',
    parameters: overrides.parameters || {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Input prompt' },
      },
      required: ['prompt'],
    },
    handler: vi.fn().mockResolvedValue({
      result: 'Mock tool result',
      metadata: {},
    }),
    ...overrides,
  };
}

/**
 * Create a mock chat tool
 */
export function createMockChatTool(overrides = {}) {
  return createMockTool({
    name: 'chat',
    description: 'Mock chat tool for testing',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Chat prompt' },
        models: { type: 'array', items: { type: 'string' } },
        mode: {
          type: 'string',
          enum: ['chat', 'consensus', 'roundtable'],
          description: 'Execution mode',
        },
        files: { type: 'array', items: { type: 'string' } },
        images: { type: 'array', items: { type: 'string' } },
        continuation_id: { type: 'string', description: 'Continuation ID' },
      },
      required: ['prompt'],
    },
    handler: vi.fn().mockResolvedValue({
      result: 'Mock chat response',
      continuation_id: 'chat_123',
      model_used: 'mock-model',
      usage: { input_tokens: 10, output_tokens: 20 },
    }),
    ...overrides,
  });
}

/**
 * Create a mock consensus tool (unified chat tool in consensus mode)
 */
export function createMockConsensusTool(overrides = {}) {
  return createMockTool({
    name: 'chat',
    description: 'Mock consensus tool for testing',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Consensus prompt' },
        models: {
          type: 'array',
          items: { type: 'string' },
        },
        mode: {
          type: 'string',
          enum: ['chat', 'consensus', 'roundtable'],
          description: 'Execution mode',
        },
      },
      required: ['prompt'],
    },
    handler: vi.fn().mockResolvedValue({
      initial_responses: [
        { model: 'mock-model-1', response: 'Response 1', success: true },
        { model: 'mock-model-2', response: 'Response 2', success: true },
      ],
      refined_responses: [
        {
          model: 'mock-model-1',
          response: 'Refined response 1',
          success: true,
        },
        {
          model: 'mock-model-2',
          response: 'Refined response 2',
          success: true,
        },
      ],
    }),
    ...overrides,
  });
}

/**
 * Create a tool that returns an error
 */
export function createMockToolWithError(error) {
  return createMockTool({
    handler: vi.fn().mockRejectedValue(error),
  });
}

/**
 * Create a collection of mock tools
 */
export function createMockToolRegistry(tools = {}) {
  const defaultTools = {
    chat: createMockChatTool(),
    ...tools,
  };

  return {
    tools: defaultTools,
    get: (name) => defaultTools[name],
    list: () => Object.keys(defaultTools),
    register: (name, tool) => {
      defaultTools[name] = tool;
    },
  };
}
