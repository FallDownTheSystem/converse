/**
 * Decide Tool - System One decision models
 *
 * Asks a decision model (OpenAI's gpt-6-luna, TypeSafe's Jev, Cloudflare's
 * Clef) typed questions about a state and returns calibrated answers: a
 * probability for yes/no questions, a probability distribution for choices
 * and rubric scores. Decision models never generate text, so this is a
 * separate tool rather than a chat mode. Questions and answers use the System
 * One schema whatever the host; providers translate.
 */

import { createToolResponse, createToolError } from './index.js';
import { askDecisionModel, resolveDecisionModel } from '../decisionProviders/index.js';
import { isLabeledLevel } from '../decisionProviders/formats.js';
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
  for (const [index, level] of criteria.entries()) {
    const error = validateScoreLevel(level);
    if (error) return `${at}.criteria[${index}] ${error}`;
  }
  return null;
}

function validateScoreLevel(level) {
  if (!isLabeledLevel(level)) {
    return isCriterionValue(level) ? null : 'must be a non-empty description or { "label", "description" }.';
  }
  const unknown = Object.keys(level).filter((f) => f !== 'label' && f !== 'description');
  if (unknown.length) return `has unknown field(s): ${unknown.join(', ')}. A labeled level takes "label" and "description".`;
  if (typeof level.label !== 'string' || !level.label.trim()) return 'needs a non-empty "label" string.';
  if (level.description !== undefined && !isCriterionValue(level.description)) {
    return '"description" must be a non-empty string, object, or array.';
  }
  return null;
}

/**
 * Show each labeled level's short label in the score legend, whatever the
 * host echoed back: System One hosts only see the flattened description.
 */
function labelLegends(answers, questions) {
  return Object.fromEntries(
    Object.entries(answers).map(([key, answer]) => {
      const levels = questions[key]?.type === 'score' ? questions[key].criteria : null;
      if (answer?.type !== 'score' || !levels?.some(isLabeledLevel)) return [key, answer];
      const legend = Object.fromEntries(
        levels.map((level, i) => [String(i), isLabeledLevel(level) ? level.label : answer.legend?.[i] ?? level]),
      );
      return [key, { ...answer, legend }];
    }),
  );
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
      problems.push(`${file.originalPath}: not a text file (pass images in "images")`);
    } else {
      contents[file.originalPath] = file.content;
    }
  }
  if (result.errors?.length) problems.push(...result.errors.map((e) => e.message));
  return problems.length ? { error: problems.join('; ') } : { contents };
}

// The formats every image-capable host accepts (Clef takes no GIF or BMP).
const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const DATA_URL = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/i;

/**
 * Load images from paths or base64 data URLs into `{ mimeType, base64 }`.
 * Every image must load: judging a partial set would change the answer.
 */
