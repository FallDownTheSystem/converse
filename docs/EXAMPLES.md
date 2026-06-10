# Converse MCP Server - Usage Examples

## 🚀 Getting Started Examples

### Basic Chat Interaction

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Hello! Can you help me understand JavaScript promises?"
  }
}
```

**Response:**
```json
{
  "content": "I'd be happy to help you understand JavaScript promises! Promises are objects that represent the eventual completion or failure of an asynchronous operation...",
  "continuation": {
    "id": "conv_abc123",
    "provider": "openai",
    "model": "o4-mini",
    "messageCount": 2
  },
  "metadata": {
    "model": "o4-mini",
    "usage": {
      "input_tokens": 15,
      "output_tokens": 145,
      "total_tokens": 160
    },
    "response_time_ms": 1200,
    "provider": "openai"
  },
  "title": "Understanding JavaScript Promises",  // When summarization enabled
  "final_summary": "Explained JavaScript promises as objects for handling asynchronous operations with practical examples."  // When summarization enabled
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

## ⏱️ Asynchronous Execution Examples

### Basic Async Chat

For long-running tasks, use async mode to get immediate response and monitor progress:

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Analyze this large codebase and provide comprehensive optimization recommendations",
    "model": "gpt-5",
    "files": ["/path/to/large-project"],
    "async": true,
    "continuation_id": "analysis-task-001"
  }
}
```

**Immediate Response:**
```json
{
  "content": "⏳ PROCESSING | CHAT | analysis-task-001 | 1/1 | Started: 2023-12-01 10:30:00 | openai/gpt-5",
  "continuation": {
    "id": "analysis-task-001",
    "status": "processing"
  },
  "async_execution": true
}
```

### Monitoring Async Progress

```json
{
  "tool": "check_status",
  "arguments": {
    "continuation_id": "analysis-task-001"
  }
}
```

**While Processing (with summarization enabled):**
```json
{
  "content": {
    "id": "analysis-task-001",
    "status": "processing",
    "tool": "chat",
    "title": "Codebase Optimization Analysis",  // AI-generated title
    "streaming_summary": "Analyzing codebase structure and dependencies. Currently examining performance bottlenecks in the API layer.",  // Summary based on partially streamed response
    "progress": {
      "completed": 1,
      "total": 1,
      "percentage": 100
    },
    "elapsed_seconds": 12.5
  }
}
```

**When Complete (with summarization enabled):**
```json
{
  "content": {
    "id": "analysis-task-001",
    "status": "completed",
    "tool": "chat",
    "title": "Codebase Optimization Analysis",  // AI-generated title
    "final_summary": "Identified 5 critical performance bottlenecks and provided refactoring recommendations for improved scalability.",  // Final summary
    "result": {
      "content": "# Codebase Analysis Results\n\nAfter analyzing your codebase, here are the key optimization opportunities...",
      "metadata": {
        "provider": "openai",
        "model": "gpt-5",
        "usage": {
          "input_tokens": 15420,
          "output_tokens": 2340
        }
      }
    },
    "elapsed_seconds": 45.2,
    "completed_at": "2023-12-01T10:30:45.200Z"
  }
}
```

### Async Consensus Example

```json
{
  "tool": "consensus",
  "arguments": {
    "prompt": "Design a scalable microservices architecture for our e-commerce platform",
    "models": ["gpt-5", "gemini-2.5-pro", "claude-sonnet-4-6"],
    "files": ["/docs/requirements.md", "/docs/current-architecture.md"],
    "async": true,
    "enable_cross_feedback": true
  }
}
```

**Immediate Response:**
```json
{
  "content": "⏳ PROCESSING | CONSENSUS | consensus_xyz789 | 0/3 | Started: 2023-12-01 10:30:00 | gpt-5,gemini-2.5-pro,claude-sonnet-4-6",
  "continuation": {
    "id": "consensus_xyz789",
    "status": "processing"
  },
  "async_execution": true,
  "metadata": {
    "total_models": 3,
    "successful_models": 0,
    "models_list": "gpt-5,gemini-2.5-pro,claude-sonnet-4-6"
  }
}
```

### Cancelling Long-Running Jobs

```json
{
  "tool": "cancel_job",
  "arguments": {
    "continuation_id": "analysis-task-001"
  }
}
```

**Response:**
```json
{
  "content": {
    "status": "cancelled",
    "message": "Job analysis-task-001 cancelled successfully",
    "job_id": "analysis-task-001",
    "elapsed_seconds": 15.3,
    "cancelled_at": "2023-12-01T10:30:15.300Z"
  }
}
```

### Listing Recent Jobs

```json
{
  "tool": "check_status",
  "arguments": {}
}
```

**Response (with summarization enabled):**
```json
{
  "content": {
    "jobs": [
      {
        "id": "analysis-task-001",
        "status": "completed",
        "tool": "chat",
        "title": "Codebase Optimization Analysis",  // AI-generated title
        "final_summary": "Identified 5 critical performance bottlenecks and provided refactoring recommendations.",  // Summary shown in listing
        "elapsed_seconds": 45.2,
        "completed_at": "2023-12-01T10:30:45.200Z"
      },
      {
        "id": "consensus_xyz789",
        "status": "processing",
        "tool": "consensus",
        "title": "E-commerce Architecture Design",  // AI-generated title
        "progress": {
          "completed": 2,
          "total": 3,
          "percentage": 67
        },
        "elapsed_seconds": 28.7
      }
    ]
  }
}
```

## 🚀 GPT-5 Advanced Features

### Using Minimal Reasoning for Fast Responses

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Write a simple SQL query to get all users created today",
    "model": "gpt-5",
    "reasoning_effort": "minimal",
    "verbosity": "low"
  }
}
```

