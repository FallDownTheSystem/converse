/**
 * Conversation Tool
 *
 * Turn-based multi-model round-table. Models respond SEQUENTIALLY in the order
 * given; each model sees the full running transcript (prior laps + earlier turns
 * in the current lap) and builds on it. One tool call runs exactly one lap (one
 * turn per model); the caller drives more laps by passing back the continuation_id.
 *
 * This is a sibling of consensus.js (parallel fan-out). It reuses the same
 * infrastructure (context processing, model routing, custom-ID handling, async
 * streaming, summarization, token limiting, export) but replaces the parallel
 * two-phase core with a sequential lap loop.
 *
 * CRITICAL provider constraint: SDK providers (codex, claude, copilot) reduce the
 * message array to ONLY the last `user` message. Therefore each turn's entire
 * context (prior-lap transcript + lap prompt + same-lap turns + framing) is packed
 * into a SINGLE self-contained final user message ("turn packet"). Do not spread
 * turn context across multiple messages.
 */

import {
  createToolResponse,
  createToolError,
  formatFailureDetails,
} from './index.js';
import {
  createFileContext,
} from '../utils/contextProcessor.js';
import {
  generateContinuationId,
  isValidContinuationId,
} from '../continuationStore.js';
import { isSafeIdSegment } from '../utils/idValidation.js';
import { debugLog, debugError } from '../utils/console.js';
import { createLogger } from '../utils/logger.js';
import { CONVERSATION_PROMPT } from '../systemPrompts.js';
import { applyTokenLimit, getTokenLimit } from '../utils/tokenLimiter.js';
import { validateAllPaths } from '../utils/fileValidator.js';
import { SummarizationService } from '../services/summarizationService.js';
import { exportConversation } from '../utils/conversationExporter.js';
import {
  mapModelToProvider,
  resolveAutoModel,
  getDefaultModelForProvider,
} from '../utils/modelRouting.js';

const logger = createLogger('conversation');

/**
 * Render the stored transcript (from prior laps) into labeled text that can be
 * embedded in the next turn's packet. Stored state pairs user (lap prompt) and
 * assistant (lap transcript) messages; we re-render those as readable context so
 * last-user-only SDK providers still see the history (and so a provider does not
 * mistake prior multi-speaker transcript for its own previous output).
 * @param {Array} storedMessages - Stored messages from a prior conversation state
 * @returns {string} Labeled prior-transcript text ('' for a new conversation)
 */
function renderStoredTranscriptToText(storedMessages = []) {
  if (!Array.isArray(storedMessages) || storedMessages.length === 0) {
    return '';
  }

  const blocks = [];
  let lapNumber = 0;
  let pendingPrompt = null;

  const toText = (content) => {
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      // Complex content array (files/images + text) — extract text parts only
      return content
        .filter((part) => part && part.type === 'text' && part.text)
        .map((part) => part.text)
        .join('\n');
    }
    return '';
  };

  for (const message of storedMessages) {
    if (!message || message.role === 'system') {
      continue;
    }
    if (message.role === 'user') {
      pendingPrompt = toText(message.content);
    } else if (message.role === 'assistant') {
      lapNumber += 1;
      const promptText = pendingPrompt ? `${pendingPrompt}\n\n` : '';
      const assistantText = toText(message.content);
      blocks.push(
        `## Earlier in this round-table (lap ${lapNumber}):\n${promptText}${assistantText}`,
      );
      pendingPrompt = null;
    }
  }

  return blocks.join('\n\n');
}

/**
 * Build the per-turn framing text for the model at position `i`.
 * @param {object} params
 * @returns {string} Framing text appended to the turn packet
 */