async function loadImages(images, contextProcessor, config) {
  const loaded = new Array(images.length);
  const problems = [];
  const paths = [];
  images.forEach((image, i) => {
    if (!image.startsWith('data:')) {
      paths.push(i);
      return;
    }
    const match = image.match(DATA_URL);
    if (!match) problems.push(`image ${i + 1}: not a base64 data URL`);
    else loaded[i] = { mimeType: match[1].toLowerCase(), base64: match[2].replace(/\s/g, '') };
  });

  if (paths.length > 0) {
    const pathList = paths.map((i) => images[i]);
    const validation = await validateAllPaths({ images: pathList }, { clientCwd: config?.server?.client_cwd });
    if (!validation.valid) return { error: validation.errors.join('; ') };
    const result = await contextProcessor.processUnifiedContext(
      { images: pathList },
      { enforceSecurityCheck: false, skipSecurityCheck: true, clientCwd: config?.server?.client_cwd },
    );
    result.images.forEach((file, j) => {
      if (file.type === 'error') problems.push(`${file.originalPath}: ${file.error}`);
      else if (file.type !== 'image') problems.push(`${file.originalPath}: not an image file`);
      else loaded[paths[j]] = { mimeType: file.mimeType, base64: file.content };
    });
    if (result.errors?.length) problems.push(...result.errors.map((e) => e.message));
  }

  loaded.forEach((image, i) => {
    if (image && !IMAGE_MIME_TYPES.includes(image.mimeType)) {
      problems.push(`image ${i + 1}: ${image.mimeType} is not supported (use PNG, JPEG, or WebP)`);
    }
  });
  return problems.length ? { error: problems.join('; ') } : { images: loaded };
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
    // Quoted so a numeric label ("4") stays distinct from its level index (3).
    const label = (k) => (answer.legend?.[k] ? `${k} "${answer.legend[k]}"` : k);
    return `- ${key} (score): ${fixed(answer.score)}${range} · confidence ${fixed(answer.confidence)} · ${byProbability(answer.probabilities, label)}`;
  }
  if (type === 'refusal') {
    return `- ${key} (refusal): the model declined to answer`;
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
    lines.push(`(${failure.provider} ${failure.notSent ? 'skipped' : 'failed'}, fell back: ${failure.message})`);
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
 * @param {string[]} [args.images] - Image paths or base64 data URLs
 * @param {object} dependencies - Injected dependencies (config, contextProcessor, signal)
 * @returns {Promise<object>} MCP tool response
 */
export async function decideTool(args, dependencies) {
  const { config, contextProcessor, signal } = dependencies;
  const { state, questions, model = 'auto', files = [], images = [] } = args;

  if (!Array.isArray(files) || !files.every((f) => typeof f === 'string' && f.trim())) {
    return createToolError('"files" must be an array of file paths.');
  }
  if (!Array.isArray(images) || !images.every((i) => typeof i === 'string' && i.trim())) {
    return createToolError('"images" must be an array of image paths or base64 data URLs.');
  }
  if (state === undefined && files.length === 0 && images.length === 0) {
    return createToolError('Provide "state", "files", or "images": there is nothing to judge.');
  }
  const stateError = state === undefined ? null : validateState(state);
  if (stateError) return createToolError(stateError);
  const questionError = validateQuestions(questions);
  if (questionError) return createToolError(questionError);

  const route = resolveDecisionModel(model, config);
  if (route.status !== 'ok') return createToolError(route.error);
  const candidates = route.candidates.filter((c) => c.maxImages >= images.length);
  if (candidates.length === 0) {
    return createToolError(
      `"${model}" cannot take ${images.length} image(s) on any configured host. ` +
      'Images work with gpt-6-luna (OpenAI) and clef / clef-flash (Cloudflare, up to 4); Jev and OpenRouter routes are text only.',
    );
  }

  let finalState = state;
  if (files.length > 0) {
    const loaded = await loadFiles(files, contextProcessor, config);
    if (loaded.error) return createToolError(`Could not load files: ${loaded.error}`);
    finalState = state === undefined ? { files: loaded.contents } : { input: state, files: loaded.contents };
  }
  let loadedImages = [];
  if (images.length > 0) {
    const loaded = await loadImages(images, contextProcessor, config);
    if (loaded.error) return createToolError(`Could not load images: ${loaded.error}`);
    loadedImages = loaded.images;
  }

  const failures = [];
  // A request fault on one host repeats on every host of the same model, but
  // another model behind a different API may still accept the request.
  const rejectedFamilies = new Set();
  for (const candidate of candidates) {
    if (rejectedFamilies.has(candidate.family)) continue;
    try {
      const response = await askDecisionModel(candidate, { state: finalState, questions, images: loadedImages, config, signal });
      const answers = labelLegends(response.answers, questions);
      return createToolResponse(formatResult({ ...response, answers }, candidate, failures));
    } catch (error) {
      if (signal?.aborted) return createToolError('Decision request cancelled.');
      logger.error('Decision request failed', { provider: candidate.providerName, model: candidate.model, error: error.message });
      failures.push({ provider: candidate.providerName, message: error.message, notSent: Boolean(error.notSent) });
      if (error.terminal) rejectedFamilies.add(candidate.family);
    }
  }

  const noneSent = failures.every((f) => f.notSent);
  const detail = failures.map((f) => `${f.provider}${f.notSent && !noneSent ? ', not sent' : ''}: ${f.message}`).join('; ');
  return createToolError(`Decision request ${noneSent ? 'not sent' : 'failed'} (${detail})`);
}

decideTool.description =
  'DECIDE — ask a decision model (OpenAI gpt-6-luna, TypeSafe Jev, Cloudflare Clef) typed questions about a state and get calibrated answers, not text. ' +
  'Question types: "noul" (yes/no → probability 0..1), "choice" (pick one of 2–255 named options → choice, per-option probabilities, confidence), ' +
  '"score" (ordered rubric of 2–10 levels → weighted position, per-level probabilities, confidence). ' +
  'Batch independent questions over the same state into one call: they are judged in parallel and in isolation, so none sees another\'s answer; each extra question adds its own input tokens. ' +
  'Best for fast semantic judgments (classify, route, select, verify, rank). Ask one narrow, coherent judgment per question, with its full meaning in the question; ' +
  'split independently useful dimensions, but a bounded action choice or contextual interpretation is a valid single question. Do counting, arithmetic, and date comparison in code. ' +
  'confidence measures how concentrated the distribution is, not permission to act: take the top option to pick a best, and treat a noul near 0.5 as "yes and no equally likely". ' +
  'No explanations are returned. Images (PNG/JPEG/WebP) work with gpt-6-luna and Clef (up to 4, ~180 KB total); Jev is text only, and "auto" skips models that cannot take the images. ' +
  'gpt-6-luna may answer a question with type "refusal" instead of a value: treat it as unanswered, never as a no. ' +
  'Limits per model: Jev ~64k tokens per request (~32k for state plus the longest question); Clef ~64k tokens and at most 64 questions named with letters, digits, "_", ".", "-".';

decideTool.inputSchema = {
  type: 'object',
  properties: {
    state: {
      anyOf: [{ type: 'string' }, { type: 'object' }, { type: 'array' }],
      description:
        'The material to judge: plain text, or JSON (an object with descriptively named fields is best; an array for sequences such as messages). Optional when "files" or "images" are given.',
    },
    questions: {
      type: 'object',
      description:
        'Named questions, all answered against the same state. The name is your own label and is returned as the answer key. ' +
        'Each question: { "type": "noul"|"choice"|"score", "instructions": string|object|array, "criteria": ... }. ' +
        'criteria — noul: optional { "true": "...", "false": "..." }; choice: required { "<option>": "description" | null } (2–255 options); ' +
        'score: required ordered array of levels, lowest first (2–10 levels); each level is a description, or { "label": "Short name", "description": "..." } to keep the legend short. ' +
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
        'Decision model. "auto" (default): gpt-6-luna, then jev-latest, then clef, each on every configured host. ' +
        'A model name ("gpt-6-luna"/"luna", "jev-latest"/"jev", "jev-1.13", "jev-preview", "clef", "clef-flash"): its native host first, falling back to OpenRouter. ' +
        '"provider:model" (e.g. "openai:gpt-6-luna", "cloudflare:clef-flash", "openrouter:jev-latest"): that provider only. ' +
        'Providers: openai (OPENAI_API_KEY), typesafe (TYPESAFE_API_KEY), cloudflare (CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN), openrouter (OPENROUTER_API_KEY).',
    },
    files: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Text files added to the state as { "files": { "<path>": "<content>" } }; a given state moves to "input". Supports line ranges: file.txt{10:50}. Image files belong in "images".',
    },
    images: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Images judged together with the state: file paths or base64 data URLs, PNG/JPEG/WebP. Refer to them in questions ("Does the image show ..."). ' +
        'Supported by gpt-6-luna and clef/clef-flash (Clef: up to 4, about 180 KB in total); other models are skipped or rejected.',
    },
  },
  required: ['questions'],
  additionalProperties: false,
};
