/**
 * Mock Anthropic provider for testing
 * Implements Anthropic Claude-specific behavior and response formats
 */

import { vi } from "vitest";
import { createMockProvider, MockResponseBuilder } from "./base.mock.js";
import { ProviderError, ErrorCodes } from "../../../src/providers/interface.js";

// Anthropic model configurations matching the real provider
const ANTHROPIC_MODELS = {
  "claude-3-5-sonnet-20241022": {
    modelName: "claude-3-5-sonnet-20241022",
    friendlyName: "Claude 3.5 Sonnet",
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: false,
    supportsThinking: false,
    timeout: 60000,
    description: "Most intelligent model, best for complex tasks",
    aliases: ["claude-3-5-sonnet-latest"],
  },
  "claude-3-5-haiku-20241022": {
    modelName: "claude-3-5-haiku-20241022",
    friendlyName: "Claude 3.5 Haiku",
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsImages: false,
    supportsTemperature: true,
    supportsWebSearch: false,
    supportsThinking: false,
    timeout: 30000,
    description: "Fast and cost-effective for everyday tasks",
    aliases: ["claude-3-5-haiku-latest"],
  },
  "claude-3-opus-20240229": {
    modelName: "claude-3-opus-20240229",
    friendlyName: "Claude 3 Opus",
    contextWindow: 200000,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: false,
    supportsThinking: false,
    timeout: 60000,
    description: "Powerful model for complex analysis",
    aliases: ["claude-3-opus-latest"],
  },
  "claude-3-sonnet-20240229": {
    modelName: "claude-3-sonnet-20240229",
    friendlyName: "Claude 3 Sonnet",
    contextWindow: 200000,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: false,
    supportsThinking: false,
    timeout: 60000,
    description: "Balanced performance for most tasks",
    aliases: [],
  },
  "claude-3-haiku-20240307": {
    modelName: "claude-3-haiku-20240307",
    friendlyName: "Claude 3 Haiku",
    contextWindow: 200000,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: true,
    supportsWebSearch: false,
    supportsThinking: false,
    timeout: 30000,
    description: "Fast, compact model for simple tasks",
    aliases: [],
  },
};

// Mock Anthropic SDK structure
export const MockAnthropic = vi.fn().mockImplementation(function() {
  return {
    messages: {
      create: vi.fn(),
      stream: vi.fn(),
    },
  };
});

// Create Anthropic-specific mock provider
export function createMockAnthropicProvider(overrides = {}) {
  return createMockProvider({
    name: "anthropic",

    getSupportedModels: vi.fn().mockImplementation(() => ANTHROPIC_MODELS),

    getModelConfig: vi.fn().mockImplementation((modelName) => {
      // Check direct match
      if (ANTHROPIC_MODELS[modelName]) {
        return ANTHROPIC_MODELS[modelName];
      }

      // Check aliases
      for (const model of Object.values(ANTHROPIC_MODELS)) {
        if (model.aliases && model.aliases.includes(modelName)) {
          return model;
        }
      }

      return null;
    }),

    invoke: vi.fn().mockImplementation(async (messages, options = {}) => {
      const modelConfig =
        ANTHROPIC_MODELS[options.model] ||
        ANTHROPIC_MODELS["claude-3-5-sonnet-20241022"];

      // Simulate Anthropic-specific validations
      if (!options.config?.apiKeys?.anthropic) {
        throw new ProviderError(
          "Anthropic API key is required",
          ErrorCodes.MISSING_API_KEY,
        );
      }

      // Simulate image handling for non-vision models
      const hasImages = messages.some(
        (msg) =>
          Array.isArray(msg.content) &&
          msg.content.some((item) => item.type === "image"),
      );

      if (hasImages && !modelConfig.supportsImages) {
        throw new ProviderError(
          `Model ${options.model} does not support images`,
          ErrorCodes.INVALID_REQUEST,
        );
      }

      // Default response
      return new MockResponseBuilder()
        .withContent("Mock Anthropic response")
        .withModel(options.model || "claude-3-5-sonnet-20241022")
        .withProvider("anthropic")
        .withUsage({
          input_tokens: 50,
          output_tokens: 30,
          total_tokens: 80,
        })
        .build();
    }),

    ...overrides,
  });
}

// Export default instance
export const mockAnthropicProvider = createMockAnthropicProvider();

// Mock response generators for Anthropic format
export function createMockAnthropicResponse(
  content = "Test response",
  options = {},
) {
  return {
    id: `msg_${Date.now()}`,
    type: "message",
    role: "assistant",
    model: options.model || "claude-3-5-sonnet-20241022",
    content: [
      {
        type: "text",
        text: content,
      },
    ],
    stop_reason: options.stop_reason || "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: options.input_tokens || 10,
      output_tokens: options.output_tokens || 20,
    },
  };
}

// Mock streaming response generator
export function createMockAnthropicStreamResponse(
  chunks = ["Hello", " world", "!"],
) {
  const events = [];

  // Message start event
  events.push({
    type: "message_start",
    message: {
      id: `msg_${Date.now()}`,
      type: "message",
      role: "assistant",
      model: "claude-3-5-sonnet-20241022",
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: 10,
        output_tokens: 0,
      },
    },
  });

  // Content block start
  events.push({
    type: "content_block_start",
    index: 0,
    content_block: {
      type: "text",
      text: "",
    },
  });

  // Content deltas
  chunks.forEach((chunk) => {
    events.push({
      type: "content_block_delta",
      index: 0,
      delta: {
        type: "text_delta",
        text: chunk,
      },
    });
  });

  // Content block stop
  events.push({
    type: "content_block_stop",
    index: 0,
  });

  // Message delta with final usage
  events.push({
    type: "message_delta",
    delta: {
      stop_reason: "end_turn",
      stop_sequence: null,
    },
    usage: {
      output_tokens: 20,
    },
  });

  // Message stop
  events.push({
    type: "message_stop",
  });

  return events;
}

// Error response generators
export function createMockAnthropicError(
  type = "invalid_api_key",
  message = null,
) {
  const errors = {
    invalid_api_key: {
      type: "authentication_error",
      message: message || "Invalid API key",
    },
    rate_limit: {
      type: "rate_limit_error",
      message: message || "Rate limit exceeded",
    },
    invalid_request: {
      type: "invalid_request_error",
      message: message || "Invalid request",
    },
    overloaded: {
      type: "overloaded_error",
      message: message || "Overloaded",
    },
  };

  const errorData = errors[type] || errors.invalid_api_key;
  const error = new Error(errorData.message);
  error.type = errorData.type;
  error.status =
    type === "invalid_api_key"
      ? 401
      : type === "rate_limit"
        ? 429
        : type === "overloaded"
          ? 529
          : 400;

  return error;
}

// Create a mock Anthropic client with configurable behavior
export function createMockAnthropicClient(behavior = {}) {
  const client = {
    messages: {
      create: vi.fn().mockImplementation(async (params) => {
        if (behavior.throwError) {
          throw createMockAnthropicError(behavior.errorType);
        }

        return createMockAnthropicResponse(
          behavior.content || "Mock response",
          behavior.responseOptions || {},
        );
      }),

      stream: vi.fn().mockImplementation(async (params) => {
        if (behavior.throwError) {
          throw createMockAnthropicError(behavior.errorType);
        }

        const chunks = behavior.chunks || ["Test", " streaming", " response"];
        const events = createMockAnthropicStreamResponse(chunks);

        return {
          async *[Symbol.asyncIterator]() {
            for (const event of events) {
              yield event;
            }
          },
        };
      }),
    },
  };

  return client;
}
