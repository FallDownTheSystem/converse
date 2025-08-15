/**
 * Consensus Tool
 *
 * Multi-provider parallel execution with response aggregation.
 * Calls all available providers simultaneously and aggregates responses.
 */

import { createToolResponse, createToolError } from './index.js';
import { processUnifiedContext, createFileContext } from '../utils/contextProcessor.js';
import { generateContinuationId, addMessageToHistory } from '../continuationStore.js';
import { debugLog, debugError } from '../utils/console.js';
import { createLogger } from '../utils/logger.js';
import { CONSENSUS_PROMPT } from '../systemPrompts.js';
import { applyTokenLimit, getTokenLimit } from '../utils/tokenLimiter.js';
import { validateAllPaths } from '../utils/fileValidator.js';

const logger = createLogger('consensus');

/**
 * Consensus tool implementation
 * @param {object} args - Tool arguments
 * @param {object} dependencies - Injected dependencies (config, providers, continuationStore)
 * @returns {object} MCP tool response
 */
export async function consensusTool(args, dependencies) {
  try {
    const { config, providers, continuationStore, contextProcessor } = dependencies;

    // Validate required arguments
    if (!args.prompt || typeof args.prompt !== 'string') {
      return createToolError('Prompt is required and must be a string');
    }

    if (!args.models || !Array.isArray(args.models) || args.models.length === 0) {
      return createToolError('Models array is required and must contain at least one model');
    }

    // Extract and validate arguments
    const {
      prompt,
      models,
      files = [],
      images = [],
      continuation_id,
      enable_cross_feedback = true,
      cross_feedback_prompt,
      temperature = 0.2,
      reasoning_effort = 'medium',
      use_websearch = false
    } = args;

    let conversationHistory = [];
    let continuationId = continuation_id;

    // Load existing conversation if continuation_id provided
    if (continuationId) {
      try {
        const existingState = await dependencies.continuationStore.get(continuationId);
        if (existingState) {
          conversationHistory = existingState.messages || [];
        } else {
          // Invalid continuation ID - start fresh
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
      const validation = await validateAllPaths({
        files,
        images
      });
      if (!validation.valid) {
        logger.error('File validation failed', { errors: validation.errors });
        return validation.errorResponse;
      }
    }

    // Process context (files and images)
    let contextMessage = null;
    if (files.length > 0 || images.length > 0) {
      try {
        const contextRequest = {
          files: Array.isArray(files) ? files : [],
          images: Array.isArray(images) ? images : []
        };

        const contextResult = await contextProcessor.processUnifiedContext(contextRequest, {
          enforceSecurityCheck: false,  // Allow files from any location
          skipSecurityCheck: true,       // Legacy flag for backward compatibility
          clientCwd: config.server?.client_cwd  // Use auto-detected client working directory
        });

        // Create context message from files and images
        const allProcessedFiles = [...contextResult.files, ...contextResult.images];
        if (allProcessedFiles.length > 0) {
          contextMessage = createFileContext(allProcessedFiles, {
            includeMetadata: true,
            includeErrors: true
          });
        }

      } catch (error) {
        logger.error('Error processing context', { error });
        // Continue without context if processing fails
      }
    }

    // Build message array for providers
    const messages = [];

    // Add system prompt
    messages.push({
      role: 'system',
      content: CONSENSUS_PROMPT
    });

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

    // Resolve model specifications to provider calls
    const providerCalls = [];
    const failedModels = [];

    // Special handling for single "auto" model - expand to first 3 available providers
    let modelsToProcess = models;
    if (models.length === 1 && models[0].toLowerCase() === 'auto') {
      // Find first 3 available providers
      const availableProviders = [];
      const providerOrder = ['openai', 'google', 'xai', 'anthropic', 'mistral', 'deepseek', 'openrouter'];
      
      for (const providerName of providerOrder) {
        if (availableProviders.length >= 3) break;
        const provider = providers[providerName];
        if (provider && provider.isAvailable(config)) {
          availableProviders.push(providerName);
        }
      }
      
      if (availableProviders.length === 0) {
        return createToolError('No providers available. Please configure at least one API key.');
      }
      
      // Create model names for each available provider with their default model
      modelsToProcess = availableProviders.map(providerName => 
        getDefaultModelForProvider(providerName)
      );
      
      logger.debug('Auto-expanded to providers', { 
        data: { 
          providers: availableProviders,
          models: modelsToProcess
        } 
      });
    }

    for (const modelName of modelsToProcess) {
      if (!modelName || typeof modelName !== 'string') {
        failedModels.push({
          model: modelName || 'unknown',
          error: 'Invalid model specification',
          status: 'failed'
        });
        continue;
      }
      const providerName = mapModelToProvider(modelName, providers);
      const resolvedModelName = resolveAutoModel(modelName, providerName);
      const provider = providers[providerName];

      if (!provider) {
        failedModels.push({
          model: modelName,
          provider: providerName,
          error: `Provider not found: ${providerName}`,
          status: 'failed'
        });
        continue;
      }

      if (!provider.isAvailable(config)) {
        failedModels.push({
          model: modelName,
          provider: providerName,
          error: `Provider ${providerName} not available (check API key)`,
          status: 'failed'
        });
        continue;
      }

      providerCalls.push({
        model: modelName, // Keep original model name for display
        provider: providerName,
        providerInstance: provider,
        options: {
          temperature,
          reasoning_effort,
          use_websearch,
          config,
          model: resolvedModelName // Use resolved model name for API call
        }
      });
    }

    if (providerCalls.length === 0) {
      return createToolError(
        `No valid providers available for the specified models. Failed models: ${failedModels.map(f => f.model).join(', ')}`
      );
    }

    // Phase 1: Initial parallel provider calls
    logger.debug('Calling providers in parallel', { data: { providerCount: providerCalls.length } });
    const initialResults = await Promise.allSettled(
      providerCalls.map(async (call) => {
        try {
          const response = await call.providerInstance.invoke(messages, call.options);
          return {
            model: call.model,
            provider: call.provider,
            status: 'success',
            response: response.content,
            metadata: response.metadata || {}
          };
        } catch (error) {
          return {
            model: call.model,
            provider: call.provider,
            status: 'failed',
            error: error.message,
            metadata: {}
          };
        }
      })
    );

    // Process initial results
    const initialPhase = {
      successful: [],
      failed: []
    };

    initialResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        if (result.value.status === 'success') {
          initialPhase.successful.push(result.value);
        } else {
          initialPhase.failed.push(result.value);
        }
      } else {
        initialPhase.failed.push({
          model: providerCalls[index].model,
          provider: providerCalls[index].provider,
          status: 'failed',
          error: result.reason.message || 'Unknown error',
          metadata: {}
        });
      }
    });

    // Add pre-failed models to failed list
    initialPhase.failed.push(...failedModels);

    let refinedPhase = null;

    // Phase 2: Cross-feedback (if enabled and we have multiple successful responses)
    if (enable_cross_feedback && initialPhase.successful.length > 1) {
      logger.debug('Running cross-feedback phase', { data: { responseCount: initialPhase.successful.length } });

      // Create cross-feedback prompt
      const feedbackPrompt = cross_feedback_prompt ||
        `Based on the other AI responses below, please refine your answer to the original question. Consider different perspectives and provide your final response:

Original Question: ${prompt}

Other AI Responses:
${initialPhase.successful.map((r, i) => `${i + 1}. ${r.model}: ${r.response}`).join('\n\n')}

Please provide your refined response:`;

      // Build feedback messages - need to add the assistant's initial response first
      const feedbackMessages = [...messages];

      // Run refinement calls in parallel
      const refinementResults = await Promise.allSettled(
        initialPhase.successful.map(async (initialResult) => {
          try {
            const call = providerCalls.find(c => c.model === initialResult.model);
            
            // Build model-specific feedback messages with the assistant's initial response
            const modelFeedbackMessages = [...messages];
            // Add the assistant's initial response
            modelFeedbackMessages.push({
              role: 'assistant',
              content: initialResult.response
            });
            // Now add the feedback prompt
            modelFeedbackMessages.push({
              role: 'user',
              content: feedbackPrompt
            });
            
            const response = await call.providerInstance.invoke(modelFeedbackMessages, call.options);

            return {
              ...initialResult,
              refined_response: response.content,
              refined_metadata: response.metadata || {},
              initial_response: initialResult.response,
              status: 'success'
            };
          } catch (error) {
            return {
              ...initialResult,
              refined_response: null,
              refined_error: error.message,
              initial_response: initialResult.response,
              status: 'partial' // Had initial success but refinement failed
            };
          }
        })
      );

      // Process refinement results
      refinedPhase = [];
      refinementResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          refinedPhase.push(result.value);
        } else {
          // This shouldn't happen with our error handling, but just in case
          const originalResult = result.value || {};
          refinedPhase.push({
            ...originalResult,
            refined_response: null,
            refined_error: 'Refinement phase failed unexpectedly',
            status: 'partial'
          });
        }
      });
    }

    // Save conversation state
    try {
      const consensusMessage = {
        role: 'assistant',
        content: `Consensus completed with ${initialPhase.successful.length} successful responses` +
                (refinedPhase ? ` and ${refinedPhase.filter(r => r.status === 'success').length} refined responses` : '')
      };

      const conversationState = {
        messages: [...messages, consensusMessage],
        type: 'consensus',
        lastUpdated: Date.now(),
        consensusData: {
          modelsRequested: models.length,
          providersSuccessful: initialPhase.successful.length,
          providersFailed: initialPhase.failed.length,
          crossFeedbackEnabled: enable_cross_feedback
        }
      };

      await dependencies.continuationStore.set(continuationId, conversationState);
    } catch (error) {
      logger.error('Error saving consensus conversation', { error });
      // Continue even if save fails
    }

    // Build result object keeping backward compatibility but removing rawResponse
    const result = {
      status: 'consensus_complete',
      models_consulted: models.length,
      successful_initial_responses: initialPhase.successful.length,
      failed_responses: initialPhase.failed.length,
      refined_responses: refinedPhase ? refinedPhase.filter(r => r.status === 'success').length : 0,
      phases: {
        initial: initialPhase.successful,
        ...(refinedPhase !== null && { refined: refinedPhase }),
        failed: initialPhase.failed
      },
      continuation: {
        id: continuationId,
        messageCount: messages.length + 1
      },
      settings: {
        enable_cross_feedback,
        temperature,
        models_requested: models
      }
    };

    // Apply token limiting to the final response
    const tokenLimit = getTokenLimit(config);
    const resultStr = JSON.stringify(result, null, 2);
    const limitedResult = applyTokenLimit(resultStr, tokenLimit);

    // Return with continuation at top level for test compatibility
    return createToolResponse({
      content: limitedResult.content,
      continuation: {
        id: continuationId,
        messageCount: messages.length + 1
      }
    });

  } catch (error) {
    logger.error('Consensus tool error', { error });
    return createToolError('Consensus tool failed', error);
  }
}

