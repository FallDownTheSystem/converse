/**
 * Chat Tool (unified)
 *
 * A single MCP tool with three execution modes:
 *   - `chat`       : 1..N models invoked in parallel; each responds independently.
 *   - `consensus`  : ≥2 models in parallel, then a cross-feedback refinement phase.
 *   - `roundtable` : models respond sequentially, each seeing the full transcript.
 *
 * This module is the shared shell: it validates arguments, loads/normalizes
 * continuation history, builds file/image context, dispatches to the parallel or
 * roundtable execution engine, and owns persistence, export, token-limiting, and
 * MCP-response construction. The engines (`modes/parallel.js`, `modes/roundtable.js`)
 * only resolve/invoke and return invocation data.
 */

import { createToolResponse, createToolError, formatFailureDetails } from './index.js';
import { createFileContext } from '../utils/contextProcessor.js';
import {
  generateContinuationId,
  isValidContinuationId,
} from '../continuationStore.js';
import { isSafeIdSegment } from '../utils/idValidation.js';
import { debugError } from '../utils/console.js';
import { createLogger } from '../utils/logger.js';
import { getSystemPromptForMode } from '../systemPrompts.js';
import { applyTokenLimit, getTokenLimit } from '../utils/tokenLimiter.js';
import { validateAllPaths } from '../utils/fileValidator.js';
import { SummarizationService } from '../services/summarizationService.js';
import { exportConversation } from '../utils/conversationExporter.js';
import {
  getDefaultModelForProvider,
  getProviderUnavailableMessage,
  getAvailableProviders,
  resolveModelSpec,
} from '../utils/modelRouting.js';
import {
  runChatMode,
  runConsensusMode,
  getProviderRetryOptions,
} from './modes/parallel.js';
import {
  runRoundtableLap,
  renderStoredTranscriptToText,
} from './modes/roundtable.js';

const logger = createLogger('chat');

const VALID_MODES = ['chat', 'consensus', 'roundtable'];

// SDK providers that consume ONLY the last user message. On a resumed thread in
// chat/consensus modes, prior history must be packed into that final message for
// these providers (codex is exempt in chat mode when it can reuse its own thread).
const LAST_USER_ONLY = new Set(['codex', 'claude', 'copilot']);

/**
 * Unified chat tool implementation.
 * @param {object} args - Tool arguments
 * @param {object} dependencies - Injected dependencies
 * @returns {object} MCP tool response
 */
