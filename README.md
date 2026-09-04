# Converse MCP Server

[![npm version](https://img.shields.io/npm/v/converse-mcp-server.svg)](https://www.npmjs.com/package/converse-mcp-server)

An MCP (Model Context Protocol) server that lets Claude talk to other AI models. Use it to chat with models from OpenAI, Google, Anthropic, X.AI, Mistral, DeepSeek, or OpenRouter. You can either talk to one model at a time or get multiple models to weigh in on complex decisions.

## 📋 Requirements

- **Node.js**: Version 20 or higher
- **Package Manager**: npm (or pnpm/yarn)
- **API Keys**: At least one from any supported provider

## 🚀 Quick Start

### Step 1: Get Your API Keys

You need at least one API key from these providers:

| Provider          | Where to Get                                                                 | Example Format          |
| ----------------- | ---------------------------------------------------------------------------- | ----------------------- |
| **OpenAI**        | [platform.openai.com/api-keys](https://platform.openai.com/api-keys)         | `sk-proj-...`           |
| **Google/Gemini** | [makersuite.google.com/app/apikey](https://makersuite.google.com/app/apikey) | `AIzaSy...`             |
| **X.AI**          | [console.x.ai](https://console.x.ai/)                                        | `xai-...`               |
| **Anthropic**     | [console.anthropic.com](https://console.anthropic.com/)                      | `sk-ant-...`            |
| **Mistral**       | [console.mistral.ai](https://console.mistral.ai/)                            | `wfBMkWL0...`           |
| **DeepSeek**      | [platform.deepseek.com](https://platform.deepseek.com/)                      | `sk-...`                |
| **OpenRouter**    | [openrouter.ai/keys](https://openrouter.ai/keys)                             | `sk-or-...`             |
| **Codex**         | ChatGPT login (system-wide)                                                  | Local agentic assistant |

**Note:** Codex uses your ChatGPT login (not an API key). If you have an active ChatGPT session, Codex will work automatically. For headless/server deployments, set `CODEX_API_KEY` in your environment.

### Step 2: Add to Claude Code or Claude Desktop

#### For Claude Code (Recommended)

```bash
# Add the server with your API keys
claude mcp add converse \
  -e OPENAI_API_KEY=your_key_here \
  -e GEMINI_API_KEY=your_key_here \
  -e XAI_API_KEY=your_key_here \
  -e ANTHROPIC_API_KEY=your_key_here \
  -e MISTRAL_API_KEY=your_key_here \
  -e DEEPSEEK_API_KEY=your_key_here \
  -e OPENROUTER_API_KEY=your_key_here \
  -e ENABLE_RESPONSE_SUMMARIZATION=true \
  -e SUMMARIZATION_MODEL=gpt-5-nano \
  -s user \
  npx converse-mcp-server
```

#### For Claude Desktop

Add this configuration to your Claude Desktop settings:

```json
{
  "mcpServers": {
    "converse": {
      "command": "npx",
      "args": ["converse-mcp-server"],
      "env": {
        "OPENAI_API_KEY": "your_key_here",
        "GEMINI_API_KEY": "your_key_here",
        "XAI_API_KEY": "your_key_here",
        "ANTHROPIC_API_KEY": "your_key_here",
        "MISTRAL_API_KEY": "your_key_here",
        "DEEPSEEK_API_KEY": "your_key_here",
        "OPENROUTER_API_KEY": "your_key_here",
        "ENABLE_RESPONSE_SUMMARIZATION": "true",
        "SUMMARIZATION_MODEL": "gpt-5-nano"
      }
    }
  }
}
```

**Windows Troubleshooting**: If `npx converse-mcp-server` doesn't work on Windows, try:

```json
{
  "command": "cmd",
  "args": ["/c", "npx", "converse-mcp-server"],
  "env": {
    "ENABLE_RESPONSE_SUMMARIZATION": "true",
    "SUMMARIZATION_MODEL": "gpt-5-nano"
    // ... add your API keys here
  }
}
```

### Step 3: Start Using Converse

Once installed, you can:

- **Chat with a specific model**: Ask Claude to use the chat tool with your preferred model
- **Get consensus**: Ask Claude to use the chat tool with `mode: "consensus"` when you need multiple perspectives
- **Run tasks in background**: Use `async: true` for long-running operations that you can check later
- **Monitor progress**: Use the check_status tool to monitor async operations with AI-generated summaries
- **Cancel jobs**: Use the cancel_job tool to stop running operations
- **Smart summaries**: Get auto-generated titles and summaries for better context understanding
- **Get help**: Type `/converse:help` in Claude

## 🛠️ Available Tools

### 1. Chat Tool

One tool, three modes. Pass a `models` array and choose a `mode`. Supports files, images, conversation history, and background execution. The tool routes each model to the right provider by name; `"auto"` picks the first available provider. When AI summarization is enabled, it generates smart titles and summaries.

```javascript
// mode "chat" (default) — 1..N models answer independently, in parallel
{
  "prompt": "How should I structure the authentication module for this Express.js API?",
  "models": ["gemini-2.5-flash"],      // Routes to Google
  "files": ["/path/to/src/auth.js", "/path/to/config.json"],
  "images": ["/path/to/architecture.png"],
  "reasoning_effort": "medium"
}

// mode "consensus" — ≥2 models answer, then refine after seeing each other
{
  "prompt": "Should we use microservices or a monolith for our e-commerce platform?",
  "models": ["gpt-5.6", "gemini-2.5-flash", "grok-4.5"],
  "mode": "consensus",
  "files": ["/path/to/requirements.md"]
}

// mode "roundtable" — models speak SEQUENTIALLY in the given order, each seeing
// the running transcript. One call = one lap; pass continuation_id for more laps.
{
  "prompt": "Critique this caching strategy and propose improvements.",
  "models": ["codex", "gemini", "claude"],  // ORDER MATTERS
  "mode": "roundtable"
}

// Asynchronous execution (for long-running tasks) — any mode
{
  "prompt": "Analyze this large codebase and provide optimization recommendations",
  "models": ["gpt-5.6"],
  "files": ["/path/to/large-project"],
  "async": true,                         // Enables background processing
  "continuation_id": "my-analysis-task"  // Optional: custom ID for tracking
}
```

**Codex Notes:**

- Uses thread-based sessions in `chat` mode (context persists with `continuation_id`)
- Responses typically take 6-20 seconds (complex tasks may take minutes)
- Accesses files directly from your working directory
- Configure sandbox mode via `CODEX_SANDBOX_MODE` environment variable

### 2. Check Status Tool

Monitor the progress and retrieve results from asynchronous operations. When AI summarization is enabled, provides intelligent summaries of ongoing and completed tasks.

```javascript
// Check status of a specific job
{
  "continuation_id": "my-analysis-task"
}

// List recent jobs (shows last 10)
// With summarization enabled, displays titles and final summaries
{}

// Get full conversation history for completed job
{
  "continuation_id": "my-analysis-task",
  "full_history": true
}
```

### 3. Cancel Job Tool

Cancel running asynchronous operations when needed.

```javascript
// Cancel a running job
{
  "continuation_id": "my-analysis-task"
}
```

## 🤖 AI Summarization Feature

When enabled, the server automatically generates intelligent titles and summaries for better context understanding:

- **Automatic Title Generation**: Creates descriptive titles (up to 60 chars) for each request
- **Streaming Summaries**: Status check returns an up-to-date summary of the progress based on the partially streamed response
- **Final Summaries**: Concise 1-2 sentence summaries of completed responses
- **Smart Status Display**: Enhanced check_status tool shows titles and summaries in job listings
- **Persistent Context**: Summaries are stored with async jobs for better progress tracking

**Configuration**:

```bash
# Enable in your environment
ENABLE_RESPONSE_SUMMARIZATION=true    # Default: false
SUMMARIZATION_MODEL=gpt-5-nano        # Default: gpt-5-nano
```

**Benefits**:

- Quickly understand what each async job is doing without reading full responses
- Better context when reviewing multiple ongoing operations
- Improved job management with at-a-glance understanding of task progress
- Graceful fallback to text snippets when summarization is disabled or fails

## 📊 Supported Models

### OpenAI Models

- **gpt-5.6-sol** (default; aliases: `gpt-5.6`, `gpt-5`, `sol`): Flagship GPT-5.6 (1M context, 128K output) - Frontier reasoning, coding, and agentic workflows
- **gpt-5.6-terra** (alias: `terra`): Lower-cost GPT-5.6 (400K context, 128K output) - Performance competitive with the flagship at half the price
- **gpt-5.6-luna** (alias: `luna`): Fastest, most affordable GPT-5.6 (400K context, 128K output) - High-volume, latency-sensitive workloads
- **gpt-5.4**: Flagship-class reasoning (1M context, 128K output)
- **gpt-5.4-pro** (alias: `gpt-5-pro`): Maximum-performance reasoning (1M context, 272K output) - Hardest problems, extended compute time (EXPENSIVE)
- **gpt-5-mini**, **gpt-5-nano**: Faster, cost-efficient GPT-5 tiers (400K context, 128K output)
- **gpt-5.4-mini**, **gpt-5.4-nano**: Fast, efficient GPT-5.4 tiers (400K context, 128K output)
- **o3**, **o3-pro**, **o4-mini**: Advanced reasoning models (200K context)
- **gpt-4.1**: Large context (1M tokens, 32K output)
- **o3-deep-research** (30-90 min runtime), **o4-mini-deep-research** (15-60 min runtime): Deep research models (200K context)

### Google/Gemini Models

**API Key Options**:

- **GEMINI_API_KEY**: For Gemini Developer API (recommended)
- **GOOGLE_API_KEY**: Alternative name (GEMINI_API_KEY takes priority)
- **Vertex AI**: Use `GOOGLE_GENAI_USE_VERTEXAI=true` with project/location settings

**Supported Models**:

- **gemini-3.1-pro-preview** (aliases: `pro`, `gemini-pro`): Most advanced reasoning with expanded thinking levels (1M context, 64K output)
- **gemini-3.5-flash** (aliases: `gemini-3.5`, `flash-3.5`): Frontier-level agentic and coding performance at Flash speed (1M context, 65K output)
- **gemini-3.8-flash** (aliases: `gemini-3.8`, `flash-3.8`): Current-generation Flash with stronger long-horizon agentic performance (1M context, 65K output; thinking levels low/medium/high — no minimal)
- **gemini-2.5-pro** (alias: `pro 2.5`): Deep reasoning with thinking budget (1M context, 65K output)
- **gemini-2.5-flash** (alias: `flash`): Ultra-fast (1M context, 65K output)
- **gemini-2.5-flash-lite** (alias: `flash-lite`): Lightweight fast model (1M context, 65K output)

**Note**: The bare aliases `pro` and `gemini-pro` route to Gemini 3.1 Pro through the Google API. The short name `gemini` (and `gemini:pro`/`gemini:flash`) routes to the Antigravity CLI provider instead — see below.

### X.AI/Grok Models

- **grok-4.5** (default; aliases: `grok`, `grok-4.5-latest`, `grok-build-latest`): Flagship model with image input, reasoning content, and native web/X search (500K context). Reasoning maps to `low`/`medium`/`high` and cannot be disabled; web search is automatic. Older Grok IDs still pass through as explicit model strings.

### Anthropic Models

- **claude-fable-5** (alias: `fable`): Most capable model for demanding reasoning and long-horizon agentic work (1M context, 128K output)
- **claude-opus-4-8** (alias: `opus`): Most capable Opus for complex reasoning and agentic coding (200K context, 1M via beta, 128K output)
- **claude-opus-4-7** / **claude-opus-4-6**: Previous Opus generations with adaptive thinking (128K output)
- **claude-opus-4-5** / **claude-opus-4-1**: Legacy Opus models with extended thinking (64K / 32K output)
- **claude-sonnet-4-6** (alias: `sonnet`): Best combination of speed and intelligence with adaptive thinking (64K output)
- **claude-haiku-4-5** (alias: `haiku`): Fast and intelligent for simple queries (64K output)

### Mistral Models

- **mistral-medium-3-5** (default; aliases: `mistral`, `mistral-medium`): Frontier-class multimodal model with adjustable reasoning (256K context)
- **mistral-small-2603** (alias: `mistral-small`): Hybrid multimodal model unifying instruct, reasoning, and coding (256K context)
- **mistral-large-2512** (alias: `mistral-large`): Open-weight MoE flagship, image-capable, no adjustable reasoning (256K context)

Reasoning maps to `high` (enabled) or `none` (disabled) on Medium 3.5 and Small; Large has no adjustable reasoning.

### DeepSeek Models

- **deepseek-v4-pro** (default; aliases: `deepseek`, `deepseek-pro`): Flagship MoE model with thinking mode (1M context, 384K max output, text-only)
- **deepseek-v4-flash** (alias: `deepseek-flash`): Faster, lower-cost V4 tier with thinking mode (1M context, 384K max output, text-only)

Thinking mode maps `reasoning_effort` to `none` (off), `high` (enabled levels), or `max`.

### OpenRouter Models

- **z-ai/glm-5.2** (default; aliases: `glm`, `glm-5.2`): Large-scale reasoning model, text-only (1M context)
- **deepseek/deepseek-v4-pro**, **deepseek/deepseek-v4-flash**: DeepSeek V4 reasoning tiers, text-only (1M context)
- **qwen/qwen3.7-max**, **qwen/qwen3.7-plus**: Flagship Qwen tiers (1M context; `plus` is image-capable)
- **moonshotai/kimi-k2.7-code**, **moonshotai/kimi-k2.6**: Image-capable Moonshot models (256K context; `k2.7-code` always reasons)
- **openrouter/auto**: Auto-selects the best model for your prompt

Any other model works via its full `provider/model` slug or the `openrouter:` namespace — no extra configuration. Append `:online` to a slug to opt into web search (adds a real per-request cost).

### Codex Models

- **codex**: OpenAI Codex agentic coding assistant (GPT-6 Astra by default)
  - Pick another backend per request with `codex:<model>` (e.g. `codex:sol`, `codex:gpt-5.6-terra`) or globally with `CODEX_MODEL`; backends: `gpt-6-astra` (alias `astra`), `gpt-5.6-sol` (`sol`), `gpt-5.6-terra` (`terra`), `gpt-5.6-luna` (`luna`), `gpt-5.5`, `gpt-5.3-codex-spark` (`spark`)
  - `reasoning_effort` maps onto the tiers the chosen backend accepts (GPT-6 Astra: `low` through `max`, no `none`)
  - Thread-based sessions with persistent context
  - Direct filesystem access from working directory
  - Typical response time: 6-20 seconds (longer for complex tasks)
  - Requires ChatGPT login or CODEX_API_KEY
  - See [Configuration](#configuration) for sandbox and approval settings

### Claude Agent SDK Models

- **claude** (aliases: `claude-sdk`, `claude-code`): Claude via the Claude Agent SDK
  - Defaults to Claude Fable 5; pick a specific model with `claude:fable` or `claude:opus`
  - Uses Claude Code CLI authentication (`claude login`) - no API key needed
  - Direct filesystem access from working directory
  - Unknown `claude:`-prefixed names pass through to the SDK (e.g. `claude:claude-sonnet-4-6`)

### GitHub Copilot SDK Models

Reach these with the `copilot:` namespace (e.g. `copilot:gpt-5.6-terra`); uses your GitHub Copilot subscription (`gh auth login`) - no API key needed:

- **OpenAI**: `gpt-5.6-sol` (aliases: `gpt-5.6`, `gpt-5`), `gpt-5.6-terra`, `gpt-5.6-luna` (all support `reasoning_effort`)
- **Anthropic**: `claude-fable-5` (alias: `fable`), `claude-sonnet-5` (alias: `sonnet`), `claude-opus-4.8` (aliases: `opus`, `claude`)
- **Google**: `gemini-3.1-pro-preview` (aliases: `gemini`, `gemini-3.1-pro`), `gemini-3.8-flash` (aliases: `gemini-3.8`, `flash-3.8`), `gemini-3.5-flash` (alias: `gemini-flash`)
- Any other `copilot:<id>` is forwarded to the Copilot backend verbatim

## 📚 Help & Documentation

### Built-in Help

Type these commands directly in Claude:

- `/converse:help` - Full documentation
- `/converse:help tools` - Tool-specific help (includes async features)
- `/converse:help models` - Model information
- `/converse:help parameters` - Configuration details
- `/converse:help examples` - Usage examples (sync and async)
- `/converse:help async` - Async execution guide

### Additional Resources

- **API Reference**: [docs/API.md](docs/API.md)
- **Architecture Guide**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Integration Examples**: [docs/EXAMPLES.md](docs/EXAMPLES.md)

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in your project root:

```bash
# Required: At least one API key
OPENAI_API_KEY=sk-proj-your_openai_key_here
GEMINI_API_KEY=your_gemini_api_key_here  # Or GOOGLE_API_KEY (GEMINI_API_KEY takes priority)
XAI_API_KEY=xai-your_xai_key_here
ANTHROPIC_API_KEY=sk-ant-your_anthropic_key_here
MISTRAL_API_KEY=your_mistral_key_here
DEEPSEEK_API_KEY=your_deepseek_key_here
OPENROUTER_API_KEY=sk-or-your_openrouter_key_here

# Optional: Server configuration
PORT=3157
LOG_LEVEL=info

# Optional: AI Summarization (Enhanced async status display)
ENABLE_RESPONSE_SUMMARIZATION=true    # Enable AI-generated titles and summaries
SUMMARIZATION_MODEL=gpt-5-nano        # Model to use for summarization (default: gpt-5-nano)

# Optional: OpenRouter attribution (for ranking credit; both optional)
OPENROUTER_REFERER=https://github.com/FallDownTheSystem/converse
OPENROUTER_TITLE=Converse

# Optional: Codex configuration
CODEX_API_KEY=your_codex_api_key_here       # Optional if ChatGPT login available
CODEX_SANDBOX_MODE=read-only                 # read-only (default), workspace-write, danger-full-access
CODEX_SKIP_GIT_CHECK=true                    # true (default), false
CODEX_APPROVAL_POLICY=never                  # never (default), untrusted, on-failure, on-request
CODEX_MODEL=gpt-6-astra                      # gpt-6-astra (default), gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5
```

### Configuration Options

#### Server Environment Variables (.env file)

| Variable    | Description   | Default | Example                  |
| ----------- | ------------- | ------- | ------------------------ |
| `PORT`      | Server port   | `3157`  | `3157`                   |
| `LOG_LEVEL` | Logging level | `info`  | `debug`, `info`, `error` |

#### Claude Code Environment Variables (System/Global)

These must be set in your system environment or when launching Claude Code, NOT in the project .env file:

| Variable                             | Description                                                             | Default                         | Example                     |
| ------------------------------------ | ----------------------------------------------------------------------- | ------------------------------- | --------------------------- |
| `MAX_MCP_OUTPUT_TOKENS`              | Token response limit                                                    | `25000`                         | `200000`                    |
| `MCP_TOOL_TIMEOUT`                   | Wall-clock limit per tool call (ms)                                     | ~28 hours when unset            | `7200000` (2 h)             |
| `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT`  | Idle window (ms) — aborts a call that produces no output for this long  | 30 min (stdio) / 5 min (HTTP)   | `3600000` (60 min)          |

```bash
# Example: Set globally before starting Claude Code
export MAX_MCP_OUTPUT_TOKENS=200000
export CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT=3600000  # 60 min for long silent agentic calls
claude  # Then start Claude Code
```

Or persist them in `~/.claude/settings.json`:

```json
{
	"env": {
		"MAX_MCP_OUTPUT_TOKENS": "200000",
		"CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT": "3600000"
	}
}
```

**The idle timeout is usually what kills long calls.** Agentic models (Codex, Claude Agent SDK) can work silently for 30+ minutes; Converse holds one MCP request open the whole time, and Claude Code aborts it after the idle window with an error like _"failed after 30 minutes of silence. The idle timeout aborted it."_ Progress-notification heartbeats can't prevent this — Claude Code doesn't send a `progressToken` on `tools/call`, so an MCP server has no spec-compliant way to emit them ([claude-code#58687](https://github.com/anthropics/claude-code/issues/58687)). Raising the idle window is the only fix.

#### Codex CLI Tool Timeout

If you register Converse in OpenAI's Codex CLI, note that Codex enforces its own **hard 300-second default** per MCP tool call (`tool_timeout_sec`, undocumented — it exists only in Codex's config schema). Progress notifications don't extend it. Raise it in `~/.codex/config.toml`:

```toml
[mcp_servers.converse]
# ... command/env ...
tool_timeout_sec = 3600  # default 300 kills long calls at 5 minutes
```

### Model Selection

Use `"auto"` for automatic model selection, or specify exact models:

```javascript
// Auto-selection (recommended)
"auto";

// Specific models
"gemini-2.5-flash";
"gpt-5.6";
"grok-4.5";
"z-ai/glm-5.2"; // -> OpenRouter (full slug)
"z-ai/glm-5.2:online"; // -> OpenRouter with web search opt-in

// Using aliases
"flash"; // -> gemini-2.5-flash
"pro"; // -> gemini-3.1-pro-preview
"grok"; // -> grok-4.5
"deepseek"; // -> deepseek-v4-pro
"mistral"; // -> mistral-medium-3-5
"fable"; // -> claude-fable-5 (Anthropic API)
"opus"; // -> claude-opus-4-8 (Anthropic API)

// SDK providers (subscription-based, no API key)
"claude"; // -> Claude Agent SDK (Claude Fable 5)
"claude:opus"; // -> Claude Agent SDK (Claude Opus 4.8)
"copilot:gpt-5.6-terra"; // -> GitHub Copilot SDK
```

**Auto Model Behavior:**

- **chat mode**: `["auto"]` selects the first available provider and uses its default model
- **consensus mode**: `["auto"]` automatically expands to the first 3 available providers

Provider priority order (subscription-based SDK providers first, then API-key providers):

1. Codex (`codex`)
2. Gemini via Antigravity CLI (`gemini` → Gemini 3.8 Flash, `gemini:pro`)
3. Claude Agent SDK (`claude` → Claude Fable 5)
4. Copilot (`copilot`)
5. OpenAI (`gpt-5.6`)
6. Google (`gemini-pro`)
7. XAI (`grok-4.5`)
8. Anthropic (`claude-sonnet-4-20250514`)
9. Mistral (`mistral-medium-3-5`)
10. DeepSeek (`deepseek-v4-pro`)
11. OpenRouter (`z-ai/glm-5.2`)

The system will use the first 3 providers that are available (authenticated SDK or valid API key). This enables automatic multi-model consensus without manually specifying models.

### Advanced Configuration

#### Manual Installation Options

##### Option A: Direct Node.js execution

If you've cloned the repository locally:

```json
{
  "mcpServers": {
    "converse": {
      "command": "node",
      "args": [
        "C:\\Users\\YourUsername\\Documents\\Projects\\converse\\src\\index.js"
      ],
      "env": {
        "OPENAI_API_KEY": "your_key_here",
        "GEMINI_API_KEY": "your_key_here",
        "XAI_API_KEY": "your_key_here",
        "ANTHROPIC_API_KEY": "your_key_here",
        "MISTRAL_API_KEY": "your_key_here",
        "DEEPSEEK_API_KEY": "your_key_here",
        "OPENROUTER_API_KEY": "your_key_here"
      }
    }
  }
}
```

##### Option B: Local HTTP Development (Advanced)

For local development with HTTP transport (optional, for debugging):

1. **First, start the server manually with HTTP transport**:

   ```bash
   # In a terminal, navigate to the project directory
   cd converse
   MCP_TRANSPORT=http npm run dev  # Starts server on http://localhost:3157/mcp
   ```

2. **Then configure Claude to connect to it**:
   ```json
   {
     "mcpServers": {
       "converse-local": {
         "url": "http://localhost:3157/mcp"
       }
     }
   }
   ```

**Important**: HTTP transport requires the server to be running before Claude can connect to it. Keep the terminal with the server open while using Claude.

### Configuration File Locations

The Claude configuration file is typically located at:

- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

For more detailed instructions, see the [official MCP configuration guide](https://docs.anthropic.com/en/docs/claude-code/mcp#configure-mcp-servers).

## 💻 Running Standalone (Without Claude)

You can run the server directly without Claude for testing or development:

```bash
# Quick run (no installation needed)
npx converse-mcp-server

# Alternative package managers
pnpm dlx converse-mcp-server
yarn dlx converse-mcp-server
```

For development setup, see the [Development](#-development) section below.

## 🐛 Troubleshooting

### Common Issues

**Server won't start:**

- Check Node.js version: `node --version` (needs v20+)
- Try a different port: `PORT=3001 npm start`

**API key errors:**

- Verify your .env file has the correct format
- Test with: `npm run test:real-api`

**Module import errors:**

- Clear cache and reinstall: `npm run clean`

**Long tool calls aborted mid-run (idle/timeout errors):**

- The abort almost always comes from the MCP _client_, not Converse — Converse's own limits are 30 min per provider call and 90 min per async job.
- Claude Code: raise `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT` (idle window, default 30 min stdio / 5 min HTTP) and check `MCP_TOOL_TIMEOUT` (wall-clock). See [Claude Code Environment Variables](#claude-code-environment-variables-systemglobal).
- Codex CLI: set `tool_timeout_sec` under `[mcp_servers.converse]` in `~/.codex/config.toml` — the undocumented default is 300 seconds.
- Immune alternative: run the call with `async: true` and poll `check_status` — each poll is a fresh short request, so no client timeout applies.

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev

# Start with debugger
npm run debug

# Trace all operations
LOG_LEVEL=trace npm run dev
```

## 🔧 Development

### Getting Started

```bash
# Clone the repository
git clone https://github.com/FallDownTheSystem/converse.git
cd converse
npm install

# Copy environment file and add your API keys
cp .env.example .env

# Start development server
npm run dev
```

### Scripts Available

```bash
# Server management
npm start              # Start server (auto-kills existing server on port 3157)
npm run start:clean    # Start server without killing existing processes
npm run start:port     # Start server on port 3001 (avoids port conflicts)
npm run dev            # Development with hot reload (auto-kills existing server)
npm run dev:clean      # Development without killing existing processes
npm run dev:port       # Development on port 3001 (avoids port conflicts)
npm run dev:quiet      # Development with minimal logging
npm run kill-server    # Kill any server running on port 3157

# Testing
npm test               # Run all tests
npm run test:unit      # Unit tests only
npm run test:integration # Integration tests
npm run test:e2e       # End-to-end tests (requires API keys)

# Integration test subcategories
npm run test:integration:mcp        # MCP protocol tests
npm run test:integration:tools      # Tool integration tests
npm run test:integration:providers  # Provider integration tests
npm run test:integration:performance # Performance tests
npm run test:integration:general    # General integration tests

# Other test categories
npm run test:mcp-client # MCP client tests (HTTP-based)
npm run test:providers # Provider unit tests
npm run test:tools     # Tool tests
npm run test:coverage  # Coverage report
npm run test:watch     # Run tests in watch mode

# Code quality
npm run lint           # Check code style
npm run lint:fix       # Fix code style issues
npm run format         # Format code with ESLint (alias for lint:fix)
npm run validate       # Full validation (lint + test)

# Utilities
npm run build          # Build for production
npm run debug          # Start with debugger
npm run check-deps     # Check for outdated dependencies
npm run kill-server    # Kill any server running on port 3157
```

### Development Notes

**Port conflicts**: The server uses port 3157 by default. If you get an "EADDRINUSE" error:

- Run `npm run kill-server` to free the port
- Or use a different port: `PORT=3001 npm start`

**Transport Modes**:

- **Stdio** (default): Works automatically with Claude
- **HTTP**: Better for debugging, requires manual start (`MCP_TRANSPORT=http npm run dev`)

### Testing with Real APIs

After setting up your API keys in `.env`:

```bash
# Run end-to-end tests
npm run test:e2e

# Test specific providers
npm run test:integration:providers

# Full validation
npm run validate
```

### Validation Steps

After installation, run these tests to verify everything works:

```bash
npm start           # Should show startup message
npm test            # Should pass all unit tests
npm run validate    # Full validation suite
```

### Project Structure

```
converse/
├── src/
│   ├── index.js              # Main server entry point
│   ├── config.js             # Configuration management
│   ├── router.js             # Central request dispatcher
│   ├── continuationStore.js  # State management
│   ├── systemPrompts.js      # Tool system prompts
│   ├── providers/            # AI provider implementations
│   │   ├── index.js          # Provider registry
│   │   ├── interface.js      # Unified provider interface
│   │   ├── openai.js         # OpenAI provider
│   │   ├── xai.js            # XAI provider
│   │   ├── google.js         # Google provider
│   │   ├── anthropic.js      # Anthropic provider
│   │   ├── mistral.js        # Mistral AI provider
│   │   ├── deepseek.js       # DeepSeek provider
│   │   ├── openrouter.js     # OpenRouter provider
│   │   ├── openrouter-discovery.js # Request-local OpenRouter slug discovery
│   │   ├── openai-compatible.js # Base for OpenAI-compatible APIs
│   │   ├── codex.js          # Codex agentic SDK provider
│   │   ├── claude.js         # Claude Agent SDK provider
│   │   ├── gemini-cli.js     # Gemini via Antigravity CLI provider
│   │   └── copilot.js        # GitHub Copilot SDK provider
│   ├── tools/                # MCP tool implementations
│   │   ├── index.js          # Tool registry
│   │   ├── chat.js           # Unified chat tool (chat/consensus/roundtable modes)
│   │   └── modes/            # parallel.js + roundtable.js execution engines
│   └── utils/                # Utility modules
│       ├── contextProcessor.js # File/image processing
│       ├── errorHandler.js   # Error handling
│       └── logger.js         # Logging utilities
├── tests/                    # Comprehensive test suite
├── docs/                     # API and architecture docs
└── package.json              # Dependencies and scripts
```

## 📦 Publishing to NPM

> **Note**: This section is for maintainers. The package is already published as `converse-mcp-server`.

### Quick Publishing Checklist

```bash
# 1. Ensure clean working directory
git status

# 2. Run full validation
npm run validate

# 3. Test package contents
npm pack --dry-run

# 4. Test bin script
node bin/converse.js --help

# 5. Bump version (choose one)
npm version patch    # Bug fixes: 1.0.1 → 1.0.2
npm version minor    # New features: 1.0.1 → 1.1.0
npm version major    # Breaking changes: 1.0.1 → 2.0.0

# 6. Test publish (dry run)
npm publish --dry-run

# 7. Publish to npm
npm publish

# 8. Verify publication
npm view converse-mcp-server
npx converse-mcp-server --help
```

### Version Guidelines

- **Patch** (`npm version patch`): Bug fixes, documentation updates, minor improvements
- **Minor** (`npm version minor`): New features, new model support, new tool capabilities
- **Major** (`npm version major`): Breaking API changes, major architecture changes

### Post-Publication

After publishing, update installation instructions if needed and verify:

```bash
# Test direct execution
npx converse-mcp-server
npx converse

# Test MCP client integration
# Update Claude Desktop config to use: "npx converse-mcp-server"
```

### Troubleshooting Publication

- **Git not clean**: Commit all changes first
- **Tests failing**: Fix issues before publishing
- **Version conflicts**: Check existing versions with `npm view converse-mcp-server versions`
- **Permission issues**: Ensure you're logged in with `npm whoami`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `npm run validate`
5. Commit changes: `git commit -m 'Add amazing feature'`
6. Push to branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Development Setup

```bash
# Fork and clone your fork
git clone https://github.com/yourusername/converse.git
cd converse

# Install dependencies
npm install

# Create feature branch
git checkout -b feature/your-feature

# Make changes and test
npm run validate

# Commit and push
git add .
git commit -m "Description of changes"
git push origin feature/your-feature
```

## 🙏 Acknowledgments

This MCP Server was inspired by and builds upon the excellent work from [BeehiveInnovations/zen-mcp-server](https://github.com/BeehiveInnovations/zen-mcp-server).

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔗 Links

- **GitHub**: https://github.com/FallDownTheSystem/converse
- **Issues**: https://github.com/FallDownTheSystem/converse/issues
- **NPM Package**: https://www.npmjs.com/package/converse-mcp-server
