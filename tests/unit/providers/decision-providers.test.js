/**
 * Decision provider tests: model resolution across OpenAI, TypeSafe,
 * Cloudflare, and OpenRouter; wire format translation; and the HTTP client's
 * error mapping and retries.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { askDecisionModel, resolveDecisionModel } from '../../../src/decisionProviders/index.js';
import {
  callDecisionApi,
  extractErrorMessage,
  describeHtmlError,
  DecisionError,
} from '../../../src/decisionProviders/http.js';
import { cloudflareFormat, openaiFormat } from '../../../src/decisionProviders/formats.js';

const both = { apiKeys: { typesafe: 'ts-key-1234567890', openrouter: 'sk-or-v1-abc' }, providers: {} };
const openrouterOnly = { apiKeys: { openrouter: 'sk-or-v1-abc' }, providers: {} };
const cloudflare = { cloudflareaccountid: 'acct123', cloudflareapitoken: 'cf-token' };
const all = {
  apiKeys: { openai: 'sk-proj-abc', typesafe: 'ts-key-1234567890', openrouter: 'sk-or-v1-abc' },
  providers: cloudflare,
};

function routes(result) {
  return result.candidates.map((c) => `${c.providerName}:${c.model}`);
}

describe('resolveDecisionModel', () => {
  it('expands auto to each auto model on every configured host, natives first', () => {
    expect(routes(resolveDecisionModel('auto', all))).toEqual([
      'openai:gpt-6-luna',
      'openrouter:openai/gpt-6-luna-decisions',
      'typesafe:jev-latest',
      'openrouter:~typesafe/jev-latest',
      'cloudflare:clef',
      'openrouter:cloudflare/clef',
    ]);
    expect(routes(resolveDecisionModel('auto', both))).toEqual([
      'openrouter:openai/gpt-6-luna-decisions',
      'typesafe:jev-latest',
      'openrouter:~typesafe/jev-latest',
      'openrouter:cloudflare/clef',
    ]);
  });

  it('reports auto as unavailable with setup hints when nothing is configured', () => {
    const result = resolveDecisionModel('auto', { apiKeys: {}, providers: {} });
    expect(result.status).toBe('unavailable');
    expect(result.error).toContain('OPENAI_API_KEY');
    expect(result.error).toContain('TYPESAFE_API_KEY');
    expect(result.error).toContain('CLOUDFLARE_API_TOKEN');
    expect(result.error).toContain('OPENROUTER_API_KEY');
  });

  it('routes OpenAI and Clef models to their native host, then OpenRouter', () => {
    expect(routes(resolveDecisionModel('luna', all))).toEqual([
      'openai:gpt-6-luna',
      'openrouter:openai/gpt-6-luna-decisions',
    ]);
    expect(routes(resolveDecisionModel('clef-flash', all))).toEqual([
      'cloudflare:clef-flash',
      'openrouter:cloudflare/clef-flash',
    ]);
    expect(routes(resolveDecisionModel('cloudflare/clef', all))).toEqual([
      'cloudflare:clef',
      'openrouter:cloudflare/clef',
    ]);
    expect(routes(resolveDecisionModel('openai', all))).toEqual(['openai:gpt-6-luna']);
    expect(routes(resolveDecisionModel('cloudflare:', all))).toEqual(['cloudflare:clef']);
  });

  it('needs both the Cloudflare account ID and token', () => {
    const tokenOnly = { apiKeys: {}, providers: { cloudflareapitoken: 'cf-token' } };
    const result = resolveDecisionModel('cloudflare:clef', tokenOnly);
    expect(result.status).toBe('unavailable');
    expect(result.error).toContain('CLOUDFLARE_ACCOUNT_ID');
  });

  it('tags candidates with the model they serve', () => {
    const families = resolveDecisionModel('auto', all).candidates.map((c) => c.family);
    expect(families).toEqual(['gpt-6-luna', 'gpt-6-luna', 'jev-latest', 'jev-latest', 'clef', 'clef']);
  });

  it('translates bare names into each provider\'s own model ID', () => {
    expect(routes(resolveDecisionModel('jev-1.13.0', both))).toEqual([
      'typesafe:jev-1.13.0',
      'openrouter:typesafe/jev-1.13',
    ]);
    expect(routes(resolveDecisionModel('JEV-LATEST', both))).toEqual([
      'typesafe:jev-latest',
      'openrouter:~typesafe/jev-latest',
    ]);
  });

  it('routes names OpenRouter does not serve to TypeSafe only', () => {
    expect(routes(resolveDecisionModel('jev-preview', both))).toEqual(['typesafe:jev-preview']);
    expect(routes(resolveDecisionModel('jev-1.14.0', both))).toEqual(['typesafe:jev-1.14.0']);
    const result = resolveDecisionModel('jev-preview', openrouterOnly);
    expect(result.status).toBe('unavailable');
    expect(result.error).toContain('TYPESAFE_API_KEY');
  });

  it('pins a namespaced spec to its provider', () => {
    expect(routes(resolveDecisionModel('openrouter:jev-1.13', both))).toEqual(['openrouter:typesafe/jev-1.13']);
    expect(routes(resolveDecisionModel('openrouter:~typesafe/jev-latest', both))).toEqual([
      'openrouter:~typesafe/jev-latest',
    ]);
    expect(routes(resolveDecisionModel('typesafe', both))).toEqual(['typesafe:jev-latest']);
    expect(routes(resolveDecisionModel('openrouter:', both))).toEqual(['openrouter:openai/gpt-6-luna-decisions']);
  });

  it('rejects unknown providers, models, and chat models', () => {
    expect(resolveDecisionModel('openai:gpt-5', both).status).toBe('unknown');
    expect(resolveDecisionModel('cloudflare:jev-latest', all).error).toContain('Cloudflare does not serve');
    expect(resolveDecisionModel('mystery:jev', all).error).toContain('Unknown decision provider');
    expect(resolveDecisionModel('openrouter:jev-preview', both).error).toContain('does not serve');
    const chatModel = resolveDecisionModel('gpt-6-astra', both);
    expect(chatModel.status).toBe('unknown');
    expect(chatModel.error).toContain('jev-latest');
  });

  it('reports a configured-provider gap for a pinned provider', () => {
    const result = resolveDecisionModel('typesafe:jev-latest', openrouterOnly);
    expect(result.status).toBe('unavailable');
    expect(result.error).toContain('TYPESAFE_API_KEY');
  });
});

describe('extractErrorMessage', () => {
  it('reads TypeSafe detail objects', () => {
    const body = { detail: { error_type: 'authentication_error', message: 'Bad key' } };
    expect(extractErrorMessage(body, '')).toBe('authentication_error: Bad key');
  });

  it('unwraps OpenRouter-forwarded upstream details', () => {
    const body = { error: { message: 'HTTP 400: {"detail":"Too many score levels. Must have at most 10 levels."}', code: 400 } };
    expect(extractErrorMessage(body, '')).toBe('Too many score levels. Must have at most 10 levels.');
  });

  it('flattens validation issue lists into path: message pairs', () => {
    const issues = JSON.stringify([{ path: ['questions', 'a', 'type'], message: 'Invalid discriminator' }]);
    expect(extractErrorMessage({ error: { message: issues } }, '')).toBe('questions.a.type: Invalid discriminator');
  });

  it('falls back to the raw body', () => {
    expect(extractErrorMessage(null, 'Bad Gateway')).toBe('Bad Gateway');
  });

  it('reads OpenAI error objects', () => {
    const body = { error: { message: 'Invalid value: \'noul\'.', type: 'invalid_request_error', param: 'questions[0].type' } };
    expect(extractErrorMessage(body, '')).toBe('Invalid value: \'noul\'.');
  });

  it('unpacks the validation details Workers AI embeds in its error message', () => {
    const inner = { error: { type: 'invalid_request', message: 'Request body failed validation', details: { formErrors: [], fieldErrors: { questions: ['String should match pattern \'^[A-Za-z0-9_.-]{1,100}$\''] } } } };
    const body = { errors: [{ message: `AiError: AiError: ${JSON.stringify(inner)} (ae378bf5)`, code: 5012 }], success: false, result: {} };
    expect(extractErrorMessage(body, '')).toBe(
      'Request body failed validation (questions: String should match pattern \'^[A-Za-z0-9_.-]{1,100}$\')',
    );
    expect(extractErrorMessage({ errors: [{ message: 'Authentication error', code: 10000 }] }, '')).toBe('Authentication error');
  });
});

describe('openaiFormat', () => {
  const questions = {
    urgent: { type: 'noul', instructions: 'Is it urgent?', criteria: { true: 'Time-sensitive', false: { note: 'No rush' } } },
    team: { type: 'choice', instructions: { question: 'Which team handles `item`?', item: 'refunds' }, criteria: { billing: 'Payments', sales: null } },
    mood: { type: 'score', instructions: 'How frustrated?', criteria: ['Calm', 'Angry'] },
  };

  it('translates System One questions into the Decisions API schema', () => {
    expect(openaiFormat.request('gpt-6-luna', { ticket: 'Charged twice' }, questions)).toEqual({
      model: 'gpt-6-luna',
      input: '{"ticket":"Charged twice"}',
      questions: [
        { type: 'predicate', name: 'urgent', instructions: 'Is it urgent?\n\nAnswer true if: Time-sensitive\nAnswer false if: {"note":"No rush"}' },
        {
          type: 'choice',
          name: 'team',
          instructions: '{"question":"Which team handles `item`?","item":"refunds"}',
          choices: [{ value: 'billing', description: 'Payments' }, { value: 'sales' }],
        },
        { type: 'score', name: 'mood', instructions: 'How frustrated?', levels: [{ label: 'Calm' }, { label: 'Angry' }] },
      ],
    });
    expect(openaiFormat.request('gpt-6-luna', 'plain text', { a: { type: 'noul', instructions: 'q' } }).input).toBe('plain text');
  });

  it('maps answers back to System One shapes', () => {
    const body = {
      model: 'gpt-6-luna',
      answers: [
        { type: 'predicate', name: 'urgent', probability: 1.0 },
        { type: 'choice', name: 'team', choice: 'billing', probabilities: [{ value: 'billing', probability: 0.9 }, { value: 'sales', probability: 0.1 }], confidence: 0.8 },
        {
          type: 'score', name: 'mood', score: 0.99, confidence: 0.99,
          probabilities: [{ value: 0, label: 'Calm', probability: 0.01 }, { value: 1, label: 'Angry', probability: 0.99 }],
        },
        { type: 'refusal', name: 'other' },
      ],
      usage: { input_tokens: 398, input_tokens_details: { cached_tokens: 0 }, output_tokens: 0, total_tokens: 398 },
    };
    expect(openaiFormat.parse(body)).toEqual({
      model: 'gpt-6-luna',
      answers: {
        urgent: { type: 'noul', noul: 1.0 },
        team: { type: 'choice', choice: 'billing', probabilities: { billing: 0.9, sales: 0.1 }, confidence: 0.8 },
        mood: { type: 'score', score: 0.99, legend: { 0: 'Calm', 1: 'Angry' }, probabilities: { 0: 0.01, 1: 0.99 }, confidence: 0.99 },
        other: { type: 'refusal' },
      },
      usage: { input_tokens: 398, output_tokens: 0 },
    });
  });
});

describe('cloudflareFormat', () => {
  it('sends the System One body and unwraps the Workers AI envelope', () => {
    const questions = { urgent: { type: 'noul', instructions: 'q' } };
    expect(cloudflareFormat.request('clef', 'state', questions)).toEqual({ model: 'clef', state: 'state', questions });
    const result = { model: 'clef', answers: { urgent: { type: 'noul', noul: 0.95 } }, usage: { input_tokens: 316, output_tokens: 0 } };
    expect(cloudflareFormat.parse({ result, success: true, errors: [], messages: [] })).toEqual(result);
  });

  it('rejects question sets Clef cannot take before sending', () => {
    const many = Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`q${i}`, { type: 'noul', instructions: 'q' }]));
    expect(() => cloudflareFormat.request('clef', 's', many)).toThrow('at most 64 questions');
    const error = (() => {
      try {
        cloudflareFormat.request('clef', 's', { 'has space': { type: 'noul', instructions: 'q' } });
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(DecisionError);
    expect(error.terminal).toBe(true);
    expect(error.message).toContain('has space');
  });

  it('rejects images Cloudflare would estimate past the context window', () => {
    const big = { mimeType: 'image/png', base64: 'A'.repeat(300_000) };
    expect(() => cloudflareFormat.request('clef', 's', { a: { type: 'noul', instructions: 'q' } }, [big])).toThrow('Downscale');
    const small = { mimeType: 'image/png', base64: 'A'.repeat(20_000) };
    expect(cloudflareFormat.request('clef', 's', { a: { type: 'noul', instructions: 'q' } }, [small]).images).toHaveLength(1);
  });

  it('treats a reported failure inside a 2xx as retryable', () => {
    expect(() => cloudflareFormat.parse({ success: false, errors: [{ message: 'capacity' }] })).toThrow('capacity');
  });
});

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

describe('askDecisionModel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const questions = { urgent: { type: 'noul', instructions: 'q' } };

  it('posts Clef requests to the account-scoped Workers AI path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { result: { model: 'clef-flash', answers: {} }, success: true }));
    vi.stubGlobal('fetch', fetchMock);
    const [candidate] = resolveDecisionModel('cloudflare:clef-flash', all).candidates;

    await expect(askDecisionModel(candidate, { state: 's', questions, config: all })).resolves.toEqual({ model: 'clef-flash', answers: {} });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acct123/ai/run/@cf/cloudflare/clef-flash');
    expect(init.headers.Authorization).toBe('Bearer cf-token');
    expect(JSON.parse(init.body)).toEqual({ model: 'clef-flash', state: 's', questions });
  });

  it('posts OpenAI requests to /v1/decisions in its own schema', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { model: 'gpt-6-luna', answers: [{ type: 'predicate', name: 'urgent', probability: 0.7 }] }));
    vi.stubGlobal('fetch', fetchMock);
    const [candidate] = resolveDecisionModel('openai', all).candidates;

    const response = await askDecisionModel(candidate, { state: 's', questions, config: all });
    expect(response.answers).toEqual({ urgent: { type: 'noul', noul: 0.7 } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/decisions');
    expect(init.headers.Authorization).toBe('Bearer sk-proj-abc');
    expect(JSON.parse(init.body).questions).toEqual([{ type: 'predicate', name: 'urgent', instructions: 'q' }]);
  });
});

describe('callDecisionApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const request = { url: 'https://api.example.test/v1/systemone', headers: { Authorization: 'Bearer k' }, body: { model: 'm' } };

  it('posts the body and returns the parsed response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { model: 'm', answers: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(callDecisionApi(request)).resolves.toEqual({ model: 'm', answers: {} });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.test/v1/systemone');
    expect(init.headers.Authorization).toBe('Bearer k');
    expect(JSON.parse(init.body)).toEqual({ model: 'm' });
  });

  it('retries 429 honoring retry-after-ms', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(429, { error: { message: 'slow down' } }, { 'retry-after-ms': '1' }))
      .mockResolvedValueOnce(jsonResponse(200, { answers: { a: {} } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(callDecisionApi(request)).resolves.toEqual({ answers: { a: {} } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry request faults and marks them terminal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(400, { error: { message: 'bad' } }));
    vi.stubGlobal('fetch', fetchMock);

    const error = await callDecisionApi(request).catch((e) => e);
    expect(error).toBeInstanceOf(DecisionError);
    expect(error.terminal).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry auth failures but leaves them open to failover', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { detail: { message: 'no' } }));
    vi.stubGlobal('fetch', fetchMock);

    const error = await callDecisionApi(request).catch((e) => e);
    expect(error.status).toBe(401);
    expect(error.terminal).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxRetries on repeated 5xx', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(503, {}, { 'retry-after-ms': '1' })));
    vi.stubGlobal('fetch', fetchMock);

    const error = await callDecisionApi({ ...request, maxRetries: 2 }).catch((e) => e);
    expect(error.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  describe('firewall and HTML error pages', () => {
    const BLOCK_PAGE = [
      '<!DOCTYPE html>',
      '<html class="no-js" lang="en-US"> <head><title>Attention Required! | Cloudflare</title></head>',
      '<body><h1 data-translate="block_headline">Sorry, you have been blocked</h1>',
      '<h2 class="cf-subheadline"><span data-translate="unable_to_access">You are unable to access</span> typesafe.ai</h2>',
      '<span class="cf-footer-item sm:block sm:mb-1">Cloudflare Ray ID: <strong class="font-semibold">a3fc08169cafe4df</strong></span>',
      '</body></html>',
    ].join('\n');

    function htmlResponse(status, html) {
      return new Response(html, { status, headers: { 'content-type': 'text/html' } });
    }

    it('summarizes a native Cloudflare block page and stops without retrying', async () => {
      const fetchMock = vi.fn().mockResolvedValue(htmlResponse(403, BLOCK_PAGE));
      vi.stubGlobal('fetch', fetchMock);

      const error = await callDecisionApi(request).catch((e) => e);

      expect(error.message).toBe(
        'HTTP 403: Blocked by typesafe.ai\'s Cloudflare firewall before reaching the model (Ray ID a3fc08169cafe4df): ' +
        'the request content matched an attack signature, typically SQL-injection or shell-command patterns in state or questions. ' +
        'Retrying the same content will not help; report the Ray ID to the provider.',
      );
      expect(error.message).not.toContain('<');
      expect(error.terminal).toBe(true);
      expect(error.retryable).toBe(false);
      expect(error.requestId).toBe('a3fc08169cafe4df');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('recognizes the block page when OpenRouter forwards it inside a JSON error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(403, { error: { message: `HTTP 403: ${BLOCK_PAGE}`, code: 403 } })));

      const error = await callDecisionApi(request).catch((e) => e);

      expect(error.message).toMatch(/^HTTP 403: Blocked by typesafe\.ai's Cloudflare firewall .*Ray ID a3fc08169cafe4df/);
      expect(error.terminal).toBe(true);
    });

    it('reduces other HTML error pages to their title', () => {
      const page = '<!DOCTYPE html><html><head><title>502 Bad Gateway</title></head><body>nginx</body></html>';
      expect(describeHtmlError(page)).toEqual({ firewall: false, rayId: null, message: 'Upstream returned an HTML error page: 502 Bad Gateway' });
      expect(describeHtmlError('plain text error')).toBeNull();
    });

    it('truncates long non-HTML error bodies', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x'.repeat(5000), { status: 400 })));

      const error = await callDecisionApi(request).catch((e) => e);

      expect(error.message.length).toBeLessThan(600);
      expect(error.message.endsWith('…')).toBe(true);
    });
  });

  it('rejects a 2xx body without answers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { model: 'm' })));
    await expect(callDecisionApi(request)).rejects.toThrow('missing "answers"');
  });
});
