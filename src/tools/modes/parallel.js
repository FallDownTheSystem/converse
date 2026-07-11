/**
 * Parallel Mode Engine
 *
 * Serves the `chat` and `consensus` modes. Both fan out a set of call plans and
 * invoke providers concurrently; consensus additionally runs a cross-feedback
 * refinement phase. This is an execution core: it resolves candidates, invokes,
 * streams per-call progress, and RETURNS invocation data (per-call responses and
 * failures, selected candidate, metadata/thread IDs). Persistence, export, and
 * MCP-response construction live in the unified chat tool's shared shell.
 *
 * A call plan is `{ modelSpec, displayModel, threadKey, candidates: [{ name,
 * providerInstance, resolvedModel }, ...] }`. In `chat` mode the "auto" spec
 * yields one call plan with the full provider-priority candidate list and the
 * engine fails over across candidates in order; an explicit model yields one
 * candidate (no failover). In `consensus` mode every call plan has a single
 * candidate and there is no failover.
 */

import { createLogger } from '../../utils/logger.js';
import {
  isRecoverableError,
  retryWithBackoff,
} from '../../utils/errorHandler.js';
import { acquireProviderStream } from './streamShared.js';

const logger = createLogger('parallel');

/**
 * Decide whether a provider error should advance auto-mode to the next candidate.
 * @param {Error} error
 * @returns {boolean}
 */
export function shouldFailoverToNextProvider(error) {
  if (isRecoverableError(error)) {
    return true;
  }

  const message = (error && error.message) || '';
  return /(api key|authentication|unauthorized|forbidden|invalid|not available)/i.test(
    message,
  );
}

/**
 * Per-provider retry options, matching the chat tool's historical behavior.
 * @param {object} config
 * @param {string} providerName
 * @returns {object}
 */
export function getProviderRetryOptions(config, providerName) {
  const nodeEnv = config?.environment?.nodeEnv || process.env.NODE_ENV;
  const isTest = nodeEnv === 'test';

  return {
    retries: isTest ? 1 : 3,
    delay: isTest ? 0 : 500,
    maxDelay: isTest ? 0 : 10000,
    operation: `provider-invoke:${providerName}`,
  };
}

/**
 * The single cross-feedback refinement prompt template. This is now the only
 * template — there is no per-call override.
 * @param {string} prompt - Original question
 * @param {Array} successful - Successful phase-1 results
 * @returns {string}
 */
function buildFeedbackPrompt(prompt, successful) {
  return `Based on the other AI responses below, please refine your answer to the original question. Consider different perspectives and provide your final response:

Original Question: ${prompt}

Other AI Responses:
${successful.map((r, i) => `${i + 1}. ${r.model}: ${r.response}`).join('\n\n')}

Please provide your refined response:`;
}

/**
 * Join every call's accumulated streaming content for the unified
 * `accumulated_content` field shown by check_status.
 * @param {object} contents - Map of index -> accumulated text
 * @returns {string}
 */
function combineContents(contents) {
  return Object.values(contents)
    .filter((content) => content && content.length > 0)
    .join('\n\n---\n\n');
}

/**
 * Invoke a single candidate, streaming through the normalizer when a job context
 * is present (updating flat `provider_${index}_*` progress keys) or performing a
 * plain invoke otherwise.
 * @returns {Promise<object>} Provider response { content, metadata }
 */
