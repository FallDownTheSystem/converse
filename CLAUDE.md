# Claude Development Guide for Converse MCP Server

This repository contains the **Converse MCP Server** - a functional Node.js implementation of an MCP server.

## Repository Structure

- **`src/`** - Main source code for the Converse MCP Server
- **`docs/`** - Complete documentation (API, Architecture, Examples)
- **`tests/`** - Comprehensive test suite (unit, integration, e2e)
- **`scripts/`** - Development and build scripts
- **`examples/`** - Usage examples and sample configurations
- **`bin/`** - Executable binaries for CLI usage

## Converse MCP Server (Node.js)

The **Converse MCP Server** follows a functional architecture with a single unified `chat` tool that takes a `mode` parameter:

1. **`chat` mode** - 1..N models answer independently in parallel
2. **`consensus` mode** - ≥2 models answer in parallel, then refine via cross-feedback
3. **`roundtable` mode** - models answer sequentially, each building on the running transcript

### Development Setup

**IMPORTANT: This project uses pnpm, not npm.**

```bash
# Install dependencies (use pnpm, NOT npm)
pnpm install

# Start development server
pnpm run dev

# Run tests
pnpm test
```

For detailed implementation guidance, see:

- `docs/API.md` - Complete API reference
- `docs/ARCHITECTURE.md` - System architecture and design principles
- `docs/EXAMPLES.md` - Usage examples and patterns

## Release & CI Automation

