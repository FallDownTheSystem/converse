# Converse MCP Server - API Reference

## Overview

The Converse MCP Server exposes three tools through the Model Context Protocol (MCP):

1. **Chat Tool** (`chat`) — a single conversational tool with three execution modes:
   - **`chat`** (default): 1..N models answer independently, in parallel.
   - **`consensus`**: ≥2 models answer in parallel, then refine their answers after seeing each other.
   - **`roundtable`**: models answer sequentially, each building on the running transcript.
2. **Check Status Tool** (`check_status`) — monitor and retrieve results from asynchronous jobs.
3. **Cancel Job Tool** (`cancel_job`) — cancel a running background job.

The chat tool runs **synchronously** (immediate response) or **asynchronously** (`async: true`, background processing polled with `check_status`). When AI summarization is enabled, the server generates titles and summaries for better context tracking.

## Transport Protocols

The server supports two transport modes:

### HTTP Transport (Default)
- **Endpoint**: `http://localhost:3157/mcp`
- **Protocol**: HTTP streaming with JSON-RPC 2.0
- **Usage**: Best for development, debugging, and web integrations
- **Features**: Health endpoints, CORS support, session management

### Stdio Transport (Legacy)
- **Protocol**: Standard input/output with JSON-RPC 2.0
- **Usage**: Traditional MCP client integrations
- **Features**: Process-based communication, lower latency

**Transport Selection:**
```bash
# Default (HTTP)
npm start

# Explicit HTTP
npm start -- --transport=http

# Stdio transport
npm start -- --transport=stdio

# Environment variable
MCP_TRANSPORT=stdio npm start
```

## Chat Tool

**Description**: Talk to one or more AI models. The `mode` parameter selects how the models are orchestrated. Supports files, images, reasoning control, background execution, disk export, and multi-turn threads via `continuation_id`.

### Request Schema

```json
{
  "type": "object",
  "properties": {
    "prompt": {
      "type": "string",
      "description": "Your question, topic, or task with relevant context. Example: 'How should I structure the authentication module for this Express.js API?'"
    },
    "models": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 1,
      "description": "Models to use, as plain name strings. Examples: ['auto'], ['codex'], ['codex', 'gemini', 'claude']. Default: ['auto']."
    },
    "mode": {
      "type": "string",
      "enum": ["chat", "consensus", "roundtable"],
      "description": "Execution mode. 'chat' (default): independent parallel answers. 'consensus': >=2 models answer then refine via cross-feedback. 'roundtable': sequential turn-based dialogue in the given model order. Default: 'chat'."
    },
    "continuation_id": {
      "type": "string",
      "description": "Continuation ID for a persistent multi-turn thread. Auto-generated in the first response; pass it back to continue. You MAY change the mode or models on a resuming turn."
    },
    "files": {
      "type": "array",
      "items": { "type": "string" },
      "description": "File paths to include as context (absolute or relative). Supports line ranges: file.txt{10:50}, file.txt{100:}. Example: ['./src/utils/auth.js{50:100}', './config.json']."
    },
    "images": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Image paths for visual context (absolute or relative paths, or base64 data). Example: ['C:\\Users\\username\\diagram.png', './screenshot.jpg', 'data:image/jpeg;base64,/9j/4AAQ...']."
    },
    "reasoning_effort": {
      "type": "string",
      "enum": ["none", "minimal", "low", "medium", "high", "max"],
      "description": "Reasoning depth for thinking models. 'none' (fastest, GPT-5.1+ only), 'minimal', 'low', 'medium' (balanced), 'high', 'max'. Default: 'medium'."
    },
    "async": {
      "type": "boolean",
      "description": "Execute in the background. When true, returns a continuation_id immediately and processes the request asynchronously; poll with check_status. Default: false."
    },
    "export": {
      "type": "boolean",
      "description": "Export the conversation to disk. Creates a folder named for the continuation_id with numbered request/response files and metadata. Default: false."
    }
  },
  "required": ["prompt"]
}
```

Only `prompt` is required. `models` defaults to `["auto"]`, `mode` to `"chat"`, and `reasoning_effort` to `"medium"`.

### Validation Rules

