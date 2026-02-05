---
id: task-007-add-gpt-5-2-model-support
title: Add GPT-5.2 Model Support
status: "Done"
created_date: '2025-12-12 17:17'
updated_date: '2025-12-12 17:46'
parent: null
subtasks:
dependencies:
---

## Description
<!-- DESCRIPTION:BEGIN -->
OpenAI released GPT-5.2 on December 11, 2025, as their latest flagship model. This task replaces GPT-5.1 with GPT-5.2 in the Converse MCP Server, since GPT-5.1 is being sunset in ~3 months.

**What needs to happen:**
1. Replace the GPT-5.1 model entry with GPT-5.2
2. Keep all existing aliases (`gpt-5`, `gpt5`, `gpt 5`, etc.) working - they'll now point to GPT-5.2
3. Add GPT-5.2 specific aliases (`gpt-5.2`, `gpt5.2`, `gpt 5.2`, `gpt-5.2-2025-12-11`)

**Why this matters:**
GPT-5.2 offers significant improvements over GPT-5.1:
- 38% fewer errors in responses
- 30% reduction in hallucinations
- Better performance on professional knowledge work
- State-of-the-art long-horizon reasoning for agentic tasks

Since GPT-5.1 is being deprecated (~March 2026), we're replacing it entirely rather than maintaining both models.
<!-- DESCRIPTION:END -->

## Specification
<!-- SPECIFICATION:BEGIN -->
### Technical Requirements

1. **Replace GPT-5.1 with GPT-5.2 Model Configuration**
   - Change model ID from `gpt-5.1` to `gpt-5.2`
   - Update modelName to `gpt-5.2`
   - Update friendlyName to `OpenAI (GPT-5.2)`
   - Keep same capabilities: streaming, images, web search, Responses API
   - Keep "none" reasoning effort support
   - Keep no temperature support

2. **Update Aliases**
   - Keep existing aliases: `gpt-5`, `gpt5`, `gpt 5`
   - Replace `gpt-5.1-2025-11-13` with `gpt-5.2-2025-12-11`
   - Replace `gpt5.1`, `gpt 5.1` with `gpt5.2`, `gpt 5.2`
   - Remove `gpt-5.1` specific aliases entirely