This repo is fully automated for releases via [release-please](https://github.com/googleapis/release-please-action). **Do not manually bump versions in `package.json`, manually run `npm publish`, or manually edit the top of `CHANGELOG.md`** — the automation owns these.

### How releases work

- **Every push to `main` with a user-facing commit triggers a release.** release-please skips pushes whose commits are all hidden types (`ci:`, `chore:`, `docs:`, etc.) with "No user facing commits found — skipping"; force one of these with a `Release-As:` footer if you need to. Dependabot auto-merges explicitly dispatch the same workflow after merge so dependency bumps still publish a patch release (`always-bump-patch` strategy). Workflow: `.github/workflows/release.yml`.
- The flow in a single workflow run (~50s):
	1. release-please opens (or updates) a "chore(main): release X.Y.Z" PR with version bump + CHANGELOG.md entry.
	2. Workflow auto-merges that PR with `gh pr merge --squash`.
	3. release-please runs again, sees the just-merged release PR, tags `vX.Y.Z`, creates a GitHub Release.
	4. Workflow runs `pnpm install --frozen-lockfile` + lint + typecheck + test:unit, upgrades npm (`npm install -g npm@latest`), then `npm publish --access public`.
- Branch protection on `main` is **off** — direct pushes are allowed and intentional, since the automation needs to push the auto-merge commit.
- Publishing uses **npm Trusted Publishing (OIDC)** — no `NPM_TOKEN` secret. The job's `id-token: write` permission + a trusted publisher configured on npmjs.com (org `FallDownTheSystem`, repo `converse`, workflow `release.yml`) authenticate the publish, and provenance is generated automatically. Trusted Publishing requires npm >= 11.5.1, which is why the workflow upgrades npm before publishing.

### Forcing a minor or major bump

`always-bump-patch` ignores conventional-commit semantics for bump decisions, so `feat:` or `BREAKING CHANGE:` won't auto-promote. To intentionally bump minor/major:

```
git commit -m "feat: new important thing

Release-As: 2.23.0"
```

The `Release-As: X.Y.Z` footer (anywhere in the commit body) overrides the strategy for that release.

### Skipping a release for a trivial commit

Not directly supported with `always-bump-patch`. Either accept the patch release or batch trivial changes into a meaningful one. (You can also amend `release-please-config.json` to skip specific commit types in `changelog-sections`, but the version still bumps.)

### Dependabot

- `.github/dependabot.yml` runs npm + github-actions weekly (Mon 06:00 UTC). Patch+minor are grouped into one PR per ecosystem; majors are individual.
- Commits use the `deps:` prefix so they bucket under "Dependencies" in CHANGELOG.md.
- `.github/workflows/dependabot-auto-merge.yml` auto-approves patch+minor PRs, waits for the merge to complete, and dispatches the release workflow so merged dependency updates publish a new npm patch release. Major-version PRs get a `needs-review` label and wait for human review.
- **Don't manually run `npm update` / bump deps in `package.json`** unless you're fixing something urgent that Dependabot won't catch. The weekly cadence handles routine bumps.

### CI

- `.github/workflows/ci.yml` runs lint + typecheck + test:unit on every PR and every push to main.
- CI is **not required** to merge (no branch protection), but failures should still be addressed before pushing more changes.
- The `unit` test suite (`pnpm run test:unit`) does **not** make real API calls and does **not** require API keys — it's the only suite CI runs.

### Copilot review

- A repository ruleset auto-requests Copilot code review on PRs against `main`. Copilot leaves comment-only reviews (it cannot approve or block merges) and natively skips dependency files like `package.json` and lockfiles.

### CHANGELOG.md format

- The historical section (entries up through `[2.22.4]`) is manually maintained in "Keep a Changelog" format.
- New entries from `[2.22.5]` onward are auto-generated by release-please in its own format (`### Bug Fixes`, `### Features`, `### Dependencies`, etc.). The two formats coexist — release-please prepends new sections at the top.

### What NOT to commit

- Don't commit changes to `package.json`'s `version` field — release-please owns it.
- Don't commit changes to `.release-please-manifest.json` — release-please owns it.
- Don't manually create git tags `vX.Y.Z` — release-please owns them.
- Don't commit a `CHANGELOG.md` entry for an unreleased version — release-please will generate it.

### Workflow files

- `.github/workflows/release.yml` — the combined release-please + npm publish workflow
- `.github/workflows/ci.yml` — lint + typecheck + unit tests
- `.github/workflows/dependabot-auto-merge.yml` — auto-merge patch/minor Dependabot PRs
- `.github/dependabot.yml` — Dependabot schedule and grouping config
- `release-please-config.json` — release-please settings (release-type, versioning-strategy, changelog sections)
- `.release-please-manifest.json` — current released version (release-please updates this)

## Quick Reference Commands

**IMPORTANT: Always use `pnpm` instead of `npm` for this project.**

### Code Quality Checks

Before making any changes or submitting PRs, always run the comprehensive quality checks:

```bash
# Run all quality checks (linting, formatting, tests)
pnpm run validate

# Run individual checks
pnpm run lint
pnpm run typecheck
pnpm test
```

### Code Style Rules

**IMPORTANT: ESLint is the only formatter for this project — Prettier has been removed.** Do NOT run `npx prettier` on project files; it uses incompatible defaults (double quotes, different indentation) and will:
- Convert single quotes to double quotes (breaks ESLint `quotes` rule)
- Reindent files in ways that break the ESLint `indent` rule
- Convert `function()` to `() =>` in test mocks (breaks constructor semantics, causes test failures)

Use `pnpm run format` (alias for `eslint src/ tests/ --fix`) or `npx eslint --fix <file>` to auto-fix formatting issues.

### Development Commands

```bash
# Start development server with hot reload
pnpm run dev

# Run in debug mode
pnpm run debug

# Run specific test suites
pnpm run test:unit
pnpm run test:integration
pnpm run test:providers
pnpm run test:tools
```

### Server Management

#### Setup/Update the Server

```bash
# Install dependencies and start (use pnpm)
pnpm install
pnpm start
```

#### View Logs

```bash
# Follow logs in real-time with debug logging
LOG_LEVEL=debug pnpm run dev

# Or check specific log levels
LOG_LEVEL=info pnpm start

# Debug with summarization enabled
ENABLE_RESPONSE_SUMMARIZATION=true LOG_LEVEL=debug pnpm run dev
```

### Testing

**IMPORTANT: Do NOT run the full test suite (`pnpm test`) during development.** The test suite contains hundreds of tests including integration and e2e tests that make real API calls. Running all tests will timeout and consume API credits.

**Instead, run only the specific tests relevant to your changes:**

```bash
# Run specific test file
pnpm test -- tests/unit/providers/openai.test.js

# Run tests matching a pattern
pnpm test -- tests/unit/providers/*.test.js

# Run with verbose output
pnpm test -- tests/unit/providers/openai.test.js --reporter=verbose
```

#### Run All Tests (CI only)

```bash
# Run full test suite (WARNING: takes a long time, uses real APIs)
pnpm test

# Run tests with coverage
pnpm run test:coverage

# Run tests in watch mode
pnpm run test:watch
```

#### Run Specific Test Categories

```bash
# Unit tests only
pnpm run test:unit

# Integration tests only
pnpm run test:integration

# End-to-end tests with real API calls
pnpm run test:e2e

# Provider tests
pnpm run test:providers

# Tool tests
pnpm run test:tools

# MCP client tests (HTTP-based client-server testing)
pnpm run test:mcp-client

# Performance tests
pnpm run test:performance

# Utility tests
pnpm run test:utils

# Resource tests
pnpm run test:resources

# Prompt tests
pnpm run test:prompts
```

### Development Workflow

#### Before Making Changes

1. Install dependencies: `pnpm install`
2. Run quality checks: `pnpm run validate`
3. Start development server: `pnpm run dev`

#### After Making Changes

1. Run quality checks again: `pnpm run validate`
2. Run tests: `pnpm test`
3. Verify functionality: `pnpm start`
4. Check logs for any issues

#### Before Committing/PR

1. Final quality check: `pnpm run validate`
2. Verify all tests pass: `pnpm test`
3. Check documentation is up to date

### Available Tools

The Converse MCP Server exposes three tools:

1. **Chat Tool** (`chat`) — one tool, three modes selected by the `mode` parameter:
   - **`chat`** (default): 1..N models invoked in parallel; each responds independently and never sees the others. N=1 preserves auto-mode provider failover and Codex thread reuse; N>1 returns per-model labeled sections.
   - **`consensus`**: ≥2 models answer in parallel, then a cross-feedback refinement phase runs where each model sees the others' answers and refines its own. `["auto"]` expands to the first 3 available providers.
   - **`roundtable`**: models respond SEQUENTIALLY in the order given; each sees the full running transcript and builds on prior turns. One call = one lap; pass `continuation_id` for more laps. A single model talks to itself across laps; duplicate model entries are allowed only in this mode.
   - Shared across modes: `files`/`images` context, `reasoning_effort`, `async: true` background execution, `export: true` disk export, and `continuation_id` for persistent multi-turn threads. You MAY switch modes on a resuming turn — the shared transcript is the context.

   ```javascript
   // mode "chat" (default) — single answer or independent parallel answers
   { "prompt": "How should I structure auth for this API?", "models": ["auto"] }

   // mode "consensus" — parallel answers + cross-feedback refinement
   { "prompt": "Microservices or monolith for 100k users?", "models": ["gpt-5.6", "grok-4.5", "gemini-2.5-pro"], "mode": "consensus" }

   // mode "roundtable" — sequential dialogue in the given ORDER
   { "prompt": "Critique this caching strategy.", "models": ["codex", "gemini", "claude"], "mode": "roundtable" }
   ```

2. **Check Status Tool** (`check_status`)
   - Monitor progress of asynchronous operations
   - Retrieve results from completed background jobs
   - List recent jobs with status information
   - Smart display with AI-generated titles and summaries

3. **Cancel Job Tool** (`cancel_job`)
   - Cancel running asynchronous operations
   - Graceful termination with resource cleanup

### Mode semantics

- **chat**: parallel, independent answers. Auto-failover and Codex thread reuse apply in this mode.
- **consensus**: parallel phase 1, then a refinement phase that always runs when ≥2 phase-1 responses succeed. Requires ≥2 resolved models (an explicit single model is rejected — use mode `chat`).
- **roundtable**: sequential turns; each turn's full context is packed into one self-contained message so SDK providers that only read the last user message still see the transcript.

### Common Troubleshooting

#### Server Issues

```bash
# Check if environment is set up correctly
pnpm run validate

# View recent errors
LOG_LEVEL=debug pnpm start

# Check dependencies
pnpm install
```

#### Test Failures

```bash
# Run tests with verbose output
pnpm test -- --verbose

# Run specific test file
pnpm test tests/tools/chat.test.js

# Check for syntax issues
pnpm run lint
```

#### Configuration Issues

```bash
# Verify API keys are configured
cat .env

# Check configuration loading
LOG_LEVEL=debug npm start
```

### File Structure Context

- `src/index.js` - Main entry point and MCP server setup
- `src/config.js` - Configuration and environment management
- `src/tools/` - MCP tool implementations (chat.js unified tool + modes/parallel.js, modes/roundtable.js engines)
- `src/providers/` - AI provider implementations (OpenAI, Google, XAI)
- `src/utils/` - Utility functions (logging, context processing, etc.)
- `src/transport/` - HTTP transport layer for MCP communication
- `src/router.js` - Request routing and middleware
- `src/systemPrompts.js` - System prompt templates
- `src/continuationStore.js` - Conversation state management
- `tests/` - Comprehensive test suite
- `scripts/` - Development and build automation scripts
- `docs/` - Complete documentation

### Environment Requirements

- Node.js 24.0.0+ (LTS recommended)
- **pnpm** (required - do NOT use npm or yarn)
  - Install: `npm install -g pnpm` or `corepack enable`
- API keys for at least one provider (OpenAI, Google, or XAI)
- Environment variables configured in `.env` file

### AI Summarization Feature (v1.14.0+)

When enabled, the server automatically generates intelligent titles and summaries for better context understanding:

- **Automatic Title Generation**: Creates descriptive titles (up to 60 chars) for each request
- **Streaming Summaries**: Status check returns an up-to-date summary of the progress based on the partially streamed response
- **Final Summaries**: Concise 1-2 sentence summaries of completed responses
- **Smart Status Display**: Enhanced check_status tool shows titles and summaries in job listings
- **Persistent Context**: Summaries are stored with async jobs for better progress tracking

**Configuration**:

```bash
# Enable in your .env file
ENABLE_RESPONSE_SUMMARIZATION=true    # Default: false
SUMMARIZATION_MODEL=gpt-5-nano        # Default: gpt-5-nano
```

### Configuration

The server uses environment-driven configuration. Copy `.env.example` to `.env` and configure:

```bash
# Required: At least one API key
OPENAI_API_KEY=sk-proj-your_key_here
GOOGLE_API_KEY=your_google_key_here
XAI_API_KEY=xai-your_key_here

# Optional: Server settings
MAX_MCP_OUTPUT_TOKENS=200000
LOG_LEVEL=info
PORT=3157

# Optional: AI Summarization (v1.14.0+)
ENABLE_RESPONSE_SUMMARIZATION=true
SUMMARIZATION_MODEL=gpt-5-nano
```

### Deployment

The server can be deployed using:

```bash
# NPX (for users - uses npm registry)
npx converse-mcp-server

# Global installation (for users)
npm install -g converse-mcp-server
converse

# From source (for development - use pnpm)
git clone https://github.com/FallDownTheSystem/converse.git
cd converse
pnpm install
pnpm start
```

**Note:** End users can use npm/npx to install the published package. Developers working on the codebase must use pnpm.

This guide provides everything needed to efficiently work with the Converse MCP Server codebase using Claude.