export async function chatTool(args, dependencies) {
  try {
    const { config, providers, continuationStore, jobRunner, providerStreamNormalizer } =
      dependencies;

    if (!args.prompt || typeof args.prompt !== 'string' || !args.prompt.trim()) {
      return createToolError('Prompt is required and must be a string');
    }

    // The router applies no JSON-Schema defaults, so apply them in code.
    const mode = args.mode ?? 'chat';
    const models = args.models ?? ['auto'];
    const reasoning_effort = args.reasoning_effort ?? 'medium';
    const {
      prompt,
      files = [],
      images = [],
      continuation_id,
      async: isAsync = false,
      export: shouldExport = false,
    } = args;

    if (!VALID_MODES.includes(mode)) {
      return createToolError(
        `Invalid mode "${mode}". Valid modes are: ${VALID_MODES.join(', ')}.`,
      );
    }

    const modelsError = validateModels(models, mode);
    if (modelsError) {
      return createToolError(modelsError);
    }

    // Consensus needs ≥2 *resolved* (available) models, checked AFTER auto
    // expansion so the default ["auto"] is valid.
    if (mode === 'consensus') {
      const { resolved } = resolveConsensusCallPlans(
        models,
        providers,
        config,
        images,
      );
      if (resolved.length < 2) {
        return createToolError(
          'Consensus mode requires at least 2 available models. ' +
            'Provide 2+ models (or "auto" when 2+ providers are configured), ' +
            'or use mode "chat" for a single model.',
        );
      }
    }

    const normalizedArgs = {
      prompt,
      mode,
      models,
      reasoning_effort,
      files,
      images,
      continuation_id,
      export: shouldExport,
    };

    if (isAsync) {
      if (!jobRunner || !providerStreamNormalizer) {
        return createToolError(
          'Async execution not available - missing async dependencies',
        );
      }

      if (continuation_id && !isSafeIdSegment(continuation_id)) {
        return createToolError(
          `Invalid continuation_id for async mode: "${continuation_id}". Async IDs must contain only letters, numbers, hyphens, and underscores (max 128 chars).`,
        );
      }

      const jobContinuationId = continuation_id || generateContinuationId();

      let isCustomId = false;
      if (continuation_id && !isValidContinuationId(continuation_id)) {
        try {
          const existing = await continuationStore.get(continuation_id);
          isCustomId = !existing;
        } catch {
          isCustomId = true;
        }
      }

      const modelsList = models.join(', ');
      const summarizationService = new SummarizationService(providers, config);
      let title = null;
      try {
        title = await summarizationService.generateTitle(prompt);
      } catch (error) {
        debugError('Chat: Failed to generate title for initial response', error);
        title = prompt.substring(0, 50);
      }

      try {
        await jobRunner.submit(
          {
            tool: 'chat',
            mode,
            sessionId: jobContinuationId,
            options: {
              ...normalizedArgs,
              jobId: jobContinuationId,
              continuation_id: jobContinuationId,
              mode,
              models_list: modelsList,
              title,
            },
          },
          async (context) => {
            return await runAsyncJob(
              { ...normalizedArgs, continuation_id: jobContinuationId },
              { ...dependencies, isCustomId, title },
              context,
            );
          },
        );

        const statusLine = `⏳ SUBMITTED | ${mode.toUpperCase()} | ${jobContinuationId} | 1/1 | Started: ${formatStartTime()} | "${title || 'Processing...'}" | ${modelsList}`;

        return createToolResponse({
          content: `${statusLine}\ncontinuation_id: ${jobContinuationId}`,
          continuation: {
            id: jobContinuationId,
            status: 'processing',
            ...(isCustomId && { custom_id: true }),
          },
          async_execution: true,
        });
      } catch (error) {
        logger.error('Failed to submit async chat job', { error });
        return createToolError(`Async execution failed: ${error.message}`);
      }
    }

    // Synchronous path
    const pipeline = await runUnifiedChat(normalizedArgs, dependencies, null);
    if (pipeline.error) {
      return pipeline.error;
    }
    return buildSyncResponse(pipeline, config);
  } catch (error) {
    if (dependencies?.signal?.aborted || error.name === 'AbortError') {
      const cancelledMode = args?.mode ?? 'chat';
      const label = cancelledMode.charAt(0).toUpperCase() + cancelledMode.slice(1);
      logger.debug('Chat tool cancelled by client');
      return createToolError(`${label} request cancelled`);
    }
    logger.error('Chat tool error', { error });
    return createToolError('Chat tool failed', error);
  }
}

/**
 * Validate the models array and (for chat/consensus) reject duplicates.
 * @returns {string|null} Error message or null when valid
 */
function validateModels(models, mode) {
  if (!Array.isArray(models) || models.length === 0) {
    return 'Models must be a non-empty array of model names';
  }
  for (const entry of models) {
    if (!entry || typeof entry !== 'string' || !entry.trim()) {
      return 'Each model must be a non-empty string';
    }
  }
  if (mode !== 'roundtable') {
    const seen = new Set();
    for (const entry of models) {
      const key = entry.trim().toLowerCase();
      if (seen.has(key)) {
        return `Duplicate model "${entry}" is not allowed in mode "${mode}". Duplicate models are only allowed in mode "roundtable".`;
      }
      seen.add(key);
    }
  }
  return null;
}

/**
 * The async job runner: executes the pipeline with streaming, then generates a
 * final summary and returns the completion result for the job store.
 */
async function runAsyncJob(args, dependencies, context) {
  const { providers, config, title: passedTitle } = dependencies;

  const pipeline = await runUnifiedChat(args, dependencies, context);
  if (pipeline.error) {
    // Validation errors are surfaced eagerly in chatTool; reaching here means a
    // runtime failure — throw so the job is marked failed.
    throw new Error(
      pipeline.errorMessage || 'Chat job failed during execution',
    );
  }

  const summarizationService = new SummarizationService(providers, config);
  let finalSummary = null;
  if (pipeline.combinedForSummary && pipeline.combinedForSummary.length > 100) {
    try {
      finalSummary = await summarizationService.generateFinalSummary(
        pipeline.combinedForSummary,
      );
      if (finalSummary) {
        await context.updateJob({ final_summary: finalSummary });
      }
    } catch (error) {
      debugError('Chat: Failed to generate final summary', error);
    }
  }

  return buildAsyncResult(pipeline, passedTitle, finalSummary);
}

/**
 * The shared pipeline: load history, build context, resolve + invoke via the
 * mode's engine, persist, export. Returns a normalized pipeline result (or an
 * `{ error }` for path-validation failures).
 */
