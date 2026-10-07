/**
 * Decision wire formats
 *
 * The `decide` tool speaks System One: a `state`, a map of typed questions
 * (`noul` / `choice` / `score`), and a map of answers. Each format turns that
 * into one host's request body and maps the host's response back to System One
 * answer shapes, so the tool formats every host's answers the same way.
 *
 * Every format returns `{ model, answers, usage, id }` from `parse`.
 * `request(model, state, questions, images)` receives images as
 * `{ mimeType, base64 }`; `images: true` marks formats that can send them.
 */

import { DecisionError } from './http.js';

function asText(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function dataUrl(image) {
  return `data:${image.mimeType};base64,${image.base64}`;
}

/**
 * A score level given as `{ label, description? }` rather than a single
 * description. OpenAI's levels take that pair natively; System One only takes
 * one description per level.
 */
export function isLabeledLevel(level) {
  return level !== null && typeof level === 'object' && !Array.isArray(level) && 'label' in level;
}

function flattenLevel(level) {
  if (!isLabeledLevel(level)) return level;
  return level.description === undefined ? level.label : `${level.label}: ${asText(level.description)}`;
}

/** Rewrite labeled score levels into System One's one-description form. */
function toSystemOneQuestions(questions) {
  return Object.fromEntries(
    Object.entries(questions).map(([name, question]) =>
      question.type === 'score' && question.criteria.some(isLabeledLevel)
        ? [name, { ...question, criteria: question.criteria.map(flattenLevel) }]
        : [name, question],
    ),
  );
}

/**
 * TypeSafe and OpenRouter serve System One natively. Jev is text only, and
 * OpenRouter's image routing for other decision models is unverified, so this
 * format sends no images.
 */
export const systemOneFormat = {
  images: false,
  request: (model, state, questions) => ({ model, state, questions: toSystemOneQuestions(questions) }),
  parse: (body) => body,
};

// Cloudflare rejects requests outside these bounds; checking first turns a
// nested validation dump into a clear message.
const CLEF_MAX_QUESTIONS = 64;
const CLEF_QUESTION_ID = /^[A-Za-z0-9_.-]{1,100}$/;
const CLEF_MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const CLEF_MAX_TOTAL_IMAGE_BYTES = 8 * 1024 * 1024;
// Workers AI rejects a request whose estimated size exceeds the context
// window before running it, estimating one token per four characters of the
// body including base64 image data, though far fewer tokens are billed.
const CLEF_CONTEXT_TOKENS = 65536;
const CLEF_CHARS_PER_ESTIMATED_TOKEN = 4;

function decodedBytes(image) {
  return Math.floor((image.base64.length * 3) / 4);
}

function checkClefImages(images, state, questions) {
  const sizes = images.map(decodedBytes);
  const tooLarge = sizes.findIndex((bytes) => bytes > CLEF_MAX_IMAGE_BYTES);
  if (tooLarge !== -1) {
    throw new DecisionError(`Clef accepts images up to 4 MiB each; image ${tooLarge + 1} is ${(sizes[tooLarge] / 1048576).toFixed(1)} MiB.`, { terminal: true });
  }
  if (sizes.reduce((a, b) => a + b, 0) > CLEF_MAX_TOTAL_IMAGE_BYTES) {
    throw new DecisionError('Clef accepts at most 8 MiB of images per call.', { terminal: true });
  }
  const chars = images.reduce((n, image) => n + dataUrl(image).length, 0) + asText(state ?? '').length + JSON.stringify(questions).length;
  const estimate = Math.ceil(chars / CLEF_CHARS_PER_ESTIMATED_TOKEN);
  if (estimate > CLEF_CONTEXT_TOKENS) {
    throw new DecisionError(
      `Cloudflare estimates this request at ~${estimate} tokens (4 base64 characters per token), over Clef's ${CLEF_CONTEXT_TOKENS}-token window. ` +
      'Downscale or recompress the images (about 180 KB in total fits), or use gpt-6-luna.',
      { terminal: true },
    );
  }
}

/**
 * Cloudflare Workers AI runs Clef with the System One request and answer
 * shapes, wrapped in its `{ result, success, errors }` envelope. Clef adds up
 * to four embedded images; `state` stays required, but may be empty when the
 * images are the whole input.
 */
export const cloudflareFormat = {
  images: true,
  request(model, state, questions, images = []) {
    const ids = Object.keys(questions);
    if (ids.length > CLEF_MAX_QUESTIONS) {
      throw new DecisionError(`Clef accepts at most ${CLEF_MAX_QUESTIONS} questions per call (got ${ids.length}).`, { terminal: true });
    }
    const bad = ids.filter((id) => !CLEF_QUESTION_ID.test(id));
    if (bad.length) {
      throw new DecisionError(
        `Clef question names may use only letters, digits, "_", ".", and "-" (max 100 characters): ${bad.join(', ')}.`,
        { terminal: true },
      );
    }
    const body = { model, state: state ?? '', questions: toSystemOneQuestions(questions) };
    if (images.length === 0) return body;
    checkClefImages(images, state, questions);
    return { ...body, images: images.map(dataUrl) };
  },
  parse(body) {
    if (body?.success === false) {
      const detail = (body.errors || []).map((e) => e?.message || JSON.stringify(e)).join('; ');
      throw new DecisionError(`Cloudflare reported failure: ${detail || 'no details'}`, { retryable: true });
    }
    return body?.result ?? body;
  },
};

/**
 * OpenAI's predicates take no criteria, so a noul question's true/false
 * descriptions become part of its instructions.
 */
function predicateInstructions(question) {
  const instructions = asText(question.instructions);
  if (!question.criteria) return instructions;
  return `${instructions}\n\nAnswer true if: ${asText(question.criteria.true)}\nAnswer false if: ${asText(question.criteria.false)}`;
}

function toOpenAIQuestion(name, question) {
  if (question.type === 'noul') {
    return { type: 'predicate', name, instructions: predicateInstructions(question) };
  }
  if (question.type === 'choice') {
    return {
      type: 'choice',
      name,
      instructions: asText(question.instructions),
      choices: Object.entries(question.criteria).map(([value, description]) =>
        description === null || description === undefined ? { value } : { value, description: asText(description) },
      ),
    };
  }
  return {
    type: 'score',
    name,
    instructions: asText(question.instructions),
    levels: question.criteria.map((level) => {
      if (!isLabeledLevel(level)) return { label: asText(level) };
      return level.description === undefined
        ? { label: level.label }
        : { label: level.label, description: asText(level.description) };
    }),
  };
}

function fromOpenAIAnswer(answer) {
  const { type, name: _name, ...rest } = answer;
  if (type === 'predicate') {
    return { type: 'noul', noul: answer.probability };
  }
  if (type === 'choice') {
    return {
      type: 'choice',
      choice: answer.choice,
      probabilities: Object.fromEntries((answer.probabilities || []).map((p) => [p.value, p.probability])),
      confidence: answer.confidence,
    };
  }
  if (type === 'score') {
    const levels = answer.probabilities || [];
    return {
      type: 'score',
      score: answer.score,
      legend: Object.fromEntries(levels.map((p) => [String(p.value), p.label])),
      probabilities: Object.fromEntries(levels.map((p) => [String(p.value), p.probability])),
      confidence: answer.confidence,
    };
  }
  return { type, ...rest };
}

/**
 * OpenAI's Decisions API (`POST /v1/decisions`) asks the same three kinds of
 * question in its own schema: string `input` instead of `state`, a question
 * array with `name`, `predicate` for `noul`, `choices` and `levels` arrays,
 * and answers as an array with probability lists. It only accepts strings for
 * `input` and `instructions`, so structured values are sent as JSON text.
 * Images turn `input` into one user message of text and `input_image` parts.
 */
export const openaiFormat = {
  images: true,
  request(model, state, questions, images = []) {
    const input = images.length === 0
      ? asText(state)
      : [{
        role: 'user',
        content: [
          ...(state === undefined ? [] : [{ type: 'input_text', text: asText(state) }]),
          ...images.map((image) => ({ type: 'input_image', image_url: dataUrl(image) })),
        ],
      }];
    return {
      model,
      input,
      questions: Object.entries(questions).map(([name, question]) => toOpenAIQuestion(name, question)),
    };
  },
  parse(body) {
    if (!Array.isArray(body?.answers)) return body;
    const answers = Object.fromEntries(body.answers.map((answer) => [answer.name, fromOpenAIAnswer(answer)]));
    return {
      model: body.model,
      answers,
      usage: body.usage ? { input_tokens: body.usage.input_tokens, output_tokens: body.usage.output_tokens } : undefined,
      ...(body.id ? { id: body.id } : {}),
    };
  },
};