/**
 * Map model name to provider name (same as chat tool)
 * @param {string} model - Model name
 * @returns {string} Provider name
 */
/**
 * Get default model for a provider
 */
function getDefaultModelForProvider(providerName) {
  const defaults = {
    'openai': 'gpt-5',
    'xai': 'grok-4-0709',
    'google': 'gemini-2.5-pro',
    'anthropic': 'claude-sonnet-4-20250514',
    'mistral': 'magistral-medium-2506',
    'deepseek': 'deepseek-reasoner',
    'openrouter': 'qwen/qwen3-coder'
  };

  return defaults[providerName] || 'gpt-5';
}

/**
 * Resolve "auto" model to default model for the provider
 */
function resolveAutoModel(model, providerName) {
  if (model.toLowerCase() !== 'auto') {
    return model;
  }

  return getDefaultModelForProvider(providerName);
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
consensusTool.description = 'PARALLEL CONSENSUS WITH CROSS-MODEL FEEDBACK - Gathers perspectives from multiple AI models simultaneously. Models provide initial responses, then optionally refine based on others\' insights. Returns both phases in a single call. Handles partial failures gracefully. For: complex decisions, architectural choices, technical evaluations. Use models: ["auto"] for automatic model selection.';
consensusTool.inputSchema = {
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      description: 'The problem or proposal to gather consensus on. Include context and specific questions. Example: "Should we use microservices or monolith architecture for our e-commerce platform with 100k users?"',
    },
    models: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      description: 'List of models to consult. Example: ["gpt-5", "gemini-2.5-pro", "grok-4-0709"]',
    },
    files: {
      type: 'array',
      items: { type: 'string' },
      description: 'File paths for additional context (absolute or relative paths). Example: ["C:\\Users\\username\\project\\architecture.md", "./requirements.txt"]',
    },
    images: {
      type: 'array',
      items: { type: 'string' },
      description: 'Image paths for visual context (absolute or relative paths, or base64). Example: ["C:\\Users\\username\\current_architecture.png", "./user_flow.jpg"]',
    },
    continuation_id: {
      type: 'string',
      description: 'Thread continuation ID for multi-turn conversations. Example: "consensus_1703123456789_xyz789"',
    },
    enable_cross_feedback: {
      type: 'boolean',
      description: 'Enable refinement phase where models see others\' responses and can improve their answers. Example: true (recommended), false (faster single-phase only). Default: true',
      default: true,
    },
    cross_feedback_prompt: {
      type: 'string',
      description: 'Custom prompt for refinement phase. Example: "Focus on scalability trade-offs in your refinement" or leave empty for default cross-feedback prompt',
    },
    temperature: {
      type: 'number',
      description: 'Response randomness (0.0-1.0). Examples: 0.1 (very focused), 0.2 (analytical - default), 0.5 (balanced). Default: 0.2',
      minimum: 0.0,
      maximum: 1.0,
      default: 0.2,
    },
    reasoning_effort: {
      type: 'string',
      enum: ['minimal', 'low', 'medium', 'high', 'max'],
      description: 'Reasoning depth for thinking models. Examples: "low" (light analysis), "medium" (balanced), "high" (complex analysis). Default: "medium"',
      default: 'medium'
    },
    use_websearch: {
      type: 'boolean',
      description: 'Enable web search for current information. Only works with models that support web search (OpenAI, XAI, Google). Example: true for recent developments or up to date documentation. Default: false',
      default: false
    },
  },
  required: ['prompt', 'models'],
};