### High Verbosity for Detailed Explanations

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Explain the architecture of this authentication system and suggest improvements",
    "model": "gpt-5",
    "files": ["/c/Users/username/project/src/auth.js"],
    "reasoning_effort": "high",
    "verbosity": "high"
  }
}
```

### Cost-Efficient with GPT-5-nano

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Summarize the main points from this document",
    "model": "gpt-5-nano",
    "files": ["/c/Users/username/docs/report.md"],
    "verbosity": "low"
  }
}
```

## 🔧 Code Analysis Examples

### Single File Analysis

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Review this function for potential bugs and improvements",
    "model": "gpt-5",
    "files": ["/c/Users/username/project/src/auth.js"],
    "reasoning_effort": "high",
    "temperature": 0.1
  }
}
```

### Multi-File Architecture Review

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Analyze the overall architecture and suggest improvements for scalability",
    "model": "gemini-2.5-pro",
    "files": [
      "/c/Users/username/project/src/server.js",
      "/c/Users/username/project/src/routes/index.js",
      "/c/Users/username/project/src/middleware/auth.js",
      "/c/Users/username/project/config/database.js"
    ],
    "temperature": 0.2
  }
}
```

## 🎯 Model-Specific Examples

### Using GPT-5 for Complex Reasoning

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Design a distributed caching strategy for a social media platform with 10M+ users",
    "model": "gpt-5",
    "reasoning_effort": "max",
    "temperature": 0.1
  }
}
```

### Using Flash for Quick Responses

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "What's the syntax for async/await in JavaScript?",
    "model": "gemini-2.5-flash",
    "temperature": 0.3
  }
}
```

### Using Grok for Creative Solutions

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Brainstorm creative ways to gamify a productivity app",
    "model": "grok-4",
    "temperature": 0.7
  }
}
```

## 🤖 Codex Examples

Codex is an agentic coding assistant that runs locally with direct filesystem access.

### Basic Code Analysis

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Explain what this function does",
    "model": "codex",
    "files": ["/path/to/src/utils.js"]
  }
}
```

### Thread Continuation

Codex maintains conversation history through threads:

