# Converse MCP Server - Usage Examples

All examples call the unified `chat` tool. The `mode` parameter (`chat`, `consensus`, or `roundtable`) selects how the models are orchestrated; `models` is always an array of plain name strings.

## 🚀 Getting Started

### Basic Chat Interaction

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Hello! Can you help me understand JavaScript promises?"
  }
}
```

**Response** (status line, continuation_id, then the answer):
```
✅ COMPLETED | CHAT | conv_abc123 | 1.2s elapsed | openai/gpt-5.6-sol
continuation_id: conv_abc123

I'd be happy to help you understand JavaScript promises! Promises are objects that represent the eventual completion or failure of an asynchronous operation…
```

```json
{
  "content": "…status line + continuation_id + answer…",
  "continuation": {
    "id": "conv_abc123",
    "provider": "openai",
    "model": "gpt-5.6-sol",
    "messageCount": 2
  }
}
```

### Continuing a Conversation

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Can you show me a practical example?",
    "continuation_id": "conv_abc123"
  }
}
```

## 🎯 Choosing a Model

### Auto-selection (recommended)

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "What's the syntax for async/await in JavaScript?",
    "models": ["auto"]
  }
}
```

### A specific model

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Design a distributed caching strategy for a platform with 10M+ users",
    "models": ["gpt-5.6"],
    "reasoning_effort": "max"
  }
}
```

### Fast responses with a lightweight model

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Summarize the main points from this document",
    "models": ["gemini-2.5-flash"],
    "files": ["/c/Users/username/docs/report.md"]
  }
}
```

## 🔧 Code Analysis

### Single File Review

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Review this function for potential bugs and improvements",
    "models": ["gpt-5.6"],
    "files": ["/c/Users/username/project/src/auth.js{1:120}"],
    "reasoning_effort": "high"
  }
}
```

### Multi-File Architecture Review

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Analyze the overall architecture and suggest improvements for scalability",
    "models": ["gemini-2.5-pro"],
    "files": [
      "/c/Users/username/project/src/server.js",
      "/c/Users/username/project/src/routes/index.js",
      "/c/Users/username/project/src/middleware/auth.js",
      "/c/Users/username/config/database.js"
    ]
  }
}
```

## 🧠 Independent Parallel Answers (chat mode, multiple models)

In `chat` mode, listing more than one model runs them in parallel; each answers independently and the response has one labeled section per model.

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "What could be causing our API response times to degrade?",
    "models": ["gemini-2.5-flash", "o4-mini", "gpt-4.1"],
    "files": ["/c/Users/username/monitoring/performance_report.json"]
  }
}
```

## 🤝 Consensus (parallel + cross-feedback)

`consensus` mode runs all models on the same prompt in parallel, then always runs a refinement phase where each model sees the others' answers and refines its own. It requires at least 2 available models.

### Simple Technical Decision

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Should we use PostgreSQL or MongoDB for our e-commerce inventory system?",
    "models": ["gpt-5.6", "gemini-2.5-pro", "grok-4.5"],
    "mode": "consensus"
  }
}
```

**Response Structure:**
```json
{
  "status": "consensus_complete",
  "models_consulted": 3,
  "successful_initial_responses": 3,
  "refined_responses": 3,
  "phases": {
    "initial": [
      {
        "model": "gpt-5.6",
        "status": "success",
        "response": "For an e-commerce inventory system, I recommend PostgreSQL because…"
      }
    ],
    "refined": [
      {
        "model": "gpt-5.6",
        "status": "success",
        "initial_response": "For an e-commerce inventory system, I recommend PostgreSQL…",
        "refined_response": "After considering the other perspectives on MongoDB's flexibility, I still lean towards PostgreSQL but acknowledge that…"
      }
    ],
    "failed": []
  }
}
```

### Architecture Decision with Context

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Given our current architecture, what's the best approach for real-time notifications?",
    "models": ["gpt-5.6", "grok-4.5", "gemini-2.5-pro"],
    "mode": "consensus",
    "files": [
      "/c/Users/username/docs/current_architecture.md",
      "/c/Users/username/src/server.js",
      "/c/Users/username/package.json"
    ]
  }
}
```

### Auto Consensus

`["auto"]` in consensus mode expands to the first 3 available providers:

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Which CSS framework fits rapid prototyping best?",
    "models": ["auto"],
    "mode": "consensus"
  }
}
```

## 🔄 Roundtable (sequential turn-based dialogue)

`roundtable` mode has models respond **in the order given**, each seeing the full running transcript of every turn before it. One call = one lap. Pass the returned `continuation_id` to run another lap; every lap appends to one shared transcript.

### Basic Two-Model Round-Table

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Should we adopt event sourcing for the order service?",
    "models": ["codex", "gemini"],
    "mode": "roundtable"
  }
}
```

On this lap, `codex` opens, then `gemini` responds having seen codex's turn. The result contains both labeled turns in order plus a `continuation_id`.

### Continuing the Round-Table (More Laps)

