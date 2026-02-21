---
id: task-010-add-copilot-model-selection-syntax
title: Add Copilot Provider Model Selection via copilot:modelname Syntax
status: "In Progress"
created_date: '2026-02-21 21:47'
updated_date: '2026-02-21 22:34'
parent: null
subtasks: []
dependencies:
  - task-008
---

## Description
<!-- DESCRIPTION:BEGIN -->
Add support for choosing specific AI models when using the Copilot provider by using the `copilot:modelname` prefix syntax (e.g., `copilot:gpt-5.2`, `copilot:claude-sonnet-4.6`).

Currently, using the Copilot provider only supports the bare `copilot` model name, which uses whatever model the Copilot CLI was last configured with. Users want to select specific models available through their Copilot subscription without switching back to the CLI to change the default.

The `copilot:` prefix must take precedence over other routing. Without this, model names like `copilot:claude-sonnet-4.6` could accidentally match the keyword-based routing for the Anthropic API provider (since it contains "claude" and "sonnet"). The prefix check must happen before both the slash-format routing and the keyword matching.

A comprehensive model alias map will be added so users can use friendly short names (e.g., `copilot:gpt-5`, `copilot:codex`, `copilot:sonnet`) that resolve to the correct SDK model identifiers.
<!-- DESCRIPTION:END -->

## Specification
<!-- SPECIFICATION:BEGIN -->
### Technical Requirements

1. **Copilot Prefix Routing** (`mapModelToProvider` in chat.js + consensus.js)
   - Detect `copilot:` prefix at the start of the model string
   - Must be checked **before** the slash-format routing and keyword matching
   - Must be checked **after** the existing exact-match copilot aliases (`copilot`, `copilot-sdk`, `github-copilot`)
   - `copilot:anything` → returns `'copilot'` provider
   - Extract the part after `copilot:` as the model name to pass to the provider

2. **Model Name Extraction** (copilot provider)
   - When model is `copilot:xyz`, strip the `copilot:` prefix and pass `xyz` to the SDK session
   - When model is bare `copilot` / `copilot-sdk` / `github-copilot`, use env var or SDK default (existing behavior)
   - Update `resolveSessionModel()` to handle the prefix stripping

3. **Model Alias Map** (copilot provider `SUPPORTED_MODELS`)
   - Add entries for all Copilot-available models with friendly aliases
   - Include version shortcuts pointing to latest (e.g., `gpt-5` → `gpt-5.2`, `codex` → `gpt-5.3-codex`)
   - Each entry needs: `modelName` (SDK slug), `friendlyName`, `contextWindow`, `maxOutputTokens`, capability flags, `aliases`

4. **Model List** (SDK model identifiers — confirmed from CLI changelog and community sources):
   - **OpenAI:** `gpt-4.1`, `gpt-5-mini`, `gpt-5.1`, `gpt-5.1-codex`, `gpt-5.1-codex-mini`, `gpt-5.1-codex-max`, `gpt-5.2`, `gpt-5.2-codex`, `gpt-5.3-codex`
   - **Anthropic:** `claude-haiku-4.5`, `claude-sonnet-4`, `claude-sonnet-4.5`, `claude-sonnet-4.6`, `claude-opus-4.5`, `claude-opus-4.6`, `claude-opus-4.6-fast`
   - **Google:** `gemini-2.5-pro`, `gemini-3-flash-preview`, `gemini-3-pro-preview`, `gemini-3.1-pro-preview`
   - **xAI:** `grok-code-fast-1`
   - **Fine-tuned:** `raptor-mini`, `goldeneye`

5. **Version Aliases** (shortcuts pointing to latest version):
   - `gpt-5` → `gpt-5.2`
   - `codex` → `gpt-5.3-codex`
   - `sonnet` → `claude-sonnet-4.6`
   - `opus` → `claude-opus-4.6`
   - `haiku` → `claude-haiku-4.5`
   - `gemini` → `gemini-2.5-pro`
   - `flash` → `gemini-3-flash-preview`
   - `grok` → `grok-code-fast-1`
   - `gemini-3-flash` → `gemini-3-flash-preview` (convenience without -preview suffix)
   - `gemini-3-pro` → `gemini-3-pro-preview`
   - `gemini-3.1-pro` → `gemini-3.1-pro-preview`

