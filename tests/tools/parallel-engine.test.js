import { describe, it, expect, vi } from 'vitest';
import { runChatMode } from '../../src/tools/modes/parallel.js';
import providerStreamNormalizer from '../../src/async/providerStreamNormalizer.js';

describe('Parallel engine — terminal stream failure retains partial text', () => {
  it('marks the call failed while keeping the streamed partial (preview + failure info)', async () => {
    // Provider streams two deltas, then the upstream errors in-band mid-stream.
    const provider = {
      stream: vi.fn(() =>
        (async function* () {
          yield { type: 'delta', content: 'Partial answer so far' };
          yield { type: 'delta', content: ' — still going' };
          throw new Error('OpenRouter stream error: upstream 502');
        })(),
      ),
      isAvailable: () => true,
      getModelConfig: () => ({ supportsImages: true }),
    };

    const jobState = {};
    const context = {
      jobId: 'job-terminal-fail',
      signal: { aborted: false },
      updateJob: vi.fn(async (patch) => {
        Object.assign(jobState, patch);
      }),
    };

    const callPlans = [
      {
        modelSpec: 'z-ai/glm-5.2',
        displayModel: 'z-ai/glm-5.2',
        threadKey: 'thread-1',
        candidates: [
          {
            name: 'openrouter',
            providerInstance: provider,
            resolvedModel: 'z-ai/glm-5.2',
            displayModel: 'z-ai/glm-5.2',
          },
        ],
      },
    ];

    const { results } = await runChatMode({
      callPlans,
      buildMessagesForCandidate: () => [{ role: 'user', content: 'hi' }],
      optionsForCandidate: () => ({ model: 'z-ai/glm-5.2' }),
      context,
      providerStreamNormalizer,
      // No retryOptionsFor → single attempt, single (terminal) candidate.
    });

    // (3) The call is still marked FAILED.
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('failed');
    expect(results[0].error).toMatch(/OpenRouter stream error/);

    // (2) The failure info carries the streamed partial text.
    expect(results[0].partial_content).toContain('Partial answer so far');
    expect(results[0].partial_content).toContain('still going');

    // (1) The per-provider preview is retained (not wiped) and the status marker
    // shows the failure.
    expect(jobState['provider_0_status']).toBe('failed');
    expect(jobState['provider_0_preview']).toBeTruthy();
    expect(jobState['provider_0_preview']).toContain('Partial answer so far');
    expect(jobState['accumulated_content']).toContain('Partial answer so far');
  });

  it('caps retained partial_content at 2000 chars', async () => {
    const long = 'x'.repeat(5000);
    const provider = {
      stream: vi.fn(() =>
        (async function* () {
          yield { type: 'delta', content: long };
          throw new Error('boom');
        })(),
      ),
      isAvailable: () => true,
      getModelConfig: () => ({ supportsImages: true }),
    };

    const context = {
      jobId: 'job-cap',
      signal: { aborted: false },
      updateJob: vi.fn(async () => {}),
    };

    const { results } = await runChatMode({
      callPlans: [
        {
          modelSpec: 'z-ai/glm-5.2',
          displayModel: 'z-ai/glm-5.2',
          threadKey: 'thread-2',
          candidates: [
            {
              name: 'openrouter',
              providerInstance: provider,
              resolvedModel: 'z-ai/glm-5.2',
              displayModel: 'z-ai/glm-5.2',
            },
          ],
        },
      ],
      buildMessagesForCandidate: () => [{ role: 'user', content: 'hi' }],
      optionsForCandidate: () => ({ model: 'z-ai/glm-5.2' }),
      context,
      providerStreamNormalizer,
    });

    expect(results[0].status).toBe('failed');
    expect(results[0].partial_content).toHaveLength(2000);
  });
});