```json
// Lap 1 returns: "continuation": { "id": "conv_abc123" }

// Lap 2 — every model again sees the full accumulated transcript
{
  "tool": "chat",
  "arguments": {
    "prompt": "Now focus specifically on the migration path from the current design.",
    "models": ["codex", "gemini"],
    "mode": "roundtable",
    "continuation_id": "conv_abc123"
  }
}
```

You may also change the model list on a resuming lap; the shared transcript persists regardless of who ran in earlier laps:

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Bring in a third perspective on testability.",
    "models": ["codex", "gemini", "claude"],
    "mode": "roundtable",
    "continuation_id": "conv_abc123"
  }
}
```

### Round-Table with Files

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Review this module design and push back on weak assumptions. Call out concrete failure modes you would test for.",
    "models": ["codex", "gemini", "claude"],
    "mode": "roundtable",
    "files": ["/c/Users/username/project/src/orders/design.md"]
  }
}
```

## ⏱️ Asynchronous Execution

For long-running work, set `async: true` to get an immediate `continuation_id` and monitor progress with `check_status`.

### Async Chat

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Analyze this large codebase and provide comprehensive optimization recommendations",
    "models": ["gpt-5.6"],
    "files": ["/path/to/large-project"],
    "async": true,
    "continuation_id": "analysis-task-001"
  }
}
```

**Immediate Response:**
```json
{
  "content": "⏳ SUBMITTED | CHAT | analysis-task-001 | 1/1 | Started: 01/12/2026 10:30:00 | \"Codebase Optimization Analysis\" | gpt-5.6\ncontinuation_id: analysis-task-001",
  "continuation": { "id": "analysis-task-001", "status": "processing" },
  "async_execution": true
}
```

### Monitoring Progress

```json
{
  "tool": "check_status",
  "arguments": { "continuation_id": "analysis-task-001" }
}
```

While processing (with summarization enabled), the status shows an AI-generated title and a streaming summary based on the partial response. When complete, it renders the full result plus the final summary.

### Async Consensus

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Design a scalable microservices architecture for our e-commerce platform",
    "models": ["gpt-5.6", "gemini-2.5-pro", "claude"],
    "mode": "consensus",
    "files": ["/docs/requirements.md", "/docs/current-architecture.md"],
    "async": true
  }
}
```

### Async Round-Table

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Design a rollout plan for the new pricing engine.",
    "models": ["codex", "gemini", "claude"],
    "mode": "roundtable",
    "async": true
  }
}
```

While running, `check_status` shows turn progress (e.g. `2/3 turns`) and the accumulating transcript; on completion it renders the full lap transcript, title, and final summary.

### Cancelling a Job

```json
{
  "tool": "cancel_job",
  "arguments": { "continuation_id": "analysis-task-001" }
}
```

### Listing Recent Jobs

```json
{
  "tool": "check_status",
  "arguments": {}
}
```

Returns the 10 most recent jobs with status, timing, and (when summarization is enabled) titles and summaries.

## 🤖 Codex Examples

Codex is an agentic coding assistant that runs locally with direct filesystem access.

### Basic Code Analysis

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Explain what this function does",
    "models": ["codex"],
    "files": ["/path/to/src/utils.js"]
  }
}
```

### Thread Continuation

Codex maintains conversation history through threads in `chat` mode:

```json
// First request
{
  "tool": "chat",
  "arguments": {
    "prompt": "Review this authentication module",
    "models": ["codex"],
    "files": ["/path/to/auth.js"]
  }
}
// Response includes: "continuation": { "id": "conv_abc123" }

// Follow-up request (maintains context)
{
  "tool": "chat",
  "arguments": {
    "prompt": "Now add rate limiting to the login endpoint",
    "models": ["codex"],
    "continuation_id": "conv_abc123"
  }
}
```

### Async Mode for Long Tasks

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Analyze this entire codebase and suggest refactoring opportunities",
    "models": ["codex"],
    "files": ["/path/to/project"],
    "async": true
  }
}
```

### Sandbox Modes

Control filesystem access through `CODEX_SANDBOX_MODE`:

```bash
# Read-only mode (default) - safe for exploration
CODEX_SANDBOX_MODE=read-only

# Workspace-write - allow modifications in the project directory
CODEX_SANDBOX_MODE=workspace-write

# Full access - use only in containers with proper isolation
CODEX_SANDBOX_MODE=danger-full-access
```

## 🖼️ Image Analysis

### Screenshot Analysis

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Analyze this UI design and suggest improvements for user experience",
    "models": ["gpt-5.6"],
    "images": ["/c/Users/username/designs/dashboard_mockup.png"]
  }
}
```