6. **getModelConfig Enhancement**
   - `getModelConfig('copilot:gpt-5.2')` should resolve correctly (strip prefix, then look up)
   - `getModelConfig` returns `null` for unknown models (no passthrough — only `resolveSessionModel` passes unknown names through to SDK at runtime)

7. **Edge Cases**
   - `copilot:` (empty suffix) → fall back to default model (same as bare `copilot`)
   - `copilot:   ` (whitespace suffix) → trim, then fall back to default
   - `CoPiLoT:GPT-5` → case-insensitive prefix detection, case-insensitive alias resolution
   - `copilot:openai/gpt-5` → stays in copilot provider (prefix takes precedence over slash routing)
   - `COPILOT_MODEL` env var → run through alias resolver (e.g., `COPILOT_MODEL=codex` → `gpt-5.3-codex`)
   - `COPILOT_MODEL=copilot:codex` → strip prefix, then resolve alias (accept prefixed values in env)
   - Non-string model inputs → guard with type check before `.toLowerCase()` calls

8. **Metadata Consistency**
   - `metadata.model` must always report the resolved SDK slug, not the user's input string
   - Stream start event (line 256) already uses `sessionModel` — correct
   - Sync path (line 461) currently returns raw `model` — must be updated to use resolved name

### Acceptance Criteria

- [ ] `model: "copilot:gpt-5.2"` routes to copilot provider and uses `gpt-5.2` SDK model
- [ ] `model: "copilot:claude-sonnet-4.6"` routes to copilot (NOT anthropic), uses `claude-sonnet-4.6`
- [ ] `model: "copilot:codex"` resolves alias to `gpt-5.3-codex`
- [ ] `model: "copilot:gpt-5"` resolves alias to `gpt-5.2`
- [ ] `model: "copilot"` still works as before (no model specified to SDK, or env var)
- [ ] `model: "copilot-sdk"` still works as before
- [ ] `model: "claude-sonnet-4.6"` (without prefix) still routes to Anthropic API provider
- [ ] `model: "gpt-5.2"` (without prefix) still routes to OpenAI provider
- [ ] Unknown models after `copilot:` are passed through to SDK (e.g., `copilot:future-model`)
- [ ] `copilot:` (empty/whitespace suffix) falls back to default model
- [ ] Case-insensitive: `copilot:CODEX` resolves same as `copilot:codex`
- [ ] `metadata.model` reports resolved SDK slug in both sync and stream paths
- [ ] Both chat and consensus tools handle the prefix identically
- [ ] `pnpm run validate` passes

### Out of Scope

- Dynamic model discovery from SDK at runtime (future enhancement)
- Changing the auto-selection default model for copilot provider
- Adding copilot-specific model to the consensus tool's default model list
- Changing any existing routing behavior for models without the `copilot:` prefix
- Help prompt / discoverability for copilot model listings (follow-up task)
<!-- SPECIFICATION:END -->

## Design
<!-- DESIGN:BEGIN -->
### Architecture Approach

The implementation adds a `copilot:` prefix-based routing mechanism to `mapModelToProvider()`, and expands the copilot provider's `SUPPORTED_MODELS` with all available Copilot models and their aliases.

### Key Files

1. **`src/tools/chat.js`** — Add `copilot:` prefix check in `mapModelToProvider()` (2 lines)
2. **`src/tools/consensus.js`** — Mirror the same prefix check (2 lines)
3. **`src/providers/copilot.js`** — Expand `SUPPORTED_MODELS`, update `resolveSessionModel()`, update `getModelConfig()`

### Routing Change

In `mapModelToProvider()`, add a `copilot:` prefix check right after the existing copilot exact-match block and before the openrouter/slash-format routing:

```javascript
// Existing: exact match copilot/copilot-sdk/github-copilot → 'copilot'

// NEW: copilot:modelname prefix → 'copilot'
if (modelLower.startsWith('copilot:')) {
  return 'copilot';
}

// Existing: openrouter patterns, slash format, keyword matching...
```

