/**
 * Decision provider tests: model resolution across TypeSafe and OpenRouter,
 * and the System One HTTP client's error mapping and retries.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveDecisionModel } from '../../../src/decisionProviders/index.js';
import {
  callSystemOne,
  extractErrorMessage,
  describeHtmlError,
  DecisionError,
} from '../../../src/decisionProviders/systemOne.js';

const both = { apiKeys: { typesafe: 'ts-key-1234567890', openrouter: 'sk-or-v1-abc' }, providers: {} };
const openrouterOnly = { apiKeys: { openrouter: 'sk-or-v1-abc' }, providers: {} };

function routes(result) {
  return result.candidates.map((c) => `${c.providerName}:${c.model}`);
}

describe('resolveDecisionModel', () => {
  it('expands auto to every configured provider, native first', () => {
    expect(routes(resolveDecisionModel('auto', both))).toEqual([
      'typesafe:jev-latest',
      'openrouter:~typesafe/jev-latest',
    ]);
    expect(routes(resolveDecisionModel(undefined, openrouterOnly))).toEqual([
      'openrouter:~typesafe/jev-latest',
    ]);
  });

  it('reports auto as unavailable with setup hints when nothing is configured', () => {
    const result = resolveDecisionModel('auto', { apiKeys: {} });
    expect(result.status).toBe('unavailable');
    expect(result.error).toContain('TYPESAFE_API_KEY');
    expect(result.error).toContain('OPENROUTER_API_KEY');
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
    expect(routes(resolveDecisionModel('openrouter:', both))).toEqual(['openrouter:~typesafe/jev-latest']);
  });

  it('rejects unknown providers, models, and chat models', () => {
    expect(resolveDecisionModel('openai:gpt-5', both).status).toBe('unknown');
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
});

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

describe('callSystemOne', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const request = { baseURL: 'https://api.example.test/', headers: { Authorization: 'Bearer k' }, body: { model: 'm' } };

  it('posts to /v1/systemone and returns the parsed body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { model: 'm', answers: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(callSystemOne(request)).resolves.toEqual({ model: 'm', answers: {} });
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

    await expect(callSystemOne(request)).resolves.toEqual({ answers: { a: {} } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry request faults and marks them terminal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(400, { error: { message: 'bad' } }));
    vi.stubGlobal('fetch', fetchMock);

    const error = await callSystemOne(request).catch((e) => e);
    expect(error).toBeInstanceOf(DecisionError);
    expect(error.terminal).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry auth failures but leaves them open to failover', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { detail: { message: 'no' } }));
    vi.stubGlobal('fetch', fetchMock);

    const error = await callSystemOne(request).catch((e) => e);
    expect(error.status).toBe(401);
    expect(error.terminal).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxRetries on repeated 5xx', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(503, {}, { 'retry-after-ms': '1' })));
    vi.stubGlobal('fetch', fetchMock);

    const error = await callSystemOne({ ...request, maxRetries: 2 }).catch((e) => e);
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

      const error = await callSystemOne(request).catch((e) => e);

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

      const error = await callSystemOne(request).catch((e) => e);

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

      const error = await callSystemOne(request).catch((e) => e);

      expect(error.message.length).toBeLessThan(600);
      expect(error.message.endsWith('…')).toBe(true);
    });
  });

  it('rejects a 2xx body without answers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { model: 'm' })));
    await expect(callSystemOne(request)).rejects.toThrow('missing "answers"');
  });
});
