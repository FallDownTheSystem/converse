---
id: task-005-auto-generate-help-documentation-from-code
title: Auto-Generate Help Documentation from Code
status: "Done"
created_date: '2025-11-26 18:48'
updated_date: '2025-11-26 19:27'
parent: null
subtasks: []
dependencies: []
---

## Description
<!-- DESCRIPTION:BEGIN -->
### The Problem

The Converse MCP Server has a help documentation system that provides users with information about available tools, parameters, and AI provider models. This documentation is exposed via:
1. An MCP resource at `converse://help` that users can read
2. A help prompt that can be filtered by topic (tools, models, providers, parameters, examples)

The current implementation already does a reasonable job of pulling data dynamically from the codebase - it reads tool definitions from the tools registry and provider models from each provider's `getSupportedModels()` function. However, several sections remain hardcoded and become stale over time:

1. **Model Selection Tips** - Recommendations like "Ultra-Fast: gpt-5-nano, flash, gemini-2.0-flash" don't update when models change or new ones are added
2. **Tool Examples** - Hardcoded JSON examples for `chat` and `consensus` tools; missing examples for `check_status` and `cancel_job`
3. **Environment Variables** - Hardcoded list that doesn't reflect the comprehensive `CONFIG_SCHEMA` in `config.js`, which has ~50 well-documented variables
4. **Missing Providers** - The help doesn't show Codex, Claude CLI, or Gemini CLI providers (special providers that don't require API keys)
5. **Configuration Tips** - Generic guidance that could be derived from actual parameter defaults and model capabilities

### The Solution

Refactor the help documentation system to derive as much information as possible from the actual code:

1. **Auto-generate environment variable documentation** from `CONFIG_SCHEMA` in `config.js` - each variable already has type, default, and description metadata
2. **Auto-generate tool examples** from tool `inputSchema` definitions - use required parameters and sensible defaults
3. **Auto-generate model selection tips** by querying model capabilities (context window, speed tier from timeout values, web search support, thinking mode)
4. **Include all providers** in documentation, including CLI-based providers (Codex, Claude, Gemini CLI)
5. **Auto-generate configuration tips** from parameter schemas (temperature ranges, reasoning effort options, etc.)

This ensures documentation stays accurate as the codebase evolves, reducing maintenance burden and improving user experience.
<!-- DESCRIPTION:END -->

## Specification
<!-- SPECIFICATION:BEGIN -->
### Technical Requirements

1. **Export CONFIG_SCHEMA from config.js**
   - Export the `CONFIG_SCHEMA` object so it can be imported by helpPrompt.js
   - No changes to schema structure needed - it's already well-organized with type, default, and description

2. **Create `generateEnvironmentVariablesSection()` function**
   - Import and iterate over CONFIG_SCHEMA
   - Group variables by category (server, transport, apiKeys, providers, mcp, summarization, async)
   - Use **compact one-liner format** to avoid overwhelming output:
     - `OPENAI_API_KEY` (Required, Secret): OpenAI API key
     - `HTTP_PORT` (Default: 3157): HTTP server port
   - **Sort variables alphabetically within each category** for deterministic output
   - Indicate which variables are required vs optional
   - Mark sensitive variables (API keys) with "Secret" tag

3. **Create `generateToolExamplesFromSchema()` function**
   - For each tool, extract `inputSchema.properties` and `required` fields
   - Use a **SAMPLE_VALUES lookup map** for common field names to generate realistic examples:
     ```javascript
     const SAMPLE_VALUES = {
       prompt: "Explain the authentication flow in this codebase",
       files: ["src/auth.js"],
       model: "auto",
       models: ["codex", "gemini", "claude"],
       continuation_id: "conv_abc123"
     };
     ```
   - Fall back to type-based defaults for fields not in the map
   - Include examples for ALL tools (chat, consensus, check_status, cancel_job)
   - **Note:** This is partial automation - sample values are curated, but structure comes from schema

4. **Create `generateModelCategories()` function** (renamed from generateModelSelectionTips)
   - Generate **factual categorization lists** without subjective recommendations
   - Categories to generate:
     - **Models by Context Window**: Group by size (1M+, 400K, 256K, 200K, <200K)
     - **Models with Web Search**: Filter by `supportsWebSearch: true`
     - **Models with Thinking Mode**: Filter by `supportsThinking: true`
     - **Models with Image Support**: Filter by `supportsImages: true`
   - **Sort models alphabetically within each category** for deterministic output
   - Format: `- model-name (provider) - context window size`
   - **No subjective tips** - just factual capability lists

