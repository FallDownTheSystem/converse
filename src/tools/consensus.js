/**
 * Consensus Tool
 *
 * Multi-provider parallel execution with response aggregation.
 * Calls all available providers simultaneously and aggregates responses.
 */

import { createToolResponse, createToolError, formatFailureDetails } from './index.js';
import { processUnifiedContext, createFileContext } from '../utils/contextProcessor.js';
import { generateContinuationId, addMessageToHistory } from '../continuationStore.js';
import { debugLog, debugError } from '../utils/console.js';
import { createLogger } from '../utils/logger.js';
import { CONSENSUS_PROMPT } from '../systemPrompts.js';
import { applyTokenLimit, getTokenLimit } from '../utils/tokenLimiter.js';
import { validateAllPaths } from '../utils/fileValidator.js';
import { SummarizationService } from '../services/summarizationService.js';

const logger = createLogger('consensus');

/**
 * Consensus tool implementation
 * @param {object} args - Tool arguments
 * @param {object} dependencies - Injected dependencies (config, providers, continuationStore)
 * @returns {object} MCP tool response
 */
export async function consensusTool(args, dependencies) {
  try {
    const { config, providers, continuationStore, contextProcessor, jobRunner, providerStreamNormalizer } = dependencies;

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
      use_websearch = false,
      async = false
    } = args;

    // Handle async execution mode
    if (async) {
      // Validate async dependencies are available
      if (!jobRunner || !providerStreamNormalizer) {
        return createToolError('Async execution not available - missing async dependencies');
      }

      // Generate continuation ID for background execution result
      const bgContinuationId = continuation_id || generateContinuationId();

      // Create models list for status display
      const modelsList = args.models.join(', ');

      // Generate title early for initial response
      const summarizationService = new SummarizationService(providers, config);
      let title = null;
      try {
        title = await summarizationService.generateTitle(prompt);
        debugLog(`Consensus: Generated title for initial response - "${title}"`);
      } catch (error) {
        debugError('Consensus: Failed to generate title for initial response', error);
        title = prompt.substring(0, 50);
      }

      try {
        // Submit background job
        const jobId = await jobRunner.submit(
          {
            tool: 'consensus',
            sessionId: bgContinuationId, // Use continuation_id as sessionId for consistency
            options: {
              ...args,
              jobId: bgContinuationId, // Use continuation ID as job ID
              models_list: modelsList, // Add models list for status display
              title // Pass the generated title
            }
          },
          async (context) => {
            // Execute consensus in background using stream normalizer
            return await executeConsensusWithStreaming(
              args,
              {
                ...dependencies,
                continuationId: bgContinuationId,
                title // Pass title to execution context
              },
              context
            );
          }
        );

        // Format initial response like check_status output
        const startTime = new Date().toLocaleString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).replace(',', '');

        const statusLine = `⏳ SUBMITTED | CONSENSUS | ${bgContinuationId} | 1/1 | Started: ${startTime} | "${title || 'Processing...'}" | ${modelsList}`;

        // Return formatted response with status line and continuation_id
        return createToolResponse({
          content: `${statusLine}\ncontinuation_id: ${bgContinuationId}`,
          continuation: {
            id: bgContinuationId,  // Use continuation_id as the primary ID
            status: 'processing'
          },
          async_execution: true
        });

      } catch (error) {
        logger.error('Failed to submit async consensus job', { error });
        return createToolError(`Async execution failed: ${error.message}`);
      }
    }

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
      }, { clientCwd: config.server?.client_cwd });
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
    const consensusStartTime = Date.now();
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

    const consensusExecutionTime = (Date.now() - consensusStartTime) / 1000; // Convert to seconds

    // Calculate final success count and collect failure details
    let finalSuccessCount;
    const failureDetails = [];

    if (enable_cross_feedback && refinedPhase) {
      // When cross-feedback is enabled, count only models that succeeded in both phases
      finalSuccessCount = refinedPhase.filter(r => r.status === 'success').length;

      // Collect detailed failure information
      refinedPhase.forEach(result => {
        if (result.status === 'partial') {
          failureDetails.push(`${result.model} (refinement failed)`);
        }
      });

      // Add models that failed in initial phase
      initialPhase.failed.forEach(failure => {
        failureDetails.push(`${failure.model} (initial failed)`);
      });
    } else {
      // When cross-feedback is disabled, count initial successes
      finalSuccessCount = initialPhase.successful.length;

      // Collect initial failure information
      initialPhase.failed.forEach(failure => {
        failureDetails.push(`${failure.model} (${failure.error})`);
      });
    }

    // Create models list string for display
    const modelsList = providerCalls.map(call => call.model).join(', ');


    // Create unified status line (similar to async status display)
    const finalCount = refinedPhase ? refinedPhase.filter(r => r.status === 'success').length : initialPhase.successful.length;
    const totalCount = providerCalls.length;
    const statusLine = config.environment?.nodeEnv !== 'test'
      ? `✅ COMPLETED | CONSENSUS | ${continuationId} | ${consensusExecutionTime.toFixed(1)}s elapsed | ${finalCount}/${totalCount} succeeded | ${modelsList}\n`
      : '';

    // Always include continuation_id line for clarity
    const continuationIdLine = `continuation_id: ${continuationId}\n\n`;

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

    // Add failure details to the response content if there are failures
    let finalContent = limitedResult.content;
    if (failureDetails.length > 0) {
      const failureInfo = formatFailureDetails(failureDetails);
      finalContent = limitedResult.content + failureInfo;
    }

    // Prepend status line and continuation_id line when appropriate
    finalContent = statusLine + continuationIdLine + finalContent;

    // Return with continuation at top level for test compatibility
    return createToolResponse({
      content: finalContent,
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

/**
 * Execute consensus with streaming normalization for async execution
 * @param {object} args - Original consensus arguments
 * @param {object} dependencies - Dependencies with continuationId
 * @param {object} context - Job execution context
 * @returns {Promise<object>} Complete consensus result
 */
async function executeConsensusWithStreaming(args, dependencies, context) {
  const {
    config,
    providers,
    continuationStore,
    contextProcessor,
    providerStreamNormalizer,
    continuationId,
    title: passedTitle // Title passed from initial submission
  } = dependencies;

  const {
    prompt,
    models,
    files = [],
    images = [],
    enable_cross_feedback = true,
    cross_feedback_prompt,
    temperature = 0.2,
    reasoning_effort = 'medium',
    use_websearch = false
  } = args;

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
    const validation = await validateAllPaths({
      files,
      images
    }, { clientCwd: config.server?.client_cwd });
    if (!validation.valid) {
      logger.error('File validation failed', { errors: validation.errors });
      throw new Error(`File validation failed: ${validation.errors.join(', ')}`);
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
        enforceSecurityCheck: false,
        skipSecurityCheck: true,
        clientCwd: config.server?.client_cwd
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
    content: prompt
  };

  // If we have context (files/images), create complex content array
  if (contextMessage && contextMessage.content) {
    userMessage.content = [
      ...contextMessage.content,
      { type: 'text', text: prompt }
    ];
  }

  messages.push(userMessage);

  // Resolve model specifications to provider calls
  const providerCalls = [];
  const failedModels = [];

  // Special handling for single "auto" model - expand to first 3 available providers
  let modelsToProcess = models;
  if (models.length === 1 && models[0].toLowerCase() === 'auto') {
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
      throw new Error('No providers available. Please configure at least one API key.');
    }

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

  // Build provider calls array
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
      model: modelName,
      provider: providerName,
      providerInstance: provider,
      options: {
        temperature,
        reasoning_effort,
        use_websearch,
        signal: context?.signal, // Pass AbortSignal for cancellation support
        config,
        model: resolvedModelName
      }
    });
  }

  if (providerCalls.length === 0) {
    throw new Error(
      `No valid providers available for the specified models. Failed models: ${failedModels.map(f => f.model).join(', ')}`
    );
  }

  // Create models list string for display
  const modelsList = providerCalls.map(call => call.model).join(', ');

  // Initialize SummarizationService
  const summarizationService = new SummarizationService(providers, config);

  // Use passed title or generate if not provided
  let title = passedTitle;
  if (!title) {
    try {
      title = await summarizationService.generateTitle(prompt);
      debugLog(`Consensus: Generated title - "${title}"`);
    } catch (error) {
      debugError('Consensus: Error generating title', error);
      // Continue without title if generation fails
      title = prompt.substring(0, 50);
    }
  } else {
    debugLog(`Consensus: Using passed title - "${title}"`);
  }

  // Update job status for phase 1 with title
  await context.updateJob({
    models_list: modelsList,
    title,
    consensus_progress: `0/${providerCalls.length} initial`,
    progress: {
      phase: 'initial_consensus',
      total_providers: providerCalls.length,
      completed_providers: 0,
      failed_providers: failedModels.length,
      provider_status: {}
    }
  });

  const consensusStartTime = Date.now();

  // Phase 1: Initial parallel provider calls with streaming
  logger.debug('Calling providers in parallel with streaming', { data: { providerCount: providerCalls.length } });

  const initialResults = await executeConsensusPhaseWithStreaming(
    providerCalls,
    messages,
    'initial',
    context,
    providerStreamNormalizer
  );

  // Process initial results
  const initialPhase = {
    successful: [],
    failed: []
  };

  initialResults.forEach((result) => {
    if (result.status === 'success') {
      initialPhase.successful.push(result);
    } else {
      initialPhase.failed.push(result);
    }
  });

  // Add pre-failed models to failed list
  initialPhase.failed.push(...failedModels);

  let refinedPhase = null;

  // Phase 2: Cross-feedback (if enabled and we have multiple successful responses)
  if (enable_cross_feedback && initialPhase.successful.length > 1) {
    logger.debug('Running cross-feedback phase with streaming', { data: { responseCount: initialPhase.successful.length } });

    // Update job status for phase 2
    await context.updateJob({
      progress: {
        phase: 'cross_feedback',
        total_providers: initialPhase.successful.length,
        completed_providers: 0,
        provider_status: {}
      }
    });

    // Create cross-feedback prompt
    const feedbackPrompt = cross_feedback_prompt ||
      `Based on the other AI responses below, please refine your answer to the original question. Consider different perspectives and provide your final response:

Original Question: ${prompt}

Other AI Responses:
${initialPhase.successful.map((r, i) => `${i + 1}. ${r.model}: ${r.response}`).join('\n\n')}

Please provide your refined response:`;

    // Build model-specific feedback calls
    const feedbackCalls = initialPhase.successful.map((initialResult) => {
      const call = providerCalls.find(c => c.model === initialResult.model);

      // Build model-specific feedback messages with the assistant's initial response
      const modelFeedbackMessages = [...messages];
      modelFeedbackMessages.push({
        role: 'assistant',
        content: initialResult.response
      });
      modelFeedbackMessages.push({
        role: 'user',
        content: feedbackPrompt
      });

      return {
        ...call,
        messages: modelFeedbackMessages,
        initialResult
      };
    });

    // Execute refinement phase with streaming
    const refinementResults = await executeConsensusPhaseWithStreaming(
      feedbackCalls,
      null, // messages already embedded in feedbackCalls
      'refinement',
      context,
      providerStreamNormalizer
    );

    // Process refinement results
    refinedPhase = refinementResults.map((result, index) => {
      const initialResult = feedbackCalls[index].initialResult;
      return {
        ...initialResult,
        refined_response: result.status === 'success' ? result.response : null,
        refined_metadata: result.status === 'success' ? result.metadata : {},
        refined_error: result.status === 'failed' ? result.error : null,
        initial_response: initialResult.response,
        status: result.status === 'success' ? 'success' : 'partial'
      };
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

    await continuationStore.set(continuationId, conversationState);
  } catch (error) {
    logger.error('Error saving consensus conversation', { error });
  }

  const consensusExecutionTime = (Date.now() - consensusStartTime) / 1000;

  // Generate final summary from combined responses
  let finalSummary = null;
  const combinedResponses = [];

  // Collect all successful responses for summary generation
  if (refinedPhase) {
    // Use refined responses when available
    refinedPhase.forEach(result => {
      if (result.status === 'success' && result.refined_response) {
        combinedResponses.push(`${result.model}:\n${result.refined_response}`);
      } else if (result.initial_response) {
        // Fall back to initial response if refinement failed
        combinedResponses.push(`${result.model}:\n${result.initial_response}`);
      }
    });
  } else {
    // Use initial responses
    initialPhase.successful.forEach(result => {
      if (result.response) {
        combinedResponses.push(`${result.model}:\n${result.response}`);
      }
    });
  }

  // Generate summary if we have responses
  if (combinedResponses.length > 0) {
    const combinedContent = combinedResponses.join('\n\n---\n\n');
    if (combinedContent.length > 100) {
      try {
        finalSummary = await summarizationService.generateFinalSummary(combinedContent);
        debugLog(`Consensus: Generated final summary - "${finalSummary}"`);

        // Update job with final summary
        await context.updateJob({
          final_summary: finalSummary
        });
      } catch (error) {
        debugError('Consensus: Error generating final summary', error);
        // Continue without summary if generation fails
      }
    }
  }

  // Calculate final success count and collect failure details
  let finalSuccessCount;
  const failureDetails = [];

  if (enable_cross_feedback && refinedPhase) {
    finalSuccessCount = refinedPhase.filter(r => r.status === 'success').length;

    refinedPhase.forEach(result => {
      if (result.status === 'partial') {
        failureDetails.push(`${result.model} (refinement failed)`);
      }
    });

    initialPhase.failed.forEach(failure => {
      failureDetails.push(`${failure.model} (initial failed)`);
    });
  } else {
    finalSuccessCount = initialPhase.successful.length;
    initialPhase.failed.forEach(failure => {
      failureDetails.push(`${failure.model} (${failure.error})`);
    });
  }

  // Return complete consensus result for job completion
  return {
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
    },
    metadata: {
      execution_time: consensusExecutionTime,
      async_execution: true,
      successful_models: finalSuccessCount,
      total_models: models.length,
      failure_details: failureDetails,
      title,
      final_summary: finalSummary
    }
  };
}