```json
// First request
{
  "tool": "chat",
  "arguments": {
    "prompt": "Review this authentication module",
    "model": "codex",
    "files": ["/path/to/auth.js"]
  }
}
// Response includes: "continuation": { "id": "conv_abc123" }

// Follow-up request (maintains context)
{
  "tool": "chat",
  "arguments": {
    "prompt": "Now add rate limiting to the login endpoint",
    "model": "codex",
    "continuation_id": "conv_abc123"
  }
}
```

### Async Mode for Long Tasks

Codex responses can take several minutes for complex tasks:

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Analyze this entire codebase and suggest refactoring opportunities",
    "model": "codex",
    "files": ["/path/to/project"],
    "async": true
  }
}
// Response: { "job_id": "conv_xyz789", "status": "SUBMITTED" }

// Check progress
{
  "tool": "check_status",
  "arguments": {
    "continuation_id": "conv_xyz789"
  }
}
```

### Sandbox Modes

Control filesystem access through `CODEX_SANDBOX_MODE`:

```bash
# Read-only mode (default) - safe for exploration
CODEX_SANDBOX_MODE=read-only

# Workspace-write - allow modifications in project directory
CODEX_SANDBOX_MODE=workspace-write

# Full access - use only in containers with proper isolation
CODEX_SANDBOX_MODE=danger-full-access
```

## 🤝 Consensus Examples

### Simple Technical Decision

```json
{
  "tool": "consensus",
  "arguments": {
    "prompt": "Should we use PostgreSQL or MongoDB for our e-commerce inventory system?",
    "models": ["gpt-5", "gemini-2.5-pro", "grok-4"],
    "temperature": 0.2
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
        "model": "gpt-5",
        "status": "success",
        "response": "For an e-commerce inventory system, I recommend PostgreSQL because...",
        "metadata": {"input_tokens": 50, "output_tokens": 180}
      }
    ],
    "refined": [
      {
        "model": "gpt-5",
        "status": "success",
        "initial_response": "For an e-commerce inventory system, I recommend PostgreSQL...",
        "refined_response": "After considering the other perspectives on MongoDB's flexibility, I still lean towards PostgreSQL but acknowledge that MongoDB could work well if..."
      }
    ]
  }
}
```

### Architecture Decision with Context

```json
{
  "tool": "consensus",
  "arguments": {
    "prompt": "Given our current system architecture, what's the best approach for implementing real-time notifications?",
    "models": [
      "gpt-5",        // Most intelligent: Superior reasoning
      "grok-4",    // Most intelligent: Advanced analysis
      "gemini-2.5-pro"  // Most intelligent: Deep thinking
    ],
    "files": [
      "/c/Users/username/docs/current_architecture.md",
      "/c/Users/username/src/server.js",
      "/c/Users/username/package.json"
    ],
    "enable_cross_feedback": true,
    "temperature": 0.15
  }
}
```

### Fast Consensus (No Cross-Feedback)

```json
{
  "tool": "consensus",
  "arguments": {
    "prompt": "What's the best CSS framework for rapid prototyping in 2024?",
    "models": ["gemini-2.5-flash", "o4-mini", "grok-4"],
    "enable_cross_feedback": false,
    "temperature": 0.3
  }
}
```

## 🔄 Conversation (Round-Table) Examples

The `conversation` tool runs a turn-based round-table: models respond **in the order given**, and each model sees the full running transcript of every turn before it. One call = one lap. Pass the returned `continuation_id` to run another lap; every lap appends to one shared transcript. This differs from `consensus`, where all models answer the same prompt in parallel.

### Basic Two-Model Round-Table

```json
{
  "tool": "conversation",
  "arguments": {
    "prompt": "Should we adopt event sourcing for the order service?",
    "models": ["codex", "gemini"]
  }
}
```

On this lap, `codex` opens, then `gemini` responds having seen codex's turn. The response contains both labeled turns in order plus a `continuation_id`.

### Continuing the Round-Table (More Laps)

```json
// Lap 1 returns: "continuation": { "id": "conv_abc123" }

