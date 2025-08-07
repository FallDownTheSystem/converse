# AI Provider Configuration Guide

This guide documents all supported AI providers in the Converse MCP Server and their configuration options.

## Supported Providers

### OpenAI
- **API Key Format**: `sk-proj-...` (starts with `sk-`)
- **Get Key**: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Environment Variable**: `OPENAI_API_KEY`
- **Supported Models**:
  - `o3`, `o3-mini`, `o3-pro` - Advanced reasoning models
  - `o4-mini` - Latest fast reasoning model
  - `gpt-4.1` - Large context (1M tokens)
  - `gpt-4o`, `gpt-4o-mini` - Multimodal models

### Google (Gemini)
- **API Key Format**: `AIzaSy...` (varies)
- **Get Key**: [makersuite.google.com/app/apikey](https://makersuite.google.com/app/apikey)
- **Environment Variable**: `GOOGLE_API_KEY`
- **Supported Models**:
  - `gemini-2.5-pro` - Deep reasoning with thinking mode
  - `gemini-2.5-flash` - Ultra-fast model
  - `gemini-2.0-flash`, `gemini-2.0-flash-lite` - Latest generation

### X.AI (Grok)
- **API Key Format**: `xai-...` (starts with `xai-`)
- **Get Key**: [console.x.ai](https://console.x.ai/)
- **Environment Variable**: `XAI_API_KEY`
- **Supported Models**:
  - `grok-4-0709` - Latest with image support and web search
  - `grok-3`, `grok-3-fast` - Previous generation

### Anthropic (Claude)
- **API Key Format**: `sk-ant-...` (starts with `sk-ant-`)
- **Get Key**: [console.anthropic.com](https://console.anthropic.com/)
- **Environment Variable**: `ANTHROPIC_API_KEY`
- **Supported Models**:
  - `claude-opus-4-1-20250805` - Highest intelligence with extended thinking (32K output)
  - `claude-sonnet-4-20250514` - Balanced performance with extended thinking (64K output)
  - `claude-3-7-sonnet-20250219` - Enhanced 3.x generation with thinking (64K output)
  - `claude-3-5-sonnet-20241022` - Fast and intelligent model (8K output)
  - `claude-3-5-haiku-20241022` - Fastest Claude model (8K output)
  - `claude-3-opus-20240229`, `claude-3-sonnet-20240229`, `claude-3-haiku-20240307` - Previous generation

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
- **Full Support**: OpenAI, Google, X.AI (Grok-4), Anthropic (Claude-3.5-Sonnet, Claude-3-Opus)
- **Via OpenRouter**: Depends on the underlying model
- **No Support**: DeepSeek, Mistral (except Large), Claude-3.5-Haiku

### Web Search
- **Native Support**: OpenAI, Google, X.AI (Grok-4)
- **No Support**: Anthropic, Mistral, DeepSeek, OpenRouter

### Thinking/Reasoning Modes
- **OpenAI**: O3 series models support `reasoning_effort` parameter
- **Google**: Gemini Pro/Flash support thinking mode with configurable budget
- **Anthropic**: Claude 4 and 3.7 models support extended thinking with `reasoning_effort`
- **Others**: Standard inference only

## Model Selection in Tools

When using the chat or consensus tools, specify models using their identifiers:

### Model Routing Logic

1. **Simple Names**: Models without "/" are routed by keyword matching:
   - Contains "gpt", "o1", "o3", "o4" → OpenAI
   - Contains "claude", "opus", "sonnet", "haiku" → Anthropic
   - Contains "gemini", "flash", "pro" → Google
   - Contains "grok" → X.AI
   - Contains "mistral", "magistral" → Mistral
   - Contains "deepseek", "reasoner", "r1" → DeepSeek
   - Contains "qwen", "kimi", "k2" → OpenRouter

2. **Slash Format**: Models with "/" check native providers first:
   - If exact model exists in a native provider → Routes to that provider
   - If not found in any native provider → Routes to OpenRouter
   - This allows using models like "anthropic/claude-3.5-sonnet" via OpenRouter

3. **OpenRouter Auto**: Special aliases route to OpenRouter's auto-selection:
   - "openrouter/auto", "openrouter auto", "auto router", "auto-router"

```javascript
// Chat tool examples
{
  "model": "gpt-4o",              // OpenAI (keyword match)
  "model": "claude-opus-4",       // Anthropic (keyword match, auto-resolves)
  "model": "sonnet",              // Anthropic (keyword match)
  "model": "gemini-2.5-pro",      // Google (keyword match)
  "model": "grok-4-0709",         // X.AI (keyword match)
  "model": "mistral-large",       // Mistral (keyword match)
  "model": "deepseek-chat",       // DeepSeek (keyword match)
  "model": "anthropic/claude-3.5-sonnet",  // OpenRouter (slash format, not in Anthropic)
  "model": "qwen/qwen3-coder",            // OpenRouter (static model)
  "model": "openrouter/auto"              // OpenRouter auto-selection
}

// Consensus tool with multiple providers
{
  "models": [
    {"model": "o3"},
    {"model": "claude-3-5-sonnet"},
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
- Some providers support aliases (e.g., "claude" → "claude-3-5-sonnet")
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