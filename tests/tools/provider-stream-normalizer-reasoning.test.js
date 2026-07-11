/**
 * Provider Stream Normalizer — reasoning passthrough (task-015 Foundation, F7)
 *
 * Proves that a provider `thinking` event survives normalization (as a
 * `reasoning` event and on the `end` metadata) instead of being silently
 * dropped, for the xai/mistral/deepseek/openrouter branches, and that reasoning
 * stays separate from the visible answer text.
 */

import { describe, expect, it } from 'vitest';
import providerStreamNormalizer, {
  EVENT_TYPES,
} from '../../src/async/providerStreamNormalizer.js';

async function* providerStream() {
  yield { type: 'start' };
  yield { type: 'thinking', content: 'let me think' };
  yield { type: 'delta', content: 'the answer' };
  yield { type: 'thinking', content: ' more thinking' };
  yield {
    type: 'end',
    content: 'the answer',
    stop_reason: 'stop',
    metadata: { model: 'm', reasoning_details: [{ type: 'reasoning.text' }] },
  };
}

async function collect(gen) {
  const events = [];
  for await (const ev of gen) events.push(ev);
  return events;
}

describe('providerStreamNormalizer reasoning passthrough', () => {
  for (const provider of ['xai', 'mistral', 'deepseek', 'openrouter']) {
    it(`${provider}: emits reasoning events and carries reasoning on end metadata`, async () => {
      const events = await collect(
        providerStreamNormalizer.normalize(provider, providerStream(), {
          model: 'm',
        }),
      );

      const reasoning = events.filter((e) => e.type === EVENT_TYPES.REASONING);
      expect(reasoning.map((e) => e.data.content)).toEqual([
        'let me think',
        ' more thinking',
      ]);

      const end = events.find((e) => e.type === EVENT_TYPES.END);
      // Reasoning is accumulated on end metadata, kept separate from the answer.
      expect(end.data.metadata.reasoning).toBe('let me think more thinking');
      expect(end.data.content).toBe('the answer');
      // reasoning_details carried through from the provider end metadata.
      expect(end.data.metadata.reasoning_details).toEqual([
        { type: 'reasoning.text' },
      ]);
    });
  }
});