- `models` must be a non-empty array of non-empty strings.
- Duplicate model entries are rejected in `chat` and `consensus` modes; they are allowed only in `roundtable` (a model may talk to itself across turns).
- `consensus` mode requires at least **2 available** models after resolution. A single explicit model is rejected — use `chat` mode instead. `["auto"]` is valid in consensus when 2+ providers are configured (it expands to the first 3 available providers).

### Modes

**`chat` (default) — independent parallel answers**

Each model is invoked in parallel and answers independently; models never see each other. With a single model (or `["auto"]`), the response is that model's answer, with automatic provider failover for `"auto"` and Codex thread reuse across turns. With multiple models, the response contains one labeled `### <model>:` section per successful model.

**`consensus` — parallel answers, then cross-feedback refinement**

All models answer the prompt in parallel (phase 1). A cross-feedback refinement phase then always runs when at least 2 phase-1 responses succeed: each model sees the others' answers and refines its own. The result reports both the initial and refined responses. A single `["auto"]` spec expands to the first 3 available providers' default models.

**`roundtable` — sequential turn-based dialogue**

Models respond one after another in the exact order given, and each model sees the full running transcript of every turn before it. One tool call runs exactly **one lap** (one turn per model). Pass the returned `continuation_id` to run more laps; every lap appends to one shared, accumulating transcript. A turn that fails is recorded with a note and does not abort the lap.

### Response Format

**Synchronous — `chat` mode:** the content is a status line, a `continuation_id:` line, then the answer (the status line is omitted in the test environment).

```
✅ COMPLETED | CHAT | conv_abc123 | 2.4s elapsed | openai/gpt-5.6-sol
continuation_id: conv_abc123

<model answer text>
```

```json
{
  "content": "…status line + continuation_id + answer…",
  "continuation": {
    "id": "conv_abc123",
    "messageCount": 2,
    "provider": "openai",
    "model": "gpt-5.6-sol"
  }
}
```

For a multi-model `chat` request, the status line reports `N/M succeeded` and lists the models, and `continuation.models` replaces `provider`/`model`.

**Synchronous — `consensus` mode:** a status line and `continuation_id:` line, followed by a JSON result object.

```
✅ COMPLETED | CONSENSUS | conv_xyz789 | 6.1s elapsed | 3/3 succeeded | gpt-5.6, gemini-2.5-pro, grok-4.5
continuation_id: conv_xyz789

{
  "status": "consensus_complete",
  "models_consulted": 3,
  "successful_initial_responses": 3,
  "failed_responses": 0,
  "refined_responses": 3,
  "phases": {
    "initial": [
      {
        "model": "gpt-5.6",
        "status": "success",
        "response": "Initial analysis…"
      }
    ],
    "refined": [
      {
        "model": "gpt-5.6",
        "status": "success",
        "initial_response": "Initial analysis…",
        "refined_response": "After considering the other perspectives…"
      }
    ],
    "failed": []
  },
  "continuation": {
    "id": "conv_xyz789",
    "messageCount": 3
  },
  "settings": {
    "models_requested": ["gpt-5.6", "gemini-2.5-pro", "grok-4.5"]
  }
}
```

**Synchronous — `roundtable` mode:** a status line, `continuation_id:` line, and a JSON result object whose top-level `content` holds the rendered transcript.

```
✅ COMPLETED | ROUNDTABLE | conv_abc123 | 3.2s elapsed | 2/2 turns | codex, gemini
continuation_id: conv_abc123

{
  "status": "roundtable_complete",
  "content": "…full rendered transcript of the lap…",
  "models_consulted": 2,
  "successful_turns": 2,
  "failed_turns": 0,
  "turns": [
    { "model": "codex", "provider": "codex", "status": "success", "response": "Opening analysis…" },
    { "model": "gemini", "provider": "gemini-cli", "status": "success", "response": "Building on codex's point…" }
  ],
  "continuation": {
    "id": "conv_abc123",
    "messageCount": 3
  },
  "settings": {
    "models_requested": ["codex", "gemini"]
  }
}
```

**Asynchronous (any mode, `async: true`):**
```json
{
  "content": "⏳ SUBMITTED | CONSENSUS | conv_xyz789 | 1/1 | Started: 01/12/2026 10:30:00 | \"Architecture Review\" | gpt-5.6, gemini-2.5-pro, grok-4.5\ncontinuation_id: conv_xyz789",
  "continuation": {
    "id": "conv_xyz789",
    "status": "processing"
  },
  "async_execution": true
}
```