async function runUnifiedChat(args, dependencies, context) {
  const {
    config,
    providers,
    continuationStore,
    contextProcessor,
    providerStreamNormalizer,
  } = dependencies;
  const signal = context ? context.signal : dependencies.signal;
  const { prompt, mode, models, reasoning_effort, files, images, export: shouldExport } = args;

  // Continuation load
  let continuationId = args.continuation_id;
  let isCustomId = false;
  let existingState = null;
  if (continuationId) {
    try {
      existingState = await continuationStore.get(continuationId);
    } catch (error) {
      logger.error('Error loading conversation', { error });
    }
    if (!existingState) {
      isCustomId = !isValidContinuationId(continuationId);
    }
  } else {
    continuationId = generateContinuationId();
  }

  const priorHistory = existingState?.messages || [];
  // Strip any stored leading system message so exactly one current-mode system
  // prompt leads the invoked/persisted history (prevents a cross-mode resume
  // running the previous mode's prompt).
  const normalizedHistory =
    priorHistory.length > 0 && priorHistory[0].role === 'system'
      ? priorHistory.slice(1)
      : priorHistory;

  // Path validation
  if (files.length > 0 || images.length > 0) {
    const validation = await validateAllPaths(
      { files, images },
      { clientCwd: config.server?.client_cwd },
    );
    if (!validation.valid) {
      logger.error('File validation failed', { errors: validation.errors });
      return { error: validation.errorResponse };
    }
  }

  const contextMessage = await buildContextMessage(
    files,
    images,
    contextProcessor,
    config,
  );

  const systemPrompt = getSystemPromptForMode(mode);
  const systemMessage = { role: 'system', content: systemPrompt };
  const hasImages = Array.isArray(images) && images.length > 0;

  const common = {
    mode,
    models,
    prompt,
    reasoning_effort,
    files,
    images,
    continuationId,
    isCustomId,
    existingState,
    normalizedHistory,
    systemMessage,
    systemPrompt,
    contextMessage,
    hasImages,
    shouldExport,
    signal,
    context,
    providers,
    config,
    continuationStore,
    providerStreamNormalizer,
  };

  if (mode === 'roundtable') {
    return await runRoundtablePipeline(common);
  }
  return await runParallelPipeline(common);
}

/**
 * Build the per-provider message array for a chat/consensus candidate. API and
 * gemini-cli providers get the full role-separated history; last-user-only SDK
 * providers get the prior transcript packed into a single final user message,
 * except Codex in chat mode when it can resume its own thread.
 */
function makeMessageBuilder(common, priorTranscriptText, userMessage, packedUserMessage) {
  const fullMessages = [common.systemMessage, ...common.normalizedHistory, userMessage];
  return (candidate, callPlan) => {
    if (!LAST_USER_ONLY.has(candidate.name)) {
      return fullMessages;
    }
    if (!priorTranscriptText) {
      return [common.systemMessage, userMessage];
    }
    const codexReusesThread =
      common.mode === 'chat' &&
      candidate.name === 'codex' &&
      !!common.existingState?.providerThreads?.[callPlan.threadKey];
    if (codexReusesThread) {
      return fullMessages;
    }
    return [common.systemMessage, packedUserMessage];
  };
}

/**
 * Parallel-mode pipeline (chat + consensus).
 */
