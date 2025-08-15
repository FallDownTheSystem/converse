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