// Lap 2 — every model again sees the full accumulated transcript
{
  "tool": "conversation",
  "arguments": {
    "prompt": "Now focus specifically on the migration path from the current design.",
    "models": ["codex", "gemini"],
    "continuation_id": "conv_abc123"
  }
}
```

You may also change the model list on a resuming lap (e.g. drop a participant or add one); the shared transcript persists regardless of who ran in earlier laps:

```json
{
  "tool": "conversation",
  "arguments": {
    "prompt": "Bring in a third perspective on testability.",
    "models": ["codex", "gemini", "claude"],
    "continuation_id": "conv_abc123"
  }
}
```

### Round-Table with Files and a Custom Per-Turn Instruction

```json
{
  "tool": "conversation",
  "arguments": {
    "prompt": "Review this module design and push back on weak assumptions.",
    "models": ["codex", "gemini", "claude"],
    "files": ["/c/Users/username/project/src/orders/design.md"],
    "turn_prompt": "Call out concrete failure modes you would test for."
  }
}
```

### Async Round-Table with Progress Monitoring

```json
{
  "tool": "conversation",
  "arguments": {
    "prompt": "Design a rollout plan for the new pricing engine.",
    "models": ["codex", "gemini", "claude"],
    "async": true
  }
}
```

**Immediate Response:**
```json
{
  "content": "⏳ SUBMITTED | CONVERSATION | conv_xyz789 | 1/1 | Started: 01/12/2023 10:30:00 | \"Pricing Engine Rollout\" | codex, gemini, claude",
  "continuation": {
    "id": "conv_xyz789",
    "status": "processing"
  },
  "async_execution": true
}
```

**Monitor per-turn progress, then read the full transcript on completion:**
```json
{
  "tool": "check_status",
  "arguments": {
    "continuation_id": "conv_xyz789"
  }
}
```

While running, the status line shows turn progress (e.g. `2/3 turns`) and the accumulating transcript. When complete, `check_status` renders the full lap transcript along with the AI-generated title and final summary.

## 🖼️ Image Analysis Examples

### Screenshot Analysis

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Analyze this UI design and suggest improvements for user experience",
    "model": "gpt-4.1",
    "images": ["/c/Users/username/designs/dashboard_mockup.png"],
    "temperature": 0.3
  }
}
```

### Multi-Image Comparison

```json
{
  "tool": "consensus",
  "arguments": {
    "prompt": "Compare these three design options and recommend the best one for our mobile app",
    "models": ["gpt-4.1", "gemini-2.5-pro", "grok-4"],
    "images": [
      "/c/Users/username/designs/option_a.png",
      "/c/Users/username/designs/option_b.png", 
      "/c/Users/username/designs/option_c.png"
    ],
    "temperature": 0.2
  }
}
```

### Code + Diagram Analysis

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Review the implementation against the architecture diagram. Are we following the design correctly?",
    "model": "gpt-5",
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
    "model": "gpt-5",
    "files": [
      "/c/Users/username/src/server.js",
      "/c/Users/username/logs/error.log",
      "/c/Users/username/src/middleware/error-handler.js"
    ],
    "reasoning_effort": "high",
    "temperature": 0.1
  }
}
```

### Performance Analysis

```json
{
  "tool": "consensus",
  "arguments": {
    "prompt": "Our API response times are degrading. What could be the root causes?",
    "models": [
      "gemini-2.5-flash",  // Fast: Quick analysis
      "o4-mini",           // Fast: Rapid responses
      "gpt-4.1"            // Fast: Efficient processing
    ],
    "files": [
      "/c/Users/username/monitoring/performance_report.json",
      "/c/Users/username/src/database/queries.js",
      "/c/Users/username/src/api/routes.js"
    ],
    "cross_feedback_prompt": "Focus on the most likely performance bottlenecks based on the data"
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
    "model": "gemini-2.5-pro",
    "temperature": 0.4
  }
}
```

### Code Review & Learning

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Review this code and explain what it does, then suggest best practices improvements",
    "model": "gpt-5",
    "files": ["/c/Users/username/src/utils/encryption.js"],
    "reasoning_effort": "medium",
    "temperature": 0.2
  }
}
```

