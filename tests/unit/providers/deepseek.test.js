/**
 * DeepSeek Provider Tests
 *
 * Tests the DeepSeek provider implementation (OpenAI-compatible).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCodes, StopReasons } from "../../../src/providers/interface.js";

// Mock the OpenAI module
const mockCreate = vi.fn();

vi.mock("openai", () => {
  const mockOpenAI = vi.fn(function () {
    return {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    };
  });

  return {
    default: mockOpenAI,
  };
});

// Import provider AFTER setting up the mock
import { deepseekProvider } from "../../../src/providers/deepseek.js";

describe("DeepSeek Provider", () => {
  let mockConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockClear();

    mockConfig = {
      apiKeys: {
        deepseek: "test-deepseek-api-key-1234567890abcdefghijklmnopqrstuvwxyz",
      },
    };
  });

  describe("Configuration", () => {
    it("should validate configuration with valid API key", () => {
      expect(deepseekProvider.validateConfig(mockConfig)).toBe(true);
    });

    it("should reject configuration without API key", () => {
      expect(deepseekProvider.validateConfig({})).toBe(false);
      expect(deepseekProvider.validateConfig({ apiKeys: {} })).toBe(false);
    });

    it("should reject configuration with invalid API key format", () => {
      const invalidConfigs = [
        { apiKeys: { deepseek: "" } },
        { apiKeys: { deepseek: "short-key" } },
        { apiKeys: { deepseek: 123 } },
      ];

      invalidConfigs.forEach((config) => {
        expect(deepseekProvider.validateConfig(config)).toBe(false);
      });
    });

    it("should check availability same as config validation", () => {
      expect(deepseekProvider.isAvailable(mockConfig)).toBe(true);
      expect(deepseekProvider.isAvailable({})).toBe(false);
    });
  });

  describe("Model Management", () => {
    it("should return supported models", () => {
      const models = deepseekProvider.getSupportedModels();

      expect(models).toBeDefined();
      expect(Object.keys(models).length).toBeGreaterThan(0);

      // Check for expected models
      expect(models["deepseek-chat"]).toBeDefined();
      expect(models["deepseek-reasoner"]).toBeDefined();
    });

    it("should get model config by exact name", () => {
      const config = deepseekProvider.getModelConfig("deepseek-chat");

      expect(config).toBeDefined();
      expect(config.modelName).toBe("deepseek-chat");
      expect(config.contextWindow).toBe(128000);
      expect(config.maxOutputTokens).toBe(8000);
      expect(config.supportsImages).toBe(false);
    });

    it("should get model config by alias", () => {
      const config = deepseekProvider.getModelConfig("deepseek");

      expect(config).toBeDefined();
      expect(config.modelName).toBe("deepseek-chat");
    });

    it("should handle case-insensitive model names", () => {
      const config = deepseekProvider.getModelConfig("DEEPSEEK-CHAT");

      expect(config).toBeDefined();
      expect(config.modelName).toBe("deepseek-chat");
    });

    it("should return null for unknown model", () => {
      const config = deepseekProvider.getModelConfig("unknown-model");
      expect(config).toBeNull();
    });
  });

  describe("Message Invocation", () => {
    let mockResponse;

    beforeEach(() => {
      mockResponse = {
        id: "chatcmpl-test123",
        object: "chat.completion",
        created: 1234567890,
        model: "deepseek-chat",
        system_fingerprint: "fp_test123",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Test response",
            },
            finish_reason: "stop",
            logprobs: null,
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);
    });

    it("should invoke with basic messages", async () => {
      const messages = [{ role: "user", content: "Hello" }];

      const result = await deepseekProvider.invoke(messages, {
        config: mockConfig,
      });

      // Verify that the mock was called (OpenAI client is created internally)

      expect(mockCreate).toHaveBeenCalled();
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages).toEqual(messages);
      expect(callArgs.model).toBe("deepseek-chat");

      expect(result).toMatchObject({
        content: "Test response",
        stop_reason: StopReasons.STOP,
        metadata: {
          model: "deepseek-chat",
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            total_tokens: 30,
          },
          provider: "deepseek",
          system_fingerprint: "fp_test123",
        },
      });
    });

    it("should handle custom parameters", async () => {
      const messages = [{ role: "user", content: "Write code" }];

      await deepseekProvider.invoke(messages, {
        model: "deepseek-coder",
        temperature: 0.2,
        maxTokens: 2000,
        config: mockConfig,
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.model).toBe("deepseek-coder");
      expect(callArgs.temperature).toBe(0.2);
      expect(callArgs.max_tokens).toBe(2000);
      expect(callArgs.top_p).toBe(0.95); // Default from provider
    });

    it("should cap max tokens to model limit", async () => {
      const messages = [{ role: "user", content: "Hello" }];

      await deepseekProvider.invoke(messages, {
        model: "deepseek-chat",
        maxTokens: 10000,
        config: mockConfig,
      });

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.max_tokens).toBe(8000); // Model's max
    });

    it("should reject image content since DeepSeek does not support images", async () => {
      const messages = [
        {
          role: "user",
          content: [
            { type: "text", text: "What is this?" },
            {
              type: "image",
              source: {
                media_type: "image/jpeg",
                data: "base64data",
              },
            },
          ],
        },
      ];

      await expect(
        deepseekProvider.invoke(messages, {
          config: mockConfig,
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.INVALID_REQUEST,
        message: expect.stringContaining("does not support images"),
      });
    });
  });

  describe("Stop Reason Mapping", () => {
    const testCases = [
      ["stop", StopReasons.STOP],
      ["length", StopReasons.LENGTH],
      ["content_filter", StopReasons.CONTENT_FILTER],
      ["function_call", StopReasons.TOOL_USE],
      ["tool_calls", StopReasons.TOOL_USE],
    ];

    testCases.forEach(([openaiReason, expectedReason]) => {
      it(`should map finish_reason "${openaiReason}" to "${expectedReason}"`, async () => {
        mockCreate.mockResolvedValue({
          choices: [
            {
              message: { content: "Test", role: "assistant" },
              finish_reason: openaiReason,
            },
          ],
          usage: {},
          model: "deepseek-chat",
        });

        const result = await deepseekProvider.invoke(
          [{ role: "user", content: "Hello" }],
          { config: mockConfig },
        );

        expect(result.stop_reason).toBe(expectedReason);
      });
    });

    it("should map unknown stop reason to OTHER", async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { content: "Test", role: "assistant" },
            finish_reason: "unknown_reason",
          },
        ],
        usage: {},
        model: "deepseek-chat",
      });

      const result = await deepseekProvider.invoke(
        [{ role: "user", content: "Hello" }],
        { config: mockConfig },
      );

      expect(result.stop_reason).toBe(StopReasons.OTHER);
    });
  });

  describe("Error Handling", () => {
    it("should handle missing API key", async () => {
      await expect(
        deepseekProvider.invoke([{ role: "user", content: "Hello" }], {
          config: {},
        }),
      ).rejects.toThrow("DeepSeek API key not configured");
    });

    it("should handle API errors", async () => {
      const errorCases = [
        {
          status: 401,
          data: { error: { message: "Invalid API key" } },
          expectedCode: ErrorCodes.INVALID_API_KEY,
          expectedMessage: "Invalid DeepSeek API key",
        },
        {
          status: 429,
          data: { error: { message: "Rate limit exceeded" } },
          expectedCode: ErrorCodes.RATE_LIMIT_EXCEEDED,
          expectedMessage: "rate limit exceeded",
        },
        {
          status: 403,
          data: { error: { message: "Quota exceeded" } },
          expectedCode: ErrorCodes.QUOTA_EXCEEDED,
          expectedMessage: "quota exceeded",
        },
      ];

      for (const {
        status,
        data,
        expectedCode,
        expectedMessage,
      } of errorCases) {
        mockCreate.mockRejectedValueOnce({
          response: { status, data },
        });

        await expect(
          deepseekProvider.invoke([{ role: "user", content: "Hello" }], {
            config: mockConfig,
          }),
        ).rejects.toMatchObject({
          code: expectedCode,
          message: expect.stringContaining(expectedMessage),
        });
      }
    });

    it("should handle model not found errors", async () => {
      mockCreate.mockRejectedValue({
        response: {
          status: 404,
          data: { error: { message: "Model unknown-model not found" } },
        },
      });

      await expect(
        deepseekProvider.invoke([{ role: "user", content: "Hello" }], {
          model: "unknown-model",
          config: mockConfig,
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.MODEL_NOT_FOUND,
        message: expect.stringContaining("Model unknown-model not found"),
      });
    });

    it("should handle context length errors", async () => {
      mockCreate.mockRejectedValue({
        response: {
          status: 400,
          data: { error: { message: "Context length exceeded" } },
        },
      });

      await expect(
        deepseekProvider.invoke([{ role: "user", content: "Hello" }], {
          config: mockConfig,
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.CONTEXT_LENGTH_EXCEEDED,
        message: "Context length exceeded for model",
      });
    });

    it("should handle no response choice", async () => {
      mockCreate.mockResolvedValue({
        choices: [],
        usage: {},
      });

      await expect(
        deepseekProvider.invoke([{ role: "user", content: "Hello" }], {
          config: mockConfig,
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.NO_RESPONSE_CHOICE,
        message: "No response choice received",
      });
    });

    it("should handle no response content", async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: { role: "assistant" },
            finish_reason: "stop",
          },
        ],
        usage: {},
      });

      await expect(
        deepseekProvider.invoke([{ role: "user", content: "Hello" }], {
          config: mockConfig,
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.NO_RESPONSE_CONTENT,
        message: "No content in response",
      });
    });

    it.skip("should handle retry on specific errors", async () => {
      // First call fails with retryable error
      mockCreate.mockRejectedValueOnce({
        response: { status: 500 },
      });

      // Second call succeeds
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: { content: "Success after retry", role: "assistant" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
        model: "deepseek-chat",
      });

      const result = await deepseekProvider.invoke(
        [{ role: "user", content: "Hello" }],
        { config: mockConfig },
      );

      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(result.content).toBe("Success after retry");
    });
  });
});
