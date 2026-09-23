/**
 * Decide Tool - System One decision models
 *
 * Asks a decision model (TypeSafe's Jev family) typed questions about a state
 * and returns calibrated answers: a probability for yes/no questions, a
 * probability distribution for choices and rubric scores. Decision models
 * never generate text, so this is a separate tool rather than a chat mode.
 */

import { createToolResponse, createToolError } from './index.js';
import { resolveDecisionModel } from '../decisionProviders/index.js';
import { callSystemOne } from '../decisionProviders/systemOne.js';
import { validateAllPaths } from '../utils/fileValidator.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('decide');

const QUESTION_TYPES = ['noul', 'choice', 'score'];
const QUESTION_FIELDS = ['type', 'instructions', 'criteria'];
const MAX_CHOICE_OPTIONS = 255;
const MIN_SCORE_LEVELS = 2;
const MAX_SCORE_LEVELS = 10;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Criteria descriptions may be plain text or structured reference data. */
function isCriterionValue(value) {
  return (typeof value === 'string' && value.trim() !== '') || isPlainObject(value) || Array.isArray(value);
}

function validateState(state) {
  if (typeof state === 'string') {
    return state.trim() ? null : '"state" must not be empty.';
  }
  if (isPlainObject(state) || Array.isArray(state)) return null;
  return '"state" must be a string, an object, or an array.';
}

function validateQuestion(key, question) {
  const at = `questions.${key}`;
  if (!isPlainObject(question)) return `${at} must be an object with "type" and "instructions".`;

  const unknown = Object.keys(question).filter((f) => !QUESTION_FIELDS.includes(f));
  if (unknown.length) {
    return `${at} has unknown field(s): ${unknown.join(', ')}. Allowed: ${QUESTION_FIELDS.join(', ')}.`;
  }
  if (!QUESTION_TYPES.includes(question.type)) {
    return `${at}.type must be one of: ${QUESTION_TYPES.join(', ')}.`;
  }

  const { instructions, criteria } = question;
  const hasInstructions =
    (typeof instructions === 'string' && instructions.trim() !== '') ||
    (isPlainObject(instructions) && Object.keys(instructions).length > 0) ||
    (Array.isArray(instructions) && instructions.length > 0);
  if (!hasInstructions) {
    return `${at}.instructions must be a non-empty string, object, or array.`;
  }

  if (question.type === 'noul') {
    if (criteria === undefined) return null;
    const keys = isPlainObject(criteria) ? Object.keys(criteria).sort() : null;
    if (!keys || keys.join(',') !== 'false,true' || !isCriterionValue(criteria.true) || !isCriterionValue(criteria.false)) {
      return `${at}.criteria for a noul question must be { "true": "...", "false": "..." } with both descriptions.`;
    }
    return null;
  }

  if (question.type === 'choice') {
    if (!isPlainObject(criteria)) {
      return `${at}.criteria for a choice question must map option names to descriptions (or null).`;
    }
    const options = Object.entries(criteria);
    if (options.length < 2 || options.length > MAX_CHOICE_OPTIONS) {
      return `${at}.criteria must have 2 to ${MAX_CHOICE_OPTIONS} options (got ${options.length}).`;
    }
    const bad = options.filter(([, v]) => v !== null && !isCriterionValue(v)).map(([k]) => k);
    if (bad.length) {
      return `${at}.criteria option(s) ${bad.join(', ')} need a description string, object, array, or null.`;
    }
    return null;
  }

  if (!Array.isArray(criteria)) {
    return `${at}.criteria for a score question must be an ordered array of level descriptions.`;
  }
  if (criteria.length < MIN_SCORE_LEVELS || criteria.length > MAX_SCORE_LEVELS) {
    return `${at}.criteria must have ${MIN_SCORE_LEVELS} to ${MAX_SCORE_LEVELS} levels (got ${criteria.length}).`;
  }
  if (!criteria.every(isCriterionValue)) {
    return `${at}.criteria levels must each be a non-empty description.`;
  }
  return null;
}

/**
 * Check questions locally: the API reports schema faults as nested validation
 * dumps, and a local message is both clearer and free.
 * @returns {string|null} First problem found
 */
export function validateQuestions(questions) {
  if (!isPlainObject(questions) || Object.keys(questions).length === 0) {
    return '"questions" must be an object with at least one named question.';
  }
  for (const [key, question] of Object.entries(questions)) {
    if (!key.trim()) return 'Question names must not be empty.';
    const error = validateQuestion(key, question);
    if (error) return error;
  }
  return null;
}