Poll with `check_status` using the returned `continuation_id`. When complete, the async result carries the full content (answer or rendered transcript) plus the AI-generated title and final summary.

### Example Usage

**Single-model chat:**
```json
{
  "prompt": "Review this authentication function for security issues",
  "models": ["gpt-5.6"],
  "files": ["/project/src/auth.js{1:120}", "/project/config/security.json"],
  "reasoning_effort": "high"
}
```

**Multi-model chat (independent answers):**
```json
{
  "prompt": "Suggest a caching strategy for this endpoint",
  "models": ["gpt-5.6", "gemini-2.5-flash", "grok-4.5"],
  "files": ["/project/src/api/routes.js"]
}
```

**Consensus:**
```json
{
  "prompt": "Should we use microservices or a monolith for our e-commerce platform?",
  "models": ["gpt-5.6", "gemini-2.5-pro", "grok-4.5"],
  "mode": "consensus",
  "files": ["/docs/requirements.md", "/docs/current_architecture.md"],
  "reasoning_effort": "high"
}
```

**Roundtable (one lap):**
```json
{
  "prompt": "Should we adopt event sourcing for the order service?",
  "models": ["codex", "gemini", "claude"],
  "mode": "roundtable"
}
```

**Roundtable (another lap on the same thread):**
```json
{
  "prompt": "Now focus specifically on the migration path.",
  "models": ["codex", "gemini", "claude"],
  "mode": "roundtable",
  "continuation_id": "conv_abc123"
}
```

**Async chat with conversation export:**
```json
{
  "prompt": "Design a scalable architecture for our system",
  "models": ["gpt-5.6"],
  "async": true,
  "export": true,
  "continuation_id": "conv_architecture_design"
}
```

When `export` is enabled, the conversation is saved to disk under a folder named for the `continuation_id`:
```
conv_architecture_design/
├── 1_request.txt      # First user prompt
├── 1_response.txt     # First model response
├── 2_request.txt      # Second user prompt (if continuing)
├── 2_response.txt     # Second model response
└── metadata.json      # Conversation metadata and settings
```

## Check Status Tool

**Description**: Query the status and progress of async jobs, or list the most recent jobs.

### Request Schema

```json
{
  "type": "object",
  "properties": {
    "continuation_id": {
      "type": "string",
      "description": "Optional job continuation ID to query. If not provided, returns the 10 most recent jobs."
    },
    "full_history": {
      "type": "boolean",
      "default": false,
      "description": "When used with continuation_id, returns the full conversation history for that continuation ID. Only use when there are multiple turns and you need the whole conversation."
    }
  },
  "additionalProperties": false
}
```

### Example Usage

```json
// Check a specific job
{ "continuation_id": "conv_abc123" }

// List the 10 most recent jobs
{}

// Get the full conversation history for a thread
{ "continuation_id": "conv_abc123", "full_history": true }
```

The response renders a human-readable status (start time, elapsed time, turn/model progress, and, when summarization is enabled, an AI-generated title and summary) plus the completed result content when available.

## Cancel Job Tool

**Description**: Cancel a queued or running async job. Preserves partial results when available.

### Request Schema

```json
{
  "type": "object",
  "properties": {
    "continuation_id": {
      "type": "string",
      "description": "The continuation_id of the job to cancel"
    }
  },
  "required": ["continuation_id"],
  "additionalProperties": false
}
```

### Example Usage

```json
{ "continuation_id": "conv_abc123" }
```

Only jobs in a `queued` or `running` state can be cancelled; already-completed, failed, or cancelled jobs return a non-cancellable status.

## Supported Models

Provide models as plain name strings in the `models` array. Bare names and aliases resolve to a provider automatically; use a namespace prefix (`claude:`, `gemini:`, `copilot:`, `openrouter:`) or a full `provider/model` slug for explicit routing.

### OpenAI Models