/**
 * Execute a consensus phase (initial or refinement) with streaming support
 * @param {Array} providerCalls - Provider calls to execute
 * @param {Array} messages - Messages to send (null if already embedded in calls)
 * @param {string} phase - Phase name ('initial' or 'refinement')
 * @param {object} context - Job execution context
 * @param {object} streamNormalizer - Stream normalizer instance
 * @returns {Promise<Array>} Results from all providers
 */
async function executeConsensusPhaseWithStreaming(providerCalls, messages, phase, context, streamNormalizer) {
  let completedCount = 0;
  const totalCount = providerCalls.length;
  const providerContents = {}; // Store accumulated content per provider

  const results = await Promise.allSettled(
    providerCalls.map(async (call, index) => {
      try {
        // Check for cancellation before starting
        if (context.signal.aborted) {
          throw new Error('Consensus execution was cancelled');
        }

        // Update provider status to 'prompting'
        await context.updateJob({
          progress: {
            [`provider_${index}_status`]: 'prompting',
            [`provider_${index}_model`]: call.model
          }
        });

        const messagesToSend = call.messages || messages;
        let response;

        // Check if provider supports streaming
        if (call.providerInstance.stream && typeof call.providerInstance.stream === 'function') {
          // Use streaming with normalization
          const stream = call.providerInstance.stream(messagesToSend, call.options);
          const normalizedStream = streamNormalizer.normalize(call.provider, stream, {
            model: call.options.model,
            requestId: `${context.jobId}-${phase}-${index}`
          });

          // Process normalized stream
          let accumulatedContent = '';
          let finalUsage = null;
          let finalMetadata = {};

          await context.updateJob({
            progress: { [`provider_${index}_status`]: 'streaming' }
          });

          for await (const event of normalizedStream) {
            if (context.signal.aborted) {
              throw new Error('Consensus execution was cancelled');
            }

            switch (event.type) {
            case 'delta':
              accumulatedContent += event.data.textDelta;
              // Store provider's accumulated content
              providerContents[index] = accumulatedContent;

              // Combine all provider contents for unified accumulated_content
              const combinedContent = Object.values(providerContents)
                .filter(content => content && content.length > 0)
                .join('\n\n---\n\n');

              // Update with both provider preview and combined accumulated content
              await context.updateJob({
                [`provider_${index}_preview`]: accumulatedContent.length > 150
                  ? accumulatedContent.substring(0, 150) + '...'
                  : accumulatedContent,
                accumulated_content: combinedContent // Full combined content from all providers
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
              streaming: true
            }
          };

          // Store final provider content
          providerContents[index] = accumulatedContent;

        } else {
          // Fall back to regular invoke
          response = await call.providerInstance.invoke(messagesToSend, call.options);

          // Store provider content for non-streaming response
          if (response && response.content) {
            providerContents[index] = response.content;

            // Update accumulated content for non-streaming provider
            const combinedContent = Object.values(providerContents)
              .filter(content => content && content.length > 0)
              .join('\n\n---\n\n');

            await context.updateJob({
              accumulated_content: combinedContent
            });
          }
        }

        // Update provider status to 'finished'
        completedCount++;
        const progressText = phase === 'initial'
          ? `${completedCount}/${totalCount} initial`
          : phase === 'refinement'
            ? `${completedCount}/${totalCount} refined`
            : `${completedCount}/${totalCount} responded`;

        await context.updateJob({
          consensus_progress: progressText,
          progress: {
            [`provider_${index}_status`]: 'finished',
            completed_providers: completedCount
          }
        });

        return {
          model: call.model,
          provider: call.provider,
          status: 'success',
          response: response.content,
          metadata: response.metadata || {}
        };

      } catch (error) {
        // Update provider status to 'failed'
        await context.updateJob({
          progress: {
            [`provider_${index}_status`]: 'failed',
            [`provider_${index}_error`]: error.message
          }
        });

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

  // After all providers complete, update with final combined content
  const finalCombinedContent = Object.values(providerContents)
    .filter(content => content && content.length > 0)
    .join('\n\n---\n\n');

  if (finalCombinedContent) {
    await context.updateJob({
      accumulated_content: finalCombinedContent
    });
  }

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        model: providerCalls[index].model,
        provider: providerCalls[index].provider,
        status: 'failed',
        error: result.reason.message || 'Unknown error',
        metadata: {}
      };
    }
  });
}

// Tool metadata
consensusTool.description = 'PARALLEL CONSENSUS WITH CROSS-MODEL FEEDBACK - Query multiple models simultaneously, then optionally refine responses based on cross-feedback. For complex decisions, architectural choices, technical evaluations. Use models: ["auto"] for automatic selection.';
consensusTool.inputSchema = {
  type: 'object',
  properties: {
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
    async: {
      type: 'boolean',
      description: 'Execute consensus in background with detailed progress tracking. When true, returns continuation_id immediately and processes request asynchronously with per-provider status updates. Default: false',
      default: false
    },
    prompt: {
      type: 'string',
      description: 'The problem or proposal to gather consensus on. Include context and specific questions. Example: "Should we use microservices or monolith architecture for our e-commerce platform with 100k users?"',
    },
  },
  required: ['prompt', 'models'],
};
