/**
 * Anthropic provider wire-format tests against the real @anthropic-ai/sdk.
 *
 * anthropic.test.js mocks the SDK, so it cannot catch SDK-level changes. Here
 * only fetch is stubbed. API version 2026-10-21 (SDK v1+) rejects requests
 * that carry temperature, top_p or top_k with a 400, so callers' sampling
 * options must never reach the wire.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { anthropicProvider } from '../../../src/providers/anthropic.js';

const config = { apiKeys: { anthropic: `sk-ant-${'x'.repeat(40)}` } };

function stubFetch() {
  const requests = [];
  vi.stubGlobal('fetch', async (input, init) => {
    const request = new Request(input, init);
    requests.push({ request, body: await request.json() });
    return Response.json({
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5-5',
      content: [{ type: 'text', text: 'Hello' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 7, output_tokens: 5 },
    });
  });
  return requests;
}

describe('Anthropic provider wire format (real SDK)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('targets API version 2026-10-21+ and never sends sampling parameters', async () => {
    const requests = stubFetch();

    const result = await anthropicProvider.invoke(
      [
        { role: 'system', content: 'Be brief.' },
        { role: 'user', content: 'Say hello' },
      ],
      {
        config,
        model: 'claude-opus-5-5',
        reasoning_effort: 'high',
        temperature: 0.2,
        top_p: 0.9,
        top_k: 40,
      },
    );

    expect(result.content).toBe('Hello');
    expect(requests).toHaveLength(1);
    const { request, body } = requests[0];
    expect(new URL(request.url).pathname).toBe('/v1/messages');
    expect(request.headers.get('anthropic-version') >= '2026-10-21').toBe(true);
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('top_p');
    expect(body).not.toHaveProperty('top_k');
    expect(body.messages).toEqual([{ role: 'user', content: 'Say hello' }]);
  });
});