async function runParallelPipeline(common) {
  const {
    mode,
    models,
    prompt,
    reasoning_effort,
    continuationId,
    isCustomId,
    existingState,
    normalizedHistory,
    contextMessage,
    signal,
    context,
    providers,
    config,
    continuationStore,
    providerStreamNormalizer,
  } = common;

  const userContent = contextMessage?.content
    ? [...contextMessage.content, { type: 'text', text: prompt }]
    : prompt;
  const userMessage = { role: 'user', content: userContent };

  const priorTranscriptText = renderStoredTranscriptToText(normalizedHistory);
  const packedText = priorTranscriptText ? `${priorTranscriptText}\n\n${prompt}` : prompt;
  const packedUserContent = contextMessage?.content
    ? [...contextMessage.content, { type: 'text', text: packedText }]
    : packedText;
  const packedUserMessage = { role: 'user', content: packedUserContent };

  const buildMessagesForCandidate = makeMessageBuilder(
    common,
    priorTranscriptText,
    userMessage,
    packedUserMessage,
  );

  const optionsForCandidate = (candidate, callPlan) => {
    const options = {
      model: candidate.resolvedModel,
      reasoning_effort,
      config,
    };
    // Codex thread reuse is chat-mode-scoped, and only Codex consumes these
    // options — passing them to other providers would leak `threadKey` into
    // their API payloads via generic option passthrough.
    if (mode === 'chat' && candidate.name === 'codex') {
      options.continuation_id = continuationId;
      options.continuationStore = continuationStore;
      options.threadKey = callPlan.threadKey;
    }
    return options;
  };

  const startedAt = Date.now();

  if (mode === 'consensus') {
    const { resolved, preFailed } = resolveConsensusCallPlans(
      models,
      providers,
      config,
      common.images,
    );

    if (resolved.length === 0) {
      return {
        error: createToolError(
          'No providers available. Please configure at least one API key.',
        ),
        errorMessage: 'No providers available',
      };
    }

    const { initial, refined } = await runConsensusMode({
      callPlans: resolved,
      buildMessagesForCandidate,
      optionsForCandidate,
      prompt,
      signal,
      context,
      providerStreamNormalizer,
    });

    const successful = initial.filter((r) => r.status === 'success');
    const failed = [
      ...initial.filter((r) => r.status === 'failed'),
      ...preFailed.map((f) => ({ ...f, status: 'failed' })),
    ];

    const formattedContent = formatConsensusContent(successful, refined);

    await persistAndExport(common, {
      userMessage,
      assistantContent: formattedContent,
      extraState: {
        consensusData: {
          modelsRequested: models.length,
          providersSuccessful: successful.length,
          providersFailed: failed.length,
        },
      },
    });

    const finalCount = refined
      ? refined.filter((r) => r.status === 'success').length
      : successful.length;
    const totalCount = resolved.length;
    const failureDetails = collectConsensusFailures(successful, failed, refined);
    const combinedForSummary = successful
      .map((r) => `${r.model}:\n${refined ? refinedText(refined, r) : r.response}`)
      .join('\n\n---\n\n');

    return {
      kind: 'consensus',
      continuationId,
      isCustomId,
      executionTime: (Date.now() - startedAt) / 1000,
      structuredResult: {
        status: 'consensus_complete',
        models_consulted: models.length,
        successful_initial_responses: successful.length,
        failed_responses: failed.length,
        refined_responses: refined
          ? refined.filter((r) => r.status === 'success').length
          : 0,
        phases: {
          initial: successful,
          ...(refined !== null && { refined }),
          failed,
        },
        continuation: {
          id: continuationId,
          messageCount: normalizedHistory.length + 3,
          ...(isCustomId && { custom_id: true }),
        },
        settings: { models_requested: models },
      },
      formattedContent,
      finalCount,
      totalCount,
      failureDetails,
      modelsList: resolved.map((c) => c.displayModel).join(', '),
      combinedForSummary,
    };
  }

  // mode === 'chat'
  const { callPlans, preFailed, error } = resolveChatCallPlans(
    models,
    providers,
    config,
    common.hasImages,
  );
  if (error) {
    return { error: createToolError(error), errorMessage: error };
  }

  const { results } = await runChatMode({
    callPlans,
    buildMessagesForCandidate,
    optionsForCandidate,
    signal,
    context,
    providerStreamNormalizer,
    retryOptionsFor: (providerName) => getProviderRetryOptions(config, providerName),
  });

  const allResults = [
    ...results,
    ...preFailed.map((f) => ({ ...f, status: 'failed' })),
  ];
  const successful = allResults.filter((r) => r.status === 'success');

  if (successful.length === 0) {
    if (allResults.length > 1) {
      // Multi-model all-failed: surface every model's failure.
      const details = allResults.map((r) => `${r.model} (${r.error})`).join('; ');
      return {
        error: createToolError(`All models failed: ${details}`),
        errorMessage: details,
      };
    }
    const message =
      allResults.find((r) => r.error)?.error || 'Provider returned no response';
    return { error: createToolError(`Provider error: ${message}`), errorMessage: message };
  }

  const isMulti = models.length > 1;
  const combinedContent = isMulti
    ? formatChatMultiContent(successful)
    : successful[0].response;

  // Merge new Codex thread IDs into the existing per-spec thread map.
  const providerThreads = { ...(existingState?.providerThreads || {}) };
  for (const r of successful) {
    if (r.metadata?.threadId && r.threadKey) {
      providerThreads[r.threadKey] = r.metadata.threadId;
    }
  }

  await persistAndExport(common, {
    userMessage,
    assistantContent: combinedContent,
    extraState: { models, providerThreads },
  });

  const failed = allResults.filter((r) => r.status === 'failed');
  const failureDetails = failed.map((f) => `${f.model} (${f.error})`);
  const winner = successful[0];
  const messageCount = normalizedHistory.length + 2; // user + assistant (system excluded)

  return {
    kind: 'chat',
    continuationId,
    isCustomId,
    executionTime: (Date.now() - startedAt) / 1000,
    content: combinedContent,
    isMulti,
    successCount: successful.length,
    totalCount: allResults.length,
    failureDetails,
    messageCount,
    modelsList: models.join(', '),
    provider: winner.provider,
    model: winner.resolvedModel,
    combinedForSummary: combinedContent,
  };
}

