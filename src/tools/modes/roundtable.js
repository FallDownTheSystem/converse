/**
 * Roundtable Mode Engine
 *
 * Turn-based multi-model round-table. Models respond SEQUENTIALLY in the order
 * given; each model sees the full running transcript (prior laps + earlier turns
 * in the current lap) and builds on it. One tool call runs exactly one lap (one
 * turn per model); the caller drives more laps by passing back the continuation_id.
 *
 * This is the sequential counterpart to the parallel engine. It is an execution
 * core: it resolves the turn plan, runs the lap loop, and RETURNS the lap data
 * (turns, transcript, counts). Persistence, export, and MCP-response construction
 * live in the unified chat tool's shared shell.
 *
 * CRITICAL provider constraint: SDK providers (codex, claude, copilot) reduce the
 * message array to ONLY the last `user` message. Therefore each turn's entire
 * context (prior-lap transcript + lap prompt + same-lap turns + framing) is packed
 * into a SINGLE self-contained final user message ("turn packet"). Do not spread
 * turn context across multiple messages.
 */

import { debugLog } from '../../utils/console.js';
import { acquireProviderStream } from './streamShared.js';
import {
  getDefaultModelForProvider,
  getProviderUnavailableMessage,
  getAvailableProviders,
  resolveModelSpec,
} from '../../utils/modelRouting.js';

/**
 * Render a stored transcript (from prior laps or a prior chat/consensus thread)
 * into labeled text that can be embedded in the next turn's packet. Stored state
 * pairs user (prompt) and assistant (response) messages; we re-render those as
 * readable context so last-user-only SDK providers still see the history (and so
 * a provider does not mistake prior multi-speaker transcript for its own previous
 * output). Also used by the parallel engine's shell to pack prior history into a
 * resumed chat/consensus turn.
 * @param {Array} storedMessages - Stored messages from a prior conversation state
 * @returns {string} Labeled prior-transcript text ('' for a new conversation)
 */