### Multi-Image Comparison (consensus)

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Compare these three design options and recommend the best one for our mobile app",
    "models": ["gpt-5.6", "gemini-2.5-pro", "grok-4.5"],
    "mode": "consensus",
    "images": [
      "/c/Users/username/designs/option_a.png",
      "/c/Users/username/designs/option_b.png",
      "/c/Users/username/designs/option_c.png"
    ]
  }
}
```

### Code + Diagram Analysis

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Review the implementation against the architecture diagram. Are we following the design correctly?",
    "models": ["gpt-5.6"],
    "files": ["/c/Users/username/src/services/payment.js", "/c/Users/username/src/models/transaction.js"],
    "images": ["/c/Users/username/docs/payment_flow_diagram.png"],
    "reasoning_effort": "high"
  }
}
```

## 🔍 Debugging & Problem Solving

### Error Investigation

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Help me debug this error. The application crashes intermittently with this stack trace.",
    "models": ["gpt-5.6"],
    "files": [
      "/c/Users/username/src/server.js",
      "/c/Users/username/logs/error.log",
      "/c/Users/username/src/middleware/error-handler.js"
    ],
    "reasoning_effort": "high"
  }
}
```

### Web-Grounded Research

Grok 4.5 (and other web-search-capable models) attach web search automatically and decide per request whether to use it:

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Research the latest trends in web development and how they apply to our project",
    "models": ["grok-4.5"]
  }
}
```

For OpenRouter models, opt into web search explicitly by appending `:online` to the slug (adds a real per-request cost):

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "What changed in the latest React release?",
    "models": ["z-ai/glm-5.2:online"]
  }
}
```

## 📚 Learning & Documentation

### Concept Explanation

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Explain microservices architecture with pros, cons, and when to use it",
    "models": ["gemini-2.5-pro"]
  }
}
```

### Technology Comparison (consensus)

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Compare Next.js, Nuxt.js, and SvelteKit for our new web application project",
    "models": ["gpt-5.6", "gemini-2.5-flash", "grok-4.5"],
    "mode": "consensus",
    "files": ["/c/Users/username/docs/project_requirements.md"]
  }
}
```

## 🛠️ Development Workflows

### Feature Planning (consensus)

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Plan the implementation of user authentication with social login support. Consider security, scalability, and UX.",
    "models": ["gpt-5.6", "gemini-2.5-pro", "grok-4.5"],
    "mode": "consensus",
    "files": [
      "/c/Users/username/docs/user_requirements.md",
      "/c/Users/username/src/models/user.js"
    ]
  }
}
```

### Refactoring Guidance

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Help me refactor this legacy code to use modern ES6+ features and improve readability",
    "models": ["gpt-5.6"],
    "files": ["/c/Users/username/src/legacy/data-processor.js"],
    "reasoning_effort": "medium"
  }
}
```

## 🔄 Continuation & Mode Switching

A single thread can span modes. Start with a quick chat answer, then continue in roundtable on the same `continuation_id` — the shared transcript is the context.

```json
// Chat: quick opening answer
{
  "tool": "chat",
  "arguments": {
    "prompt": "I'm building a real-time chat application. What architecture should I consider?",
    "models": ["gpt-5.6"]
  }
}
// Response includes: "continuation": { "id": "conv_research_123" }

// Roundtable: bring several models into a discussion on the same thread
{
  "tool": "chat",
  "arguments": {
    "prompt": "Debate the trade-offs of WebSockets vs. server-sent events for this design.",
    "models": ["codex", "gemini", "claude"],
    "mode": "roundtable",
    "continuation_id": "conv_research_123"
  }
}
```

## 📊 Partial Failures

Individual model or turn failures do not abort a consensus or roundtable request — they are recorded in the result and listed in trailing failure details.

**Consensus with one failed model:**
```json
{
  "status": "consensus_complete",
  "models_consulted": 3,
  "successful_initial_responses": 2,
  "failed_responses": 1,
  "phases": {
    "initial": [ /* … */ ],
    "refined": [ /* … */ ],
    "failed": [
      {
        "model": "some-model",
        "error": "Provider is not available. Check API key configuration.",
        "status": "failed"
      }
    ]
  }
}
```

In multi-model `chat` mode, if every model fails the request returns an error listing each model and its failure; if at least one succeeds, failures are appended as trailing "Model failures" details.

## 🔧 Integration Examples

### CI/CD Pipeline

```bash
# Use in GitHub Actions
- name: Code Review
  run: |
    echo '{
      "tool": "chat",
      "arguments": {
        "prompt": "Review this pull request for security issues and best practices",
        "models": ["gpt-5.6"],
        "files": ["/c/Users/username/src/modified-file.js"],
        "reasoning_effort": "high"
      }
    }' | npx converse-mcp-server
```

### Automated Documentation

```bash
echo '{
  "tool": "chat",
  "arguments": {
    "prompt": "Generate API documentation for these endpoints",
    "models": ["gemini-2.5-flash"],
    "files": ["/c/Users/username/src/api/routes.js"]
  }
}' | npx converse-mcp-server > /c/Users/username/docs/api.md
```

---

These examples demonstrate the `chat` tool across common development scenarios — from a single quick answer to multi-model consensus and sequential round-table discussions.