/**
 * Roundtable-mode pipeline.
 */
async function runRoundtablePipeline(common) {
  const {
    models,
    prompt,
    reasoning_effort,
    continuationId,
    isCustomId,
    normalizedHistory,
    systemPrompt,
    contextMessage,
    hasImages,
    signal,
    context,
    providers,
    config,
    providerStreamNormalizer,
  } = common;

  const startedAt = Date.now();

  const lap = await runRoundtableLap({
    models,
    prompt,
    priorHistory: normalizedHistory,
    contextMessage,
    systemPrompt,
    providers,
    config,
    signal,
    reasoning_effort,
    hasImages,
    context,
    providerStreamNormalizer,
  });

  const { lapTurns, transcript, turnsSuccessful, turnsFailed, lapUserMessage } = lap;

  const conversationState = await persistAndExport(common, {
    userMessage: lapUserMessage,
    assistantContent: transcript,
    extraState: {
      roundtableData: {
        modelsOrdered: models,
        turnsSuccessful,
        turnsFailed,
      },
    },
  });

  const failureDetails = lapTurns
    .filter((t) => t.status === 'failed')
    .map((t) => `${t.model} (${t.error})`);
  const messageCount = (conversationState?.messages || []).length;
  const combinedForSummary = lapTurns
    .filter((t) => t.status === 'success' && t.response)
    .map((t) => `${t.model}:\n${t.response}`)
    .join('\n\n---\n\n');

  return {
    kind: 'roundtable',
    continuationId,
    isCustomId,
    executionTime: (Date.now() - startedAt) / 1000,
    transcript,
    structuredResult: {
      status: 'roundtable_complete',
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
      settings: { models_requested: models },
    },
    turnsSuccessful,
    totalTurns: lapTurns.length,
    failureDetails,
    modelsList: models.join(', '),
    combinedForSummary,
  };
}

/**
 * Build the synchronous MCP response from a pipeline result.
 */
function buildSyncResponse(pipeline, config) {
  const isTest = config.environment?.nodeEnv === 'test';
  const tokenLimit = getTokenLimit(config);
  const idLine = `continuation_id: ${pipeline.continuationId}\n\n`;

  if (pipeline.kind === 'chat') {
    const statusLine = isTest
      ? ''
      : pipeline.isMulti
        ? `✅ COMPLETED | CHAT | ${pipeline.continuationId} | ${pipeline.executionTime.toFixed(1)}s elapsed | ${pipeline.successCount}/${pipeline.totalCount} succeeded | ${pipeline.modelsList}\n`
        : `✅ COMPLETED | CHAT | ${pipeline.continuationId} | ${pipeline.executionTime.toFixed(1)}s elapsed | ${pipeline.provider}/${pipeline.model}\n`;

    const result = {
      content: statusLine + idLine + pipeline.content,
      continuation: {
        id: pipeline.continuationId,
        messageCount: pipeline.messageCount,
        ...(pipeline.isMulti
          ? { models: pipeline.modelsList }
          : { provider: pipeline.provider, model: pipeline.model }),
        ...(pipeline.isCustomId && { custom_id: true }),
      },
    };
    if (pipeline.failureDetails.length > 0) {
      result.content += formatFailureDetails(pipeline.failureDetails);
    }

    const limited = applyTokenLimit(JSON.stringify(result, null, 2), tokenLimit);
    let finalResult;
    try {
      finalResult = JSON.parse(limited.content);
    } catch {
      finalResult = result;
    }
    return createToolResponse(finalResult);
  }

  // consensus / roundtable — structured JSON body
  const modeLabel = pipeline.kind.toUpperCase();
  const countField =
    pipeline.kind === 'consensus'
      ? `${pipeline.finalCount}/${pipeline.totalCount} succeeded`
      : `${pipeline.turnsSuccessful}/${pipeline.totalTurns} turns`;
  const statusLine = isTest
    ? ''
    : `✅ COMPLETED | ${modeLabel} | ${pipeline.continuationId} | ${pipeline.executionTime.toFixed(1)}s elapsed | ${countField} | ${pipeline.modelsList}\n`;

  const limited = applyTokenLimit(
    JSON.stringify(pipeline.structuredResult, null, 2),
    tokenLimit,
  );
  let finalContent = limited.content;
  if (pipeline.failureDetails.length > 0) {
    finalContent += formatFailureDetails(pipeline.failureDetails);
  }
  finalContent = statusLine + idLine + finalContent;

  return createToolResponse({
    content: finalContent,
    continuation: pipeline.structuredResult.continuation,
  });
}

