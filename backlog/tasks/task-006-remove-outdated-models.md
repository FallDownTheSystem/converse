---
id: task-006-remove-outdated-models
title: Remove Outdated AI Provider Models
status: "Done"
created_date: '2025-11-26 18:54'
updated_date: '2025-11-26 19:12'
parent: null
subtasks: []
dependencies: []
---

## Description
<!-- DESCRIPTION:BEGIN -->
Clean up outdated and deprecated AI models from the provider implementations. The codebase has accumulated models that are either deprecated, superseded by newer versions, or already retired by their providers. This task removes these outdated models to prevent API errors and maintain code quality. Specifically, we need to remove 8 models across three providers (OpenAI, Google, and Anthropic), update any aliases pointing to these models, and update documentation and tests accordingly.

The most critical item is removing `claude-3-5-sonnet-20241022` which was already retired on October 28, 2025, and will cause API errors if used. Other models are deprecated with upcoming retirement dates or have been superseded by newer, more capable versions.
<!-- DESCRIPTION:END -->

## Specification
<!-- SPECIFICATION:BEGIN -->
### Models to REMOVE

#### OpenAI Provider (src/providers/openai.js)
| Model | Reason | Replacement |
|-------|--------|-------------|
| `gpt-4o` | Superseded by GPT-4.1 family | `gpt-4.1-2025-04-14` |
| `gpt-4o-mini` | Superseded by GPT-4.1 family | `gpt-4.1-2025-04-14` or add `gpt-4.1-mini` |
| `o3-mini` | Superseded by o4-mini | `o4-mini` |

#### Google Provider (src/providers/google.js)
| Model | Reason | Replacement |
|-------|--------|-------------|
| `gemini-2.0-flash` | Deprecated - shutdown Feb 2026 | `gemini-2.5-flash` |
| `gemini-2.0-flash-lite` | Deprecated - shutdown Feb 2026 | `gemini-2.5-flash-lite` |

#### Anthropic Provider (src/providers/anthropic.js)
| Model | Reason | Replacement |
|-------|--------|-------------|
| `claude-3-5-sonnet-20241022` | **ALREADY RETIRED** Oct 28, 2025 | `claude-sonnet-4-5-20250929` |
| `claude-3-7-sonnet-20250219` | Deprecated - retiring Feb 19, 2026 | `claude-sonnet-4-5-20250929` |
| `claude-3-5-haiku-20241022` | Superseded by Claude Haiku 4.5 | `claude-haiku-4-5-20251001` |

### Models to KEEP

#### OpenAI (11 models after cleanup)
- `gpt-5.1` - Current flagship
- `gpt-5-2025-08-07` - Previous GPT-5.0
- `gpt-5-mini` - Cost-efficient
- `gpt-5-nano` - Fastest
- `gpt-5-pro` - Premium reasoning
- `o3` - Reasoning model
- `o3-pro-2025-06-10` - Premium reasoning
- `o4-mini` - Fast reasoning
- `gpt-4.1-2025-04-14` - 1M context
- `o3-deep-research-2025-06-26` - Deep research
- `o4-mini-deep-research-2025-06-26` - Fast deep research

#### Google (4 models after cleanup)
- `gemini-2.5-flash` - Fast model
- `gemini-2.5-flash-lite` - Lightweight
- `gemini-2.5-pro` - Pro reasoning
- `gemini-3-pro-preview` - Latest preview

#### XAI (4 models - no changes)
- `grok-4-0709` - Main Grok 4
- `grok-4-fast-reasoning` - 2M context reasoning
- `grok-4-fast-non-reasoning` - 2M context fast
- `grok-code-fast-1` - Coding specialist

#### Anthropic (5 models after cleanup)
- `claude-opus-4-5-20251101` - Latest flagship
- `claude-opus-4-1-20250805` - Previous flagship
- `claude-sonnet-4-5-20250929` - Recommended
- `claude-sonnet-4-20250514` - Previous Sonnet
- `claude-haiku-4-5-20251001` - Fast model

### Optional: Models MISSING (enhancement consideration)

#### OpenAI
- `gpt-4.1-mini` - Faster GPT-4.1 variant
- `gpt-4.1-nano` - Fastest GPT-4.1 variant

#### XAI
- `grok-3` - Budget option (131K context)
- `grok-3-mini` - Most cost-effective ($0.30/$0.50)
- `grok-4.1` series (thinking/non-thinking variants if different from current models)

