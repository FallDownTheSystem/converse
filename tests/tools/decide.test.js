/**
 * Decide Tool Tests
 *
 * Question validation, provider failover, file context, and output format.
 * fetch is stubbed; no network calls are made.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { decideTool, validateQuestions } from '../../src/tools/decide.js';
import { processUnifiedContext } from '../../src/utils/contextProcessor.js';

const ANSWERS = {
  urgent: { type: 'noul', noul: 0.97 },
  team: { type: 'choice', choice: 'billing', probabilities: { technical: 0.12, billing: 0.88 }, confidence: 0.81 },
  mood: {
    type: 'score',
    score: 1.24,
    legend: { 0: 'Calm', 1: 'Frustrated', 2: 'Very angry' },
    probabilities: { 0: 0, 1: 0.76, 2: 0.24 },
    confidence: 0.64,
  },
};

const QUESTIONS = {
  urgent: { type: 'noul', instructions: 'Is it urgent?' },
  team: { type: 'choice', instructions: 'Which team?', criteria: { billing: 'Payments', technical: null } },
  mood: { type: 'score', instructions: 'How frustrated?', criteria: ['Calm', 'Frustrated', 'Very angry'] },
};

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function okBody(model = 'typesafe/jev-1.13-20260917', extra = {}) {
  return { model, answers: ANSWERS, usage: { input_tokens: 394, output_tokens: 70 }, ...extra };
}

describe('Decide Tool', () => {
  let fetchMock;
  let dependencies;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    dependencies = {
      config: { apiKeys: { typesafe: 'ts-key-1234567890', openrouter: 'sk-or-v1-abc' }, providers: {}, server: {} },
      contextProcessor: { processUnifiedContext },
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('validateQuestions', () => {
    it('accepts all three question types', () => {
      expect(validateQuestions(QUESTIONS)).toBeNull();
    });

    it.each([
      [{}, 'at least one'],
      [{ a: { type: 'text', instructions: 'q' } }, 'type must be one of'],
      [{ a: { type: 'noul' } }, 'instructions'],
      [{ a: { type: 'noul', instructions: 'q', options: [] } }, 'unknown field'],
      [{ a: { type: 'noul', instructions: 'q', criteria: { yes: 'y', no: 'n' } } }, '"true"'],
      [{ a: { type: 'choice', instructions: 'q', criteria: { only: null } } }, '2 to 255'],
      [{ a: { type: 'choice', instructions: 'q', criteria: ['x', 'y'] } }, 'map option names'],
      [{ a: { type: 'score', instructions: 'q', criteria: ['one'] } }, '2 to 10'],
      [{ a: { type: 'score', instructions: 'q', criteria: Array.from({ length: 11 }, (_, i) => `${i}`) } }, '2 to 10'],
      [{ a: { type: 'score', instructions: 'q', criteria: ['ok', ''] } }, 'non-empty'],
    ])('rejects %j', (questions, message) => {
      expect(validateQuestions(questions)).toContain(message);
    });

    it('accepts structured instructions and criteria', () => {
      const questions = {
        a: { type: 'noul', instructions: { question: 'Is `item` listed?', item: 'car' }, criteria: { true: 'Listed', false: { note: 'Absent' } } },
      };
      expect(validateQuestions(questions)).toBeNull();
    });
  });

  it('rejects invalid input before calling any provider', async () => {
    const result = await decideTool({ state: 'x', questions: { a: { type: 'score', instructions: 'q', criteria: ['one'] } } }, dependencies);
    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires state or files', async () => {
    const result = await decideTool({ questions: QUESTIONS }, dependencies);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('nothing to judge');
  });

  it('rejects unsupported state types', async () => {
    const result = await decideTool({ state: 42, questions: QUESTIONS }, dependencies);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('"state"');
  });

  it('sends state and questions to TypeSafe first and formats every answer type', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, okBody('jev-1.13.0')));

    const result = await decideTool({ state: { message: 'Charged twice!' }, questions: QUESTIONS }, dependencies);

    expect(result.isError).toBe(false);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(init.headers.Authorization).toBe('Bearer ts-key-1234567890');
    expect(JSON.parse(init.body)).toEqual({ model: 'jev-latest', state: { message: 'Charged twice!' }, questions: QUESTIONS });

    const text = result.content[0].text;
    expect(text).toContain('Decision · jev-1.13.0 via TypeSafe · 394 input tokens');
    expect(text).toContain('- urgent (noul): 0.97');
    expect(text).toContain('- team (choice): billing · confidence 0.81 · billing 0.88, technical 0.12');
    expect(text).toContain('- mood (score): 1.24 on 0–2 · confidence 0.64 · 1 Frustrated 0.76, 2 Very angry 0.24');
    expect(text).not.toContain('Calm 0.00');
    const payload = JSON.parse(text.match(/```json\n([\s\S]+)\n```/)[1]);
    expect(payload).toMatchObject({ model: 'jev-1.13.0', provider: 'typesafe', answers: ANSWERS, usage: { cost: null } });
  });

  it('falls back to OpenRouter with its own model ID when TypeSafe fails', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { detail: { error_type: 'authentication_error', message: 'Bad key' } }))
      .mockResolvedValueOnce(jsonResponse(200, okBody(undefined, { usage: { input_tokens: 10, output_tokens: 1, cost: 0.000017 }, id: 'gen-1' })));

    const result = await decideTool({ state: 'x', questions: QUESTIONS, model: 'jev-1.13' }, dependencies);

    expect(result.isError).toBe(false);
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://openrouter.ai/api/v1/systemone');
    expect(init.headers.Authorization).toBe('Bearer sk-or-v1-abc');
    expect(JSON.parse(init.body).model).toBe('typesafe/jev-1.13');
    const text = result.content[0].text;
    expect(text).toContain('via OpenRouter');
    expect(text).toContain('$0.000017');
    expect(text).toContain('typesafe failed, fell back: HTTP 401: authentication_error: Bad key');
    expect(text).toContain('"id": "gen-1"');
  });

  it('does not fail over on a request fault every host would reject', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { detail: 'Too many score levels.' }));

    const result = await decideTool({ state: 'x', questions: QUESTIONS }, dependencies);

    expect(result.isError).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.content[0].text).toContain('typesafe: HTTP 400: Too many score levels.');
  });

  it('sends OpenRouter attribution headers', async () => {
    dependencies.config.providers = { openrouterreferer: 'https://example.test', openroutertitle: 'Converse' };
    fetchMock.mockResolvedValue(jsonResponse(200, okBody()));

    await decideTool({ state: 'x', questions: QUESTIONS, model: 'openrouter:jev-latest' }, dependencies);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['HTTP-Referer']).toBe('https://example.test');
    expect(init.headers['X-OpenRouter-Title']).toBe('Converse');
    expect(JSON.parse(init.body).model).toBe('~typesafe/jev-latest');
  });

  it('returns routing errors without calling a provider', async () => {
    dependencies.config.apiKeys = { openrouter: 'sk-or-v1-abc' };
    const result = await decideTool({ state: 'x', questions: QUESTIONS, model: 'jev-preview' }, dependencies);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('TYPESAFE_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports cancellation instead of failing over', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(() => {
      controller.abort();
      return Promise.reject(new DOMException('aborted', 'AbortError'));
    });

    const result = await decideTool({ state: 'x', questions: QUESTIONS }, { ...dependencies, signal: controller.signal });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('cancelled');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe('files', () => {
    let dir;

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'decide-'));
      await writeFile(join(dir, 'a.txt'), 'line1\nline2\nline3');
      await writeFile(join(dir, 'pic.png'), 'not really a png');
    });

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it('wraps a given state as input next to file contents', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, okBody()));
      const path = join(dir, 'a.txt{2:3}');

      await decideTool({ state: 'context', questions: QUESTIONS, files: [path] }, dependencies);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.state).toEqual({ input: 'context', files: { [path]: 'line2\nline3' } });
    });

    it('uses files alone as the state', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, okBody()));
      const path = join(dir, 'a.txt');

      await decideTool({ questions: QUESTIONS, files: [path] }, dependencies);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.state).toEqual({ files: { [path]: 'line1\nline2\nline3' } });
    });

    it('rejects missing files and images', async () => {
      const missing = await decideTool({ questions: QUESTIONS, files: [join(dir, 'nope.txt')] }, dependencies);
      expect(missing.isError).toBe(true);
      expect(missing.content[0].text).toContain('nope.txt');

      const image = await decideTool({ questions: QUESTIONS, files: [join(dir, 'pic.png')] }, dependencies);
      expect(image.isError).toBe(true);
      expect(image.content[0].text).toContain('text only');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