5. **Include CLI-based providers in documentation**
   - Update `allModels` collection to include `codex`, `claude`, and `gemini-cli` providers
   - **Wrap provider calls in try/catch** - CLI providers may throw if not installed
   - Add notes about authentication requirements (ChatGPT login, `claude login`, Gemini OAuth)
   - Log warnings for providers that fail to load (don't crash help generation)

6. **Create `generateConfigurationTips()` function**
   - Extract parameter ranges from tool schemas (e.g., temperature min/max)
   - Extract enum values (e.g., reasoning_effort options) directly from schema
   - Generate guidance based on actual defaults and descriptions
   - If schema lacks min/max, omit range (don't guess)

### Acceptance Criteria

- [ ] Running help prompt shows ALL environment variables from CONFIG_SCHEMA (~50 variables)
- [ ] Running help prompt shows ALL 4 tools with auto-generated examples
- [ ] Model categories update automatically when provider models change
- [ ] All 10 providers appear in documentation (including codex, claude, gemini-cli)
- [ ] Configuration tips accurately reflect actual parameter schemas
- [ ] No hardcoded model names remain in categorization lists
- [ ] Output is deterministically ordered (sorted) for stable tests
- [ ] Documentation output format remains readable and well-organized
- [ ] Existing help prompt topic filtering still works (tools, models, providers, parameters, examples)
- [ ] Unit tests pass for new generation functions
- [ ] Help resource handler continues to work identically

### Edge Cases

- Providers with no models (e.g., disabled or misconfigured) should be gracefully handled
- Empty or invalid schemas should produce sensible fallback text
- Very long enum lists should be formatted readably (line breaks after 5 items)
- Providers requiring special auth (Codex, Claude CLI) should note requirements clearly
- **CLI providers that throw errors** should be caught and logged, not crash generation
- **OpenRouter dynamic models** - if enabled, limit to first 20 models to avoid huge output

### Performance Requirements

- Help generation should remain fast (<100ms) since it's called synchronously
- No network calls during help generation (all data from local code)
- `getSupportedModels()` must be synchronous for all providers (verify CLI providers)
<!-- SPECIFICATION:END -->

## Design
<!-- DESIGN:BEGIN -->
**Architecture Approach:**

The existing help generation follows a functional architecture pattern. The solution will extend this by:
1. Adding new generator functions that introspect code structures
2. Exporting existing data structures (CONFIG_SCHEMA) for reuse
3. Keeping the public API unchanged (`generateHelpContent`, `helpPromptHandler`)

**Key Files:**

**Files to Modify:**
- `src/config.js` (line ~39) - Export the existing `CONFIG_SCHEMA` constant
- `src/prompts/helpPrompt.js` - Main refactoring:
  - Import `CONFIG_SCHEMA` from config.js
  - Add `SAMPLE_VALUES` constant for tool example generation
  - Add `generateEnvironmentVariablesSection()` function (~lines 208-233 replacement)
  - Add `generateToolExamplesFromSchema()` to replace hardcoded `formatToolExample()` (~lines 83-106)
  - Add `generateModelCategories()` to replace hardcoded tips with factual lists (~lines 138-159)
  - Add `generateConfigurationTips()` to replace hardcoded configuration section (~lines 160-186)
  - Update `allModels` collection to include codex, claude, gemini-cli with try/catch (~lines 18-26)

**Test Files to Update:**
- `tests/prompts/help.test.js` - Add tests for new generator functions
- `tests/resources/helpResource.test.js` - May need minor updates if output format changes

**Patterns to Follow:**

1. **Functional generator pattern** (from existing `formatProviderModels`, `formatToolParameters`):
   - Pure functions that take data and return formatted strings
   - No side effects or external calls
   - Return empty string for missing/invalid data

2. **Provider introspection pattern** (from existing code at lines 18-26):
   ```javascript
   const allModels = {
     openai: providers.openai?.getSupportedModels() || {},
     // ... add more providers
   };
   ```

3. **Schema extraction pattern** (from existing `formatToolParameters`):
   ```javascript
   const { properties, required = [] } = inputSchema;
   for (const [name, prop] of Object.entries(properties)) {
     // Generate documentation from schema
   }
   ```

**Dependencies:**

- No new external dependencies required
- Internal dependency on `CONFIG_SCHEMA` export from config.js

**Context Manifest:**

### How the Help Documentation System Currently Works

When a user requests help documentation (either via the `converse://help` MCP resource or the help prompt with optional topic filtering), the system generates comprehensive documentation about the Converse MCP Server's tools, providers, models, and configuration. The entry points are:

**Entry Point 1 - MCP Resource** (`C:\Users\Juugo\Documents\Projects\converse\src\resources\helpResource.js`): The `helpResourceHandler()` function (lines 46-62) calls `generateHelpContent(config)` from helpPrompt.js, then appends server version information from package.json. This exposes the documentation at `converse://help` for MCP clients to read.

**Entry Point 2 - MCP Prompt** (`C:\Users\Juugo\Documents\Projects\converse\src\prompts\helpPrompt.js`): The `helpPromptHandler(args, config)` function (lines 249-311) generates full help or topic-specific help (tools, models, providers, parameters, examples) by calling `generateHelpContent(config)` and then extracting specific sections via regex matching.

**The Core Generation Flow** (`generateHelpContent` function at lines 14-242):

1. **Provider Introspection** (lines 15-26): Calls `getProviders()` from the provider registry, then collects all models by calling `getSupportedModels()` on each provider. Currently only includes 7 providers (openai, google, xai, anthropic, mistral, deepseek, openrouter) - notably missing `codex`, `claude`, and `gemini-cli` which are CLI-based providers that don't require API keys.

2. **Tool Documentation** (lines 61-119): Calls `getTools(config)` from the tool registry to get all 4 tools (chat, consensus, check_status, cancel_job). For each tool:
   - Extracts the `description` property attached to the tool function
   - Calls `formatToolParameters(inputSchema)` (lines 63-81) to introspect the tool's `inputSchema.properties` and generate parameter documentation with type, description, required/optional status, and default values
   - Calls `formatToolExample(toolName)` (lines 83-106) which returns **hardcoded** JSON examples - only for `chat` and `consensus`, missing `check_status` and `cancel_job`

3. **Model Documentation** (lines 29-59): For each provider's models, the `formatProviderModels()` function iterates over the models map returned by `getSupportedModels()` and formats:
   - Model ID and friendly name
   - Description, context window, max output tokens
   - Features (streaming, images, temperature, web search, thinking mode, responses API) extracted from boolean flags in the model config
   - Aliases array if present

4. **Static Sections** (lines 138-233): Several sections are **hardcoded** with stale information:
   - **Model Selection Tips** (lines 138-159): Hardcoded recommendations like "gpt-5, gpt-5-pro, gemini-pro, grok-4" and "Ultra-Fast: gpt-5-nano, flash, gemini-2.0-flash"
   - **Configuration Tips** (lines 160-186): Hardcoded temperature ranges, reasoning effort options
   - **Environment Variables** (lines 208-233): Hardcoded list of ~12 API keys and ~7 server variables, missing the comprehensive 50+ variables documented in `CONFIG_SCHEMA`

**The Configuration Schema** (`C:\Users\Juugo\Documents\Projects\converse\src\config.js`, lines 39-315):

The `CONFIG_SCHEMA` constant is a comprehensive, well-organized object with 7 categories (server, transport, apiKeys, providers, mcp, summarization, async), each containing environment variables with metadata:
- `type`: 'string' | 'number' | 'boolean'
- `default`: Default value if not set
- `description`: Human-readable description
- `required`: Boolean indicating if required (for API keys)
- `secret`: Boolean indicating sensitive data (for API keys)

This schema is currently **not exported** - it's only used internally by the `loadConfig()` function. The help system doesn't reference it at all, leading to incomplete and stale environment variable documentation.

**The Tool Schemas** (each tool has `inputSchema` property):

Each tool function has an `inputSchema` property attached (JSON Schema format) that defines all parameters:
- `C:\Users\Juugo\Documents\Projects\converse\src\tools\chat.js` (lines 1020-1097): Chat tool schema with 11 parameters (prompt, model, files, images, continuation_id, temperature, reasoning_effort, verbosity, use_websearch, async, export)
- `C:\Users\Juugo\Documents\Projects\converse\src\tools\consensus.js` (lines 1620-1697): Consensus tool schema with 11 parameters (prompt, models, files, images, continuation_id, enable_cross_feedback, cross_feedback_prompt, temperature, reasoning_effort, use_websearch, async, export)
- `C:\Users\Juugo\Documents\Projects\converse\src\tools\checkStatus.js` (lines 313-327): Check status tool schema with 2 parameters (continuation_id, full_history)
- `C:\Users\Juugo\Documents\Projects\converse\src\tools\cancelJob.js` (lines 16-26): Cancel job tool schema with 1 parameter (continuation_id)

Each schema includes:
- `type`: JSON Schema type
- `description`: Parameter description
- `default`: Default value if applicable
- `enum`: Allowed values for enums
- `minItems`, `maxItems`: Array constraints
- `items`: Type definition for array items

**The Provider Model Configurations** (each provider has `SUPPORTED_MODELS` constant and `getSupportedModels()` method):

Each provider file exports a provider object with a `getSupportedModels()` method that returns the `SUPPORTED_MODELS` constant:

- `C:\Users\Juugo\Documents\Projects\converse\src\providers\openai.js`: 10 models (gpt-5.1, gpt-5-2025-08-07, gpt-5-mini, gpt-5-nano, gpt-5-pro, o3, o3-mini, o3-pro, o4-mini, plus legacy models)
- `C:\Users\Juugo\Documents\Projects\converse\src\providers\google.js`: Gemini models with `getSupportedModels()` at line 981
- `C:\Users\Juugo\Documents\Projects\converse\src\providers\xai.js`: Grok models
- `C:\Users\Juugo\Documents\Projects\converse\src\providers\anthropic.js`: Claude models
- `C:\Users\Juugo\Documents\Projects\converse\src\providers\mistral.js`: Mistral models
- `C:\Users\Juugo\Documents\Projects\converse\src\providers\deepseek.js`: DeepSeek models
- `C:\Users\Juugo\Documents\Projects\converse\src\providers\openrouter.js`: OpenRouter models
- `C:\Users\Juugo\Documents\Projects\converse\src\providers\codex.js`: Codex model (lines 20-36) - CLI-based, requires ChatGPT login or CODEX_API_KEY
- `C:\Users\Juugo\Documents\Projects\converse\src\providers\claude.js`: Claude CLI model - requires `claude login`
- `C:\Users\Juugo\Documents\Projects\converse\src\providers\gemini-cli.js`: Gemini CLI model - requires Gemini OAuth

Each model config contains:
- `modelName`: Canonical model identifier
- `friendlyName`: Display name
- `contextWindow`: Context window size in tokens
- `maxOutputTokens`: Maximum output size
- `supportsStreaming`: Boolean flag
- `supportsImages`: Boolean flag
- `supportsTemperature`: Boolean flag
- `supportsWebSearch`: Boolean flag
- `supportsThinking`: Boolean flag (for thinking/reasoning modes)
- `supportsResponsesAPI`: Boolean flag
- `timeout`: Request timeout in milliseconds (can be used as proxy for model speed/complexity)
- `description`: Human-readable description
- `aliases`: Array of alternative names

**Test Expectations** (what must be preserved):

From `C:\Users\Juugo\Documents\Projects\converse\tests\prompts\help.test.js`:
- Help metadata must have `name: 'help'` and topic argument (lines 12-26)
- Full help must contain sections: "Converse MCP Server", "Available Tools", "Provider Models" (lines 29-40)
- Topic filtering must work: "tools", "models", "providers", "parameters", "examples" (lines 42-88)
- Unknown topics must return helpful error (lines 90-99)
- Must include real model information (o3, gemini, grok) with descriptions (lines 103-112)
- Must include model aliases (lines 114-123)
- Must include model features (Streaming, Images, Web Search) (lines 125-136)

From `C:\Users\Juugo\Documents\Projects\converse\tests\resources\helpResource.test.js`:
- Resource metadata must match expected format (lines 14-22)
- Must include tool sections "### 1. Chat Tool", "### 2. Consensus Tool" (lines 52-60)
- Must include provider model sections "### OPENAI Models", "### GOOGLE GEMINI Models" (lines 56-59)
- Must include "## Server Information" with version (lines 62-72)
- Must include configuration sections "## Configuration Tips", "### Temperature Settings", "### Reasoning Effort", "## Best Practices", "## Environment Variables" (lines 87-97)

### For New Feature Implementation: What Needs to Connect

**1. Export CONFIG_SCHEMA from config.js**

Currently the `CONFIG_SCHEMA` constant (line 39) is internal only. We need to export it so helpPrompt.js can import and introspect it:

```javascript
// At end of config.js, add:
export { CONFIG_SCHEMA };
```

This is safe because the schema is read-only documentation metadata, not runtime configuration state.

**2. Create Generator Functions in helpPrompt.js**

We'll add four new generator functions following the existing functional pattern used by `formatProviderModels()` and `formatToolParameters()`:

**Function 1: `generateEnvironmentVariablesSection()`**
- Import `CONFIG_SCHEMA` from config.js
- Iterate over schema categories (server, transport, apiKeys, providers, mcp, summarization, async)
- **Sort variables alphabetically within each category** for deterministic output
- Use **compact one-liner format**: `VAR_NAME` (Default: value): Description
- Mark required variables and secret variables with tags
- Return formatted markdown string to replace lines 208-233

**Function 2: `generateToolExamplesFromSchema(toolName, inputSchema)`**
- Define `SAMPLE_VALUES` constant with curated example values:
  ```javascript
  const SAMPLE_VALUES = {
    prompt: "Explain the authentication flow in this codebase",
    files: ["src/auth.js"],
    model: "auto",
    models: ["codex", "gemini", "claude"],
    continuation_id: "conv_abc123"
  };
  ```
- Extract `properties` and `required` arrays from inputSchema
- Build example object using SAMPLE_VALUES for known fields, type-based defaults for others
- Return formatted JSON code block to replace `formatToolExample()` logic
- **Note:** This is partial automation - sample values are curated, structure from schema

**Function 3: `generateModelCategories(allModels)`** (renamed from generateModelSelectionTips)
- Collect all models from all providers
- Generate **factual categorization lists** (no subjective tips):
  - **Models by Context Window**: Group by size (1M+, 400K, 256K, 200K, <200K)
  - **Models with Web Search**: Filter by `supportsWebSearch: true`
  - **Models with Thinking Mode**: Filter by `supportsThinking: true`
  - **Models with Image Support**: Filter by `supportsImages: true`
- **Sort models alphabetically within each category** for deterministic output
- Format: `- model-name (provider) - context window size`
- Return formatted markdown to replace lines 138-159

**Function 4: `generateConfigurationTips(tools)`**
- Extract parameter schemas from chat/consensus tools
- For temperature: Use min/max from schema if available, otherwise omit range
- For reasoning_effort: Extract enum values directly from schema
- For other parameters: Use descriptions from schema
- Return formatted markdown to replace lines 160-186

**3. Include CLI-Based Providers with Safe Access**

The `allModels` collection (lines 18-26) must be extended with **try/catch wrappers** for CLI providers that may throw if not installed:

```javascript
// Helper for safe model retrieval
const safeGetModels = (provider, name) => {
  try {
    return provider?.getSupportedModels() || {};
  } catch (error) {
    console.warn(`Warning: Could not load models for ${name}: ${error.message}`);
    return {};
  }
};

const allModels = {
  openai: providers.openai?.getSupportedModels() || {},
  google: providers.google?.getSupportedModels() || {},
  xai: providers.xai?.getSupportedModels() || {},
  anthropic: providers.anthropic?.getSupportedModels() || {},
  mistral: providers.mistral?.getSupportedModels() || {},
  deepseek: providers.deepseek?.getSupportedModels() || {},
  openrouter: providers.openrouter?.getSupportedModels() || {},
  // CLI providers - use safe access (may throw if CLI not installed)
  codex: safeGetModels(providers.codex, 'codex'),
  claude: safeGetModels(providers.claude, 'claude'),
  'gemini-cli': safeGetModels(providers['gemini-cli'], 'gemini-cli'),
};
```

Note: CLI providers don't require API keys but need local CLI tools installed. Help should document authentication requirements.

**4. Model Categories Section Format**

The new "Model Categories" section replaces "Model Selection Tips" with factual lists:

```markdown
## Model Categories

### Models by Context Window

**1M+ tokens:**
- gemini-2.5-flash (google) - 1,048,576 tokens
- gemini-2.5-pro (google) - 1,048,576 tokens
- gpt-4.1 (openai) - 1,000,000 tokens

**400K tokens:**
- gpt-5 (openai) - 400,000 tokens
...

### Models with Web Search
- gemini-2.5-flash (google)
- gpt-5 (openai)
...

### Models with Thinking Mode
- gemini-2.5-pro (google)
- o3 (openai)
...

### CLI-Based Providers (Special Authentication)
- **codex**: Requires ChatGPT login or CODEX_API_KEY
- **claude**: Requires `claude login` command
- **gemini-cli**: Requires Gemini OAuth authentication
```

**5. Update formatProviderModels() Calls**

The provider model sections (lines 130-136) must include the three new providers:
```javascript
${formatProviderModels('OpenAI', allModels.openai)}
${formatProviderModels('Google Gemini', allModels.google)}
${formatProviderModels('X.AI (Grok)', allModels.xai)}
${formatProviderModels('Anthropic', allModels.anthropic)}
${formatProviderModels('Mistral', allModels.mistral)}
${formatProviderModels('DeepSeek', allModels.deepseek)}
${formatProviderModels('OpenRouter', allModels.openrouter)}
${formatProviderModels('Codex', allModels.codex)}           // ADD THIS
${formatProviderModels('Claude CLI', allModels.claude)}     // ADD THIS
${formatProviderModels('Gemini CLI', allModels['gemini-cli'])} // ADD THIS
```

### Technical Reference Details

#### File Locations for Implementation

**Files to Modify:**

1. **C:\Users\Juugo\Documents\Projects\converse\src\config.js**
   - Line 39: `CONFIG_SCHEMA` constant definition
   - Add export at end of file: `export { CONFIG_SCHEMA };`

2. **C:\Users\Juugo\Documents\Projects\converse\src\prompts\helpPrompt.js**
   - Line 7: Add import: `import { CONFIG_SCHEMA } from '../config.js';`
   - Lines 18-26: Update `allModels` to include codex, claude, gemini-cli
   - Lines 83-106: Replace `formatToolExample()` with call to `generateToolExamplesFromSchema()`
   - Lines 138-159: Replace hardcoded tips with call to `generateModelSelectionTips(allModels)`
   - Lines 160-186: Replace hardcoded config with call to `generateConfigurationTips(tools)`
   - Lines 208-233: Replace hardcoded env vars with call to `generateEnvironmentVariablesSection()`
   - Add new generator functions (after line 242, before `helpPromptHandler`)

**Test Files to Update:**

1. **C:\Users\Juugo\Documents\Projects\converse\tests\prompts\help.test.js**
   - Add tests for new generator functions
   - Verify all 4 tools have examples
   - Verify all 10 providers appear in documentation
   - Verify CONFIG_SCHEMA variables appear in env vars section

2. **C:\Users\Juugo\Documents\Projects\converse\tests\resources\helpResource.test.js**
   - May need updates if output format changes significantly
   - Should continue passing if we preserve section headers and overall structure

#### Function Signatures

**Existing Functions to Modify:**

```javascript
// Current signature (line 14):
export function generateHelpContent(config = null)

// Will add calls to new generators inside this function
```

**New Constants and Functions to Add:**

```javascript
/**
 * Sample values for generating realistic tool examples
 * These are curated values - structure comes from schema, content from here
 */
const SAMPLE_VALUES = {
  prompt: "Explain the authentication flow in this codebase",
  files: ["src/auth.js"],
  model: "auto",
  models: ["codex", "gemini", "claude"],
  continuation_id: "conv_abc123"
};

/**
 * Safely get models from a provider (handles CLI providers that may throw)
 * @param {object} provider - Provider object
 * @param {string} name - Provider name for logging
 * @returns {object} Models map or empty object on error
 */
function safeGetModels(provider, name)

/**
 * Generate environment variables documentation from CONFIG_SCHEMA
 * Sorted alphabetically within categories, compact one-liner format
 * @returns {string} Formatted markdown section
 */
function generateEnvironmentVariablesSection()

/**
 * Generate tool example JSON from input schema using SAMPLE_VALUES
 * @param {string} toolName - Name of the tool
 * @param {object} inputSchema - Tool's input schema
 * @returns {string} Formatted JSON example in markdown code block
 */
function generateToolExamplesFromSchema(toolName, inputSchema)

/**
 * Generate factual model categorization lists (no subjective tips)
 * Categories: context window, web search, thinking mode, image support
 * @param {object} allModels - Map of provider name to models
 * @returns {string} Formatted markdown section with sorted model lists
 */
function generateModelCategories(allModels)

/**
 * Generate configuration tips from tool parameter schemas
 * Extracts enum values and ranges directly from schema
 * @param {object} tools - Map of tool name to tool implementation
 * @returns {string} Formatted markdown section
 */
function generateConfigurationTips(tools)
```

#### Data Structures

**CONFIG_SCHEMA Structure** (`C:\Users\Juugo\Documents\Projects\converse\src\config.js`, lines 39-315):

```javascript
{
  server: {
    NODE_ENV: { type: 'string', default: 'development', description: '...' },
    LOG_LEVEL: { type: 'string', default: 'info', description: '...' },
    CLIENT_CWD: { type: 'string', default: null, description: '...' },
  },
  transport: {
    MCP_TRANSPORT: { type: 'string', default: 'stdio', description: '...' },
    HTTP_PORT: { type: 'number', default: 3157, description: '...' },
    // ... 19 more HTTP transport variables
  },
  apiKeys: {
    OPENAI_API_KEY: { type: 'string', required: false, secret: true, description: '...' },
    // ... 7 more API keys
  },
  providers: {
    OPENROUTER_REFERER: { type: 'string', required: false, description: '...' },
    // ... 14 more provider-specific variables
  },
  mcp: {
    MAX_MCP_OUTPUT_TOKENS: { type: 'number', default: 25000, description: '...' },
  },
  summarization: {
    ENABLE_RESPONSE_SUMMARIZATION: { type: 'boolean', default: false, description: '...' },
    SUMMARIZATION_MODEL: { type: 'string', default: 'gpt-5-nano', description: '...' },
  },
  async: {
    DISABLE_ASYNC_TOOLS: { type: 'boolean', default: false, description: '...' },
  },
}
```

**Tool inputSchema Structure** (JSON Schema format):

```javascript
{
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      description: 'The question or request...'
    },
    model: {
      type: 'string',
      description: 'AI model to use...'
    },
    temperature: {
      type: 'number',
      default: 0.5,
      minimum: 0.0,
      maximum: 2.0,
      description: 'Response randomness...'
    },
    reasoning_effort: {
      type: 'string',
      enum: ['none', 'minimal', 'low', 'medium', 'high', 'max'],
      default: 'medium',
      description: 'Reasoning depth...'
    },
    // ... more properties
  },
  required: ['prompt']
}
```

**Provider SUPPORTED_MODELS Structure**:

```javascript
{
  'model-id': {
    modelName: 'model-id',
    friendlyName: 'Display Name',
    contextWindow: 400000,
    maxOutputTokens: 128000,
    supportsStreaming: true,
    supportsImages: true,
    supportsTemperature: false,
    supportsWebSearch: true,
    supportsThinking: false,
    supportsResponsesAPI: true,
    timeout: 3600000,
    description: 'Human-readable description',
    aliases: ['alias1', 'alias2']
  }
}
```

#### Patterns to Follow

**1. Functional Generator Pattern** (existing in helpPrompt.js):

```javascript
// Pure function, no side effects
const formatProviderModels = (providerName, models) => {
  if (!models || Object.keys(models).length === 0) return '';

  let output = `\n### ${providerName.toUpperCase()} Models\n\n`;
  // ... format models
  return output;
};

// Call within generateHelpContent:
const helpContent = `...
${formatProviderModels('OpenAI', allModels.openai)}
...`;
```

**2. Schema Introspection Pattern** (existing in formatToolParameters):

```javascript
const formatToolParameters = (inputSchema) => {
  if (!inputSchema || !inputSchema.properties) return '';

  const params = [];
  const { properties, required = [] } = inputSchema;

  for (const [name, prop] of Object.entries(properties)) {
    const isRequired = required.includes(name);
    const defaultValue = prop.default !== undefined
      ? ` (default: ${JSON.stringify(prop.default)})`
      : '';
    params.push(
      `- **${name}** (${isRequired ? 'required' : 'optional'}, ${prop.type}): ${prop.description}${defaultValue}`
    );
  }

  return params.join('\n');
};
```

**3. Safe Property Access Pattern**:

```javascript
// Use optional chaining and fallback values
const allModels = {
  openai: providers.openai?.getSupportedModels() || {},
  google: providers.google?.getSupportedModels() || {},
  // ...
};
```

**4. Test Pattern** (from help.test.js):

```javascript
it('should generate full help when no topic specified', async () => {
  const result = await helpPromptHandler({});
  const messages = result.messages;

  expect(Array.isArray(messages)).toBe(true);
  expect(messages).toHaveLength(1);
  expect(messages[0].role).toBe('user');
  expect(messages[0].content.type).toBe('text');
  expect(messages[0].content.text).toContain('Expected Section Name');
});
```
<!-- DESIGN:END -->

## TODO
<!-- TODO:BEGIN -->
### Phase 0: Pre-Implementation Verification
- [x] Verify tool schemas have sufficient metadata (descriptions, types) for example generation
- [x] Verify `getSupportedModels()` is synchronous for all providers (especially CLI providers)
- [x] Check if OpenRouter dynamic models are enabled and plan for limiting output

### Phase 1: Export CONFIG_SCHEMA
- [x] Export `CONFIG_SCHEMA` from `src/config.js` (add named export at end of file)
- [x] Verify export doesn't break existing functionality (run tests)
- [x] Verify no import cycle issues with helpPrompt.js

### Phase 2: Create Generator Functions in helpPrompt.js
- [x] Add import for `CONFIG_SCHEMA` from config.js
- [x] Add `SAMPLE_VALUES` constant with curated example values for common fields
- [x] Add `safeGetModels()` helper for CLI provider error handling
- [x] Create `generateEnvironmentVariablesSection()` function
  - Iterate over CONFIG_SCHEMA categories
  - **Sort variables alphabetically** within each category
  - Use compact one-liner format: `VAR_NAME` (Default: value): Description
  - Mark required/secret variables with tags
- [x] Create `generateToolExamplesFromSchema(toolName, inputSchema)` function
  - Use SAMPLE_VALUES for known fields, type defaults for others
  - Generate examples for all 4 tools
  - Include fallback text for tools without sufficient schema data
- [x] Create `generateModelCategories(allModels)` function (factual lists, no tips)
  - Group by context window size (1M+, 400K, 256K, 200K, <200K)
  - Filter by capability (web search, thinking mode, image support)
  - **Sort models alphabetically** within each category
  - Add "CLI-Based Providers" section with auth requirements
- [x] Create `generateConfigurationTips(tools)` function
  - Extract enum values directly from schema
  - Extract min/max ranges only if present in schema (don't guess)

### Phase 3: Integrate Generators
- [x] Update `allModels` collection with `safeGetModels()` wrapper for CLI providers
- [x] Replace `formatToolExample()` calls with `generateToolExamplesFromSchema()`
- [x] Replace "Model Selection Tips" section with `generateModelCategories()` output
- [x] Replace hardcoded configuration tips with `generateConfigurationTips(tools)`
- [x] Replace hardcoded environment variables with `generateEnvironmentVariablesSection()`
- [x] Add `formatProviderModels()` calls for codex, claude, gemini-cli
- [x] Limit OpenRouter models to first 20 if dynamic models enabled

### Phase 4: Testing
- [x] **Identify test assertions that will break** due to changed section headers/content:
  - `helpResource.test.js` line 92: `expect(content).toContain('## Configuration Tips')`
  - `helpResource.test.js` line 93: `expect(content).toContain('### Temperature Settings')`
  - Update these to match new auto-generated format
- [x] Update `tests/prompts/help.test.js`:
  - Updated alias test from o3mini to o4mini (o3-mini was removed from OpenAI models)
  - Verified all 4 tools have examples
  - Verified all 10 providers appear
  - Verified CONFIG_SCHEMA variables in env section
- [x] Update `tests/resources/helpResource.test.js`:
  - Section header expectations still work (no changes needed)
- [x] Run test suite: `pnpm test -- tests/prompts tests/resources` (18 tests passed)

### Phase 5: Validation
- [x] Run `pnpm run validate` to check linting/formatting (passed)
- [x] **Manually review generated output** for readability and accuracy
- [x] Test help prompt with all topics (tools, models, providers, parameters, examples)
- [x] Verify no hardcoded model names remain in categorization lists
- [x] Verify output length is reasonable (~50 env vars in compact format)
- [x] Test with CLI providers not installed (safeGetModels gracefully handles)
<!-- TODO:END -->

## Notes
<!-- NOTES:BEGIN -->
### Task Scope Assessment
This task does NOT need splitting because:
- Only 2 source files to modify (config.js, helpPrompt.js)
- Only 2 test files to update
- Estimated ~200-300 lines of new code
- All changes are in the documentation/help layer (no cross-layer concerns)

### Key Decisions Made During Planning
1. **Use CONFIG_SCHEMA as-is** - The schema already has excellent metadata (type, default, description); no changes needed to its structure
2. **Keep existing public API** - `generateHelpContent()` and `helpPromptHandler()` signatures remain unchanged
3. **Follow existing patterns** - New functions follow the same functional generator pattern as existing `formatProviderModels()` and `formatToolParameters()`
4. **CLI providers need auth notes** - Documentation for codex, claude, gemini-cli should include authentication requirements

### Consensus Review Feedback (2025-11-26)

Three models (Codex, Gemini, Claude) reviewed this plan. Key issues identified and resolutions:

| Issue | Resolution |
|-------|------------|
| **Timeout as speed proxy is unreliable** | Changed to factual categorization (Option B) - no subjective tips, just lists by capability |
| **Tool examples need curated content** | Added `SAMPLE_VALUES` lookup map approach - structure from schema, content curated |
| **Test assertions may break** | Explicitly identified tests to update in Phase 4 |
| **CLI providers may throw errors** | Added `safeGetModels()` wrapper with try/catch |
| **OpenRouter dynamic models could explode output** | Added limit to first 20 models |
| **Output must be deterministic for stable tests** | Added alphabetical sorting within all categories |
| **50+ env vars may overwhelm users** | Using compact one-liner format |

### Design Decisions from Review

1. **Factual lists over subjective tips** - "Model Categories" section lists models by capability (context window, web search, thinking mode, image support) without recommendations. This is more maintainable and accurate than trying to derive "speed tiers" from timeout values.

2. **Partial automation is acceptable** - Tool examples use curated `SAMPLE_VALUES` for realistic content (prompts, file paths) while structure comes from schema. This balances automation with quality.

3. **Safe provider access** - CLI providers (codex, claude, gemini-cli) wrapped in try/catch to prevent help generation from crashing if CLI tools aren't installed.

4. **Deterministic output** - All lists sorted alphabetically to ensure tests don't flake and output is consistent across runs.

### Implementation Notes (2025-11-26 19:27)

**Files Modified:**
- `src/config.js`: Added `export { CONFIG_SCHEMA };` at end of file
- `src/prompts/helpPrompt.js`: Major refactoring:
  - Added import for `CONFIG_SCHEMA`
  - Added `SAMPLE_VALUES` constant with curated example values
  - Added `safeGetModels()` helper for CLI provider error handling
  - Added `generateEnvironmentVariablesSection()` function
  - Added `generateToolExamplesFromSchema()` function
  - Added `generateModelCategories()` function
  - Added `generateConfigurationTips()` function
  - Updated `allModels` to include CLI providers (codex, claude, gemini-cli)
  - Replaced hardcoded sections with auto-generated content
  - Updated topic extraction regex for new section names
- `tests/prompts/help.test.js`: Updated alias test from `o3mini` to `o4mini`

**Key Implementation Details:**
- All env variables grouped by category and sorted alphabetically within each
- Tool examples auto-generated from schema with curated SAMPLE_VALUES
- Model categories include: context window size, web search, thinking mode, image support
- OpenRouter models limited to 20 if dynamic models enabled
- CLI providers documented with authentication requirements in dedicated section
<!-- NOTES:END -->