### Technology Comparison

```json
{
  "tool": "consensus",
  "arguments": {
    "prompt": "Compare Next.js, Nuxt.js, and SvelteKit for our new web application project",
    "models": ["gpt-5", "gemini-2.5-flash", "grok-4"],
    "files": ["/c/Users/username/docs/project_requirements.md"],
    "temperature": 0.25
  }
}
```

## 🛠️ Development Workflows

### Feature Planning

```json
{
  "tool": "consensus",
  "arguments": {
    "prompt": "Plan the implementation of user authentication with social login support",
    "models": ["gpt-5", "gemini-2.5-pro", "grok-4"],
    "files": [
      "/c/Users/username/docs/user_requirements.md",
      "/c/Users/username/src/models/user.js"
    ],
    "cross_feedback_prompt": "Consider security, scalability, and user experience in your refinement"
  }
}
```

### Code Generation

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Generate a React component for a responsive image gallery with lazy loading",
    "model": "gemini-2.5-flash",
    "files": ["/c/Users/username/src/styles/globals.css"],
    "temperature": 0.3
  }
}
```

### Refactoring Guidance

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Help me refactor this legacy code to use modern ES6+ features and improve readability",
    "model": "gpt-5",
    "files": ["/c/Users/username/src/legacy/data-processor.js"],
    "reasoning_effort": "medium",
    "temperature": 0.2
  }
}
```

## 🚀 Advanced Use Cases

### Multi-Step Problem Solving

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "I need to migrate our monolith to microservices. What's the step-by-step approach?",
    "model": "gpt-5",
    "files": ["/c/Users/username/src/app.js", "/c/Users/username/docs/current_architecture.md"],
    "reasoning_effort": "max",
    "temperature": 0.1
  }
}
```

### Cross-Technology Analysis

```json
{
  "tool": "consensus",
  "arguments": {
    "prompt": "Should we migrate from Python Django to Node.js Express for better performance?",
    "models": ["gpt-5", "gemini-2.5-pro", "grok-4"],
    "files": [
      "/c/Users/username/backend/requirements.txt",
      "/c/Users/username/monitoring/performance_metrics.json",
      "/c/Users/username/docs/team_skills.md"
    ],
    "cross_feedback_prompt": "Consider team expertise, migration costs, and long-term maintainability"
  }
}
```

### Research & Investigation

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Research the latest trends in web development for 2024 and how they apply to our project",
    "model": "grok-4",
    "use_websearch": true,
    "temperature": 0.5
  }
}
```

## 🎛️ Configuration Examples

### Custom Temperature Settings

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Generate creative marketing copy for our new product launch",
    "model": "grok-4",
    "temperature": 0.8
  }
}
```

```json
{
  "tool": "chat", 
  "arguments": {
    "prompt": "Fix this bug in my authentication logic",
    "model": "gpt-5",
    "files": ["/c/Users/username/src/auth.js"],
    "temperature": 0.0,
    "reasoning_effort": "high"
  }
}
```

### Different Reasoning Levels

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Quick syntax check - is this JavaScript valid?",
    "model": "gpt-5",
    "reasoning_effort": "minimal",
    "temperature": 0.1
  }
}
```

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Design a comprehensive testing strategy for this complex system",
    "model": "gpt-5",
    "files": ["/src/", "/tests/"],
    "reasoning_effort": "max",
    "temperature": 0.1
  }
}
```

## 🔄 Continuation Examples

### Long Research Session

```json
// First request
{
  "tool": "chat",
  "arguments": {
    "prompt": "I'm building a real-time chat application. What architecture should I consider?",
    "model": "gpt-5"
  }
}

// Response includes: "continuation": {"id": "conv_research_123"}

// Follow-up questions
{
  "tool": "chat",
  "arguments": {
    "prompt": "What about handling file uploads in real-time?",
    "continuation_id": "conv_research_123"
  }
}

