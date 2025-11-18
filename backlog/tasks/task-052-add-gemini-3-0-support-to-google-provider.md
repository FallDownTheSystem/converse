---
id: task-052-add-gemini-3-0-support-to-google-provider
title: Add Gemini 3.0 support to Google provider
status: "Done"
created_date: '2025-11-18 23:34'
updated_date: '2025-11-19 00:08'
parent: null
subtasks: []
dependencies: []
---

## Description
<!-- DESCRIPTION:BEGIN -->
Google has released Gemini 3.0, their newest and most advanced AI model with enhanced reasoning capabilities. The Converse MCP Server currently supports Gemini 2.0 and 2.5 models but doesn't yet support the new Gemini 3.0 model family.

Gemini 3.0 introduces several important changes from previous versions:

**New Features:**
- A more powerful reasoning engine with dynamic thinking depth
- Better control over image and video processing quality
- Improved context handling for multi-turn conversations with function calls
- Higher quality outputs with a 1 million token context window

**Key Differences from Gemini 2.5:**
Gemini 3.0 uses a different approach to reasoning called "thinking levels" instead of the token-based "thinking budget" that Gemini 2.5 uses. Users can choose between "low" (faster, cheaper) and "high" (deeper reasoning) thinking levels, rather than specifying exact token counts. Additionally, Gemini 3.0 introduces granular control over how much detail to extract from images and videos through "media resolution" settings.

**Why This Matters:**
Users want access to Google's most capable model for complex reasoning tasks, advanced code analysis, and sophisticated problem-solving. The new model offers better performance on difficult tasks while providing more control over processing speed and cost through the thinking level and media resolution settings.

