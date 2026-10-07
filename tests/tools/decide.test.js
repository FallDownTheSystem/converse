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
      [{ a: { type: 'score', instructions: 'q', criteria: ['ok', { label: '' }] } }, 'criteria[1] needs a non-empty "label"'],
      [{ a: { type: 'score', instructions: 'q', criteria: ['ok', { label: 'x', note: 'y' }] } }, 'unknown field(s): note'],
      [{ a: { type: 'score', instructions: 'q', criteria: ['ok', { label: 'x', description: '' }] } }, '"description"'],
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

  it('sends state and questions to TypeSafe first for Jev and formats every answer type', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, okBody('jev-1.13.0')));

    const result = await decideTool({ state: { message: 'Charged twice!' }, questions: QUESTIONS, model: 'jev' }, dependencies);

    expect(result.isError).toBe(false);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(init.headers.Authorization).toBe('Bearer ts-key-1234567890');
    expect(JSON.parse(init.body)).toEqual({ model: 'jev-latest', state: { message: 'Charged twice!' }, questions: QUESTIONS });

    const text = result.content[0].text;
    expect(text).toContain('Decision · jev-1.13.0 via TypeSafe · 394 input tokens');
    expect(text).toContain('- urgent (noul): 0.97');
    expect(text).toContain('- team (choice): billing · confidence 0.81 · billing 0.88, technical 0.12');
    expect(text).toContain('- mood (score): 1.24 on 0–2 · confidence 0.64 · 1 "Frustrated" 0.76, 2 "Very angry" 0.24');
    expect(text).not.toContain('"Calm" 0.00');
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

  it('does not retry a request fault on another host of the same model', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { detail: 'Too many score levels.' }));

    const result = await decideTool({ state: 'x', questions: QUESTIONS, model: 'jev-latest' }, dependencies);

    expect(result.isError).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.content[0].text).toContain('typesafe: HTTP 400: Too many score levels.');
  });

  it('moves auto on to the next model after a request fault', async () => {
    dependencies.config.apiKeys.openai = 'sk-proj-abc';
    fetchMock
      .mockResolvedValueOnce(jsonResponse(400, { error: { message: 'Unsupported input' } }))
      .mockResolvedValueOnce(jsonResponse(200, okBody('jev-1.13.0')));

    const result = await decideTool({ state: 'x', questions: QUESTIONS }, dependencies);

    expect(result.isError).toBe(false);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://api.openai.com/v1/decisions',
      'https://api.typesafe.ai/v1/systemone',
    ]);
    expect(result.content[0].text).toContain('openai failed, fell back: HTTP 400: Unsupported input');
  });

  it('formats OpenAI answers like every other host', async () => {
    dependencies.config.apiKeys = { openai: 'sk-proj-abc' };
    fetchMock.mockResolvedValue(jsonResponse(200, {
      model: 'gpt-6-luna',
      answers: [
        { type: 'predicate', name: 'urgent', probability: 0.97 },
        { type: 'choice', name: 'team', choice: 'billing', probabilities: [{ value: 'billing', probability: 0.88 }, { value: 'technical', probability: 0.12 }], confidence: 0.81 },
        {
          type: 'score', name: 'mood', score: 1.24, confidence: 0.64,
          probabilities: [{ value: 0, label: 'Calm', probability: 0 }, { value: 1, label: 'Frustrated', probability: 0.76 }, { value: 2, label: 'Very angry', probability: 0.24 }],
        },
      ],
      usage: { input_tokens: 398, output_tokens: 0 },
    }));

    const result = await decideTool({ state: 'x', questions: { ...QUESTIONS, extra: { type: 'noul', instructions: 'q' } } }, dependencies);

    const text = result.content[0].text;
    expect(text).toContain('Decision · gpt-6-luna via OpenAI · 398 input tokens');
    expect(text).toContain('- urgent (noul): 0.97');
    expect(text).toContain('- team (choice): billing · confidence 0.81 · billing 0.88, technical 0.12');
    expect(text).toContain('- mood (score): 1.24 on 0–2 · confidence 0.64 · 1 "Frustrated" 0.76, 2 "Very angry" 0.24');
  });

  describe('labeled score levels', () => {
    const labeled = {
      mood: {
        type: 'score',
        instructions: 'How frustrated?',
        criteria: [{ label: 'Calm', description: 'No negative emotion' }, 'Frustrated', { label: 'Very angry' }],
      },
    };

    it('flattens labels for System One hosts and shows the labels in the legend', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, okBody('jev-1.13.0', {
        answers: {
          mood: {
            type: 'score', score: 1.1, confidence: 0.5,
            legend: { 0: 'Calm: No negative emotion', 1: 'Frustrated', 2: 'Very angry' },
            probabilities: { 0: 0.1, 1: 0.7, 2: 0.2 },
          },
        },
      })));

      const result = await decideTool({ state: 'x', questions: labeled, model: 'jev' }, dependencies);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.questions.mood.criteria).toEqual(['Calm: No negative emotion', 'Frustrated', 'Very angry']);
      const text = result.content[0].text;
      expect(text).toContain('- mood (score): 1.10 on 0–2 · confidence 0.50 · 1 "Frustrated" 0.70, 2 "Very angry" 0.20, 0 "Calm" 0.10');
      const payload = JSON.parse(text.match(/```json\n([\s\S]+)\n```/)[1]);
      expect(payload.answers.mood.legend).toEqual({ 0: 'Calm', 1: 'Frustrated', 2: 'Very angry' });
    });

    it('sends label and description pairs to OpenAI as levels', async () => {
      dependencies.config.apiKeys = { openai: 'sk-proj-abc' };
      fetchMock.mockResolvedValue(jsonResponse(200, { model: 'gpt-6-luna', answers: [] }));

      await decideTool({ state: 'x', questions: labeled }, dependencies);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.questions[0].levels).toEqual([
        { label: 'Calm', description: 'No negative emotion' },
        { label: 'Frustrated' },
        { label: 'Very angry' },
      ]);
    });
  });

  it('reports refusals', async () => {
    dependencies.config.apiKeys = { openai: 'sk-proj-abc' };
    fetchMock.mockResolvedValue(jsonResponse(200, { model: 'gpt-6-luna', answers: [{ type: 'refusal', name: 'urgent' }] }));

    const result = await decideTool({ state: 'x', questions: { urgent: QUESTIONS.urgent } }, dependencies);

    expect(result.content[0].text).toContain('- urgent (refusal): the model declined to answer');
  });

  it('does not fail over when the upstream firewall blocks the content', async () => {
    const blockPage =
      '<!DOCTYPE html><html><head><title>Attention Required! | Cloudflare</title></head><body>' +
      '<h1>Sorry, you have been blocked</h1><h2><span>You are unable to access</span> typesafe.ai</h2>' +
      'Cloudflare Ray ID: <strong class="font-semibold">abc123</strong></body></html>';
    fetchMock.mockResolvedValueOnce(new Response(blockPage, { status: 403, headers: { 'content-type': 'text/html' } }));

    const result = await decideTool({ state: 'SELECT * FROM users -- ; DROP TABLE users', questions: QUESTIONS, model: 'jev' }, dependencies);

    expect(result.isError).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const text = result.content[0].text;
    expect(text).toContain('Blocked by typesafe.ai\'s Cloudflare firewall before reaching the model (Ray ID abc123)');
    expect(text).not.toContain('<html');
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
      expect(image.content[0].text).toContain('pass images in "images"');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('images', () => {
    const PNG = 'data:image/png;base64,iVBORw0KGgo=';
    let dir;

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'decide-img-'));
      await writeFile(join(dir, 'pic.png'), Buffer.from('fake png bytes'));
      await writeFile(join(dir, 'anim.gif'), Buffer.from('fake gif bytes'));
      dependencies.config.apiKeys = { openai: 'sk-proj-abc', typesafe: 'ts-key-1234567890' };
      dependencies.config.providers = { cloudflareaccountid: 'acct', cloudflareapitoken: 'cf-token' };
    });

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it('sends state and images to OpenAI as one user message', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { model: 'gpt-6-luna', answers: [{ type: 'predicate', name: 'urgent', probability: 0.9 }] }));

      const result = await decideTool(
        { state: { caption: 'Mascot' }, images: [join(dir, 'pic.png'), PNG], questions: { urgent: QUESTIONS.urgent } },
        dependencies,
      );

      expect(result.isError).toBe(false);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.input).toEqual([{
        role: 'user',
        content: [
          { type: 'input_text', text: '{"caption":"Mascot"}' },
          { type: 'input_image', image_url: `data:image/png;base64,${Buffer.from('fake png bytes').toString('base64')}` },
          { type: 'input_image', image_url: PNG },
        ],
      }]);
    });

    it('accepts images without state and sends Clef an empty state', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { result: { model: 'clef', answers: {} }, success: true }));

      await decideTool({ images: [PNG], questions: { urgent: QUESTIONS.urgent }, model: 'clef' }, dependencies);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toMatchObject({ model: 'clef', state: '', images: [PNG] });
    });

    it('skips models that cannot take images under auto', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(401, { error: { message: 'bad key' } }))
        .mockResolvedValueOnce(jsonResponse(200, { result: { model: 'clef', answers: {} }, success: true }));

      await decideTool({ state: 'x', images: [PNG], questions: { urgent: QUESTIONS.urgent } }, dependencies);

      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        'https://api.openai.com/v1/decisions',
        'https://api.cloudflare.com/client/v4/accounts/acct/ai/run/@cf/cloudflare/clef',
      ]);
    });

    it('rejects image requests for text-only models before sending', async () => {
      const result = await decideTool({ state: 'x', images: [PNG], questions: QUESTIONS, model: 'jev' }, dependencies);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('cannot take 1 image(s)');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects more images than Clef takes', async () => {
      const result = await decideTool({ state: 'x', images: [PNG, PNG, PNG, PNG, PNG], questions: QUESTIONS, model: 'clef' }, dependencies);

      expect(result.isError).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reports a Clef limit breach as not sent, without calling Cloudflare', async () => {
      const big = `data:image/png;base64,${'A'.repeat(300_000)}`;
      const result = await decideTool({ images: [big], questions: { urgent: QUESTIONS.urgent }, model: 'cloudflare:clef' }, dependencies);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/^Decision request not sent \(cloudflare: Cloudflare estimates/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('marks an unsent Clef request when another host also failed', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: { message: 'bad key' } }));

      const result = await decideTool({ state: 'x', questions: { 'bad name': QUESTIONS.urgent } }, {
        ...dependencies,
        config: { ...dependencies.config, apiKeys: { openai: 'sk-proj-abc' } },
      });

      expect(result.content[0].text).toContain('Decision request failed (openai: HTTP 401');
      expect(result.content[0].text).toContain('cloudflare, not sent: Clef question names');
    });

    it('rejects unsupported image types and malformed data URLs', async () => {
      const gif = await decideTool({ images: [join(dir, 'anim.gif')], questions: QUESTIONS, model: 'luna' }, dependencies);
      expect(gif.content[0].text).toContain('image/gif is not supported');

      const bad = await decideTool({ images: ['data:image/png,notbase64'], questions: QUESTIONS, model: 'luna' }, dependencies);
      expect(bad.content[0].text).toContain('not a base64 data URL');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