| Model | Aliases | Context | Output | Notes |
|-------|---------|---------|--------|-------|
| `gpt-5.6-sol` | `gpt-5.6`, `gpt-5`, `sol` | 1M | 128K | Flagship, default OpenAI model |
| `gpt-5.6-terra` | `terra` | 400K | 128K | Lower-cost flagship-class tier |
| `gpt-5.6-luna` | `luna` | 400K | 128K | Fastest, most affordable tier |
| `gpt-5.4` | — | 1M | 128K | Flagship-class reasoning |
| `gpt-5.4-pro` | `gpt-5-pro` | 1M | 272K | Maximum performance (expensive) |
| `gpt-5-mini`, `gpt-5-nano` | — | 400K | 128K | Fast, cost-efficient tiers |
| `gpt-5.4-mini`, `gpt-5.4-nano` | — | 400K | 128K | Fast GPT-5.4 tiers |
| `o3`, `o3-pro`, `o4-mini` | — | 200K | 100K | Reasoning models |
| `gpt-4.1` | `gpt-4.1` | 1M | 32K | Large context |
| `o3-deep-research`, `o4-mini-deep-research` | — | 200K | 100K | Deep research (long runtime) |

### Google / Gemini Models (API-based)

| Model | Aliases | Context | Output | Notes |
|-------|---------|---------|--------|-------|
| `gemini-3.1-pro-preview` | `pro`, `gemini-pro` | 1M | 64K | Most advanced reasoning, expanded thinking levels |
| `gemini-3.5-flash` | `gemini-3.5`, `flash-3.5` | 1M | 65K | Frontier agentic/coding at Flash speed |
| `gemini-2.5-pro` | `pro 2.5` | 1M | 65K | Deep reasoning with thinking budget |
| `gemini-2.5-flash` | `flash` | 1M | 65K | Ultra-fast |
| `gemini-2.5-flash-lite` | `flash-lite` | 1M | 65K | Lightweight fast model |

**Note:** The short name `gemini` (and `gemini:pro` / `gemini:flash`) routes to the **Antigravity CLI** (`agy`, OAuth-based). For Google API access, use specific model names like `gemini-3.1-pro-preview` or `gemini-2.5-flash` (bare `gemini-pro` / `gemini-flash` also route to the Google API).

### X.AI / Grok Models

| Model | Aliases | Context | Notes |
|-------|---------|---------|-------|
| `grok-4.5` | `grok`, `grok-4.5-latest`, `grok-build-latest` | 500K | Flagship: image input, reasoning content, native web/X search via Agent Tools |

`reasoning_effort` maps to Grok's `low`/`medium`/`high`; Grok 4.5 always reasons and cannot be disabled. Web search is attached automatically and the model decides whether to use it.

### Anthropic Models (API-based)

| Model | Aliases | Context | Output | Notes |
|-------|---------|---------|--------|-------|
| `claude-fable-5` | `fable`, `fable-5` | 1M | 128K | Most capable, adaptive thinking + effort, images, caching, compaction |
| `claude-opus-4-8` | `opus`, `opus-4.8` | 200K (1M beta) | 128K | Complex reasoning and agentic coding |
| `claude-opus-4-7`, `claude-opus-4-6` | `opus-4.7`, `opus-4.6` | 200K (1M beta) | 128K | Previous Opus generations |
| `claude-opus-4-5-20251101`, `claude-opus-4-1-20250805` | `opus-4.5`, `opus-4.1` | 200K | 64K / 32K | Earlier Opus tiers |
| `claude-sonnet-4-6` | `sonnet`, `sonnet-4.6` | 200K (1M beta) | 64K | Best speed/intelligence balance, adaptive thinking |
| `claude-haiku-4-5-20251001` | `haiku`, `haiku-4.5` | 200K | 64K | Fast and intelligent |

Models with adaptive thinking control depth via `reasoning_effort`, which maps to Anthropic's `effort` parameter. System prompts are automatically cached for 1 hour; cache stats appear in response metadata as `cache_creation_input_tokens` / `cache_read_input_tokens`.

### Mistral Models

| Model | Aliases | Context | Notes |
|-------|---------|---------|-------|
| `mistral-medium-3-5` | `mistral`, `mistral-medium` | 256K | Frontier-class multimodal, adjustable reasoning |
| `mistral-small-2603` | `mistral-small` | 256K | Hybrid multimodal (instruct + reasoning + coding) |
| `mistral-large-2512` | `mistral-large` | 256K | Open-weight MoE flagship, image-capable, no adjustable reasoning |

