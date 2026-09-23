/**
 * Gemini CLI (Antigravity / agy) Provider Unit Tests
 *
 * Covers the pure helpers (buildPrompt, cleanAgyOutput, resolveAgyModel,
 * findAgyBinary), router resolution of the gemini namespace and shared Gemini
 * IDs, and the runAgy subprocess runner with
 * the PTY layer mocked (oversize-prompt file mode + abort handling). No real agy
 * spawns occur in these tests.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  buildPrompt,
  cleanAgyOutput,
  resolveAgyModel,
  runAgy,
  geminiCliProvider,
} from '../../../src/providers/gemini-cli.js';
import { getProviders } from '../../../src/providers/index.js';
import { ErrorCodes } from '../../../src/providers/interface.js';
import { resolveModelSpec } from '../../../src/utils/modelRouting.js';

const E = '\x1b';
const BEL = '\x07';

describe('Gemini CLI Provider - buildPrompt', () => {
  it('renders a single user turn without role labels', () => {
    const out = buildPrompt([{ role: 'user', content: 'What is 2+2?' }]);
    expect(out).toBe('What is 2+2?');
  });

  it('renders system preamble and multi-turn User/Assistant labels', () => {
    const out = buildPrompt([
      { role: 'system', content: 'Be terse.' },
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello' },
      { role: 'user', content: 'Bye' },
    ]);
    expect(out).toContain('<system>\nBe terse.\n</system>');
    expect(out).toContain('User: Hi');
    expect(out).toContain('Assistant: Hello');
    expect(out).toContain('User: Bye');
  });

  it('flattens text content parts', () => {
    const out = buildPrompt([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'line one' },
          { type: 'text', text: 'line two' },
        ],
      },
    ]);
    expect(out).toBe('line one\nline two');
  });

  it('throws on image content parts', () => {
    expect(() =>
      buildPrompt([
        {
          role: 'user',
          content: [{ type: 'image', source: { data: 'abc' } }],
        },
      ]),
    ).toThrow(/images are not supported/i);
  });

  it('throws on empty messages', () => {
    expect(() => buildPrompt([])).toThrow();
    expect(() => buildPrompt(null)).toThrow();
  });
});

describe('Gemini CLI Provider - cleanAgyOutput', () => {
  it('strips CSI + OSC sequences and trims to the response', () => {
    const raw = `${E}[?9001h${E}[?1004h${E}[?25l${E}[2J${E}[m${E}[Hpong\r\n${E}]0;some title${BEL}${E}[?25h`;
    expect(cleanAgyOutput(raw)).toBe('pong');
  });

  it('rejoins content split by an OSC title sequence', () => {
    const raw = `${E}[HI will list the cur${E}]0;title${BEL}rent dir.\r\nNext.\r\n`;
    expect(cleanAgyOutput(raw)).toBe('I will list the current dir.\nNext.');
  });

  it('resolves spinner carriage-return frames to the last frame', () => {
    const raw = '⠋ Fetching...\r⠙ Fetching...\rDone\r\n';
    expect(cleanAgyOutput(raw)).toBe('Done');
  });

  it('preserves multi-line markdown', () => {
    const raw = '# Title\r\n\r\n- a\r\n- b\r\n\r\n```js\r\nconst x = 1;\r\n```\r\n';
    expect(cleanAgyOutput(raw)).toBe(
      '# Title\n\n- a\n- b\n\n```js\nconst x = 1;\n```',
    );
  });

  it('returns empty string for empty/non-string input', () => {
    expect(cleanAgyOutput('')).toBe('');
    expect(cleanAgyOutput(null)).toBe('');
    expect(cleanAgyOutput(undefined)).toBe('');
  });
});

describe('Gemini CLI Provider - resolveAgyModel', () => {
  it('maps flash names (and an omitted model) to Gemini 3.8 Flash with effort suffix', () => {
    expect(resolveAgyModel('gemini-3.8-flash')).toBe('Gemini 3.8 Flash (High)');
    expect(resolveAgyModel('flash')).toBe('Gemini 3.8 Flash (High)');
    expect(resolveAgyModel('gemini-3.8')).toBe('Gemini 3.8 Flash (High)');
    expect(resolveAgyModel()).toBe('Gemini 3.8 Flash (High)');
    expect(resolveAgyModel('')).toBe('Gemini 3.8 Flash (High)');
    expect(resolveAgyModel('  ')).toBe('Gemini 3.8 Flash (High)');
  });

  it('maps pro names to Gemini 3.1 Pro', () => {
    expect(resolveAgyModel('gemini-3.1-pro-preview')).toBe(
      'Gemini 3.1 Pro (High)',
    );
    expect(resolveAgyModel('pro')).toBe('Gemini 3.1 Pro (High)');
    expect(resolveAgyModel('gemini-pro')).toBe('Gemini 3.1 Pro (High)');
    expect(resolveAgyModel('gemini-3.1-pro')).toBe('Gemini 3.1 Pro (High)');
  });

  it('applies the reasoning_effort suffix table', () => {
    const flash = 'gemini-3.8-flash';
    expect(resolveAgyModel(flash, 'none')).toBe('Gemini 3.8 Flash (Low)');
    expect(resolveAgyModel(flash, 'minimal')).toBe('Gemini 3.8 Flash (Low)');
    expect(resolveAgyModel(flash, 'low')).toBe('Gemini 3.8 Flash (Low)');
    expect(resolveAgyModel(flash, 'medium')).toBe('Gemini 3.8 Flash (Medium)');
    expect(resolveAgyModel(flash, 'high')).toBe('Gemini 3.8 Flash (High)');
    expect(resolveAgyModel(flash, 'xhigh')).toBe('Gemini 3.8 Flash (High)');
    expect(resolveAgyModel(flash, 'max')).toBe('Gemini 3.8 Flash (High)');
    expect(resolveAgyModel('flash', 'medium')).toBe('Gemini 3.8 Flash (Medium)');
  });

  it('falls Pro medium back to High (Pro has no Medium variant)', () => {
    expect(resolveAgyModel('pro', 'medium')).toBe('Gemini 3.1 Pro (High)');
  });

  it('maps Pro low/none to Low', () => {
    expect(resolveAgyModel('pro', 'low')).toBe('Gemini 3.1 Pro (Low)');
    expect(resolveAgyModel('pro', 'none')).toBe('Gemini 3.1 Pro (Low)');
  });

  it('is case-insensitive on catalog names', () => {
    expect(resolveAgyModel('FLASH', 'max')).toBe('Gemini 3.8 Flash (High)');
    expect(resolveAgyModel('GEMINI-3.1-PRO-PREVIEW', 'max')).toBe(
      'Gemini 3.1 Pro (High)',
    );
  });

  it('rejects agy display names, namespaced specs and unknown names', () => {
    for (const name of [
      'Gemini 3.8 Flash (Low)',
      'Gemini 3.1 Pro (High)',
      'gemini:flash',
      'gemini:pro',
      'gemini',
      'gpt-5',
    ]) {
      expect(() => resolveAgyModel(name)).toThrow(
        expect.objectContaining({ code: ErrorCodes.MODEL_NOT_FOUND }),
      );
    }
  });
});

describe('Gemini CLI Provider - router resolution', () => {
  // gemini-cli availability depends on an agy binary being installed and
  // google's on an API key, so each test pins both explicitly.
  function providersWithAgy(available) {
    const providers = getProviders();
    return {
      ...providers,
      'gemini-cli': {
        ...providers['gemini-cli'],
        isAvailable: () => available,
      },
      google: { ...providers.google, isAvailable: () => true },
    };
  }

  it('routes gemini:flash and gemini:pro to gemini-cli', () => {
    const providers = providersWithAgy(true);
    const cases = [
      ['gemini:flash', 'gemini-3.8-flash'],
      ['gemini:pro', 'gemini-3.1-pro-preview'],
      ['GEMINI:FLASH', 'gemini-3.8-flash'],
      ['agy:pro', 'gemini-3.1-pro-preview'],
    ];
    for (const [spec, model] of cases) {
      const result = resolveModelSpec(spec, providers, {});
      expect(result.status).toBe('ok');
      expect(result.providerName).toBe('gemini-cli');
      expect(result.resolvedModel).toBe(model);
    }
  });

  it('routes bare gemini / agy / gemini-cli to the gemini-cli default', () => {
    const providers = providersWithAgy(true);
    for (const spec of ['gemini', 'agy', 'antigravity', 'gemini-cli', 'gemini:']) {
      const result = resolveModelSpec(spec, providers, {});
      expect(result.status).toBe('ok');
      expect(result.providerName).toBe('gemini-cli');
      expect(result.resolvedModel).toBe('gemini-3.8-flash');
    }
  });

  it('honours the AGY_DEFAULT_MODEL override for bare gemini', () => {
    const result = resolveModelSpec('gemini', providersWithAgy(true), {
      providers: { agydefaultmodel: 'pro' },
    });
    expect(result.status).toBe('ok');
    expect(result.resolvedModel).toBe('gemini-3.1-pro-preview');
  });

  it('prefers gemini-cli for shared bare Gemini IDs, with google as failover', () => {
    const providers = providersWithAgy(true);
    for (const spec of ['gemini-pro', 'gemini-3.1-pro-preview']) {
      const result = resolveModelSpec(spec, providers, {});
      expect(result.status).toBe('ok');
      expect(result.providerName).toBe('gemini-cli');
      expect(result.resolvedModel).toBe('gemini-3.1-pro-preview');
      expect(result.candidates.map((c) => c.providerName)).toEqual([
        'gemini-cli',
        'google',
      ]);
    }
  });

  it('routes bare Gemini IDs to the google API provider when agy is absent', () => {
    const providers = providersWithAgy(false);
    const pro = resolveModelSpec('gemini-pro', providers, {});
    expect(pro.status).toBe('ok');
    expect(pro.providerName).toBe('google');
    expect(pro.resolvedModel).toBe('gemini-3.1-pro-preview');

    const flash = resolveModelSpec('gemini-flash', providers, {});
    expect(flash.status).toBe('ok');
    expect(flash.providerName).toBe('google');
  });

  it('reports gemini: specs as unavailable when agy is absent', () => {
    const result = resolveModelSpec('gemini:flash', providersWithAgy(false), {});
    expect(result.status).toBe('unavailable');
    expect(result.providerName).toBe('gemini-cli');
  });

  it('rejects unknown gemini: models with suggestions', () => {
    const result = resolveModelSpec('gemini:flsh', providersWithAgy(true), {});
    expect(result.status).toBe('unknown');
    expect(result.providerName).toBe('gemini-cli');
    expect(result.error).toContain('Did you mean');
    expect(result.error).toContain('gemini:flash');
  });
});

describe('Gemini CLI Provider - getModelConfig', () => {
  it('resolves canonical IDs and aliases', () => {
    expect(geminiCliProvider.getModelConfig('gemini-3.8-flash')?.modelName).toBe(
      'gemini-3.8-flash',
    );
    expect(
      geminiCliProvider.getModelConfig('gemini-3.1-pro-preview')?.modelName,
    ).toBe('gemini-3.1-pro-preview');
    expect(geminiCliProvider.getModelConfig('flash')?.modelName).toBe(
      'gemini-3.8-flash',
    );
    expect(geminiCliProvider.getModelConfig('pro')?.modelName).toBe(
      'gemini-3.1-pro-preview',
    );
    expect(geminiCliProvider.getModelConfig('Gemini-Pro')?.modelName).toBe(
      'gemini-3.1-pro-preview',
    );
  });

  it('defaults to Gemini 3.8 Flash', () => {
    expect(geminiCliProvider.defaultModel).toBe('gemini-3.8-flash');
    const config = geminiCliProvider.getModelConfig(
      geminiCliProvider.defaultModel,
    );
    expect(config.agyModelBase).toBe('Gemini 3.8 Flash');
    expect(config.friendlyName).toContain('Gemini 3.8 Flash');
  });

  it('does not match agy display names or namespaced specs', () => {
    expect(geminiCliProvider.getModelConfig('Gemini 3.8 Flash (High)')).toBeNull();
    expect(geminiCliProvider.getModelConfig('Gemini 3.1 Pro (High)')).toBeNull();
    expect(geminiCliProvider.getModelConfig('gemini:flash')).toBeNull();
    expect(geminiCliProvider.getModelConfig('gemini')).toBeNull();
  });

  it('is keyed by the same model IDs as the google provider', () => {
    const models = geminiCliProvider.getSupportedModels();
    expect(Object.keys(models)).toEqual([
      'gemini-3.8-flash',
      'gemini-3.1-pro-preview',
    ]);
    expect(models['gemini-3.8-flash'].agyModelBase).toBe('Gemini 3.8 Flash');
    expect(models['gemini-3.1-pro-preview'].agyModelBase).toBe('Gemini 3.1 Pro');
    for (const id of Object.keys(models)) {
      expect(getProviders().google.getModelConfig(id)).toBeTruthy();
    }
  });

  it('reports all models as text-only', () => {
    for (const config of Object.values(geminiCliProvider.getSupportedModels())) {
      expect(config.supportsImages).toBe(false);
    }
  });

  it('returns null for unknown models', () => {
    expect(geminiCliProvider.getModelConfig('gpt-5')).toBeNull();
    expect(geminiCliProvider.getModelConfig(null)).toBeNull();
  });
});

/**
 * Build a fake @lydell/node-pty module whose spawn() records args and lets the
 * test drive onData/onExit.
 */
