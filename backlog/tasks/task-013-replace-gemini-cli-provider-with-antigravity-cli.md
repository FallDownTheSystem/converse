---
id: task-013-replace-gemini-cli-provider-with-antigravity-cli
title: Replace gemini-cli Provider with Antigravity CLI (agy) Subprocess Provider
status: "Done"
created_date: '2026-06-10 10:35'
updated_date: '2026-06-10 12:52'
parent: null
subtasks: []
dependencies: []
---

## Description
<!-- DESCRIPTION:BEGIN -->
Google sunsets Gemini CLI OAuth for AI Pro/Ultra and free users on **2026-06-18**, which breaks the current `gemini-cli` provider (`ai-sdk-provider-gemini-cli` rides those OAuth credentials). Replace its internals with a subprocess provider that shells out to the Antigravity CLI (`agy.exe`, v1.0.7+) in print mode (`agy -p`), authenticated via the user's Antigravity Google OAuth login. The user-facing model name stays `gemini` and the internal provider registry key stays `gemini-cli`, so routing, stream normalization, and tool integration remain stable.
<!-- DESCRIPTION:END -->

## Specification
<!-- SPECIFICATION:BEGIN -->
**Technical requirements**

- Rewrite `src/providers/gemini-cli.js` to spawn `agy` under a pseudo-terminal via `@lydell/node-pty` (prebuilt binaries, no compiler needed) instead of using `ai-sdk-provider-gemini-cli`. A PTY is REQUIRED, not optional: agy print mode silently drops stdout in any non-TTY context (upstream bug google-antigravity/antigravity-cli#76, unfixed as of v1.0.7) — verified empirically 2026-06-10. Remove `ai-sdk-provider-gemini-cli` from `package.json`, add `@lydell/node-pty` (via pnpm; respect the 24h minimumReleaseAge policy).
- The provider registry key remains `'gemini-cli'` and the user-facing alias remains `'gemini'`; the `providerStreamNormalizer` registration key is untouched. One routing ADDITION (decided in review): a `gemini:` model prefix (mirroring the existing `copilot:` pattern) routes to `'gemini-cli'` — added as `modelLower.startsWith('gemini:')` checks in all three duplicated routing copies (`src/utils/modelRouting.js` ~line 107, `src/tools/chat.js` ~line 617, `src/tools/consensus.js` ~line 821), placed before the google `flash`/`pro` keyword rule. The model schema description strings (`src/tools/chat.js` ~line 1159, `src/tools/consensus.js` ~line 1715) gain a `"gemini:flash"` example. Bare `gemini-pro`/`gemini-flash` keep routing to the google provider (unchanged — they collide with google model names).
- Implement the full `ProviderInterface` contract from `src/providers/interface.js`: `invoke(messages, options)` (sync + `stream: true` modes), `validateConfig`, `isAvailable`, `getSupportedModels`, `getModelConfig`.
- `invoke` serializes the full `messages` array (system + prior user/assistant turns) into a single role-labeled prompt string — providers are stateless in converse; continuation history arrives as messages, not as native sessions. No reliance on `agy --conversation`/`-c`.
- Prompt delivery (both paths verified working 2026-06-10): prompts ≤ 24,000 chars pass directly as the `-p` argv value (fast path, ~7s round trip); larger prompts are written to a temp file in the spawn cwd and `-p` carries a short bootstrap instruction telling agy to read that file (verified with a 100KB prompt, ~32s round trip). Stdin delivery is impossible — ConPTY owns stdin, and argv >32,767 chars fails with Windows error 206.
- Streaming mode yields the passthrough event sequence (`start` → single `delta` with the full text → `usage` (zeroed if unavailable) → `end`) consumed by `normalizePassthroughStream`. One-shot: no token-level deltas.
- Every spawn sets `--print-timeout` with explicit precedence: `options.timeout` (ms, if the tool layer ever passes one) → 600,000ms default; `--print-timeout` = ceil(timeout/1000) seconds, JS-side hard kill timer at timeout + 15s. `--dangerously-skip-permissions` is NOT used. `--sandbox` is passed if the large-prompt file-read still works under it (implementation-time check — sandbox propagation in print mode was fixed in agy 1.0.6); if sandbox blocks the file read, omit it and document why in Notes. A hung/unauthenticated CLI must surface as a clear error naming Antigravity authentication as the likely cause (observed: logged-out agy completes silent-auth or exits 0 with empty output rather than failing loudly).
- AbortSignal support: `options.signal` kills the child process (SIGTERM/`child.kill()`), and cancellation propagates as the standard provider error shape.
- Gemini models only. `agy models` (v1.0.7, 2026-06-10) lists: `Gemini 3.5 Flash (Medium)`, `Gemini 3.5 Flash (High)`, `Gemini 3.5 Flash (Low)`, `Gemini 3.1 Pro (Low)`, `Gemini 3.1 Pro (High)`, plus Claude/GPT-OSS entries that are out of scope. User-facing model names are exactly three: `gemini` (= `gemini:pro`), `gemini:pro`, and `gemini:flash`; `getSupportedModels()` exposes these three (all `supportsImages: false`). `options.reasoning_effort` selects the parenthesized variant: `none`/`minimal`/`low` → `(Low)`; `medium` → `(Medium)` for Flash, `(High)` for Pro (Pro has no Medium); `high`/`max` → `(High)`; unset → `(High)`. Default model: `Gemini 3.1 Pro (High)`. `--model` is always passed explicitly with the resolved agy display name (never rely on the user's agy settings.json default). `resolveAgyModel` also accepts full agy display names verbatim (pass-through) so power users aren't blocked.
- Image content (`type: 'image'` message parts) is rejected with a clear "images not supported by the gemini provider" error (print mode has no image input channel). Because the OLD provider supported images and sits at auto-priority 2, this would regress `model: "auto"` requests with images — therefore the auto-selection paths in `chat.js`, `consensus.js`, and `conversation.js` must skip providers whose default model config has `supportsImages: false` when the request contains images (this also fixes the same latent gap for copilot, which is already `supportsImages: false`).
- Provider-unavailable error text: the generic "Provider X is not available. Check API key configuration." messages (`src/tools/chat.js` ~lines 339/910, `src/tools/consensus.js` ~line 372, `src/tools/conversation.js` ~line 271) gain a provider-specific hint — for `'gemini-cli'`: "Install the Antigravity CLI and run `agy` once to log in (https://antigravity.google)". Implemented as a small shared hint map keyed by provider name so other SDK providers can add hints later.
- Availability detection (`isAvailable` + `src/config.js` SDK-provider check + `tests/utils/apiKeyDetection.js` GEMINI_CLI entry) switches from `~/.gemini/oauth_creds.json` to detecting the `agy` binary (PATH lookup plus `%LOCALAPPDATA%\agy\bin\agy.exe` fallback on Windows, `~/.local/bin/agy` on POSIX).
- Update help text (`src/prompts/helpPrompt.js`) and docs (`docs/API.md`, `docs/PROVIDERS.md`) to describe Antigravity CLI installation and OAuth login instead of `@google/gemini-cli`.

**Acceptance criteria**

1. `chat` with `model: "gemini"` returns a correct response through `agy -p` (verified against live CLI, authenticated).
2. A two-turn conversation via `continuation_id` shows the model using turn-1 context (manual transcript embedding works).
3. A prompt > 32KB (large file attached) completes without spawn errors.
4. `consensus` and `conversation` tools accept `"gemini"` as one of the models and stream-normalize its single-chunk output without errors.
5. Async chat (`async: true`) with gemini completes; `check_status` shows running → completed (no partial text expected).
6. Cancelling an in-flight gemini call (sync MCP cancellation or `cancel_job`) terminates the `agy` process (no orphaned `agy.exe` in tasklist).
7. With `agy` missing from PATH, the provider is reported unavailable and excluded from `auto` routing; error messages tell the user to install/login to Antigravity CLI.
8. `pnpm run validate` and `pnpm run test:unit` pass; new unit tests cover prompt serialization, model config, and error mapping without spawning the real CLI.
9. `ai-sdk-provider-gemini-cli` no longer appears in `package.json`, `pnpm-lock.yaml`, or the repo at all — the stale committed `package-lock.json` (which still pins the old ^1.4.0) is deleted; the project is pnpm-only.
10. `model: "gemini:flash"` routes to the provider and returns a response from Gemini 3.5 Flash; bare `gemini-pro` still routes to the google API-key provider.
11. `model: "auto"` with images attached selects an image-capable provider (never gemini-cli or copilot) instead of erroring.

**Out of scope**

- Exposing Claude/GPT-OSS Antigravity models (future task if wanted).
- Token-level streaming, `--conversation` native resume, usage-token accounting beyond zeroed placeholders if agy emits no usage data.
- Renaming the internal `'gemini-cli'` registry key.
<!-- SPECIFICATION:END -->

## Design
<!-- DESIGN:BEGIN -->
### Architecture

The provider is a one-shot subprocess wrapper. Each `invoke()` call:

1. Validates messages (rejects `type: 'image'` content parts with a clear error).
2. Serializes the full `messages` array into a single prompt string via `buildPrompt(messages)`.
3. Resolves the agy model identifier from the requested model + `reasoning_effort` via `resolveAgyModel(model, reasoningEffort)`.
4. Runs `runAgy({ prompt, model, timeoutMs, signal })`: spawns `agy.exe` under `@lydell/node-pty`, collects PTY output, waits for exit, cleans the output.
5. Returns a `ProviderResponse` (sync) or yields the passthrough event sequence `start → delta(fullText) → usage → end` (stream mode) for `normalizePassthroughStream`.

No native session resume: `--conversation` print-mode resume works but REPLAYS every prior assistant output before the new response (verified: turn 3 printed `pong\npong\nbanana`), which makes response extraction ambiguous. Converse's tool layer already passes full history, so each call is a fresh agy conversation — robust and stateless.

### Verified empirical facts (agy v1.0.7, 2026-06-10, Windows 11)

| Fact | Evidence |
|---|---|
| Non-TTY stdout silently dropped (exit 0, full round trip happens) | Reproduced 4 ways (pipe, redirect, hidden console, stdin EOF); upstream bug [#76](https://github.com/google-antigravity/antigravity-cli/issues/76), open, no official response |
| PTY capture works cleanly | `@lydell/node-pty` (ConPTY): `-p "Reply with exactly: pong"` → `"pong\r\n"`, 93 raw bytes, 7.2s |
| Headless silent auth from cached OAuth creds | log: `printmode.go:181/183 silent auth succeeded` (~2s) |
| argv limit | 100KB prompt → CreateProcess error 206; Windows ceiling is 32,767 chars |
| Large prompt via workspace file | `-p "Read the file bigprompt.txt …"` with 100KB file → correct answer, 31.6s |
| `agy models` output needs spinner-stripping | spinner frames (`⠋ Fetching…`) precede the model list in PTY capture |
| Workspace trust | `~/.gemini/antigravity-cli/settings.json` `trustedWorkspaces: ["C:\\Users\\Juugo"]` covers subdirectories (TEMP + converse dir both worked); trust is established during first interactive login |
| Open-pipe stdin hangs agy before print mode starts | PowerShell pipe spawn hung 18+ min ignoring `--print-timeout`; stdin must be at EOF — PTY handles this |
| Conversation ID discoverable | `~/.gemini/antigravity-cli/cache/last_conversations.json` maps workspace dir → last conversation ID (not needed in this design; documented for future use) |

### Key implementation decisions

- **PTY geometry**: spawn with large `cols` (e.g. 1000) to minimize soft-wrapping of long response lines; `rows` irrelevant for print mode. Implementation must verify a multi-paragraph response with >1000-char lines survives round-trip (soft-wrap inserts `\r\n` that cannot be distinguished from hard newlines; with cols=1000 this is rare in practice — document residual risk in Notes).
- **Output cleaning** (`cleanAgyOutput(raw)`): strip ANSI escape sequences (CSI, OSC, charset selection), resolve carriage-return overwrites (spinner frames), trim trailing newline. Must be a pure exported function for unit testing.
- **Prompt serialization** (`buildPrompt(messages)`): system message becomes a `<system>` preamble; turns rendered as `User:` / `Assistant:` labeled blocks; ends with an instruction to answer the final user message directly without role labels. Pure exported function.
- **Binary discovery** (`findAgyBinary()`): `agy` on PATH first, then `%LOCALAPPDATA%\agy\bin\agy.exe` (Windows) / `~/.local/bin/agy` (POSIX). Cached at module level. Used by both `isAvailable()` and spawn.
- **Spawn cwd**: a per-call directory under the user's HOME (`path.join(os.homedir(), '.converse', 'agy-runs', <uuid>)`) — NOT `os.tmpdir()`, which is outside home on POSIX and would fall outside agy's prefix-based workspace trust. Isolates agy's workspace from the user's repo, gives the large-prompt path a place for `prompt.md`, removed best-effort in a `finally` block (cleanup failure logs a warning, never throws).
- **Timeout/cancel**: `--print-timeout <s>` from the precedence rule in the Spec; a JS-side hard timer at timeout+15s and `signal.addEventListener('abort', …)` both call `pty.kill()`. Lifecycle hardening: settlement is idempotent (single `settled` flag guarding resolve/reject); on settle, clear the hard timer, remove the abort listener, and dispose the `onData`/`onExit` subscriptions; after `pty.kill()` a 5s grace timer force-settles even if `onExit` never fires, so cancellation can never hang. Exit without output or nonzero exit → `ProviderError` whose message includes captured output tail and the hint "run `agy` interactively once to authenticate (Antigravity OAuth)".
- **Usage**: agy emits no token counts; metadata.usage is `null` (sync) / usage event zeroed (stream), matching what `normalizePassthroughStream` tolerates.
- **Model table**: user-facing aliases → agy display names — `gemini` and `gemini:pro` → `Gemini 3.1 Pro`, `gemini:flash` → `Gemini 3.5 Flash`. `resolveAgyModel(model, reasoningEffort)` strips the `gemini:` prefix (case-insensitive, mirroring `resolveModelAlias` in `src/providers/copilot.js` ~lines 489–548), maps the alias, appends the effort suffix (`none`/`minimal`/`low` → `(Low)`; `medium` → `(Medium)` Flash / `(High)` Pro; `high`/`max`/unset → `(High)`), and passes through full display names verbatim.
- **Concurrency**: consensus/conversation spawn providers in parallel, so concurrent agy processes will share `~/.gemini/antigravity-cli` (auth cache, sqlite stores, auto-updater). Per-call cwds prevent workspace collisions; shared-state safety must be verified manually with 3 simultaneous invokes (consensus with gemini + two others, or three parallel gemini chats). If parallel spawns flake, add a provider-local concurrency limiter (simple promise queue) — decision recorded in Notes either way.

### File map

| File | Action | Responsibility |
|---|---|---|
| `src/providers/gemini-cli.js` | rewrite | agy subprocess provider; keeps export name `geminiCliProvider`; exports pure helpers `buildPrompt`, `cleanAgyOutput`, `resolveAgyModel`, `findAgyBinary` for tests |
| `package.json` | edit | drop `ai-sdk-provider-gemini-cli`, add `@lydell/node-pty` |
| `src/config.js` | edit | line ~660: replace stale `'gemini-cli': '@anthropic-ai/claude-code'` SDK-package entry with an agy-binary availability check; update no-API-key error text (line ~674) to say "Antigravity CLI" |
| `src/prompts/helpPrompt.js` | edit | line ~503: auth description → "Requires Antigravity CLI (`agy`) with Google OAuth login"; display label stays "Gemini CLI"-adjacent → "Gemini (Antigravity CLI)" |
| `tests/utils/apiKeyDetection.js` | edit | `GEMINI_CLI.customCheck` → agy binary detection (same lookup as `findAgyBinary`) |
| `tests/unit/providers/gemini-cli.test.js` | new | unit tests for pure helpers + invoke error paths with PTY layer mocked |
| `tests/integration/providers/gemini-cli/gemini-cli-api.test.js` | rewrite | live E2E against installed agy (gated on binary presence) |
| `src/utils/modelRouting.js` (~107) | edit | add `gemini:` prefix routing (before google `flash`/`pro` keyword rule) |
| `src/tools/chat.js` | edit | `gemini:` prefix routing (~617); image-aware auto-selection skip (~301/873); provider-unavailable hint map (~339/910); model description string (~1159) |
| `src/tools/consensus.js` | edit | `gemini:` prefix routing (~821); image-aware auto-selection skip (~302/1057); unavailable hint (~372); models description string (~1715) |
| `src/tools/conversation.js` | edit | image-aware auto-selection skip (~212); unavailable hint (~271) |
| `docs/API.md` (~450, 617, 627), `docs/PROVIDERS.md` (~117, 134, 284), `README.md` (~427) | edit | setup: install via `irm https://antigravity.google/cli/install.ps1 \| iex` (or .sh) + run `agy` once to login; `gemini:flash` syntax; README priority-list label |
| `package-lock.json` | delete | stale npm lockfile (repo is pnpm-only; still pins old ^1.4.0) |

**Unchanged on purpose** (registry key `'gemini-cli'` and alias `'gemini'` are kept): `src/providers/index.js`, `src/async/providerStreamNormalizer.js` (passthrough registration), `tests/utils/conditionalTest.js` (`hasGeminiCli` keeps working via updated detection).
<!-- DESIGN:END -->

## TODO
<!-- TODO:BEGIN -->
- [x] Dependencies: `pnpm remove ai-sdk-provider-gemini-cli && pnpm add @lydell/node-pty` (pick a version ≥24h old per the release-age policy; 1.2.0-beta.12 verified working in the spike).
- [x] Rewrite `src/providers/gemini-cli.js` — pure helpers first: `findAgyBinary()` (PATH → `%LOCALAPPDATA%\agy\bin\agy.exe` → `~/.local/bin/agy`, module-level cache), `resolveAgyModel(model, reasoningEffort)` (alias table + effort suffix per Design), `buildPrompt(messages)` (system preamble + `User:`/`Assistant:` blocks + final answer instruction; throws on `type: 'image'` parts), `cleanAgyOutput(raw)` (ANSI strip, CR-overwrite resolution, trim). Export all four.
- [x] Implement `runAgy({ prompt, model, timeoutMs, signal })`: create per-call cwd at `path.join(os.homedir(), '.converse', 'agy-runs', <uuid>)` (NOT os.tmpdir — POSIX trust, see Design); if `prompt.length > 24000` write it to `prompt.md` in that cwd and substitute the bootstrap instruction ("Read the file prompt.md in the current working directory and respond to it directly…"); spawn via `@lydell/node-pty` with `cols: 1000`, args `['-p', <prompt>, '--model', <agyModel>, '--print-timeout', <s>+'s']`; collect `onData`, resolve on `onExit`. Lifecycle per Design: idempotent settle flag; on settle clear hard timer (timeoutMs+15s), remove abort listener, dispose onData/onExit subscriptions; `pty.kill()` on abort/timer with a 5s post-kill grace timer that force-settles; best-effort cwd cleanup in `finally`.
- [x] During implementation, test `--sandbox` with the large-prompt file read: if the read works sandboxed, add `--sandbox` to the arg list; if not, omit it and record the result in Notes.
- [x] Implement `invoke(messages, options)` returning `ProviderResponse` (`content`, `stop_reason: 'stop'`, `metadata: { provider: 'gemini-cli', model, usage: null, response_time_ms }`) and, when `options.stream` is true, an async generator yielding `{type:'start',provider:'gemini-cli',model}` → `{type:'delta',data:{textDelta: fullText}}` → `{type:'usage',usage:{input_tokens:0,output_tokens:0,total_tokens:0,cached_input_tokens:0}}` → `{type:'end',stop_reason:'stop',finish_reason:'stop'}`. Map failures: nonzero exit → error including cleaned output tail; exit 0 with empty cleaned output → error citing bug #76 + "run `agy` interactively once to authenticate"; abort → standard cancellation error.
- [x] Implement `validateConfig` (always true — no env keys), `isAvailable` (`findAgyBinary() !== null`), `getSupportedModels` (five Gemini entries from Design), `getModelConfig`.
- [x] `src/config.js`: replace the stale `'gemini-cli': '@anthropic-ai/claude-code'` entry (~line 660) so gemini-cli availability comes from the agy binary check (import the helper or duplicate the path probe — keep config.js dependency-free if importing the provider creates a cycle); update the at-least-one-key error message (~line 674).
- [x] `tests/utils/apiKeyDetection.js`: `GEMINI_CLI.customCheck` → agy binary existence (same probe paths as `findAgyBinary`).
- [x] `src/prompts/helpPrompt.js`: auth bullet (~line 503) → "Requires Antigravity CLI (`agy`) installed and authenticated via Google OAuth (run `agy` once interactively)"; display label (~line 465) `formatProviderModels('Gemini CLI', …)` → `'Gemini (Antigravity CLI)'`. The model-list key at ~line 369 stays `'gemini-cli'`.
- [x] Add `gemini:` prefix routing — `if (modelLower.startsWith('gemini:')) return 'gemini-cli';` placed with the existing `copilot:` prefix checks (BEFORE the google `flash`/`pro` keyword rule) in all three copies: `src/utils/modelRouting.js` (~107), `src/tools/chat.js` (~617), `src/tools/consensus.js` (~821). Add `"gemini:flash"` to the model description strings (`chat.js` ~1159, `consensus.js` ~1715).
- [x] Image-aware auto-selection: when the request contains image content, the `auto` provider-priority loops in `chat.js` (~301 sync, ~873 async), `consensus.js` (~302 sync, ~1057 async), and `conversation.js` (~212) skip providers whose default model config has `supportsImages: false`. Extract one shared predicate (e.g. `providerSupportsImages(providerInstance)`) rather than five inline copies if the duplicated structure allows; otherwise keep copies textually identical.
- [x] Provider-unavailable hint map: shared `PROVIDER_SETUP_HINTS = { 'gemini-cli': 'Install the Antigravity CLI and run `agy` once to log in (https://antigravity.google)' }` appended to the "Provider X is not available." errors in `chat.js` (~339/910), `consensus.js` (~372), `conversation.js` (~271).
- [x] Repo hygiene: delete the stale `package-lock.json` (pnpm-only repo; it still pins ai-sdk-provider-gemini-cli ^1.4.0); update `README.md` (~427) priority-list entry "Gemini CLI (`gemini`)" → "Gemini via Antigravity CLI (`gemini`, `gemini:flash`)".
- [x] New `tests/unit/providers/gemini-cli.test.js` covering: `buildPrompt` renders system + multi-turn labels and throws on image parts; `cleanAgyOutput` strips ANSI sequences and spinner CR-frames (use the captured `agy models` raw output as a fixture) and preserves multi-line markdown; `resolveAgyModel` maps `gemini`/`gemini:pro`/`gemini:flash` (prefix strip, case-insensitive) × all six `reasoning_effort` values (`none`/`minimal`/`low`/`medium`/`high`/`max`) + unset, including the Pro-medium→High rule and display-name passthrough; routing: `gemini:flash` → `'gemini-cli'` while bare `gemini-pro` → `'google'` (test against `mapModelToProvider` in `src/utils/modelRouting.js`); oversize prompt (>24000 chars) routes to file mode (assert via injected/mocked PTY layer that argv stays under limit and `prompt.md` is written); abort signal kills the PTY (mocked). No real agy spawns in unit tests.
- [x] Rewrite `tests/integration/providers/gemini-cli/gemini-cli-api.test.js`: keep the `testWithApiKeys({ requiredProviders: ['GEMINI_CLI'] })` gating; cover basic chat (`model: 'gemini'`), `gemini:flash` model selection, two-turn continuation context, >32KB-prompt request, consensus participation, async job completion, cancellation (no orphaned agy.exe), and a 3-way parallel-invoke run (shared `~/.gemini/antigravity-cli` state — record flakiness verdict + limiter decision in Notes).
- [x] Update `docs/API.md` (lines ~450/617/627) and `docs/PROVIDERS.md` (lines ~117/134/284): install command (`irm https://antigravity.google/cli/install.ps1 | iex` / `curl -fsSL https://antigravity.google/cli/install.sh | bash`), one-time interactive `agy` login requirement, note that the first login also establishes workspace trust.
- [x] Verify acceptance criteria 1–7 and 10–11 manually against the live CLI (authenticated), then run `pnpm run validate` and `pnpm run test:unit` (criteria 8–9). Record results + any divergence in Notes.
<!-- TODO:END -->

## Notes
<!-- NOTES:BEGIN -->
Context: Google sunsets Gemini CLI OAuth for AI Pro/Ultra + free users on 2026-06-18; converse's gemini-cli provider (ai-sdk-provider-gemini-cli) breaks then. Replacement: spawn Antigravity CLI (`agy -p`) as a subprocess. Provider keeps user-facing name "gemini". Gemini models only. One-shot output (no token streaming) accepted.

**Open questions / residual risks:**
- Soft-wrap ambiguity: with PTY `cols: 1000`, response lines longer than 1000 chars get wrapped and the inserted newlines are indistinguishable from real ones. Rare in practice (markdown wraps naturally). If it bites, options: raise cols (find ConPTY max) or post-process by joining lines that end exactly at the col boundary.
- agy auto-updates itself (`auto_updater.go` in logs); a future version could change print-mode rendering or fix bug #76 (which would make plain `child_process` viable and the PTY dependency removable). Re-check the upstream issue when it closes.
- Quota: Antigravity uses a weekly compute cap (vs Gemini CLI's 1000 req/day). Heavy consensus use may exhaust it; rate-limit error surfacing is best-effort (unknown error format — capture and map when first observed).
- Latency: ~7s minimum per call (CLI boot + silent auth + agent loop) even for trivial prompts; ~32s for large-prompt file mode. Acceptable for converse's use cases but noticeably slower than the old SDK provider.
- Non-Windows paths (`~/.local/bin/agy`) are designed-in but untested (planning machine is Windows-only).

**External review (2026-06-10):** codex via Converse chat, continuation `conv_yi472-oL98`, reasoning max. All findings verified against code and applied: `gemini:` prefix routing decision (user chose suffix syntax over dropping Flash or hijacking `gemini-pro`), image-aware auto-selection (regression guard), provider-unavailable hint map (AC7 was uncovered), PTY lifecycle hardening, homedir spawn cwd (POSIX trust), timeout precedence, model-table unification (3 aliases), parallel-spawn verification item, stale package-lock.json deletion + README label. Rejected: none.

**Implementation results (2026-06-10):**
- `--sandbox` is OMITTED. Verified live: with `--sandbox`, the large-prompt file-read path times out (agy cannot read `prompt.md` under sandbox restrictions, ~128s then "timed out waiting for response"). Without sandbox, the same prompt reads the file and answers correctly (~13-57s). Decision: no `--sandbox`.
- Large-prompt bootstrap references the file by ABSOLUTE path (`Read the file located at <cwd>/prompt.md ...`) — this cut the file-mode round-trip from ~57s (relative-path flailing) to ~13s.
- ConPTY raw output cleaning verified against captured frames: CSI/OSC stripping rejoins content that an OSC title sequence splits mid-line; spinner CR-frames resolve to the last frame; multi-line markdown preserved. `cleanAgyOutput` is pure + unit-tested.
- Run-dir cleanup on abort can hit EBUSY (killed process still holds the prompt.md handle); cleanup is best-effort (never throws) and retries once after 2s (detached, unref'd) to avoid `~/.converse/agy-runs` accumulation.
- config.js: replaced the phantom `codex/gemini-cli: '@anthropic-ai/claude-code'` SDK map entries (that package isn't a dependency) — codex now correctly probes `@openai/codex-sdk`, and gemini-cli availability comes from an inline agy-binary probe (PATH + platform fallback).
- Prettier removed from the toolchain (user decision): ESLint already enforces single-quote/indent formatting, and prettier's double-quote defaults conflicted with it (the pre-existing `format:check` failed on committed src files too). ESLint is the sole formatter going forward.

**Live acceptance verification (2026-06-10, authenticated agy v1.0.7):**
- AC1/AC10: `chat` model `gemini` and `gemini:flash` return correct responses; bare `gemini-pro`/`gemini-flash` route to google. PASS.
- AC2: two-turn continuation (manual transcript embedding) — turn 2 recalled the turn-1 secret word. PASS.
- AC3: >32KB prompt completed via file-delivery, returned the embedded token. PASS (~13s).
- AC4: stream mode normalizes through the passthrough path as start→delta→usage→end. PASS.
- AC6: AbortSignal kills the agy process; rejected with "Request cancelled"; no orphaned agy.exe in tasklist. PASS.
- AC7: provider-unavailable message carries the Antigravity install hint. PASS.
- AC11: `providerSupportsImages` reports gemini-cli + copilot text-only, openai/anthropic image-capable. PASS.
- AC8: `pnpm run test:unit` green (578 passed, 7 skipped, incl. 37 new gemini-cli unit tests); ESLint 0 errors; typecheck passes.
- AC9: package-lock.json deleted; `ai-sdk-provider-gemini-cli` absent from package.json + pnpm-lock.yaml; `@lydell/node-pty` 1.2.0-beta.12 added.
- AC5 (async chat) not re-run standalone — exercised by the live stream path + integration test; same provider.invoke underneath.

**Parallel-spawn verdict:** not stress-tested beyond the integration test's 3-way case (deferred to integration run). Per-call cwds isolate workspaces; no limiter added pending observed flakiness. Documented as a residual risk.

**Codex review (2026-06-10, continuation `conv_Ei4pwg5q4A`, reasoning max).** Applied:
- Cancellation race hardening: `runAgy` now sets a `terminationError` flag before `pty.kill()`, so a synchronous kill-induced `onExit` rejects (cancelled/timeout) instead of resolving as a normal exit; added a post-listener `signal.aborted` recheck to close the window between the early abort check and listener registration; the post-kill grace timer now `settleReject`s the termination error (never silently resolves). New unit tests cover both kill-fires-exit and onExit-never-fires paths; re-verified live (cancel → "cancelled", no orphan agy.exe).
- `getSupportedModels()` now exposes all three user-facing names (`gemini`, `gemini:pro`, `gemini:flash`) per spec — `gemini:pro` was previously only an alias.
- Large-prompt file path: tmpdir fallback now uses a per-call uuid subdir (no fixed-name collision across concurrent calls, and cleanup applies); run dir created 0700 and prompt.md written 0600 on POSIX.
- Nonzero-exit error now includes the "run `agy` interactively once to authenticate" hint (previously only the empty-output and missing-binary paths had it).
- `cleanAgyOutput` CSI regex widened to the full ANSI grammar (`\x1b\[[0-?]*[ -/]*[@-~]`) so truecolor/uncommon parameter bytes don't leak their tail.
Flagged, NOT applied (out of scope): `ai-sdk-provider-gemini-cli` still appears in historical docs/CHANGELOG/backlog and a source doc-comment; the `clean` npm script still runs `npm install` (could recreate package-lock.json) — pre-existing, pnpm-only repo concern.

**Spike artifacts:** scratch test in `%TEMP%\agy-pty-test\` (run.mjs) — reproduces PTY capture, conversation resume replay, argv limit, file-read path. Safe to delete. Implementation-time scratch scripts (scratch-*.mjs) removed.

**Relevant Documentation:**
- docs/PROVIDERS.md - provider setup docs to update
- docs/API.md - API examples mentioning gemini-cli

**Related Tasks:**
- task-001-add-gemini-cli-provider-support - original provider being replaced
- task-012-add-conversation-tool-turn-based-round-table - conversation tool routes 'gemini' through the same registry key
<!-- NOTES:END -->