export function renderStoredTranscriptToText(storedMessages = []) {
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
function buildFramingText({ i, models }) {
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

  return lines.join('\n');
}

/**
 * Build the single self-contained turn packet TEXT for the model at position `i`.
 * Order: prior-transcript section, lap prompt, same-lap turns, framing.
 * This is the LAST user message — the only thing last-user-only SDK providers see.
 * @param {object} params
 * @returns {string} Turn packet text
 */
function buildTurnPacket({ priorTranscriptText, prompt, sameLapTurns, i, models }) {
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

  parts.push(buildFramingText({ i, models }));

  return parts.join('\n\n');
}

/**
 * Format the full lap transcript for storage/display.
 * @param {Array} lapTurns - Turns from the current lap
 * @returns {string} Formatted transcript
 */
export function formatLapTranscript(lapTurns) {
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
 * Resolve the ordered model list into a turn plan. Unlike the parallel engine,
 * unknown or unavailable models are NOT dropped — they are recorded with a
 * preFailReason so they keep their position in the order (and produce a failed
 * turn).
 * @param {Array<string>} models - Ordered model list
 * @param {object} providers - Provider instances
 * @param {object} config - Configuration
 * @param {boolean} hasImages - Whether the request includes images
 * @returns {Array<object>} Ordered turn plan entries
 */
export function resolveTurnPlan(models, providers, config, hasImages = false) {
  // Single "auto" expands to the first available provider's default model only
  // (a single-model round-table is valid). Multiple explicit models resolve per-entry.
  let modelsToProcess = models;
  if (models.length === 1 && String(models[0]).toLowerCase() === 'auto') {
    const [firstAvailable] = getAvailableProviders(providers, config, {
      hasImages,
      limit: 1,
    });

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

    const { providerName, provider, resolvedModel, status } = resolveModelSpec(
      modelName,
      providers,
      config,
    );

    if (status === 'not_found') {
      return {
        model: modelName,
        provider: providerName,
        providerInstance: null,
        resolvedModel,
        preFailReason: `Provider not found: ${providerName}`,
      };
    }

    if (status === 'unavailable') {
      return {
        model: modelName,
        provider: providerName,
        providerInstance: null,
        resolvedModel,
        preFailReason: getProviderUnavailableMessage(providerName),
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
 * Execute a single turn. Streams (updating job progress) when a job context is
 * present; otherwise performs a plain invoke. Cancellation propagates by throwing
 * so the lap aborts rather than demoting to a failed turn.
 * @returns {Promise<object>} Turn result { model, provider, status, response|error }
 */
async function executeTurn(
  plan,
  messages,
  options,
  context,
  streamNormalizer,
  turnIndex,
) {
  // `options.signal` is the active signal for both sync (request signal) and
  // async (job context signal) paths.
  const activeSignal = options.signal;
  try {
    if (activeSignal?.aborted) {
      throw new Error('Roundtable execution was cancelled');
    }

    // Synchronous path (no job context): plain invoke.
    if (!context) {
      const response = await plan.providerInstance.invoke(messages, options);
      return {
        model: plan.model,
        provider: plan.provider,
        status: 'success',
        response: response.content,
        metadata: response.metadata || {},
      };
    }

    // Async path: stream and surface progress.
    const { stream, response: acquiredResponse } = await acquireProviderStream(
      plan.providerInstance,
      messages,
      options,
    );
    let response = acquiredResponse;

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
          throw new Error('Roundtable execution was cancelled');
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
    // Rethrow so it propagates to the caller (sync shell or job runner).
    if (activeSignal?.aborted || error.name === 'AbortError') {
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
 * Run one roundtable lap: one turn per model, in order, each seeing the full
 * running transcript. Returns the lap data for the shell to persist/format.
 *
 * @param {object} params
 * @param {Array<string>} params.models - Ordered model list
 * @param {string} params.prompt - Lap prompt
 * @param {Array} params.priorHistory - Loaded stored messages (may include a leading system msg)
 * @param {object|null} params.contextMessage - Files/images context message
 * @param {string} params.systemPrompt - System prompt for the roundtable mode
 * @param {object} params.providers - Provider instances
 * @param {object} params.config - Configuration
 * @param {AbortSignal} [params.signal] - Sync-path abort signal
 * @param {string} params.reasoning_effort - Reasoning depth
 * @param {boolean} params.hasImages - Whether the request includes images
 * @param {object|null} [params.context] - Job context (async) or null (sync)
 * @param {object} [params.providerStreamNormalizer] - Stream normalizer (async)
 * @returns {Promise<object>} { lapTurns, transcript, turnsSuccessful, turnsFailed, lapUserMessage }
 */
export async function runRoundtableLap({
  models,
  prompt,
  priorHistory,
  contextMessage,
  systemPrompt,
  providers,
  config,
  signal,
  reasoning_effort,
  hasImages,
  context = null,
  providerStreamNormalizer,
}) {
  const priorTranscriptText = renderStoredTranscriptToText(priorHistory);
  const turnPlan = resolveTurnPlan(models, providers, config, hasImages);
  const activeSignal = context ? context.signal : signal;

  if (context) {
    await context.updateJob({
      models_list: models.join(', '),
      roundtable_progress: `0/${turnPlan.length}`,
      total_turns: turnPlan.length,
      completed_turns: 0,
    });
  }

  const lapTurns = [];

  for (let i = 0; i < turnPlan.length; i++) {
    if (activeSignal?.aborted) {
      throw new Error('Roundtable execution was cancelled');
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
      });

      const finalUserContent = buildTurnUserContent(packetText, contextMessage);

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: finalUserContent },
      ];

      const turnResult = await executeTurn(
        plan,
        messages,
        {
          reasoning_effort,
          signal: activeSignal,
          config,
          model: plan.resolvedModel,
        },
        context,
        providerStreamNormalizer,
        i,
      );

      lapTurns.push({ ...turnResult, position: i });
    }

    if (context) {
      // Report per-turn progress with the running transcript. Use flat keys (not
      // a `progress` object) — asyncJobStore.update() treats the reserved
      // `progress` key as a numeric 0..1 value. Numeric overall progress is
      // supplied separately as a fraction.
      await context.updateJob({
        roundtable_progress: `${i + 1}/${turnPlan.length}`,
        accumulated_content: formatLapTranscript(lapTurns),
        progress: (i + 1) / turnPlan.length,
        total_turns: turnPlan.length,
        completed_turns: i + 1,
        current_model: plan.model,
      });
    }
  }

  const turnsSuccessful = lapTurns.filter((t) => t.status === 'success').length;
  const turnsFailed = lapTurns.length - turnsSuccessful;
  const transcript = formatLapTranscript(lapTurns);

  const lapUserMessage = {
    role: 'user',
    content: buildTurnUserContent(prompt, contextMessage),
  };

  debugLog(
    `[Roundtable] Lap completed: ${turnsSuccessful}/${lapTurns.length} turns succeeded`,
  );

  return {
    lapTurns,
    transcript,
    turnsSuccessful,
    turnsFailed,
    lapUserMessage,
  };
}