async function invokeCandidate({
  candidate,
  messages,
  options,
  index,
  phaseLabel,
  context,
  streamNormalizer,
  providerContents,
}) {
  // Reset this call's partial content at the start of every attempt so a retried
  // or failed-over attempt never leaves stale streamed text behind.
  providerContents[index] = '';

  if (!context) {
    const response = await candidate.providerInstance.invoke(messages, options);
    if (response?.content) {
      providerContents[index] = response.content;
    }
    return response;
  }

  await context.updateJob({
    [`provider_${index}_status`]: 'prompting',
    [`provider_${index}_model`]: candidate.displayModel,
  });

  const { stream, response: acquiredResponse } = await acquireProviderStream(
    candidate.providerInstance,
    messages,
    options,
  );
  let response = acquiredResponse;

  if (stream) {
    const normalizedStream = streamNormalizer.normalize(candidate.name, stream, {
      provider: candidate.name,
      model: options.model,
      requestId: `${context.jobId}-${phaseLabel}-${index}`,
    });

    let accumulatedContent = '';
    let finalUsage = null;
    let finalMetadata = {};

    await context.updateJob({ [`provider_${index}_status`]: 'streaming' });

    for await (const event of normalizedStream) {
      if (context.signal?.aborted) {
        throw new Error('Execution was cancelled');
      }

      switch (event.type) {
      case 'delta':
        accumulatedContent += event.data.textDelta;
        providerContents[index] = accumulatedContent;
        await context.updateJob({
          [`provider_${index}_preview`]:
              accumulatedContent.length > 150
                ? accumulatedContent.substring(0, 150) + '...'
                : accumulatedContent,
          accumulated_content: combineContents(providerContents),
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
      metadata: { ...finalMetadata, usage: finalUsage, streaming: true },
    };
    providerContents[index] = accumulatedContent;
  } else {
    if (!response) {
      response = await candidate.providerInstance.invoke(messages, options);
    }
    if (response?.content) {
      providerContents[index] = response.content;
      await context.updateJob({
        accumulated_content: combineContents(providerContents),
      });
    }
  }

  return response;
}

/**
 * Run one fan-out phase over the given call plans.
 * @param {object} params
 * @returns {Promise<Array>} Per-call-plan results
 */
async function runPhase({
  callPlans,
  buildMessagesForCandidate,
  optionsForCandidate,
  activeSignal,
  context,
  streamNormalizer,
  progressKey,
  phaseWord,
  phaseLabel,
  retryOptionsFor,
}) {
  const providerContents = {};
  const totalCount = callPlans.length;
  let completedCount = 0;

  if (context) {
    await context.updateJob({
      [progressKey]: `0/${totalCount}${phaseWord ? ` ${phaseWord}` : ''}`,
    });
  }

  const settled = await Promise.allSettled(
    callPlans.map(async (callPlan, index) => {
      let lastError = null;

      for (let ci = 0; ci < callPlan.candidates.length; ci++) {
        const candidate = callPlan.candidates[ci];

        // Never fail over (or start a new candidate) once aborted.
        if (activeSignal?.aborted) {
          throw new Error('Execution was cancelled');
        }

        const messages = buildMessagesForCandidate(candidate, callPlan);
        const options = {
          ...optionsForCandidate(candidate, callPlan),
          signal: activeSignal,
        };

        try {
          const attempt = () =>
            invokeCandidate({
              candidate,
              messages,
              options,
              index,
              phaseLabel,
              context,
              streamNormalizer,
              providerContents,
            });

          const retryOpts = retryOptionsFor
            ? retryOptionsFor(candidate.name)
            : null;
          const response = retryOpts
            ? await retryWithBackoff(attempt, retryOpts)
            : await attempt();

          if (!response || !response.content) {
            throw new Error('Provider returned invalid response');
          }

          completedCount++;
          if (context) {
            await context.updateJob({
              [progressKey]: `${completedCount}/${totalCount}${phaseWord ? ` ${phaseWord}` : ''}`,
              [`provider_${index}_status`]: 'finished',
            });
          }

          return {
            modelSpec: callPlan.modelSpec,
            model: callPlan.displayModel,
            provider: candidate.name,
            providerInstance: candidate.providerInstance,
            resolvedModel: candidate.resolvedModel,
            threadKey: callPlan.threadKey,
            status: 'success',
            response: response.content,
            metadata: response.metadata || {},
          };
        } catch (error) {
          lastError = error;

          // Cancellation aborts the whole phase — never demote to failed or fail over.
          if (activeSignal?.aborted || error.name === 'AbortError') {
            throw error;
          }

          // Clear this call's streamed preview/partial before the next candidate.
          if (context) {
            providerContents[index] = '';
            await context.updateJob({
              [`provider_${index}_status`]: 'failed',
              [`provider_${index}_error`]: error.message,
              [`provider_${index}_preview`]: null,
              accumulated_content: combineContents(providerContents),
            });
          }

          const isLastCandidate = ci === callPlan.candidates.length - 1;
          if (isLastCandidate || !shouldFailoverToNextProvider(error)) {
            return {
              modelSpec: callPlan.modelSpec,
              model: callPlan.displayModel,
              provider: candidate.name,
              resolvedModel: candidate.resolvedModel,
              threadKey: callPlan.threadKey,
              status: 'failed',
              error: error.message,
              metadata: {},
            };
          }
          // otherwise continue to the next candidate
        }
      }

      return {
        modelSpec: callPlan.modelSpec,
        model: callPlan.displayModel,
        threadKey: callPlan.threadKey,
        status: 'failed',
        error: (lastError && lastError.message) || 'Unknown error',
        metadata: {},
      };
    }),
  );

  return settled.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    // A rejected settle means cancellation propagated; re-throw to the caller so
    // the shell/job runner treats the whole operation as cancelled.
    throw result.reason instanceof Error
      ? result.reason
      : new Error(callPlans[index] ? 'Execution was cancelled' : 'Execution failed');
  });
}

/**
 * Run `chat` mode: a single fan-out phase with per-call candidate failover.
 * @param {object} params
 * @returns {Promise<{results: Array}>}
 */
export async function runChatMode({
  callPlans,
  buildMessagesForCandidate,
  optionsForCandidate,
  signal,
  context = null,
  providerStreamNormalizer,
  retryOptionsFor,
}) {
  const activeSignal = context ? context.signal : signal;

  const results = await runPhase({
    callPlans,
    buildMessagesForCandidate,
    optionsForCandidate,
    activeSignal,
    context,
    streamNormalizer: providerStreamNormalizer,
    progressKey: 'chat_progress',
    phaseWord: '',
    phaseLabel: 'chat',
    retryOptionsFor,
  });

  return { results };
}

/**
 * Run `consensus` mode: an initial fan-out phase, then (when ≥2 phase-1 responses
 * succeeded and the request was not aborted) a cross-feedback refinement phase.
 * @param {object} params
 * @returns {Promise<{initial: Array, refined: Array|null}>}
 */
export async function runConsensusMode({
  callPlans,
  buildMessagesForCandidate,
  optionsForCandidate,
  prompt,
  signal,
  context = null,
  providerStreamNormalizer,
}) {
  const activeSignal = context ? context.signal : signal;

  const initial = await runPhase({
    callPlans,
    buildMessagesForCandidate,
    optionsForCandidate,
    activeSignal,
    context,
    streamNormalizer: providerStreamNormalizer,
    progressKey: 'consensus_progress',
    phaseWord: 'initial',
    phaseLabel: 'initial',
    retryOptionsFor: null,
  });

  const successful = initial.filter((r) => r.status === 'success');

  let refined = null;

  // Refinement runs whenever ≥2 phase-1 responses succeeded (no gating flag).
  if (successful.length > 1 && !activeSignal?.aborted) {
    logger.debug('Running cross-feedback refinement phase', {
      data: { responseCount: successful.length },
    });

    const feedbackPrompt = buildFeedbackPrompt(prompt, successful);

    const refineCallPlans = successful.map((r) => ({
      modelSpec: r.modelSpec,
      displayModel: r.model,
      threadKey: r.threadKey,
      initialResponse: r.response,
      candidates: [
        {
          name: r.provider,
          providerInstance: r.providerInstance,
          resolvedModel: r.resolvedModel,
          displayModel: r.model,
        },
      ],
    }));

    const refinedResults = await runPhase({
      callPlans: refineCallPlans,
      buildMessagesForCandidate: (candidate, callPlan) => [
        ...buildMessagesForCandidate(candidate, callPlan),
        { role: 'assistant', content: callPlan.initialResponse },
        { role: 'user', content: feedbackPrompt },
      ],
      optionsForCandidate,
      activeSignal,
      context,
      streamNormalizer: providerStreamNormalizer,
      progressKey: 'consensus_progress',
      phaseWord: 'refined',
      phaseLabel: 'refinement',
      retryOptionsFor: null,
    });

    // Map refinement outcomes back onto the phase-1 successes.
    refined = refinedResults.map((result) => {
      const initialResult = successful.find(
        (s) => s.modelSpec === result.modelSpec,
      );
      return {
        model: result.model,
        provider: result.provider,
        initial_response: initialResult ? initialResult.response : null,
        refined_response: result.status === 'success' ? result.response : null,
        refined_metadata: result.status === 'success' ? result.metadata : {},
        refined_error: result.status === 'failed' ? result.error : null,
        status: result.status === 'success' ? 'success' : 'partial',
      };
    });
  }

  return { initial, refined };
}