3. **Remove GPT-5.1**
   - Delete the entire `gpt-5.1` model entry from `SUPPORTED_MODELS`
   - Users requesting `gpt-5.1` will get an unknown model error (acceptable since it's deprecated)

4. **Update Tests**
   - Update any tests that reference `gpt-5.1` to use `gpt-5.2`
   - Add tests for new `gpt-5.2` aliases

### Acceptance Criteria

- [ ] `gpt-5` alias resolves to `gpt-5.2`
- [ ] `gpt-5.1` is no longer a valid model (removed)
- [ ] `gpt-5.2` model can be invoked successfully via chat/consensus tools
- [ ] GPT-5.2 supports streaming
- [ ] GPT-5.2 supports reasoning effort parameter (including "none")
- [ ] GPT-5.2 supports verbosity parameter
- [ ] GPT-5.2 supports web search
- [ ] All tests pass (with updated model references)
- [ ] Model appears in supported models list with correct configuration
<!-- SPECIFICATION:END -->

## Design
<!-- DESIGN:BEGIN -->
**Architecture Approach:**

This is a simple in-place replacement of GPT-5.1 with GPT-5.2. Since both models have identical capabilities and API format, we just update the model identifiers and aliases.

The approach:
1. Rename the `gpt-5.1` entry key to `gpt-5.2` in `SUPPORTED_MODELS`
2. Update `modelName` from `gpt-5.1` to `gpt-5.2`
3. Update `friendlyName` to `OpenAI (GPT-5.2)`
4. Update aliases to use 5.2 versions instead of 5.1
5. Update any test references from `gpt-5.1` to `gpt-5.2`

No changes needed to:
- The `resolveModelName()` function (already handles alias lookup)
- The `invoke()` method (already handles GPT-5 models correctly)
- Streaming logic (already works for GPT-5 family)
- Parameter handling (reasoning_effort, verbosity already supported)

**Key Files:**

| File | Change Type | Description |
|------|-------------|-------------|
| `src/providers/openai.js` | Modify | Replace GPT-5.1 entry with GPT-5.2 |
| `tests/unit/providers/openai.test.js` | Modify | Update gpt-5.1 references to gpt-5.2 |

**New Model Configuration:**

```javascript
'gpt-5.2': {
  modelName: 'gpt-5.2',
  friendlyName: 'OpenAI (GPT-5.2)',
  contextWindow: 400000,
  maxOutputTokens: 128000,
  supportsStreaming: true,
  supportsImages: true,
  supportsTemperature: false,
  supportsWebSearch: true,
  supportsResponsesAPI: true,
  supportsNoneReasoningEffort: true,
  timeout: 3600000,
  description: 'Latest flagship model (400K context, 128K output) - Superior reasoning, code generation, analysis. Supports "none" reasoning for faster responses',
  aliases: [
    'gpt-5',
    'gpt5',
    'gpt 5',
    'gpt-5.2-2025-12-11',
    'gpt5.2',
    'gpt 5.2',
  ],
}
```

**Dependencies:**

- None - this uses the existing OpenAI SDK and provider infrastructure
- No external API changes required (GPT-5.2 uses same Responses API format)

**Context Manifest:**

### How GPT-5 Model Support Currently Works

The Converse MCP Server uses a provider-based architecture where AI models are registered as entries in a `SUPPORTED_MODELS` object within each provider implementation. For OpenAI, this lives in `C:\Users\Juugo\Documents\Projects\converse\src\providers\openai.js`.

**Current GPT-5 Model Registration (Lines 12-208):**

When a user requests a model like "gpt-5", the system follows this flow:

1. **Model Name Resolution (Lines 225-248)**: The `resolveModelName()` function performs case-insensitive matching. It first checks for exact model name matches against `SUPPORTED_MODELS` keys, then checks aliases within each model's configuration. For example, when a user specifies "gpt-5", the resolver finds it in the `gpt-5.1` model's aliases array and returns the canonical model name `'gpt-5.1'`.

2. **Model Configuration Retrieval**: The resolved model name retrieves its configuration from `SUPPORTED_MODELS`. Currently, `gpt-5.1` (added in commit 5dff5b4 on Nov 17, 2025) is the canonical GPT-5 model with these aliases: `['gpt-5', 'gpt5', 'gpt 5', 'gpt-5.1-2025-11-13', 'gpt5.1', 'gpt 5.1']`. The older `gpt-5-2025-08-07` model (GPT-5.0) has its own separate aliases: `['gpt-5.0', 'gpt5.0', 'gpt 5.0']`.

3. **API Request Construction (Lines 409-500)**: The provider determines which OpenAI API to use. All GPT-5 models have `supportsResponsesAPI: true`, so they use OpenAI's Responses API rather than the Chat Completions API. The request payload is built with:
   - **Base model identifier**: Uses the resolved model name (e.g., `'gpt-5.1'`)
   - **Reasoning effort** (Lines 445-457): GPT-5 models support a `reasoning_effort` parameter for controlling computational intensity. GPT-5 Pro is special-cased to always use `'high'` effort (Line 452). The reasoning configuration includes `{ effort: effectiveEffort, summary: 'auto' }` to enable reasoning summaries.
   - **Verbosity control** (Lines 459-462): GPT-5 models support a `verbosity` parameter via `requestPayload.text = { verbosity }`.
   - **None reasoning effort support**: GPT-5.1 has a unique capability flag `supportsNoneReasoningEffort: true` (Line 23) that GPT-5.0 does not have (Line 46). This allows GPT-5.1 to use "none" as a reasoning effort value for faster responses.

4. **Model-Specific Capabilities**: Each GPT-5 variant defines its capabilities:
   - **Context Window**: All GPT-5 models have 400K context (Line 16)
   - **Max Output Tokens**: Standard GPT-5 models have 128K output (Line 17), GPT-5 Pro has 272K (Line 86)
   - **Temperature Support**: All GPT-5 models have `supportsTemperature: false` (Line 20)
   - **Streaming**: GPT-5 Pro has `supportsStreaming: false` (Line 87), others support streaming (Line 18)
   - **Web Search**: All GPT-5 models support web search via the `web_search_preview` tool (Line 21, Line 432-434)
   - **Responses API**: All use the Responses API format (Line 22)

**Historical Context from Git History:**

- **Original GPT-5 Addition** (commit fd64b27, Aug 7, 2025): Added the first GPT-5 model with 400K context, aliased as `gpt-5`
- **GPT-5.1 Addition** (commit 5dff5b4, Nov 17, 2025): Added `gpt-5.1` and moved the `gpt-5` alias from the old model to the new one. The old model was renamed to `gpt-5-2025-08-07` and given `gpt-5.0` aliases for backward compatibility.
- **None Reasoning Support** (commit d779239): Added `supportsNoneReasoningEffort: true` to GPT-5.1 for faster responses

This pattern shows OpenAI's versioning strategy: new point releases get the generic shorthand aliases, while older versions remain accessible via fully-qualified names and version-specific aliases.

### For GPT-5.2 Implementation: What Needs to Change

Since we're replacing GPT-5.1 entirely with GPT-5.2, here's what needs to happen:

**1. Replace GPT-5.1 Model Entry (Lines 12-35)**

Transform the existing `gpt-5.1` entry into `gpt-5.2`:
- Change the key from `'gpt-5.1'` to `'gpt-5.2'`
- Update `modelName` from `'gpt-5.1'` to `'gpt-5.2'`
- Update `friendlyName` from `'OpenAI (GPT-5.1)'` to `'OpenAI (GPT-5.2)'`
- Keep all capability flags unchanged (they're identical)
- Update aliases:
  - Keep: `'gpt-5'`, `'gpt5'`, `'gpt 5'`
  - Replace: `'gpt-5.1-2025-11-13'` → `'gpt-5.2-2025-12-11'`
  - Replace: `'gpt5.1'` → `'gpt5.2'`
  - Replace: `'gpt 5.1'` → `'gpt 5.2'`

**2. Keep GPT-5.0 Unchanged (Lines 36-51)**

The `gpt-5-2025-08-07` model remains unchanged as it already uses version-specific aliases (`gpt-5.0`, etc.).

**3. Variant Support Note**

GPT-5.2 variants (Instant, Thinking, Pro) use the same base model with different `reasoning_effort` parameters. The existing architecture already supports this, so no additional model entries needed.

**4. No Changes Required to Request Logic**

The existing request construction logic (Lines 409-500) automatically handles GPT-5.2 because it uses `resolvedModel.startsWith('gpt-5')` checks.

**5. Testing Updates Required**

Update any tests that reference `gpt-5.1`:
- `tests/unit/providers/openai.test.js`: Update model config tests
- `tests/tools/model-mapping.test.js`: Update alias resolution tests

After implementation, verify:
- `openaiProvider.getModelConfig('gpt-5')` returns GPT-5.2 config
- `openaiProvider.getModelConfig('gpt-5.1')` returns `null` (removed)
- `openaiProvider.getModelConfig('gpt-5.2')` returns GPT-5.2 config
- `resolveModelName('gpt-5')` returns `'gpt-5.2'`

### Technical Reference Details

#### Model Entry Structure (Based on GPT-5.1 Example)

```javascript
'gpt-5.2': {
  modelName: 'gpt-5.2',
  friendlyName: 'OpenAI (GPT-5.2)',
  contextWindow: 400000,
  maxOutputTokens: 128000,
  supportsStreaming: true,
  supportsImages: true,
  supportsTemperature: false,
  supportsWebSearch: true,
  supportsResponsesAPI: true,
  supportsNoneReasoningEffort: true,
  timeout: 3600000,
  description: 'Latest flagship model (400K context, 128K output) - Superior reasoning, code generation, analysis. Supports "none" reasoning for faster responses',
  aliases: [
    'gpt-5',        // MOVED from gpt-5.1
    'gpt5',         // MOVED from gpt-5.1
    'gpt 5',        // MOVED from gpt-5.1
    'gpt-5.2-2025-12-11',  // NEW: Fully qualified name
    'gpt5.2',       // NEW: No-dash variant
    'gpt 5.2',      // NEW: Spaced variant
  ],
}
```

#### File Locations

- **Primary implementation**: `C:\Users\Juugo\Documents\Projects\converse\src\providers\openai.js` (Lines 12-208 for `SUPPORTED_MODELS`)
- **Model resolution logic**: `C:\Users\Juugo\Documents\Projects\converse\src\providers\openai.js` (Lines 225-248)
- **Provider registration**: `C:\Users\Juugo\Documents\Projects\converse\src\providers\index.js` (exports openaiProvider)
- **Unit tests**: `C:\Users\Juugo\Documents\Projects\converse\tests\unit\providers\openai.test.js`
- **Integration tests**: `C:\Users\Juugo\Documents\Projects\converse\tests\integration\providers\openai\openai-api.test.js`
- **Model mapping tests**: `C:\Users\Juugo\Documents\Projects\converse\tests\tools\model-mapping.test.js`
- **Documentation**: `C:\Users\Juugo\Documents\Projects\converse\docs\PROVIDERS.md`, `C:\Users\Juugo\Documents\Projects\converse\docs\API.md`

#### Configuration Requirements

No environment variable changes required. The model configuration is code-based, not config-file based. Users will automatically have access to GPT-5.2 once the code is deployed, assuming they have a valid `OPENAI_API_KEY` configured.

#### Related Patterns from Similar Changes

Looking at how GPT-5.1 was added (commit 5dff5b4):
1. Added new model entry with the dated model ID
2. Moved generic aliases from old model to new model
3. Kept old model accessible with version-specific aliases
4. No changes to request construction logic were needed
5. Description emphasized it's the "latest" version

The same pattern should be followed for GPT-5.2.
<!-- DESIGN:END -->

## TODO
<!-- TODO:BEGIN -->
- [ ] Replace `gpt-5.1` model entry with `gpt-5.2` in `src/providers/openai.js`
- [ ] Update aliases from 5.1 to 5.2 versions
- [ ] Update tests that reference `gpt-5.1` to use `gpt-5.2`
- [ ] Run test suite to verify all tests pass
- [ ] Manually test GPT-5.2 invocation via chat tool
<!-- TODO:END -->

## Notes
<!-- NOTES:BEGIN -->
**Research Findings (2025-12-12):**

GPT-5.2 was released December 11, 2025 with these key characteristics:
- Model ID: `gpt-5.2-2025-12-11`
- 38% fewer errors, 30% fewer hallucinations vs GPT-5.1
- Same context window (400K) and output limits (128K) as GPT-5.1
- Variants (Instant, Thinking, Pro) appear to use the same base model with different parameters
- GPT-5.1 will be sunset ~March 2026 (3 months from release)
- No breaking API changes - uses same Responses API format
- Pricing: $1.75/$14 per million tokens (40% increase over GPT-5.1)

**Decision:** Replace GPT-5.1 entirely with GPT-5.2 rather than keeping both, since GPT-5.1 is being deprecated soon.

**Relevant Documentation:**
- docs/API.md - Model configuration documentation
- docs/ARCHITECTURE.md - Provider system architecture

**Related Tasks:**
- task-006-remove-outdated-models - Previous model cleanup task (completed)
<!-- NOTES:END -->