### Files to Update
- `src/providers/openai.js` - Remove 3 models
- `src/providers/google.js` - Remove 2 models
- `src/providers/anthropic.js` - Remove 3 models
- `tests/` - Update test files referencing removed models
- `docs/PROVIDERS.md` - Update documentation
- `docs/API.md` - Update model lists

### Acceptance Criteria
- [ ] Remove 8 deprecated models from provider files
- [ ] Update model aliases to point to replacement models (if any aliases reference removed models)
- [ ] Search and update all tests referencing removed models
- [ ] Update `docs/PROVIDERS.md` with current model lists
- [ ] Update `docs/API.md` with current model lists
- [ ] All tests pass after changes (`pnpm test`)
- [ ] No broken references to removed models in codebase
- [ ] Quality checks pass (`pnpm run validate`)
<!-- SPECIFICATION:END -->

## Design
<!-- DESIGN:BEGIN -->
**Architecture Approach:**
The provider implementations use a clean pattern where models are defined in a `SUPPORTED_MODELS` object. Each model entry contains:
- `modelName` - API model identifier
- `friendlyName` - Display name
- `aliases` - Alternative names for the model
- Feature flags (streaming, images, temperature, web search, thinking)

Removing models is straightforward:
1. Delete the model entry from the `SUPPORTED_MODELS` object
2. Update any aliases that pointed to the removed model
3. Update tests that reference the removed model
4. Update documentation

**Key Files:**
- `src/providers/openai.js:12-253` - OpenAI model definitions
- `src/providers/google.js:12-148` - Google model definitions
- `src/providers/anthropic.js:15-209` - Anthropic model definitions
- `tests/` - Test files that may reference models
- `docs/PROVIDERS.md` - Provider documentation
- `docs/API.md` - API documentation with model lists

**Patterns to Follow:**
- Use `pnpm` for all package management operations (NOT npm)
- Run `pnpm run validate` before and after changes
- Follow existing code style and formatting
- Update tests to use replacement models where needed
- Maintain consistency across all provider files

**Dependencies:**
- No external dependencies required
- Task is self-contained within provider files
- Must use existing test suite to verify changes

**Context Manifest:**
[Added by context-gathering agent - comprehensive codebase context for implementation]
<!-- DESIGN:END -->

## TODO
<!-- TODO:BEGIN -->
- [ ] Remove `gpt-4o`, `gpt-4o-mini`, `o3-mini` from OpenAI provider (`src/providers/openai.js`)
- [ ] Remove `gemini-2.0-flash`, `gemini-2.0-flash-lite` from Google provider (`src/providers/google.js`)
- [ ] Remove `claude-3-5-sonnet-20241022`, `claude-3-7-sonnet-20250219`, `claude-3-5-haiku-20241022` from Anthropic provider (`src/providers/anthropic.js`)
- [ ] Search for and update any aliases that pointed to removed models
- [ ] Search for test files referencing removed models and update them
- [ ] Update `docs/PROVIDERS.md` with current model lists
- [ ] Update `docs/API.md` with current model lists
- [ ] Run full test suite to verify no broken references (`pnpm test`)
- [ ] Run quality checks to ensure code quality (`pnpm run validate`)
- [ ] (Optional) Consider adding missing models: `gpt-4.1-mini`, `gpt-4.1-nano`, `grok-3`, `grok-3-mini`
<!-- TODO:END -->

## Notes
<!-- NOTES:BEGIN -->
### Implementation Priority
1. **CRITICAL**: Remove `claude-3-5-sonnet-20241022` - Already retired on Oct 28, 2025, will cause API errors
2. **HIGH**: Remove other deprecated models before their retirement dates
3. **LOW**: Add missing budget models (optional enhancement)

### Related Documentation
- OpenAI Deprecations: https://platform.openai.com/docs/deprecations
- Google Model Deprecations: https://ai.google.dev/gemini-api/docs/models
- Anthropic Model Deprecations: https://docs.anthropic.com/en/docs/about-claude/model-deprecations

### Code-Specific Analysis
No model-specific logic was found in the codebase. The provider implementations use a clean abstraction where models are simply entries in the `SUPPORTED_MODELS` object. This means removal is safe and won't break any model-specific code paths.

### Testing Notes
After removing models, pay special attention to:
- Tests that may hardcode model names
- Tests that iterate over available models
- Documentation examples that reference specific models
- Any configuration files with default model settings
<!-- NOTES:END -->