/**
 * Build the async job-completion result object from a pipeline result.
 */
function buildAsyncResult(pipeline, title, finalSummary) {
  const baseMetadata = {
    execution_time: pipeline.executionTime,
    async_execution: true,
    title,
    final_summary: finalSummary,
  };

  if (pipeline.kind === 'chat') {
    return {
      status: 'chat_complete',
      content: pipeline.content,
      continuation: {
        id: pipeline.continuationId,
        messageCount: pipeline.messageCount,
        ...(pipeline.isCustomId && { custom_id: true }),
      },
      metadata: {
        ...baseMetadata,
        provider: pipeline.provider,
        model: pipeline.model,
        successful_models: pipeline.successCount,
        total_models: pipeline.totalCount,
        failure_details: pipeline.failureDetails,
      },
    };
  }

  if (pipeline.kind === 'consensus') {
    return {
      ...pipeline.structuredResult,
      content: pipeline.formattedContent,
      continuation: {
        id: pipeline.continuationId,
        ...(pipeline.isCustomId && { custom_id: true }),
      },
      metadata: {
        ...baseMetadata,
        successful_models: pipeline.finalCount,
        total_models: pipeline.totalCount,
        failure_details: pipeline.failureDetails,
      },
    };
  }

  // roundtable
  return {
    ...pipeline.structuredResult,
    content: pipeline.transcript,
    continuation: {
      id: pipeline.continuationId,
      ...(pipeline.isCustomId && { custom_id: true }),
    },
    metadata: {
      ...baseMetadata,
      successful_models: pipeline.turnsSuccessful,
      total_models: pipeline.totalTurns,
      failure_details: pipeline.failureDetails,
    },
  };
}

// --- Model resolution helpers ------------------------------------------------

/**
 * Build the full provider-priority candidate list for an "auto" spec (used for
 * chat-mode failover). Skips text-only providers when the request has images.
 */
function buildAutoCandidates(providers, config, hasImages) {
  return getAvailableProviders(providers, config, { hasImages }).map((name) => ({
    name,
    providerInstance: providers[name],
    resolvedModel: getDefaultModelForProvider(name),
    displayModel: 'auto',
  }));
}

/**
 * Resolve chat-mode call plans. Each "auto" spec (whether the list is exactly
 * ["auto"] or "auto" appears alongside explicit models) yields a plan with the
 * full provider-priority candidate list (failover); explicit models yield one
 * single-candidate plan each. Unavailable/unknown explicit models are returned
 * as pre-failed entries (surfaced as per-model failures).
 */
function resolveChatCallPlans(models, providers, config, hasImages) {
  const callPlans = [];
  const preFailed = [];

  for (const spec of models) {
    if (String(spec).toLowerCase() === 'auto') {
      const candidates = buildAutoCandidates(providers, config, hasImages);
      if (candidates.length === 0) {
        // A single ["auto"] with no providers is a hard error; an "auto" entry
        // in a multi-model list becomes a per-model failure instead.
        if (models.length === 1) {
          return {
            callPlans: [],
            preFailed: [],
            error:
              'No providers available. Please configure at least one API key.',
          };
        }
        preFailed.push({
          model: 'auto',
          error: 'No providers available for "auto".',
        });
        continue;
      }
      callPlans.push({
        modelSpec: spec,
        displayModel: 'auto',
        threadKey: spec,
        candidates,
      });
      continue;
    }

    const { providerName, provider, resolvedModel, status } = resolveModelSpec(spec, providers, config);
    if (status === 'not_found') {
      preFailed.push({
        model: spec,
        provider: providerName,
        error: `Provider not found for model: ${spec}`,
      });
    } else if (status === 'unavailable') {
      preFailed.push({
        model: spec,
        provider: providerName,
        error: getProviderUnavailableMessage(providerName),
      });
    } else {
      callPlans.push({
        modelSpec: spec,
        displayModel: spec,
        threadKey: spec,
        candidates: [
          { name: providerName, providerInstance: provider, resolvedModel, displayModel: spec },
        ],
      });
    }
  }
  return { callPlans, preFailed, error: null };
}

