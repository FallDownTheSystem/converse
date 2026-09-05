# AI Provider Configuration Guide

This guide documents all supported AI providers in the Converse MCP Server and their configuration options.

## Supported Providers

### OpenAI
- **API Key Format**: `sk-proj-...` (starts with `sk-`)
- **Get Key**: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Environment Variable**: `OPENAI_API_KEY`
- **Supported Models**:
  - `gpt-5.6-sol` (aliases: `gpt-5.6`, `gpt-5`, `sol`) - Flagship GPT-5.6, the default OpenAI model
  - `gpt-5.6-terra` (alias: `terra`) - Lower-cost GPT-5.6, competitive with GPT-5.5
  - `gpt-5.6-luna` (alias: `luna`) - Fastest, most affordable GPT-5.6
  - `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5.4-pro`, `gpt-5-mini`, `gpt-5-nano` - GPT-5.4/GPT-5 family
  - `o3`, `o3-pro`, `o4-mini` - Advanced reasoning models
  - `gpt-4.1` - Large context (1M tokens)
  - `o3-deep-research`, `o4-mini-deep-research` - Deep research models

### Google (Gemini)
- **API Key Format**: `AIzaSy...` (varies)
- **Get Key**: [makersuite.google.com/app/apikey](https://makersuite.google.com/app/apikey)
- **Environment Variable**: `GOOGLE_API_KEY`
- **Supported Models**:
  - `gemini-3.1-pro-preview` (aliases: `pro`, `gemini-pro`) - Most advanced reasoning with expanded thinking levels (1M context, 64K output)
  - `gemini-3.5-flash` (aliases: `gemini-3.5`, `flash-3.5`) - Frontier-level agentic and coding performance at Flash speed (1M context, 65K output)
  - `gemini-3.8-flash` (aliases: `gemini-3.8`, `flash-3.8`) - Current-generation Flash with stronger long-horizon agentic performance (1M context, 65K output; thinking levels low/medium/high — no minimal)
  - `gemini-2.5-pro` (alias: `pro 2.5`) - Deep reasoning with thinking budget (1M context, 65K output)
  - `gemini-2.5-flash` (alias: `flash`) - Ultra-fast model with thinking budget (1M context, 65K output)
  - `gemini-2.5-flash-lite` (alias: `flash-lite`) - Lightweight fast model (1M context, 65K output)
- **Note**: The short model name `gemini` (and `gemini:flash` / `gemini:pro`) routes to the **Antigravity CLI** (`agy`, OAuth-based access). For Google API access, use specific model names like `gemini-3.1-pro-preview` or `gemini-2.5-flash` (bare `gemini-pro`/`gemini-flash` also route to the Google API).

### X.AI (Grok)
- **API Key Format**: `xai-...` (starts with `xai-`)
- **Get Key**: [console.x.ai](https://console.x.ai/)
- **Environment Variable**: `XAI_API_KEY`
- **Supported Models**:
  - `grok-4.5` (default; aliases: `grok`, `grok-4.5-latest`, `grok-build-latest`) - Flagship model with image input, reasoning content, and native web/X search (500K context)
- **Reasoning**: `reasoning_effort` maps to Grok's `low`/`medium`/`high`. Grok 4.5 always reasons and cannot be turned off, so `none`/`minimal`/`low` clamp to `low`, `medium` stays `medium`, and `high`/`max` clamp to `high`.
- **Web search**: Automatic — native web/X search (Agent Tools) is attached on every Grok 4.5 request; the model decides per-request whether to search, and any citations are returned in metadata.
- **Retired IDs**: Older Grok identifiers (e.g. `grok-4-0709`, `grok-code-fast-1`) still pass through as explicit model strings, but xAI does not surface a retirement error for them — it silently remaps them upstream to a current model (HTTP 200). Use `grok-4.5` for predictable results.

### Anthropic (Claude)
- **API Key Format**: `sk-ant-...` (starts with `sk-ant-`)
- **Get Key**: [console.anthropic.com](https://console.anthropic.com/)
- **Environment Variable**: `ANTHROPIC_API_KEY`
- **Supported Models**:
  - `claude-fable-5` (alias `fable`) - Most capable model for demanding reasoning and long-horizon agentic work (1M context, 128K output)
  - `claude-opus-5` (alias `opus`) - Most capable Opus for complex agentic coding and deep reasoning (1M context, 128K output)
  - `claude-opus-4-8`, `claude-opus-4-7`, `claude-opus-4-6` - Previous Opus generations with adaptive thinking (128K output)
  - `claude-opus-4-5-20251101`, `claude-opus-4-1-20250805` - Legacy Opus models (64K / 32K output)
  - `claude-sonnet-4-6` (alias `sonnet`) - Best combination of speed and intelligence with adaptive thinking (64K output)
  - `claude-sonnet-4-5-20250929` - Legacy Sonnet (64K output)
  - `claude-haiku-4-5-20251001` (alias `haiku`) - Fast and intelligent with extended thinking (64K output)

### Mistral
- **API Key Format**: 32+ character string
- **Get Key**: [console.mistral.ai](https://console.mistral.ai/)
- **Environment Variable**: `MISTRAL_API_KEY`
- **Supported Models**:
  - `mistral-medium-3-5` (default; aliases: `mistral`, `mistral-medium`, `mistral-medium-latest`) - Frontier-class multimodal model with adjustable reasoning (256K context)
  - `mistral-small-2603` (aliases: `mistral-small`, `mistral-small-latest`) - Hybrid multimodal model unifying instruct, reasoning, and coding (256K context)
  - `mistral-large-2512` (aliases: `mistral-large`, `mistral-large-latest`) - Open-weight MoE flagship, image-capable (256K context)
- **Reasoning**: Mistral exposes only `high` and `none`. On the reasoning-capable models (`mistral-medium-3-5`, `mistral-small-2603`), every enabled `reasoning_effort` level maps to `high` and only `none` disables thinking. `mistral-large-2512` has no adjustable reasoning, so `reasoning_effort` is never sent for it.
- **Images**: `mistral-medium-3-5` and `mistral-small-2603` accept image input; `mistral-large-2512` is text-only.

### DeepSeek
- **API Key Format**: 32+ character string
- **Get Key**: [platform.deepseek.com](https://platform.deepseek.com/)
- **Environment Variable**: `DEEPSEEK_API_KEY`
- **Supported Models**:
  - `deepseek-v4-pro` (default; aliases: `deepseek`, `deepseek-pro`) - Flagship MoE model with thinking mode (1M context, 384K max output, text-only)
  - `deepseek-v4-flash` (alias: `deepseek-flash`) - Faster, lower-cost V4 tier with thinking mode (1M context, 384K max output, text-only)
- **Reasoning**: DeepSeek V4 exposes thinking mode via a `thinking` toggle plus a `reasoning_effort` of `high` or `max`. `none` disables thinking; `minimal`/`low`/`medium`/`high` enable thinking at `high`; `max` enables thinking at `max`.

### OpenRouter
- **API Key Format**: `sk-or-...` (starts with `sk-or-`)
- **Get Key**: [openrouter.ai/keys](https://openrouter.ai/keys)
- **Environment Variables**:
  - `OPENROUTER_API_KEY` - Your API key
  - `OPENROUTER_REFERER` - Optional referer URL (e.g., your GitHub repo) for OpenRouter ranking credit; omitting it is valid
  - `OPENROUTER_TITLE` - Optional title for OpenRouter ranking credit
- **Curated Models** (default `z-ai/glm-5.2`):
  - `z-ai/glm-5.2` (aliases: `glm`, `glm-5.2`) - Large-scale reasoning model, text-only (1M context)
  - `deepseek/deepseek-v4-pro` - DeepSeek V4 Pro reasoning model, text-only (1M context, 384K output)
  - `deepseek/deepseek-v4-flash` - Faster, lower-cost DeepSeek V4 tier, text-only (1M context, 384K output)
  - `qwen/qwen3.7-max` (alias: `qwen3.7-max`) - Flagship Qwen, text-only (1M context)
  - `qwen/qwen3.7-plus` (alias: `qwen3.7-plus`) - Image-capable Qwen (1M context)
  - `moonshotai/kimi-k2.7-code` (alias: `kimi-k2.7-code`) - Coding model, image-capable, reasoning always on (256K context)
  - `moonshotai/kimi-k2.6` (alias: `kimi-k2.6`) - Image-capable general model (256K context)
  - `openrouter/auto` - Auto-selects the best model for your prompt
- **Any other model**: Use the full `provider/model` slug directly (e.g. `anthropic/claude-sonnet-5`, `meta-llama/llama-3.1-405b-instruct`) or the `openrouter:` namespace (e.g. `openrouter:z-ai/glm-5.2`). No extra configuration is needed — slugs route to OpenRouter as-is. A slug absent from OpenRouter's live catalog fails before inference with `MODEL_NOT_FOUND`. See [openrouter.ai/models](https://openrouter.ai/models) for the full catalog.
- **Reasoning**: Per-model. `z-ai/glm-5.2` and the `deepseek/deepseek-v4-*` slugs are effort-tiered (`max` → `xhigh`, other enabled levels → `high`, `none` disables); `qwen/qwen3.7-*` and `moonshotai/kimi-k2.6` are enable/disable only (`none` disables, any other level enables); `moonshotai/kimi-k2.7-code` always reasons and cannot be disabled; `openrouter/auto` lets the router choose.
- **Web search (opt-in, adds cost)**: OpenRouter web search is off by default because it incurs a real per-request charge. Enable it explicitly by appending `:online` to a slug (e.g. `z-ai/glm-5.2:online` or `openrouter:qwen/qwen3.7-max:online`). When enabled, `annotations[].url_citation` citations are captured into metadata. Ordinary requests never attach a web-search plugin.

### Codex
- **API Key Format**: Optional (uses ChatGPT login by default)
- **Authentication**: ChatGPT login (system-wide) OR `CODEX_API_KEY`
- **Environment Variables**:
  - `CODEX_API_KEY` - Optional API key for headless deployments
  - `CODEX_SANDBOX_MODE` - Filesystem access control (default: read-only)
  - `CODEX_SKIP_GIT_CHECK` - Skip Git repository validation (default: true)
  - `CODEX_APPROVAL_POLICY` - Command approval behavior (default: never)
  - `CODEX_MODEL` - Underlying model for Codex sessions (default: gpt-6-astra; e.g. gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5)
- **Supported Models**:
  - `codex` - OpenAI Codex agentic coding assistant (GPT-6 Astra by default)
  - `codex:<model>` - Same, with an explicit backend: `codex:astra`, `codex:sol`, `codex:terra`, `codex:luna`, `codex:gpt-5.5`, `codex:spark`, or any slug the Codex CLI knows
  - `reasoning_effort` is clamped onto what the backend accepts (GPT-6 Astra: `low`–`max`, no `none`)
  - Thread-based sessions with persistent context
  - Direct filesystem access from working directory
  - Typical response time: 6-20 seconds (longer for complex tasks)

**Key Features:**
- **Thread-Based Sessions**: Maintains full conversation history across requests
- **Local File Access**: Reads files directly from working directory
- **Sandbox Modes**: Configurable filesystem access (read-only, workspace-write, danger-full-access)
- **Approval Policies**: Control command execution behavior
- **Performance**: Slower than API-based providers (6-20 seconds typical, minutes for complex tasks)

**Best Practices:**
- Use `async: true` for Codex requests (long response times)
- Set `CODEX_SANDBOX_MODE=read-only` for safe exploration
- Use `CODEX_APPROVAL_POLICY=never` for headless server deployments
- Always use `continuation_id` for thread continuation

### Gemini (Antigravity CLI)
- **Authentication**: Google OAuth via the Antigravity CLI (`agy`) — no API key needed
- **Setup Required**:
  1. Install the Antigravity CLI (`agy`):
     - Windows (PowerShell): `irm https://antigravity.google/cli/install.ps1 | iex`
     - macOS/Linux: `curl -fsSL https://antigravity.google/cli/install.sh | bash`
  2. Authenticate: run `agy` once interactively and complete the Google OAuth login. This also establishes workspace trust for your home directory (the provider spawns each call in a per-call subdirectory under `~/.converse/agy-runs`).
- **Environment Variables**: None (the provider detects the `agy` binary on PATH or at the platform install location)
- **Supported Models** (text-only — print mode has no image input channel):
  - `gemini` (= `gemini:flash`) - Gemini 3.8 Flash (default)
  - `gemini:pro` - Gemini 3.1 Pro
  - `reasoning_effort` selects the variant: `low` → (Low), `medium` → (Medium) for Flash / (High) for Pro, `high`/`max` → (High); unset defaults to (High)

**Key Features:**
- **OAuth Authentication**: Uses your Antigravity Google login instead of API keys
- **Subscription Access**: Leverages the Antigravity weekly compute allowance instead of pay-per-API-call
- **One-shot responses**: The provider shells out to `agy -p` under a pseudo-terminal and returns the full response in a single chunk (no token-level streaming; ~7s minimum per call, ~30-60s for very large prompts)

**Authentication Setup:**
```bash
# Install the Antigravity CLI (agy)
# Windows (PowerShell):
irm https://antigravity.google/cli/install.ps1 | iex
# macOS/Linux:
curl -fsSL https://antigravity.google/cli/install.sh | bash

# Run interactive login (one-time setup) — also establishes workspace trust
agy
```

**Usage Examples:**

*Chat Tool:*
```json
{
  "name": "chat",
  "arguments": {
    "prompt": "Explain async/await in JavaScript",
    "models": ["gemini"]
  }
}
```

*Consensus mode:*
```json
{
  "name": "chat",
  "arguments": {
    "prompt": "Should we use TypeScript for this component?",
    "models": ["gemini", "gpt-5.6", "claude"],
    "mode": "consensus"
  }
}
```

**Best Practices:**
- Authenticate before first use (run `agy` once interactively to log in)
- Use specific model names for Google API access (e.g., `gemini-2.5-pro`)
- Model names `gemini`, `gemini:pro`, and `gemini:flash` are reserved for Antigravity CLI access
- If a call returns an empty response, the CLI is likely not authenticated — run `agy` interactively once

**Differences from Google API Provider:**
- **Authentication**: Google OAuth via `agy` vs API Key (Google API)
- **Billing**: Antigravity subscription/compute allowance vs pay-per-use API
- **Model Routing**: `gemini` / `gemini:flash` / `gemini:pro` → Antigravity CLI provider, specific names (e.g., `gemini-2.5-pro`, bare `gemini-pro`) → Google API provider
- **Images**: Not supported (text-only) vs full multimodal on the Google API provider

### Claude Agent SDK
- **Authentication**: Claude Code CLI login (no API key needed)
- **Setup Required**: Authenticate once with `claude login` (Claude Code CLI)
- **Environment Variables**: None (uses Claude Code credentials)
- **Supported Models**:
  - `claude` (aliases: `claude-sdk`, `claude-code`) - Defaults to Claude Fable 5.1 (`claude-fable-5-1`)
  - `claude:fable` or `claude:fable-5.1` - Claude Fable 5.1 explicitly
  - `claude:fable-5` - Claude Fable 5.0 (`claude-fable-5`)
  - `claude:opus` - Claude Opus 5
  - Other `claude:`-prefixed names pass through to the SDK (e.g. `claude:claude-sonnet-4-6`)

**Key Features:**
- **Subscription Access**: Uses your Claude subscription instead of API credits
- **Local File Access**: Reads files directly from the working directory
- **Image Support**: Via the SDK's streaming input mode
- **Reasoning Effort**: `reasoning_effort` maps to the SDK's `effort` option: `low`, `medium`, `high`, `xhigh`, or `max`; `none` and `minimal` become `low`. Omitting it retains the SDK default.
- **Turn Limit**: SDK requests allow up to 100 turns (`maxTurns: 100`).
- **SDK-Managed Parameters**: Sampling parameters are managed internally by the SDK.

**Differences from Anthropic API Provider:**
- **Authentication**: Claude Code login vs `ANTHROPIC_API_KEY`
- **Billing**: Claude subscription vs pay-per-use API
- **Model Routing**: `claude` and `claude:*` → SDK provider; specific names (e.g., `claude-fable-5`, `opus`, `sonnet`) → API provider

### GitHub Copilot SDK
- **Authentication**: GitHub Copilot subscription via the Copilot CLI (`gh auth login` with an active Copilot subscription) — no API key needed
- **Setup Required**: Authenticate the GitHub CLI and ensure your account has an active Copilot subscription
- **Environment Variables**: None
- **Supported Models** (reach them with the `copilot:` namespace, e.g. `copilot:gpt-5.6-terra`):
  - `copilot` - Uses Copilot's default or env-configured model
  - OpenAI: `gpt-5.6-sol` (aliases: bare `gpt-5.6`, `gpt-5`), `gpt-5.6-terra` (recommended balanced tier), `gpt-5.6-luna`
  - Anthropic: `claude-fable-5` (alias: `fable`), `claude-sonnet-5` (alias: `sonnet`), `claude-opus-5` (aliases: `opus`, `claude`), `claude-opus-4.8`
  - Google: `gemini-3.1-pro-preview` (aliases: `gemini`, `gemini-3.1-pro`), `gemini-3.8-flash` (aliases: `gemini-3.8`, `flash-3.8`), `gemini-3.5-flash` (alias: `gemini-flash`)
- **Reasoning**: The `gpt-5.6-sol`/`terra`/`luna` tiers accept `reasoning_effort`.
- **Explicit pass-through**: Any other `copilot:<id>` model string is forwarded to the Copilot backend verbatim, so IDs outside the curated list still work while the backend accepts them.

**Key Features:**
- **Subscription Access**: Uses your GitHub Copilot subscription instead of API credits
- **Multiple Backends**: OpenAI, Anthropic, and Google models through a single subscription
- **Model IDs**: Lowercase dot-versioned (e.g. `claude-opus-4.8`, `gemini-3.1-pro-preview`)

## Configuration Examples

### Basic Configuration (.env file)
```bash
# Choose one or more providers
OPENAI_API_KEY=sk-proj-your_key_here
ANTHROPIC_API_KEY=sk-ant-your_key_here
MISTRAL_API_KEY=your_mistral_key_here
DEEPSEEK_API_KEY=your_deepseek_key_here

# OpenRouter needs only an API key; any provider/model slug works directly
OPENROUTER_API_KEY=sk-or-your_key_here
# Optional: referer and title for OpenRouter ranking credit
OPENROUTER_REFERER=https://github.com/YourUsername/YourApp
OPENROUTER_TITLE=Converse

# Codex - Optional API key (uses ChatGPT login by default)
CODEX_API_KEY=your_codex_api_key_here       # Optional if ChatGPT login available
CODEX_SANDBOX_MODE=read-only                 # read-only (default), workspace-write, danger-full-access
CODEX_SKIP_GIT_CHECK=true                    # true (default), false
CODEX_APPROVAL_POLICY=never                  # never (default), untrusted, on-failure, on-request
```

### Claude Configuration (claude_desktop_config.json)
```json
{
  "mcpServers": {
    "converse": {
      "command": "npx",
      "args": ["FallDownTheSystem/converse"],
      "env": {
        "OPENAI_API_KEY": "your_key_here",
        "ANTHROPIC_API_KEY": "your_key_here",
        "MISTRAL_API_KEY": "your_key_here",
        "DEEPSEEK_API_KEY": "your_key_here",
        "OPENROUTER_API_KEY": "your_key_here",
        "OPENROUTER_REFERER": "https://github.com/YourUsername/YourApp",
        "OPENROUTER_TITLE": "Converse"
      }
    }
  }
}
```

## Provider-Specific Features

### Streaming Support
All providers support streaming responses for real-time output.

### Image Support
- **Full Support**: OpenAI, Google, X.AI (Grok 4.5), Anthropic (Claude-4 series, Claude-3-Opus)
- **Mistral**: `mistral-medium-3-5` and `mistral-small-2603` accept images; `mistral-large-2512` is text-only
- **Via OpenRouter**: Depends on the model — `qwen/qwen3.7-plus`, `moonshotai/kimi-k2.7-code`, and `moonshotai/kimi-k2.6` accept images; `z-ai/glm-5.2` and the `deepseek/deepseek-v4-*` slugs are text-only
- **No Support**: DeepSeek (native), Codex

### Web Search
- **Automatic where supported**: OpenAI, Google, and X.AI (Grok 4.5, via Agent Tools) attach web search on every request for capable models; the model decides whether to use it
- **OpenRouter (opt-in, adds cost)**: Off by default; append `:online` to a slug to enable it per request (real per-request charge), with citations captured into metadata
- **No Support**: Anthropic, Mistral, DeepSeek, Codex

### Thinking/Reasoning Modes
- **OpenAI**: GPT-5 family and O3 series models support the `reasoning_effort` parameter (GPT-5.6 accepts `none` through `max`, mapping `minimal` to `low`; GPT-5 Pro is fixed at `high`)
- **Google**:
  - Gemini 3.0 Pro: Thinking levels (low/high) via `reasoning_effort` - always enabled
  - Gemini 2.5 Pro/Flash: Thinking budget (token-based) via `reasoning_effort`
- **Anthropic**: Claude Fable 5, Opus 4.6+, and Sonnet 4.6 use adaptive thinking (depth controlled by `reasoning_effort` via Anthropic's `effort` parameter); older Claude 4 models use budget-based extended thinking
- **X.AI**: Grok 4.5 maps `reasoning_effort` to `low`/`medium`/`high` and always reasons (cannot be disabled)
- **Mistral**: `mistral-medium-3-5` and `mistral-small-2603` map `reasoning_effort` to `high` (enabled) or `none` (disabled); `mistral-large-2512` has no adjustable reasoning
- **DeepSeek**: V4 models use thinking mode via `reasoning_effort` (`none` disables; enabled levels use `high`, `max` uses `max`)
- **OpenRouter**: Reasoning is per-model (effort-tiered, enable/disable-only, mandatory, or router-chosen — see the OpenRouter section)
- **Codex**: Thread-based agentic reasoning with persistent context
- **Others**: Standard inference only

### Local Execution
- **Codex**: Runs locally with direct filesystem access and thread-based sessions
- **All Others**: API-based remote execution

## Model Selection in Tools

When using the chat tool in any mode, specify models using their identifiers:

### Model Routing Logic

1. **SDK Providers** (exact matches and prefixes, checked first):
   - `codex` → Codex
   - `gemini`, `gemini-cli`, and any `gemini:`-prefixed name (e.g., `gemini:flash`, `gemini:pro`) → Gemini via Antigravity CLI
   - `claude`, `claude-sdk`, `claude-code` and any `claude:`-prefixed name (e.g., `claude:fable`, `claude:opus`) → Claude Agent SDK
   - `copilot`, `copilot-sdk`, `github-copilot` and any `copilot:`-prefixed name (e.g., `copilot:codex`) → Copilot SDK

2. **Simple Names**: Other models without "/" are routed by keyword matching:
   - Contains "gpt", "o1", "o3", "o4" → OpenAI
   - Contains "claude", "fable", "opus", "sonnet", "haiku" → Anthropic
   - Contains "gemini", "flash", "pro" → Google
   - Contains "grok" → X.AI
   - Contains "mistral", "magistral" → Mistral
   - Contains "deepseek", "reasoner", "r1" → DeepSeek
   - Contains "qwen", "kimi", "k2" → OpenRouter

3. **Slash Format**: Models with "/" check native providers first:
   - If exact model exists in a native provider → Routes to that provider
   - If not found in any native provider → Routes to OpenRouter
   - This allows using models like "anthropic/claude-3.5-sonnet" via OpenRouter

4. **OpenRouter Auto**: Special aliases route to OpenRouter's auto-selection:
   - "openrouter/auto", "openrouter auto", "auto router", "auto-router"

The `models` array always holds plain model-name strings. Each string routes as follows:

```text
"gpt-5.6"                  // OpenAI (keyword match)
"fable"                    // Anthropic (keyword match -> claude-fable-5)
"opus"                     // Anthropic (keyword match -> claude-opus-5)
"sonnet"                   // Anthropic (keyword match -> claude-sonnet-4-6)
"claude"                   // Claude Agent SDK (defaults to Claude Fable 5.1)
"claude:opus"              // Claude Agent SDK (Claude Opus 5)
"gemini-2.5-pro"           // Google (keyword match)
"grok-4.5"                 // X.AI (keyword match)
"mistral-large"            // Mistral (alias -> mistral-large-2512)
"deepseek"                 // DeepSeek (alias -> deepseek-v4-pro)
"z-ai/glm-5.2"             // OpenRouter (curated slug)
"z-ai/glm-5.2:online"      // OpenRouter with web search opt-in
"anthropic/claude-sonnet-5" // OpenRouter (any full slug routes as-is)
"openrouter/auto"          // OpenRouter auto-selection
```

```json
// Consensus mode with multiple providers
{
  "name": "chat",
  "arguments": {
    "prompt": "Which database fits our workload?",
    "models": ["gpt-5.6", "claude", "gemini-2.5-pro"],
    "mode": "consensus"
  }
}
```

## Troubleshooting

### Invalid API Key Errors
- Ensure your API key matches the expected format for each provider
- Check that environment variables are properly set
- Verify API keys are active and have available quota

### Model Not Found
- Use exact model identifiers as listed above
- Some providers support aliases (e.g., "fable" → "claude-fable-5", "opus" → "claude-opus-5")
- Note: bare "claude" routes to the Claude Agent SDK provider, not the Anthropic API
- Check provider documentation for model availability in your region

### Rate Limits
- Each provider has different rate limits
- OpenRouter provides unified rate limiting across providers
- Consider using multiple providers for better availability

### OpenRouter Attribution
- `OPENROUTER_REFERER` and `OPENROUTER_TITLE` are optional — set them to your application URL / name for OpenRouter ranking credit
- Omitting them is valid and never blocks a request

### OpenRouter Model Selection
- The 8 curated slugs work out of the box; the default is `z-ai/glm-5.2`
- Any other model works via its full `provider/model` slug or the `openrouter:` namespace — no extra configuration
- The first request to a non-curated slug fetches its capabilities from OpenRouter's live catalog; a slug absent from that catalog fails before inference with `MODEL_NOT_FOUND`
- Append `:online` to a slug to enable web search for that request (adds a real per-request cost)