function makeFakePty({ killFiresExit = true } = {}) {
  const calls = [];
  let dataCb = null;
  let exitCb = null;
  let killed = false;

  const child = {
    onData(cb) {
      dataCb = cb;
      return { dispose() {} };
    },
    onExit(cb) {
      exitCb = cb;
      return { dispose() {} };
    },
    kill() {
      killed = true;
      // Real ConPTY fires onExit synchronously on kill — exercise the
      // race-hardening that must still reject (not resolve) when terminating.
      if (killFiresExit && exitCb) {
        exitCb({ exitCode: -1 });
      }
    },
  };

  const ptyLib = {
    spawn(binary, args, opts) {
      calls.push({ binary, args, opts });
      return child;
    },
  };

  return {
    ptyLib,
    calls,
    emitData: (s) => dataCb && dataCb(s),
    emitExit: (code) => exitCb && exitCb({ exitCode: code }),
    wasKilled: () => killed,
  };
}

describe('Gemini CLI Provider - runAgy (mocked PTY)', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('passes a small prompt directly as the -p argv value', async () => {
    const fake = makeFakePty();
    const promise = runAgy({
      prompt: 'hello world',
      model: 'Gemini 3.8 Flash (Low)',
      timeoutMs: 5000,
      ptyLib: fake.ptyLib,
      agyPath: 'C:/fake/agy.exe',
    });

    // Let the spawn happen, then drive output + exit.
    await Promise.resolve();
    fake.emitData('hello world response');
    fake.emitExit(0);

    const res = await promise;
    expect(res.exitCode).toBe(0);

    const { args } = fake.calls[0];
    expect(args).toContain('--dangerously-skip-permissions');
    const pIdx = args.indexOf('-p');
    expect(args[pIdx + 1]).toBe('hello world');
    const mIdx = args.indexOf('--model');
    expect(args[mIdx + 1]).toBe('Gemini 3.8 Flash (Low)');
  });

  it('routes an oversize prompt to file mode (argv stays small, prompt.md written)', async () => {
    const fake = makeFakePty();
    const bigPrompt = 'x'.repeat(30000);
    const promise = runAgy({
      prompt: bigPrompt,
      model: 'Gemini 3.1 Pro (High)',
      timeoutMs: 5000,
      ptyLib: fake.ptyLib,
      agyPath: 'C:/fake/agy.exe',
    });

    await Promise.resolve();
    fake.emitData('answer');
    fake.emitExit(0);
    await promise;

    const { args } = fake.calls[0];
    expect(args).toContain('--dangerously-skip-permissions');
    const pIdx = args.indexOf('-p');
    const promptArg = args[pIdx + 1];
    // argv carries a short bootstrap, not the 30k-char prompt
    expect(promptArg.length).toBeLessThan(500);
    expect(promptArg).toMatch(/prompt\.md/);
    expect(promptArg).toMatch(/Read the file/i);
  });

  it('kills the PTY and rejects as cancelled when the abort signal fires (kill fires exit)', async () => {
    // killFiresExit: true — the kill()-induced onExit must NOT resolve as a
    // normal exit; the cancellation error wins.
    const fake = makeFakePty({ killFiresExit: true });
    const controller = new AbortController();
    const promise = runAgy({
      prompt: 'hello',
      model: 'Gemini 3.8 Flash (Low)',
      timeoutMs: 5000,
      signal: controller.signal,
      ptyLib: fake.ptyLib,
      agyPath: 'C:/fake/agy.exe',
    });

    await Promise.resolve();
    controller.abort();

    await expect(promise).rejects.toThrow(/cancelled/i);
    expect(fake.wasKilled()).toBe(true);
  });

  it('force-settles via the post-kill grace timer if onExit never fires', async () => {
    // killFiresExit: false — onExit never comes after kill(); the grace timer
    // must still reject so cancellation can't hang.
    const fake = makeFakePty({ killFiresExit: false });
    const controller = new AbortController();
    const promise = runAgy({
      prompt: 'hello',
      model: 'Gemini 3.8 Flash (Low)',
      timeoutMs: 5000,
      signal: controller.signal,
      ptyLib: fake.ptyLib,
      agyPath: 'C:/fake/agy.exe',
    });

    await Promise.resolve();
    controller.abort();

    await expect(promise).rejects.toThrow(/cancelled/i);
    expect(fake.wasKilled()).toBe(true);
  });

  it('rejects immediately if the signal is already aborted', async () => {
    const fake = makeFakePty();
    const controller = new AbortController();
    controller.abort();

    await expect(
      runAgy({
        prompt: 'hello',
        model: 'Gemini 3.8 Flash (Low)',
        timeoutMs: 5000,
        signal: controller.signal,
        ptyLib: fake.ptyLib,
        agyPath: 'C:/fake/agy.exe',
      }),
    ).rejects.toThrow(/cancelled/i);
    // spawn never happened
    expect(fake.calls.length).toBe(0);
  });
});