{
  "tool": "chat",
  "arguments": {
    "prompt": "How would you implement message encryption?",
    "continuation_id": "conv_research_123"
  }
}
```

### Iterative Development

```json
// Initial code review
{
  "tool": "chat",
  "arguments": {
    "prompt": "Review this API endpoint implementation",
    "model": "gpt-5",
    "files": ["/c/Users/username/src/api/users.js"]
  }
}

// Implementation improvement
{
  "tool": "chat",
  "arguments": {
    "prompt": "Now help me implement the error handling you suggested",
    "continuation_id": "conv_dev_456",
    "files": ["/c/Users/username/src/api/users.js"]
  }
}

// Testing guidance
{
  "tool": "chat",
  "arguments": {
    "prompt": "What unit tests should I write for this endpoint?",
    "continuation_id": "conv_dev_456"
  }
}
```

## 🎨 Creative & Brainstorming

### Feature Ideation

```json
{
  "tool": "consensus",
  "arguments": {
    "prompt": "Brainstorm innovative features for a fitness tracking app that would differentiate us from competitors",
    "models": ["grok-4", "gemini-2.5-pro", "gpt-4.1"],
    "temperature": 0.7,
    "cross_feedback_prompt": "Build on each other's ideas and suggest combinations"
  }
}
```

### UI/UX Improvements

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Suggest creative ways to improve user onboarding for this interface",
    "model": "grok-4",
    "images": ["/c/Users/username/designs/current_onboarding.png"],
    "temperature": 0.6
  }
}
```

## 🧪 Testing Examples

### Test Strategy Planning

```json
{
  "tool": "consensus",
  "arguments": {
    "prompt": "What testing strategy should we implement for this e-commerce checkout flow?",
    "models": ["gpt-5", "gemini-2.5-pro", "gemini-2.5-flash"],
    "files": [
      "/c/Users/username/src/checkout/payment.js",
      "/c/Users/username/src/checkout/validation.js",
      "/c/Users/username/docs/business_requirements.md"
    ],
    "temperature": 0.2
  }
}
```

### Test Generation

```json
{
  "tool": "chat",
  "arguments": {
    "prompt": "Generate comprehensive unit tests for this user authentication module",
    "model": "gemini-2.5-flash",
    "files": ["/c/Users/username/src/auth/index.js"],
    "temperature": 0.3
  }
}
```

## 📊 Error Handling Examples

### Graceful Degradation

```json
{
  "tool": "consensus",
  "arguments": {
    "prompt": "One of our models is unavailable, but we still need consensus",
    "models": ["available-model-1", "available-model-2"],
    "temperature": 0.2
  }
}
```

### Partial Success Response

```json
{
  "status": "consensus_partial",
  "models_consulted": 2,
  "successful_initial_responses": 2,
  "failed_responses": 1,
  "failed_models": ["unavailable-model"],
  "phases": {
    "initial": [...],
    "refined": [...],
    "failed": [
      {
        "model": "unavailable-model",
        "error": "Provider not available. Check API key configuration.",
        "status": "failed"
      }
    ]
  }
}
```

## 🔧 Integration Examples

### CI/CD Pipeline Integration

```bash
# Use in GitHub Actions
- name: Code Review
  run: |
    echo '{
      "tool": "chat",
      "arguments": {
        "prompt": "Review this pull request for security issues and best practices",
        "model": "gpt-5",
        "files": ["/c/Users/username/src/modified-file.js"],
        "reasoning_effort": "high"
      }
    }' | npx converse-mcp-server
```

### Automated Documentation

```bash
# Generate documentation
echo '{
  "tool": "chat",
  "arguments": {
    "prompt": "Generate API documentation for these endpoints",
    "model": "gemini-2.5-flash",
    "files": ["/c/Users/username/src/api/routes.js"]
  }
}' | npx converse-mcp-server > /c/Users/username/docs/api.md
```

---

These examples demonstrate the flexibility and power of the Converse MCP Server across various development scenarios, from simple queries to complex multi-model consensus gathering.