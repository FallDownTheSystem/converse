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

| Provider | Where to Get | Example Format |
|----------|-------------|----------------|
| **OpenAI** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | `sk-proj-...` |
| **Google** | [makersuite.google.com/app/apikey](https://makersuite.google.com/app/apikey) | `AIzaSy...` |
| **X.AI** | [console.x.ai](https://console.x.ai/) | `xai-...` |
| **Anthropic** | [console.anthropic.com](https://console.anthropic.com/) | `sk-ant-...` |
| **Mistral** | [console.mistral.ai](https://console.mistral.ai/) | `wfBMkWL0...` |
| **DeepSeek** | [platform.deepseek.com](https://platform.deepseek.com/) | `sk-...` |
| **OpenRouter** | [openrouter.ai/keys](https://openrouter.ai/keys) | `sk-or-...` |

### Step 2: Add to Claude Code or Claude Desktop

#### For Claude Code (Recommended)
```bash
# Add the server with your API keys
claude mcp add converse \
  -e OPENAI_API_KEY=your_key_here \
  -e GOOGLE_API_KEY=your_key_here \
  -e XAI_API_KEY=your_key_here \
  -e ANTHROPIC_API_KEY=your_key_here \
  -e MISTRAL_API_KEY=your_key_here \
  -e DEEPSEEK_API_KEY=your_key_here \
  -e OPENROUTER_API_KEY=your_key_here \
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
        "GOOGLE_API_KEY": "your_key_here",
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

**Windows Troubleshooting**: If `npx converse-mcp-server` doesn't work on Windows, try:
```json
{
  "command": "cmd",
  "args": ["/c", "npx", "converse-mcp-server"]
}
```

### Step 3: Start Using Converse

Once installed, you can:

- **Chat with a specific model**: Ask Claude to use the chat tool with your preferred model
- **Get consensus**: Ask Claude to use the consensus tool when you need multiple perspectives
- **Get help**: Type `/converse:help` in Claude

## 🛠️ Available Tools

### 1. Chat Tool

Talk to any AI model with support for files, images, and conversation history. The tool automatically routes your request to the right provider based on the model name.

```javascript
// Example usage
{
  "prompt": "How should I structure the authentication module for this Express.js API?",
  "model": "gemini-2.5-flash",         // Routes to Google
  // "model": "anthropic/claude-3.5-sonnet", // Routes to OpenRouter (if enabled)
  // "model": "openrouter/auto",          // Auto-select best model
  "files": ["/path/to/src/auth.js", "/path/to/config.json"],
  "images": ["/path/to/architecture.png"],
  "temperature": 0.5,
  "reasoning_effort": "medium",
  "use_websearch": false
}
```

### 2. Consensus Tool

Get multiple AI models to analyze the same question simultaneously. Each model can see and respond to the others' answers, creating a rich discussion.

```javascript
// Example usage
{
  "prompt": "Should we use microservices or monolith architecture for our e-commerce platform?",
  "models": [
    {"model": "o3"},
    {"model": "gemini-2.5-flash"},
    {"model": "grok-4-0709"}
  ],
  "files": ["/path/to/requirements.md"],
  "enable_cross_feedback": true,
  "temperature": 0.2
}
```

## 📊 Supported Models

### OpenAI Models
- **o3**: Strong reasoning (200K context)
- **o3-mini**: Fast O3 variant (200K context)  
- **o3-pro**: Professional-grade reasoning (200K context) - EXTREMELY EXPENSIVE
- **o4-mini**: Latest reasoning model (200K context)
- **gpt-4.1**: Advanced reasoning (1M context)
- **gpt-4o**: Multimodal flagship (128K context)
- **gpt-4o-mini**: Fast multimodal (128K context)

### Google/Gemini Models
- **gemini-2.5-flash** (alias: `flash`): Ultra-fast (1M context)
- **gemini-2.5-pro** (alias: `pro`): Deep reasoning (1M context)
- **gemini-2.0-flash**: Latest with experimental thinking
- **gemini-2.0-flash-lite**: Lightweight fast model, text-only

### X.AI/Grok Models  
- **grok-4-0709** (alias: `grok`): Latest advanced model (256K context)
- **grok-3**: Previous generation (131K context)
- **grok-3-fast**: Higher performance variant

### Anthropic Models
- **claude-opus-4**: Highest intelligence with extended thinking (200K context)
- **claude-sonnet-4**: Balanced performance with extended thinking (200K context)
- **claude-3.7-sonnet**: Enhanced 3.x generation with thinking (200K context)
- **claude-3.5-sonnet**: Fast and intelligent (200K context)
- **claude-3.5-haiku**: Fastest model for simple queries (200K context)

### Mistral Models
- **magistral-medium**: Frontier-class reasoning model (40K context)
- **magistral-small**: Small reasoning model (40K context)
- **mistral-medium-3**: Frontier-class multimodal model (128K context)

### DeepSeek Models
- **deepseek-chat**: Strong MoE model with 671B/37B parameters (64K context)
- **deepseek-reasoner**: Advanced reasoning model with CoT (64K context)

### OpenRouter Models
- **qwen3-235b-thinking**: Qwen3 with enhanced reasoning (32K context)
- **qwen3-coder**: Specialized for programming tasks (32K context)
- **kimi-k2**: Moonshot AI Kimi K2 with extended context (200K context)

## 📚 Help & Documentation

### Built-in Help
Type these commands directly in Claude:
- `/converse:help` - Full documentation
- `/converse:help tools` - Tool-specific help
- `/converse:help models` - Model information
- `/converse:help parameters` - Configuration details
- `/converse:help examples` - Usage examples

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
GOOGLE_API_KEY=your_google_api_key_here  
XAI_API_KEY=xai-your_xai_key_here
ANTHROPIC_API_KEY=sk-ant-your_anthropic_key_here
MISTRAL_API_KEY=your_mistral_key_here
DEEPSEEK_API_KEY=your_deepseek_key_here
OPENROUTER_API_KEY=sk-or-your_openrouter_key_here

# Optional: Server configuration
PORT=3157
LOG_LEVEL=info
MAX_MCP_OUTPUT_TOKENS=200000

# Optional: OpenRouter configuration
OPENROUTER_REFERER=https://github.com/FallDownTheSystem/converse
OPENROUTER_TITLE=Converse
OPENROUTER_DYNAMIC_MODELS=true
```

### Configuration Options

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `PORT` | Server port | `3157` | `3157` |
| `LOG_LEVEL` | Logging level | `info` | `debug`, `info`, `error` |
| `MAX_MCP_OUTPUT_TOKENS` | Token response limit | `25000` | `200000` |

### Model Selection

Use `"auto"` for automatic model selection, or specify exact models:

```javascript
// Auto-selection (recommended)
{ "model": "auto" }

// Specific models
{ "model": "gemini-2.5-flash" }
{ "model": "o3" }
{ "model": "grok-4-0709" }

// Using aliases
{ "model": "flash" }    // -> gemini-2.5-flash
{ "model": "pro" }      // -> gemini-2.5-pro
{ "model": "grok" }     // -> grok-4-0709
```

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
        "GOOGLE_API_KEY": "your_key_here",
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
npm run format         # Format code with Prettier
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
│   │   └── openai-compatible.js # Base for OpenAI-compatible APIs
│   ├── tools/                # MCP tool implementations
│   │   ├── index.js          # Tool registry
│   │   ├── chat.js           # Chat tool
│   │   └── consensus.js      # Consensus tool
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