`reasoning_effort` maps to `high` (any enabled level) or `none` on Medium 3.5 and Small; Large has no adjustable reasoning.

### DeepSeek Models

| Model | Aliases | Context | Output | Notes |
|-------|---------|---------|--------|-------|
| `deepseek-v4-pro` | `deepseek`, `deepseek-pro` | 1M | 384K | Flagship MoE, thinking mode, text-only |
| `deepseek-v4-flash` | `deepseek-flash` | 1M | 384K | Faster, lower-cost V4 tier, text-only |

`reasoning_effort`: `none` disables thinking; enabled levels use `high`; `max` uses `max`.

### OpenRouter Models

| Model | Aliases | Context | Notes |
|-------|---------|---------|-------|
| `z-ai/glm-5.2` | `glm`, `glm-5.2` | 1M | Large-scale reasoning, text-only, default OpenRouter model |
| `deepseek/deepseek-v4-pro`, `deepseek/deepseek-v4-flash` | — | 1M | DeepSeek V4 tiers, text-only |
| `qwen/qwen3.7-max` | `qwen3.7-max` | 1M | Flagship Qwen, text-only |
| `qwen/qwen3.7-plus` | `qwen3.7-plus` | 1M | Image-capable Qwen |
| `moonshotai/kimi-k2.7-code` | `kimi-k2.7-code` | 256K | Coding model, image-capable, reasoning always on |
| `moonshotai/kimi-k2.6` | `kimi-k2.6` | 256K | Image-capable general model |
| `openrouter/auto` | `auto-router`, `openrouter-auto` | — | Auto-selects the best model for the prompt |

Any other model works via its full `provider/model` slug (e.g. `anthropic/claude-sonnet-5`) or the `openrouter:` namespace. Append `:online` to a slug (e.g. `z-ai/glm-5.2:online`) to opt into web search, which adds a real per-request cost.

### Codex (agentic, local)

**Codex** is an agentic coding assistant with direct filesystem access:

- **Model**: `codex` (underlying model: GPT-5.6)
- **Thread-based sessions**: persistent conversation history via `continuation_id` in `chat` mode
- **Direct file access**: reads files from the working directory (paths relative to `CLIENT_CWD`)
- **Response times**: 6-20 seconds typical (complex tasks may take minutes)
- **Authentication**: ChatGPT login OR `CODEX_API_KEY` (NOT `OPENAI_API_KEY`)
- `reasoning_effort` and web search are not applicable — Codex manages its own execution

### Claude Agent SDK (subscription)

**Claude** is available through the Claude Agent SDK, using Claude Code CLI authentication instead of an API key:

- **Model**: `claude` (aliases: `claude-sdk`, `claude-code`) — defaults to Claude Fable 5
- **Model selection**: `claude:fable` (Claude Fable 5) or `claude:opus` (Claude Opus 4.8); unknown `claude:`-prefixed names pass through to the SDK (e.g. `claude:claude-sonnet-4-6`)
- **Authentication**: `claude login` — no `ANTHROPIC_API_KEY` needed
- **Direct file access**: reads files from the working directory
- `reasoning_effort` and sampling parameters are managed by the SDK

### Gemini via Antigravity CLI (subscription)

The **Antigravity CLI** (`agy`) provides subscription-based access to Gemini models through Google OAuth:

- **Models** (text-only): `gemini` (= `gemini:pro`, Gemini 3.1 Pro), `gemini:flash` (Gemini 3.5 Flash)
- **Authentication**: Google OAuth via `agy` (one-time interactive login)
- **Setup**: install the Antigravity CLI and run `agy` once to log in
- **Billing**: uses your Antigravity subscription/compute allowance instead of API credits
- **Reasoning effort**: `low`/`medium`/`high`/`max` select the model variant
- **Context**: 1M tokens
- One-shot responses (no token-level streaming); ~7s minimum per call

**Authentication Setup:**
```bash
# Install the Antigravity CLI (agy)
# Windows (PowerShell):
irm https://antigravity.google/cli/install.ps1 | iex
# macOS/Linux:
curl -fsSL https://antigravity.google/cli/install.sh | bash

# Run interactive login (one-time) — also establishes workspace trust
agy
```