function buildFramingText({ i, models, turn_prompt }) {
  const total = models.length;
  const selfModel = models[i];
  const prevModel = i > 0 ? models[i - 1] : null;
  const nextModel = i < total - 1 ? models[i + 1] : null;

  const order = models.join(', ');
  const prevText = prevModel || 'no one (you open the round)';
  const nextText = nextModel || 'no one (you close this round)';
  const handoffText = nextModel
    ? `Your response will be passed to the next participant (${nextModel}).`
    : 'Your response will be returned to the user, as you are the last participant this round.';

  const lines = [
    `You are participant "${selfModel}" in a multi-model round-table conversation.`,
    `Participants, in speaking order: ${order}.`,
    `You are speaking in position ${i + 1} of ${total}, after ${prevText}, before ${nextText}.`,
    'The original topic/prompt for this round is shown above, followed by any responses already given this round.',
    'Respond to the whole conversation so far — build on, challenge, or refine what others have said; do not merely repeat them.',
    handoffText,
  ];

  if (turn_prompt && typeof turn_prompt === 'string' && turn_prompt.trim()) {
    lines.push(turn_prompt.trim());
  }

  return lines.join('\n');
}

/**
 * Build the single self-contained turn packet TEXT for the model at position `i`.
 * Order: prior-transcript section, lap prompt, same-lap turns, framing.
 * This is the LAST user message — the only thing last-user-only SDK providers see.
 * @param {object} params
 * @returns {string} Turn packet text
 */
function buildTurnPacket({
  priorTranscriptText,
  prompt,
  sameLapTurns,
  i,
  models,
  turn_prompt,
}) {
  const parts = [];

  if (priorTranscriptText && priorTranscriptText.trim()) {
    parts.push(priorTranscriptText.trim());
  }

  parts.push(`Original topic for this round:\n${prompt}`);

  // Same-lap turns from models 0..i-1 (omitted for the opener, i=0)
  if (i > 0 && sameLapTurns.length > 0) {
    const turnBlocks = sameLapTurns.map((turn) => {
      if (turn.status === 'success') {
        return `### ${turn.model} said:\n${turn.response}`;
      }
      return `### ${turn.model} did not respond (error: ${turn.error})`;
    });
    parts.push(turnBlocks.join('\n\n'));
  }

  parts.push(buildFramingText({ i, models, turn_prompt }));

  return parts.join('\n\n');
}

/**
 * Format the full lap transcript for storage/display.
 * @param {Array} lapTurns - Turns from the current lap
 * @returns {string} Formatted transcript
 */
function formatLapTranscript(lapTurns) {
  let content = '';
  let successful = 0;

  lapTurns.forEach((turn, index) => {
    if (turn.status === 'success') {
      successful += 1;
      content += `### ${turn.model} (turn ${index + 1}):\n${turn.response}\n\n---\n\n`;
    } else {
      content += `### ${turn.model} (turn ${index + 1}, did not respond):\nError: ${turn.error}\n\n---\n\n`;
    }
  });

  content += `\n**Summary:** Conversation lap completed with ${successful}/${lapTurns.length} successful turns.`;
  return content;
}

/**
 * Resolve the ordered model list into a turn plan. Unlike consensus, unknown or
 * unavailable models are NOT dropped — they are recorded with a preFailReason so
 * they keep their position in the order (and produce a failed turn).
 * @param {Array<string>} models - Ordered model list
 * @param {object} providers - Provider instances
 * @param {object} config - Configuration
 * @returns {Array<object>} Ordered turn plan entries
 */
function resolveTurnPlan(models, providers, config) {
  // Single "auto" expands to the first available provider's default model only
  // (a single-model round-table is valid). Multiple explicit models resolve per-entry.
  let modelsToProcess = models;
  if (models.length === 1 && String(models[0]).toLowerCase() === 'auto') {
    const providerOrder = [
      'codex',
      'gemini-cli',
      'claude',
      'copilot',
      'openai',
      'google',
      'xai',
      'anthropic',
      'mistral',
      'deepseek',
      'openrouter',
    ];

    let firstAvailable = null;
    for (const providerName of providerOrder) {
      const provider = providers[providerName];
      if (provider && provider.isAvailable(config)) {
        firstAvailable = providerName;
        break;
      }
    }

    // If a provider is available, use its default model. Otherwise keep "auto"
    // so it resolves to a turn that fails cleanly (all-fail laps must complete).
    modelsToProcess = firstAvailable
      ? [getDefaultModelForProvider(firstAvailable)]
      : ['auto'];
  }

  return modelsToProcess.map((modelName) => {
    if (!modelName || typeof modelName !== 'string') {
      return {
        model: modelName || 'unknown',
        provider: null,
        providerInstance: null,
        resolvedModel: null,
        preFailReason: 'Invalid model specification',
      };
    }

    const providerName = mapModelToProvider(modelName, providers);
    const resolvedModel = resolveAutoModel(modelName, providerName);
    const provider = providers[providerName];

    if (!provider) {
      return {
        model: modelName,
        provider: providerName,
        providerInstance: null,
        resolvedModel,
        preFailReason: `Provider not found: ${providerName}`,
      };
    }

    if (!provider.isAvailable(config)) {
      return {
        model: modelName,
        provider: providerName,
        providerInstance: null,
        resolvedModel,
        preFailReason: `Provider ${providerName} not available (check API key)`,
      };
    }

    return {
      model: modelName,
      provider: providerName,
      providerInstance: provider,
      resolvedModel,
      preFailReason: null,
    };
  });
}

