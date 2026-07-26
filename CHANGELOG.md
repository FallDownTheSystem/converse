# Changelog

All notable changes to the Converse MCP Server project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.2.2](https://github.com/FallDownTheSystem/converse/compare/v3.2.1...v3.2.2) (2026-07-26)


### Dependencies

* **deps:** bump ai from 6.0.208 to 7.0.37 ([#52](https://github.com/FallDownTheSystem/converse/issues/52)) ([d087fae](https://github.com/FallDownTheSystem/converse/commit/d087fae5b9f3a9f81d9aae3118d228640944c792))
* **deps:** bump nanoid from 5.1.16 to 6.0.0 ([#47](https://github.com/FallDownTheSystem/converse/issues/47)) ([5c56843](https://github.com/FallDownTheSystem/converse/commit/5c56843a4f9f930f6a187cad04148ed931d673ad))
* update the remaining npm minor and patch releases ([c6b8f49](https://github.com/FallDownTheSystem/converse/commit/c6b8f4942900ca838ad9d0ec015ca290e5da1c75))

## [3.2.1](https://github.com/FallDownTheSystem/converse/compare/v3.2.0...v3.2.1) (2026-07-26)


### Dependencies

* **deps:** bump actions/checkout from 6 to 7 ([#34](https://github.com/FallDownTheSystem/converse/issues/34)) ([fa3bb62](https://github.com/FallDownTheSystem/converse/commit/fa3bb62c4b4c18f95e761b6ba0ab41c4a0627ca9))
* **deps:** bump actions/setup-node from 6 to 7 ([#50](https://github.com/FallDownTheSystem/converse/issues/50)) ([13611a8](https://github.com/FallDownTheSystem/converse/commit/13611a87c108f044637ce08469c61044cb4063f9))

## [3.2.0](https://github.com/FallDownTheSystem/converse/compare/v3.1.0...v3.2.0) (2026-07-26)


### Features

* **cli:** add -v/--version flag ([83bd98d](https://github.com/FallDownTheSystem/converse/commit/83bd98d35782aae9a06d5b994c263b5ff0135292))

## [3.1.0](https://github.com/FallDownTheSystem/converse/compare/v3.0.2...v3.1.0) (2026-07-25)


### Features

* add Claude Opus 5 across Anthropic, Claude SDK, and Copilot providers ([7211618](https://github.com/FallDownTheSystem/converse/commit/721161854a28b526ebfe9d75d10318f31c017870))


### Bug Fixes

* map Codex reasoning effort onto the model's supported tiers ([73de7c6](https://github.com/FallDownTheSystem/converse/commit/73de7c657fe4b6eae8a61f6d55b4e2c507830ae0))


### Dependencies

* **deps:** bump the npm-minor-and-patch group with 8 updates ([#51](https://github.com/FallDownTheSystem/converse/issues/51)) ([067f7a7](https://github.com/FallDownTheSystem/converse/commit/067f7a7a41e355c6e102aeb55d2c8c520fb85798))


### Documentation

* add task files for 013 (agy provider), 014 (unified chat tool), 015 (model catalogs) ([e25a57c](https://github.com/FallDownTheSystem/converse/commit/e25a57c245ce2524b2942c1a5b47ca4f1a6bd45d))

## [3.0.2](https://github.com/FallDownTheSystem/converse/compare/v3.0.1...v3.0.2) (2026-07-17)


### Bug Fixes

* restore copilot:codex alias and floor Codex reasoning effort at low ([87c04ad](https://github.com/FallDownTheSystem/converse/commit/87c04ad20bad60366e82c1878c60979683508887))


### Dependencies

* **deps:** bump the npm-minor-and-patch group with 11 updates ([#46](https://github.com/FallDownTheSystem/converse/issues/46)) ([54121bb](https://github.com/FallDownTheSystem/converse/commit/54121bb92f081d89163a76766285c418e6c5d50c))

## [3.0.1](https://github.com/FallDownTheSystem/converse/compare/v3.0.0...v3.0.1) (2026-07-11)


### Miscellaneous

* cut 3.0.1 for npm publish ([737d403](https://github.com/FallDownTheSystem/converse/commit/737d403a124127adda07dadeedb159a673014889))

## [3.0.0](https://github.com/FallDownTheSystem/converse/compare/v2.29.2...v3.0.0) (2026-07-11)


### ⚠ BREAKING CHANGES

* The consensus and conversation MCP tools are removed; their functionality is available as chat modes. The temperature, verbosity, use_websearch, enable_cross_feedback, cross_feedback_prompt, turn_prompt, and singular model parameters are removed from the tool schema.

### Features

* merge chat, consensus, and conversation into a unified chat tool with modes ([733ce0f](https://github.com/FallDownTheSystem/converse/commit/733ce0fc3927f7968038d5c823e01ad8436075bd))
* modernize provider model catalogs and capabilities ([23f0e15](https://github.com/FallDownTheSystem/converse/commit/23f0e15b1a883eb51b369653f3f59de6ec29be91))


### Bug Fixes

* correct Mistral catalog to match live API (Large is image-capable, 262144 context) ([0931754](https://github.com/FallDownTheSystem/converse/commit/0931754789f0bf3b72641680df136c4133401bc7))


### Documentation

* describe the unified chat tool and current provider catalogs ([7670d28](https://github.com/FallDownTheSystem/converse/commit/7670d2846f3aa4d32f113729205dda3d808327ef))

## [2.29.2](https://github.com/FallDownTheSystem/converse/compare/v2.29.1...v2.29.2) (2026-07-10)


### Bug Fixes

* require @openai/codex-sdk ^0.144.1 ([ae6ef06](https://github.com/FallDownTheSystem/converse/commit/ae6ef06ef5a7d3bb7fa9c0c0a28ca289665fefdb))

## [2.29.1](https://github.com/FallDownTheSystem/converse/compare/v2.29.0...v2.29.1) (2026-07-10)


### Bug Fixes

* default CODEX_MODEL to gpt-5.6-sol ([fc6c4fa](https://github.com/FallDownTheSystem/converse/commit/fc6c4fa56393b97b349cd41ac3a2fd8f651b1d95))


### Documentation

* **design:** define provider model modernization ([3bdf7e7](https://github.com/FallDownTheSystem/converse/commit/3bdf7e7c2e442578fd562e0932a7b0299f6a5998))

## [2.29.0](https://github.com/FallDownTheSystem/converse/compare/v2.28.1...v2.29.0) (2026-07-09)


### Features

* add GPT-5.6 model family (Sol, Terra, Luna) and make it the default ([c91c9d4](https://github.com/FallDownTheSystem/converse/commit/c91c9d4e4968e244fac2b3b9133f0c315d898c4d))


### Dependencies

* **deps:** bump the npm-minor-and-patch group with 10 updates ([#37](https://github.com/FallDownTheSystem/converse/issues/37)) ([4bc3576](https://github.com/FallDownTheSystem/converse/commit/4bc3576a24fb07ca9cdec2e505cfa0f5b1838c4c))
* **deps:** bump the npm-minor-and-patch group with 6 updates ([#39](https://github.com/FallDownTheSystem/converse/issues/39)) ([069b2f0](https://github.com/FallDownTheSystem/converse/commit/069b2f0e65f52eca0c44352f91fe27cd37d5063a))

## [2.28.1](https://github.com/FallDownTheSystem/converse/compare/v2.28.0...v2.28.1) (2026-06-22)


### Bug Fixes

* **copilot:** resolve CLI runtime path instead of relying on SDK heuristic ([c254dd4](https://github.com/FallDownTheSystem/converse/commit/c254dd4d0a0b8084c537d81df66abc56e6cea0b2))


### Dependencies

* **deps:** bump the npm-minor-and-patch group with 11 updates ([#35](https://github.com/FallDownTheSystem/converse/issues/35)) ([ac9ce43](https://github.com/FallDownTheSystem/converse/commit/ac9ce430725e1739a4d476e01baeaf2c7f1f8673))
* **deps:** bump the npm-minor-and-patch group with 6 updates ([#33](https://github.com/FallDownTheSystem/converse/issues/33)) ([96afe93](https://github.com/FallDownTheSystem/converse/commit/96afe93d24d3f2217b2921ea14a658891dd948f9))

## [2.28.0](https://github.com/FallDownTheSystem/converse/compare/v2.27.2...v2.28.0) (2026-06-10)


### Features

* replace gemini-cli provider with Antigravity CLI (agy) subprocess provider ([a274441](https://github.com/FallDownTheSystem/converse/commit/a274441254d794cd51f1d5f1bf78b21a6310905c))


### Miscellaneous

* finish prettier removal in validate script and docs ([a72ea67](https://github.com/FallDownTheSystem/converse/commit/a72ea67fb9891aac972b38b3ad8ac844d419eb39))

## [2.27.2](https://github.com/FallDownTheSystem/converse/compare/v2.27.1...v2.27.2) (2026-06-10)


### Dependencies

* pin claude-agent-sdk 0.3.169 and codex-sdk 0.138.0 for release-age policy ([ea59a01](https://github.com/FallDownTheSystem/converse/commit/ea59a0195b8cd75629daf668831d2a293a8c2957))

## [2.27.1](https://github.com/FallDownTheSystem/converse/compare/v2.27.0...v2.27.1) (2026-06-10)


### Dependencies

* **deps:** bump @github/copilot-sdk to 1.0.0 and update minor dependencies ([#28](https://github.com/FallDownTheSystem/converse/issues/28)) ([6ca4d71](https://github.com/FallDownTheSystem/converse/commit/6ca4d71a4ebc4a2729d0528a12edee66ecf42acf))

## [2.27.0](https://github.com/FallDownTheSystem/converse/compare/v2.26.1...v2.27.0) (2026-06-10)


### Features

* add Claude Fable 5 to Anthropic and Claude providers ([a677c33](https://github.com/FallDownTheSystem/converse/commit/a677c33e70c1c73cd635cdf299ba60556c517afd))


### Dependencies

* **deps:** bump the npm-minor-and-patch group with 11 updates ([#26](https://github.com/FallDownTheSystem/converse/issues/26)) ([e0e1445](https://github.com/FallDownTheSystem/converse/commit/e0e1445a0b776ec0e8360c6738b3a32e7d016ac6))
* **deps:** bump the npm-minor-and-patch group with 6 updates ([#27](https://github.com/FallDownTheSystem/converse/issues/27)) ([5754541](https://github.com/FallDownTheSystem/converse/commit/5754541e607fab93defe8702d6e17c0767834cf5))

## [2.26.1](https://github.com/FallDownTheSystem/converse/compare/v2.26.0...v2.26.1) (2026-06-01)


### Documentation

* correct release automation notes for Trusted Publishing ([6b41673](https://github.com/FallDownTheSystem/converse/commit/6b41673bc408fd2e3e97c77e6e877aa10f218030))

## [2.26.0](https://github.com/FallDownTheSystem/converse/compare/v2.25.1...v2.26.0) (2026-06-01)


### Features

* add Claude Opus 4.8 to Copilot provider ([daa7c97](https://github.com/FallDownTheSystem/converse/commit/daa7c97f09fd4323c6b63dee08d38d6df032ee8d))

## [2.25.1](https://github.com/FallDownTheSystem/converse/compare/v2.25.0...v2.25.1) (2026-05-31)


### Dependencies

* **deps:** bump @google/genai from 1.51.0 to 2.7.0 ([595da47](https://github.com/FallDownTheSystem/converse/commit/595da47d274f060cb0662b9a67862f38ab2f304f))

## [2.25.0](https://github.com/FallDownTheSystem/converse/compare/v2.24.0...v2.25.0) (2026-05-31)


### Features

* add conversation tool for turn-based multi-model round-table ([0b99879](https://github.com/FallDownTheSystem/converse/commit/0b998797047d1260ef72f8b2a2a89f2a8bdf9238))


### Refactor

* tidy conversation tool after simplify review ([6aa4848](https://github.com/FallDownTheSystem/converse/commit/6aa4848d5a777ade85f437a63af4b7aa8bb6bba2))

## [2.24.0](https://github.com/FallDownTheSystem/converse/compare/v2.23.0...v2.24.0) (2026-05-28)


### Features

* add Claude Opus 4.8 support to claude and anthropic providers ([fa1365c](https://github.com/FallDownTheSystem/converse/commit/fa1365ccdb05e66c7e7fefe16e5426767749cb62))


### Dependencies

* **deps:** bump the npm-minor-and-patch group with 9 updates ([#19](https://github.com/FallDownTheSystem/converse/issues/19)) ([ba29d5d](https://github.com/FallDownTheSystem/converse/commit/ba29d5d6d7a9a56b89cd8a54eafd47404593bc7f))

## [2.23.0](https://github.com/FallDownTheSystem/converse/compare/v2.22.8...v2.23.0) (2026-05-21)


### Features

* add Gemini 3.5 Flash support to google and gemini-cli providers ([0d6b25a](https://github.com/FallDownTheSystem/converse/commit/0d6b25a2f2706caeea9c56262f8ee53aec63a9c1))


### Dependencies

* **deps:** bump the npm-minor-and-patch group with 7 updates ([#14](https://github.com/FallDownTheSystem/converse/issues/14)) ([def4b12](https://github.com/FallDownTheSystem/converse/commit/def4b121ae766982bc2663eacd8603ee04aa9e54))
* **deps:** bump the npm-minor-and-patch group with 9 updates ([#16](https://github.com/FallDownTheSystem/converse/issues/16)) ([6621efc](https://github.com/FallDownTheSystem/converse/commit/6621efcc04d3b7c40c54f43027855edfe3e8c2f0))

## [2.22.8](https://github.com/FallDownTheSystem/converse/compare/v2.22.7...v2.22.8) (2026-05-06)


### Dependencies

* **deps:** bump the npm-minor-and-patch group with 8 updates ([#11](https://github.com/FallDownTheSystem/converse/issues/11)) ([5e0cd5a](https://github.com/FallDownTheSystem/converse/commit/5e0cd5a2f23cd44948ba6b891fab066d29ff9db2))

## [2.22.7](https://github.com/FallDownTheSystem/converse/compare/v2.22.6...v2.22.7) (2026-04-25)


### Documentation

* document release-please automation in CLAUDE.md ([b67a2e2](https://github.com/FallDownTheSystem/converse/commit/b67a2e2897e1e68ae5a6eacadae637c1122e2e9f))

## [2.22.6](https://github.com/FallDownTheSystem/converse/compare/v2.22.5...v2.22.6) (2026-04-25)


### Miscellaneous

* remove bootstrap-sha now that v2.22.5 anchors history ([802f545](https://github.com/FallDownTheSystem/converse/commit/802f5454d5971ce8a18732d2f50251db227d61ba))

## [2.22.5](https://github.com/FallDownTheSystem/converse/compare/v2.22.4...v2.22.5) (2026-04-25)


### Bug Fixes

* **release-please:** correct tag format and bootstrap-sha ([a30b0fb](https://github.com/FallDownTheSystem/converse/commit/a30b0fbc0da61b530293a0e7f78f6e0bd9468208))

## [Unreleased]

## [2.22.4] - 2026-04-24

### Fixed

- **Codex Provider**: Bumped `@openai/codex-sdk` 0.123.0→0.124.0 to match the Codex CLI 0.124.0 release and unblock the new `gpt-5.5` default model (earlier SDK rejected it with "model does not exist").

### Changed

- **Dependencies**: Updated `@anthropic-ai/sdk` 0.90.0→0.91.0 and `@anthropic-ai/claude-agent-sdk` 0.2.118→0.2.119.

## [2.22.3] - 2026-04-23

### Changed

- **Codex Provider**: Default to GPT-5.5 via the new `CODEX_MODEL` env var (default `gpt-5.5`). The model is now passed explicitly to the Codex SDK rather than relying on the CLI's default. Friendly name, description, and aliases updated to reflect GPT-5.5.
- **Dependencies**: Updated `@openai/codex-sdk` 0.118.0→0.123.0, `@anthropic-ai/sdk` 0.86.1→0.90.0, `@anthropic-ai/claude-agent-sdk` 0.2.110→0.2.118, `@mistralai/mistralai` 2.2.0→2.2.1, `ai` 6.0.164→6.0.168, `vite` 8.0.8→8.0.10, `eslint` 10.2.0→10.2.1, `vitest` / `@vitest/coverage-v8` 4.1.4→4.1.5

### Fixed

- **Tests**: Repaired `tests/unit/async/cache-ttl.test.js` after the AsyncJobStore/FileCache API drift — tests now pass explicit `jobId`s and use `writeSnapshot`/`readSnapshot`, and exercise expiry via `cleanup(maxAgeMs)` instead of LRU's `performance.now()`-based TTL (which fake timers don't advance reliably)

## [2.22.2] - 2026-04-23

### Added

- **Codex Provider**: Pass images through to Codex via the SDK's `local_image` input (forwarded to the CLI as `--image`). Enables image-to-image workflows with `$imagegen` and visual context in chat. Requires `@openai/codex-sdk` 0.118+.

### Changed

- **Codex Provider**: Flip `supportsImages` to `true` for the `codex` model and rewrite message conversion to emit structured SDK input (`string | UserInput[]`) when images are attached. Text-only turns continue to send a plain string. Images without an on-disk file path (e.g. raw base64) are skipped with a debug log.

## [2.22.1] - 2026-04-23

### Added

- **Codex Provider**: Auto-elevate sandbox to `workspace-write` when the prompt contains `$imagegen` so Codex can save generated image files. Higher modes explicitly set by the user (`workspace-write`, `danger-full-access`) are left untouched.

## [2.22.0] - 2026-04-16

### Added

- **Anthropic Provider**: Added Claude Opus 4.7 model support — most capable model for complex reasoning and agentic coding with adaptive thinking, 1M context, server-side compaction, and 128K output
- **Copilot Provider**: Added Claude Opus 4.7 model support via Copilot subscription

### Changed

- **Anthropic Provider**: Remapped effort levels to better match Anthropic's xhigh tier — none→low, minimal→low, low→medium, medium→high, high→xhigh, max→max
- **Anthropic Provider**: Fixed `none` effort level sending adaptive thinking without an effort parameter; now correctly maps to `low`
- **Claude SDK Provider**: Updated default model from Opus 4.6 to Opus 4.7
- **Model Aliases**: Unversioned `opus` and `claude-opus` aliases now resolve to Claude Opus 4.7 across all providers
- **Dependencies**: Updated `@github/copilot-sdk` 0.2.1→0.2.2, `@google/genai` 1.49.0→1.50.1, `ai` 6.0.154→6.0.164, `dotenv` 17.4.1→17.4.2, `lru-cache` 11.3.3→11.3.5, `nanoid` 5.1.7→5.1.9, `vitest` 4.1.3→4.1.4

## [2.21.1] - 2026-03-24

### Changed

- **All Providers**: Increased execution timeouts to 10 minutes (600s) across all CLI providers — Claude, Codex, Gemini CLI, and all Copilot models — to prevent premature timeout errors on long-running requests
- **Dependencies**: Updated `@anthropic-ai/claude-agent-sdk` 0.2.77→0.2.81, `@google/genai` 1.45.0→1.46.0, `ai` 6.0.116→6.0.138, `openai` 6.31.0→6.32.0, `vite` 8.0.0→8.0.2, `vitest` 4.1.0→4.1.1, `eslint` 10.0.3→10.1.0

## [2.21.0] - 2026-03-17

### Added

- **OpenAI Provider**: Added GPT-5.4 mini and GPT-5.4 nano model support — fast, efficient models optimized for coding, subagents, and computer use

## [2.20.9] - 2026-03-17

### Fixed

- **Copilot Provider**: Fixed responses being duplicated — the `assistant.message` event (full content) was emitted alongside streaming deltas, doubling output

## [2.20.8] - 2026-03-17

### Fixed

- **Copilot Provider**: Replaced disk-patching of `vscode-jsonrpc` with a `node:module` resolve hook that rewrites the extensionless `vscode-jsonrpc/node` import to include `.js`. Works in all environments (npm, pnpm, global installs) without filesystem writes.

## [2.20.7] - 2026-03-17

### Fixed

- **Copilot Provider**: Fixed `ERR_MODULE_NOT_FOUND` for `vscode-jsonrpc/node` under Node.js strict ESM resolution by adding runtime patch for missing exports field in `vscode-jsonrpc@8.2.1`

## [2.20.6] - 2026-03-17

### Fixed

- **Copilot Provider**: Fixed overly broad auth error detection that caused false positives (e.g. errors containing "OAuth" or "authorization" were incorrectly caught as authentication failures)
- **Copilot Provider**: Fixed error messages referencing non-existent `copilot auth login` command; now correctly references `gh auth login`
- **Copilot Provider**: Auth error now includes original error message for easier debugging

## [2.20.5] - 2026-03-14

### Changed

- **Dependencies**: Updated all dependencies to latest versions
  - `@anthropic-ai/claude-agent-sdk` 0.2.74 → 0.2.76
  - `lru-cache` 11.2.6 → 11.2.7
  - `openai` 6.27.0 → 6.29.0

## [2.20.4] - 2026-03-13

### Changed

- **Dependencies**: Updated all dependencies to latest versions
  - `@anthropic-ai/claude-agent-sdk` 0.2.63 → 0.2.74
  - `@anthropic-ai/sdk` 0.74.0 → 0.78.0
  - `@github/copilot-sdk` 0.1.29 → 0.1.32
  - `@google/genai` 1.43.0 → 1.45.0
  - `@mistralai/mistralai` 1.14.1 → 1.15.1
  - `@openai/codex-sdk` 0.110.0 → 0.114.0
  - `ai` 6.0.108 → 6.0.116
  - `openai` 6.26.0 → 6.27.0
  - `vite` 7.3.1 → 8.0.0
  - `@vitest/coverage-v8` 4.0.18 → 4.1.0
  - `eslint` 10.0.2 → 10.0.3
  - `vitest` 4.0.18 → 4.1.0

## [2.20.3] - 2026-03-07

### Changed

- **File Range Specifier**: Support alternative separator characters in partial file read syntax

## [2.20.2] - 2026-03-05

### Added

- **GPT-5.4 Support**: Added `gpt-5.4` and `gpt-5.4-pro` models to OpenAI provider
  - 1M context window, 128K output (272K for Pro)
  - `gpt-5` alias now resolves to `gpt-5.4`
  - `gpt-5-pro` alias now resolves to `gpt-5.4-pro`
- **Copilot Provider**: Added `gpt-5.4` model entry, `gpt-5` alias updated

### Removed

- **Deprecated OpenAI models**: Removed `gpt-5.2`, `gpt-5-2025-08-07` (GPT-5.0), and `gpt-5.2-pro`

### Changed

- **Dependencies**: Updated to latest versions
  - `@openai/codex-sdk` 0.101.0 → 0.110.0
  - `openai` 6.25.0 → 6.26.0

## [2.20.1] - 2026-03-03

### Changed

- **Dependencies**: Updated to latest versions
  - `@anthropic-ai/claude-agent-sdk` 0.2.50 → 0.2.63
  - `@github/copilot-sdk` 0.1.25 → 0.1.29
  - `@google/genai` 1.42.0 → 1.43.0
  - `@mistralai/mistralai` 1.14.0 → 1.14.1
  - `@modelcontextprotocol/sdk` 1.26.0 → 1.27.1
  - `ai` 6.0.97 → 6.0.108
  - `openai` 6.22.0 → 6.25.0
  - `eslint` 10.0.1 → 10.0.2

## [2.20.0] - 2026-03-03

### Fixed

- **CWD passthrough for globally installed binary**: `process.chdir()` in `bin/converse.js` was overwriting the caller's working directory before `config.js` could capture it, causing relative file paths from MCP clients to resolve against the package root instead of the caller's directory
  - Captures `process.cwd()` before `chdir` and exposes it as `CLIENT_CWD` env var
  - Adds `--cwd <path>` CLI argument for explicit override
  - Normalizes Git Bash paths (`/c/Users/...` → `C:\Users\...`) on Windows so `path.resolve()` works correctly

## [2.19.3] - 2026-02-27

### Fixed

- **Copilot Provider `reasoning_effort` crash**: Models that don't support reasoning effort (Gemini, Claude, GPT-4.1) no longer cause `session.create` to fail when `reasoning_effort` is specified
  - Three-tier capability detection: static flags for known models, SDK `listModels()` query for unknown models, optimistic retry with fallback for unresolvable defaults
  - Added `supportsReasoningEffort: true` to GPT-5+ model definitions as a fast-path cache
  - Case-insensitive error matching for retry resilience against SDK wording changes
- **Wrong timeouts for Copilot models**: `invoke()` was hardcoded to the base `copilot` config (120s timeout) instead of resolving the actual model config (e.g., 300s for codex models, 600s for codex-max)

### Changed

- Extracted `findModelConfig()` as a standalone helper, refactored `getModelConfig()` to delegate to it

## [2.19.2] - 2026-02-24

### Changed

- Updated chat and consensus tool descriptions to include `copilot` and `copilot:codex` model examples
- Simplified `reasoning_effort` description to remove model-specific qualifier

## [2.19.1] - 2026-02-23

### Changed

- Simplified `continuation_id` tool descriptions for chat and consensus tools

## [2.19.0] - 2026-02-22

### Added

- **Custom Continuation IDs**: Callers can now provide their own meaningful continuation IDs (e.g., `"my-project-analysis"`) instead of receiving server-generated `conv_` IDs
  - Unrecognized IDs start a new conversation under that exact ID rather than being silently replaced
  - Response metadata includes `custom_id: true` when the ID doesn't match standard `conv_` format and is a new conversation (not a resume)
  - Async mode validates custom IDs for filesystem safety — only letters, numbers, hyphens, and underscores allowed (max 128 chars)
  - Consistent behavior across chat and consensus tools in sync, async submission, and async completion paths
  - Aligns implementation with existing README documentation of custom ID support

## [2.18.0] - 2026-02-22

### Added

- **Copilot Provider `reasoning_effort` Support**: The `reasoning_effort` parameter is now forwarded to the Copilot SDK's `reasoningEffort` session config instead of being silently ignored
  - Maps tool-level values to Copilot SDK enum: `none`/`minimal` → `low`, `low` → `low`, `medium` → `medium`, `high` → `high`, `max` → `xhigh`
  - Applied at session creation via `client.createSession({ reasoningEffort })` where the SDK reads it

### Fixed

- **Copilot Provider**: Removed incorrect "reasoning_effort not supported" log message — the `@github/copilot-sdk` has supported `reasoningEffort` on `SessionConfig` since v0.1.25
- **Copilot Tests**: Updated stale model assertions referencing removed models (`gemini-2.5-pro`, `gemini-3-flash-preview`, `grok-code-fast-1`, `raptor-mini`, `goldeneye`) to match current `SUPPORTED_MODELS`

## [2.17.0] - 2026-02-21

### Added

- **Copilot Model Selection via `copilot:modelname` Syntax**: Choose specific AI models through Copilot provider using a prefix syntax
  - Use `copilot:gpt-5.2`, `copilot:claude-sonnet-4.6`, `copilot:gemini-2.5-pro`, etc. to select specific models
  - Version shortcut aliases: `copilot:gpt-5` → gpt-5.2, `copilot:codex` → gpt-5.3-codex, `copilot:sonnet` → claude-sonnet-4.6, `copilot:opus` → claude-opus-4.6, `copilot:haiku`, `copilot:gemini`, `copilot:flash`, `copilot:grok`
  - 23 Copilot-available models added: OpenAI (gpt-4.1, gpt-5-mini, gpt-5.1, gpt-5.2, codex variants), Anthropic (claude-haiku-4.5, claude-sonnet-4/4.5/4.6, claude-opus-4.5/4.6/4.6-fast), Google (gemini-2.5-pro, gemini-3-flash/pro-preview, gemini-3.1-pro-preview), xAI (grok-code-fast-1), and fine-tuned models (raptor-mini, goldeneye)
  - `copilot:` prefix takes precedence over keyword routing — `copilot:claude-sonnet-4.6` routes to Copilot, not Anthropic
  - `COPILOT_MODEL` env var supports aliases and prefix stripping (e.g., `COPILOT_MODEL=codex`)
  - Case-insensitive prefix detection and alias resolution
  - Unknown models passed through to SDK for future compatibility
  - Sync metadata now reports resolved SDK model slug instead of raw input

### Changed

- **Dependencies**: Updated to latest versions
  - `@anthropic-ai/claude-agent-sdk` 0.2.49 → 0.2.50
  - `ai` 6.0.94 → 6.0.97

## [2.16.0] - 2026-02-20

### Added

- **MCP Cancellation Support for Sync Tool Calls**: Pressing Escape in Claude Code now aborts in-flight provider API calls instead of silently discarding the response
  - Router accepts MCP SDK's `extra.signal` and forwards it per-request to tools
  - Chat and consensus sync paths pass `signal` through to provider `invoke()` calls
  - OpenAI provider passes `signal` as `RequestOptions` to SDK `.create()` calls (both sync and streaming)
  - Consensus Phase 2 (cross-feedback) skipped entirely if signal is aborted after Phase 1
  - Cancelled calls do not persist conversation state to continuation store
  - Abort errors logged at `debug` level (not `error`) across router, tool, and provider layers
  - `callTool` test utility accepts optional `signal` parameter for test coverage

## [2.15.0] - 2026-02-19

### Added

- **Gemini 3.1 Pro Model Support**: Added `gemini-3.1-pro-preview` to Google provider
  - 1M context window, 64K max output tokens
  - Expanded thinking levels: `minimal`, `low`, `medium`, `high` (up from 3.0's binary `low`/`high`)
  - Thinking level logic updated to pass granular levels when the model supports them
  - Aliases: `gemini-3.1`, `gemini3.1`, `gemini-3.1-pro`, `3.1-pro`, `pro`, `gemini-pro`, `gemini pro`

### Changed

- **Gemini 3.0 Pro Removed**: Replaced entirely by Gemini 3.1 Pro; all 3.0 aliases (`gemini-3`, `gemini3`, `gemini-3-pro`, `gemini-3-pro-preview`, `3-pro`) now resolve to 3.1 Pro
- **Gemini CLI Provider**: Updated SDK model name from `gemini-3-pro-preview` to `gemini-3.1-pro-preview`
- **Dependencies**: Updated to latest versions
  - `@google/genai` 1.41.0 → 1.42.0
  - `@anthropic-ai/claude-agent-sdk` 0.2.44 → 0.2.47
  - `@github/copilot-sdk` 0.1.24 → 0.1.25
  - `ai` 6.0.87 → 6.0.93

## [2.14.0] - 2026-02-17

### Added

- **Claude Sonnet 4.6 Model Support**: Added `claude-sonnet-4-6` to Anthropic provider
  - 64K max output tokens, 200K context (1M beta)
  - Adaptive thinking mode (`thinking: {type: "adaptive"}`) — recommended over legacy budget-based thinking
  - Effort parameter is GA (no beta header required)
  - `sonnet` / `claude-sonnet` aliases now resolve to Sonnet 4.6
- **Server-Side Context Compaction**: Beta support for Opus 4.6 and Sonnet 4.6 via `compact-2026-01-12` header
  - Automatically summarizes older context when approaching context window limits

### Changed

- **Sonnet 4.5 Deprecated**: Marked as legacy; `sonnet` alias moved to Sonnet 4.6
- **Sonnet 4 Removed**: Removed from supported models entirely
- **Dependencies**: Updated all dependencies to latest versions
  - `@anthropic-ai/sdk` 0.73.0 → 0.74.0
  - `@anthropic-ai/claude-agent-sdk` 0.2.32 → 0.2.44
  - `@google/genai` 1.38.0 → 1.41.0
  - `@modelcontextprotocol/sdk` 1.25.3 → 1.26.0
  - `openai` 6.17.0 → 6.22.0
  - `eslint` 9.39.2 → 10.0.0
  - And others (see package.json)

### Fixed

- **OpenAI Tests**: Updated tests for `gpt-5-pro` → `gpt-5.2-pro` model rename

## [2.13.0] - 2026-02-14

### Added

- **GitHub Copilot SDK Provider**: New provider using `@github/copilot-sdk` for CLI-authenticated Copilot access
  - Singleton `CopilotClient` with auto-start/restart; fresh session per request
  - Push-to-pull streaming bridge (SDK events → async generator)
  - Tool permission handler with `COPILOT_TOOL_ACCESS` (read-only | full)
  - Model passthrough via `COPILOT_MODEL` env or explicit model param
  - Aliases: `copilot`, `copilot-sdk`, `github-copilot`
  - Registered in all auto-selection paths (chat sync/async, consensus sync/async) with priority after `claude`, before `openai`
- **ESLint Test Override**: Disabled `prefer-arrow-callback` for test files to prevent `eslint --fix` from breaking mock constructors

### Fixed

- **Async Chat Auto-Selection**: Used `providerOrder` priority array instead of `Object.keys(providers)` for consistent provider selection between sync and async paths
- **Async Consensus Streaming**: SDK providers (copilot, codex, claude, gemini-cli) now stream via `invoke({stream: true})` with async iterator detection, instead of falling through to non-streaming path
- **Stream Normalizer Context**: Pass `provider` name in normalizer context from chat and consensus call sites, fixing `'unknown'` provider in passthrough normalizer
- **Config Usable-Provider Validation**: Check SDK package availability via `import.meta.resolve` instead of always-true array length check
- **Copilot SDK Availability**: `isCopilotSDKAvailable()` now uses `import.meta.resolve` instead of always returning `true`
- **Copilot Config Injection**: Provider reads `COPILOT_TOOL_ACCESS` and `COPILOT_MODEL` from config object instead of `process.env` directly
- **Copilot TOOL_ACCESS Validation**: Invalid values are caught at config load time (matching `CODEX_SANDBOX_MODE` validation pattern)
- **Copilot session.send()**: Awaited SDK's `session.send()` which returns a Promise
- **Copilot assistant.message**: Handle final-content event as delta fallback when deltas are coalesced

### Changed

- **Node.js Requirement**: Minimum version bumped from 20 to 24 (required by `@github/copilot-sdk`)
- **Dependencies**: Added `@github/copilot-sdk` ^0.1.23

## [2.12.0] - 2026-02-07

### Fixed

- **Codex Provider**: `reasoning_effort` parameter was silently ignored — it was passed to `runStreamed()` which only accepts `outputSchema` and `signal`. Now correctly set as `modelReasoningEffort` on `ThreadOptions` (passed to `startThread`/`resumeThread`), where the SDK actually reads it. Values are mapped to the SDK's enum: `none`/`minimal` → `minimal`, `max` → `xhigh`.

## [2.11.0] - 2026-02-05

### Added

- **Claude Opus 4.6 Model Support**: Added `claude-opus-4-6` to Anthropic provider
  - 128K max output tokens (doubled from Opus 4.5's 64K)
  - 1M token context window (beta, via `context-1m-2025-08-07` header)
  - Adaptive thinking mode (`thinking: {type: "adaptive"}`) — recommended over legacy budget-based thinking
  - Effort parameter is now GA (no beta header required), with new `max` effort level
  - `opus` / `claude-opus` aliases now resolve to Opus 4.6
- **GPT-5.3-Codex Aliases**: Added `gpt-5.2-codex` and `gpt-5.3-codex` aliases to Codex provider
- **API Key Validation Utilities**: Added `idValidation.js` for API key format detection

### Changed

- **Claude SDK Provider**: Default model updated from `claude-opus-4-5` to `claude-opus-4-6`
- **Codex Provider**: Updated friendly name to reflect GPT-5.3-Codex availability
- **Gemini CLI Provider**: Improved error handling and configuration
- **Updated dependencies**
  - `@anthropic-ai/sdk` 0.72.0 → 0.73.0
  - `@anthropic-ai/claude-agent-sdk` 0.2.23 → 0.2.32
  - `@openai/codex-sdk` 0.92.0 → 0.98.0

### Removed

- **Test Inventory**: Removed `backlog/test-inventory.md` (served its purpose)

## [2.10.0] - 2026-01-29

### Changed

- **Updated all dependencies to latest versions**
  - `@anthropic-ai/sdk` 0.71.2 → 0.72.0 (structured outputs: `output_format` → `output_config`)
  - `@anthropic-ai/claude-agent-sdk` 0.2.9 → 0.2.23
  - `@openai/codex-sdk` 0.86.0 → 0.92.0 (memory leak fix, dynamic tools injection)
  - `@google/genai` 1.37.0 → 1.38.0
  - `@mistralai/mistralai` 1.11.0 → 1.13.0
  - `openai` 6.16.0 → 6.17.0
  - `ai` 6.0.38 → 6.0.62
  - `@modelcontextprotocol/sdk` 1.25.2 → 1.25.3
  - `cors` 2.8.5 → 2.8.6
  - `lru-cache` 11.2.4 → 11.2.5
  - `vite` 7.3.1 (unchanged)
  - `vitest` 4.0.17 → 4.0.18
  - `@vitest/coverage-v8` 4.0.17 → 4.0.18
  - `prettier` 3.8.0 → 3.8.1

## [2.9.7] - 2025-12-15

### Fixed

- **Codex SDK sandboxMode**: Fixed incorrect property name passed to Codex SDK
  - Was passing `sandbox` but SDK expects `sandboxMode`
  - This caused sandbox restrictions to be silently ignored
  - Now correctly enforces `read-only`, `workspace-write`, or `danger-full-access` modes

## [2.9.6] - 2025-12-15

### Changed

- **GPT-5.2 Pro Model**: Updated GPT-5-pro to GPT-5.2-pro (released Dec 11, 2025)
  - `gpt-5-pro` alias now points to GPT-5.2-pro (latest pro model)
  - Added new alias: `gpt-5.2-pro-2025-12-11`

## [2.9.5] - 2025-12-12

### Changed

- **GPT-5.2 Model Support**: Replaced GPT-5.1 with GPT-5.2 (released Dec 11, 2025)
  - `gpt-5` alias now points to GPT-5.2 (latest flagship)
  - Added new aliases: `gpt-5.2`, `gpt5.2`, `gpt 5.2`, `gpt-5.2-2025-12-11`
  - Removed GPT-5.1 (deprecated, sunset ~March 2026)
  - GPT-5.2 offers 38% fewer errors and 30% fewer hallucinations vs GPT-5.1

### Documentation

- **CLAUDE.md**: Added testing guidance to avoid running full test suite during development

## [2.9.4] - 2025-11-30

### Changed

- **Tool Documentation**: Added reminder to use `files` parameter instead of pasting code
  - Updated chat and consensus tool descriptions to emphasize using files param
  - Updated files parameter descriptions with IMPORTANT note about proper usage
  - Updated help prompt File Context section with guidance

## [2.9.3] - 2025-11-26

### Changed

- **Help Prompt Simplified**: Removed topic argument from help prompt
  - Now always returns full comprehensive guide without requiring arguments
  - Improves UX in MCP clients like Claude Code that prompt for optional arguments

## [2.9.2] - 2025-11-26

### Removed

- **`CODEX_DEFAULT_MODEL` config**: Removed unused configuration option
  - Config was defined but never actually used in the codebase
  - Default behavior now uses Codex CLI's latest model (no model override)
- **`PORT` and `HOST` server configs**: Removed redundant configuration options
  - These duplicated `HTTP_PORT` and `HTTP_HOST` from transport section
  - Only transport configs were actually used; server configs were dead code
- **Deprecated OpenAI models**: `gpt-4o`, `gpt-4o-mini`, `o3-mini`
  - Superseded by GPT-5 family (gpt-5, gpt-5-mini, gpt-5-nano) and o4-mini
- **Deprecated Google models**: `gemini-2.0-flash`, `gemini-2.0-flash-lite`
  - Deprecated by Google with shutdown scheduled for Feb 2026
  - Use Gemini 2.5 (flash, pro) or Gemini 3.0 Pro instead
- **Deprecated Anthropic models**: `claude-3-5-sonnet-20241022`, `claude-3-7-sonnet-20250219`, `claude-3-5-haiku-20241022`
  - Claude 3.5 Sonnet retired in Oct 2025
  - Use Claude 4 series (claude-opus-4-5, claude-sonnet-4-5, claude-haiku-4-5) instead

## [2.9.1] - 2025-11-26

### Changed

- **Schema Descriptions**: Improved `files` parameter descriptions in chat and consensus tools

## [2.9.0] - 2025-11-26

### Added

- **Partial File Line Range Support**: Specify line ranges when including files
  - Syntax: `file.txt{10:50}` extracts lines 10-50 inclusive
  - Start-only: `file.txt{100:}` extracts from line 100 to end of file
  - End-only: `file.txt{:20}` extracts first 20 lines
  - Works with both `files` parameter in chat and consensus tools
  - Context header shows range info: `(lines 10-50 of 200)`
  - New `pathParser.js` utility for range parsing and extraction

### Removed

- **File Size Limits**: Removed unused `maxTextSize` and `maxImageSize` limits
  - These were internal defaults (1MB text, 10MB images) that were never exposed
  - Files of any size can now be processed (limited only by system memory)

## [2.8.5] - 2025-11-24

### Fixed

- **Anthropic Request Payload**: Remove spread of non-API parameters into request
  - Non-API parameters like `continuationStore` were being spread into the API request
  - Fixes "continuationStore: Extra inputs are not permitted" error

## [2.8.4] - 2025-11-24

### Fixed

- **Anthropic Beta Endpoint**: Use `anthropic.beta.messages.create()` for beta features
  - Effort parameter requires the beta endpoint, not the standard messages endpoint
  - Now correctly routes to beta endpoint when beta features (effort, 1M context, etc.) are enabled
  - Fixes "output_config: Extra inputs are not permitted" error with Opus 4.5

## [2.8.2] - 2025-11-24

### Fixed

- **Claude SDK Image Support**: Images now work correctly with the Claude provider
  - Implemented streaming input mode for multimodal content as required by SDK
  - Single message mode (string prompt) doesn't support images per SDK documentation
  - Images are now sent via `AsyncGenerator<SDKUserMessage>` instead of plain string

- **Claude SDK `error_max_turns` Fix**: Resolved error when using `files` parameter
  - Increased `maxTurns` from 1 to 10 to allow file reading operations
  - SDK needs additional turns to read files using internal tools

### Changed

- **Auto Model Selection Priority**: Subscription-based providers now prioritized
  - New order: codex → gemini-cli → claude → openai → google → xai → anthropic → mistral → deepseek → openrouter
  - Chat tool: `model: "auto"` picks first available from priority list
  - Consensus tool: `models: ["auto"]` expands to first 3 available (ideally codex, gemini-cli, claude)

## [2.8.0] - 2025-11-24

### Added

- **Claude SDK Provider**: New `claude` provider for subscription-based access via Claude Agent SDK
  - Uses `@anthropic-ai/claude-agent-sdk` for authentication via `claude login` command
  - No API key required - leverages existing Claude Code CLI authentication
  - Model name: `claude` with aliases `claude-sdk` and `claude-code`
  - Supports both streaming and synchronous execution modes
  - Automatically handles SDK message types (system, assistant, result)
  - Pre-normalized streaming events compatible with ProviderStreamNormalizer

- **Model Routing Enhancement**: Smart routing distinguishes SDK vs API access
  - `claude`, `claude-sdk`, `claude-code` → routes to new claude provider (SDK-based, subscription)
  - `claude-sonnet-*`, `claude-3-*`, `opus`, `haiku`, etc. → routes to anthropic provider (API-based)
  - Enables using Claude Pro/Max subscription alongside API access

## [2.7.0] - 2025-11-24

### Added

- **Claude Opus 4.5 Support**: Added new `claude-opus-4-5-20251101` model
  - 64K max output tokens, 200K context window
  - Full thinking/extended reasoning support (up to 64K thinking tokens)
  - New `supportsEffort` property for Opus 4.5 exclusive effort parameter
  - Aliases: `opus`, `claude-opus`, `opus-4.5`, `opus-4-5`, `opus4.5`, `claude-opus-4.5`, etc.

- **Effort Parameter (Beta)**: New effort parameter support for Opus 4.5
  - Maps `reasoning_effort` to Anthropic's effort parameter (`low`, `medium`, `high`)
  - Automatically adds `effort-2025-11-24` beta header when using Opus 4.5
  - Controls response thoroughness vs token efficiency
  - Mapping: minimal/low → "low", medium → "medium", high/max → "high"

## [2.6.1] - 2025-11-24

### Fixed

- **Consensus Tool Export**: Enhanced consensus export to include actual model responses
  - Consensus conversations now export full response content from each model
  - Added formatted sections for "Initial Responses" and "Refined Responses"
  - Each response is clearly labeled with model name and response type
  - Responses are properly formatted with markdown headers and separators
  - Fixed issue where exports only showed generic summary instead of actual content
  - Preserves both initial and refined responses when cross-feedback is enabled

## [2.6.0] - 2025-11-24

### Added

- **Conversation Export Feature**: New `export` parameter for chat tool enables saving conversations to disk
  - Automatically creates organized folder structure with continuation_id as folder name
  - Saves each request/response pair as numbered text files (1_request.txt, 1_response.txt, etc.)
  - Generates comprehensive metadata.json with conversation settings and parameters
  - Implements incremental export with "write-if-missing" optimization for performance
  - Atomic metadata updates ensure file always reflects current conversation state
  - Sanitizes continuation_id to prevent path traversal security issues
  - Supports both synchronous and asynchronous chat execution modes
  - Graceful error handling ensures export failures don't interrupt conversations
  - Cross-platform support for Windows and Unix file systems
  - Respects CLIENT_CWD for user-friendly file locations

## [2.5.3] - 2025-11-24

### Fixed

- **Gemini CLI Provider**: Fixed AI SDK v5 ModelMessage format validation
  - Changed image format to use `image` property instead of `data`
  - AI SDK validates ModelMessage format before passing to provider
  - Images now use `{ type: 'image', image: base64 }` per AI SDK v5 spec
  - Fixes "messages must be ModelMessage[]" validation error
  - Renamed conversion function to `convertToModelMessages` for clarity

## [2.5.2] - 2025-11-24

### Fixed

- **Gemini CLI Provider**: Fixed message format conversion for images and files
  - Added `convertToGeminiCliMessages()` function to properly convert messages
  - Images now use `{ type: 'image', data: base64 }` format per Gemini CLI SDK guide
  - Fixes "Invalid prompt: messages must be ModelMessage[]" error when using files/images
  - Conversion only affects Gemini CLI provider, other providers remain unchanged

## [2.5.1] - 2025-11-24

### Fixed

- **Gemini CLI Provider**: Fixed streaming event format for async mode compatibility
  - Changed delta events to use `data.textDelta` instead of `content` field
  - Ensures proper integration with ProviderStreamNormalizer
  - Enables real-time progress updates during async execution

### Changed

- **Auto Mode Priority**: Updated model selection priority for `model: "auto"`
  - New priority order: codex > gemini-cli > openai
  - Prioritizes subscription-based and CLI providers over pay-per-use APIs
  - Applies to both chat and consensus tools

- **Model Routing**: Enhanced routing to prevent provider conflicts
  - Added `gemini-cli` as explicit alias for Gemini CLI provider
  - Removed `gemini` from keyword matching to avoid Google API conflicts
  - Positioned gemini-cli before google in provider registry for proper priority

## [2.5.0] - 2025-11-24

### Added

- **Gemini CLI Provider**: OAuth-based access to Gemini models via subscription
  - New `gemini-cli` provider using `ai-sdk-provider-gemini-cli` package
  - OAuth authentication via Gemini CLI (credentials stored in `~/.gemini/oauth_creds.json`)
  - Access Gemini 3.0 Pro Preview through Google subscription (Google One AI Premium or Gemini Advanced)
  - No API key required - uses Google account login instead of pay-per-use API
  - Model name `gemini` now routes to CLI provider (for API access, use specific names like `gemini-2.5-pro`)
  - Full support in both chat and consensus tools
  - Streaming support with ProviderStreamNormalizer integration
  - Setup: `npm install -g @google/gemini-cli && gemini` to authenticate
  - Enhanced agentic features available through CLI that aren't in standard API

### Changed

- **Model Routing**: Updated `gemini` alias behavior
  - `gemini` → routes to Gemini CLI provider (OAuth-based subscription access)
  - For Google API access, use specific model names: `gemini-2.5-pro`, `gemini-2.0-flash`, etc.
  - Aliases `pro`, `flash`, `pro 2.5` remain unchanged for API-based access

### Fixed

- **Consensus Tool**: Fixed model routing for CLI-based providers
  - Codex now correctly routes to `codex` provider instead of `openai` in consensus mode
  - Gemini CLI correctly routes to `gemini-cli` provider in consensus mode
  - Both CLI providers (Codex and Gemini CLI) now work properly in consensus tool
  - Added exact match routing checks in `src/tools/consensus.js` to match `src/tools/chat.js`

### Documentation

- Updated `docs/PROVIDERS.md` with comprehensive Gemini CLI setup guide
- Updated `docs/API.md` with Gemini CLI model information and usage examples
- Added authentication setup instructions and best practices
- Documented differences between Gemini CLI and Google API providers

## [2.4.0] - 2025-11-19

### Added

- **Google Provider**: Added Gemini 3.0 Pro model support
  - `gemini-3-pro-preview`: Google's newest model with enhanced reasoning capabilities
  - 1M context window, 64K max output tokens
  - Level-based thinking mode (low/high) instead of token-based budget
  - New `media_resolution` parameter for controlling image/PDF/video processing quality
  - Values: `MEDIA_RESOLUTION_LOW`, `MEDIA_RESOLUTION_MEDIUM`, `MEDIA_RESOLUTION_HIGH`, `MEDIA_RESOLUTION_UNSPECIFIED`
  - Defaults to `MEDIA_RESOLUTION_HIGH` for Gemini 3.0 models (automatically applied)
  - Supports streaming, web search (grounding), and multimodal inputs
  - Aliases: `gemini-3`, `gemini3`, `gemini-3-pro`, `3-pro`

### Changed

- **Google Provider**: Updated default model aliases to point to Gemini 3.0 Pro
  - `gemini`, `pro`, `gemini-pro`, and `gemini pro` now resolve to `gemini-3-pro-preview` (latest version)
  - Previous Gemini 2.5 Pro now accessible via explicit aliases: `pro 2.5`, `gemini pro 2.5`, `gemini-2.5-pro-latest`
  - `reasoning_effort` parameter mapping for Gemini 3.0:
    - `minimal`, `low` → thinking level: `low`
    - `medium`, `high`, `max` → thinking level: `high`
  - Gemini 2.5 models continue using token-based thinking budget (backward compatible)
- **Chat Tool**: Added optional `media_resolution` parameter for Gemini 3.0 models

## [2.3.1] - 2025-11-17

### Added

- **OpenAI Provider**: Added "none" reasoning effort support for GPT-5.1
  - GPT-5.1 now supports `reasoning_effort: "none"` for faster responses with increased steerability
  - Optimized for use cases requiring quick responses without extended reasoning
  - Only available on GPT-5.1 and later models (not available on GPT-5.0)
- **Chat & Consensus Tools**: Updated `reasoning_effort` parameter to include "none" option
  - New enum values: `none`, `minimal`, `low`, `medium`, `high`, `max`
  - "none" provides fastest responses for GPT-5.1+ models

## [2.3.0] - 2025-11-17

### Added

- **OpenAI Provider**: Added GPT-5.1 model support
  - `gpt-5.1`: Latest flagship model with same capabilities as GPT-5 family
  - `gpt-5.1-2025-11-13`: Fully qualified model name
  - Aliases: `gpt-5`, `gpt5`, `gpt 5`, `gpt5.1`, `gpt 5.1`
  - Same parameters and capabilities: 400K context, 128K output, web search, reasoning effort, verbosity control

### Changed

- **OpenAI Provider**: Updated simple model aliases to point to latest GPT-5 version
  - `gpt-5`, `gpt5`, and `gpt 5` now resolve to GPT-5.1 (latest version)
  - Previous GPT-5 (2025-08-07) now accessible as `gpt-5-2025-08-07` (fully qualified name) or via `gpt-5.0` aliases
  - Aliases for old model: `gpt-5.0`, `gpt5.0`, `gpt 5.0`, `gpt-5-2025-08-07`

## [2.2.0] - 2025-10-15

### Added

- **Anthropic Provider**: Added Claude Haiku 4.5 support
  - `claude-haiku-4-5-20251001`: Fast and intelligent model with extended thinking
  - 200K context window, 64K max output tokens (8x increase from Haiku 3.5)
  - Full thinking support with configurable reasoning effort (1024-64K thinking tokens)
  - Image/vision support and streaming capabilities
  - Aliases: `haiku-4.5`, `haiku-4-5`, `claude-haiku-4.5`, `haiku4.5`, `haiku`, `claude-haiku`

### Changed

- **Anthropic Provider**: Updated simple model aliases to point to latest versions
  - `haiku` and `claude-haiku` now resolve to Haiku 4.5 (previously Haiku 3.5)
  - `sonnet` and `claude-sonnet` now resolve to Sonnet 4.5 (previously Sonnet 4.0)
  - `opus` and `claude-opus` already pointed to Opus 4.1 (no change)
  - Users can now use simple aliases to always get the latest model in each family

### Documentation

- Updated PROVIDERS.md with Claude Haiku 4.5 model specifications
- Updated image support documentation to include Claude 4 series models

## [2.1.0] - 2025-10-07

### Fixed

- **Codex Provider**: Fixed SDK hang issue with cleaner workaround approach
  - Removed pnpm patch dependency (not published with npm packages)
  - Always use `thread.runStreamed()` internally, bypassing buggy `thread.run()`
  - Consume stream synchronously when `stream: false` is requested
  - Explicitly break after `turn.completed` event in our own code
  - Works for all users regardless of package manager (npm, pnpm, yarn)
  - No more 5-minute hangs - responses return in ~10-15 seconds

### Changed

- **Codex Provider**: Removed all debug logging added during investigation
- **Codex Provider**: Simplified code by removing unreachable legacy `thread.run()` path
- **Build**: Removed SDK patch file (workaround makes it unnecessary)

## [2.0.1] - 2025-10-07

### Fixed

- **Codex Provider**: Fixed 5-minute timeout issue when Codex completes without emitting turn.completed event
  - Applied permanent pnpm patch to `@openai/codex-sdk@0.45.0` to fix SDK's `thread.run()` hanging bug
  - Updated stream normalizer to handle natural stream closure when CLI process exits
  - Force streaming mode for all Codex calls (workaround until OpenAI fixes SDK)
  - See `CODEX_SDK_PATCH.md` for detailed patch documentation
- **Codex Provider**: Normalized Windows extended-length paths (`\\?\C:\...` → `C:\...`)
  - Added `normalizeExtendedPath()` utility to strip `\\?\` prefix
  - Codex responses now show clean paths instead of extended-length notation

### Documentation

- Added `CODEX_SDK_PATCH.md` documenting SDK bug and permanent patch solution
- Documented pnpm patch workflow for team sharing and future updates

## [2.0.0] - 2025-10-07

### Added

- **Codex Provider**: OpenAI Codex integration for agentic coding assistance
  - Thread-based conversation sessions with persistent context via `continuation_id`
  - Local file system access with configurable sandbox modes
  - Support for `model: 'codex'` in Chat tool
  - Configuration options:
    - `CODEX_SANDBOX_MODE`: read-only (default), workspace-write, danger-full-access
    - `CODEX_WORKING_DIRECTORY`: Optional working directory (defaults to CLIENT_CWD)
    - `CODEX_SKIP_GIT_CHECK`: Skip Git repository validation (default: true)
    - `CODEX_APPROVAL_POLICY`: Command approval behavior (default: never)
    - `CODEX_DEFAULT_MODEL`: Default Codex model (default: gpt-5-codex)
  - Streaming support with full event handling (item.completed, turn.completed, errors)
  - Requires ChatGPT login or `CODEX_API_KEY` environment variable
  - See `.env.example` for configuration details

### Changed

- **BREAKING: Tool Parameter Order**: Moved `prompt` parameter to last position in both chat and consensus tools
  - Makes it easier to parse tool calls in Claude Code when prompts are very long
  - All other parameters maintain their relative order
  - No functional changes, only schema ordering

### Fixed

- **Codex Provider**: Fixed API key handling to use SDK's native `apiKey` option instead of environment manipulation
- **Codex Provider**: Added comprehensive event handlers for `turn.failed`, `error`, `item.started`, `item.updated` events
- **Codex Provider**: Enhanced debug logging with working directory type detection and execution timing

## [1.18.0] - 2025-10-07

### Added

- **Codex Provider**: OpenAI Codex integration for agentic coding assistance
  - Thread-based conversation sessions with persistent context
  - Local file system access with configurable sandbox modes
  - Support for `model: 'codex'` in Chat tool
  - Configuration options:
    - `CODEX_SANDBOX_MODE`: read-only (default), workspace-write, danger-full-access
    - `CODEX_SKIP_GIT_CHECK`: Skip Git repository validation (default: true)
    - `CODEX_APPROVAL_POLICY`: Command approval behavior (default: never)
    - `CODEX_DEFAULT_MODEL`: Default Codex model (default: gpt-5-codex)
  - Requires ChatGPT login or `CODEX_API_KEY` environment variable
  - See `.env.example` for configuration details

## [1.17.2] - 2025-10-06

### Changed

- **OpenAI Provider**: Removed unused `reasoningEffort` property from GPT-5 Pro model config

## [1.17.1] - 2025-10-06

### Fixed

- **OpenAI Provider**: Fixed GPT-5 Pro reasoning effort handling
  - Automatically enforces `reasoning_effort: 'high'` for GPT-5 Pro (only supported value)
  - Prevents API errors when users specify 'medium' or other unsupported values

## [1.17.0] - 2025-10-06

### Added

- **OpenAI Provider**: Added GPT-5 Pro support
  - `gpt-5-pro`: Most advanced reasoning model (400K context, 272K output)
  - Designed for the hardest problems requiring extended compute time
  - Supports web search, images, and reasoning summaries
  - Responses API only (no streaming support)
  - Defaults to high reasoning effort
  - Aliases: `gpt5-pro`, `gpt-5pro`, `gpt 5 pro`, `gpt-5 pro`, `gpt-5-pro-2025-10-06`

## [1.16.0] - 2025-10-03

### Added

- **Anthropic Provider**: Added Claude Sonnet 4.5 support
  - `claude-sonnet-4-5-20250929`: Latest Sonnet with enhanced intelligence
  - 200K standard context / 1M beta context window support
  - 64K max output tokens with extended thinking capabilities
  - Aliases: `claude-4.5-sonnet`, `sonnet-4.5`, `claude-sonnet-4.5`, `sonnet4.5`

- **Anthropic Provider**: Beta 1M context window support
  - Enabled for Claude Sonnet 4.5 and Claude Sonnet 4 models
  - Automatic `context-1m-2025-08-07` beta header when using supported models
  - Uses modern SDK `betas` parameter API instead of deprecated `defaultHeaders`

### Changed

- **Dependencies**: Updated to latest versions
  - `@anthropic-ai/sdk`: 0.57.0 → 0.65.0 (8 versions)
  - `openai`: 5.11.0 → 6.1.0 (major version upgrade)
  - `@google/genai`: 1.12.0 → 1.22.0 (10 versions)
  - `@mistralai/mistralai`: 1.7.5 → 1.10.0
  - `@modelcontextprotocol/sdk`: 1.17.1 → 1.19.1
  - Various dev dependencies updated (eslint, cross-env, vitest)

- **Anthropic Provider**: Migrated to modern beta features API
  - Now uses `betas` parameter in `messages.create()` calls
  - Removed deprecated `defaultHeaders` approach for beta features
  - Improved compatibility with latest Anthropic SDK

### Fixed

- **Code Quality**: Fixed linting errors
  - Changed `let` to `const` for non-reassigned variables
  - Fixed string quote consistency
  - Removed trailing whitespace

## [1.15.1] - 2025-10-01

### Changed

- **Tool Descriptions**: Shortened chat and consensus tool descriptions for better clarity
  - Removed implementation details (e.g., "handles partial failures gracefully")
  - Focus on tool behavior, use cases, and parameter usage
  - Chat tool: Explicitly mentions `continuation_id` parameter for multi-turn conversations
  - Consensus tool: Reduced from 334 to 225 characters while maintaining essential information
  - Optimized for LLM understanding rather than human marketing

## [1.15.0] - 2025-10-01

### Added

- **Configuration**: New `DISABLE_ASYNC_TOOLS` environment variable to disable async execution features
  - When enabled, removes `check_status` and `cancel_job` tools completely
  - Removes `async` parameter from `chat` and `consensus` tool schemas
  - Help documentation automatically reflects filtered tools based on configuration
  - Useful for deployments that don't need background execution capabilities

- **Google Provider**: Added Gemini 2.5 Flash Lite model
  - `gemini-2.5-flash-lite`: Lightweight fast model with 1M context window
  - Supports images, thinking mode, and web search with grounding
  - Efficient for quick responses with lower resource usage

- **OpenRouter Provider**: Added Z.AI GLM 4.6 model
  - `z-ai/glm-4.6`: 200K context window model with improved coding and reasoning
  - Better performance in agentic tasks and tool usage
  - Enhanced writing quality and role-playing capabilities

### Changed

- **Google Provider**: Updated Gemini Flash model references
  - `gemini-2.5-flash` now uses `gemini-flash-latest` endpoint
  - Added aliases for `gemini-2.5-flash-preview-09-2025` and `gemini-2.5-flash-latest`
  - Ensures automatic access to latest Flash model improvements

### Fixed

- **Consensus Tool**: Fixed display showing incorrect model counts (e.g., "3/1" instead of "3/3")
  - Now correctly shows successful models vs total models in completion status
  - Applies to both synchronous and asynchronous consensus executions
  - Uses `providerCalls.length` instead of `models.length` for accurate counting

## [1.14.4] - 2025-09-21

### Added

- **XAI Provider**: Added support for new Grok 4 Fast models
  - `grok-4-fast-reasoning`: Cost-efficient reasoning model with 2M token context window
  - `grok-4-fast-non-reasoning`: Fast non-reasoning variant for quick responses
  - Both models support function calling, structured outputs, and web search
  - Pricing: $0.20 input / $0.50 output per 1M tokens

### Changed

- **Mistral Provider**: Updated all models to latest versions
  - `magistral-medium-2509` (v1.2): Now includes vision support and 128K context window
  - `magistral-small-2509` (v1.2): Now includes vision support and 128K context window
  - `mistral-medium-2508` (v3.1): Improved tone and performance with 128K context window
  - All models now support image inputs after the September 2025 update

## [1.14.3] - 2025-09-12

### Changed

- **XAI Provider**: Removed discontinued `grok-3` and `grok-3-fast` models
  - These models are no longer available from X.AI
  - Added `grok-4` as an alias for `grok-4-0709` for cleaner model names
  - Updated all documentation and examples to use `grok-4` instead of `grok-4-0709`
  - `grok-code-fast-1` remains available for fast, economical coding tasks

### Fixed

- Updated consensus tool examples to use simplified `grok-4` model name instead of versioned `grok-4-0709`
- Cleaned up test files to remove references to discontinued models

## [1.14.2] - 2025-09-10

### Changed

- **OpenAI Provider**: Increased timeouts for GPT-5 and O3 models to handle longer processing times
  - `gpt-5`: 5 minutes → 1 hour
  - `gpt-5-mini`: 3 minutes → 30 minutes
  - `gpt-5-nano`: 2 minutes → 10 minutes
  - `o3`: 5 minutes → 10 minutes
  - `o3-pro`: 30 minutes → 60 minutes
  - `o3-deep-research-2025-06-26`: 90 minutes → 120 minutes

## [1.14.1] - 2025-09-02

### Added

- **XAI Model Support**: Added support for `grok-code-fast-1` model
  - 256K context window, optimized for agentic coding tasks
  - Economical pricing ($0.20 input / $1.50 output per 1M tokens)
  - Full streaming support and OpenAI-compatible features
  - Includes aliases: `grok-code-fast`, `grok-code-fast-1-0825`

## [1.14.0] - 2025-08-26

### Added

- **AI-Powered Summarization**: Intelligent title generation and content summarization for async operations
  - Automatic title generation (up to 60 chars) from user prompts at request initiation
  - Status check returns an up-to-date summary of the progress based on the partially streamed response
  - Final summaries (1-2 sentences) generated for completed responses
  - Smart summaries in check_status tool for better context understanding
  - Configurable via `ENABLE_RESPONSE_SUMMARIZATION` and `SUMMARIZATION_MODEL` (default: gpt-5-nano) environment variables

- **Enhanced Async Job Storage**: Improved job state tracking with new fields
  - `accumulated_content`: Full streaming content instead of limited preview
  - `title`: AI-generated descriptive title for each job
  - `final_summary`: Concise summary of completed job results
  - Removed `streaming_preview` field (now generated on-demand from accumulated content)

- **SummarizationService**: New centralized service for all summarization operations
  - Uses fast models (gpt-5-nano, gemini-2.5-flash) for minimal latency
  - Graceful fallback to text snippets when disabled or on errors
  - Non-blocking implementation ensures main flow continues even if summarization fails
  - Temperature set to 0.3 for consistent, focused summaries

- **FileCache Integration**: Persistent storage for async job results
  - Wire up FileCache to persist job state across server restarts
  - Comprehensive integration tests for cache recovery and TTL management
  - Improved memory management with proper cleanup

### Changed

- **Check Status Tool**: Enhanced display with AI-generated summaries
  - Running jobs show AI-generated summaries based on accumulated content when checked
  - Job listings include titles for quick identification
  - Completed jobs display final summaries in listings
  - Async formatting functions for on-demand summary generation

- **Chat Tool Integration**: Title and summary generation during streaming
  - Generates title from user prompt at request start
  - Accumulates full content during streaming (replacing 200-char preview)
  - Creates final summary for responses over 100 characters

- **Consensus Tool Integration**: Multi-provider summary aggregation
  - Combined content accumulation from all providers
  - Handles both single-phase and two-phase (cross-feedback) flows
  - Provider-specific previews maintained alongside combined summaries

### Technical

- New `formatStatus.js` utility for async status formatting
- Configuration schema extended with summarization settings
- Updated AsyncJobStore to accept arbitrary job fields
- Comprehensive test coverage for summarization features
- Fixed integration tests for async workflow scenarios

## [1.13.0] - 2025-01-20

### Added

- **Async Execution Support**: Run chat and consensus tools in background mode
  - Use `async: true` parameter for non-blocking execution
  - Monitor progress with check_status tool
  - Cancel running jobs with cancel_job tool
  - Persistent conversation state across async operations

- **Job Management System**: Complete async job lifecycle management
  - AsyncJobStore with LRU cache for memory management
  - EventBus for real-time progress updates
  - JobRunner for concurrent task execution
  - Automatic cleanup of completed jobs

- **Progress Tracking**: Real-time status updates for async operations
  - Streaming progress for individual providers
  - Combined progress for consensus operations
  - Detailed error reporting and recovery

## [1.12.0] - 2025-01-19

### Added

- **Execution Time Display**: Added smart execution time formatting to tool responses
  - Shows time in seconds with appropriate precision (0.05s, 1.2s, 15.3s, 1m6s)
  - Displays in metadata header for both chat and consensus tools
  - Time measurement accounts for actual LLM response durations

- **Enhanced Metadata Display**: New comprehensive metadata shown at start of responses
  - **Chat**: `[⏱️ 2.3s | 🤖 openai | 📱 gpt-5 | 🔗 conv_abc123]`
  - **Consensus**: `[⏱️ 8.7s | ✅ 2/3 models | 🔗 conv_xyz789]`
  - Environment-aware (automatically disabled in test environments)

- **Detailed Failure Reporting**: Specific model failure information for consensus tool
  - Shows which models failed and in which phase (initial vs refinement)
  - Example: "• gemini-2.5-pro (refinement failed)" and "• grok-4 (initial failed)"
  - Helps users understand exactly what went wrong during consensus gathering

### Changed

- **BREAKING: Shorter Continuation IDs**: Switched from UUID to nanoid format
  - **Before**: `conv_f47ac10b-58cc-4372-a567-0e02b2c3d479` (41 characters)
  - **After**: `conv_nTC5QoA-ml` (15 characters) - **63% shorter**
  - Uses cryptographically secure nanoid with URL-safe alphabet
  - **Backward Compatible**: Old UUID format still accepted and validated
  - Zero collision risk tested with 100,000+ generated IDs

- **Improved Consensus Success Counting**: More accurate model success tracking
  - When cross-feedback enabled: counts only models succeeding in both phases
  - When cross-feedback disabled: counts initial phase successes
  - Properly accounts for refinement phase failures

### Technical

- Migrated from Node.js `crypto.randomUUID()` to `nanoid` for ID generation
- Enhanced validation regex to accept both UUID and nanoid formats
- Updated all test patterns to match new continuation ID format
- Added comprehensive failure detail collection and formatting

## [1.11.2] - 2025-01-19

### Fixed

- **Relative Path Support**: Fixed relative path handling in chat and consensus tools
  - File validation now uses the same working directory as context processing
  - Relative paths like `"./file.txt"` and `"file.txt"` now work correctly
  - Both tools now consistently use auto-detected client working directory for path resolution
  - Fixed issue where file validation would fail but context processing would succeed with relative paths

## [1.11.1] - 2025-01-19

### Fixed

- **File Extension Support**: Removed arbitrary file type restrictions
  - All file types now supported for text processing (previously limited to specific extensions)
  - Fixed .cshtml, .razor, .php, .jsp and other web development files being blocked
  - Only images (.jpg, .png, etc.) are treated specially (base64 encoded)
  - Removed unused `getSupportedExtensions()` and `isFileTypeSupported()` functions

## [1.11.0] - 2025-01-15

### Added

- **Automatic Client Working Directory Detection**: The server now automatically detects where it was invoked from
  - Uses `INIT_CWD`, `PWD`, or `npm_config_local_prefix` environment variables
  - Enables proper relative path resolution from the client's directory
  - Works seamlessly with npx and npm execution

### Changed

- **File Access Security**: Made file path security restrictions optional (disabled by default)
  - Removed mandatory directory restrictions that prevented access to files outside the server directory
  - Security checks can be re-enabled with `enforceSecurityCheck: true` option
  - Files can now be accessed from any location on the system
- **Relative Path Resolution**: Fixed to resolve from client's working directory instead of server's directory
  - Relative paths like `./file.txt` now work correctly from where the command was invoked
  - Both absolute and relative paths are fully supported

### Fixed

- Fixed file access issues where both absolute and relative paths were incorrectly rejected
- Fixed "File access denied" errors when trying to access files outside the Converse directory

### Changed (Previous)

- **BREAKING CHANGE: Consensus Tool Models Parameter**: Simplified model specification from object array to string array
  - Old format: `[{"model": "gpt-5"}, {"model": "gemini-2.5-pro"}]`
  - New format: `["gpt-5", "gemini-2.5-pro"]`
  - Affects all consensus tool calls in client code
  - Input schema updated to accept `items: { type: "string" }` instead of object structure
  - All tests, documentation, and examples updated to reflect new format

### Migration Guide

- Update all consensus tool calls to use string arrays:

  ```javascript
  // Before
  models: [{ model: "gpt-5" }, { model: "gemini-2.5-pro" }];

  // After
  models: ["gpt-5", "gemini-2.5-pro"];
  ```

## [1.10.1] - 2025-08-09

### Changed

- **Consensus Tool Auto Model Selection**: Enhanced `"auto"` model behavior for consensus tool
  - Now expands to first 3 available providers instead of just one
  - Provider priority order: OpenAI → Google → XAI → Anthropic → Mistral → DeepSeek → OpenRouter
  - Automatically selects providers based on configured API keys
  - Enables multi-model consensus without manual model specification
- **Default Model Updates**: Changed OpenAI default model from `o3` to `gpt-5` for both chat and consensus tools
- **Documentation**: Updated README with comprehensive auto model selection behavior for both tools

### Technical Details

- Consensus tool with `["auto"]` intelligently expands to multiple providers
- Chat tool continues to use single provider selection for efficiency
- Each provider uses its optimal default model when selected via auto

## [1.10.0] - 2025-08-08

### Added

- **Google Provider**: Added comprehensive Google API configuration options
  - **GEMINI_API_KEY support**: Primary API key for Google Gemini models (recommended)
  - **GOOGLE_API_KEY fallback**: Still supported, but GEMINI_API_KEY takes priority
  - **Google Vertex AI support**: Full enterprise-grade Vertex AI integration
    - `GOOGLE_GENAI_USE_VERTEXAI`: Enable Vertex AI mode
    - `GOOGLE_CLOUD_PROJECT`: Google Cloud project ID
    - `GOOGLE_CLOUD_LOCATION`: Deployment region (e.g., us-central1)
    - `GOOGLE_API_VERSION`: API version selection (v1, v1beta, v1alpha)
  - Automatic detection of configuration mode (API Key vs Vertex AI)
  - Support for both Gemini Developer API and Vertex AI API endpoints

### Changed

- **Environment Configuration**: Updated .env files to use GEMINI_API_KEY for clarity
- **Documentation**: Enhanced README with Google/Gemini API options and Vertex AI setup

### Technical Details

- Google provider now supports three initialization modes:
  1. Gemini Developer API with GEMINI_API_KEY (simplest)
  2. Gemini Developer API with GOOGLE_API_KEY (backward compatible)
  3. Google Vertex AI with project/location configuration (enterprise)
- API version can be configured for both Gemini and Vertex AI modes
- Improved validation to handle both API key and Vertex AI configurations

## [1.9.0] - 2025-08-07

### Added

- **OpenAI Provider**: Added support for GPT-5 family models, OpenAI's latest flagship series
  - **GPT-5**: Latest flagship model with 400K context window, 128K max output tokens
    - Superior reasoning, code generation, and analysis capabilities
    - Full support for streaming, function calling, structured outputs, web search, and MCP
    - Aliases: `gpt5`, `gpt 5`, `gpt-5-2025-08-07`
  - **GPT-5-mini**: Faster, cost-efficient version for well-defined tasks
    - Same 400K context and 128K output as GPT-5
    - Optimized for speed and cost ($0.25 input, $2 output per 1M tokens)
    - Aliases: `gpt5-mini`, `gpt-5mini`, `gpt 5 mini`, `gpt-5-mini-2025-08-07`
  - **GPT-5-nano**: Fastest, most cost-efficient version
    - Same 400K context and 128K output capabilities
    - Best for summarization and classification ($0.05 input, $0.40 output per 1M tokens)
    - No web search support
    - Aliases: `gpt5-nano`, `gpt-5nano`, `gpt 5 nano`, `gpt-5-nano-2025-08-07`
  - All GPT-5 models don't support temperature parameter
  - Updated model recommendations to prefer GPT-5 family over O3 for various use cases
- **New API Features for GPT-5**:
  - **Minimal reasoning effort**: New `minimal` option for fastest responses with few reasoning tokens
  - **Verbosity control**: New `verbosity` parameter (low/medium/high) to control output length
    - Low: Concise answers, minimal code commentary
    - Medium: Balanced responses (default)
    - High: Thorough explanations and detailed code
  - Both features supported across entire GPT-5 family (GPT-5, GPT-5-mini, GPT-5-nano)
  - Enhanced chat tool to support these new parameters with proper defaults

## [1.8.3] - 2025-08-07

### Changed

- **Anthropic Provider**: Updated Claude Opus 4 to the new Opus 4.1 model
  - Model ID changed from `claude-opus-4-20250514` to `claude-opus-4-1-20250805`
  - Added new aliases: `claude-opus-4-1`, `opus-4.1`, `opus4.1`, `claude-opus-4.1`
  - Maintains all existing aliases for backward compatibility
  - Same capabilities: 200K context, 32K output tokens, extended thinking, image support

## [1.8.0] - 2025-08-04

### Added

- **OpenAI Deep Research Models**: Added support for OpenAI's deep research models
  - Added `o3-deep-research-2025-06-26` model with 90-minute timeout for comprehensive research
  - Added `o4-mini-deep-research-2025-06-26` model with 60-minute timeout for faster research
  - Both models support web search via `web_search_preview` tool
  - Models can run 30-90 minutes for in-depth analysis and multi-source synthesis
  - Requires setting `MCP_TOOL_TIMEOUT` environment variable (e.g., `5400000` for 90 minutes)

### Changed

- **Web Search Implementation**: Simplified web search to use only `web_search_preview` tool type
  - Removed unused `web_search` tool type references
  - All OpenAI models now consistently use `web_search_preview` when web search is enabled
  - Removed support for always-search models (`gpt-4o-search-preview`, `gpt-4o-mini-search-preview`)

### Technical Details

- Deep research models work with existing chat tool - no separate research tool needed
- Models are integrated into the standard OpenAI provider implementation
- Supports all standard features: streaming, images, context, continuation
- Progress notifications and cancellation infrastructure ready for future Claude Code UI support

## [1.7.3] - 2025-08-02

### Fixed

- **Test Suite**: Fixed numerous test failures across the codebase
  - Fixed syntax errors in fixture files (duplicate `__dirname` declarations, invalid JSON)
  - Fixed JSON parsing errors in edge-cases.json (sparse arrays, JavaScript expressions, hex escape sequences)
  - Fixed performance test reliability by using consistent model selection
  - Fixed consensus tool cross-feedback by ensuring proper message alternation for Anthropic API
  - Fixed image validation to handle base64 data URLs properly
  - Fixed mock provider implementations to properly track method calls
- **Image Processing**: Enhanced image quality settings
  - Updated OpenAI provider to use `detail: 'high'` for better image analysis
  - Updated XAI provider to use `detail: 'high'` for better image analysis
- **Path Utilities**: Removed shebang line from pathUtils.js module

### Added

- **Test Images**: Added test images (fruits.png, tulips.png, baboon.png) for image processing tests
- **Dependencies**: Added vite as a dependency (was missing)

### Improved

- **Test Coverage**: Enhanced test reliability and coverage
  - Updated image tests to use real images instead of invalid base64 strings
  - Added proper base64 encoding helper for XAI image tests
  - Fixed mock provider tests to properly handle call tracking
  - Improved error message matching in provider tests

## [1.7.2] - 2025-01-27

### Added

- **Cross-Platform Support**: Comprehensive cross-platform compatibility improvements
  - Created `src/utils/pathUtils.js` utility module for platform-agnostic operations
  - Added `cross-env` and `rimraf` dependencies for cross-platform npm scripts
  - Platform-specific path handling for Windows, Linux, and macOS
  - Cross-platform timeout commands and process spawning

### Changed

- **npm Scripts**: Updated all scripts to use cross-platform commands
  - Replaced Unix-specific `rm -rf` with `rimraf` package
  - All environment variable assignments now use `cross-env`
  - Scripts now work correctly on Windows, Linux, and macOS
- **Path Handling**: Improved path operations throughout codebase
  - Fixed path comparisons to use proper URL methods instead of string replacement
  - Line counting now handles both CRLF (Windows) and LF (Unix/Mac) line endings
  - Test files use platform-agnostic path helpers instead of hardcoded paths
- **Process Spawning**: Updated to use Node.js executable path
  - Tests now use `process.execPath` instead of hardcoded 'node' command
  - Proper spawn options for Windows compatibility

### Fixed

- **Windows Compatibility**: Fixed multiple Windows-specific issues
  - Path separator handling in file operations
  - Process spawning in test files
  - Timeout commands in validation script
- **Test Reliability**: Fixed hardcoded paths in tests
  - Replaced Windows-specific paths (C:\) with platform helpers
  - Replaced Unix-specific paths (/tmp) with OS temp directory
- **JSON Import**: Fixed ES module JSON import syntax for better compatibility
  - Tests now use `readFileSync` and `JSON.parse` instead of import assertions

### Improved

- **Code Quality**: Enhanced linting and code standards
  - Changed `no-unused-vars` to warning level for better DX
  - Added missing global variables to ESLint config
  - Fixed numerous linting issues across the codebase

## [1.7.1] - 2025-07-28

### Changed

- **Test Organization**: Reorganized integration tests into provider-specific structure
  - Provider tests now in `tests/integration/providers/{provider}/` directories
  - Each provider has separate API, features, and image test files
  - Removed archived test files that were replaced
- **Test Commands**: Updated test command naming for consistency
  - `npm run test:e2e` now preferred over `test:real-api` (both still work)
  - Added provider subcategory commands for granular testing
- **Documentation**: Updated all test documentation to reflect new structure
  - Updated `tests/README.md` with new test organization
  - Updated main `README.md` with current test commands
  - Added `tests/integration/providers/README.md` for provider test guidance

### Added

- **Provider Image Tests**: Added dedicated image processing tests
  - `xai/xai-image.test.js` - XAI Grok-4 image processing
  - `google/google-image.test.js` - Google Gemini image processing
- **Error Handling Tests**: Added comprehensive error handling tests
  - `anthropic/anthropic-error.test.js` - Rate limiting and edge cases
  - `multi-provider-error.test.js` - Cross-provider error handling
- **Advanced Tests**: Added advanced multi-provider scenarios
  - `multi-provider-advanced.test.js` - Consensus with files, consistency tests
  - `debug-tests.test.js` - Message format debugging

### Fixed

- **Test Configuration**: Updated `suites.config.js` to use new test paths
  - Fixed real-api suite to use glob patterns for new structure
  - Properly excludes archived directory from test runs

## [1.7.0] - 2025-07-28

### Changed

- **Configuration**: Server name and version are now automatically read from package.json
  - Removed `MCP_SERVER_NAME` and `MCP_SERVER_VERSION` environment variables
  - Ensures version consistency across all parts of the application
- **OpenRouter Provider**: Requires `OPENROUTER_DYNAMIC_MODELS=true` to use models in `provider/model` format
  - Previously allowed dynamic models without explicit configuration
  - Now properly enforces the environment variable requirement
- **Tool Descriptions**: Updated parameter descriptions for better clarity
  - Model examples now show `o3`, `gemini-2.5-pro`, `grok-4-0709`
  - File and image paths show both absolute (Windows) and relative path examples
  - Reasoning effort examples updated to `low`, `medium`, `high`
  - Simplified use_websearch description
- **Help System**: Help prompt now dynamically generates tool documentation from metadata
  - Ensures consistency between implementation and documentation
  - No more manual updates needed when tool parameters change

### Added

- **Environment Variables Documentation**: Added all missing environment variables to help prompt
  - All API keys (ANTHROPIC, MISTRAL, DEEPSEEK, OPENROUTER)
  - OpenRouter configuration options
  - HTTP server configuration options

### Removed

- **Unused Build Script**: Removed unused `build.js` script and related npm scripts
  - Project doesn't require build step as it's pure Node.js
  - Removed `build` and `build:fast` npm scripts
- **Obsolete Environment Variables**: Cleaned up documentation
  - Removed references to `GOOGLE_LOCATION` (already unused)
  - Removed references to `XAI_BASE_URL` (not configurable via env)

### Fixed

- **OpenRouter Dynamic Models**: Fixed behavior to require explicit enablement
  - Models with "/" format now properly require `OPENROUTER_DYNAMIC_MODELS=true`
  - Returns clear error message when dynamic models are disabled

## [1.6.0] - 2025-07-27

### Added

- **OpenRouter Provider**: Dynamic model discovery support
  - Enable with `OPENROUTER_DYNAMIC_MODELS=true` environment variable
  - Automatically fetches model capabilities from OpenRouter's endpoints API
  - Supports any model available on OpenRouter without manual configuration
  - Model capabilities are cached for 24 hours to improve performance
  - Added support for `openrouter/auto` model for automatic model selection
- **Model Routing**: Enhanced model routing logic
  - Models with "/" format check native providers first before routing to OpenRouter
  - Allows using models like `anthropic/claude-3.5-sonnet` via OpenRouter when not available natively
  - Maintains backward compatibility with keyword-based routing

### Changed

- **OpenRouter Provider**: Added static configurations for Qwen3 and Kimi models
  - `qwen/qwen3-235b-a22b-thinking-2507` - 235B model with thinking capabilities
  - `qwen/qwen3-coder` - Specialized for coding tasks
  - `moonshotai/kimi-k2` - 200K context window

## [1.5.5] - 2025-07-26

### Fixed

- **Anthropic Provider**: Increased SDK timeout to 20 minutes for thinking models
  - Prevents "Streaming is strongly recommended" errors for long-running requests
  - Claude 4 series models now work properly with thinking mode enabled
- **Tests**: Updated test expectations for max_tokens being required by API

## [1.5.4] - 2025-07-26

### Fixed

- **Anthropic Provider**: Removed non-existent 'thinking-2025-01-27' beta header
  - Thinking mode is controlled through model selection, not beta headers

## [1.5.3] - 2025-07-26

### Fixed

- **Google Provider**: Fixed gemini-2.0-flash configuration - model does not support thinking mode
- **Anthropic Provider**: Fixed Claude 4 series models token handling
  - No longer set max_tokens for opus-4 and sonnet-4 models, letting SDK use defaults (32k/64k)
  - Prevents "context length exceeded" errors that were actually SDK warnings about streaming
- **Tests**: Updated test expectations to match new error message formats

## [1.5.1] - 2025-07-26

### Fixed

- **Mistral Provider**: Fixed image handling by correcting the image URL field name from `image_url` to `imageUrl` to match Mistral API expectations
  - Models supporting images (mistral-medium-3) now properly process image content
  - Resolved validation errors when sending images to Mistral API

## [1.4.0] - 2025-07-26

### Changed

- **BREAKING**: **Transport Default**: Changed default transport from HTTP to stdio for standard MCP compliance
  - Stdio transport is now the default (launched automatically by Claude)
  - HTTP transport available via `--transport=http` or `MCP_TRANSPORT=http` for development/debugging
  - Updated CLI help and documentation to reflect new defaults
  - No functionality lost - all transport methods still available

### Fixed

- **Test Stability**: Fixed timeout issue in file context processing test
- **Test Environment**: Added explicit `MCP_TRANSPORT=http` to test environment to maintain HTTP testing

### Documentation

- Updated README.md to show stdio as default transport
- Updated help text and examples to reflect new transport defaults
- Clarified when to use HTTP transport (development/debugging scenarios)

## [1.3.4] - 2025-07-26

### Added

- **Anthropic Prompt Caching**: Implemented automatic prompt caching with 1-hour TTL for system prompts
  - Reduces latency and API costs for repeated requests
  - Minimum 1024 tokens required (2048 for Haiku models)
  - Cache metrics available in response metadata
- **Provider Documentation**: Added comprehensive documentation for all new providers (Anthropic, DeepSeek, Mistral, OpenRouter)

### Fixed

- **Anthropic Provider**: Fixed thinking budget calculation to properly account for token limits
- **Anthropic Provider**: Force temperature to 1 when thinking is enabled (API requirement)
- **Anthropic Provider**: Fixed context length issues with Claude Sonnet 4

### Improved

- **Test Coverage**: Added comprehensive integration tests for all new providers
- **Error Handling**: Better error messages for model availability and context limits

## [1.3.3] - 2025-07-26

### Fixed

- **Anthropic Provider**: Fixed context length calculation for thinking models
- **Mistral Provider**: Fixed SDK import order to resolve constructor errors

## [1.3.2] - 2025-07-26

### Fixed

- **OpenRouter Provider**: Fixed HTTP-Referer header configuration issue by correcting config key casing
- **Missing Dependencies**: Added `@anthropic-ai/sdk` and `@mistralai/mistralai` as dependencies to fix provider initialization errors

## [1.3.1] - 2025-07-26

### Improved

- **Help System**: Updated help documentation and resources to display models from all 7 providers (previously only showed 3)
- **Auto Model Selection**: Enhanced "auto" model selector to support all providers with intelligent defaults:
  - OpenAI: `o3` (powerful reasoning model)
  - Google: `gemini-2.5-pro` (advanced capabilities)
  - Anthropic: `claude-sonnet-4-20250514` (Sonnet 4)
  - Mistral: `magistral-medium-2506` (frontier-class model)
  - DeepSeek: `deepseek-reasoner` (reasoning model)
  - XAI: `grok-4-0709` (unchanged)
  - OpenRouter: `qwen/qwen3-coder` (unchanged)
- **Model Aliases**: Added comprehensive aliases for all models across all providers for easier access
- **Provider Detection**: Updated `mapModelToProvider` function to recognize models from all 7 providers

### Fixed

- **Help Command**: Fixed issue where help command only displayed models from original 3 providers
- **Model Resolution**: Fixed model name resolution to work with all provider models and their aliases

## [1.3.0] - 2025-07-26

### Added

- **New Providers**: Added support for 5 new AI providers, expanding model options:
  - **Anthropic**: Support for Claude models including Opus 4, Sonnet 3.5, and Haiku 3.5
  - **Mistral AI**: Support for Magistral Medium, Magistral Small, and Mistral Medium 3
  - **DeepSeek**: Support for DeepSeek Chat (V3) and DeepSeek Reasoner (R1) models
  - **OpenRouter**: Gateway to access Qwen3 235B Thinking, Qwen3 Coder, and Kimi K2 models
  - **OpenAI-Compatible Base Module**: Reusable factory for creating providers with OpenAI-compatible APIs

### Features

- **Unified Provider Interface**: All providers implement consistent interface with error handling
- **Advanced Model Capabilities**:
  - Thinking/reasoning models with configurable effort levels (Anthropic, OpenRouter)
  - Multimodal support for images (Anthropic, Mistral Medium 3)
  - Extended context windows (up to 200K tokens for Claude, 200K for Kimi K2)
- **Enhanced Error Handling**: Provider-specific error mapping to unified error codes
- **Comprehensive Test Coverage**: Added extensive unit tests for all new providers
- **Dynamic SDK Loading**: Lazy loading of provider SDKs for better performance

### Improved

- **Provider Architecture**: Refactored to use base modules for code reuse
- **Model Configuration**: Rich metadata for each model including capabilities and limits
- **Temperature Handling**: Fixed temperature parameter conflicts in OpenAI-compatible providers
- **Image Validation**: Added proper validation for models that don't support images
- **Integration Tests**: Fixed MCP server initialization with required capabilities

### Fixed

- **OpenAI-Compatible Providers**: Fixed temperature default parameter override issue
- **Error Re-throwing**: Fixed error handling in Anthropic provider to avoid double-wrapping
- **Mock Setup**: Fixed dynamic import mocking patterns in provider tests
- **API Key Validation**: Added proper validation for provider-specific key formats

## [1.2.1] - 2025-07-26

### Changed

- **Dependencies**: Updated dotenv from v16.4.7 to v17.2.1
- **Dependencies**: Updated eslint to latest version (9.17.0)
- **Configuration**: Added `quiet: true` option to dotenv configuration to suppress verbose logging output

### Fixed

- **Tests**: Fixed test failures caused by dotenv v17's verbose logging interfering with JSON parsing in MCP protocol tests
- **Tests**: Updated tests to properly handle MCP protocol error responses instead of expecting thrown errors
- **Tests**: Added missing prompts and resources capabilities to test server instances

### Improved

- **Code Quality**: All code now passes latest eslint rules and formatting standards

## [1.2.0] - 2025-07-26

### Added

- **Help Prompt**: Added comprehensive help prompt (`/converse:help`) that provides detailed documentation about all tools, parameters, providers, and models
  - Supports topic-specific help queries (tools, models, providers, parameters, examples)
  - Dynamically pulls real-time model information from provider files
  - Explicitly instructs LLMs to share the information with users
- **Help Resource**: Added MCP resource (`converse://help`) that exposes the same help documentation plus server version information
  - Accessible via MCP resource protocol for programmatic access
  - Includes current server version from package.json
- **MCP Capabilities**: Extended server capabilities to support both prompts and resources in addition to tools

### Improved

- **Documentation**: Help content automatically stays up-to-date by fetching model details directly from provider implementations
- **User Experience**: Both prompt and resource provide comprehensive guidance including model selection tips, configuration advice, and best practices

## [1.1.2] - 2025-07-26

### Fixed

- **Binary Entry Point**: Fixed "startServer is not a function" error when running via npx/npm by properly exporting main function from index.js
- **Module Structure**: Improved module architecture to support both CLI and programmatic usage
- **Stdio Transport**: Removed console output from bin file to prevent JSON-RPC protocol corruption

### Changed

- **Entry Point Pattern**: index.js now exports main function and only auto-executes when run directly, following Node.js best practices

## [1.1.1] - 2025-07-26

### Improved

- **Consensus Tool Output**: Optimized output format by removing redundant `rawResponse` fields, reducing output size by ~70-80% while maintaining all essential information
- **Performance**: Significantly reduced memory usage and network payload for consensus tool responses

### Changed

- **Output Structure**: Removed `rawResponse` from both initial and refined consensus responses while maintaining backward compatibility

## [1.1.0] - 2025-07-26

### Fixed

- **Image Processing**: Fixed image handling in chat and consensus tools where images were being sent in a separate message from the prompt, causing XAI (Grok) and Google (Gemini) providers to not receive images correctly
- **Message Structure**: Both tools now properly merge context (including images) and prompt into a single user message with complex content array
- **Provider Compatibility**: All three providers (OpenAI, XAI, Google) now correctly process images with their respective format requirements

### Added

- **Integration Tests**: Added comprehensive image processing tests for consensus tool to verify all providers handle images correctly

### Improved

- **Image Format Validation**: Enhanced image format conversion for XAI and Google providers with proper debugging output
- **File Validation**: Added file existence validation before processing context to prevent errors

## [1.0.3] - 2025-07-26

### Fixed

- **Stdio Transport**: Fixed configuration loading error (`Cannot convert undefined or null to object`) that prevented stdio transport from starting
- **Console Suppression**: Fixed logger to properly suppress console output in stdio transport mode from startup
- **Transport Detection**: Moved transport type detection to very early in startup process to prevent any console output interference

### Improved

- **JSON-RPC Protocol**: Enhanced stdio transport reliability by eliminating all console output that could corrupt the protocol stream
- **Logger Configuration**: Improved logger reconfiguration timing to respect transport mode from the beginning

### Changed

- **Default Port**: Changed default HTTP server port from 3000 to 3157 to avoid common port conflicts

## [1.0.2] - 2025-07-26

### Fixed

- **Console Logging**: Replaced remaining `console.log` and `console.error` calls with proper structured logger to prevent stdio transport corruption
- **Configuration**: Fixed console output in config loading that could interfere with MCP JSON-RPC protocol

### Changed

- **Documentation**: Updated model examples to use latest intelligent models (o3, grok-4, gemini-2.5-pro) and fast models (gemini-2.5-flash, o4-mini, gpt-4.1)
- **File Paths**: Updated example file paths in documentation to use git-bash compatible paths (`/c/Users/username/...`)

### Removed

- **Unused Configuration**: Removed unused `GOOGLE_LOCATION` and `XAI_BASE_URL` environment variables from configuration files
- **Legacy Config**: Cleaned up unused Docker, DIAL, and OpenRouter configuration remnants from environment files

### Improved

- **Logger Integration**: Enhanced error logging consistency across chat and consensus tools
- **Transport Safety**: Strengthened stdio transport protection against console output interference

## [1.0.1] - 2025-07-25

### Fixed

- **Binary Script**: Fixed Windows compatibility for bin script import path

## [1.0.0] - 2025-07-25

### Added

- **Initial Release**: Complete Node.js implementation with functional architecture
- **Chat Tool**: Single-provider conversational AI with context and continuation support
- **Consensus Tool**: Multi-provider parallel execution with cross-model feedback
- **Provider Support**: OpenAI, Google/Gemini, and X.AI/Grok providers
- **Token Limiting**: Configurable response size limits (default: 25,000, max: 200,000 tokens)
- **System Prompts**: Dedicated prompts for chat and consensus tools
- **Context Processing**: File and image support with security validation
- **Continuation System**: Persistent conversation management
- **Configuration Management**: Environment-driven configuration system
- **Comprehensive Documentation**: API reference, architecture guide, and examples
- **Test Suite**: Unit, integration, and end-to-end tests
- **NPX Support**: Direct execution via `npx FallDownTheSystem/converse`
- **MCP Compliance**: Full Model Context Protocol implementation
- **Error Handling**: Robust error handling with graceful degradation
- **Logging System**: Structured logging with configurable levels

### Features

- **Parallel Consensus**: Simultaneous model execution for faster responses
- **Cross-Model Feedback**: Models can refine responses based on other models' insights
- **Auto Model Selection**: Intelligent model selection when using "auto" parameter
- **Multiple Response Formats**: Support for text, JSON, and structured responses
- **File Context Processing**: Support for multiple file formats with line numbering
- **Image Analysis**: Base64 image processing for visual context
- **Flexible Configuration**: Environment variables with sensible defaults
- **Provider Abstraction**: Unified interface across different AI providers
- **Request Validation**: Comprehensive input validation and sanitization

## Notes

This is a simplified Node.js implementation of an MCP Server focused on providing just the essential Chat and Consensus tools for a streamlined experience. The parallel consensus workflow represents a major architectural improvement, providing faster and more nuanced multi-model analysis.