describe('Gemini CLI Provider - invoke error mapping (mocked PTY)', () => {
  it('surfaces a nonzero exit code and output for the provider to map', async () => {
    const fake = makeFakePty();
    // executeAgy's exit-to-error mapping needs a real provider invoke (covered
    // by integration tests); here we assert runAgy surfaces the raw exit code
    // and output that the provider maps into an error.
    const promise = runAgy({
      prompt: 'hi',
      model: 'Gemini 3.8 Flash (Low)',
      timeoutMs: 5000,
      ptyLib: fake.ptyLib,
      agyPath: 'C:/fake/agy.exe',
    });
    await Promise.resolve();
    fake.emitData('boom');
    fake.emitExit(1);
    const res = await promise;
    expect(res.exitCode).toBe(1);
    expect(res.output).toContain('boom');
  });

  it('invoke() rejects an image request through buildPrompt', async () => {
    await expect(
      geminiCliProvider.invoke(
        [{ role: 'user', content: [{ type: 'image', source: { data: 'x' } }] }],
        { model: 'gemini-3.8-flash', config: {} },
      ),
    ).rejects.toThrow(/images are not supported/i);
  });

  it('invoke() rejects an unknown model before spawning agy', async () => {
    await expect(
      geminiCliProvider.invoke([{ role: 'user', content: 'hi' }], {
        model: 'gemini:flash',
        config: {},
      }),
    ).rejects.toMatchObject({ code: ErrorCodes.MODEL_NOT_FOUND });
  });
});