/**
 * Process files/images into a context message (shared sync + async helper).
 * @returns {Promise<object|null>} Context message or null
 */
async function buildContextMessage(files, images, contextProcessor, config) {
  if (files.length === 0 && images.length === 0) {
    return null;
  }

  try {
    const contextRequest = {
      files: Array.isArray(files) ? files : [],
      images: Array.isArray(images) ? images : [],
    };

    const contextResult = await contextProcessor.processUnifiedContext(
      contextRequest,
      {
        enforceSecurityCheck: false,
        skipSecurityCheck: true,
        clientCwd: config.server?.client_cwd,
      },
    );

    const allProcessedFiles = [
      ...contextResult.files,
      ...contextResult.images,
    ];
    if (allProcessedFiles.length > 0) {
      return createFileContext(allProcessedFiles, {
        includeMetadata: true,
        includeErrors: true,
      });
    }
  } catch (error) {
    logger.error('Error processing context', { error });
    // Continue without context if processing fails
  }

  return null;
}

/**
 * Build the final user message content for a turn. Files/images are attached to
 * THIS message so multimodal providers see them, with the packet text appended.
 * @returns {string|Array} User message content
 */
function buildTurnUserContent(packetText, contextMessage) {
  if (contextMessage && contextMessage.content) {
    return [...contextMessage.content, { type: 'text', text: packetText }];
  }
  return packetText;
}

/**
 * Build the persisted conversation state for a completed lap. Mirrors consensus's
 * `[...messages, assistantMessage]` shape: one system message at index 0 (added
 * for a fresh conversation), accumulating user (lap prompt) / assistant (lap
 * transcript) pairs.
 * @returns {object} Conversation state to persist
 */
function buildConversationState(
  priorMessages,
  lapUserMessage,
  assistantMessage,
  models,
  turnsSuccessful,
  turnsFailed,
) {
  // priorMessages is the loaded stored history (may include a leading system msg).
  const hasSystem =
    priorMessages.length > 0 && priorMessages[0].role === 'system';

  const baseMessages = hasSystem
    ? priorMessages
    : [{ role: 'system', content: CONVERSATION_PROMPT }, ...priorMessages];

  return {
    messages: [...baseMessages, lapUserMessage, assistantMessage],
    type: 'conversation',
    lastUpdated: Date.now(),
    conversationData: {
      modelsOrdered: models,
      turnsSuccessful,
      turnsFailed,
    },
  };
}

/**
 * Conversation tool implementation
 * @param {object} args - Tool arguments
 * @param {object} dependencies - Injected dependencies
 * @returns {object} MCP tool response
 */