This ensures `copilot:claude-sonnet-4.6` hits the copilot provider before the keyword matcher would route it to `anthropic`.

### Model Resolution in Provider

Update `resolveSessionModel()` to strip the `copilot:` prefix, handle edge cases, and resolve aliases:

```javascript
function resolveSessionModel(requestModel, config) {
  const converseAliases = ['copilot', 'copilot-sdk', 'github-copilot'];

  // Strip copilot: prefix (case-insensitive)
  let effectiveModel = requestModel;
  if (requestModel && requestModel.toLowerCase().startsWith('copilot:')) {
    effectiveModel = requestModel.slice('copilot:'.length).trim();
  }

  // Empty suffix or converse alias → use env/default
  if (!effectiveModel || converseAliases.includes(effectiveModel.toLowerCase())) {
    // Env var also goes through alias resolution
    const envModel = config?.providers?.copilotmodel;
    if (envModel) {
      let resolved = envModel;
      if (resolved.toLowerCase().startsWith('copilot:')) {
        resolved = resolved.slice('copilot:'.length).trim();
      }
      return resolveModelAlias(resolved) || resolved;
    }
    return undefined;
  }

  // Resolve alias from SUPPORTED_MODELS (case-insensitive)
  const resolved = resolveModelAlias(effectiveModel);
  return resolved || effectiveModel; // passthrough unknown models
}
```

### Metadata Fix

The sync invoke path at line 461 currently returns the raw `model` value in metadata. Update to use the resolved `sessionModel` value so `metadata.model` always reports the SDK slug (e.g., `gpt-5.2` not `copilot:gpt-5`). The stream path at line 256 already does this correctly.

### SUPPORTED_MODELS Expansion

