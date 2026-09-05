/**
 * Gemini CLI (Antigravity / agy) Provider Unit Tests
 *
 * Covers the pure helpers (buildPrompt, cleanAgyOutput, resolveAgyModel,
 * findAgyBinary), gemini: prefix routing, and the runAgy subprocess runner with
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
import { mapModelToProvider } from '../../../src/utils/modelRouting.js';

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
  it('maps gemini / gemini:flash to Gemini 3.8 Flash with effort suffix', () => {
    expect(resolveAgyModel('gemini')).toBe('Gemini 3.8 Flash (High)');
    expect(resolveAgyModel('gemini:flash')).toBe('Gemini 3.8 Flash (High)');
    expect(resolveAgyModel('gemini-cli')).toBe('Gemini 3.8 Flash (High)');
  });

  it('maps gemini:pro to Gemini 3.1 Pro', () => {
    expect(resolveAgyModel('gemini:pro')).toBe('Gemini 3.1 Pro (High)');
  });

  it('applies the reasoning_effort suffix table', () => {
    expect(resolveAgyModel('gemini', 'none')).toBe('Gemini 3.8 Flash (Low)');
    expect(resolveAgyModel('gemini', 'minimal')).toBe(
      'Gemini 3.8 Flash (Low)',
    );
    expect(resolveAgyModel('gemini', 'low')).toBe('Gemini 3.8 Flash (Low)');
    expect(resolveAgyModel('gemini', 'medium')).toBe(
      'Gemini 3.8 Flash (Medium)',
    );
    expect(resolveAgyModel('gemini', 'high')).toBe('Gemini 3.8 Flash (High)');
    expect(resolveAgyModel('gemini', 'xhigh')).toBe('Gemini 3.8 Flash (High)');
    expect(resolveAgyModel('gemini', 'max')).toBe('Gemini 3.8 Flash (High)');
    expect(resolveAgyModel('gemini:flash', 'medium')).toBe(
      'Gemini 3.8 Flash (Medium)',
    );
  });

  it('falls Pro medium back to High (Pro has no Medium variant)', () => {
    expect(resolveAgyModel('gemini:pro', 'medium')).toBe(
      'Gemini 3.1 Pro (High)',
    );
  });

  it('maps Pro low/none to Low', () => {
    expect(resolveAgyModel('gemini:pro', 'low')).toBe('Gemini 3.1 Pro (Low)');
    expect(resolveAgyModel('gemini:pro', 'none')).toBe('Gemini 3.1 Pro (Low)');
  });

  it('is case-insensitive on the prefix', () => {
    expect(resolveAgyModel('GEMINI:FLASH', 'max')).toBe(
      'Gemini 3.8 Flash (High)',
    );
    expect(resolveAgyModel('GEMINI:PRO', 'max')).toBe('Gemini 3.1 Pro (High)');
  });

  it('passes full agy display names through verbatim', () => {
    expect(resolveAgyModel('Gemini 3.8 Flash (Low)')).toBe(
      'Gemini 3.8 Flash (Low)',
    );
    expect(resolveAgyModel('Gemini 3.7 Flash (Medium)')).toBe(
      'Gemini 3.7 Flash (Medium)',
    );
    expect(resolveAgyModel('Gemini 3.1 Pro (High)', 'low')).toBe(
      'Gemini 3.1 Pro (High)',
    );
  });
});

describe('Gemini CLI Provider - gemini: prefix routing', () => {
  const providers = { 'gemini-cli': geminiCliProvider, google: {} };

  it('routes gemini:flash and gemini:pro to gemini-cli', () => {
    expect(mapModelToProvider('gemini:flash', providers)).toBe('gemini-cli');
    expect(mapModelToProvider('gemini:pro', providers)).toBe('gemini-cli');
    expect(mapModelToProvider('GEMINI:FLASH', providers)).toBe('gemini-cli');
  });

  it('routes bare gemini / gemini-cli to gemini-cli', () => {
    expect(mapModelToProvider('gemini', providers)).toBe('gemini-cli');
    expect(mapModelToProvider('gemini-cli', providers)).toBe('gemini-cli');
  });

  it('routes bare gemini-pro / gemini-flash to the google API provider', () => {
    expect(mapModelToProvider('gemini-pro', providers)).toBe('google');
    expect(mapModelToProvider('gemini-flash', providers)).toBe('google');
  });
});

describe('Gemini CLI Provider - getModelConfig', () => {
  it('resolves the three user-facing names and aliases', () => {
    expect(geminiCliProvider.getModelConfig('gemini')?.modelName).toBe('gemini');
    expect(geminiCliProvider.getModelConfig('gemini:pro')?.modelName).toBe(
      'gemini:pro',
    );
    expect(geminiCliProvider.getModelConfig('gemini:flash')?.modelName).toBe(
      'gemini:flash',
    );
    expect(geminiCliProvider.getModelConfig('flash')?.modelName).toBe(
      'gemini:flash',
    );
    expect(geminiCliProvider.getModelConfig('pro')?.modelName).toBe(
      'gemini:pro',
    );
  });

  it('defaults bare gemini to Gemini 3.8 Flash', () => {
    const config = geminiCliProvider.getModelConfig('gemini');
    expect(config.agyModelBase).toBe('Gemini 3.8 Flash');
    expect(config.friendlyName).toContain('Gemini 3.8 Flash');
  });

  it('maps full agy display names of any 3.x Flash / Pro to the tier config', () => {
    expect(
      geminiCliProvider.getModelConfig('Gemini 3.8 Flash (High)')?.modelName,
    ).toBe('gemini:flash');
    expect(
      geminiCliProvider.getModelConfig('Gemini 3.7 Flash (Low)')?.modelName,
    ).toBe('gemini:flash');
    expect(
      geminiCliProvider.getModelConfig('Gemini 3.1 Pro (High)')?.modelName,
    ).toBe('gemini:pro');
  });

  it('exposes all three user-facing model names', () => {
    const keys = Object.keys(geminiCliProvider.getSupportedModels());
    expect(keys).toContain('gemini');
    expect(keys).toContain('gemini:pro');
    expect(keys).toContain('gemini:flash');
  });

  it('reports all models as text-only', () => {
    expect(geminiCliProvider.getModelConfig('gemini').supportsImages).toBe(
      false,
    );
    expect(
      geminiCliProvider.getModelConfig('gemini:flash').supportsImages,
    ).toBe(false);
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
        { model: 'gemini', config: {} },
      ),
    ).rejects.toThrow(/images are not supported/i);
  });
});