/**
 * Resolve consensus-mode call plans. Single "auto" expands to the first 3
 * available providers' default models; each spec becomes a single-candidate plan.
 */
function resolveConsensusCallPlans(models, providers, config, images) {
  const hasImages = Array.isArray(images) && images.length > 0;

  let modelsToProcess = models;
  if (models.length === 1 && String(models[0]).toLowerCase() === 'auto') {
    const available = getAvailableProviders(providers, config, { hasImages, limit: 3 });
    modelsToProcess = available.map((name) => getDefaultModelForProvider(name));
  }

  const resolved = [];
  const preFailed = [];
  for (const spec of modelsToProcess) {
    if (!spec || typeof spec !== 'string') {
      preFailed.push({ model: spec || 'unknown', error: 'Invalid model specification' });
      continue;
    }
    const { providerName, provider, resolvedModel, status } = resolveModelSpec(spec, providers, config);
    if (status === 'not_found') {
      preFailed.push({ model: spec, provider: providerName, error: `Provider not found: ${providerName}` });
    } else if (status === 'unavailable') {
      preFailed.push({ model: spec, provider: providerName, error: getProviderUnavailableMessage(providerName) });
    } else {
      resolved.push({
        modelSpec: spec,
        displayModel: spec,
        threadKey: spec,
        candidates: [
          { name: providerName, providerInstance: provider, resolvedModel, displayModel: spec },
        ],
      });
    }
  }
  return { resolved, preFailed };
}

// --- Formatting helpers ------------------------------------------------------

function formatChatMultiContent(successful) {
  let content = '';
  for (const r of successful) {
    content += `### ${r.model}:\n${r.response}\n\n---\n\n`;
  }
  return content.trimEnd();
}

function formatConsensusContent(successful, refined) {
  let content = '## Initial Responses\n\n';
  for (const r of successful) {
    content += `### ${r.model} (initial response):\n${r.response}\n\n---\n\n`;
  }
  if (refined) {
    content += '## Refined Responses\n\n';
    for (const r of refined) {
      if (r.status === 'success' && r.refined_response) {
        content += `### ${r.model} (refined response):\n${r.refined_response}\n\n---\n\n`;
      } else if (r.status === 'partial') {
        content += `### ${r.model} (refinement failed, showing initial):\n${r.initial_response}\n\n---\n\n`;
      }
    }
  }
  content += `\n**Summary:** Consensus completed with ${successful.length} successful initial responses`;
  if (refined) {
    const successfulRefinements = refined.filter((r) => r.status === 'success').length;
    content += ` and ${successfulRefinements} successful refined responses`;
  }
  content += '.';
  return content;
}

function refinedText(refined, result) {
  const match = refined.find((r) => r.model === result.model);
  if (match && match.status === 'success' && match.refined_response) {
    return match.refined_response;
  }
  return result.response;
}

function collectConsensusFailures(successful, failed, refined) {
  const details = [];
  if (refined) {
    refined.forEach((r) => {
      if (r.status === 'partial') {
        details.push(`${r.model} (refinement failed)`);
      }
    });
    failed.forEach((f) => details.push(`${f.model} (initial failed)`));
  } else {
    failed.forEach((f) => details.push(`${f.model} (${f.error})`));
  }
  return details;
}

// --- Shared side-effect + context helpers ------------------------------------

/**
 * Build the persisted conversation state (aborted-guarded), persist it, export
 * it when requested, and return it. Returns undefined when the request was
 * aborted (matching the historical `const persist = !signal?.aborted` guard).
 * @param {object} common - Shared pipeline context
 * @param {object} parts - Varying per-mode parts
 * @param {object} parts.userMessage - The turn's user message
 * @param {string} parts.assistantContent - The assistant body to persist
 * @param {object} [parts.extraState] - Extra per-mode state fields to merge
 * @returns {Promise<object|undefined>} The persisted state, or undefined if skipped
 */
async function persistAndExport(common, { userMessage, assistantContent, extraState = {} }) {
  if (common.signal?.aborted) {
    return undefined;
  }
  const conversationState = {
    messages: [
      common.systemMessage,
      ...common.normalizedHistory,
      userMessage,
      { role: 'assistant', content: assistantContent },
    ],
    mode: common.mode,
    lastUpdated: Date.now(),
    ...extraState,
  };
  await persistState(common.continuationStore, common.continuationId, conversationState);
  await maybeExport(common.shouldExport, conversationState, {
    config: common.config,
    continuationId: common.continuationId,
    models: common.models,
    reasoning_effort: common.reasoning_effort,
    mode: common.mode,
    common,
  });
  return conversationState;
}

