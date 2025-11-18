/**
 * Chat Tool
 *
 * Single-provider conversational AI with context and continuation support.
 * Handles context processing, provider calls, and state management.
 */

import { createToolResponse, createToolError } from './index.js';
import {
  processUnifiedContext,
  createFileContext,
} from '../utils/contextProcessor.js';
import {
  generateContinuationId,
  addMessageToHistory,
} from '../continuationStore.js';
import { debugLog, debugError } from '../utils/console.js';
import { createLogger } from '../utils/logger.js';
import { CHAT_PROMPT } from '../systemPrompts.js';
import { applyTokenLimit, getTokenLimit } from '../utils/tokenLimiter.js';
import { validateAllPaths } from '../utils/fileValidator.js';
import { SummarizationService } from '../services/summarizationService.js';

const logger = createLogger('chat');

/**
 * Chat tool implementation
 * @param {object} args - Tool arguments
 * @param {object} dependencies - Injected dependencies (config, providers, continuationStore)
 * @returns {object} MCP tool response
 */
export async function chatTool(args, dependencies) {
  try {
    const {
      config,
      providers,
      continuationStore,
      contextProcessor,
      jobRunner,
      providerStreamNormalizer,
    } = dependencies;

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
      reasoning_effort = 'medium',
      verbosity = 'medium',
      async = false,
    } = args;

    // Handle async execution mode
    if (async) {
      // Validate async dependencies are available
      if (!jobRunner || !providerStreamNormalizer) {
        return createToolError(
          'Async execution not available - missing async dependencies',
        );
      }

      // Generate or use existing continuation ID for the conversation
      const conversationContinuationId =
        continuation_id || generateContinuationId();

      // Get provider and model info for the job
      const providerName = mapModelToProvider(args.model || 'auto', providers);
      const resolvedModel =
        providers[providerName]?.resolveModel?.(args.model) ||
        args.model ||
        'auto';

      // Generate title early for initial response
      const summarizationService = new SummarizationService(providers, config);
      let title = null;
      try {
        title = await summarizationService.generateTitle(prompt);
        debugLog(`Chat: Generated title for initial response - "${title}"`);
      } catch (error) {
        debugError(
          'Chat: Failed to generate title for initial response',
          error,
        );
        title = prompt.substring(0, 50);
      }

      try {
        // Submit background job using continuation_id as the job identifier
        const jobId = await jobRunner.submit(
          {
            tool: 'chat',
            sessionId: 'local-user', // Use standard session ID
            options: {
              ...args,
              jobId: conversationContinuationId, // Use continuation_id as job ID
              continuation_id: conversationContinuationId, // Pass the conversation continuation ID
              provider: providerName, // Add provider info for status display
              model: resolvedModel, // Add resolved model info for status display
              title, // Pass the generated title
            },
          },
          async (context) => {
            // Execute chat in background using stream normalizer
            return await executeChatWithStreaming(
              args,
              {
                ...dependencies,
                continuationId: conversationContinuationId,
                title, // Pass title to execution context
              },
              context,
            );
          },
        );

        // Format initial response like check_status output
        const startTime = new Date()
          .toLocaleString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          })
          .replace(',', '');

        const statusLine = `⏳ SUBMITTED | CHAT | ${conversationContinuationId} | 1/1 | Started: ${startTime} | "${title || 'Processing...'}" | ${providerName}/${resolvedModel}`;

        // Return formatted response with status line and continuation_id
        return createToolResponse({
          content: `${statusLine}\ncontinuation_id: ${conversationContinuationId}`,
          continuation: {
            id: conversationContinuationId, // Use continuation_id as the primary ID
            status: 'processing',
          },
          async_execution: true,
        });
      } catch (error) {
        logger.error('Failed to submit async chat job', { error });
        return createToolError(`Async execution failed: ${error.message}`);
      }
    }

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
      const validation = await validateAllPaths(
        { files, images },
        { clientCwd: config.server?.client_cwd },
      );
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
          webSearch: use_websearch ? prompt : null,
        };

        const contextResult = await contextProcessor.processUnifiedContext(
          contextRequest,
          {
            enforceSecurityCheck: false, // Allow files from any location
            skipSecurityCheck: true, // Legacy flag for backward compatibility
            clientCwd: config.server?.client_cwd, // Use auto-detected client working directory
          },
        );

        // Create context message from files and images
        const allProcessedFiles = [
          ...contextResult.files,
          ...contextResult.images,
        ];
        if (allProcessedFiles.length > 0) {
          contextMessage = createFileContext(allProcessedFiles, {
            includeMetadata: true,
            includeErrors: true,
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
    if (
      conversationHistory.length === 0 ||
      conversationHistory[0].role !== 'system'
    ) {
      messages.push({
        role: 'system',
        content: CHAT_PROMPT,
      });
    }

    // Add conversation history
    messages.push(...conversationHistory);

    // Add user prompt with context
    const userMessage = {
      role: 'user',
      content: prompt, // default to simple string content
    };

    // If we have context (files/images), create complex content array
    if (contextMessage && contextMessage.content) {
      // Create complex content array
      userMessage.content = [
        ...contextMessage.content, // Include all file/image parts
        { type: 'text', text: prompt }, // Add the user prompt as text
      ];
    }

    messages.push(userMessage);

    // Select provider
    let selectedProvider;
    let providerName;

    if (model === 'auto') {
      // Auto-select first available provider
      const availableProviders = Object.keys(providers).filter((name) => {
        const provider = providers[name];
        return provider && provider.isAvailable && provider.isAvailable(config);
      });

      if (availableProviders.length === 0) {
        return createToolError(
          'No providers available. Please configure at least one API key.',
        );
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
        return createToolError(
          `Provider ${providerName} is not available. Check API key configuration.`,
        );
      }
    }

    // Resolve model name and prepare provider options
    const resolvedModel = resolveAutoModel(model, providerName);
    const providerOptions = {
      model: resolvedModel,
      temperature,
      reasoning_effort,
      verbosity,
      use_websearch,
      config,
      continuation_id, // Pass for thread resumption
      continuationStore, // Pass store for state management
    };

    // Call provider
    let response;
    const startTime = Date.now();
    try {
      response = await selectedProvider.invoke(messages, providerOptions);
    } catch (error) {
      logger.error('Provider error', {
        error,
        data: { provider: providerName },
      });
      return createToolError(`Provider error: ${error.message}`);
    }
    const executionTime = (Date.now() - startTime) / 1000; // Convert to seconds

    // Validate response
    if (!response || !response.content) {
      return createToolError('Provider returned invalid response');
    }

    // Add assistant response to conversation history
    const assistantMessage = {
      role: 'assistant',
      content: response.content,
    };

    const updatedMessages = [...messages, assistantMessage];

    // Save conversation state
    try {
      const conversationState = {
        messages: updatedMessages,
        provider: providerName,
        model,
        lastUpdated: Date.now(),
        // Store Codex thread ID if available (for thread resumption)
        codexThreadId: response.metadata?.threadId,
      };

      await continuationStore.set(continuationId, conversationState);
    } catch (error) {
      logger.error('Error saving conversation', { error });
      // Continue even if save fails
    }

    // Create unified status line (similar to async status display)
    const statusLine =
      config.environment?.nodeEnv !== 'test'
        ? `✅ COMPLETED | CHAT | ${continuationId} | ${executionTime.toFixed(1)}s elapsed | ${providerName}/${resolvedModel}\n`
        : '';

    // Always include continuation_id line for clarity
    const continuationIdLine = `continuation_id: ${continuationId}\n\n`;

    const result = {
      content: statusLine + continuationIdLine + response.content,
      continuation: {
        id: continuationId,
        provider: providerName,
        model,
        messageCount: updatedMessages.filter((msg) => msg.role !== 'system')
          .length,
      },
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
    openai: 'gpt-5',
    xai: 'grok-4-0709',
    google: 'gemini-2.5-pro',
    anthropic: 'claude-sonnet-4-20250514',
    mistral: 'magistral-medium-2506',
    deepseek: 'deepseek-reasoner',
    openrouter: 'qwen/qwen3-coder',
  };

  return defaults[providerName] || 'gpt-5';
}

export function mapModelToProvider(model, providers) {
  const modelLower = model.toLowerCase();

  // Handle "auto" - default to OpenAI
  if (modelLower === 'auto') {
    return 'openai';
  }

  // Check Codex (exact match only - don't route "gpt-5-codex" etc to Codex provider)
  if (modelLower === 'codex') {
    return 'codex';
  }

  // Check OpenRouter-specific patterns first
  if (
    modelLower === 'openrouter auto' ||
    modelLower === 'auto router' ||
    modelLower === 'auto-router' ||
    modelLower === 'openrouter-auto'
  ) {
    return 'openrouter';
  }

  // If model contains "/", check if native provider supports it
  if (modelLower.includes('/')) {
    // Check each provider to see if they have this exact model
    for (const [providerName, provider] of Object.entries(providers)) {
      if (provider && provider.getModelConfig) {
        const modelConfig = provider.getModelConfig(model);
        if (
          modelConfig &&
          !modelConfig.isDynamic &&
          !modelConfig.needsApiUpdate
        ) {
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
  if (
    modelLower.includes('gpt') ||
    modelLower.includes('o1') ||
    modelLower.includes('o3') ||
    modelLower.includes('o4')
  ) {
    return 'openai';
  }

  // XAI models
  if (modelLower.includes('grok')) {
    return 'xai';
  }

  // Google models
  if (
    modelLower.includes('gemini') ||
    modelLower.includes('flash') ||
    modelLower.includes('pro') ||
    modelLower === 'google'
  ) {
    return 'google';
  }

  // Anthropic models
  if (
    modelLower.includes('claude') ||
    modelLower.includes('opus') ||
    modelLower.includes('sonnet') ||
    modelLower.includes('haiku')
  ) {
    return 'anthropic';
  }

  // Mistral models
  if (modelLower.includes('mistral') || modelLower.includes('magistral')) {
    return 'mistral';
  }

  // DeepSeek models
  if (
    modelLower.includes('deepseek') ||
    modelLower === 'reasoner' ||
    modelLower === 'r1' ||
    modelLower === 'chat'
  ) {
    return 'deepseek';
  }

  // OpenRouter models (specific model patterns)
  if (
    modelLower.includes('qwen') ||
    modelLower.includes('kimi') ||
    modelLower.includes('moonshot') ||
    modelLower === 'k2'
  ) {
    return 'openrouter';
  }

  // Default fallback
  return 'openai';
}

/**
 * Execute chat with streaming normalization for async execution
 * @param {object} args - Original chat arguments
 * @param {object} dependencies - Dependencies with continuationId
 * @param {object} context - Job execution context
 * @returns {Promise<object>} Complete chat result
 */
async function executeChatWithStreaming(args, dependencies, context) {
  const {
    config,
    providers,
    continuationStore,
    contextProcessor,
    providerStreamNormalizer,
    continuationId,
    title: passedTitle, // Title passed from initial submission
  } = dependencies;

  const {
    prompt,
    model = 'auto',
    files = [],
    temperature = 0.5,
    use_websearch = false,
    images = [],
    reasoning_effort = 'medium',
    verbosity = 'medium',
  } = args;

  // Initialize SummarizationService
  const summarizationService = new SummarizationService(providers, config);

  // Use passed title or generate if not provided
  let title = passedTitle;
  if (!title) {
    try {
      title = await summarizationService.generateTitle(prompt);
      debugLog(`Chat: Generated title - "${title}"`);
    } catch (error) {
      debugError('Chat: Failed to generate title', error);
      // Continue without title if generation fails
    }
  } else {
    debugLog(`Chat: Using passed title - "${title}"`);
  }

  let conversationHistory = [];

  // Load existing conversation if continuation_id provided
  if (continuationId) {
    try {
      const existingState = await continuationStore.get(continuationId);
      if (existingState) {
        conversationHistory = existingState.messages || [];
      }
    } catch (error) {
      logger.error('Error loading conversation', { error });
      // Continue with fresh conversation on error
    }
  }

  // Validate file paths before processing
  if (files.length > 0 || images.length > 0) {
    const validation = await validateAllPaths(
      { files, images },
      { clientCwd: config.server?.client_cwd },
    );
    if (!validation.valid) {
      logger.error('File validation failed', { errors: validation.errors });
      throw new Error(
        `File validation failed: ${validation.errors.join(', ')}`,
      );
    }
  }

  // Process context (files, images, web search)
  let contextMessage = null;
  if (files.length > 0 || images.length > 0 || use_websearch) {
    try {
      const contextRequest = {
        files: Array.isArray(files) ? files : [],
        images: Array.isArray(images) ? images : [],
        webSearch: use_websearch ? prompt : null,
      };

      const contextResult = await contextProcessor.processUnifiedContext(
        contextRequest,
        {
          enforceSecurityCheck: false,
          skipSecurityCheck: true,
          clientCwd: config.server?.client_cwd,
        },
      );

      // Create context message from files and images
      const allProcessedFiles = [
        ...contextResult.files,
        ...contextResult.images,
      ];
      if (allProcessedFiles.length > 0) {
        contextMessage = createFileContext(allProcessedFiles, {
          includeMetadata: true,
          includeErrors: true,
        });
      }
    } catch (error) {
      logger.error('Error processing context', { error });
      // Continue without context if processing fails
    }
  }

  // Build message array for provider
  const messages = [];

  // Add system prompt only if not already in conversation history
  if (
    conversationHistory.length === 0 ||
    conversationHistory[0].role !== 'system'
  ) {
    messages.push({
      role: 'system',
      content: CHAT_PROMPT,
    });
  }

  // Add conversation history
  messages.push(...conversationHistory);

  // Add user prompt with context
  const userMessage = {
    role: 'user',
    content: prompt,
  };

  // If we have context (files/images), create complex content array
  if (contextMessage && contextMessage.content) {
    userMessage.content = [
      ...contextMessage.content,
      { type: 'text', text: prompt },
    ];
  }

  messages.push(userMessage);

  // Select provider
  let selectedProvider;
  let providerName;

  if (model === 'auto') {
    // Auto-select first available provider
    const availableProviders = Object.keys(providers).filter((name) => {
      const provider = providers[name];
      return provider && provider.isAvailable && provider.isAvailable(config);
    });

    if (availableProviders.length === 0) {
      throw new Error(
        'No providers available. Please configure at least one API key.',
      );
    }

    providerName = availableProviders[0];
    selectedProvider = providers[providerName];
  } else {
    // Use specified provider/model
    providerName = mapModelToProvider(model, providers);
    selectedProvider = providers[providerName];

    if (!selectedProvider) {
      throw new Error(`Provider not found for model: ${model}`);
    }

    if (!selectedProvider.isAvailable(config)) {
      throw new Error(
        `Provider ${providerName} is not available. Check API key configuration.`,
      );
    }
  }

  // Resolve model name and prepare provider options
  const resolvedModel = resolveAutoModel(model, providerName);
  const providerOptions = {
    model: resolvedModel,
    temperature,
    reasoning_effort,
    verbosity,
    use_websearch,
    config,
    continuation_id: continuationId, // Pass for thread resumption
    continuationStore, // Pass store for state management
  };

  // For streaming, add the stream flag and signal separately
  const streamingOptions = {
    ...providerOptions,
    stream: true,
    signal: context?.signal, // Pass AbortSignal for cancellation support
  };

  // Check if provider supports streaming (by checking if invoke can return a stream)
  let response;
  const startTime = Date.now();

  // Always use streaming for async execution in background
  if (context?.jobId) {
    // Use streaming with normalization
    debugLog(`Chat: Using streaming for provider ${providerName}`);

    const stream = await selectedProvider.invoke(messages, streamingOptions);
    const normalizedStream = providerStreamNormalizer.normalize(
      providerName,
      stream,
      {
        model: resolvedModel,
        requestId: context.jobId,
      },
    );

    // Process normalized stream and build final response
    let accumulatedContent = '';
    let finalUsage = null;
    let finalMetadata = {};

    for await (const event of normalizedStream) {
      // Check for cancellation
      if (context.signal.aborted) {
        throw new Error('Chat execution was cancelled');
      }

      switch (event.type) {
      case 'start':
        // Update job with streaming started status, provider info, and title
        await context.updateJob({
          status: 'running',
          provider: providerName,
          model: resolvedModel,
          title: title || undefined, // Include title if generated
          progress: {
            phase: 'streaming_started',
            provider: providerName,
            model: resolvedModel,
          },
        });
        break;

      case 'delta':
        accumulatedContent += event.data.textDelta;
        // Update job with progress and full accumulated content
        await context.updateJob({
          accumulated_content: accumulatedContent, // Store full content
          progress: {
            phase: 'streaming',
            provider: providerName,
            model: resolvedModel,
            content_length: accumulatedContent.length,
          },
        });
        break;

      case 'reasoning_summary':
        // Update job with reasoning summary
        debugLog(
          `[Chat] *** UPDATING JOB WITH REASONING: "${event.data.content?.substring(0, 100)}..."`,
        );
        await context.updateJob({
          reasoning_summary: event.data.content,
        });
        break;

      case 'usage':
        finalUsage = event.data.usage;
        break;

      case 'end':
        accumulatedContent = event.data.content || accumulatedContent;
        finalUsage = event.data.usage || finalUsage;
        finalMetadata = event.data.metadata || finalMetadata;
        break;

      case 'error':
        throw new Error(`Streaming error: ${event.data.error.message}`);
      }
    }

    response = {
      content: accumulatedContent,
      metadata: {
        ...finalMetadata,
        usage: finalUsage,
        streaming: true,
      },
    };
  } else {
    // Fall back to regular invoke
    debugLog(`Chat: Using regular invoke for provider ${providerName}`);
    response = await selectedProvider.invoke(messages, providerOptions);
  }

  const executionTime = (Date.now() - startTime) / 1000;

  // Validate response
  if (!response || !response.content) {
    throw new Error('Provider returned invalid response');
  }

  // Store reasoning summary from OpenAI if available
  if (
    response.metadata?.usage?.reasoning_summary &&
    context &&
    context.updateJob
  ) {
    try {
      await context.updateJob({
        reasoning_summary: response.metadata.usage.reasoning_summary,
      });
      debugLog('Chat: Stored reasoning summary');
    } catch (error) {
      debugError('Chat: Failed to store reasoning summary', error);
    }
  }

  // Generate final summary for responses longer than 100 characters (non-blocking)
  let finalSummary = null;
  if (response.content && response.content.length > 100) {
    try {
      finalSummary = await summarizationService.generateFinalSummary(
        response.content,
      );
      debugLog(`Chat: Generated final summary - "${finalSummary}"`);
      // Store final summary in job
      if (finalSummary && context && context.updateJob) {
        await context.updateJob({
          final_summary: finalSummary,
        });
      }
    } catch (error) {
      debugError('Chat: Failed to generate final summary', error);
      // Continue without summary if generation fails
    }
  }

  // Add assistant response to conversation history
  const assistantMessage = {
    role: 'assistant',
    content: response.content,
  };

  const updatedMessages = [...messages, assistantMessage];

  // Save conversation state
  try {
    const conversationState = {
      messages: updatedMessages,
      provider: providerName,
      model,
      lastUpdated: Date.now(),
      // Store Codex thread ID if available (for thread resumption)
      codexThreadId: response.metadata?.threadId,
    };

    await continuationStore.set(continuationId, conversationState);
  } catch (error) {
    logger.error('Error saving conversation', { error });
    // Continue even if save fails
  }

  // Return complete result for job completion
  return {
    content: response.content,
    title: title || undefined, // Include title if generated
    summary: finalSummary || undefined, // Include summary if generated
    continuation: {
      id: continuationId,
      provider: providerName,
      model,
      messageCount: updatedMessages.filter((msg) => msg.role !== 'system')
        .length,
    },
    metadata: {
      provider: providerName,
      model: resolvedModel,
      execution_time: executionTime,
      async_execution: true,
      ...response.metadata,
    },
  };
}

// Tool metadata
chatTool.description =
  'GENERAL CHAT & COLLABORATIVE THINKING - Development assistance, brainstorming, code analysis. Supports files, images, continuation_id for multi-turn conversations. Use model: "auto" for automatic selection.';
chatTool.inputSchema = {
  type: 'object',
  properties: {
    model: {
      type: 'string',
      description:
        'AI model to use. Examples: "auto" (recommended), "gpt-5", "gemini-2.5-pro", "grok-4-0709". Defaults to auto-selection.',
    },
    files: {
      type: 'array',
      items: { type: 'string' },
      description:
        'File paths to include as context (absolute or relative paths). Example: ["C:\\Users\\username\\project\\src\\auth.js", "./config.json"]',
    },
    images: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Image paths for visual context (absolute or relative paths, or base64 data). Example: ["C:\\Users\\username\\diagram.png", "./screenshot.jpg", "data:image/jpeg;base64,/9j/4AAQ..."]',
    },
    continuation_id: {
      type: 'string',
      description:
        'Continuation ID for persistent conversation. Example: "chat_1703123456789_abc123"',
    },
    temperature: {
      type: 'number',
      description:
        'Response randomness (0.0-1.0). Examples: 0.2 (focused), 0.5 (balanced), 0.8 (creative). Default: 0.5',
      minimum: 0.0,
      maximum: 1.0,
      default: 0.5,
    },
    reasoning_effort: {
      type: 'string',
      enum: ['none', 'minimal', 'low', 'medium', 'high', 'max'],
      description:
        'Reasoning depth for thinking models. Examples: "none" (no reasoning, fastest - GPT-5.1+ only), "minimal" (few reasoning tokens), "low" (light analysis), "medium" (balanced), "high" (complex analysis). Default: "medium"',
      default: 'medium',
    },
    verbosity: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
      description:
        'Output verbosity for GPT-5 models. Examples: "low" (concise answers), "medium" (balanced), "high" (thorough explanations). Default: "medium"',
      default: 'medium',
    },
    use_websearch: {
      type: 'boolean',
      description:
        'Enable web search for current information. Example: true for recent developments or up to date documentation. Default: false',
      default: false,
    },
    async: {
      type: 'boolean',
      description:
        'Execute chat in background. When true, returns continuation_id immediately and processes request asynchronously. Default: false',
      default: false,
    },
    prompt: {
      type: 'string',
      description:
        'Your question or topic with relevant context. More detail enables better responses. Example: "How should I structure the authentication module for this Express.js API?"',
    },
  },
  required: ['prompt'],
};
