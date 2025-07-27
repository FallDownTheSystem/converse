/**
 * Chat Tool
 *
 * Single-provider conversational AI with context and continuation support.
 * Handles context processing, provider calls, and state management.
 */

import { createToolResponse, createToolError } from './index.js';
import { processUnifiedContext, createFileContext } from '../utils/contextProcessor.js';
import { generateContinuationId, addMessageToHistory } from '../continuationStore.js';
import { debugLog, debugError } from '../utils/console.js';
import { createLogger } from '../utils/logger.js';
import { CHAT_PROMPT } from '../systemPrompts.js';
import { applyTokenLimit, getTokenLimit } from '../utils/tokenLimiter.js';
import { validateAllPaths } from '../utils/fileValidator.js';

const logger = createLogger('chat');

/**
 * Chat tool implementation
 * @param {object} args - Tool arguments
 * @param {object} dependencies - Injected dependencies (config, providers, continuationStore)
 * @returns {object} MCP tool response
 */
export async function chatTool(args, dependencies) {
  try {
    const { config, providers, continuationStore, contextProcessor } = dependencies;

    // Validate required arguments
    if (!args.prompt || typeof args.prompt !== 'string') {
      return createToolError('Prompt is required and must be a string');
    }

    // Extract and validate arguments
    const {
      prompt,
      model = 'auto',
      files = [],
      continuation_id,
      temperature = 0.5,
      use_websearch = false,
      images = [],
      reasoning_effort = 'medium'
    } = args;

    let conversationHistory = [];
    let continuationId = continuation_id;

    // Load existing conversation if continuation_id provided
    if (continuationId) {
      try {
        const existingState = await continuationStore.get(continuationId);
        if (existingState) {
          conversationHistory = existingState.messages || [];
        } else {
          // Invalid continuation ID - start fresh with new ID
          continuationId = generateContinuationId();
        }
      } catch (error) {
        logger.error('Error loading conversation', { error });
        // Continue with fresh conversation on error
        continuationId = generateContinuationId();
      }
    } else {
      // Generate new continuation ID for new conversation
      continuationId = generateContinuationId();
    }

    // Validate file paths before processing
    if (files.length > 0 || images.length > 0) {
      const validation = await validateAllPaths({ files, images });
      if (!validation.valid) {
        logger.error('File validation failed', { errors: validation.errors });
        return validation.errorResponse;
      }
    }

    // Process context (files, images, web search)
    let contextMessage = null;
    if (files.length > 0 || images.length > 0 || use_websearch) {
      try {
        const contextRequest = {
          files: Array.isArray(files) ? files : [],
          images: Array.isArray(images) ? images : [],
          webSearch: use_websearch ? prompt : null
        };

        const contextResult = await contextProcessor.processUnifiedContext(contextRequest);

        // Create context message from files and images
        const allProcessedFiles = [...contextResult.files, ...contextResult.images];
        if (allProcessedFiles.length > 0) {
          contextMessage = createFileContext(allProcessedFiles, {
            includeMetadata: true,
            includeErrors: true
          });
        }

        // Add web search results if available (placeholder for now)
        if (contextResult.webSearch && !contextResult.webSearch.placeholder) {
          // Future implementation: add web search results to context
          logger.debug('Web search results available but not yet implemented');
        }

      } catch (error) {
        logger.error('Error processing context', { error });
        // Continue without context if processing fails
      }
    }

    // Build message array for provider
    const messages = [];

    // Add system prompt only if not already in conversation history
    if (conversationHistory.length === 0 || conversationHistory[0].role !== 'system') {
      messages.push({
        role: 'system',
        content: CHAT_PROMPT
      });
    }

    // Add conversation history
    messages.push(...conversationHistory);

    // Add user prompt with context
    const userMessage = {
      role: 'user',
      content: prompt // default to simple string content
    };

    // If we have context (files/images), create complex content array
    if (contextMessage && contextMessage.content) {
      // Create complex content array
      userMessage.content = [
        ...contextMessage.content, // Include all file/image parts
        { type: 'text', text: prompt } // Add the user prompt as text
      ];
    }

    messages.push(userMessage);

    // Select provider
    let selectedProvider;
    let providerName;

    if (model === 'auto') {
      // Auto-select first available provider
      const availableProviders = Object.keys(providers).filter(name => {
        const provider = providers[name];
        return provider && provider.isAvailable && provider.isAvailable(config);
      });

      if (availableProviders.length === 0) {
        return createToolError('No providers available. Please configure at least one API key.');
      }

      providerName = availableProviders[0];
      selectedProvider = providers[providerName];
    } else {
      // Use specified provider/model
      // Try to map model to provider
      providerName = mapModelToProvider(model, providers);
      selectedProvider = providers[providerName];

      if (!selectedProvider) {
        return createToolError(`Provider not found for model: ${model}`);
      }

      if (!selectedProvider.isAvailable(config)) {
        return createToolError(`Provider ${providerName} is not available. Check API key configuration.`);
      }
    }

    // Resolve model name and prepare provider options
    const resolvedModel = resolveAutoModel(model, providerName);
    const providerOptions = {
      model: resolvedModel,
      temperature,
      reasoning_effort,
      use_websearch,
      config
    };

    // Call provider
    let response;
    try {
      response = await selectedProvider.invoke(messages, providerOptions);
    } catch (error) {
      logger.error('Provider error', { error, data: { provider: providerName } });
      return createToolError(`Provider error: ${error.message}`);
    }

    // Validate response
    if (!response || !response.content) {
      return createToolError('Provider returned invalid response');
    }

    // Add assistant response to conversation history
    const assistantMessage = {
      role: 'assistant',
      content: response.content
    };

    const updatedMessages = [...messages, assistantMessage];

    // Save conversation state
    try {
      const conversationState = {
        messages: updatedMessages,
        provider: providerName,
        model,
        lastUpdated: Date.now()
      };

      await continuationStore.set(continuationId, conversationState);
    } catch (error) {
      logger.error('Error saving conversation', { error });
      // Continue even if save fails
    }

    // Create response with continuation
    const result = {
      content: response.content,
      continuation: {
        id: continuationId,
        provider: providerName,
        model,
        messageCount: updatedMessages.filter(msg => msg.role !== 'system').length
      }
    };

    // Add metadata if available
    if (response.metadata) {
      result.metadata = response.metadata;
    }

    // Apply token limiting to the final response
    const tokenLimit = getTokenLimit(config);
    const resultStr = JSON.stringify(result, null, 2);
    const limitedResult = applyTokenLimit(resultStr, tokenLimit);

    // Parse the limited result back to object format to preserve structure
    let finalResult;
    try {
      finalResult = JSON.parse(limitedResult.content);
    } catch (e) {
      // Fallback if parsing fails - return original result
      finalResult = result;
    }

    return createToolResponse(finalResult);

  } catch (error) {
    logger.error('Chat tool error', { error });
    return createToolError('Chat tool failed', error);
  }
}