/**
 * Read files into a `{ path: content }` map. Every file must load as text:
 * a silently missing file would change the state being judged.
 */
async function loadFiles(files, contextProcessor, config) {
  const validation = await validateAllPaths(
    { files },
    { clientCwd: config?.server?.client_cwd },
  );
  if (!validation.valid) {
    return { error: validation.errors.join('; ') };
  }

  const result = await contextProcessor.processUnifiedContext(
    { files },
    { enforceSecurityCheck: false, skipSecurityCheck: true, clientCwd: config?.server?.client_cwd },
  );
  const problems = [];
  const contents = {};
  for (const file of result.files) {
    if (file.type === 'error') {
      problems.push(`${file.originalPath}: ${file.error}`);
    } else if (file.type !== 'text') {
      problems.push(`${file.originalPath}: decision models accept text only`);
    } else {
      contents[file.originalPath] = file.content;
    }
  }
  if (result.errors?.length) problems.push(...result.errors.map((e) => e.message));
  return problems.length ? { error: problems.join('; ') } : { contents };
}

function fixed(n) {
  return typeof n === 'number' ? n.toFixed(2) : String(n);
}

/**
 * Options at or rounding to zero are left out of the summary line; the JSON
 * block still carries the full distribution.
 */
function byProbability(probabilities, label = (k) => k) {
  return Object.entries(probabilities || {})
    .filter(([, p]) => fixed(p) !== '0.00')
    .sort(([, a], [, b]) => b - a)
    .map(([k, p]) => `${label(k)} ${fixed(p)}`)
    .join(', ');
}

function summarizeAnswer(key, answer) {
  const type = answer?.type ?? 'unknown';
  if (type === 'noul') {
    return `- ${key} (noul): ${fixed(answer.noul)}`;
  }
  if (type === 'choice') {
    return `- ${key} (choice): ${answer.choice} · confidence ${fixed(answer.confidence)} · ${byProbability(answer.probabilities)}`;
  }
  if (type === 'score') {
    const levels = Object.keys(answer.legend || answer.probabilities || {});
    const range = levels.length ? ` on 0–${levels.length - 1}` : '';
    const label = (k) => (answer.legend?.[k] ? `${k} ${answer.legend[k]}` : k);
    return `- ${key} (score): ${fixed(answer.score)}${range} · confidence ${fixed(answer.confidence)} · ${byProbability(answer.probabilities, label)}`;
  }
  return `- ${key} (${type}): ${JSON.stringify(answer)}`;
}