Add one entry per SDK model with:
- Key: SDK model identifier (e.g., `gpt-5.2`)
- `modelName`: same as key
- `aliases`: friendly short names and variations
- Reasonable defaults for context windows and output tokens (Copilot doesn't expose these, use conservative estimates)
- All models share: `supportsStreaming: true`, `supportsImages: false`, `supportsTemperature: false`

The base `copilot` entry remains as the default/generic entry.

### getModelConfig Enhancement

Update `getModelConfig()` to handle the `copilot:` prefix:

```javascript
getModelConfig(modelName) {
  let name = modelName;
  if (name.toLowerCase().startsWith('copilot:')) {
    name = name.slice('copilot:'.length);
  }
  // ... existing lookup logic with name instead of modelName
}
```

### Patterns to Follow

- OpenRouter provider pattern: extensive `SUPPORTED_MODELS` with aliases, passthrough for unknown models
- OpenAI provider pattern: version alias resolution (e.g., `gpt-5` → `gpt-5.2`)
- Existing copilot `resolveSessionModel()` pattern: strip routing aliases, pass through real names
<!-- DESIGN:END -->

## TODO
<!-- TODO:BEGIN -->
### Provider Changes (`src/providers/copilot.js`)
- [x] Expand `SUPPORTED_MODELS` with all Copilot-available models (23 models + base entry)
- [x] Add version shortcut aliases (gpt-5 → gpt-5.2, codex → gpt-5.3-codex, etc.)
- [x] Add `resolveModelAlias()` helper to resolve friendly names to SDK model IDs (case-insensitive)
- [x] Update `resolveSessionModel()` to strip `copilot:` prefix, trim whitespace, resolve aliases
- [x] Update `resolveSessionModel()` to run `COPILOT_MODEL` env var through alias resolver (including prefix stripping)
- [x] Update `getModelConfig()` to handle `copilot:` prefix (strip before lookup, return null for unknown)
- [x] Fix sync metadata (line ~461) to report resolved SDK slug instead of raw model input

### Routing Changes
- [x] `src/tools/chat.js` — Add `copilot:` prefix check in `mapModelToProvider()` after copilot exact-match block
- [x] `src/tools/consensus.js` — Mirror same prefix check in `mapModelToProvider()`

### Edge Case Handling
- [x] Empty suffix (`copilot:`) → default model path
- [x] Whitespace suffix (`copilot:   `) → trim, then default model path
- [x] Case-insensitive prefix detection and alias resolution
- [x] Guard against non-string model inputs in resolver/getModelConfig paths

### Testing
- [x] Add unit tests for `copilot:` prefix routing in mapModelToProvider (chat + consensus)
- [x] Add unit tests for alias resolution (`copilot:codex` → `gpt-5.3-codex`, `copilot:gpt-5` → `gpt-5.2`)
- [x] Add unit tests for edge cases (empty suffix, whitespace, case-insensitive, unknown passthrough)
- [x] Add unit test for no duplicate aliases across SUPPORTED_MODELS entries

### Verification
- [x] Run `pnpm run validate` — 0 lint errors, 37/37 new tests pass, all existing tests pass
- [ ] Manual test: `copilot:gpt-5.2` routes to copilot with correct model
- [ ] Manual test: `copilot:codex` resolves alias to `gpt-5.3-codex`
- [ ] Manual test: bare `copilot` still works unchanged
- [ ] Manual test: `claude-sonnet-4.6` (no prefix) still routes to anthropic
<!-- TODO:END -->

## Notes
<!-- NOTES:BEGIN -->
### SDK Model Identifiers

The Copilot SDK accepts model names as lowercase strings in `createSession({ model: '...' })`. Model IDs confirmed from multiple sources (confidence: highest → medium):

**Highest confidence** (from `copilot-cli` changelog, confirmed by DeepWiki analysis):
- `gpt-4.1`, `gpt-5-mini`, `gpt-5.1`, `gpt-5.1-codex`, `gpt-5.1-codex-mini`, `gpt-5.1-codex-max`, `gpt-5.2`, `gpt-5.2-codex`
- `claude-haiku-4.5`, `claude-sonnet-4`, `claude-sonnet-4.5`, `claude-sonnet-4.6`, `claude-opus-4.5`, `claude-opus-4.6`, `claude-opus-4.6-fast`
- `grok-code-fast-1` (confirmed from API error response)

**High confidence** (consistent naming patterns, community confirmation):
- `gpt-5.3-codex` (follows established pattern, GA in docs)
- `gemini-2.5-pro`, `gemini-3-flash-preview`, `gemini-3-pro-preview`, `gemini-3.1-pro-preview` (Google API naming, CLI gist confirmation)
- `raptor-mini` (VS Code DevTools, community investigation)

**Medium confidence** (user-facing name as ID):
- `goldeneye` (picker name; backend has different deployment slug but picker ID is likely `goldeneye`)

**Important:** Passthrough behavior ensures unknown/future models work even if a slug is wrong. The alias map can be updated without breaking anything.

### Why copilot: Prefix (Not Slash Format)

The slash format (`provider/model`) is already used for OpenRouter routing. Using `copilot:model` avoids ambiguity and matches the user's mental model of "use copilot provider with this model." It also provides a clean extraction mechanism.

### Review History

**Codex Review (2026-02-21):** continuation_id: `conv_SWGyNOuNQ9`. Identified 6 findings across 2 rounds:
1. **High:** Missing unit tests for prefix routing and alias resolution — added Testing section to TODO
2. **Medium:** Sync metadata reports raw input instead of resolved slug — added fix to TODO
3. **Medium:** `getModelConfig` passthrough semantics unclear — clarified: only `resolveSessionModel` passes through, `getModelConfig` returns null
4. **Medium:** Edge cases missing (empty suffix, whitespace, case sensitivity) — added to Specification and TODO
5. **Low:** Per-model timeouts informational only — accepted, wire later
6. **Low:** Help prompt doesn't list copilot models — out of scope, follow-up task
7. Additional: `COPILOT_MODEL` env should go through alias resolver — added to design and TODO
8. Additional: Guard against non-string model inputs — added to TODO

### Related Tasks
- task-008-add-copilot-sdk-provider-support — Parent provider implementation (must be complete first)

### Related Files
- `src/providers/copilot.js` — Provider implementation (main changes)
- `src/tools/chat.js` — `mapModelToProvider()` at line 539
- `src/tools/consensus.js` — `mapModelToProvider()` at line 742
- `src/providers/openai.js` — Reference for alias resolution pattern
- `src/providers/openrouter.js` — Reference for extensive model list pattern
<!-- NOTES:END -->
