# Converse MCP Server

[![npm version](https://img.shields.io/npm/v/converse-mcp-server.svg)](https://www.npmjs.com/package/converse-mcp-server)

A simplified, functional Node.js implementation of an MCP (Model Context Protocol) server with chat and consensus tools. Built with modern Node.js practices and official SDKs for seamless AI provider integration.

## 🚀 Quick Start

### Option 1: Direct from NPM (Recommended)

```bash
# Using npx (recommended)
npx converse-mcp-server

# Using pnpm dlx (alternative)
pnpm dlx converse-mcp-server

# Using yarn dlx (alternative)  
yarn dlx converse-mcp-server
```

### Option 2: Clone and Install

```bash
# Clone the repository
git clone https://github.com/FallDownTheSystem/converse.git
cd converse

# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your API keys

# Start the server
npm start
```

## 📋 Requirements

- **Node.js**: >= 20.0.0 (LTS recommended)
- **Package Manager**: npm, pnpm, or yarn
- **API Keys**: At least one provider API key (OpenAI, Google, X.AI, Anthropic, Mistral, DeepSeek, or OpenRouter)

## 🔑 Configuration

### 1. Environment Variables

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

# Optional: Provider-specific settings
XAI_BASE_URL=https://api.x.ai/v1
OPENROUTER_REFERER=https://github.com/FallDownTheSystem/converse
```

### 2. Get API Keys

| Provider | Where to Get | Example Format |
|----------|-------------|----------------|
| **OpenAI** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | `sk-proj-...` |
| **Google** | [makersuite.google.com/app/apikey](https://makersuite.google.com/app/apikey) | `AIzaSy...` |
| **X.AI** | [console.x.ai](https://console.x.ai/) | `xai-...` |
| **Anthropic** | [console.anthropic.com](https://console.anthropic.com/) | `sk-ant-...` |
| **Mistral** | [console.mistral.ai](https://console.mistral.ai/) | 32+ chars |
| **DeepSeek** | [platform.deepseek.com](https://platform.deepseek.com/) | 32+ chars |
| **OpenRouter** | [openrouter.ai/keys](https://openrouter.ai/keys) | `sk-or-...` |

### 3. Installing in Claude Code or Claude Desktop

There are several ways to add the Converse MCP Server to Claude:

#### Option A: Using NPX (Recommended)

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
        "OPENROUTER_API_KEY": "your_key_here",
        "OPENROUTER_REFERER": "https://github.com/YourUsername/YourApp",
        "MAX_MCP_OUTPUT_TOKENS": "200000"
      }
    }
  }
}
```

#### Option B: Using NPX with stdio transport

```json
{
  "mcpServers": {
    "converse": {
      "command": "npx",
      "args": ["converse-mcp-server", "--transport", "stdio"],
      "env": {
        "OPENAI_API_KEY": "your_key_here",
        "GOOGLE_API_KEY": "your_key_here",
        "XAI_API_KEY": "your_key_here",
        "ANTHROPIC_API_KEY": "your_key_here",
        "MISTRAL_API_KEY": "your_key_here",
        "DEEPSEEK_API_KEY": "your_key_here",
        "OPENROUTER_API_KEY": "your_key_here",
        "OPENROUTER_REFERER": "https://github.com/YourUsername/YourApp",
        "MAX_MCP_OUTPUT_TOKENS": "200000"
      }
    }
  }
}
```

#### Option C: Direct Node.js execution

```json
{
  "mcpServers": {
    "converse": {
      "command": "node",
      "args": [
        "C:\\Users\\YourUsername\\Documents\\Projects\\converse\\src\\index.js",
        "--transport",
        "stdio"
      ],
      "env": {
        "OPENAI_API_KEY": "your_key_here",
        "GOOGLE_API_KEY": "your_key_here",
        "XAI_API_KEY": "your_key_here",
        "ANTHROPIC_API_KEY": "your_key_here",
        "MISTRAL_API_KEY": "your_key_here",
        "DEEPSEEK_API_KEY": "your_key_here",
        "OPENROUTER_API_KEY": "your_key_here",
        "OPENROUTER_REFERER": "https://github.com/YourUsername/YourApp",
        "MAX_MCP_OUTPUT_TOKENS": "200000"
      }
    }
  }
}
```

#### Option D: Using environment variable for transport

```json
{
  "mcpServers": {
    "converse": {
      "command": "npx",
      "args": ["converse-mcp-server"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "OPENAI_API_KEY": "your_key_here",
        "GOOGLE_API_KEY": "your_key_here",
        "XAI_API_KEY": "your_key_here",
        "MAX_MCP_OUTPUT_TOKENS": "200000"
      }
    }
  }
}
```

#### Option E: Local HTTP Development (Advanced)

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

#### Installation Steps

1. **For Claude Code**: 
   - Open the command palette (Ctrl/Cmd + Shift + P)
   - Run "Claude Code: Edit MCP Settings"
   - Add one of the configurations above

2. **For Claude Desktop**:
   - Navigate to Settings → Developer → MCP Servers
   - Click "Add Server" and paste one of the configurations above

3. **Manual Configuration**:
   - The configuration file is typically located at:
     - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
     - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
     - Linux: `~/.config/Claude/claude_desktop_config.json`

**Windows Troubleshooting**: If `npx converse-mcp-server` doesn't work on Windows, try using:
```json
{
  "command": "cmd",
  "args": ["/c", "npx", "converse-mcp-server"]
}
```

For more detailed instructions, see the [official MCP configuration guide](https://docs.anthropic.com/en/docs/claude-code/mcp#configure-mcp-servers).

## 🛠️ Available Tools

### 1. Chat Tool

General conversational AI with context and continuation support.

```javascript
// Example usage
{
  "prompt": "How should I structure the authentication module for this Express.js API?",
  "model": "gemini-2.5-flash",
  "files": ["/path/to/src/auth.js", "/path/to/config.json"],
  "images": ["/path/to/architecture.png"],
  "temperature": 0.5,
  "reasoning_effort": "medium",
  "use_websearch": false
}
```

### 2. Consensus Tool

Multi-provider parallel execution with cross-model feedback.

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

## 📚 Help & Documentation

The Converse MCP Server provides built-in help through:

### Help Prompt
Access comprehensive documentation directly in Claude:
- `/converse:help` - Full documentation
- `/converse:help tools` - Tool-specific help
- `/converse:help models` - Model information
- `/converse:help parameters` - Configuration details
- `/converse:help examples` - Usage examples

### Help Resource
Programmatic access to documentation:
- Resource URI: `converse://help`
- Includes all documentation plus current server version

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

## 🚀 Development

### Install from Source

```bash
# Clone and setup
git clone https://github.com/FallDownTheSystem/converse.git
cd converse
npm install

# Development with hot reload
npm run dev

# Run tests
npm test

# Run with specific log level
LOG_LEVEL=debug npm run dev
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
npm run test:mcp-client # MCP client tests (HTTP-based client-server testing)
npm run test:real-api  # Real API tests (requires keys)
npm run test:providers # Provider tests
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

### 💡 Development Notes

**Port Management**: The server runs on port 3157 by default for HTTP transport. If you encounter "EADDRINUSE" errors:

1. **Automatic cleanup**: `npm start` and `npm run dev` will automatically attempt to kill existing processes on port 3157
2. **Manual cleanup**: Run `npm run kill-server` to manually free up port 3157  
3. **Clean start**: Use `:clean` variants (`npm run start:clean`, `npm run dev:clean`) to skip auto-cleanup
4. **Persistent issues**: If port conflicts persist, manually kill Node.js processes or restart your terminal

**Troubleshooting EADDRINUSE errors**:
```bash
# Try manual cleanup first
npm run kill-server

# Or use a different port
PORT=3001 npm start

# Or use stdio transport instead
npm start -- --transport=stdio
```

**Transport Modes**: 
- **Stdio Transport** (default): Traditional stdio communication (launched automatically by Claude)
- **HTTP Transport**: Use `--transport=http` or set `MCP_TRANSPORT=http` for `http://localhost:3157/mcp` - Better for development and debugging
  - **Note**: When using HTTP transport, the server must be started manually (e.g., `npm start` or `npm run dev`) as it runs as a standalone process, unlike stdio which is launched as a subprocess by Claude

### Testing with Real APIs

```bash
# Set up your API keys in .env first
OPENAI_API_KEY=sk-proj-...
GOOGLE_API_KEY=AIzaSy...
XAI_API_KEY=xai-...

# Run real API tests
npm run test:real-api

# Run comprehensive integration tests
node tests/integration/final-integration-test.js

# Validate server functionality
npm run validate
```

### ✅ Validation Steps

After installation, verify everything is working:

```bash
# 1. Quick server test (should show startup message)
npm start

# 2. Run basic functionality tests
npm test

# 3. Test real API connectivity (requires API keys)
npm run test:real-api

# 4. Comprehensive validation
node tests/integration/final-integration-test.js
```

**Expected Results:**
- Server starts without errors on port 3157
- All unit tests pass
- Real API tests connect successfully (if keys configured)
- Some real API integration tests may occasionally timeout

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

## 📁 Project Structure

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

## 🔧 Configuration Options

### Environment Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `PORT` | Server port | `3157` | `3157` |
| `LOG_LEVEL` | Logging level | `info` | `debug`, `info`, `error` |
| `MAX_MCP_OUTPUT_TOKENS` | Token response limit | `25000` | `200000` |
| `XAI_BASE_URL` | XAI API endpoint | `https://api.x.ai/v1` | Custom endpoint |

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

## 🐛 Troubleshooting

### Common Issues

**Server won't start:**
```bash
# Check Node.js version
node --version  # Should be >= 20.0.0

# Check for port conflicts
PORT=3001 npm start
```

**API key errors:**
```bash
# Verify your .env file format
cat .env

# Test API keys
npm run test:real-api
```

**Module import errors:**
```bash
# Clear cache and reinstall
npm run clean
```

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev

# Start with debugger
npm run debug

# Trace all operations
LOG_LEVEL=trace npm run dev
```

## 📚 Documentation

- **API Reference**: [docs/API.md](docs/API.md)
- **Architecture Guide**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Integration Examples**: [docs/EXAMPLES.md](docs/EXAMPLES.md)

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

This MCP Server was inspired by and builds upon the excellent work from [BeehiveInnovations/zen-mcp-server](https://github.com/BeehiveInnovations/zen-mcp-server). We're grateful for their pioneering implementation and innovative approach to MCP server development.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔗 Links

- **GitHub**: https://github.com/FallDownTheSystem/converse
- **Issues**: https://github.com/FallDownTheSystem/converse/issues
- **NPM Package**: https://www.npmjs.com/package/converse-mcp-server

---

**Built with ❤️ using Node.js and modern AI APIs**