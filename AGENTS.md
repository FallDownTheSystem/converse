# Repository Guidelines

## Project Structure & Modules
- Root: Node.js (ESM) server targeting MCP. Entry: `src/index.js`.
- Source: `src/` with `providers/`, `tools/`, `utils/`, `resources/`, `transport/`, `prompts/`.
- Tests: `tests/` organized by `unit/`, `integration/`, `utils/`, `tools/`, plus suite configs in `tests/suites.config.js`.
- Binaries: `bin/converse.js` (CLI).
- Docs: `docs/` (API, architecture). Env templates in `.env.example`.

## Build, Test, and Dev
- `npm run dev`: Start in watch mode (stdio; set `MCP_TRANSPORT=http` for HTTP).
- `npm start`: Start server (kills existing on 3157).
- `npm test`: Run full Vitest suite; `npm run test:unit|integration|e2e` for subsets.
- `npm run test:coverage`: Generate coverage report.
- `npm run lint` / `lint:fix`: ESLint check/fix.
- `npm run format` / `format:check`: Prettier write/check.
- `npm run validate`: Typecheck + lint + tests (fast path: `validate:fast`).

## Coding Style & Naming
- JavaScript (ESM) with 2‑space indent, single quotes, semicolons enforced (see `eslint.config.js`).
- Prefer `const`, no `var`, arrow functions favored, object shorthand required.
- Filenames: lowerCamelCase or kebab where consistent (e.g., `openai.js`, `systemPrompts.js`). Tests end with `.test.js`.
- Format with Prettier before committing: `npm run format`.

## Testing Guidelines
- Framework: Vitest. Suites configured via `vitest.*.config.js` and `tests/suites.config.js`.
- Unit tests live under `tests/unit/**`, integration under `tests/integration/**`.
- Coverage targets (unit): lines 80%, functions 80%, branches 70% (see config).
- Run focused suites, e.g.: `npm run test:unit`, `npm run test:integration:mcp`.

## Commits & Pull Requests
- Commit style: Conventional Commits (e.g., `feat:`, `fix:`, `docs:`). Versions are bumped via `npm version`.
- Branches: `feature/short-description` or `fix/issue-123`.
- PRs must include: clear description, linked issue, tests for changes, and updated docs where applicable. Ensure `npm run validate` passes and attach logs/screenshots if relevant.

## Security & Configuration
- Do not commit secrets. Use `.env` (copy from `.env.example`). Keys required for provider tests: `OPENAI_API_KEY`, `GOOGLE_API_KEY`, etc.
- Minimum Node: 20+. Prefer local HTTP only for debugging: `MCP_TRANSPORT=http npm run dev`.
- Before pushing, run: `npm run validate` and, for coverage, `npm run test:coverage`.