export async function conversationTool(args, dependencies) {
  try {
    const {
      config,
      providers,
      continuationStore,
      contextProcessor,
      jobRunner,
      providerStreamNormalizer,
      signal,
    } = dependencies;

    // Validate required arguments
    if (
      !args.prompt ||
      typeof args.prompt !== 'string' ||
      !args.prompt.trim()
    ) {
      return createToolError('Prompt is required and must be a string');
    }

    if (
      !args.models ||
      !Array.isArray(args.models) ||
      args.models.length === 0
    ) {
      return createToolError(
        'Models array is required and must contain at least one model',
      );
    }

    // Extract and validate arguments
    const {
      prompt,
      models,
      files = [],
      images = [],
      continuation_id,
      temperature = 0.2,
      reasoning_effort = 'medium',
      use_websearch = false,
      async = false,
      export: shouldExport = false,
      turn_prompt,
    } = args;

    // Handle async execution mode
    if (async) {
      if (!jobRunner || !providerStreamNormalizer) {
        return createToolError(
          'Async execution not available - missing async dependencies',
        );
      }

      // Validate custom continuation ID for async safety (used as path segment)
      if (continuation_id && !isSafeIdSegment(continuation_id)) {
        return createToolError(
          `Invalid continuation_id for async mode: "${continuation_id}". Async IDs must contain only letters, numbers, hyphens, and underscores (max 128 chars).`,
        );
      }

      const bgContinuationId = continuation_id || generateContinuationId();

      // Determine if this is a custom ID (non-standard format AND not found in store)
      let isCustomId = false;
      if (continuation_id && !isValidContinuationId(continuation_id)) {
        try {
          const existing = await continuationStore.get(continuation_id);
          isCustomId = !existing;
        } catch {
          isCustomId = true;
        }
      }

      const modelsList = args.models.join(', ');

      // Generate title early for initial response
      const summarizationService = new SummarizationService(providers, config);
      let title = null;
      try {
        title = await summarizationService.generateTitle(prompt);
        debugLog(
          `Conversation: Generated title for initial response - "${title}"`,
        );
      } catch (error) {
        debugError(
          'Conversation: Failed to generate title for initial response',
          error,
        );
        title = prompt.substring(0, 50);
      }

      try {
        await jobRunner.submit(
          {
            tool: 'conversation',
            sessionId: bgContinuationId,
            options: {
              ...args,
              jobId: bgContinuationId,
              models_list: modelsList,
              title,
            },
          },
          async (context) => {
            return await executeConversationWithStreaming(
              args,
              {
                ...dependencies,
                continuationId: bgContinuationId,
                isCustomId,
                title,
              },
              context,
            );
          },
        );

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

        const statusLine = `⏳ SUBMITTED | CONVERSATION | ${bgContinuationId} | 1/1 | Started: ${startTime} | "${title || 'Processing...'}" | ${modelsList}`;

        return createToolResponse({
          content: `${statusLine}\ncontinuation_id: ${bgContinuationId}`,
          continuation: {
            id: bgContinuationId,
            status: 'processing',
            ...(isCustomId && { custom_id: true }),
          },
          async_execution: true,
        });
      } catch (error) {
        logger.error('Failed to submit async conversation job', { error });
        return createToolError(`Async execution failed: ${error.message}`);
      }
    }

    // --- Synchronous path ---

    let conversationHistory = [];
    let continuationId = continuation_id;
    let isCustomId = false;

    // Load existing conversation if continuation_id provided
    if (continuationId) {
      try {
        const existingState = await continuationStore.get(continuationId);
        if (existingState) {
          conversationHistory = existingState.messages || [];
        } else {
          // Preserve user-provided ID and start fresh conversation
          isCustomId = !isValidContinuationId(continuationId);
        }
      } catch (error) {
        logger.error('Error loading conversation', { error });
        isCustomId = !isValidContinuationId(continuationId);
      }
    } else {
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

    const contextMessage = await buildContextMessage(
      files,
      images,
      contextProcessor,
      config,
    );

    // Re-render prior stored laps into labeled text for the turn packets
    const priorTranscriptText = renderStoredTranscriptToText(
      conversationHistory,
    );

    // Resolve ordered turn plan (unavailable models kept as pre-failed turns)
    const turnPlan = resolveTurnPlan(models, providers, config);

    const startedAt = Date.now();
    const lapTurns = [];

    // Sequential lap loop: one turn per model, in order
    for (let i = 0; i < turnPlan.length; i++) {
      // Honor cancellation between turns
      if (signal?.aborted) {
        logger.debug('Conversation tool cancelled by client mid-lap');
        return createToolError('Conversation request cancelled');
      }

      const plan = turnPlan[i];

      if (plan.preFailReason) {
        lapTurns.push({
          model: plan.model,
          provider: plan.provider,
          status: 'failed',
          error: plan.preFailReason,
          position: i,
        });
        continue;
      }

      const packetText = buildTurnPacket({
        priorTranscriptText,
        prompt,
        sameLapTurns: lapTurns,
        i,
        models,
        turn_prompt,
      });

      const finalUserContent = buildTurnUserContent(packetText, contextMessage);

      const messages = [
        { role: 'system', content: CONVERSATION_PROMPT },
        { role: 'user', content: finalUserContent },
      ];

      try {
        const response = await plan.providerInstance.invoke(messages, {
          temperature,
          reasoning_effort,
          use_websearch,
          signal,
          config,
          model: plan.resolvedModel,
        });

        lapTurns.push({
          model: plan.model,
          provider: plan.provider,
          status: 'success',
          response: response.content,
          metadata: response.metadata || {},
          position: i,
        });
      } catch (error) {
        if (signal?.aborted || error.name === 'AbortError') {
          logger.debug('Conversation tool cancelled during turn');
          return createToolError('Conversation request cancelled');
        }
        lapTurns.push({
          model: plan.model,
          provider: plan.provider,
          status: 'failed',
          error: error.message,
          position: i,
        });
      }
    }

    const turnsSuccessful = lapTurns.filter(
      (t) => t.status === 'success',
    ).length;
    const turnsFailed = lapTurns.length - turnsSuccessful;

    // Build the lap user message (lap prompt, with context if present)
    const lapUserMessage = {
      role: 'user',
      content: buildTurnUserContent(prompt, contextMessage),
    };

    // Labeled lap transcript (### <model> (turn <n>):) — computed once and reused
    // for the assistant message, the persisted state, and the response content.
    const transcript = formatLapTranscript(lapTurns);

    const assistantMessage = {
      role: 'assistant',
      content: transcript,
    };

    // Save conversation state (skip on abort to avoid persisting incomplete history)
    let conversationState;
    if (!signal?.aborted) {
      try {
        conversationState = buildConversationState(
          conversationHistory,
          lapUserMessage,
          assistantMessage,
          models,
          turnsSuccessful,
          turnsFailed,
        );

        await continuationStore.set(continuationId, conversationState);
      } catch (error) {
        logger.error('Error saving conversation', { error });
        // Continue even if save fails
      }
    }

    // Export conversation if requested
    if (shouldExport && conversationState) {
      await exportConversation(conversationState, {
        clientCwd: config.server?.client_cwd,
        continuation_id: continuationId,
        models,
        temperature,
        reasoning_effort,
        use_websearch,
        files,
        images,
      });
    }

    const executionTime = (Date.now() - startedAt) / 1000;
    const messageCount = (conversationState?.messages || []).length;

    // Collect failure details
    const failureDetails = lapTurns
      .filter((t) => t.status === 'failed')
      .map((t) => `${t.model} (${t.error})`);

    const modelsList = models.join(', ');
    const statusLine =
      config.environment?.nodeEnv !== 'test'
        ? `✅ COMPLETED | CONVERSATION | ${continuationId} | ${executionTime.toFixed(1)}s elapsed | ${turnsSuccessful}/${lapTurns.length} turns | ${modelsList}\n`
        : '';

    const continuationIdLine = `continuation_id: ${continuationId}\n\n`;

    const result = {
      status: 'conversation_complete',
      content: transcript,
      models_consulted: models.length,
      successful_turns: turnsSuccessful,
      failed_turns: turnsFailed,
      turns: lapTurns,
      continuation: {
        id: continuationId,
        messageCount,
        ...(isCustomId && { custom_id: true }),
      },
      settings: {
        temperature,
        models_requested: models,
      },
    };

    const tokenLimit = getTokenLimit(config);
    const resultStr = JSON.stringify(result, null, 2);
    const limitedResult = applyTokenLimit(resultStr, tokenLimit);

    let finalContent = limitedResult.content;
    if (failureDetails.length > 0) {
      finalContent += formatFailureDetails(failureDetails);
    }

    finalContent = statusLine + continuationIdLine + finalContent;

    return createToolResponse({
      content: finalContent,
      continuation: {
        id: continuationId,
        messageCount,
        ...(isCustomId && { custom_id: true }),
      },
    });
  } catch (error) {
    if (dependencies?.signal?.aborted || error.name === 'AbortError') {
      logger.debug('Conversation tool cancelled by client');
      return createToolError('Conversation request cancelled');
    }
    logger.error('Conversation tool error', { error });
    return createToolError('Conversation tool failed', error);
  }
}

/**
 * Execute a single turn with streaming support (async path). Adapts consensus's
 * per-provider streaming to a single provider per call.
 * @returns {Promise<object>} Turn result { model, provider, status, response|error }
 */
async function executeTurnWithStreaming(
  plan,
  messages,
  options,
  context,
  streamNormalizer,
  turnIndex,
) {
  try {
    if (context.signal?.aborted) {
      throw new Error('Conversation execution was cancelled');
    }

    let response;
    let stream = null;

    if (
      plan.providerInstance.stream &&
      typeof plan.providerInstance.stream === 'function'
    ) {
      stream = plan.providerInstance.stream(messages, options);
    } else {
      // SDK providers (copilot, codex, claude, gemini-cli) stream via invoke
      const streamResult = await plan.providerInstance.invoke(messages, {
        ...options,
        stream: true,
      });
      if (
        streamResult &&
        typeof streamResult[Symbol.asyncIterator] === 'function'
      ) {
        stream = streamResult;
      } else {
        response = streamResult;
      }
    }

    if (stream) {
      const normalizedStream = streamNormalizer.normalize(plan.provider, stream, {
        provider: plan.provider,
        model: options.model,
        requestId: `${context.jobId}-turn-${turnIndex}`,
      });

      let accumulatedContent = '';
      let finalUsage = null;
      let finalMetadata = {};

      for await (const event of normalizedStream) {
        if (context.signal?.aborted) {
          throw new Error('Conversation execution was cancelled');
        }

        switch (event.type) {
        case 'delta':
          accumulatedContent += event.data.textDelta;
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
        metadata: { ...finalMetadata, usage: finalUsage, streaming: true },
      };
    }

    if (!stream && !response) {
      response = await plan.providerInstance.invoke(messages, options);
    }

    return {
      model: plan.model,
      provider: plan.provider,
      status: 'success',
      response: response.content,
      metadata: response.metadata || {},
    };
  } catch (error) {
    // Cancellation must abort the whole lap, not be demoted to a failed turn.
    // Rethrow so it propagates out of executeConversationWithStreaming to the
    // job runner (which marks the job cancelled) and the save block is skipped.
    if (context.signal?.aborted || error.name === 'AbortError') {
      throw error;
    }
    return {
      model: plan.model,
      provider: plan.provider,
      status: 'failed',
      error: error.message,
    };
  }
}

/**
 * Execute a conversation lap with streaming normalization for async execution.
 * Mirrors executeConsensusWithStreaming but sequential.
 * @param {object} args - Original conversation arguments
 * @param {object} dependencies - Dependencies with continuationId
 * @param {object} context - Job execution context
 * @returns {Promise<object>} Complete conversation result (with top-level content)
 */
async function executeConversationWithStreaming(args, dependencies, context) {
  const {
    config,
    providers,
    continuationStore,
    contextProcessor,
    providerStreamNormalizer,
    continuationId,
    isCustomId,
    title: passedTitle,
  } = dependencies;

  const {
    prompt,
    models,
    files = [],
    images = [],
    temperature = 0.2,
    reasoning_effort = 'medium',
    use_websearch = false,
    export: shouldExport = false,
    turn_prompt,
  } = args;

  let conversationHistory = [];
  if (continuationId) {
    try {
      const existingState = await continuationStore.get(continuationId);
      if (existingState) {
        conversationHistory = existingState.messages || [];
      }
    } catch (error) {
      logger.error('Error loading conversation', { error });
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

  const contextMessage = await buildContextMessage(
    files,
    images,
    contextProcessor,
    config,
  );

  const priorTranscriptText = renderStoredTranscriptToText(conversationHistory);
  const turnPlan = resolveTurnPlan(models, providers, config);
  const modelsList = models.join(', ');

  // Use passed title or generate if not provided
  const summarizationService = new SummarizationService(providers, config);
  let title = passedTitle;
  if (!title) {
    try {
      title = await summarizationService.generateTitle(prompt);
      debugLog(`Conversation: Generated title - "${title}"`);
    } catch (error) {
      debugError('Conversation: Error generating title', error);
      title = prompt.substring(0, 50);
    }
  }

  await context.updateJob({
    models_list: modelsList,
    title,
    conversation_progress: `0/${turnPlan.length}`,
    conversation_phase: 'conversation',
    total_turns: turnPlan.length,
    completed_turns: 0,
  });

  const startedAt = Date.now();
  const lapTurns = [];

  for (let i = 0; i < turnPlan.length; i++) {
    if (context.signal?.aborted) {
      throw new Error('Conversation execution was cancelled');
    }

    const plan = turnPlan[i];

    if (plan.preFailReason) {
      lapTurns.push({
        model: plan.model,
        provider: plan.provider,
        status: 'failed',
        error: plan.preFailReason,
        position: i,
      });
    } else {
      const packetText = buildTurnPacket({
        priorTranscriptText,
        prompt,
        sameLapTurns: lapTurns,
        i,
        models,
        turn_prompt,
      });

      const finalUserContent = buildTurnUserContent(packetText, contextMessage);

      const messages = [
        { role: 'system', content: CONVERSATION_PROMPT },
        { role: 'user', content: finalUserContent },
      ];

      const turnResult = await executeTurnWithStreaming(
        plan,
        messages,
        {
          temperature,
          reasoning_effort,
          use_websearch,
          signal: context?.signal,
          config,
          model: plan.resolvedModel,
        },
        context,
        providerStreamNormalizer,
        i,
      );

      lapTurns.push({ ...turnResult, position: i });
    }

    // Report per-turn progress with the running transcript.
    // Use flat keys (not a `progress` object) — asyncJobStore.update() treats the
    // reserved `progress` key as a numeric 0..1 value, so an object there would
    // corrupt it. Numeric overall progress is supplied separately as a fraction.
    await context.updateJob({
      conversation_progress: `${i + 1}/${turnPlan.length}`,
      accumulated_content: formatLapTranscript(lapTurns),
      title,
      progress: (i + 1) / turnPlan.length,
      conversation_phase: 'conversation',
      total_turns: turnPlan.length,
      completed_turns: i + 1,
      current_model: plan.model,
    });
  }

  const turnsSuccessful = lapTurns.filter((t) => t.status === 'success').length;
  const turnsFailed = lapTurns.length - turnsSuccessful;

  const lapUserMessage = {
    role: 'user',
    content: buildTurnUserContent(prompt, contextMessage),
  };

  // Final lap transcript — computed once and reused for the assistant message,
  // the persisted state, and the returned top-level content.
  const transcript = formatLapTranscript(lapTurns);

  const assistantMessage = {
    role: 'assistant',
    content: transcript,
  };

  // Save conversation state
  let conversationState;
  try {
    conversationState = buildConversationState(
      conversationHistory,
      lapUserMessage,
      assistantMessage,
      models,
      turnsSuccessful,
      turnsFailed,
    );
    await continuationStore.set(continuationId, conversationState);
  } catch (error) {
    logger.error('Error saving conversation', { error });
  }

  // Export conversation if requested
  if (shouldExport && conversationState) {
    await exportConversation(conversationState, {
      clientCwd: config.server?.client_cwd,
      continuation_id: continuationId,
      models,
      temperature,
      reasoning_effort,
      use_websearch,
      files,
      images,
    });
  }

  const executionTime = (Date.now() - startedAt) / 1000;

  // Generate final summary from combined successful responses
  let finalSummary = null;
  const combinedResponses = lapTurns
    .filter((t) => t.status === 'success' && t.response)
    .map((t) => `${t.model}:\n${t.response}`);

  if (combinedResponses.length > 0) {
    const combinedContent = combinedResponses.join('\n\n---\n\n');
    if (combinedContent.length > 100) {
      try {
        finalSummary =
          await summarizationService.generateFinalSummary(combinedContent);
        debugLog(`Conversation: Generated final summary - "${finalSummary}"`);
        await context.updateJob({ final_summary: finalSummary });
      } catch (error) {
        debugError('Conversation: Error generating final summary', error);
      }
    }
  }

  const failureDetails = lapTurns
    .filter((t) => t.status === 'failed')
    .map((t) => `${t.model} (${t.error})`);

  const messageCount = (conversationState?.messages || []).length;

  // Top-level `content` is required: formatStatus only renders result.content
  // when displaying a completed async job.
  return {
    status: 'conversation_complete',
    content: transcript,
    models_consulted: models.length,
    successful_turns: turnsSuccessful,
    failed_turns: turnsFailed,
    turns: lapTurns,
    continuation: {
      id: continuationId,
      messageCount,
      ...(isCustomId && { custom_id: true }),
    },
    settings: {
      temperature,
      models_requested: models,
    },
    metadata: {
      execution_time: executionTime,
      async_execution: true,
      successful_models: turnsSuccessful,
      total_models: models.length,
      failure_details: failureDetails,
      title,
      final_summary: finalSummary,
    },
  };
}

// Tool metadata
conversationTool.description =
  'TURN-BASED ROUND-TABLE - Models respond SEQUENTIALLY in the order given; each model sees the full running transcript and builds on prior turns. One call = one lap; pass continuation_id for more laps. Contrast with consensus (parallel, same prompt). Use the "files" parameter to share code.';
conversationTool.inputSchema = {
  type: 'object',
  properties: {
    models: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      description:
        'Ordered list of models for the round-table. ORDER MATTERS: models speak one after another in this exact order, each seeing the transcript of those before it. Examples: ["codex", "gemini", "claude"]. A single model (e.g. ["codex"]) talks to itself across laps. Use ["auto"] to pick the first available provider.',
    },
    prompt: {
      type: 'string',
      description:
        'The topic or question to open the round-table with. Include context and what you want the participants to discuss. Example: "Critique this caching strategy and propose improvements."',
    },
    continuation_id: {
      type: 'string',
      description:
        'Thread continuation ID for running more laps. Auto-generated in the first response; pass it back to run another lap where every model again sees the full accumulated transcript. You MAY change the models list on a resuming lap.',
    },
    turn_prompt: {
      type: 'string',
      description:
        'Optional custom per-turn instruction appended to the round-table framing each model receives. Example: "Focus on security implications in your turn."',
    },
    files: {
      type: 'array',
      items: { type: 'string' },
      description:
        'File paths for additional context (absolute or relative paths). Supports line ranges: file.txt{10:50}, file.txt{100:}. Files are shared with every participant in the lap. IMPORTANT: Always use this parameter to share file content instead of copying code into the prompt.',
    },
    images: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Image paths for visual context (absolute or relative paths, or base64). Example: ["C:\\Users\\username\\diagram.png", "./flow.jpg"]',
    },
    temperature: {
      type: 'number',
      description:
        'Response randomness (0.0-1.0). Examples: 0.1 (very focused), 0.2 (analytical - default), 0.5 (balanced). Default: 0.2',
      minimum: 0.0,
      maximum: 1.0,
      default: 0.2,
    },
    reasoning_effort: {
      type: 'string',
      enum: ['none', 'minimal', 'low', 'medium', 'high', 'max'],
      description:
        'Reasoning depth for thinking models. Examples: "none" (no reasoning, fastest), "low" (light analysis), "medium" (balanced), "high" (complex analysis). Default: "medium"',
      default: 'medium',
    },
    use_websearch: {
      type: 'boolean',
      description:
        'Enable web search for current information. Only works with models that support web search (OpenAI, XAI, Google). Default: false',
      default: false,
    },
    async: {
      type: 'boolean',
      description:
        'Execute the lap in background with per-turn progress tracking. When true, returns continuation_id immediately and processes the lap asynchronously. Default: false',
      default: false,
    },
    export: {
      type: 'boolean',
      description:
        'Export conversation to disk. Creates folder with continuation_id name containing numbered request/response files and metadata. Default: false',
      default: false,
    },
  },
  required: ['prompt', 'models'],
};
