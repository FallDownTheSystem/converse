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
  - `gemini-3-pro-preview` (alias: `pro`) - Enhanced reasoning with thinking levels (1M context, 64K output)
  - `gemini-2.5-pro` (alias: `pro 2.5`) - Deep reasoning with thinking budget (1M context, 65K output)
  - `gemini-2.5-flash` (alias: `flash`) - Ultra-fast model with thinking budget (1M context, 65K output)
- **Note**: The short model name `gemini` (and `gemini:flash` / `gemini:pro`) routes to the **Antigravity CLI** (`agy`, OAuth-based access). For Google API access, use specific model names like `gemini-2.5-pro` or `gemini-2.5-flash` (bare `gemini-pro`/`gemini-flash` also route to the Google API).

### X.AI (Grok)
- **API Key Format**: `xai-...` (starts with `xai-`)
- **Get Key**: [console.x.ai](https://console.x.ai/)
- **Environment Variable**: `XAI_API_KEY`
- **Supported Models**:
  - `grok-4-0709` - Latest with image support and web search
  - `grok-code-fast-1` - Speedy and economical reasoning model that excels at agentic coding

### Anthropic (Claude)
- **API Key Format**: `sk-ant-...` (starts with `sk-ant-`)
- **Get Key**: [console.anthropic.com](https://console.anthropic.com/)
- **Environment Variable**: `ANTHROPIC_API_KEY`
- **Supported Models**:
  - `claude-fable-5` (alias `fable`) - Most capable model for demanding reasoning and long-horizon agentic work (1M context, 128K output)
  - `claude-opus-4-8` (alias `opus`) - Most capable Opus for complex reasoning and agentic coding (128K output)
  - `claude-opus-4-7`, `claude-opus-4-6` - Previous Opus generations with adaptive thinking (128K output)
  - `claude-opus-4-5-20251101`, `claude-opus-4-1-20250805` - Legacy Opus models (64K / 32K output)
  - `claude-sonnet-4-6` (alias `sonnet`) - Best combination of speed and intelligence with adaptive thinking (64K output)
  - `claude-sonnet-4-5-20250929` - Legacy Sonnet (64K output)
  - `claude-haiku-4-5-20251001` (alias `haiku`) - Fast and intelligent with extended thinking (64K output)

### Mistral
- **API Key Format**: 32+ character string
- **Get Key**: [console.mistral.ai](https://console.mistral.ai/)
- **Environment Variable**: `MISTRAL_API_KEY`
- **Supported Models**:
  - `mistral-large-latest` - Most capable model
  - `mistral-medium-latest` - Balanced performance
  - `mistral-small-latest` - Fast and efficient
  - `open-mistral-7b`, `open-mixtral-8x7b`, `open-mixtral-8x22b` - Open-source models

### DeepSeek
- **API Key Format**: 32+ character string
- **Get Key**: [platform.deepseek.com](https://platform.deepseek.com/)
- **Environment Variable**: `DEEPSEEK_API_KEY`
- **Supported Models**:
  - `deepseek-chat` - Advanced conversational model
  - `deepseek-coder` - Specialized for code generation

### OpenRouter
- **API Key Format**: `sk-or-...` (starts with `sk-or-`)
- **Get Key**: [openrouter.ai/keys](https://openrouter.ai/keys)
- **Environment Variables**: 
  - `OPENROUTER_API_KEY` - Your API key
  - `OPENROUTER_REFERER` - Required referer URL (e.g., your GitHub repo)
  - `OPENROUTER_TITLE` - Optional title for request tracking
  - `OPENROUTER_DYNAMIC_MODELS` - Enable dynamic model discovery (default: false, required for `provider/model` format)
- **Static Models**: Pre-configured models available without dynamic discovery
  - `qwen/qwen3-235b-a22b-thinking-2507` - Qwen3 235B with thinking capabilities
  - `qwen/qwen3-coder` - Qwen3 specialized for coding
  - `moonshotai/kimi-k2` - Kimi K2 with 200K context window
  - `openrouter/auto` - Auto-selects best model using NotDiamond routing
- **Dynamic Models**: Requires `OPENROUTER_DYNAMIC_MODELS=true` to use any model in `provider/model` format
  - `anthropic/claude-3.5-sonnet`
  - `openai/gpt-4-turbo`
  - `google/gemini-pro`
  - `mistralai/mistral-large`
  - `meta-llama/llama-3.1-405b-instruct`
  - And many more - see [openrouter.ai/models](https://openrouter.ai/models)

### Codex
- **API Key Format**: Optional (uses ChatGPT login by default)
- **Authentication**: ChatGPT login (system-wide) OR `CODEX_API_KEY`
- **Environment Variables**:
  - `CODEX_API_KEY` - Optional API key for headless deployments
  - `CODEX_SANDBOX_MODE` - Filesystem access control (default: read-only)
  - `CODEX_SKIP_GIT_CHECK` - Skip Git repository validation (default: true)
  - `CODEX_APPROVAL_POLICY` - Command approval behavior (default: never)
  - `CODEX_MODEL` - Underlying model for Codex sessions (default: gpt-5.6; e.g. gpt-5.6-terra, gpt-5.6-luna, gpt-5.5)
- **Supported Models**:
  - `codex` - OpenAI Codex agentic coding assistant (GPT-5.6 by default)
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
  - `gemini` (= `gemini:pro`) - Gemini 3.1 Pro
  - `gemini:flash` - Gemini 3.5 Flash
  - `reasoning_effort` selects the variant: `low` → (Low), `medium` → (Medium) for Flash / (High) for Pro, `high`/`max` → (High); unset defaults to (High)

**Key Features:**
- **OAuth Authentication**: Uses your Antigravity Google login instead of API keys
- **Subscription Access**: Leverages the Antigravity weekly compute allowance instead of pay-per-API-call
- **One-shot responses**: The provider shells out to `agy -p` under a pseudo-terminal and returns the full response in a single chunk (no token-level streaming; ~7s minimum per call, ~30-60s for very large prompts)

> Note: This replaces the previous `@google/gemini-cli` (`ai-sdk-provider-gemini-cli`) integration, whose OAuth access Google sunsets on 2026-06-18.

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
    "model": "gemini"
  }
}
```

*Consensus Tool:*
```json
{
  "name": "consensus",
  "arguments": {
    "prompt": "Should we use TypeScript for this component?",
    "models": ["gemini", "gpt-5", "claude-sonnet-4-6"]
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
  - `claude` (aliases: `claude-sdk`, `claude-code`) - Defaults to Claude Fable 5
  - `claude:fable` - Claude Fable 5 explicitly
  - `claude:opus` - Claude Opus 4.8
  - Other `claude:`-prefixed names pass through to the SDK (e.g. `claude:claude-sonnet-4-6`)

**Key Features:**
- **Subscription Access**: Uses your Claude subscription instead of API credits
- **Local File Access**: Reads files directly from the working directory
- **Image Support**: Via the SDK's streaming input mode
- **SDK-Managed Parameters**: `temperature`, `use_websearch`, and `reasoning_effort` are managed internally (ignored if specified)

**Differences from Anthropic API Provider:**
- **Authentication**: Claude Code login vs `ANTHROPIC_API_KEY`
- **Billing**: Claude subscription vs pay-per-use API
- **Model Routing**: `claude` and `claude:*` → SDK provider; specific names (e.g., `claude-fable-5`, `opus`, `sonnet`) → API provider

## Configuration Examples

### Basic Configuration (.env file)
```bash
# Choose one or more providers
OPENAI_API_KEY=sk-proj-your_key_here
ANTHROPIC_API_KEY=sk-ant-your_key_here
MISTRAL_API_KEY=your_mistral_key_here
DEEPSEEK_API_KEY=your_deepseek_key_here

# OpenRouter requires both API key and referer
OPENROUTER_API_KEY=sk-or-your_key_here
OPENROUTER_REFERER=https://github.com/YourUsername/YourApp
# Optional: Enable dynamic model discovery to use any OpenRouter model
OPENROUTER_DYNAMIC_MODELS=true
# Optional: Add title for request tracking
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
        "OPENROUTER_DYNAMIC_MODELS": "true",
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
- **Full Support**: OpenAI, Google, X.AI (Grok-4), Anthropic (Claude-4 series, Claude-3-Opus)
- **Via OpenRouter**: Depends on the underlying model
- **No Support**: DeepSeek, Mistral (except Large), Codex

### Web Search
- **Native Support**: OpenAI, Google, X.AI (Grok-4)
- **No Support**: Anthropic, Mistral, DeepSeek, OpenRouter, Codex

### Thinking/Reasoning Modes
- **OpenAI**: O3 series models support `reasoning_effort` parameter
- **Google**:
  - Gemini 3.0 Pro: Thinking levels (low/high) via `reasoning_effort` - always enabled
  - Gemini 2.5 Pro/Flash: Thinking budget (token-based) via `reasoning_effort`
- **Anthropic**: Claude Fable 5, Opus 4.6+, and Sonnet 4.6 use adaptive thinking (depth controlled by `reasoning_effort` via Anthropic's `effort` parameter); older Claude 4 models use budget-based extended thinking
- **Codex**: Thread-based agentic reasoning with persistent context
- **Others**: Standard inference only

### Local Execution
- **Codex**: Runs locally with direct filesystem access and thread-based sessions
- **All Others**: API-based remote execution

## Model Selection in Tools

When using the chat or consensus tools, specify models using their identifiers:

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

```javascript
// Chat tool examples
{
  "model": "gpt-5",               // OpenAI (keyword match)
  "model": "fable",               // Anthropic (keyword match -> claude-fable-5)
  "model": "opus",                // Anthropic (keyword match -> claude-opus-4-8)
  "model": "sonnet",              // Anthropic (keyword match -> claude-sonnet-4-6)
  "model": "claude",              // Claude Agent SDK (defaults to Claude Fable 5)
  "model": "claude:opus",         // Claude Agent SDK (Claude Opus 4.8)
  "model": "gemini-2.5-pro",      // Google (keyword match)
  "model": "grok-4",              // X.AI (keyword match)
  "model": "mistral-large",       // Mistral (keyword match)
  "model": "deepseek-chat",       // DeepSeek (keyword match)
  "model": "anthropic/claude-sonnet-4",   // OpenRouter (slash format, not in Anthropic)
  "model": "qwen/qwen3-coder",            // OpenRouter (static model)
  "model": "openrouter/auto"              // OpenRouter auto-selection
}

// Consensus tool with multiple providers
{
  "models": [
    {"model": "o3"},
    {"model": "claude-sonnet-4-6"},
    {"model": "gemini-2.5-pro"}
  ]
}
```

## Troubleshooting

### Invalid API Key Errors
- Ensure your API key matches the expected format for each provider
- Check that environment variables are properly set
- Verify API keys are active and have available quota

### Model Not Found
- Use exact model identifiers as listed above
- Some providers support aliases (e.g., "fable" → "claude-fable-5", "opus" → "claude-opus-4-8")
- Note: bare "claude" routes to the Claude Agent SDK provider, not the Anthropic API
- Check provider documentation for model availability in your region

### Rate Limits
- Each provider has different rate limits
- OpenRouter provides unified rate limiting across providers
- Consider using multiple providers for better availability

### OpenRouter Compliance
- The `OPENROUTER_REFERER` header is **required**
- Use your application URL or GitHub repository
- This helps OpenRouter track usage for compliance

### OpenRouter Dynamic Models
- Enable with `OPENROUTER_DYNAMIC_MODELS=true`
- First request to a new model may be slower (fetches capabilities)
- Model capabilities are cached for 24 hours
- Use any model from [openrouter.ai/models](https://openrouter.ai/models)
- Models must use `provider/model` format (e.g., `meta-llama/llama-3.2-90b`)