### GitHub Copilot SDK (subscription)

Reach these with the `copilot:` namespace (e.g. `copilot:gpt-5.6-terra`); uses your GitHub Copilot subscription (`gh auth login`) — no API key needed:

- **OpenAI**: `gpt-5.6-sol` (aliases: `gpt-5.6`, `gpt-5`), `gpt-5.6-terra`, `gpt-5.6-luna` (all accept `reasoning_effort`)
- **Anthropic**: `claude-fable-5` (alias: `fable`), `claude-sonnet-5` (alias: `sonnet`), `claude-opus-4.8` (aliases: `opus`, `claude`)
- **Google**: `gemini-3.1-pro-preview` (aliases: `gemini`, `gemini-3.1-pro`), `gemini-3.5-flash` (alias: `gemini-flash`)
- Any other `copilot:<id>` is forwarded to the Copilot backend verbatim

### Model Selection

Use `"auto"` for automatic selection, or specify exact models:

```text
"auto"                     // First available provider (chat); first 3 (consensus)
"gpt-5.6"                  // OpenAI flagship
"gemini-2.5-flash"         // Google API
"grok-4.5"                 // X.AI
"deepseek"                 // DeepSeek (-> deepseek-v4-pro)
"mistral"                  // Mistral (-> mistral-medium-3-5)
"z-ai/glm-5.2"             // OpenRouter (full slug)
"z-ai/glm-5.2:online"      // OpenRouter with web search opt-in
"fable"                    // Anthropic API (-> claude-fable-5)
"opus"                     // Anthropic API (-> claude-opus-4-8)
"claude"                   // Claude Agent SDK (-> Claude Fable 5)
"claude:opus"              // Claude Agent SDK (Claude Opus 4.8)
"gemini"                   // Antigravity CLI (Gemini 3.1 Pro)
"copilot:gpt-5.6-terra"    // GitHub Copilot SDK
```

**Auto behavior:**
- **chat mode**: `["auto"]` selects the first available provider and uses its default model, with failover to the next provider on error.
- **consensus mode**: `["auto"]` expands to the first 3 available providers.

Provider auto-selection priority (subscription-based CLI/SDK providers first, then API-key providers): `codex`, `gemini-cli`, `claude`, `copilot`, `openai`, `google`, `xai`, `anthropic`, `mistral`, `deepseek`, `openrouter`.

## Configuration

### AI Summarization

```bash
ENABLE_RESPONSE_SUMMARIZATION=true    # Enable AI-generated titles and summaries (default: false)
SUMMARIZATION_MODEL=gpt-5-nano        # Model used for summarization (default: gpt-5-nano)
```

When enabled: title generation (up to 60 chars) per request, streaming progress summaries during async jobs, 1-2 sentence final summaries, and enhanced `check_status` display. Summarization is non-blocking — failures fall back to text snippets and never affect the main flow.

### Codex Configuration

Control Codex behavior through environment variables:

- **`CODEX_SANDBOX_MODE`** — filesystem access: `read-only` (default), `workspace-write`, `danger-full-access` (containers only)
- **`CODEX_SKIP_GIT_CHECK`** — `true` (default) works in any directory; `false` requires a Git repository
- **`CODEX_APPROVAL_POLICY`** — `never` (default, recommended for servers), `untrusted`, `on-failure`, `on-request`
- **`CODEX_MODEL`** — underlying model for Codex sessions (default: `gpt-5.6-sol`)
- **`CODEX_API_KEY`** — optional API key for headless deployments (alternative to ChatGPT login)

**Example (.env):**
```bash
CODEX_API_KEY=your_codex_api_key_here
CODEX_SANDBOX_MODE=read-only
CODEX_SKIP_GIT_CHECK=true
CODEX_APPROVAL_POLICY=never
CODEX_MODEL=gpt-5.6-sol
```

## Context Processing

### File Support

**Supported text formats:** `.txt`, `.md`, `.js`, `.ts`, `.json`, `.yaml`, `.yml`, `.py`, `.java`, `.c`, `.cpp`, `.h`, `.css`, `.html`, `.xml`, `.csv`, `.sql`, `.sh`, `.bat`, `.log`