/**
 * Map model name to provider name
 * @param {string} model - Model name
 * @returns {string} Provider name
 */
/**
 * Resolve "auto" model to default model for the provider
 */
function resolveAutoModel(model, providerName) {
  if (model.toLowerCase() !== 'auto') {
    return model;
  }

  const defaults = {
    'openai': 'o3',
    'xai': 'grok-4-0709',
    'google': 'gemini-2.5-pro',
    'anthropic': 'claude-sonnet-4-20250514',
    'mistral': 'magistral-medium-2506',
    'deepseek': 'deepseek-reasoner',
    'openrouter': 'qwen/qwen3-coder'
  };

  return defaults[providerName] || 'gpt-4o-mini';
}

function mapModelToProvider(model, providers) {
  const modelLower = model.toLowerCase();

  // Handle "auto" - default to OpenAI
  if (modelLower === 'auto') {
    return 'openai';
  }

  // Check OpenRouter-specific patterns first
  if (modelLower === 'openrouter auto' || modelLower === 'auto router' ||
      modelLower === 'auto-router' || modelLower === 'openrouter-auto') {
    return 'openrouter';
  }

  // If model contains "/", check if native provider supports it
  if (modelLower.includes('/')) {
    // Check each provider to see if they have this exact model
    for (const [providerName, provider] of Object.entries(providers)) {
      if (provider && provider.getModelConfig) {
        const modelConfig = provider.getModelConfig(model);
        if (modelConfig && !modelConfig.isDynamic && !modelConfig.needsApiUpdate) {
          // Model exists in this provider's static list
          return providerName;
        }
      }
    }
    // No native provider has this model, route to OpenRouter
    return 'openrouter';
  }

  // For non-slash models, use keyword matching as before
  
  // OpenAI models
  if (modelLower.includes('gpt') || modelLower.includes('o1') ||
      modelLower.includes('o3') || modelLower.includes('o4')) {
    return 'openai';
  }

  // XAI models
  if (modelLower.includes('grok')) {
    return 'xai';
  }

  // Google models
  if (modelLower.includes('gemini') || modelLower.includes('flash') ||
      modelLower.includes('pro') || modelLower === 'google') {
    return 'google';
  }

  // Anthropic models
  if (modelLower.includes('claude') || modelLower.includes('opus') ||
      modelLower.includes('sonnet') || modelLower.includes('haiku')) {
    return 'anthropic';
  }

  // Mistral models
  if (modelLower.includes('mistral') || modelLower.includes('magistral')) {
    return 'mistral';
  }

  // DeepSeek models
  if (modelLower.includes('deepseek') || modelLower === 'reasoner' ||
      modelLower === 'r1' || modelLower === 'chat') {
    return 'deepseek';
  }

  // OpenRouter models (specific model patterns)
  if (modelLower.includes('qwen') || modelLower.includes('kimi') ||
      modelLower.includes('moonshot') || modelLower === 'k2') {
    return 'openrouter';
  }

  // Default fallback
  return 'openai';
}