async function persistState(continuationStore, continuationId, state) {
  try {
    await continuationStore.set(continuationId, state);
  } catch (error) {
    logger.error('Error saving conversation', { error });
  }
}

async function maybeExport(shouldExport, conversationState, opts) {
  if (!shouldExport || !conversationState) {
    return;
  }
  const { config, continuationId, models, reasoning_effort, mode, common } = opts;
  await exportConversation(conversationState, {
    clientCwd: config.server?.client_cwd,
    continuation_id: continuationId,
    mode,
    models,
    reasoning_effort,
    files: common.files,
    images: common.images,
  });
}

/**
 * Process files/images into a single context message (shared sync + async).
 * @returns {Promise<object|null>} Context message or null
 */
async function buildContextMessage(files, images, contextProcessor, config) {
  if ((!files || files.length === 0) && (!images || images.length === 0)) {
    return null;
  }
  try {
    const contextResult = await contextProcessor.processUnifiedContext(
      {
        files: Array.isArray(files) ? files : [],
        images: Array.isArray(images) ? images : [],
      },
      {
        enforceSecurityCheck: false,
        skipSecurityCheck: true,
        clientCwd: config.server?.client_cwd,
      },
    );
    const allProcessedFiles = [...contextResult.files, ...contextResult.images];
    if (allProcessedFiles.length > 0) {
      return createFileContext(allProcessedFiles, {
        includeMetadata: true,
        includeErrors: true,
      });
    }
  } catch (error) {
    logger.error('Error processing context', { error });
  }
  return null;
}

function formatStartTime() {
  return new Date()
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
}

// --- Tool metadata -----------------------------------------------------------

chatTool.description =
  'UNIFIED CHAT — talk to one or more AI models. mode "chat" (default): 1..N models answer independently in parallel. mode "consensus": ≥2 models answer, then refine after seeing each other. mode "roundtable": models answer sequentially, each building on the running transcript. Supports files, images, and continuation_id for multi-turn threads (you may switch modes on resume). Use model "auto" for automatic selection. IMPORTANT: use the "files" parameter to share code/file content instead of pasting into the prompt.';

chatTool.inputSchema = {
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      description:
        'Your question, topic, or task with relevant context. More detail enables better responses. Example: "How should I structure the authentication module for this Express.js API?"',
    },
    models: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      description:
        'Models to use. Examples: ["auto"] (recommended), ["codex"], ["codex", "gemini", "claude"]. In mode "chat" each model answers independently; in "consensus" they refine after seeing each other; in "roundtable" they speak in the given ORDER, each seeing the transcript. Default: ["auto"].',
    },
    mode: {
      type: 'string',
      enum: ['chat', 'consensus', 'roundtable'],
      description:
        'Execution mode. "chat" (default): independent parallel answers. "consensus": ≥2 models answer then refine via cross-feedback. "roundtable": sequential turn-based dialogue in the given model order. Default: "chat".',
    },
    continuation_id: {
      type: 'string',
      description:
        'Continuation ID for a persistent multi-turn thread. Auto-generated in the first response; pass it back to continue. You MAY change the mode or models on a resuming turn.',
    },
    files: {
      type: 'array',
      items: { type: 'string' },
      description:
        'File paths to include as context (absolute or relative). Supports line ranges: file.txt{10:50}, file.txt{100:}. Example: ["./src/utils/auth.js{50:100}", "./config.json"]. IMPORTANT: Always use this parameter to share file content instead of copying code into the prompt.',
    },
    images: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Image paths for visual context (absolute or relative paths, or base64 data). Example: ["C:\\Users\\username\\diagram.png", "./screenshot.jpg", "data:image/jpeg;base64,/9j/4AAQ..."]',
    },
    reasoning_effort: {
      type: 'string',
      enum: ['none', 'minimal', 'low', 'medium', 'high', 'max'],
      description:
        'Reasoning depth for thinking models. Examples: "none" (no reasoning, fastest - GPT-5.1+ only), "minimal", "low", "medium" (balanced), "high", "max". Default: "medium"',
    },
    async: {
      type: 'boolean',
      description:
        'Execute in the background. When true, returns a continuation_id immediately and processes the request asynchronously; poll with check_status. Default: false',
    },
    export: {
      type: 'boolean',
      description:
        'Export the conversation to disk. Creates a folder named for the continuation_id with numbered request/response files and metadata. Default: false',
    },
  },
  required: ['prompt'],
};