**Supported image formats:** `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.bmp`

**Size limits:** text files 1MB default; image files 10MB default

### File Processing

Provide paths in the `files` array. Line ranges are supported: `file.txt{10:50}` for lines 10-50, `file.txt{100:}` from line 100 onward.

```json
{
  "files": [
    "/absolute/path/to/file.js",
    "./relative/path/to/file.md{1:80}"
  ]
}
```

The processed context includes file content with line numbers and metadata (size, last modified) and reports inaccessible files as errors.

### Image Processing

```json
{
  "images": [
    "/path/to/diagram.png",
    "data:image/jpeg;base64,/9j/4AAQ..."
  ]
}
```

Images are base64-encoded and sent to models that support vision. When a request includes images, `"auto"` selection skips text-only providers.

## Continuation System

The first request creates a continuation automatically and returns its ID; pass it back on subsequent requests to continue the thread. The continuation persists across modes — you may switch `mode` and `models` on a resuming turn, and the shared transcript is the context. Custom continuation IDs are accepted (letters, numbers, hyphens, underscores; max 128 chars). Conversations expire after 24 hours of inactivity.

```json
// First request (no continuation_id)
{ "prompt": "Start a discussion about architecture", "models": ["auto"] }

// Follow-up (reuse the returned id)
{ "prompt": "What about microservices?", "continuation_id": "conv_abc123" }
```

## Asynchronous Execution

Set `async: true` on a chat request for long-running work:

1. **Immediate response**: returns a `continuation_id` instantly.
2. **Background processing**: the job runs with streaming support.
3. **Status monitoring**: poll with `check_status`.
4. **Result retrieval**: full results (answer or transcript) available when the job completes.
5. **Cancellation**: use `cancel_job` to stop a running job.

### Status Types

| Status | Description | Actions Available |
|--------|-------------|-------------------|
| `processing` | Job is running | Cancel, Check Status |
| `completed` | Job finished successfully | Get Results |
| `failed` | Job encountered an error | Check Error Details |
| `cancelled` | Job was cancelled | None |

### Caching

- **Memory cache (24 hours)**: active jobs and recent completions for fast status lookups.
- **Disk cache (3 days)**: long-term result storage that survives server restarts.

### When to Use Async

- Long analysis tasks (>30 seconds)
- Large file processing
- Multi-model consensus or multi-lap roundtables
- Deep-research and other long-running models

## Error Handling

**Missing API key / unavailable provider:**
```json
{ "error": "Provider openai is not available. Check API key configuration." }
```

**Invalid model:**
```json
{ "error": "Provider not found for model: invalid-model" }
```

**All models failed (multi-model chat):** the error lists each model and its failure. In consensus/roundtable, individual model/turn failures are recorded in the result (`failed` entries and trailing failure details) rather than aborting the whole request.

## Authentication

**Environment variables:**
```bash
OPENAI_API_KEY=sk-proj-...
GOOGLE_API_KEY=AIzaSy...        # or GEMINI_API_KEY (GEMINI_API_KEY takes priority)
XAI_API_KEY=xai-...
ANTHROPIC_API_KEY=sk-ant-...
MISTRAL_API_KEY=...
DEEPSEEK_API_KEY=...
OPENROUTER_API_KEY=sk-or-...
```

**MCP client configuration:**
```json
{
  "env": {
    "OPENAI_API_KEY": "sk-proj-...",
    "GOOGLE_API_KEY": "AIzaSy...",
    "XAI_API_KEY": "xai-..."
  }
}
```

Subscription providers (Codex, Claude Agent SDK, Antigravity CLI, Copilot SDK) use local CLI authentication instead of API keys — see [PROVIDERS.md](PROVIDERS.md).

### Security

- API keys are never logged or exposed
- Path traversal protection for file access
- File access limited to allowed directories
- Input validation on all parameters

## Server Limits

```bash
MAX_MCP_OUTPUT_TOKENS=200000   # Max output tokens (default 25,000)
```

Response bodies are token-limited to fit the configured MCP output ceiling.

---

For usage examples across common scenarios, see [EXAMPLES.md](EXAMPLES.md).