// Tool metadata
chatTool.description = 'GENERAL CHAT & COLLABORATIVE THINKING - For development assistance, brainstorming, and code analysis. Supports files, images, and conversation continuation.';
chatTool.inputSchema = {
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      description: 'Your question or topic with relevant context. More detail enables better responses. Example: "How should I structure the authentication module for this Express.js API?"',
    },
    model: {
      type: 'string',
      description: 'AI model to use. Examples: "auto" (recommended), "gemini-2.5-flash", "o3", "grok-4-0709". Defaults to auto-selection.',
    },
    files: {
      type: 'array',
      items: { type: 'string' },
      description: 'File paths to include as context (absolute paths required). Example: ["/path/to/src/auth.js", "/path/to/config.json"]',
    },
    images: {
      type: 'array',
      items: { type: 'string' },
      description: 'Image paths for visual context (absolute paths or base64 data). Example: ["/path/to/diagram.png", "data:image/jpeg;base64,/9j/4AAQ..."]',
    },
    continuation_id: {
      type: 'string',
      description: 'Continuation ID for persistent conversation. Example: "chat_1703123456789_abc123"',
    },
    temperature: {
      type: 'number',
      description: 'Response randomness (0.0-1.0). Examples: 0.2 (focused), 0.5 (balanced), 0.8 (creative). Default: 0.5',
      minimum: 0.0,
      maximum: 1.0,
      default: 0.5
    },
    reasoning_effort: {
      type: 'string',
      enum: ['minimal', 'low', 'medium', 'high', 'max'],
      description: 'Reasoning depth for thinking models. Examples: "minimal" (quick), "medium" (balanced), "high" (complex analysis). Default: "medium"',
      default: 'medium'
    },
    use_websearch: {
      type: 'boolean',
      description: 'Enable web search for current information and best practices. Example: true for framework documentation, false for private code analysis. Default: false',
      default: false
    },
  },
  required: ['prompt'],
};