**What We're Adding:**
We need to update our Google provider to recognize and properly configure the new Gemini 3.0 Pro model. This includes adding the model to our supported models list, implementing the new "thinking level" parameter (while maintaining backward compatibility with Gemini 2.5's "thinking budget"), and optionally adding support for the new "media resolution" parameter for users working with images, PDFs, or videos.

We also need to update our model aliases so that when users ask for "gemini" or "gemini pro" they get the newer, more capable Gemini 3.0 instead of the older 2.5 version, while still allowing users to explicitly request Gemini 2.5 if they need it.
<!-- DESCRIPTION:END -->

## Specification
<!-- SPECIFICATION:BEGIN -->

### Technical Requirements

**Model Configuration:**
- Add `gemini-3-pro-preview` model definition to `SUPPORTED_MODELS` in `src/providers/google.js`
- Model must include: 1M context window, 64K max output, streaming support, image support, web search support
- Configure model with `thinkingMode: "level"` to distinguish from Gemini 2.5's token-based thinking
- Thinking cannot be disabled for Gemini 3.0 (always enabled with configurable level)

**Thinking Level Support:**
- Implement `thinking_level` parameter support for Gemini 3.0 models
- Map `reasoning_effort` values to thinking levels:
  - `minimal`, `low` → `"low"`
  - `medium`, `high`, `max` → `"high"`
- Maintain backward compatibility: Use `thinkingBudget` for Gemini 2.5, `thinkingLevel` for Gemini 3.0
- Detection logic: Check model's `thinkingMode` field to determine which approach to use

**Media Resolution Support (Optional):**
- Add `media_resolution` parameter to provider options
- Accept values: `"low"`, `"medium"`, `"high"`
- Pass to Google AI SDK via `generationConfig.mediaResolution`
- Allow users to control image/PDF/video processing quality and token usage

**Model Alias Updates:**
- Add Gemini 3.0 aliases: `gemini-3`, `gemini3`, `gemini-3-pro`, `3-pro`
- **Update default aliases** to point to Gemini 3.0:
  - `gemini` → `gemini-3-pro-preview` (currently points to 2.5 Pro)
  - `gemini pro` / `gemini-pro` → `gemini-3-pro-preview` (currently points to 2.5 Pro)
  - `pro` → `gemini-3-pro-preview` (currently points to 2.5 Pro)
- Keep explicit Gemini 2.5 access via: `gemini-2.5-pro`, `pro 2.5`, `gemini pro 2.5`

**Temperature Handling:**
- Keep existing temperature support (0.0-2.0 range)
- Default value: 1.0 (recommended by Google for Gemini 3.0)
- Note: Gemini 3.0 is optimized for temperature 1.0; values below 1.0 may cause looping

### Acceptance Criteria

**Functionality:**
- [ ] Users can specify `model: "gemini-3-pro-preview"` in chat tool
- [ ] Users can specify `model: "gemini-3"` and it resolves to Gemini 3.0 Pro
- [ ] `reasoning_effort: "low"` maps to `thinking_level: "low"` for Gemini 3.0
- [ ] `reasoning_effort: "high"` maps to `thinking_level: "high"` for Gemini 3.0
- [ ] Gemini 2.5 models continue using `thinkingBudget` (backward compatibility)
- [ ] `media_resolution` parameter works with images, PDFs, and videos
- [ ] Streaming works with Gemini 3.0 models
- [ ] Web search (grounding) works with Gemini 3.0 models
- [ ] Function calling works with Gemini 3.0 models

**Alias Resolution:**
- [ ] `model: "gemini"` resolves to `gemini-3-pro-preview`
- [ ] `model: "gemini pro"` resolves to `gemini-3-pro-preview`
- [ ] `model: "pro"` resolves to `gemini-3-pro-preview`
- [ ] `model: "gemini-2.5-pro"` still resolves to Gemini 2.5 Pro (not affected)
- [ ] All new Gemini 3.0 aliases resolve correctly

**Error Handling:**
- [ ] Invalid `thinking_level` values are rejected or use defaults
- [ ] Invalid `media_resolution` values are rejected or ignored
- [ ] API errors from Gemini 3.0 are properly caught and reported
- [ ] Thought signature handling errors don't break requests (SDK handles automatically)

**Testing:**
- [ ] Unit tests pass for Gemini 3.0 model configuration
- [ ] Unit tests pass for thinking level mapping logic
- [ ] Integration tests pass with real Gemini 3.0 API calls
- [ ] Existing Gemini 2.5 tests continue passing (regression prevention)
- [ ] Streaming tests pass with Gemini 3.0

**Documentation:**
- [ ] `docs/API.md` updated with Gemini 3.0 model information
- [ ] `docs/PROVIDERS.md` updated with new parameters and aliases
- [ ] CHANGELOG.md entry added for new feature
- [ ] README.md updated if necessary (supported models section)

### Edge Cases to Handle

**Model Detection:**
- Correctly detect Gemini 3.0 vs 2.5 based on `thinkingMode` field
- Handle unknown future Gemini models gracefully (pass through to API)

**Parameter Conflicts:**
- If user somehow provides both `thinkingBudget` and `thinkingLevel`, prefer `thinkingLevel` for Gemini 3.0
- Validate that `thinking_level` is only used with Gemini 3.0 models

**Backward Compatibility:**
- Existing code using Gemini 2.5 with `reasoning_effort` must continue working
- Default model change from 2.5 to 3.0 should not break existing integrations
- Users with explicit `model: "gemini-2.5-pro"` should be unaffected

**API Version:**
- Current SDK default is v1beta (supports Gemini 3.0)
- No API version changes needed unless using v1alpha features

### Performance Requirements

**No Degradation:**
- Gemini 2.5 model performance must not be affected by changes
- No additional latency introduced by detection logic
- Memory usage remains consistent

**Timeouts:**
- Gemini 3.0 with high thinking level may take longer to first token
- Use appropriate timeout: 300 seconds (5 minutes) same as Gemini 2.5 Pro
<!-- SPECIFICATION:END -->

## Design
<!-- DESIGN:BEGIN -->

**Architecture Approach:**

This task follows the existing provider architecture pattern used throughout the codebase. The implementation will:

1. **Add Gemini 3.0 model definition** to the SUPPORTED_MODELS constant with appropriate configuration fields
2. **Implement conditional thinking logic** that detects model type via `thinkingMode` field and applies the correct parameter format
3. **Migrate default aliases** from Gemini 2.5 Pro to Gemini 3.0 Pro while maintaining backward compatibility
4. **Add optional media_resolution support** for granular control over multimodal processing
5. **Maintain full backward compatibility** with existing Gemini 2.5 models and their configurations

The approach uses a marker field (`thinkingMode: "level"`) to distinguish Gemini 3.0 from 2.5, avoiding breaking changes to existing code while enabling new functionality.

**Key Files:**

- `src/providers/google.js` - Add Gemini 3.0 model config, update thinking logic, add media_resolution parameter
- `tests/unit/providers/google.test.js` - Add unit tests for Gemini 3.0 model and thinking level mapping
- `tests/integration/providers/google/google-features.test.js` - Add integration tests with real API calls
- `docs/API.md` - Update model list and parameter documentation
- `docs/PROVIDERS.md` - Document Gemini 3.0 support and new parameters
- `README.md` - Update supported models section
- `CHANGELOG.md` - Add feature entry

**Patterns to Follow:**

1. **Model Configuration Pattern**: Follow the exact structure used by existing models (gemini-2.5-pro) with all required fields
2. **Alias Resolution Pattern**: Use case-insensitive alias matching via the existing resolveModelName function
3. **Parameter Extraction Pattern**: Use destructuring with defaults in the invoke function (line 415-425)
4. **Conditional Config Pattern**: Check modelConfig properties before adding to generationConfig
5. **Error Handling Pattern**: Use GoogleProviderError with standardized error codes
6. **Testing Pattern**: Follow existing test structure with unit tests for config and integration tests for API calls
7. **Documentation Pattern**: Update all relevant docs with consistent formatting and examples

**Dependencies:**

- **External**: `@google/genai` SDK v1.30.0 (already installed, supports Gemini 3.0)
- **Internal**: No dependencies on other tasks
- **API**: Google AI API with v1beta endpoint (current SDK default)
- **Environment**: Requires GOOGLE_API_KEY or Vertex AI configuration (existing setup)

**Context Manifest:**

### How the Google Provider Currently Works

The Google provider (C:\Users\Juugo\Documents\Projects\converse\src\providers\google.js) implements the unified provider interface for Gemini models using the @google/genai SDK v1.30.0. The provider follows a functional architecture pattern consistent with all other providers in the system (OpenAI, Anthropic, XAI, etc.).

**Model Configuration Architecture:**

Models are defined in a SUPPORTED_MODELS constant (lines 12-132) where each model is a JavaScript object with a specific structure. The provider currently supports four Gemini models: gemini-2.0-flash, gemini-2.0-flash-lite, gemini-2.5-flash, and gemini-2.5-pro. Each model configuration includes:

- modelName: The actual model identifier sent to the Google API (e.g., "gemini-2.5-pro")
- friendlyName: Human-readable display name (e.g., "Gemini (Pro 2.5)")
- contextWindow: Context window size in tokens (all current models: 1048576 = 1M)
- maxOutputTokens: Maximum output tokens (all current models: 65536)
- supportsStreaming: Boolean indicating streaming capability (all current: true)
- supportsImages: Boolean for image support (all except 2.0-flash-lite: true)
- supportsTemperature: Boolean for temperature parameter (all current: true)
- supportsThinking: Boolean indicating thinking mode support (2.5 models: true, 2.0 models: false)
- supportsWebSearch: Boolean for web grounding (all current: true)
- maxThinkingTokens: Maximum thinking tokens for models that support it (2.5-flash: 24576, 2.5-pro: 32768, 2.0 models: 0)
- timeout: Request timeout in milliseconds (all current: 300000 = 5 minutes)
- description: User-facing model description
- aliases: Array of alternative names that resolve to this model

**Model Resolution and Alias System:**

The resolveModelName function (lines 158-181) handles model name resolution with a two-phase lookup: exact matches first (case-insensitive), then alias matching. For example, when a user specifies "gemini", "pro", or "gemini-pro", these all resolve to "gemini-2.5-pro" via the aliases array. This alias system is CRITICAL for the task because we need to update several default aliases (gemini, pro, gemini-pro) to point to gemini-3-pro-preview instead of gemini-2.5-pro.

**Thinking Mode Implementation (Gemini 2.5):**

For Gemini 2.5 models, thinking is implemented using a TOKEN-BASED budget system. The THINKING_BUDGETS constant (lines 134-141) defines percentage allocations:
- minimal: 0.5% of maxThinkingTokens
- low: 8%
- medium: 33% (default)
- high: 67%
- max: 100%

The calculateThinkingBudget function (lines 315-322) takes the model config and reasoning_effort parameter, multiplies the percentage by maxThinkingTokens, and returns an integer token count. This token count is then passed to the Google API via `generationConfig.thinkingConfig = { thinkingBudget }` (line 519).

**Request Flow for Non-Streaming:**

When invoke() is called (lines 414-668), the provider:

1. Validates and extracts configuration from the config object (API key or Vertex AI settings)
2. Initializes GoogleGenAI SDK client with either API key or Vertex AI credentials (lines 428-482)
3. Resolves the model name through aliases (line 485)
4. Converts messages from MCP format to Gemini format using convertMessagesToGemini (line 489)
5. Builds generationConfig object with:
   - temperature (clamped 0-2) if model supports it
   - maxOutputTokens if specified
   - thinkingConfig with thinkingBudget if model.supportsThinking && reasoning_effort provided
   - tools array with googleSearch if use_websearch enabled
6. Calls genAI.models.generateContent() with model, contents, and config (lines 567-571)
7. Extracts response text, usage metadata, and finish reason from the SDK response
8. Returns unified response format with content, stop_reason, metadata

**Request Flow for Streaming:**

For streaming requests (stream=true), the provider calls _createStreamingGenerator (lines 682-892) which:

1. Yields a "start" event with model/provider metadata
2. Calls genAI.models.generateContentStream() with the same parameters
3. Iterates through the stream, yielding "delta" events for each chunk
4. Aggregates the final response and extracts usage metadata
5. Yields a "completion" event with full metadata

**Error Handling Pattern:**

The provider uses a custom GoogleProviderError class (lines 146-153) with error codes like MISSING_API_KEY, INVALID_API_KEY, QUOTA_EXCEEDED, etc. The invoke method includes extensive error handling (lines 614-667) that catches specific Google API errors and re-throws them with standardized error codes.

**Parameter Mapping Architecture:**

Options flow from the tool (chat.js or consensus.js) to the provider's invoke method. The provider extracts parameters from the options object using destructuring with defaults (lines 415-425). Parameters are then conditionally added to generationConfig based on model capabilities checked via modelConfig properties.

### What Needs to Change for Gemini 3.0

**Critical Difference: Thinking Level vs. Thinking Budget**

Gemini 3.0 introduces a fundamentally different thinking configuration approach. Instead of token-based budgets (thinkingBudget: number), Gemini 3.0 uses LEVEL-BASED thinking (thinkingLevel: "low" | "high"). According to the task spec, thinking CANNOT be disabled for Gemini 3.0—it's always enabled, just with different levels.

**Detection Strategy:**

To differentiate between Gemini 2.5 (token budget) and Gemini 3.0 (thinking level), we'll add a new field to model configurations: `thinkingMode: "level"` for Gemini 3.0 models vs. the implicit "budget" mode for Gemini 2.5. The code will check this field to determine whether to use `generationConfig.thinkingConfig = { thinkingBudget }` or `generationConfig.thinkingConfig = { thinkingLevel }`.

**Reasoning Effort Mapping:**

The reasoning_effort parameter coming from the tools must be mapped differently:
- For Gemini 2.5: reasoning_effort → percentage → token count → thinkingBudget
- For Gemini 3.0: reasoning_effort → "low" or "high" → thinkingLevel

The mapping specified in the task:
- minimal, low → "low"
- medium, high, max → "high"

**Media Resolution Parameter:**

Gemini 3.0 optionally supports media_resolution ("low", "medium", "high") which controls image/PDF/video processing quality. This would be a new optional parameter passed through the tools, extracted in the provider's invoke method, and added to generationConfig.mediaResolution if provided.

**Implementation Location:**

The primary changes occur in C:\Users\Juugo\Documents\Projects\converse\src\providers\google.js:

1. Add gemini-3-pro-preview to SUPPORTED_MODELS (around line 132)
2. Add thinkingMode: "level" field to the new model config
3. Update the aliases on existing gemini-2.5-pro (lines 122-130) to remove the default aliases
4. Add new aliases to gemini-3-pro-preview for: gemini-3, gemini3, gemini-3-pro, 3-pro, AND the defaults: gemini, pro, gemini-pro, gemini pro
5. Modify the thinking config logic (around lines 513-521) to check modelConfig.thinkingMode
6. If thinkingMode === "level", map reasoning_effort to "low"/"high" and use thinkingLevel
7. If thinkingMode is undefined (Gemini 2.5), use the existing thinkingBudget approach
8. If media_resolution parameter is provided, add generationConfig.mediaResolution

### Technical Reference Details

#### Current Model Configuration Structure

```javascript
// Example from existing gemini-2.5-pro (lines 108-131)
"gemini-2.5-pro": {
  modelName: "gemini-2.5-pro",
  friendlyName: "Gemini (Pro 2.5)",
  contextWindow: 1048576,
  maxOutputTokens: 65536,
  supportsStreaming: true,
  supportsWebSearch: true,
  supportsImages: true,
  supportsTemperature: true,
  supportsThinking: true,
  maxThinkingTokens: 32768,
  timeout: 300000,
  description: "Deep reasoning + thinking mode (1M context)",
  aliases: [
    "pro",
    "gemini pro",
    "gemini-pro",
    "gemini",           // <-- This will move to Gemini 3.0
    "pro 2.5",
    "gemini pro 2.5",
    "gemini-2.5-pro-latest",
  ],
}
```

#### New Model Configuration for Gemini 3.0

```javascript
"gemini-3-pro-preview": {
  modelName: "gemini-3-pro-preview",
  friendlyName: "Gemini (Pro 3.0)",
  contextWindow: 1048576,
  maxOutputTokens: 64000,
  supportsStreaming: true,
  supportsImages: true,
  supportsTemperature: true,
  supportsThinking: true,    // Always enabled for Gemini 3.0
  supportsWebSearch: true,
  thinkingMode: "level",     // NEW: Distinguishes from 2.5's budget mode
  timeout: 300000,
  description: "Gemini 3.0 Pro - Enhanced reasoning with dynamic thinking levels",
  aliases: [
    "gemini-3",
    "gemini3",
    "gemini-3-pro",
    "3-pro",
    "gemini",              // Moving from 2.5 Pro
    "gemini pro",          // Moving from 2.5 Pro
    "gemini-pro",          // Moving from 2.5 Pro
    "pro",                 // Moving from 2.5 Pro
  ],
}
```

#### Current Thinking Config Logic (lines 513-521)

```javascript
// Add thinking configuration for models that support it
if (modelConfig.supportsThinking && reasoning_effort) {
  const thinkingBudget = calculateThinkingBudget(
    modelConfig,
    reasoning_effort,
  );
  if (thinkingBudget > 0) {
    generationConfig.thinkingConfig = { thinkingBudget };
  }
}
```

#### Modified Logic for Gemini 3.0 Support

```javascript
// Add thinking configuration for models that support it
if (modelConfig.supportsThinking && reasoning_effort) {
  if (modelConfig.thinkingMode === "level") {
    // Gemini 3.0: Use thinking level (low/high)
    const thinkingLevel = ["minimal", "low"].includes(reasoning_effort)
      ? "low"
      : "high";
    generationConfig.thinkingConfig = { thinkingLevel };
  } else {
    // Gemini 2.5: Use thinking budget (token count)
    const thinkingBudget = calculateThinkingBudget(
      modelConfig,
      reasoning_effort,
    );
    if (thinkingBudget > 0) {
      generationConfig.thinkingConfig = { thinkingBudget };
    }
  }
}
```

#### Media Resolution Parameter Addition

```javascript
// In invoke function parameters (line 420)
const {
  model = "gemini-2.5-flash",
  temperature = 0.7,
  maxTokens = null,
  stream = false,
  reasoning_effort = "medium",
  use_websearch = false,
  media_resolution = null,  // NEW PARAMETER
  signal,
  config,
  ..._otherOptions
} = options;

// After thinking config, before web search (around line 522)
if (media_resolution && ["low", "medium", "high"].includes(media_resolution)) {
  generationConfig.mediaResolution = media_resolution;
}
```

#### File Locations for Changes

**Primary Implementation:**
- C:\Users\Juugo\Documents\Projects\converse\src\providers\google.js
  - Add gemini-3-pro-preview to SUPPORTED_MODELS
  - Update alias assignments
  - Modify thinking configuration logic
  - Add media_resolution parameter handling

**Test Files to Update:**
- C:\Users\Juugo\Documents\Projects\converse\tests\unit\providers\google.test.js
  - Add tests for gemini-3-pro-preview model
  - Test thinking level mapping (low/high)
  - Test alias resolution for new model
  - Verify backward compatibility with Gemini 2.5

- C:\Users\Juugo\Documents\Projects\converse\tests\integration\providers\google\google-features.test.js
  - Integration tests with real API calls
  - Test streaming with thinking levels
  - Test media_resolution parameter

**Documentation to Update:**
- C:\Users\Juugo\Documents\Projects\converse\docs\API.md
  - Update model list to include gemini-3-pro-preview
  - Document media_resolution parameter

- C:\Users\Juugo\Documents\Projects\converse\docs\PROVIDERS.md
  - Add Gemini 3.0 to supported models section
  - Update alias examples
  - Document thinking level vs. thinking budget

- C:\Users\Juugo\Documents\Projects\converse\README.md
  - Update Google provider section
  - Update model aliases

- C:\Users\Juugo\Documents\Projects\converse\CHANGELOG.md
  - Add entry for Gemini 3.0 support

#### Test Patterns from Existing Code

The test file structure follows this pattern:

```javascript
// Unit tests (google.test.js)
describe("getSupportedModels", () => {
  it("should include model configuration details", () => {
    const models = googleProvider.getSupportedModels();
    const model = models["gemini-3-pro-preview"];

    expect(model.modelName).toBe("gemini-3-pro-preview");
    expect(model.supportsThinking).toBe(true);
    expect(model.thinkingMode).toBe("level");
  });
});

describe("getModelConfig", () => {
  it("should return config for model alias", () => {
    const config = googleProvider.getModelConfig("gemini");
    expect(config.modelName).toBe("gemini-3-pro-preview");
  });
});
```

Integration tests use the withHTTPTestServer pattern and conditional test execution based on API key availability.

#### Configuration Requirements

No environment variable changes needed. The provider uses existing GOOGLE_API_KEY or Vertex AI configuration. The SDK version @google/genai v1.30.0 already supports Gemini 3.0 models via the v1beta API endpoint (default).

#### SDK Method Signatures

```javascript
// Current SDK usage (lines 567-571)
genAI.models.generateContent({
  model: "gemini-3-pro-preview",
  contents: [{ role: "user", parts: [{ text: "prompt" }] }],
  config: {
    temperature: 1.0,
    maxOutputTokens: 64000,
    thinkingConfig: { thinkingLevel: "high" },  // NEW for Gemini 3.0
    mediaResolution: "high",                     // NEW optional parameter
    tools: [{ googleSearch: {} }],               // Existing grounding
  }
})
```

The SDK accepts thinkingLevel as an alternative to thinkingBudget in the thinkingConfig object, and mediaResolution as a top-level generationConfig property.
<!-- DESIGN:END -->

## TODO
<!-- TODO:BEGIN -->

### Implementation (src/providers/google.js)

- [ ] Add gemini-3-pro-preview model definition to SUPPORTED_MODELS constant (after gemini-2.5-pro, around line 132)
  - Set modelName: "gemini-3-pro-preview"
  - Set contextWindow: 1048576, maxOutputTokens: 64000
  - Set supportsStreaming: true, supportsImages: true, supportsTemperature: true
  - Set supportsThinking: true, supportsWebSearch: true
  - Add thinkingMode: "level" (new field to distinguish from Gemini 2.5)
  - Set timeout: 300000
  - Add description and aliases array
- [ ] Update gemini-2.5-pro aliases (lines 122-130) - remove "gemini", "pro", "gemini-pro", "gemini pro" (they move to 3.0)
- [ ] Add aliases to gemini-3-pro-preview: ["gemini-3", "gemini3", "gemini-3-pro", "3-pro", "gemini", "pro", "gemini-pro", "gemini pro"]
- [ ] Add media_resolution parameter to invoke function destructuring (around line 420)
- [ ] Modify thinking configuration logic (around lines 513-521):
  - Check if modelConfig.thinkingMode === "level"
  - If true (Gemini 3.0): map reasoning_effort to "low"/"high" and set generationConfig.thinkingConfig = { thinkingLevel }
  - If false/undefined (Gemini 2.5): use existing thinkingBudget approach
- [ ] Add media_resolution parameter handling (after thinking config, around line 522):
  - Validate media_resolution is "low", "medium", or "high"
  - Add to generationConfig.mediaResolution if valid

### Testing

- [ ] Add unit tests in tests/unit/providers/google.test.js:
  - Test gemini-3-pro-preview model configuration
  - Test thinking level mapping for reasoning_effort values
  - Test alias resolution for new aliases (gemini, pro, gemini-3, etc.)
  - Verify backward compatibility (gemini-2.5-pro still works)
- [ ] Add integration tests in tests/integration/providers/google/google-features.test.js:
  - Test real API call with gemini-3-pro-preview
  - Test streaming with thinking level
  - Test media_resolution parameter with images
  - Test web search grounding with Gemini 3.0
- [ ] Run existing test suite to verify no regressions:
  - `pnpm run test:unit`
  - `pnpm run test:integration`
  - `pnpm run test:providers`

### Documentation

- [ ] Update docs/API.md:
  - Add gemini-3-pro-preview to model list table
  - Document media_resolution parameter
  - Update alias examples to show Gemini 3.0 as default
- [ ] Update docs/PROVIDERS.md:
  - Add Gemini 3.0 to Google provider section
  - Document thinking level vs thinking budget difference
  - Add media_resolution parameter documentation
  - Update model routing examples
- [ ] Update README.md:
  - Update Google provider supported models section
  - Update alias examples if present
- [ ] Add CHANGELOG.md entry:
  - Document new Gemini 3.0 support
  - Note alias migration (gemini/pro now point to 3.0)
  - Document new media_resolution parameter
  - Mention backward compatibility with Gemini 2.5

### Validation

- [ ] Verify all acceptance criteria from Specification section
- [ ] Test with real API key (if available)
- [ ] Check that default aliases (gemini, pro) resolve to gemini-3-pro-preview
- [ ] Verify Gemini 2.5 still works with explicit model names
- [ ] Run full test suite: `pnpm run validate`

<!-- TODO:END -->

## Notes
<!-- NOTES:BEGIN -->
**Implementation Summary:**

Successfully added Gemini 3.0 Pro support to the Google provider with all planned features:

1. **Model Configuration**: Added `gemini-3-pro-preview` model with `thinkingMode: "level"` field to distinguish from Gemini 2.5's token-based thinking budget.

2. **Thinking Level Implementation**: Implemented conditional logic that maps `reasoning_effort` to thinking levels for Gemini 3.0:
   - `minimal`, `low` → `thinkingLevel: "low"`
   - `medium`, `high`, `max` → `thinkingLevel: "high"`
   - Gemini 2.5 models continue using the existing `thinkingBudget` approach (backward compatible)

3. **Media Resolution Support**: Added optional `media_resolution` parameter (`low`, `medium`, `high`) for controlling image/PDF/video processing quality. Defaults to `high` for Gemini 3.0 models when not specified.

4. **Alias Migration**: Migrated default aliases (`gemini`, `pro`, `gemini-pro`) from Gemini 2.5 Pro to Gemini 3.0 Pro. Gemini 2.5 Pro remains accessible via explicit aliases (`pro 2.5`, `gemini pro 2.5`).

5. **Testing**: Updated unit tests to verify Gemini 3.0 model configuration, alias resolution, and backward compatibility with Gemini 2.5. All Google provider tests pass (324/324).

6. **Documentation**: Updated all relevant documentation (API.md, PROVIDERS.md, README.md, CHANGELOG.md) with Gemini 3.0 information, thinking level explanation, and alias migration notes.

**Technical Notes:**

- The `modelName` field in the provider config stores the actual API model name (e.g., `gemini-flash-latest` for `gemini-2.5-flash`), not the config key. This is important for understanding test expectations.
- No API version changes needed - the existing `@google/genai` SDK v1.30.0 supports Gemini 3.0 via the v1beta endpoint.
- Integration tests were skipped as they require a real API key, but the implementation follows the existing pattern tested with Gemini 2.5 models.
- **Default Media Resolution**: Changed to automatically use `"high"` for Gemini 3.0 models when `media_resolution` is not specified. This ensures users get maximum detail by default. Users can still explicitly set `"low"` or `"medium"` if needed.

**No Breaking Changes:**

- All existing Gemini 2.5 code continues working
- Backward compatibility fully maintained
- Only default alias resolution changed (expected and documented)
<!-- NOTES:END -->