function formatResult(response, candidate, failures) {
  const usage = response.usage || {};
  const header = [
    `Decision · ${response.model || candidate.model} via ${candidate.provider.label}`,
    usage.input_tokens !== undefined ? `${usage.input_tokens} input tokens` : null,
    typeof usage.cost === 'number' ? `$${usage.cost.toFixed(6)}` : null,
  ].filter(Boolean).join(' · ');

  const lines = [header];
  for (const failure of failures) {
    lines.push(`(${failure.provider} failed, fell back: ${failure.message})`);
  }
  lines.push(...Object.entries(response.answers).map(([key, answer]) => summarizeAnswer(key, answer)));

  const payload = {
    model: response.model ?? candidate.model,
    provider: candidate.providerName,
    answers: response.answers,
    usage: {
      input_tokens: usage.input_tokens ?? null,
      output_tokens: usage.output_tokens ?? null,
      cost: typeof usage.cost === 'number' ? usage.cost : null,
    },
    ...(response.id ? { id: response.id } : {}),
  };
  return `${lines.join('\n')}\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
}

/**
 * Decide MCP Tool
 * @param {object} args - Tool arguments
 * @param {string|object|Array} [args.state] - Material to judge
 * @param {object} args.questions - Named typed questions
 * @param {string} [args.model] - Model spec, default "auto"
 * @param {string[]} [args.files] - Text files added to the state
 * @param {object} dependencies - Injected dependencies (config, contextProcessor, signal)
 * @returns {Promise<object>} MCP tool response
 */
export async function decideTool(args, dependencies) {
  const { config, contextProcessor, signal } = dependencies;
  const { state, questions, model = 'auto', files = [] } = args;

  if (!Array.isArray(files) || !files.every((f) => typeof f === 'string' && f.trim())) {
    return createToolError('"files" must be an array of file paths.');
  }
  if (state === undefined && files.length === 0) {
    return createToolError('Provide "state", "files", or both: there is nothing to judge.');
  }
  const stateError = state === undefined ? null : validateState(state);
  if (stateError) return createToolError(stateError);
  const questionError = validateQuestions(questions);
  if (questionError) return createToolError(questionError);

  const route = resolveDecisionModel(model, config);
  if (route.status !== 'ok') return createToolError(route.error);

  let finalState = state;
  if (files.length > 0) {
    const loaded = await loadFiles(files, contextProcessor, config);
    if (loaded.error) return createToolError(`Could not load files: ${loaded.error}`);
    finalState = state === undefined ? { files: loaded.contents } : { input: state, files: loaded.contents };
  }

  const failures = [];
  for (const candidate of route.candidates) {
    try {
      const response = await callSystemOne({
        baseURL: candidate.provider.baseURL,
        headers: candidate.provider.headers(config),
        body: { model: candidate.model, state: finalState, questions },
        signal,
      });
      return createToolResponse(formatResult(response, candidate, failures));
    } catch (error) {
      if (signal?.aborted) return createToolError('Decision request cancelled.');
      logger.error('Decision request failed', { provider: candidate.providerName, model: candidate.model, error: error.message });
      failures.push({ provider: candidate.providerName, message: error.message });
      if (error.terminal) break;
    }
  }

  const detail = failures.map((f) => `${f.provider}: ${f.message}`).join('; ');
  return createToolError(`Decision request failed (${detail})`);
}

decideTool.description =
  'DECIDE — ask a System One decision model (TypeSafe Jev) typed questions about a state and get calibrated answers, not text. ' +
  'Question types: "noul" (yes/no → probability 0..1), "choice" (pick one of 2–255 named options → choice, per-option probabilities, confidence), ' +
  '"score" (ordered rubric of 2–10 levels → weighted position, per-level probabilities, confidence). ' +
  'Batch independent questions over the same state into one call: they are judged in parallel and in isolation, so none sees another\'s answer; each extra question adds its own input tokens. ' +
  'Best for fast semantic judgments (classify, route, select, verify, rank). Ask one narrow, coherent judgment per question, with its full meaning in the question; ' +
  'split independently useful dimensions, but a bounded action choice or contextual interpretation is a valid single question. Do counting, arithmetic, and date comparison in code. ' +
  'confidence measures how concentrated the distribution is, not permission to act: take the top option to pick a best, and treat a noul near 0.5 as "yes and no equally likely". ' +
  'Text only, no explanations are returned. ' +
  'Limits: ~64k tokens per request, ~32k for state plus the longest question.';

decideTool.inputSchema = {
  type: 'object',
  properties: {
    state: {
      anyOf: [{ type: 'string' }, { type: 'object' }, { type: 'array' }],
      description:
        'The material to judge: plain text, or JSON (an object with descriptively named fields is best; an array for sequences such as messages). Optional when "files" is given.',
    },
    questions: {
      type: 'object',
      description:
        'Named questions, all answered against the same state. The name is your own label and is returned as the answer key. ' +
        'Each question: { "type": "noul"|"choice"|"score", "instructions": string|object|array, "criteria": ... }. ' +
        'criteria — noul: optional { "true": "...", "false": "..." }; choice: required { "<option>": "description" | null } (2–255 options); ' +
        'score: required ordered array of level descriptions, lowest first (2–10 levels). ' +
        'instructions may be an object bundling the question with reference data, referenced by `name` in the text. ' +
        'Example: { "team": { "type": "choice", "instructions": "Which team should handle this?", "criteria": { "billing": "Payments, refunds", "technical": "Bugs, outages" } } }',
      additionalProperties: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: QUESTION_TYPES },
          instructions: { anyOf: [{ type: 'string' }, { type: 'object' }, { type: 'array' }] },
          criteria: { anyOf: [{ type: 'object' }, { type: 'array' }] },
        },
        required: ['type', 'instructions'],
        additionalProperties: false,
      },
    },
    model: {
      type: 'string',
      description:
        'Decision model. "auto" (default): TypeSafe, falling back to OpenRouter. "jev-latest", "jev-1.13": first configured provider that serves it, with fallback. ' +
        '"typesafe:jev-1.13.0", "openrouter:~typesafe/jev-latest": that provider only. Providers: typesafe (TYPESAFE_API_KEY), openrouter (OPENROUTER_API_KEY).',
    },
    files: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Text files added to the state as { "files": { "<path>": "<content>" } }; a given state moves to "input". Supports line ranges: file.txt{10:50}. Images are rejected.',
    },
  },
  required: ['questions'],
  additionalProperties: false,
};
